# Insta360 Camera Capture — Technical Report & Research Notes

This document describes how **Insta360 capture** works in the SiteDocHub / siteview-pro web app, why it fails in common deployments, what was fixed in code, and what remains a **platform or product constraint** (not a bug you can patch only in React).

---

## 1. Executive summary

| Topic | Summary |
|--------|---------|
| **User-facing feature** | On a selected pin, **“Capture with Insta360”** talks to an Insta360 camera (e.g. ONE X2) over the **Open Spherical Camera (OSC)** API, downloads the photo, and uploads it to the pin (Supabase Storage + app state). |
| **What “Connected” means** | The browser successfully reached the camera’s **OSC HTTP API** (via a same-origin proxy path or, on `http:` pages only, a direct camera IP). It does **not** mean “Wi‑Fi joined” and does **not** show the hotspot **SSID** (browsers do not expose SSID to web pages). |
| **Main production issue** | If the app is served as **HTTPS** from a **remote host** (e.g. Render), the phone **cannot** drive live capture to `http://192.168.x.x` on the camera: **mixed content** rules plus the fact that **your cloud server is not on the camera’s LAN**. |
| **Supported capture workflow today** | **Vite dev or preview** on a PC **joined to the camera Wi‑Fi**, phone opens **`http://<PC-LAN-IP>:8080/site`**, so requests to **`/api/camera/*`** are proxied to the camera gateway (default `http://192.168.42.1`). |
| **Code-side bug (fixed)** | If `window.Insta360CameraSDK` existed but **`isConnected` was missing or returned `false`**, the app treated the camera as disconnected and **never fell back to OSC**—blocking capture even when the camera was reachable. |

---

## 2. Feature overview (product flow)

1. User selects a **job** and **floor**, places or selects a **pin**.
2. In the **pin detail** sidebar, the app periodically polls **camera status** (battery, storage, connected flag).
3. When **Connected**, user taps **“Capture with Insta360”**.
4. The app sends OSC **`camera.takePicture`**, polls command status if needed, then **GET**s the JPEG from the URL returned by the camera.
5. The blob is uploaded through existing **pin photo upload** logic (Supabase, etc.) and the UI updates.

If the app thinks the camera is **disconnected**, the button still renders but **handleCapture** short-circuits with a toast: *Insta360 not connected. Connect camera WiFi first.* (wording may vary slightly in code.)

---

## 3. Architecture (how the web app reaches the camera)

### 3.1 OSC (Open Spherical Camera)

Insta360 consumer cameras expose an OSC-style HTTP API on the **camera hotspot gateway**, commonly:

- **IP:** `http://192.168.42.1` (many models; X2 is widely documented at this address)
- **Alternate:** `http://192.168.43.1` on some firmware / modes

Typical endpoints used by this app:

| Method | Path | Role |
|--------|------|------|
| `GET` | `/osc/info` | Discover camera / prove reachability |
| `POST` | `/osc/state` | Battery, storage, etc. |
| `POST` | `/osc/commands/execute` | e.g. `camera.takePicture` |
| `POST` | `/osc/commands/status` | Poll long-running capture |

Headers (as implemented) include **`Content-Type`**, **`Accept`**, and **`X-XSRF-Protected: 1`** as required by Insta360’s OSC documentation.

### 3.2 Same-origin proxy (`/api/camera`)

Browsers enforce **same-origin policy** and **mixed content** (HTTPS page → HTTP camera is blocked).

**Development / preview:** Vite proxies:

```text
Browser  →  GET https://host/site        (user case: http://PC:8080)
Browser  →  GET http://PC:8080/api/camera/osc/info
Vite     →  GET http://192.168.42.1/osc/info   (server-side; no browser CORS to camera)
```

Configuration lives in **`vite.config.ts`**:

- **`server.proxy`** and **`preview.proxy`** map `/api/camera` → **`INSTA360_OSC_PROXY_TARGET`** (default `http://192.168.42.1`).

### 3.3 Optional direct bases (HTTP pages only)

On **`http:`** origins, the client may also try **`http://192.168.42.1`** and **`http://192.168.43.1`** after `/api/camera`, with a small cache of whichever base first responds to **`/osc/info`**. This is implemented in **`src/lib/insta360Client.ts`** (`buildOscBases`, `resolveWorkingOscBase`). On **`https:`**, those direct URLs are **not** attempted (mixed content).

### 3.4 Optional `Insta360CameraSDK` path

Some environments might inject **`window.Insta360CameraSDK`**. The app may use it **only when** `isConnected` is a function **and** returns **true** for status and capture; otherwise it **falls back to OSC** (post-fix behavior).

---

## 4. Key source files

| File | Responsibility |
|------|----------------|
| **`src/lib/insta360Client.ts`** | OSC base resolution, `getInsta360Status()`, `capturePhotoFromInsta360()`, SDK vs OSC rules, timeouts, cache invalidation. |
| **`src/hooks/useInsta360.ts`** | Polls status on an interval; exposes `triggerCapture`, connection copy. |
| **`src/components/site/PinDetailPanel.tsx`** | Capture button, connected UI, upload area, gate on `cameraConnected`. |
| **`vite.config.ts`** | `INSTA360_OSC_PROXY_TARGET`, `/api/camera` proxy for **dev** and **preview**. |
| **`tests/utils/insta360Mock.ts`** | Playwright mocks for `/api/camera/osc/*`. |
| **`tests/insta360-mocked.spec.ts`**, **`tests/insta360-connection.spec.ts`** | Automated regression tests. |
| **`src/lib/insta360Client.test.ts`** | Unit tests (SDK false → OSC fallback). |

Global state: **`cameraConnected`** in **`src/store/useAppStore.ts`** (updated by the hook from `getInsta360Status()`).

---

## 5. Issues catalog (historical + current)

### 5.1 Fixed: SDK blocked OSC fallback (logic bug)

**Symptom:** User on camera Wi‑Fi, proxy working, but UI still **Disconnected** or capture refused.

**Cause:** If `Insta360CameraSDK` was present and **`isConnected`** was undefined or returned **`false`**, status logic treated the camera as offline and **returned early** without calling OSC.

**Fix:** Use the SDK for “connected” / capture **only** when `isConnected` exists and resolves **true**; otherwise **always** use OSC (`getInsta360Status` / `capturePhotoFromInsta360` in `insta360Client.ts`).

### 5.2 Operational: wrong proxy target (wrong gateway IP)

**Symptom:** Everything wired correctly but `/osc/info` never succeeds.

**Mitigation:** From the PC on camera Wi‑Fi, run `curl http://192.168.42.1/osc/info`; if it fails, try **`http://192.168.43.1`**. Set **`INSTA360_OSC_PROXY_TARGET`** in `.env` and restart Vite.

### 5.3 Operational: preview server had no proxy (older setups)

**Symptom:** `npm run dev` works, `npm run preview` does not reach camera.

**Mitigation:** **`preview.proxy`** is explicitly set to mirror **`server.proxy`** in `vite.config.ts` (verify in your branch).

### 5.4 Structural: HTTPS hosted app (e.g. Render) cannot drive LAN camera

**Symptom:** App works at **`https://siteview-pro.onrender.com/`**; user joins camera Wi‑Fi; still **Disconnected** or errors on capture.

**Why (two layers):**

1. **Network:** Render’s servers are **not** on your camera’s `192.168.x.x` LAN. A request from the browser to **`https://siteview-pro.onrender.com/api/camera/...`** hits **Render**, not your camera, unless you implement a **custom backend on that host** that somehow reaches the camera—which **still** cannot see your private hotspot from the cloud.

2. **Browser mixed content:** Even if you tried to call **`http://192.168.42.1`** from an **HTTPS** page, the browser blocks it as **insecure mixed content**.

**Conclusion:** Live Insta360 OSC from **only** the public HTTPS deployment is **not** a configuration tweak; it requires a **different architecture** (see §8).

### 5.5 UX: SSID not shown in sidebar

**Expectation:** “Show camera Wi‑Fi name next to Connected.”

**Reality:** Standard **web APIs do not expose** the current Wi‑Fi SSID to arbitrary sites (privacy). The UI can show **“Insta360 · camera network (OSC)”** when OSC succeeds—not the literal hotspot name—unless you ship a **native wrapper** (Capacitor, etc.) with platform permissions.

---

## 6. Environment variables (reference)

| Variable | Where | Purpose |
|----------|--------|---------|
| **`INSTA360_OSC_PROXY_TARGET`** | `.env` (Vite / Node), read in **`vite.config.ts`** | HTTP origin of the camera for **`/api/camera`** proxy (default `http://192.168.42.1`). |
| **`VITE_CAMERA_OSC_BASE`** | `.env`, exposed to client | Optional full OSC base when the app itself is served over **`http:`** on camera LAN (bypass relative `/api/camera` if needed). Documented in **`.env.example`**. |

---

## 7. Recommended workflows (what actually works)

### 7.1 Field capture (recommended today)

1. PC joins **Insta360** hotspot.
2. `npm run dev -- --host 0.0.0.0 --port 8080` (or `preview` with same proxy).
3. Phone joins **same** hotspot.
4. Phone browser: **`http://<PC-LAN-IP>:8080/site`**.
5. Pin open → **Connected** → **Capture with Insta360** → image in pin / upload flow.

### 7.2 Production site (Render) without new architecture

- Use **manual upload** (Insta360 mobile app → export/share → upload file in web app), **or**
- Keep using **LAN dev URL** only for the capture step, then use hosted app for the rest (if your workflow allows).

---

## 8. Research directions (if “capture on https” is required)

These are **product/engineering** options, not hidden flags:

| Approach | Idea | Pros / cons |
|----------|------|-------------|
| **LAN tunnel to dev machine** | e.g. ngrok/cloudflared tunnel to PC running Vite on site; phone opens **https tunnel URL**; `/api/camera` is same-origin to tunnel → still ends at PC → proxy to camera. | Works if **PC on camera Wi‑Fi** and tunnel process running; operational overhead. |
| **On-prem / edge mini-server** | Small device on LAN exposes HTTPS + proxy to camera; app configured with that base URL. | Hardware + ops; full control. |
| **Native app shell** | Capacitor/React Native with plugins for network / optional Insta360 SDK. | Development cost; can surface SSID or deeper integration where allowed. |
| **“Upload only” on web** | No live OSC on hosted PWA; clear UX copy. | Simplest; honest. |

---

## 9. Testing (for regressions)

- **Unit:** `npx vitest run src/lib/insta360Client.test.ts`
- **E2E (mocked OSC):** `npx playwright test tests/insta360-mocked.spec.ts` (requires `E2E_EMAIL` / `E2E_PASSWORD` where applicable).
- **E2E (SDK false + OSC):** `npx playwright test tests/insta360-connection.spec.ts`
- **Manual checklist:** **`TEST_SCRIPT.md`** section **8** (Insta360 X2 integration).

---

## 10. External references (OSC / Insta360)

- Insta360 OSC documentation and community repos (e.g. **Insta360Develop/Insta360_OSC** on GitHub) describe headers, endpoints, and rate limits.
- **Open Spherical Camera** specification (Google) defines the general OSC HTTP patterns.

---

## 11. Changelog (report vs code)

This report was written to consolidate **behavior, constraints, and fixes** as of the branch that includes:

- OSC-first / SDK-gated logic in **`insta360Client.ts`**
- **`preview.proxy`** + **`INSTA360_OSC_PROXY_TARGET`**
- Sidebar copy clarifying **OSC / camera network** vs SSID
- Playwright + Vitest coverage described in §9

If you extend the product (tunnels, native shell, server proxy), update **§3, §5.4, and §8** so future research stays accurate.

---

*End of report.*
