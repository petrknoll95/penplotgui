# Development And Runbook

This document records how to run and reason about the current repository.

## Observed Local Tool Versions

These versions were observed during this documentation pass:

```text
Python 3.14.2
Node v22.20.0
npm 11.6.2
```

The repository does not currently pin Python or Node versions.

## Backend Setup

From a clean checkout:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Run:

```bash
cd backend
source venv/bin/activate
python main.py
```

Equivalent uvicorn command:

```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend defaults to `0.0.0.0:8000`.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on:

```text
http://localhost:9999
```

It proxies `/api` to `http://localhost:8000`.

## Combined Dev Script

[`dev.sh`](../dev.sh) starts both layers:

```bash
./dev.sh
```

It assumes:

- Backend virtualenv exists at `backend/venv`.
- Backend can be started with `python main.py`.
- Frontend dependencies are installed.

It prints:

```text
Backend:  http://localhost:8000
Frontend: http://localhost:9999
```

## Firmware Setup

Open [`firmware/penplotter/penplotter.ino`](../firmware/penplotter/penplotter.ino) in the Arduino IDE or compatible Arduino CLI setup for Arduino UNO R4 WiFi.

Current firmware includes:

- `WiFiS3.h`
- `Servo.h`
- Local headers in the same sketch folder

The current source contains local Wi-Fi credentials. Do not copy those values into shared docs, issue comments, or examples. Replace them with local placeholder values before sharing firmware externally.

The firmware listens on TCP port `81` when Wi-Fi starts successfully and also accepts serial commands at `115200`.

## Environment Configuration

Backend settings use `PLOTTER_` env vars. Common examples:

```bash
export PLOTTER_ARDUINO_HOST=192.168.1.46
export PLOTTER_ARDUINO_PORT=81
export PLOTTER_UPLOAD_DIR=uploads
export PLOTTER_PROFILES_FILE=profiles.json
```

Because defaults are relative paths, run the backend from `backend/` if you expect runtime files under `backend/uploads/` and `backend/profiles.json`.

## Runtime Files

Ignored by `.gitignore`:

| Path | Role |
| --- | --- |
| `backend/uploads/` | Uploaded SVG files. |
| `backend/profiles.json` | Active local profile store. |
| `backend/venv/` | Backend virtualenv. |
| `backend/__pycache__/` | Python bytecode cache. |
| `frontend/node_modules/` | Frontend dependencies. |
| `frontend/dist/` | Frontend build output. |

Tracked lock files:

- Root [`package-lock.json`](../package-lock.json) is effectively empty.
- [`backend/package-lock.json`](../backend/package-lock.json) is effectively empty.
- [`frontend/package-lock.json`](../frontend/package-lock.json) contains the real frontend npm dependency tree.

## Frontend Commands

From [`frontend/package.json`](../frontend/package.json):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server. |
| `npm run build` | Run TypeScript check and Vite production build. |
| `npm run preview` | Serve built frontend. |
| `npm run lint` | Run ESLint over TS/TSX files. |

No ESLint configuration file was found in tracked files during this audit.

## Backend Commands

There is no tracked test, lint, format, or type-check command for the backend. Manual smoke checks:

```bash
curl http://localhost:8000/api/health
```

Upload smoke check requires a running backend and a real SVG:

```bash
curl -F "file=@../canvas.svg" http://localhost:8000/api/upload
```

Plotter control checks require reachable firmware at `PLOTTER_ARDUINO_HOST:PLOTTER_ARDUINO_PORT`.

## Firmware Smoke Commands

Over serial or the TCP line connection:

```text
STATUS
M114
G90
G92 X0 Y0
M5
M3
G1 X10 Y0 F500
G1 X0 Y0 F500
```

Use low feed rates for first physical tests.

Special direct motor tests:

```text
TEST
TESTY
```

These directly pulse pins and should only be used when the machine is safe to move.

## No Automated Tests

No tests are tracked for:

- Backend SVG geometry.
- API request/response behavior.
- Arduino bridge flow control.
- Frontend rendering or interactions.
- Firmware parser/motion logic.

This matters because several important behaviors are geometry- and hardware-sensitive. A future test suite should probably start with backend SVG fixtures and firmware parser/motion unit tests or simulator-style tests.

## Documentation Maintenance Rules

When implementation changes, update these docs alongside code:

- API request/response changes: [backend-api.md](backend-api.md).
- SVG conversion behavior: [svg-processing.md](svg-processing.md).
- UI behavior or styling tokens: [frontend.md](frontend.md).
- Firmware commands, pin maps, or motion behavior: [firmware.md](firmware.md) and [hardware-motion.md](hardware-motion.md).
- Operational commands or prerequisites: this file.
