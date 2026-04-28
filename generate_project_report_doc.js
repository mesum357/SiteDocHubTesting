import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import fs from "fs";

const BRAND_DARK = "0F1F4A";
const BRAND_BLUE = "2563EB";
const BRAND_LIGHT = "EFF6FF";
const TEXT_MUTED = "4B5563";
const BORDER = "D1D5DB";

const report = `# Technical Report: Insta360 X2 Camera Integration
## SiteDocHub / SiteView-Pro Web Application

**Prepared for:** Client
**Date:** April 28, 2026
**Document Type:** Issue Analysis, Architecture Review & Strategic Recommendations

---

## Executive Summary

This report provides a comprehensive analysis of the Insta360 X2 camera integration within the SiteDocHub / SiteView-Pro web application. It examines the gap between the client's stated requirements, the current implementation approach, the fundamental platform constraints that prevent those requirements from being fully met in a pure web deployment, and the recommended path forward.

**Bottom line:** The client's requirement — that the app communicates with the Insta360 X2 camera over local Wi-Fi via the Insta360 Open SDK, with no internet required — is architecturally sound for a **native mobile app** but cannot be reliably delivered as a **hosted HTTPS web application** (e.g., deployed on Render). This is not a bug that can be patched in React. It is a structural constraint of how browsers enforce security policies. The permanent solution is a **Capacitor-based native app shell** wrapping the existing React codebase.

---

## 1. Client Requirements (Verbatim Summary)

The client's requirements for the Insta360 X2 integration are:

| # | Requirement |
|---|-------------|
| 4.1 | Camera broadcasts its own Wi-Fi hotspot; phone connects to it via device Settings |
| 4.2 | App uses the Insta360 Open SDK (CameraSDK-Web) for JS/web camera control |
| 4.3 | UX: Pin selected → camera button → connection check → shutter trigger → photo pulled as blob → auto-assigned to pin (turns green) → stored in IndexedDB → queued for Supabase upload |
| 4.4 | Fallback: if camera not connected or SDK fails, fall back to manual file picker |

The client explicitly states: **"No internet required — this is purely local device-to-device over the camera's hotspot."**

---

## 2. What the Insta360 X2 Actually Exposes to Developers

### 2.1 OSC (Open Spherical Camera) Protocol

The Insta360 X2 (and similar models: ONE X, ONE R, ONE RS, X3, X4) expose an HTTP-based control API called OSC, rooted at a fixed LAN IP address when the camera's hotspot is active:

- **Primary IP:** \`http://192.168.42.1\` (documented for ONE X, ONE X2, ONE R, ONE RS, X3, X4, X5)
- **Alternate IP:** \`http://192.168.43.1\` (seen on some firmware variants)

Key OSC endpoints used in the current implementation:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| \`GET\` | \`/osc/info\` | Discover camera and confirm reachability |
| \`POST\` | \`/osc/state\` | Get battery level, storage card state |
| \`POST\` | \`/osc/commands/execute\` | Execute commands, e.g., \`camera.takePicture\` |
| \`POST\` | \`/osc/commands/status\` | Poll status of long-running capture |

Required headers for all requests: \`Content-Type: application/json; charset=utf-8\`, \`Accept: application/json\`, \`X-XSRF-Protected: 1\`.

**Important OSC constraint:** Never send a new \`/osc/commands/execute\` request before receiving the response to the previous one. The camera serialises OSC commands.

### 2.2 The "CameraSDK-Web" (\`window.Insta360CameraSDK\`)

The Insta360 Web SDK (\`CameraSDK-Web\`, referenced in the client's requirements) is **not a standard npm package** that runs freely in any browser tab. It is distributed by Insta360 to SDK applicants and injects a global \`window.Insta360CameraSDK\` object. However:

- It is **not publicly available** without a formal SDK application to Insta360.
- It is intended primarily for **WeChat Mini Programs** and **desktop browser contexts** served via specific environments where the SDK can communicate with the camera over USB or locally scoped Wi-Fi.
- In the context of a **hosted web app** (Render, Vercel, etc.), \`window.Insta360CameraSDK\` is never injected — there is no SDK present at all. The global simply does not exist.

**Conclusion on the Web SDK:** For the mobile field-use case (phone → camera hotspot), the SDK path is effectively unavailable in a standard browser context. The reliable path is **direct OSC calls** — which the current codebase already implements.

---

## 3. Root Cause Analysis of the Integration Issues

### Issue 1: HTTPS Hosted App Cannot Reach the Camera (Critical, Structural)

**Symptom:** App deployed on Render (HTTPS) shows camera as perpetually Disconnected, even when the phone is joined to the camera's Wi-Fi.

**Root cause — Two separate blocking mechanisms:**

**Layer 1 — Network Topology Mismatch:**
When the app is served from \`https://siteview-pro.onrender.com\`, any request to \`/api/camera/osc/info\` goes from the browser → to Render's cloud server → not to the camera. Render's cloud servers are not on the camera's \`192.168.42.x\` LAN. There is no path from a cloud server to a private Wi-Fi hotspot.

**Layer 2 — Browser Mixed Content Policy:**
Even if the app tried to call the camera directly from the browser (\`http://192.168.42.1\`), the browser blocks this. Loading an HTTP resource from an HTTPS page is classified as **mixed active content** and is silently or hard-blocked by all major browsers (Chrome, Safari, Firefox). There is no opt-in flag available to web pages to override this.

These are **not bugs** in the application code. They are enforced by browser security specifications and cloud network architecture. No React code change or Vite configuration can overcome them in a standard browser.

### Issue 2: SDK Logic Bug — OSC Fallback Blocked (Fixed in Current Branch)

**Symptom:** Even in environments where the camera is reachable via the Vite proxy, the UI shows Disconnected and the capture button silently fails.

**Root cause:** The original logic in \`src/lib/insta360Client.ts\` checked for \`window.Insta360CameraSDK\`. If the object existed (injected by some test harness or partial SDK load) but \`isConnected\` was undefined or returned \`false\`, the code returned early — treating the camera as offline — without falling through to the OSC path.

**Fix applied:** The SDK is now used for status and capture **only** when \`isConnected\` is a defined function **and** returns \`true\`. In all other cases, the code falls directly through to OSC (\`getInsta360Status()\` / \`capturePhotoFromInsta360()\`). This is the correct priority order for field use.

**Status:** Fixed in the current branch. Covered by unit tests in \`src/lib/insta360Client.test.ts\`.

### Issue 3: Wrong OSC Proxy Target / Preview Server Missing Proxy (Operational)

**Symptom A:** Development server (\`npm run dev\`) works, but camera is never found (\`/osc/info\` times out).

**Cause:** The \`INSTA360_OSC_PROXY_TARGET\` environment variable is not set (or set to the wrong IP). Some cameras respond on \`192.168.43.1\` rather than the default \`192.168.42.1\`.

**Mitigation:** From the PC joined to the camera hotspot:
\`\`\`bash
curl http://192.168.42.1/osc/info   # try primary
curl http://192.168.43.1/osc/info   # try alternate
\`\`\`
Whichever responds: set \`INSTA360_OSC_PROXY_TARGET=http://192.168.42.1\` (or \`.43.1\`) in \`.env\` and restart Vite.

**Symptom B:** \`npm run dev\` works but \`npm run preview\` does not.

**Cause:** Older Vite configurations only set \`server.proxy\`, not \`preview.proxy\`. The current \`vite.config.ts\` mirrors both — verify this is present in the deployed branch.

### Issue 4: Camera Mode / Activation Errors During Capture (Operational)

**Symptom:** \`camera.takePicture\` returns error state \`"disabledCommand"\` or \`"unactivated"\`.

**Cause — \`disabledCommand\`:** Camera is in video mode or standby mode when the shutter is triggered. OSC \`setOptions\` must be called first to switch to photo mode.

**Cause — \`unactivated\`:** Camera has not been activated via the official Insta360 mobile app. This is a one-time setup step the end user must complete before the camera can accept third-party OSC commands.

**Required capture sequence:**
1. \`POST /osc/commands/execute\` → \`camera.setOptions\` (ensure photo mode active)
2. \`POST /osc/commands/execute\` → \`camera.takePicture\`
3. Poll \`POST /osc/commands/status\` at ~1 Hz until \`"state": "done"\`
4. \`GET\` the file URL from \`results._fileGroup[0]\` as a blob

### Issue 5: SSID Not Visible in the Web App (Platform Constraint)

**Symptom:** Client expects the sidebar to display the camera hotspot name (e.g., \`INSTA360_XXXXXX\`).

**Cause:** Web browsers intentionally do not expose the current Wi-Fi SSID to arbitrary pages. This is a deliberate privacy protection — no JavaScript API exists to read the SSID of the connected network in a standard browser context.

**What the app can show instead:** "Insta360 connected (camera network)" — derived from a successful OSC \`/osc/info\` response — along with camera model, battery level, and storage state from \`/osc/state\`.

**To show actual SSID:** Requires a native app with platform network permissions (iOS: \`NEHotspotHelper\` entitlement, restricted; Android: \`ACCESS_WIFI_STATE\` permission).

### Issue 6: In-Camera Stitching Requirement (Compatibility Note)

Per Insta360's official integration documentation: **in-camera stitching must be explicitly enabled** when using OSC to capture photos with the X2. The stitching time via OSC is longer than via the native SDK. The OSC protocol does not support video in-camera stitching or real-time preview streams. For the client's use case (capturing and uploading stitched JPEGs to pins), OSC photo capture with in-camera stitching is the correct and supported approach.

---

## 4. Current Working Workflow (Vite Dev / Preview)

The integration works correctly today under the following setup — this is the only fully validated path for live OSC capture:

\`\`\`
Step 1: PC joins Insta360 X2 hotspot (e.g., INSTA360_XXXXXX)
Step 2: npm run dev -- --host 0.0.0.0 --port 8080
         (or npm run preview with preview.proxy set in vite.config.ts)
Step 3: Phone joins same Insta360 hotspot
Step 4: Phone browser navigates to http://<PC-LAN-IP>:8080/site
Step 5: Pin selected → Connected → Capture with Insta360 → image uploaded to pin
\`\`\`

**Why this works:**
The browser makes an HTTP request to the Vite dev server (which is on the same LAN). Vite proxies \`/api/camera/*\` server-side to \`http://192.168.42.1\`. The camera responds. The browser never makes a direct request to the camera IP — the proxy handles it. No mixed content violation occurs.

**This is not a viable production field workflow** because it requires a developer laptop running Vite to be present at every job site.

---

## 5. Gap Between Client Requirements and Current Capability

| Client Requirement | Current Status |
|-------------------|---------------|
| No internet required — local device-to-device | **Partially met** — only works in Vite dev/preview over LAN |
| Phone connects to camera hotspot → app detects connection | **Works in LAN dev mode only** |
| App uses Insta360 Open SDK (CameraSDK-Web) | **SDK unavailable in standard browser** — OSC used instead; functionally equivalent for capture |
| Trigger shutter → pull photo blob → assign to pin → IndexedDB → Supabase queue | **Implemented and functional** in LAN dev mode |
| Works from production hosted URL (Render) | **Not possible** with current architecture — structural HTTPS + network constraint |
| Show Wi-Fi name (INSTA360_XXXXXX) in sidebar | **Not possible** in any browser — requires native app |
| Fallback to file picker if camera unavailable | **Implemented and functional** |

---

## 6. Strategic Recommendations: Best Approach for Reliable Production Use

### Recommendation: Capacitor Native App Shell (Strongly Recommended)

The optimal solution — both technically and economically — is to wrap the existing React/Vite codebase in **Capacitor** (by Ionic), producing native Android and iOS apps distributed via the App Store and Google Play. This approach:

- **Reuses 100% of the existing React codebase** — no rewrite required
- **Resolves the mixed content problem** — Capacitor's WebView can be configured with \`allowMixedContent: true\` and \`cleartext: true\`, allowing HTTP requests to \`http://192.168.42.1\` from within the native app container
- **Resolves the network topology problem** — the app runs entirely on the device; there is no cloud server in the request path for local camera operations
- **Enables SSID visibility** — native network permission APIs become available via Capacitor plugins
- **Enables App Store distribution** — field workers install the app normally; no developer tooling required on site

#### Implementation Overview

**Step 1 — Add Capacitor to the Vite React project:**
\`\`\`bash
npm install @capacitor/core @capacitor/cli
npx cap init "SiteDocHub" "com.sitedochub.app" --web-dir dist
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
\`\`\`

**Step 2 — Configure \`capacitor.config.ts\` to allow camera LAN HTTP traffic:**
\`\`\`typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sitedochub.app',
  appName: 'SiteDocHub',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
};
export default config;
\`\`\`

**Step 3 — Update OSC client for native environment:**
In \`src/lib/insta360Client.ts\`, the direct OSC base URLs (\`http://192.168.42.1\`, \`http://192.168.43.1\`) are already implemented for HTTP origins. In the native Capacitor app, these will work without a Vite proxy because the WebView is not subject to the same-origin restrictions of a hosted browser page.

**Step 4 — Build and deploy:**
\`\`\`bash
npm run build
npx cap sync
# Open in Android Studio / Xcode → build → deploy to device or store
\`\`\`

### Alternative Approaches (Secondary Options)

#### Option B: LAN Tunnel (ngrok / Cloudflare Tunnel) — Short-Term Only

A developer runs a tunnel from their PC (on the camera LAN) to a public HTTPS URL. The phone opens the tunnel URL; \`/api/camera\` is proxied through the tunnel to the camera.

- **Pro:** No app store deployment; uses existing web app
- **Con:** Requires a laptop running at every job site. Not viable for unmanned field use. Tunnel latency may cause timeout issues. Not a production solution.

#### Option C: Standalone Local HTTP Server on Device

Deploy a small Node.js or Python HTTP server as an Android/iOS app (via tools like Termux, or packaged as a companion app). The web app calls the local server, which proxies to the camera.

- **Pro:** Avoids full native rewrite
- **Con:** Complex setup for end users; requires sideloading or separate app; maintenance overhead. Capacitor is strictly better.

#### Option D: "Upload Only" on Web, Native for Capture

Keep the hosted web app for all non-capture workflows (job management, floor plans, pin viewing). Direct field workers to use the Insta360 mobile app to capture, export, and manually upload to the web app.

- **Pro:** Zero engineering effort
- **Con:** Breaks the HoloBuilder/JobWalk parity workflow the client specifically requires. Not a real solution — documents a limitation.

---

## 7. Decision Summary

| Decision | Recommended Choice | Rationale |
|---------|-------------------|-----------|
| Architecture for camera integration | Capacitor native app | Only reliable solution for production field use |
| OSC vs. Web SDK | OSC (already implemented) | Web SDK unavailable in standard browser; OSC covers all required capture features |
| SSID display | Show connection status via OSC success, not literal SSID | Browser privacy restriction; SSID available later via Capacitor network plugin |
| Fallback | File picker (already implemented) | Correct and sufficient |
| Hosted web app | Retain for non-capture workflows | Still valuable for job management, floor plans, review |

---

## 8. Testing Checklist (Current Implementation)

| Test | Command | Notes |
|------|---------|-------|
| Unit — SDK false → OSC fallback | \`npx vitest run src/lib/insta360Client.test.ts\` | Must pass before any merge |
| E2E — mocked OSC | \`npx playwright test tests/insta360-mocked.spec.ts\` | Requires \`E2E_EMAIL\` / \`E2E_PASSWORD\` |
| E2E — connection flow | \`npx playwright test tests/insta360-connection.spec.ts\` | — |
| Manual — full field capture | See \`TEST_SCRIPT.md\` §8 | Requires X2 camera and LAN dev setup |

---

## 9. Conclusion

The Insta360 X2 integration is architecturally correct in its use of the OSC protocol. The core capture logic — trigger, poll, download, assign to pin, upload to Supabase — is implemented and works in the validated LAN development environment.

The production gap is not a code defect. It is a consequence of deploying a feature that requires private LAN access to a cloud-hosted HTTPS application — two things that are fundamentally incompatible in a standard browser security model.

The path to a reliable, production-ready, field-deployable capture workflow is the **Capacitor native app**. It reuses the existing React codebase in full, requires minimal additional engineering, and resolves every identified constraint: mixed content, LAN access, SSID visibility, and distribution to field workers. This is the recommended next engineering investment.

---

*End of Report*
*Document covers: OSC architecture, identified issues (Issues 1–6), current working workflow, client requirements gap analysis, Capacitor native app recommendation.*
`;

function isBlank(line) {
  return line.trim().length === 0;
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 140 },
    children: [new TextRun({ text, size: 22, font: "Calibri", ...opts })],
  });
}

function sectionRule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND_BLUE, space: 1 } },
    spacing: { before: 0, after: 180 },
  });
}

function parseInlineBold(text) {
  const chunks = text.split("**");
  return chunks.map((chunk, idx) =>
    new TextRun({
      text: chunk,
      bold: idx % 2 === 1,
      size: 22,
      font: "Calibri",
      color: "111827",
    })
  );
}

function tableFromMarkdown(lines) {
  const rows = lines.map((line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim())
  );
  const cleaned = rows.filter((r, idx) => idx !== 1);
  const colCount = cleaned[0]?.length ?? 0;
  const colWidth = Math.floor(9000 / Math.max(colCount, 1));

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: cleaned.map((cells, rowIndex) => {
      const isHeader = rowIndex === 0;
      return new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              width: { size: colWidth, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
                left: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
                right: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
              },
              shading: isHeader ? { fill: BRAND_DARK, color: "auto" } : rowIndex % 2 === 0 ? { fill: BRAND_LIGHT, color: "auto" } : undefined,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell.replace(/`/g, ""),
                      bold: isHeader,
                      color: isHeader ? "FFFFFF" : "111827",
                      size: 20,
                      font: "Calibri",
                    }),
                  ],
                }),
              ],
            })
        ),
      });
    }),
  });
}

function buildContentFromMarkdown(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    if (line.trim() === "---") {
      out.push(sectionRule());
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 220, after: 100 },
          children: [new TextRun({ text: line.slice(4), color: BRAND_BLUE, bold: true, size: 24, font: "Calibri" })],
        })
      );
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 120 },
          children: [new TextRun({ text: line.slice(3), color: BRAND_DARK, bold: true, size: 30, font: "Calibri" })],
        })
      );
      i += 1;
      continue;
    }

    if (line.startsWith("# ")) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 140 },
          children: [new TextRun({ text: line.slice(2), color: BRAND_DARK, bold: true, size: 40, font: "Calibri" })],
        })
      );
      i += 1;
      continue;
    }

    if (line.startsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      out.push(tableFromMarkdown(tableLines));
      out.push(new Paragraph({ spacing: { before: 0, after: 160 } }));
      continue;
    }

    if (line.startsWith("- ")) {
      out.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 40, after: 60 },
          children: parseInlineBold(line.slice(2).replace(/`/g, "")),
        })
      );
      i += 1;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      out.push(
        new Paragraph({
          numbering: { reference: "decimal-numbering", level: 0 },
          spacing: { before: 40, after: 60 },
          children: [new TextRun({ text: line.replace(/^\d+\.\s/, "").replace(/`/g, ""), size: 22, font: "Calibri" })],
        })
      );
      i += 1;
      continue;
    }

    out.push(
      new Paragraph({
        spacing: { before: 80, after: 140 },
        children: parseInlineBold(line.replace(/`/g, "")),
      })
    );
    i += 1;
  }

  return out;
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "decimal-numbering",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { before: 0, after: 120 },
              children: [new TextRun({ text: "SiteDocHub / SiteView-Pro • Technical Report", size: 18, color: TEXT_MUTED, font: "Calibri" })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Confidential • April 2026", size: 18, color: TEXT_MUTED, font: "Calibri" })],
            }),
          ],
        }),
      },
      properties: {
        page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 140 },
          children: [new TextRun({ text: "PROJECT REPORT", size: 28, bold: true, color: BRAND_BLUE, font: "Calibri" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 240 },
          children: [new TextRun({ text: "Insta360 X2 Integration Assessment", size: 44, bold: true, color: BRAND_DARK, font: "Calibri" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 240 },
          children: [new TextRun({ text: "SiteDocHub / SiteView-Pro", size: 26, color: BRAND_BLUE, font: "Calibri" })],
        }),
        new Table({
          width: { size: 8600, type: WidthType.DXA },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2800, type: WidthType.DXA },
                  shading: { fill: BRAND_DARK, color: "auto" },
                  children: [p("Prepared For", { bold: true, color: "FFFFFF", size: 20 })],
                }),
                new TableCell({
                  width: { size: 5800, type: WidthType.DXA },
                  children: [p("Client", { size: 20 })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2800, type: WidthType.DXA },
                  shading: { fill: BRAND_DARK, color: "auto" },
                  children: [p("Date", { bold: true, color: "FFFFFF", size: 20 })],
                }),
                new TableCell({
                  width: { size: 5800, type: WidthType.DXA },
                  children: [p("April 28, 2026", { size: 20 })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2800, type: WidthType.DXA },
                  shading: { fill: BRAND_DARK, color: "auto" },
                  children: [p("Type", { bold: true, color: "FFFFFF", size: 20 })],
                }),
                new TableCell({
                  width: { size: 5800, type: WidthType.DXA },
                  children: [p("Issue Analysis, Architecture Review & Strategic Recommendations", { size: 20 })],
                }),
              ],
            }),
          ],
        }),
        new Paragraph({ pageBreakBefore: true }),
        ...buildContentFromMarkdown(report),
      ],
    },
  ],
});

const outFile = "insta360_project_report_professional.docx";
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outFile, buffer);
console.log(`Done. Generated ${outFile}`);

