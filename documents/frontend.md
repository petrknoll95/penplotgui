# Frontend

The frontend is a Vite + React 18 + TypeScript application in [`frontend/`](../frontend). It is an operational control surface for a pen plotter: upload SVG, preview toolpaths, position and scale artwork, start/pause/stop plots, jog the machine, and adjust settings.

## Stack

| Concern | Current implementation |
| --- | --- |
| App framework | React 18 with `ReactDOM.createRoot()` |
| Build/dev | Vite 5, dev server port `9999` |
| Language | TypeScript with `strict`, `noUnusedLocals`, and `noUnusedParameters` enabled |
| Styling | Tailwind CSS v4 through `@tailwindcss/vite` and `@theme` tokens in `index.css` |
| Component primitives | Radix UI package imports through `radix-ui` |
| Icons | `@phosphor-icons/react` |
| Drag and drop | `react-dnd` with `HTML5Backend` |
| Class utilities | `clsx` and `tailwind-merge` via `cn()` |

## App Layout

[`App.tsx`](../frontend/src/App.tsx) renders a fixed two-column layout:

- Main work area: `1fr`, dark gridded background, scrollable, with a floating X/Y position readout.
- Right sidebar: `320px`, fixed width, collapsible draggable panels.
- Timeline scrubber: fixed at bottom when SVG paths exist and the plotter is not actively plotting.

The first screen is the actual tool, not a landing page.

## Main State In `App`

| State | Purpose |
| --- | --- |
| `paths` | Preview path geometry returned by the backend. |
| `bed` | Current bed/soft-limit dimensions shown by preview and settings. |
| `filename` | Uploaded SVG filename used for later reposition/plot requests. |
| `status` | Live plotter state from `/api/plotter/status` and `/api/ws`. |
| `error` | Short-lived UI error banner. |
| `dimensions` | Scaled SVG canvas dimensions/offset returned by the backend. |
| `optimizationMethod` | `none`, `greedy`, or `greedy_flip`; defaults to `greedy_flip`. |
| `positionSettings` | Alignment, margin, scale mode, scale percent, target width/height. |
| `artboardSettings` | Enabled by default, preset `36x48`, `360 x 480` mm, portrait. |
| `previewPosition` | Timeline path index for preview playback. |
| `isPreviewPlaying` | Whether the timeline is auto-advancing. |
| `playbackSpeed` | Timeline playback speed, default `1`. |
| `isSetHomeModalOpen` | Controls the set-home modal. |

The frontend clamps displayed bed dimensions to `426 x 599` mm.

## Component Map

| Component | Role |
| --- | --- |
| [`FileUpload`](../frontend/src/components/FileUpload.tsx) | Hidden file input plus button for selecting/replacing `.svg` files. |
| [`SvgPreview`](../frontend/src/components/SvgPreview.tsx) | Renders plotter bed, artboard, SVG bounds, travel moves, drawing paths, home marker, and current/preview pen marker. |
| [`TimelineScrubber`](../frontend/src/components/TimelineScrubber.tsx) | Path-by-path preview playback, path count, pen-up/pen-down/total distance estimates, and speed selector. |
| [`PositionControls`](../frontend/src/components/PositionControls.tsx) | Artboard presets, orientation, custom artboard size, scale mode, alignment grid, margin, and custom offset. |
| [`OptimizationControls`](../frontend/src/components/OptimizationControls.tsx) | Path order method selector. |
| [`ControlPanel`](../frontend/src/components/ControlPanel.tsx) | Connect/disconnect, test plot, start plot, pause/resume/stop, home, progress, reset connection. |
| [`JogControls`](../frontend/src/components/JogControls.tsx) | Jog distance, X/Y/Z jogging, pen up/down, stop/reset, open set-home modal. |
| [`SetHomeModal`](../frontend/src/components/SetHomeModal.tsx) | Temporarily disables soft limits, lets the operator jog to a new origin, then sends `G92 X0 Y0`. |
| [`Settings`](../frontend/src/components/Settings.tsx) | Soft-limit bed width/height, rapid speed slider, draw speed slider, easing toggle. |
| [`Sidebar`](../frontend/src/components/Sidebar.tsx) | Sidebar shell and drag-layer host. |
| [`DraggablePanel`](../frontend/src/components/DraggablePanel.tsx) | DnD reordering for sidebar panels with a constrained custom drag preview. |

## API Usage

[`frontend/src/api.ts`](../frontend/src/api.ts) centralizes backend calls under `API_BASE = "/api"`.

| UI action | API function | Backend endpoint |
| --- | --- | --- |
| Upload SVG | `uploadSvg()` | `POST /api/upload` |
| Reposition preview | `repositionSvg()` | `POST /api/reposition` |
| Convert only | `convertSvg()` | `POST /api/convert` |
| Connect/disconnect | `connect()`, `disconnect()` | `POST /api/plotter/connect`, `POST /api/plotter/disconnect` |
| Poll status | `getStatus()` | `GET /api/plotter/status` |
| Start plot | `startPlot()` | `POST /api/plotter/plot` |
| Test plot | `testPlot()` | `POST /api/plotter/test-plot` |
| Pause/resume/stop/reset | `pausePlot()`, `resumePlot()`, `stopPlot()`, `reset()` | Plotter control endpoints |
| Home/jog/pen | `home()`, `jog()`, `penUp()`, `penDown()` | Plotter control endpoints |
| Set home | `setHome()` | `POST /api/plotter/set-home` |
| Toggle soft limits | `setSoftLimitsEnabled()` | `POST /api/plotter/soft-limits?enabled=...` |
| Profiles | `getProfiles()`, `saveProfile()`, `activateProfile()` | Profile endpoints |
| Settings | `setBedSize()`, `setStepsPerMm()`, `setSpeedSettings()` | Plotter settings endpoints |

`createWebSocket()` connects to `${protocol}//${window.location.host}/api/ws` and only consumes messages where `data.type === "status"`.

## Preview Model

`SvgPreview` treats backend preview paths as plotter-space coordinates. It sets the SVG viewBox to the bed dimensions with padding, then wraps plotted geometry in:

```tsx
<g transform={`translate(0, ${bed.height}) scale(1, -1)`}>
```

This flips the browser SVG coordinate system so plotter origin `(0, 0)` appears at bottom left.

Preview colors and overlays:

- Bed outline: dashed gray.
- Artboard outline: dashed blue when enabled.
- SVG canvas outline: amber when dimensions are known.
- Travel moves: dashed gray or orange when completed.
- Future drawing paths: blue.
- Completed drawing paths: green.
- Live plotter position: red.
- Timeline preview pen position: purple.
- Home: small white square at `(0, 0)`.

## Timeline Model

The timeline advances by path index, not by actual G-code line or by segment length. It estimates:

- Pen-up distance from current end to next path start, beginning at `(0, 0)`.
- Pen-down distance by summing points within each completed path.
- Return-home pen-up distance when the preview is complete.

Playback increments every `200 / playbackSpeed` milliseconds.

## Design System

The current design system is local and compact:

- [`index.css`](../frontend/src/index.css) defines Tailwind v4 theme tokens for text sizes, radius, collapse animations, core colors, and button colors.
- The palette is mostly dark neutral `oklch` values with red destructive states and status/path colors embedded in components.
- Typography is monospace at the document body and button level.
- Buttons use `class-variance-authority` variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`.
- Form controls are height-aligned with `--button-height`.
- Sidebar panels are collapsible Radix primitives and can receive a drag handle from `DraggablePanel`.

## Frontend Persistence

Only panel order is stored in browser persistence:

- Key: `sidebar-panel-order`.
- Default order: `position`, `optimization`, `control`, `jog`, `settings`.
- Saved order is accepted only if all default panels are present.

All other frontend state resets on page reload.

## Current Limitations

- The WebSocket helper reports close/error to console through `onError`, but `App` does not surface those connection errors to the UI.
- There is no reconnect loop for `/api/ws`.
- `Settings` exposes rapid/draw speeds, but the firmware currently uses its own rapid speed for `G0` and caps feed rates above `5000` mm/min.
- `convertSvg()` does not expose all conversion options that `startPlot()` exposes, and it is not part of the primary UI flow.
- The frontend assumes the backend and frontend share one host through Vite proxy or same-origin deployment.
