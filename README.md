# Pen Plotter Control System

A web-based pen plotter control system with three components:
- **React Frontend** - SVG upload, path visualization, real-time plotter control
- **Python Backend (FastAPI)** - vpype-based SVG→G-code conversion, WebSocket bridge
- **Arduino R4 WiFi Firmware** - G-code parser, Bresenham motion planner, stepper control

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   React + TypeScript Frontend                   │
│  SVG Upload │ Path Preview │ Plotter Control │ Configuration   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ REST + WebSocket
┌─────────────────────────▼───────────────────────────────────────┐
│                    FastAPI Backend (Python)                     │
│  vpype integration │ WebSocket bridge │ Profile management      │
└─────────────────────────┬───────────────────────────────────────┘
                          │ TCP Socket (ok-based flow control)
┌─────────────────────────▼───────────────────────────────────────┐
│                    Arduino R4 WiFi Firmware                     │
│  G-code Parser │ Bresenham Interpolation │ MobaTools Steppers  │
└─────────────────────────────────────────────────────────────────┘
```

## Hardware Requirements

- Arduino Uno R4 WiFi
- CNC Shield v3
- NEMA 17 stepper motors (X, Y axes)
- Servo or small stepper for Z (pen lift)

## Setup

### 1. Arduino Firmware

1. Install the Arduino IDE and add support for Arduino R4 WiFi
2. Install the MobaTools library (v2.6.2+) via Library Manager
3. Open `firmware/penplotter/penplotter.ino`
4. Update WiFi credentials:
   ```cpp
   const char* WIFI_SSID = "YOUR_WIFI_SSID";
   const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
   ```
5. Upload to your Arduino R4 WiFi
6. Note the IP address printed to Serial Monitor

### 2. Python Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Update `config.py` with your Arduino's IP address:
```python
arduino_host: str = "192.168.1.100"  # Your Arduino's IP
```

Run the backend:
```bash
python main.py
```

Or with uvicorn:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. React Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at http://localhost:3000

## Usage

1. Open http://localhost:3000 in your browser
2. Click "Connect" to connect to the plotter
3. Upload an SVG file using drag-drop or file picker
4. Preview the paths (blue = drawing paths, dashed gray = travel moves)
5. Click "Start Plot" to begin plotting

## G-code Commands

The firmware supports the following G-code subset:

| Command | Description |
|---------|-------------|
| G0 | Rapid move |
| G1 | Linear interpolated move |
| G28 | Home axes |
| G90 | Absolute positioning |
| G91 | Relative positioning |
| M3 | Pen down |
| M5 | Pen up |
| M114 | Report position |

Special commands:
- `!` or `STOP` - Emergency stop
- `PAUSE` - Pause plotting
- `~` or `RESUME` - Resume plotting
- `STATUS` - Report status

## Configuration

Plotter profiles can be configured via the API:

```json
{
  "name": "default",
  "bed_width": 200.0,
  "bed_height": 200.0,
  "rapid_feed_rate": 3000.0,
  "draw_feed_rate": 1000.0,
  "pen_up_height": 5.0,
  "pen_down_height": 0.0,
  "steps_per_mm_x": 80.0,
  "steps_per_mm_y": 80.0,
  "steps_per_mm_z": 400.0
}
```

## CNC Shield Pin Mapping

| Function | Pin |
|----------|-----|
| X Step | D2 |
| X Dir | D5 |
| Y Step | D3 |
| Y Dir | D6 |
| Z Step | D4 |
| Z Dir | D7 |
| Enable | D8 |

## Troubleshooting

**Arduino won't connect to WiFi:**
- Check credentials in the firmware
- Ensure your WiFi is 2.4GHz (R4 WiFi doesn't support 5GHz)
- Check Serial Monitor for connection status

**Motors don't move:**
- Check CNC Shield is properly seated
- Verify Enable pin (D8) is set LOW
- Check stepper driver modules are installed correctly

**Backend can't connect to Arduino:**
- Verify Arduino IP address in backend config
- Ensure Arduino and backend are on the same network
- Check that port 81 is not blocked by firewall
