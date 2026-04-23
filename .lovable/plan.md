
# SiteDocHB — 360° Job-Site Photo Documentation

A polished, dark-themed React app for Halsell Builders' field crews and office staff. Industrial-precision aesthetic (Procore × Linear), fully interactive with mock data pre-loaded.

## Design System
- **Colors**: Near-black base (#0f1117), surface (#171b24), elevated (#1e2330), amber accent (#f59e0b), green/red status colors, layered text hierarchy — all wired as HSL CSS variables in `index.css` and Tailwind tokens
- **Typography**: DM Mono (headings/data), IBM Plex Sans (body), JetBrains Mono (filenames/timestamps) — loaded from Google Fonts
- **Motion**: 180ms cubic-bezier transitions, pin pulse keyframes, panel slide-ins, progress bar fill, hover lifts, `prefers-reduced-motion` fallbacks

## Layout Architecture
- **Desktop (≥1024px)**: Fixed 64px header + three-column shell (280px sidebar | flex canvas | 320px right panel), independent scroll
- **Tablet (768–1023px)**: Sidebar collapses to 56px icon rail, right panel becomes modal overlay
- **Mobile (<768px)**: 56px header, 40vh canvas, draggable bottom sheet (Framer Motion) with 30vh / 70vh snap points + floating amber FAB with fan-out actions

## Core Components

**Header Bar** — Blurred glass surface, amber wordmark + logomark, center job selector pill with dropdown (job list + "New Job"), right cluster: sync status badge (synced/syncing/offline-queued — toggleable for demo), share, export, user avatar with menu

**Left Sidebar**
- Job meta card: editable name (inline pencil), description, animated amber progress bar with `{filled}/{total} pins` + %
- Horizontal scrollable floor tabs with active amber underline + `+` add-floor tab
- Pin list rows: status dot (amber empty / green filled with thumbnail), name, timestamp, hover camera icon, selected state with persistent amber left border
- Dashed full-width "+ Place New Pin" button at bottom

**Floor Plan Canvas**
- Blueprint dot-grid background, mock floor plan rendered (SVG-based mock — no real PDF needed for demo, structured so PDF.js can drop in later)
- SVG pin overlay: empty (pulsing amber ring), filled (green + check), selected (scaled + glow), hover tooltip pill with name + photo count
- Placement mode: inset amber border, custom amber crosshair cursor, click to place + inline name popover, click-off to cancel
- Floating glass zoom/pan controls (−, %, +, fit) bottom-right

**Right Panel (Pin Detail)** — Slides in from right (240ms)
- Editable pin name, status badge ("No Photo" amber outline / "Photo Captured" green)
- Photo zone: dashed dropzone when empty (with drag-over amber glow), full image with "View Full 360°" hover scrim when present
- Primary amber CTA "📷 Capture with Insta360" (with disconnected/loading variants)
- Camera connection indicator + "upload from camera roll" fallback
- Auto-resize notes textarea with focus glow + character count
- Filename preview in JetBrains Mono with copy-to-clipboard (checkmark confirmation)

**Mobile Bottom Sheet** — Framer Motion drag handle, spring physics snap points, rounded top corners, top shadow

**Modals** — Blurred backdrop, scale-in entrance, focus trap
- New Job: name, description (default "Photo Walk"), first floor label
- Share Link: read-only URL + copy confirmation, optional expiry, info text

**Toast System** — Sonner-based, top-right desktop / top-center mobile, color-coded left borders (success/warning/error/info), 3s auto-dismiss, slide-in animation

**Skeleton States** — Shimmer-animated placeholders on initial load, resolve to mock data after brief delay (pin list, canvas, photo, job pill)

## Mock Data (pre-loaded)
- **Mill St Apts** (active) — created 2026-04-21, "Photo Walk"
  - Floor 1: 10 pins, 6 filled (Front Entry, Lobby, Unit 1A Kitchen, Unit 1A Bedroom, Unit 1B Living, Unit 1B Bath filled; North Stairwell, Elevator Lobby, Mechanical Room, Roof Deck Access empty)
  - Floor 2: 4 pins, 2 filled (Unit 2A Kitchen, Unit 2A Bath filled; South Corridor, Electrical Room empty)
- **Harbor View Office** (archived listing in selector)

## Interactivity
- React state for active job / floor / selected pin
- Working pin placement, naming, photo "capture" simulation (uses placeholder image), notes editing
- Sync status toggle in header for demo (synced ↔ offline-queued ↔ syncing)
- Responsive breakpoints fully working with reflow + bottom sheet drag on mobile
- All hover/active/focus states per the interactive state reference
- Accessibility: focus-visible amber rings, aria-labels on icon buttons, icon+text status indicators, friendly error toasts

## Tech Stack
- React + Vite + TypeScript (existing)
- Tailwind with extended custom tokens (no generic shadcn defaults visible)
- Lucide React icons
- Framer Motion for bottom sheet & panel transitions
- Sonner for toasts
- Google Fonts via index.html `<link>` with `display=swap`
- SVG-based floor plan mock (PDF.js-ready architecture for future swap-in)

## File Plan
- `index.html` — Google Fonts links
- `src/index.css` — full dark design system, fonts, keyframes (pulse, shimmer, slide), focus styles
- `tailwind.config.ts` — extended colors, fonts, animations
- `src/data/mockData.ts` — jobs, floors, pins
- `src/types.ts` — Job, Floor, Pin types
- `src/store/useAppStore.ts` — Zustand or React Context for app state
- `src/pages/Index.tsx` — main shell with responsive layout
- `src/components/site/Header.tsx`, `JobSelector.tsx`, `SyncBadge.tsx`
- `src/components/site/Sidebar.tsx`, `JobMetaCard.tsx`, `FloorTabs.tsx`, `PinList.tsx`
- `src/components/site/FloorPlanCanvas.tsx`, `Pin.tsx`, `ZoomControls.tsx`
- `src/components/site/PinDetailPanel.tsx`, `PhotoZone.tsx`, `CameraButton.tsx`
- `src/components/site/MobileBottomSheet.tsx`, `MobileFAB.tsx`
- `src/components/site/NewJobModal.tsx`, `ShareLinkModal.tsx`
- `src/components/site/Skeletons.tsx`
