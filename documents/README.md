# Penplotgui Repository Documentation

This folder documents the current repository as observed in source. It is intended as a status-quo baseline, not a proposal for how the project should work later.

## Document Map

| Document | Scope |
| --- | --- |
| [architecture.md](architecture.md) | System boundaries, runtime flow, state, persistence, and integration points. |
| [frontend.md](frontend.md) | React UI structure, state model, controls, API usage, and design system. |
| [backend-api.md](backend-api.md) | FastAPI app, request models, endpoints, profiles, settings, and Arduino bridge. |
| [svg-processing.md](svg-processing.md) | SVG parsing, preview generation, scaling, optimization, and G-code generation. |
| [firmware.md](firmware.md) | Arduino firmware files, command parser, Wi-Fi transport, and firmware command set. |
| [hardware-motion.md](hardware-motion.md) | Hardware mapping, coordinate system, stepper control, soft limits, and motion behavior. |
| [development.md](development.md) | Local setup, run commands, generated files, and verification notes. |
| [status-quo-audit.md](status-quo-audit.md) | Current facts, likely foundations, inconsistencies, risks, and improvement candidates. |
| [device.md](device.md) | Concise hardware setup and firmware pin map. |
| [strategy.md](strategy.md) | Current implementation strategy and near-term decision points. |
| [context.md](context.md) | Historical research context and how the current implementation diverged from it. |

## Repository Snapshot

`penplotgui` is a three-layer pen plotter control system:

1. A Vite/React/TypeScript frontend in [`frontend/`](../frontend) provides SVG upload, preview, positioning, path optimization selection, header plot actions, manual jogging, a settings dialog, and a timeline scrubber.
2. A FastAPI backend in [`backend/`](../backend) receives SVG files, uses `svgpathtools` and custom geometry logic to produce preview paths and G-code, persists plotter profiles, and streams commands to the plotter.
3. Arduino UNO R4 WiFi firmware in [`firmware/penplotter/`](../firmware/penplotter) parses a compact G-code dialect and directly drives CNC Shield pins for X/Y motion plus a servo pen lift.

The current source is not exactly the same as the original planning direction. The reconciled notes in [context.md](context.md), [strategy.md](strategy.md), and [status-quo-audit.md](status-quo-audit.md) call out the important deltas: the backend uses custom `svgpathtools` processing rather than `vpype`, the firmware uses direct GPIO stepping rather than MobaTools, and the backend-to-Arduino transport is newline-delimited TCP rather than a true WebSocket.

## Key Runtime Ports

| Layer | Default |
| --- | --- |
| Frontend dev server | `http://localhost:9999` from [`frontend/vite.config.ts`](../frontend/vite.config.ts) and [`dev.sh`](../dev.sh) |
| Backend API | `http://localhost:8000` from [`backend/config.py`](../backend/config.py) |
| Arduino line server | TCP port `81` from [`backend/config.py`](../backend/config.py) and [`firmware/penplotter/penplotter.ino`](../firmware/penplotter/penplotter.ino) |

## Source And Runtime Artifacts

Tracked source includes:

- Top-level docs and samples: [`README.md`](../README.md), this `documents/` folder, [`canvas.svg`](../canvas.svg), [`calibration.svg`](../calibration.svg), [`dev.sh`](../dev.sh).
- Backend source: [`backend/main.py`](../backend/main.py), [`backend/config.py`](../backend/config.py), [`backend/svg_processor.py`](../backend/svg_processor.py), [`backend/arduino_bridge.py`](../backend/arduino_bridge.py), [`backend/requirements.txt`](../backend/requirements.txt).
- Frontend source: [`frontend/src/`](../frontend/src), [`frontend/package.json`](../frontend/package.json), [`frontend/vite.config.ts`](../frontend/vite.config.ts).
- Firmware source: [`firmware/penplotter/`](../firmware/penplotter).

Ignored but present in the working tree during this audit:

- `backend/uploads/` with uploaded SVGs.
- `backend/profiles.json` with the active local profile.
- `backend/venv/` and `backend/__pycache__/`.
- `frontend/node_modules/` and `frontend/dist/`.

The firmware currently contains hardcoded local Wi-Fi credentials. Those values are intentionally not copied into these docs.

## Baseline Defaults

| Setting | Current value |
| --- | --- |
| Max bed width | `426.0` mm |
| Max bed height | `599.0` mm |
| Backend default rapid feed | `8000.0` mm/min in `PlotterProfile` |
| Backend default draw feed | `6000.0` mm/min in `PlotterProfile` |
| Firmware default rapid speed | `3000` mm/min |
| Firmware default feed speed | `1000` mm/min |
| Firmware max G1/G2/G3/G5/G6 feed | `5000` mm/min |
| Default steps/mm | `53.3` X, `53.3` Y, `400.0` Z |
| Default artboard | `360 x 480` mm, enabled in frontend state |
| Default path optimization | `greedy_flip` |

## Current Verification Coverage

No test suite or CI workflow is tracked in this repository. The frontend has `npm run build`, `npm run dev`, `npm run preview`, and `npm run lint` scripts. The backend has dependency requirements but no test command. The firmware is intended for Arduino IDE/toolchain verification.

See [development.md](development.md) for setup and [status-quo-audit.md](status-quo-audit.md) for known gaps.
