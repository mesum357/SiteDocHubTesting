import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, LevelFormat,
  TabStopType, TabStopPosition
} from 'docx';
import fs from 'fs';

// ── Colour palette ──────────────────────────────────────────────────
const BRAND_DARK = "1A2B4A";
const BRAND_MID = "2563EB";
const ACCENT_RED = "DC2626";
const ACCENT_GREEN = "16A34A";
const ACCENT_AMBER = "D97706";
const TBL_HEADER = "1A2B4A";
const TBL_ALT = "EFF6FF";
const TBL_WARN = "FEF3C7";

// ── Borders ─────────────────────────────────────────────────────────
const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
void allBorders;

function rule(color = BRAND_DARK) {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } },
    spacing: { before: 0, after: 160 }
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 160 },
    children: [new TextRun({ text, font: "Arial", size: 22, ...opts })]
  });
}

function labelValue(label, value, labelColor = BRAND_DARK) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text: label + ": ", font: "Arial", size: 22, bold: true, color: labelColor }),
      new TextRun({ text: value, font: "Arial", size: 22 })
    ]
  });
}
void labelValue;

function bullet(text, indent = 0, color) {
  return new Paragraph({
    numbering: { reference: "bullets", level: indent },
    spacing: { before: 40, after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 22, color })]
  });
}

function numbered(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { before: 40, after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 22 })]
  });
}

function sectionHead(text, color = BRAND_DARK) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color })]
  });
}
void sectionHead;

function subHead(text, color = BRAND_MID) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color })]
  });
}

function callout(paragraphs, bgColor = "EFF6FF", borderColor = BRAND_MID) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: borderColor };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: { top: b, bottom: b, left: b, right: b },
        shading: { fill: bgColor, type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 180, right: 180 },
        children: paragraphs
      })]
    })]
  });
}

function tRow(col1, col2, isHeader = false, bgFill = "FFFFFF") {
  const bg = isHeader ? TBL_HEADER : bgFill;
  const textColor = isHeader ? "FFFFFF" : "000000";
  const b = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: b, bottom: b, left: b, right: b };

  function cell(text, w) {
    return new TableCell({
      borders,
      width: { size: w, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        children: [new TextRun({ text, font: "Arial", size: 20, bold: isHeader, color: textColor })]
      })]
    });
  }
  return new TableRow({ children: [cell(col1, 3120), cell(col2, 6240)] });
}

function tRow3(c1, c2, c3, isHeader = false, bgFill = "FFFFFF") {
  const bg = isHeader ? TBL_HEADER : bgFill;
  const tc = isHeader ? "FFFFFF" : "000000";
  const b = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: b, bottom: b, left: b, right: b };

  function cell(text, w) {
    return new TableCell({
      borders,
      width: { size: w, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text, font: "Arial", size: 20, bold: isHeader, color: tc })]
      })]
    });
  }
  return new TableRow({ children: [cell(c1, 2600), cell(c2, 3480), cell(c3, 3280)] });
}

function spacer(pts = 120) {
  return new Paragraph({ spacing: { before: 0, after: pts } });
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }, {
          level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } }
        }]
      },
      {
        reference: "numbers",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "alpha",
        levels: [{
          level: 0, format: LevelFormat.LOWER_LETTER, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22 } }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 40, bold: true, font: "Arial", color: BRAND_DARK },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: BRAND_DARK },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: BRAND_MID },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND_DARK, space: 1 } },
            spacing: { before: 0, after: 160 },
            children: [
              new TextRun({ text: "SiteDocHub / SiteView-Pro  |  Technical Advisory Report", font: "Arial", size: 18, color: "888888" }),
              new TextRun({ text: "  \t", font: "Arial", size: 18 }),
              new TextRun({ text: "CONFIDENTIAL", font: "Arial", size: 18, bold: true, color: ACCENT_RED })
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }]
          })
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: BRAND_DARK, space: 1 } },
            spacing: { before: 160, after: 0 },
            children: [
              new TextRun({ text: "Insta360 Integration Analysis  |  Page ", font: "Arial", size: 18, color: "888888" }),
              new TextRun({ text: "\tPrepared for Client  |  April 2026", font: "Arial", size: 18, color: "888888" })
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }]
          })
        ]
      })
    },
    children: [
      spacer(200),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: "TECHNICAL ADVISORY REPORT", font: "Arial", size: 28, bold: true, color: BRAND_DARK, allCaps: true })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: "Insta360 Camera Integration", font: "Arial", size: 48, bold: true, color: BRAND_DARK })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND_MID, space: 1 } },
        spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: "SiteDocHub / SiteView-Pro Web Application", font: "Arial", size: 28, color: BRAND_MID })]
      }),
      spacer(120),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 6240],
        rows: [
          tRow("Project", "SiteDocHub / SiteView-Pro Web Application"),
          tRow("Report Date", "April 2026"),
          tRow("Prepared By", "Development Team"),
          tRow("Report Status", "Final Advisory"),
          tRow("Classification", "Confidential — Client Use Only"),
        ]
      }),
      spacer(320),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "1.  Executive Summary", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      body("This report provides a definitive technical analysis of the Insta360 X2 camera integration requirements for the SiteDocHub / SiteView-Pro web application. It documents why a live, real-time camera capture workflow cannot be reliably implemented within the current Progressive Web App (PWA) architecture, identifies specific gaps between the client's requirements and what the web platform can technically support, and proposes both an immediate interim workflow and a long-term strategic path."),
      spacer(80),
      callout([
        new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [new TextRun({ text: "Key Finding", font: "Arial", size: 22, bold: true, color: BRAND_DARK })]
        }),
        body("The live Insta360 OSC capture workflow — as specified in the client requirements — is fundamentally incompatible with a publicly hosted HTTPS web application. This is not a code bug or a configuration gap; it is a hard architectural constraint imposed by modern browser security standards. No amount of front-end development work on the current PWA can overcome this limitation."),
        body("Two actionable paths forward are recommended: (1) an immediate interim solution using the Insta360 mobile app for photo capture followed by manual upload into SiteView-Pro, and (2) a long-term native iOS/Android application for full, seamless camera integration."),
      ], "EFF6FF", BRAND_MID),
      spacer(160),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "2.  Client Requirements Overview", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      body("The client's specification for Insta360 integration (Section 4 of project requirements) defines the following expected workflow, intended to replicate the HoloBuilder/JobWalk camera experience:"),
      spacer(80),
      subHead("2.1  Specified User Flow"),
      numbered("User selects a pin in the application.", "numbers"),
      numbered("User taps the camera button next to the selected pin.", "numbers"),
      numbered("App checks camera connection — if not connected, prompts user to join the camera hotspot Wi-Fi network in device Settings.", "numbers"),
      numbered("App triggers the camera shutter remotely via the Insta360 Open SDK.", "numbers"),
      numbered("Camera takes the photo.", "numbers"),
      numbered("App pulls the photo as a data blob directly from the camera.", "numbers"),
      numbered("Photo is automatically assigned to the selected pin (pin turns green).", "numbers"),
      numbered("Photo is stored locally in IndexedDB and queued for Supabase cloud upload.", "numbers"),
      spacer(80),
      subHead("2.2  Specified Technical Components"),
      body("The client requirements reference two distinct technical integration methods:"),
      bullet("Insta360 Open SDK (CameraSDK-Web): A JavaScript/web interface for camera control, connection detection, shutter triggering, photo blob retrieval, and camera status monitoring.", 0),
      bullet("Open Spherical Camera (OSC) API: An HTTP-based local network protocol that Insta360 cameras expose on their Wi-Fi hotspot, used for camera commands and data retrieval.", 0),
      spacer(80),
      subHead("2.3  Specified Fallback"),
      body("If the camera is unavailable or the SDK fails, the specification calls for a fallback to the standard device file picker for manual photo upload from the camera roll. This fallback is currently implemented in the prototype."),
      spacer(160),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "3.  Why Live Capture Cannot Work in the Current PWA", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      body("This section details the technical reasons that make the specified live capture workflow incompatible with a publicly hosted HTTPS progressive web application. There are two distinct, independent barriers — either one alone is sufficient to block the feature; together they form an insurmountable constraint within the current architecture."),
      spacer(80),
      subHead("3.1  The Network Barrier — Cloud Server vs. Local Camera"),
      body("The Insta360 X2 operates as a Wi-Fi hotspot and exposes its control API on a private local area network (LAN) address, typically 192.168.42.1. This address is only reachable from devices physically connected to the camera's Wi-Fi network."),
      body("The SiteView-Pro production application is hosted on a cloud platform (e.g. Render). When the browser sends a request to the application's server — for example, https://siteview-pro.onrender.com/api/camera/... — that request travels over the internet to a cloud server in a data centre. That server has no connection to the camera's private hotspot. It cannot see 192.168.42.1. The camera's LAN is completely isolated from the internet by design."),
      callout([
        new Paragraph({
          spacing: { before: 40, after: 80 },
          children: [new TextRun({ text: "Network path illustration", font: "Arial", size: 20, bold: true, color: BRAND_DARK })]
        }),
        new Paragraph({
          spacing: { before: 0, after: 40 },
          children: [new TextRun({ text: "Required path (impossible):  Browser → Cloud Server → [INTERNET] → Camera LAN (192.168.42.1)", font: "Arial", size: 20, color: ACCENT_RED })]
        }),
        new Paragraph({
          spacing: { before: 0, after: 40 },
          children: [new TextRun({ text: "Only viable path:               Browser → Local Proxy (same network as camera) → Camera LAN", font: "Arial", size: 20, color: ACCENT_GREEN })]
        }),
      ], "FFF1F2", ACCENT_RED),
      spacer(80),
      body("There is no configuration change, API key, or server-side code modification that can bridge a cloud host to a device on a private local Wi-Fi hotspot. This is a fundamental property of how TCP/IP networking and NAT (Network Address Translation) work."),
      spacer(80),
      subHead("3.2  The Browser Security Barrier — HTTPS Mixed Content Policy"),
      body("Even if the server-side network barrier did not exist, a second and entirely independent browser security rule would block the integration. When a web application is served over HTTPS — which is the standard and required for any production PWA — modern browsers enforce the Mixed Content Policy. This policy categorically blocks any request from an HTTPS page to an HTTP resource."),
      body("The Insta360 OSC API is served over plain HTTP (http://192.168.42.1). A publicly hosted SiteView-Pro page served over HTTPS is therefore barred by the browser from making any direct request to the camera's HTTP API. The browser will block the request before it is even sent, with no exception possible from the application code."),
      callout([
        body("Mixed Content Block (browser enforced, no workaround):"),
        body("HTTPS page → attempts HTTP request to http://192.168.42.1 → Browser blocks request"),
        body("This applies universally across Chrome, Safari, Firefox, and all modern mobile browsers. It cannot be overridden by the web application."),
      ], "FFF1F2", ACCENT_RED),
      spacer(80),
      subHead("3.3  The Insta360 Open SDK Limitation"),
      body("The client requirements reference the CameraSDK-Web (Insta360 Open SDK) available at github.com/Insta360Develop/CameraSDK-Web. It is important to understand what this SDK does and does not provide:"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 6240],
        rows: [
          tRow("SDK Aspect", "Reality", true),
          tRow("What it wraps", "The same OSC HTTP API described above — it does not bypass OSC."),
          tRow("Network requirement", "The device running the browser must be on the camera hotspot LAN. The same network barrier applies.", undefined, TBL_WARN),
          tRow("HTTPS compatibility", "The SDK makes HTTP requests to the camera. These are blocked by Mixed Content on any HTTPS page.", undefined, TBL_WARN),
          tRow("window.Insta360CameraSDK", "Only injected by certain native wrappers or specific controlled environments, not available in a standard browser.", undefined, TBL_WARN),
          tRow("Does it help on hosted HTTPS?", "No. The SDK is a JavaScript convenience layer, not a tunnelling solution.", undefined, TBL_ALT),
        ]
      }),
      spacer(80),
      body("In internal testing and code analysis, a bug was also identified where the SDK's isConnected flag, when false or absent, caused the application to block OSC fallback — meaning even the LAN development workflow was affected. This has been patched, but it illustrates that the SDK adds complexity without resolving the production deployment constraint."),
      spacer(80),
      subHead("3.4  The SSID Display Limitation"),
      body("The client specification also implies showing the camera's Wi-Fi hotspot name (SSID) in the application UI — for example, prompting the user to 'Connect to INSTA360_XXXXXX Wi-Fi in Settings.' Web browsers deliberately do not expose the device's current Wi-Fi SSID to websites as a privacy protection measure. The application can detect that OSC communication succeeded (and therefore infer camera connectivity) but cannot read and display the literal hotspot name. This is a platform constraint, not a development oversight."),
      spacer(80),
      subHead("3.5  Summary of Barriers"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3480, 2760],
        rows: [
          tRow3("Barrier", "Root Cause", "Workaround in PWA?", true),
          tRow3("Cloud server not on camera LAN", "TCP/IP networking — private hotspot is isolated", "No", false, TBL_WARN),
          tRow3("HTTPS Mixed Content block", "Browser security policy — mandatory in production", "No", false, TBL_WARN),
          tRow3("SDK requires same LAN", "SDK wraps OSC HTTP — same network constraints apply", "No", false, TBL_WARN),
          tRow3("SSID not readable by browser", "Browser privacy APIs do not expose Wi-Fi SSID", "No", false, TBL_WARN),
          tRow3("Preview/dev proxy (LAN only)", "Vite proxy forwards OSC on local network", "Yes — dev only", false, TBL_ALT),
        ]
      }),
      spacer(160),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "4.  Issues in the Client-Specified Requirements", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      body("Beyond the fundamental architectural incompatibility, there are specific claims and assumptions within the client's requirement document (Section 4) that require clarification and correction."),
      spacer(80),
      subHead("Issue 4.1 — 'No internet required — purely local device-to-device'"),
      callout([
        new Paragraph({
          children: [new TextRun({ text: "Requirement states: ", font: "Arial", size: 22, bold: true }), new TextRun({ text: "“No internet required — this is purely local device-to-device over the camera’s hotspot”", font: "Arial", size: 22, italics: true })]
        })
      ], "FEF3C7", ACCENT_AMBER),
      spacer(60),
      body("This description is accurate for how Insta360 capture works in a native mobile application. However, it does not apply to a web application. A browser-based app served from the internet is not the same as a native app installed on the phone. The web app's server-side component is always cloud-hosted, and browser security policies (Mixed Content) prevent direct local HTTP access from HTTPS pages, even when the phone is connected to the camera hotspot. The statement describes the native workflow correctly, but it is not achievable in the current PWA context."),
      spacer(80),
      subHead("Issue 4.2 — 'The SDK provides a JavaScript/web interface'"),
      callout([
        new Paragraph({
          children: [new TextRun({ text: "Requirement states: ", font: "Arial", size: 22, bold: true }), new TextRun({ text: "“The SDK provides a JavaScript/web interface for detecting camera connection, triggering the shutter remotely, pulling the latest photo off the camera as a blob...”", font: "Arial", size: 22, italics: true })]
        })
      ], "FEF3C7", ACCENT_AMBER),
      spacer(60),
      body("The CameraSDK-Web does provide these capabilities, but only when the browser and the camera are on the same local network AND the app is served over plain HTTP (not HTTPS). In practice, on any production HTTPS deployment, none of these SDK capabilities are accessible. The SDK documentation may not make this limitation immediately obvious to non-technical readers, leading to the reasonable but incorrect assumption that it works universally in any web context."),
      spacer(80),
      subHead("Issue 4.3 — Implicit assumption that PWA = Native App capabilities"),
      body("The requirement is explicitly modelled on HoloBuilder/JobWalk, which is understood to be a native mobile application. Native apps are installed locally on the device and operate outside the browser security sandbox. They can use OS-level Wi-Fi APIs, communicate directly with local network devices over HTTP, and access hardware in ways that are strictly prohibited for web-based applications. The assumption that a PWA can replicate native app camera integration capabilities is the core source of the requirements gap."),
      spacer(80),
      subHead("Issue 4.4 — IndexedDB + Supabase Upload Queue (No Issue)"),
      body("The requirement for photo storage in IndexedDB with a Supabase upload queue is technically sound and fully implementable in the PWA, regardless of camera integration method. This part of the requirement is unaffected and can proceed as specified."),
      spacer(80),
      subHead("Issue 4.5 — Fallback to file picker is the only currently viable web path"),
      body("The specification defines the file picker fallback as a secondary option when the camera is unavailable. In reality, given the production constraints described in Section 3, the file picker approach is the only viable workflow for the publicly hosted HTTPS web application at this time. The 'primary' and 'fallback' designations should be inverted for the current product phase."),
      spacer(160),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "5.  Interim Recommendation — Insta360 App + Manual Upload", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      body("While the long-term solution (native app, Section 6) is being evaluated and potentially developed, a practical and immediately deployable interim workflow is available. This approach uses the Insta360 mobile application — already installed by most Insta360 X2 users — as the capture front-end, and SiteView-Pro for photo assignment and project management."),
      spacer(80),
      subHead("5.1  Recommended Interim Workflow"),
      numbered("Field worker connects their phone to the Insta360 X2 camera hotspot via device Settings.", "numbers"),
      numbered("Field worker opens the Insta360 mobile app (iOS or Android) to preview the scene and trigger the shutter.", "numbers"),
      numbered("The captured 360° photo is saved to the phone's camera roll by the Insta360 app.", "numbers"),
      numbered("Field worker switches to SiteView-Pro in the browser.", "numbers"),
      numbered("Field worker selects the target pin in SiteView-Pro.", "numbers"),
      numbered("Field worker uses the existing file picker / upload button to select and upload the photo from the camera roll.", "numbers"),
      numbered("Photo is assigned to the pin, stored locally in IndexedDB, and queued for Supabase upload.", "numbers"),
      spacer(80),
      subHead("5.2  Advantages of This Approach"),
      bullet("Zero additional development required on the web app beyond the existing file picker.", 0),
      bullet("Available immediately — no waiting for native app development.", 0),
      bullet("Uses the Insta360 mobile app's full-featured camera preview and controls, which are more capable than OSC remote triggering.", 0),
      bullet("Produces high-quality photo exports (JPG, equirectangular 360°) compatible with the existing upload pipeline.", 0),
      bullet("No architectural constraints — works with the HTTPS hosted application as-is.", 0),
      bullet("Users familiar with the Insta360 app already know the capture workflow.", 0),
      spacer(80),
      subHead("5.3  Recommended UX Improvements for Interim Flow"),
      body("To make the interim workflow as smooth as possible, the following UX improvements are recommended for the SiteView-Pro web application:"),
      bullet("Clear on-screen guidance: When the camera button is tapped and no OSC connection is detected, display a friendly instruction modal rather than just an error toast. Suggested text: 'Take your photo with the Insta360 app, then tap here to upload it to this pin.'", 0),
      bullet("Accept 360° image formats: Ensure the file picker accepts .jpg and .insp formats produced by the Insta360 app.", 0),
      bullet("Pin status feedback: Confirm that the pin turns green and shows a thumbnail after successful upload, as specified in the requirements.", 0),
      spacer(80),
      subHead("5.4  Limitations of the Interim Approach"),
      bullet("Requires switching between two applications (Insta360 app and SiteView-Pro), adding steps compared to a fully integrated workflow.", 0),
      bullet("No automatic photo-to-pin assignment — the user must manually select the correct pin before uploading.", 0),
      bullet("Slightly higher friction than a native integration, particularly on larger job sites with many pins.", 0),
      spacer(160),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "6.  Long-Term Recommendation — Native iOS & Android Application", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      body("The most reliable, highest-fidelity, and strategically sound path to achieving the fully integrated Insta360 capture workflow specified by the client is to develop native mobile applications for iOS and Android. This is the architecture used by HoloBuilder, JobWalk, and other professional site documentation tools that offer seamless 360° camera integration."),
      spacer(80),
      subHead("6.1  Why Native Apps Resolve All Constraints"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 6240],
        rows: [
          tRow("Constraint", "How Native Apps Resolve It", true),
          tRow("HTTPS Mixed Content block", "Native apps do not run in a browser — HTTP requests to the camera LAN are unrestricted."),
          tRow("Cloud server not on camera LAN", "The native app itself makes direct requests to the camera. No server proxy needed."),
          tRow("SDK limitations", "Native apps can use the full Insta360 SDK (iOS/Android), which provides richer integration than the web SDK.", undefined, TBL_ALT),
          tRow("SSID display", "iOS and Android APIs (with appropriate permissions) allow reading the current Wi-Fi SSID.", undefined, TBL_ALT),
          tRow("Camera preview", "Native SDK supports live viewfinder, GPS tagging, and multi-photo modes.", undefined, TBL_ALT),
        ]
      }),
      spacer(80),
      subHead("6.2  Development Options"),
      body("Two development pathways are available for native apps, each with different trade-offs:"),
      spacer(40),
      new Paragraph({
        spacing: { before: 80, after: 60 },
        children: [new TextRun({ text: "Option A: React Native (Recommended)", font: "Arial", size: 22, bold: true, color: ACCENT_GREEN })]
      }),
      body("React Native allows the majority of the existing SiteView-Pro business logic and UI components to be shared with the native app. Camera-specific features are implemented using platform plugins (e.g. Capacitor or React Native modules for networking, Wi-Fi, and the Insta360 SDK). This approach maximises code reuse and minimises duplication of business logic."),
      bullet("Pros: Large code reuse from existing React codebase, single development team, one codebase for iOS and Android.", 0),
      bullet("Cons: Some platform-specific native modules required for camera integration; more complex than a simple web app.", 0),
      spacer(40),
      new Paragraph({
        spacing: { before: 80, after: 60 },
        children: [new TextRun({ text: "Option B: Fully Native (Swift / Kotlin)", font: "Arial", size: 22, bold: true, color: BRAND_MID })]
      }),
      body("Separate native applications built in Swift (iOS) and Kotlin (Android) provide the deepest integration with platform APIs and the Insta360 SDK, but require maintaining two separate codebases and likely two separate development skill sets."),
      bullet("Pros: Maximum performance and SDK access, best user experience.", 0),
      bullet("Cons: Highest development cost, full duplication of logic across two codebases.", 0),
      spacer(80),
      subHead("6.3  Feature Parity with Native Apps"),
      body("With a native application, all originally specified requirements become achievable:"),
      bullet("Direct OSC communication with the camera over the local Wi-Fi hotspot — no browser or proxy required.", 0),
      bullet("SDK-driven shutter trigger, photo blob retrieval, battery and storage status.", 0),
      bullet("Display of the camera hotspot SSID in the UI.", 0),
      bullet("Fully automatic photo-to-pin assignment without user switching between apps.", 0),
      bullet("IndexedDB (or equivalent native SQLite/CoreData) for offline storage, with Supabase upload queue.", 0),
      bullet("Optional: GPS coordinates captured at time of photo and associated with the pin.", 0),
      spacer(80),
      subHead("6.4  Strategic Rationale"),
      body("Investing in native applications is not simply a technical decision — it is a product positioning decision. The client's primary competitive reference points (HoloBuilder, JobWalk) are native applications. Field professionals expect the responsiveness, camera integration, and offline capability that native apps provide. A PWA may be appropriate for the office-based project management and review aspects of SiteDocHub, while native apps serve the field capture workflow. This hybrid approach — a shared Supabase backend serving both a PWA and native apps — is a common and well-proven architecture in the AEC (Architecture, Engineering & Construction) technology space."),
      spacer(160),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "7.  Solution Comparison", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      spacer(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2600, 3480, 3280],
        rows: [
          tRow3("Criterion", "Interim (Insta360 App + Upload)", "Long-term (Native App)", true),
          tRow3("Development effort", "Minimal — UX copy only", "Significant — months"),
          tRow3("Time to deliver", "Immediate", "3–6+ months"),
          tRow3("Live camera trigger", "No — manual capture in Insta360 app", "Yes — full OSC/SDK", false, TBL_ALT),
          tRow3("Auto pin assignment", "No — manual selection", "Yes — automatic", false, TBL_WARN),
          tRow3("SSID display", "No", "Yes", false, TBL_WARN),
          tRow3("Works on HTTPS host", "Yes", "Yes (native, no browser)", false, TBL_ALT),
          tRow3("Client UX quality", "Good — minor extra steps", "Excellent — full workflow", false, TBL_ALT),
          tRow3("Long-term scalability", "Limited", "High", false, TBL_ALT),
          tRow3("Insta360 SDK depth", "None (web limitation)", "Full iOS/Android SDK", false, TBL_WARN),
        ]
      }),
      spacer(160),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "8.  Recommended Next Steps", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      spacer(40),
      new Paragraph({
        spacing: { before: 80, after: 60 },
        children: [new TextRun({ text: "Immediate (This Sprint)", font: "Arial", size: 24, bold: true, color: ACCENT_GREEN })]
      }),
      numbered("Replace the 'camera not connected' toast with a clear, instructional modal guiding users to capture with the Insta360 app and upload via the file picker.", "numbers"),
      numbered("Confirm file picker accepts all Insta360 export formats (.jpg, .insp).", "numbers"),
      numbered("Remove any UI elements suggesting live real-time OSC capture is available in the hosted app.", "numbers"),
      spacer(80),
      new Paragraph({
        spacing: { before: 80, after: 60 },
        children: [new TextRun({ text: "Short-term (Next 4–8 Weeks)", font: "Arial", size: 24, bold: true, color: ACCENT_AMBER })]
      }),
      numbered("Review client expectations against this report and align on the interim workflow as the accepted approach for the current phase.", "numbers"),
      numbered("Confirm whether a native app investment is within scope and budget for a subsequent project phase.", "numbers"),
      spacer(80),
      new Paragraph({
        spacing: { before: 80, after: 60 },
        children: [new TextRun({ text: "Long-term (Native App Phase)", font: "Arial", size: 24, bold: true, color: BRAND_MID })]
      }),
      numbered("If native app development is approved, initiate technical scoping for React Native with Insta360 SDK integration.", "numbers"),
      numbered("Plan shared Supabase backend architecture to serve both the PWA (office/review) and native apps (field capture).", "numbers"),
      numbered("Define phased delivery: iOS first (typically the primary platform for construction tech), followed by Android.", "numbers"),
      spacer(160),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "9.  Conclusion", font: "Arial", size: 40, bold: true, color: BRAND_DARK })]
      }),
      rule(),
      body("The live Insta360 X2 camera capture workflow, as specified in the client requirements, cannot be implemented in the SiteDocHub / SiteView-Pro web application in its current form. This conclusion is reached not through any limitation of the development team's ability, but through two independent and irresolvable constraints of the web browser security model: the HTTPS Mixed Content policy and the fundamental separation between cloud-hosted servers and local Wi-Fi camera networks."),
      body("The good news is that a practical interim solution requires no new development and is available immediately: field workers use the Insta360 mobile app to capture images, then upload them through the existing file picker in SiteView-Pro. With minor UX improvements, this workflow is clear, reliable, and usable today."),
      body("For the fully integrated experience the client envisions — matching the HoloBuilder/JobWalk workflow — the path forward is a native iOS and Android application. A React Native approach is recommended to maximise code reuse from the existing codebase. This represents a significant but well-justified investment that would position SiteDocHub as a genuinely competitive field documentation tool."),
      spacer(80),
      callout([
        new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [new TextRun({ text: "Summary Recommendation", font: "Arial", size: 22, bold: true, color: BRAND_DARK })]
        }),
        bullet("Now: Deploy interim Insta360 app + manual upload workflow with improved UX guidance.", 0),
        bullet("Next: Align with client on native app investment as the strategic path to full integration.", 0),
        bullet("Future: Build React Native iOS/Android apps with full Insta360 SDK integration, sharing the Supabase backend.", 0),
      ], "ECFDF5", ACCENT_GREEN),
      spacer(200),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BRAND_DARK, space: 1 } },
        spacing: { before: 160, after: 80 },
        children: [new TextRun({ text: "End of Report", font: "Arial", size: 20, italics: true, color: "888888" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: "This document is prepared for client use only. All technical findings are based on analysis of the current codebase and web platform standards as of April 2026.", font: "Arial", size: 18, color: "AAAAAA" })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("insta360_advisory_report.docx", buffer);
  console.log("Done. Generated insta360_advisory_report.docx");
});

