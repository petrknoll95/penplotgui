# Pen Plotter Control System

`penplotgui` is a local control system for a pen plotter. It combines a React operator dashboard, a FastAPI SVG/G-code backend, and Arduino UNO R4 WiFi firmware that drives CNC Shield step/dir pins and a servo pen lift.

The detailed status-quo documentation lives in [`documents/`](documents/). Start with [`documents/README.md`](documents/README.md) for the full document map.

## Architecture

```text
Browser operator UI
  -> React + TypeScript frontend on Vite
  -> FastAPI backend over /api and /api/ws
  -> Arduino bridge over raw newline-delimited TCP
  -> Arduino UNO R4 WiFi firmware
  -> CNC Shield steppers and pen servo
```

Current implementation facts:

- Frontend dev server: `http://localhost:9999`.
- Backend API: `http://localhost:8000`.
- Firmware line server: TCP port `81`.
- SVG processing: custom `svgpathtools`/NumPy pipeline in [`backend/svg_processor.py`](backend/svg_processor.py).
- Firmware motion: direct GPIO step/dir pulses in [`firmware/penplotter/`](firmware/penplotter), plus `Servo` for pen up/down.

## User Interface

The frontend is the working tool, not a landing page:

- Header: live X/Y/Z readouts, status-aware `Connect`/`Disconnect` button with tooltip, `Test`, `Start Plot`, and settings dialog trigger.
- Left sidebar: SVG upload, artboard/position/scale controls, and path optimization.
- Main canvas: bed/artboard/path preview with timeline scrubber.
- Right sidebar: manual jog controls, pen up/down, stop/reset, home all axes, and set-home workflow.
- Settings dialog: bed soft limits, rapid/draw speeds, and easing.

## Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

The backend reads `PLOTTER_` environment variables. Common examples:

```bash
export PLOTTER_ARDUINO_HOST=192.168.1.46
export PLOTTER_ARDUINO_PORT=81
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:9999`.

### Combined Dev Script

```bash
./dev.sh
```

This expects `backend/venv` and `frontend/node_modules` to already exist.

### Firmware

Open [`firmware/penplotter/penplotter.ino`](firmware/penplotter/penplotter.ino) in the Arduino IDE or an equivalent Arduino CLI setup for Arduino UNO R4 WiFi.

The firmware uses `WiFiS3.h`, `Servo.h`, and local sketch headers. It currently contains local Wi-Fi credentials in source; replace those with your own local values before flashing or sharing firmware externally.

## Common Workflow

1. Start the backend and frontend.
2. Flash/start the Arduino firmware and confirm its IP address.
3. Open `http://localhost:9999`.
4. Connect to the plotter from the header.
5. Upload an SVG.
6. Choose artboard, alignment, scale, and optimization settings.
7. Use preview and timeline scrubber to inspect paths.
8. Run `Test` or `Start Plot`.

## Documentation

| Document | Purpose |
| --- | --- |
| [`documents/architecture.md`](documents/architecture.md) | Runtime layers, flows, state, and protocol boundaries. |
| [`documents/frontend.md`](documents/frontend.md) | React UI structure, state model, components, persistence, and design system. |
| [`documents/backend-api.md`](documents/backend-api.md) | FastAPI endpoints, request models, profiles, settings, and bridge behavior. |
| [`documents/svg-processing.md`](documents/svg-processing.md) | SVG parsing, placement, optimization, and G-code generation. |
| [`documents/firmware.md`](documents/firmware.md) | Firmware structure, parser, command set, and Wi-Fi/serial transport. |
| [`documents/hardware-motion.md`](documents/hardware-motion.md) | Pin map, coordinate model, stepper control, soft limits, and motion behavior. |
| [`documents/development.md`](documents/development.md) | Local setup, commands, runtime files, and verification notes. |
| [`documents/status-quo-audit.md`](documents/status-quo-audit.md) | Current foundations, risks, mismatches, and improvement candidates. |

## Verification

No automated test suite or CI workflow is currently tracked. The main lightweight frontend check is:

```bash
cd frontend
npm run build
```

Backend and firmware verification are currently manual; see [`documents/development.md`](documents/development.md).
