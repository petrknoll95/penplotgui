# Pen Plotter Development Strategy

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   React + TypeScript Frontend                   │
│  SVG Upload │ Path Preview │ Plotter Control │ Configuration   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ REST API + WebSocket
┌─────────────────────────▼───────────────────────────────────────┐
│                    FastAPI Backend (Python)                     │
│  vpype SVG→G-code │ WebSocket Bridge │ Profile Management       │
└─────────────────────────┬───────────────────────────────────────┘
                          │ WebSocket (ok-based flow control)
┌─────────────────────────▼───────────────────────────────────────┐
│                    Arduino R4 WiFi Firmware                     │
│  G-code Parser │ Bresenham Motion Planner │ MobaTools Steppers │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | React 18+ | Large ecosystem, component model |
| Language | TypeScript | Type safety, better DX |
| Styling | Tailwind CSS | Rapid UI development |
| Build | Vite | Fast dev server, modern bundling |
| State | React Context + hooks | Simple state, no Redux needed |

### Backend
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | FastAPI | Async, WebSocket support, Python ecosystem |
| SVG Processing | vpype + vpype-gcode | Battle-tested plotter toolchain |
| WebSocket | websockets library | Arduino communication |
| Server | uvicorn | ASGI server for FastAPI |

### Firmware
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Platform | Arduino R4 WiFi | Target hardware |
| Stepper Control | MobaTools v2.6.2+ | Confirmed R4 support, acceleration |
| WebSocket | Web Server for Arduino Uno R4 WiFi | Official library |
| Motion Planning | Custom Bresenham | Required for coordinated X+Y |

---

## Layer 1: Arduino Firmware

### G-Code Subset
Minimal commands needed for pen plotting:

| Command | Function | Example |
|---------|----------|---------|
| G0 | Rapid move (pen up travel) | `G0 X50 Y30` |
| G1 | Linear interpolated move | `G1 X100 Y100 F1000` |
| G28 | Home all axes | `G28` |
| G90 | Absolute positioning | `G90` |
| G91 | Relative positioning | `G91` |
| G21 | Set units to mm | `G21` |
| M3 | Pen down (Z to drawing height) | `M3` |
| M5 | Pen up (Z to travel height) | `M5` |
| M114 | Report position | `M114` |

### Motion Control Architecture

```
G-code Line
    │
    ▼
┌─────────────────┐
│  G-code Parser  │ Extract command + parameters
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Motion Planner  │ Bresenham interpolation for G1
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   MobaTools     │ Stepper pulse generation + acceleration
└────────┬────────┘
         │
         ▼
    Step Pulses → CNC Shield → Motors
```

### Bresenham Line Algorithm
For coordinated X+Y movement (diagonal lines):

```cpp
void bresenhamLine(long x0, long y0, long x1, long y1) {
    long dx = abs(x1 - x0);
    long dy = abs(y1 - y0);
    int sx = x0 < x1 ? 1 : -1;
    int sy = y0 < y1 ? 1 : -1;
    long err = dx - dy;

    while (true) {
        // Step both motors based on error accumulator
        long e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            stepMotorX(sx);  // Step X
        }
        if (e2 < dx) {
            err += dx;
            stepMotorY(sy);  // Step Y
        }
        if (x0 == x1 && y0 == y1) break;
    }
}
```

### Memory Budget (32KB SRAM)

| Component | Allocation | Notes |
|-----------|------------|-------|
| Line buffer | 1,536 bytes | 16 lines × 96 bytes circular buffer |
| Parser state | 256 bytes | Current command, parameters |
| Motion buffer | 64 bytes | Current/target positions |
| WebSocket state | 256 bytes | Connection management |
| Stack/heap | 4,096 bytes | Function calls, locals |
| **Subtotal** | ~6 KB | Leaves ~18KB for WiFi/system |

### Communication Protocol

```
Client → Arduino: "G1 X10.5 Y20.3 F1000\n"
Arduino (queues command, executes)
Arduino → Client: "ok\n"

Client → Arduino: "G0 X0 Y0\n"
Arduino → Client: "ok\n"

On error:
Arduino → Client: "error:20\n"  (error code)
```

Flow control: Client sends next line only after receiving `ok`.

---

## Layer 2: Python Backend

### vpype Integration

```python
from vpype import read, linemerge, linesort, reloop, linesimplify
from vpype_gcode import GWriter

def svg_to_gcode(svg_path: str, profile: dict) -> str:
    # Read and optimize
    doc = read(svg_path)
    doc = linemerge(doc)           # Join adjacent segments
    doc = linesimplify(doc, 0.1)   # Reduce points (0.1mm tolerance)
    doc = linesort(doc)            # Minimize pen-up travel

    # Generate G-code
    writer = GWriter(profile=profile)
    return writer.write(doc)
```

### Default Plotter Profile

```python
PLOTTER_PROFILE = {
    "unit": "mm",
    "invert_y": True,           # Depends on mechanical setup
    "header": "G21 G90\nG28\n", # mm mode, absolute, home
    "move": "M5\nG0 X{x:.3f} Y{y:.3f}\n",      # Pen up, rapid move
    "line": "M3\nG1 X{x:.3f} Y{y:.3f} F{f}\n", # Pen down, draw
    "postblock": "",
    "footer": "M5\nG0 X0 Y0\nM2\n"  # Pen up, home, end
}
```

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/upload` | Upload SVG file |
| POST | `/api/convert` | Convert SVG → G-code |
| GET | `/api/preview` | Get path data for visualization |
| WS | `/api/plotter` | Real-time plotter control |
| GET | `/api/config` | Get plotter configuration |
| PUT | `/api/config` | Update plotter configuration |
| POST | `/api/connect` | Connect to Arduino |
| POST | `/api/disconnect` | Disconnect from Arduino |

### WebSocket Bridge Architecture

```
Frontend                Backend                 Arduino
   │                       │                       │
   │◄─── WS connection ───►│                       │
   │                       │◄─── WS connection ───►│
   │                       │                       │
   │  "start"             │                       │
   │─────────────────────►│  "G21 G90\n"          │
   │                       │──────────────────────►│
   │                       │  "ok\n"               │
   │                       │◄──────────────────────│
   │                       │  "G0 X10 Y10\n"       │
   │                       │──────────────────────►│
   │  {"progress": 5%}     │                       │
   │◄──────────────────────│                       │
   │                       │  "ok\n"               │
   │                       │◄──────────────────────│
   │         ...           │         ...           │
```

---

## Layer 3: React Frontend

### Core Components

```
App
├── Header
│   ├── ConnectionStatus
│   └── EmergencyStop
├── Main
│   ├── SVGUploader (drag-drop zone)
│   ├── PreviewCanvas
│   │   ├── SVG rendering
│   │   └── Toolpath overlay (pen-up dashed, pen-down solid)
│   ├── ControlPanel
│   │   ├── StartButton
│   │   ├── PauseButton
│   │   ├── StopButton
│   │   └── ProgressBar
│   └── JogControls
│       ├── X+/X- buttons
│       ├── Y+/Y- buttons
│       └── PenUp/PenDown buttons
└── ConfigPanel
    ├── BedSize (width × height mm)
    ├── FeedRates (rapid, drawing)
    ├── PenHeights (up, down)
    └── ProfileSelector
```

### State Management

```typescript
interface PlotterState {
  connection: 'disconnected' | 'connecting' | 'connected';
  status: 'idle' | 'plotting' | 'paused' | 'error';
  position: { x: number; y: number; z: number };
  progress: number;  // 0-100
  currentLine: number;
  totalLines: number;
}

interface ConfigState {
  bedWidth: number;   // mm
  bedHeight: number;  // mm
  rapidFeed: number;  // mm/min
  drawFeed: number;   // mm/min
  penUp: number;      // mm
  penDown: number;    // mm
}
```

---

## Development Phases

### Phase 1: Firmware Foundation
- MobaTools stepper control
- G-code parser (serial input)
- Bresenham motion planner
- **Deliverable:** Arduino responds to G-code via Serial Monitor

### Phase 2: WiFi Layer
- WebSocket server on Arduino
- Circular command buffer
- Flow control protocol
- **Deliverable:** Arduino responds to G-code via WebSocket

### Phase 3: Backend
- FastAPI project structure
- vpype SVG→G-code pipeline
- WebSocket bridge to Arduino
- **Deliverable:** Backend converts SVG and streams to Arduino

### Phase 4: Frontend
- React + TypeScript setup
- SVG upload and preview
- Plotter control UI
- Configuration panel
- **Deliverable:** Full UI workflow

### Phase 5: Integration
- End-to-end testing
- Error handling
- UI polish
- **Deliverable:** Production-ready system

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bresenham timing at high speeds | Jerky motion | Start slow (F500), tune acceleration |
| WiFi latency causes stuttering | Uneven lines | Lookahead buffer, pause on underrun |
| 32KB SRAM overflow | Crashes | Fixed buffers, no malloc in loop |
| Large SVG overwhelms vpype | Timeout | Limit segments, simplify first |
| Connection drops mid-plot | Ruined print | E-stop, state recovery, resume support |

---

## Success Criteria

1. **Upload any SVG** → see preview with optimized toolpath
2. **Click Start** → plotter draws the image wirelessly
3. **Pause/Resume** → plotter stops and continues accurately
4. **Emergency Stop** → immediate halt from any state
5. **Configuration** → saved profiles for different pen/paper combos
