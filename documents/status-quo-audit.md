# Status Quo Audit

This audit captures what the repository currently does and where the current source differs from earlier docs or likely intent. It is not a request to change code now.

## High-Level Facts

- The tracked codebase is about 9,240 lines across Python, TypeScript/React, firmware, existing docs, and scripts.
- The current architecture is browser -> FastAPI -> raw TCP line protocol -> Arduino firmware -> CNC Shield pins.
- The frontend development port is `9999`.
- The backend default port is `8000`.
- The firmware line server port is `81`.
- The backend SVG engine is custom `svgpathtools` code.
- The firmware stepper engine is direct GPIO stepping, not a stepper library.
- No automated tests or CI workflows are tracked.

## Likely Foundations To Preserve Carefully

These are current behaviors that other layers already depend on:

| Foundation | Why it matters |
| --- | --- |
| Bottom-left plotter coordinate system | Frontend preview, backend Y flip, generated G-code, and firmware position model all assume it. |
| `426 x 599` mm bed maxima | Duplicated in frontend, backend, firmware, and local profile. |
| `greedy_flip` as default path order | Default in frontend and backend request models. |
| Shared placement settings for preview and plot | Start plot passes the same alignment/scale/artboard values used for preview. |
| Line-oriented `ok` protocol | Backend progress and flow control depend on firmware acknowledgements. |
| Dual Y synchronized pulses | Firmware drives Y and Y2 together for gantry movement. |
| Soft-limit clamp model | UI settings and firmware config commands assume clamped software bounds, not hardware limit switches. |
| Servo pen commands `M3`/`M5` | Backend-generated G-code and manual UI controls use these commands. |

## Current Documentation Mismatches

| Existing claim | Current source status |
| --- | --- |
| README says frontend runs at `localhost:3000`. | Vite config and `dev.sh` use `9999`. |
| README and original planning notes mention `vpype` or `vpype-gcode`. | Backend uses `svgpathtools` and custom G-code generation. |
| README and original planning notes mention MobaTools stepper control. | Firmware uses direct `digitalWrite()` step/dir pulses and `Servo`. |
| Some source comments and older wording call the Arduino transport WebSocket. | Firmware uses raw `WiFiServer`/`WiFiClient`; backend uses `asyncio.open_connection`. |
| README G-code table lists only basic commands. | Firmware also supports `G2`, `G3`, `G5`, `G6`, `G92`, `$LIMITS`, `$STEPS`, `$EASING`, `$SOFTLIMITS`, `RESET`, `TEST`, and `TESTY`. |

## Security And Safety Observations

- Firmware currently contains hardcoded local Wi-Fi credentials. These docs do not repeat the values.
- Backend CORS allows all origins.
- `POST /api/upload` saves the supplied filename directly under `upload_dir`.
- Set-home intentionally disables soft limits while the modal is open.
- Firmware soft limits clamp coordinates; there is no hardware limit switch handling.
- `TEST` and `TESTY` directly pulse motors and bypass normal higher-level motion commands.

## Motion And Control Observations

| Area | Current behavior |
| --- | --- |
| Pause/stop during long moves | Stop hooks exist, but `stepXY()` does not currently poll them inside the stepping loop. |
| Rapid speed | Backend emits `F` on `G0`, but firmware `rapidMove()` uses internal `rapidSpeed`. |
| Draw speed | Backend emits profile draw speed, firmware clamps move feed rates above `5000` mm/min. |
| Frontend speed settings | Backend saves rapid/draw speeds and sends only `$EASING` to firmware when connected. |
| Firmware homing | `G28` returns to logical `(0, 0)`; no switch probing. |
| Position tracking | Open-loop from actual steps commanded; no encoder feedback. |
| Progress tracking | Backend progress is based on lines sent/acknowledged, not true physical motion completion time. |

## SVG Processing Observations

- Preview and G-code generation share much of the placement logic but are not identical: preview is point-based, while plotting can emit `G2/G3/G5/G6`.
- Filled paths are considered plottable; white fill-only shapes are filtered as likely backgrounds.
- `detect_circle()` currently does not detect non-empty circles.
- `detect_ellipse()` can emit `G6` for axis-aligned cubic-Bezier ellipses.
- Biarc fitting helpers exist but current cubic output preserves Beziers as `G5`.
- Arc output has conservative fallbacks for very large, off-bed, degenerate, or long-duration arcs.

## Frontend Observations

- The UI is a real control dashboard with no landing page.
- Design tokens live in `frontend/src/index.css`.
- Sidebar panel order persists to `localStorage`.
- WebSocket close/error events are logged but not shown as the main error banner.
- There is no reconnect strategy for the browser WebSocket.
- Timeline preview advances by path index, not by distance or actual G-code execution.

## Backend Observations

- `ArduinoBridge._parse_status()` is a no-op.
- `send_command()` captures the first response after sending a command. This is simple and useful for single commands, but it can be sensitive to concurrent messages.
- `JSONResponse`, `asyncio`, and `json` are imported in `main.py`; not all are used by current code.
- `websockets` and `aiofiles` are dependencies but not central in current source.
- Runtime paths are relative to process working directory.

## Firmware Observations

- `WiFiHandler` has a 16-line buffer, but backend also streams up to 8 lines ahead. Both flow-control systems coexist.
- Firmware disables Wi-Fi timeout around movement commands because motion is blocking.
- `motion.update()` is present but intentionally empty.
- Z motion commands are logically parsed, but physical Z stepping is not used because Z shield pins are assigned to Y2 and pen lift is a servo.
- `isRunning` is reported in status but is not set to true during normal plot execution in current firmware.

## Improvement Candidates For Later

These are areas worth evaluating after status-quo documentation is accepted:

1. Remove hardcoded Wi-Fi credentials from firmware.
2. Rename or rework Arduino transport docs/comments to distinguish raw TCP from WebSocket.
3. Decide whether the intended stepper backend is direct GPIO or a library such as MobaTools, then align docs and code.
4. Wire stop/pause polling into the stepping loop if in-motion emergency handling is required.
5. Align frontend/backend/firmware speed settings so UI sliders affect actual firmware rapid and feed behavior.
6. Add tests for SVG processing fixtures, especially scaling, Y flip, optimization order, and G-code command generation.
7. Add parser/motion simulator tests for firmware command handling.
8. Add a real ESLint config or adjust/remove the lint script.
9. Sanitize uploaded filenames and consider unique storage names.
10. Tighten CORS for non-local deployments.
11. Clarify whether ignored local `profiles.json` should ever become a checked-in example profile.
12. Update the top-level README after the `/docs` baseline is accepted.
