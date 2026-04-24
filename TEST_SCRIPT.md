# SiteDocHB — Comprehensive Test Script

> **Version:** 1.0 — April 2026
> **Spec reference:** SiteDocHB Technical Build Specification — Halsell Builders
> **Environment:** Desktop (Chrome/Edge) + Mobile (iOS Safari, Android Chrome)
> **Prereqs:** Supabase project running, Insta360 X2 charged, sample PDFs + equirectangular JPGs on hand

---

## Legend

| Icon | Meaning |
|------|---------|
| ⬜ | Not tested |
| ✅ | Pass |
| ❌ | Fail — file bug |
| ⚠️ | Partial — note in comments |

---

## 1. App Load & Branding

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 1.1 | Open app at root URL | App loads with SiteDocHB branding in header | ⬜ | |
| 1.2 | Check browser tab title | "SiteDocHB — 360° Job Site Documentation" | ⬜ | |
| 1.3 | Check PWA install prompt | App name shows "SiteDocHB" | ⬜ | |
| 1.4 | No raw error messages visible | All errors are user-friendly, no stack traces | ⬜ | |
| 1.5 | Load on mobile viewport (375px) | Responsive layout, no horizontal scroll | ⬜ | |
| 1.6 | Load on desktop (1440px) | Three-column layout: sidebar + canvas + pin panel | ⬜ | |

---

## 2. Authentication (Supabase Auth)

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 2.1 | Unauthenticated access to "/" | Redirect to login or show auth gate | ⬜ | |
| 2.2 | Magic link login | Email received, click opens authenticated session | ⬜ | |
| 2.3 | Session persists on reload | No re-login required | ⬜ | |
| 2.4 | Sign out button works | Session cleared, redirect to login | ⬜ | |

---

## 3. Job Management

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 3.1 | Create new job | Job appears in selector dropdown with name + date | ⬜ | |
| 3.2 | Job name special chars | "O'Brien's Phase-2" saved correctly | ⬜ | |
| 3.3 | Edit job name (pencil icon) | Inline edit, saves on blur/Enter | ⬜ | |
| 3.4 | Edit job description | Textarea saves on blur | ⬜ | |
| 3.5 | Delete job (trash icon) | Confirmation dialog → deletes job + all floors/pins | ⬜ | |
| 3.6 | Delete job cascades to Supabase | Verify in Supabase dashboard: job, floors, pins removed | ⬜ | |
| 3.7 | Switch between jobs | Active job changes, floor plan + pins update | ⬜ | |
| 3.8 | Created date never changes | Even after editing, `created_date` stays original | ⬜ | |
| 3.9 | Multiple jobs exist | Dropdown shows all, sorted correctly | ⬜ | |

---

## 4. Floor Management

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 4.1 | Job created with default floor | "Floor 1" tab exists on new job | ⬜ | |
| 4.2 | Add new floor | "+" button → inline name input → new tab appears | ⬜ | |
| 4.3 | Switch floors | Floor plan canvas + pin list update | ⬜ | |
| 4.4 | Delete floor (hover trash) | Confirmation dialog → floor removed | ⬜ | |
| 4.5 | Cannot delete last floor | Delete button hidden when only 1 floor | ⬜ | |
| 4.6 | Floor order preserved | Tabs appear in creation order | ⬜ | |
| 4.7 | Floor without PDF | Shows upload prompt, pin placement disabled | ⬜ | |

---

## 5. PDF Floor Plan Upload & Rendering

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 5.1 | Upload PDF via dropzone | PDF renders on canvas as floor plan image | ⬜ | |
| 5.2 | Large PDF (10MB+) | Uploads with progress, renders correctly | ⬜ | |
| 5.3 | Multi-page PDF | First page renders (or page selector) | ⬜ | |
| 5.4 | PDF stored in Supabase Storage | Verify `floor-plans` bucket has file at `{job_id}/{floor_id}/` | ⬜ | |
| 5.5 | PDF path stored in DB | `floors.pdf_path` contains storage path (not public URL) | ⬜ | |
| 5.6 | PDF loads via signed URL | Network tab shows signed URL, not public URL | ⬜ | |
| 5.7 | PDF persists across reload | Floor plan still visible after F5 | ⬜ | |
| 5.8 | Replace PDF | Upload new PDF to same floor → replaces old | ⬜ | |

---

## 6. Pin Placement & Management

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 6.1 | "Place New Pin" button | Enters placement mode (visual indicator) | ⬜ | |
| 6.2 | Click on floor plan | Pin placed at click position | ⬜ | |
| 6.3 | Pin position stored as x_pct/y_pct | Verify fractions 0.0–1.0 in DB | ⬜ | |
| 6.4 | Pins render at correct position on resize | Responsive — pins stay on correct spot | ⬜ | |
| 6.5 | Select pin | Pin detail panel shows on right | ⬜ | |
| 6.6 | Rename pin | Inline edit, saves on blur/Enter | ⬜ | |
| 6.7 | Add pin notes | Textarea saves on blur, persists | ⬜ | |
| 6.8 | Delete pin | Confirmation dialog → pin removed from list + canvas | ⬜ | |
| 6.9 | Pin without photo | Shows "No Photo" badge, empty photo zone | ⬜ | |
| 6.10 | Pin with photo | Shows photo preview, "Photo Captured" badge | ⬜ | |
| 6.11 | Pin list progress bar | Shows X/Y pins filled with percentage | ⬜ | |

---

## 7. Photo Upload (Manual)

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 7.1 | Click "Browse" button | File picker opens, accepts images | ⬜ | |
| 7.2 | Select JPEG image | Uploads to Supabase `pin-photos` bucket | ⬜ | |
| 7.3 | Photo appears in pin detail | Preview shows uploaded image | ⬜ | |
| 7.4 | Drag & drop photo | Photo uploads on drop | ⬜ | |
| 7.5 | Large photo (20MB+ equirectangular) | Uploads successfully without timeout | ⬜ | |
| 7.6 | Photo stored with signed URL | Network tab shows signed URL, not public | ⬜ | |
| 7.7 | Photo path in DB | `pins.photo_path` = storage path, not URL | ⬜ | |
| 7.8 | `photo_taken_at` timestamp set | Verify in DB | ⬜ | |

---

## 8. Insta360 X2 Camera Integration

> **Setup:** Connect test device to Insta360 X2 WiFi hotspot (`INSTA360_XXXXXX`)

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 8.1 | Camera disconnected state | Red dot + "Disconnected" label below capture button | ⬜ | |
| 8.2 | Connect to Insta360 WiFi | Green dot + "Connected" label appears within 5s | ⬜ | |
| 8.3 | Connection status polls | Status updates automatically (5s interval) | ⬜ | |
| 8.4 | Tap "Capture with Insta360" (connected) | Camera shutter fires, spinner shows | ⬜ | |
| 8.5 | Photo auto-assigns to selected pin | Pin turns green, photo preview shows | ⬜ | |
| 8.6 | Photo uploaded to Supabase | Appears in `pin-photos` bucket after sync | ⬜ | |
| 8.7 | Capture without pin selected | Shows error/prompt to select a pin first | ⬜ | |
| 8.8 | Capture when disconnected | Friendly error: "Camera capture failed — check connection" | ⬜ | |
| 8.9 | Fallback to file picker | If SDK fails, user can still upload manually | ⬜ | |
| 8.10 | Test on iOS Safari | Camera workflow works on iPhone | ⬜ | |
| 8.11 | Test on Android Chrome | Camera workflow works on Android | ⬜ | |
| 8.12 | Vite proxy forwarding | `/api/camera/osc/info` proxies to `192.168.42.1` | ⬜ | |

---

## 9. 360° Panoramic Viewer

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 9.1 | "View Full 360°" button | Only visible on pins with photos | ⬜ | |
| 9.2 | Click "View Full 360°" | Fullscreen panorama viewer opens | ⬜ | |
| 9.3 | Drag to look around | Pan/tilt works smoothly | ⬜ | |
| 9.4 | Scroll to zoom | Zoom in/out works | ⬜ | |
| 9.5 | Auto-rotation | Viewer slowly auto-rotates | ⬜ | |
| 9.6 | Press Escape | Viewer closes | ⬜ | |
| 9.7 | Click X button | Viewer closes | ⬜ | |
| 9.8 | Non-equirectangular image | Renders without crash (may look distorted) | ⬜ | |
| 9.9 | Mobile touch gestures | Pinch-to-zoom + swipe-to-pan | ⬜ | |

---

## 10. HTML Export

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 10.1 | Click Export button (Download icon) | Toast: "Generating export…" with progress % | ⬜ | |
| 10.2 | File downloads | `.html` file downloads to browser | ⬜ | |
| 10.3 | Filename format | `YY-MM-DD-job-name-description.html` | ⬜ | |
| 10.4 | Date in filename = created date | Uses job creation date, not export date | ⬜ | |
| 10.5 | Open exported HTML | Self-contained, all photos embedded as base64 | ⬜ | |
| 10.6 | Export contains all floors | Each floor section with pin grid | ⬜ | |
| 10.7 | Export contains notes | Pin notes visible in report | ⬜ | |
| 10.8 | Export with no photos | Report generates with "No photo" placeholders | ⬜ | |
| 10.9 | Export large job (20+ pins) | Completes without crash, progress updates | ⬜ | |
| 10.10 | Exported file viewable offline | Open HTML file from desktop — no network needed | ⬜ | |

---

## 11. Share Read-Only Links

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 11.1 | Click Share button (link icon) | Modal opens with loading spinner | ⬜ | |
| 11.2 | Share URL generated | Real URL with token (not job ID) | ⬜ | |
| 11.3 | Copy button | URL copied to clipboard, toast confirms | ⬜ | |
| 11.4 | Set expiry date | Expiry passed to edge function | ⬜ | |
| 11.5 | Open share URL in new browser | Read-only view loads without login | ⬜ | |
| 11.6 | Share view shows job name | Header displays job name + "Read-only" badge | ⬜ | |
| 11.7 | Share view shows floor tabs | All floors clickable | ⬜ | |
| 11.8 | Share view shows pin grid | Photos, names, notes visible | ⬜ | |
| 11.9 | Share view 360° viewer | "View 360°" button works on pin cards | ⬜ | |
| 11.10 | No edit controls on share view | No pencil, delete, capture, upload buttons | ⬜ | |
| 11.11 | Expired link | Shows "Link Expired" page | ⬜ | |
| 11.12 | Invalid token | Shows "Link Not Found" page | ⬜ | |
| 11.13 | Share in incognito window | Works without any auth cookies | ⬜ | |

---

## 12. Offline Support & Background Sync

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 12.1 | Load app while online | App caches shell + current job data | ⬜ | |
| 12.2 | Disconnect WiFi/network | App continues to function | ⬜ | |
| 12.3 | Place pins offline | Pins saved locally (IndexedDB) | ⬜ | |
| 12.4 | Upload photo offline | Photo queued in IndexedDB, not lost | ⬜ | |
| 12.5 | Reconnect | Sync indicator shows "Syncing…" | ⬜ | |
| 12.6 | Queued photos upload | Photos appear in Supabase after sync | ⬜ | |
| 12.7 | Floor plan PDF cached | Previously loaded PDF visible offline | ⬜ | |
| 12.8 | Sync error handling | Failed sync shows amber indicator, retry on click | ⬜ | |
| 12.9 | Network toggle rapid | No duplicate uploads or data corruption | ⬜ | |

---

## 13. Toast Notifications

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 13.1 | Create job | ONE toast appears (not two) | ⬜ | |
| 13.2 | Upload photo | ONE success toast | ⬜ | |
| 13.3 | Delete pin | ONE success toast | ⬜ | |
| 13.4 | Error occurs | ONE error toast with friendly message | ⬜ | |
| 13.5 | Toast position | Bottom-right (Sonner default) | ⬜ | |

---

## 14. Filename Convention (Spec Section 6)

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 14.1 | Format: `YY-MM-DD-Job Name-Description` | Export filename matches exactly | ⬜ | |
| 14.2 | Date = job creation date | Not export date | ⬜ | |
| 14.3 | Special chars stripped | Apostrophes, slashes removed from filename | ⬜ | |
| 14.4 | Default description | "Photo Walk" if not changed | ⬜ | |

---

## 15. Security & Storage

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 15.1 | `pin-photos` bucket is PRIVATE | Supabase dashboard shows private | ⬜ | |
| 15.2 | `floor-plans` bucket is PRIVATE | Supabase dashboard shows private | ⬜ | |
| 15.3 | Photos accessible via signed URLs only | Direct storage URL returns 403 | ⬜ | |
| 15.4 | Signed URLs expire | After 1 hour, old signed URL returns 403 | ⬜ | |
| 15.5 | DB stores storage paths, not URLs | Check `pins.photo_path` and `floors.pdf_path` | ⬜ | |
| 15.6 | RLS enabled on all tables | Unauthenticated REST queries return empty/403 | ⬜ | |

---

## 16. SharePoint Compatibility

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 16.1 | App loads in iframe | No X-Frame-Options blocking | ⬜ | |
| 16.2 | SharePoint Embed web part | App renders correctly inside SP page | ⬜ | |
| 16.3 | CORS headers set | `Access-Control-Allow-Origin` allows SP tenant | ⬜ | |
| 16.4 | Auth works in iframe | Cookie/token flows work cross-origin | ⬜ | |

---

## 17. Performance

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 17.1 | Initial load < 3s | On broadband connection | ⬜ | |
| 17.2 | PDF render < 2s | Standard floor plan PDF | ⬜ | |
| 17.3 | 20+ pins on one floor | No jank when scrolling/selecting | ⬜ | |
| 17.4 | Large photo upload progress | User sees feedback during upload | ⬜ | |
| 17.5 | Export 10-pin job | Completes in < 30s | ⬜ | |

---

## 18. Cross-Platform

| # | Test Case | Expected | Status | Notes |
|---|-----------|----------|--------|-------|
| 18.1 | Chrome desktop | Full functionality | ⬜ | |
| 18.2 | Edge desktop | Full functionality | ⬜ | |
| 18.3 | iOS Safari (iPhone) | Core workflow works | ⬜ | |
| 18.4 | Android Chrome | Core workflow works | ⬜ | |
| 18.5 | iPad landscape | Responsive layout adapts | ⬜ | |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Field Tester | | | |
| Office Tester | | | |
| Client (Joe Halsell) | | | |
