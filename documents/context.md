# Custom Pen Plotter System: Arduino R4 WiFi — Research Findings

## Executive Summary

The Arduino UNO R4 WiFi, built around the Renesas RA4M1 (ARM Cortex-M4, 48 MHz), is incompatible with standard GRBL firmware (designed for 8-bit ATmega328P) and currently unsupported by grblHAL. Building a custom application is the correct approach. The system breaks into three layers: **SVG-to-G-code conversion** (host-side), **G-code streaming** (host-to-Arduino communication), and **motion control firmware** (Arduino-side). Multiple proven libraries and tools exist for each layer, and the R4 WiFi's built-in WiFi opens up wireless streaming as a compelling option.

---

## Layer 1: SVG to G-Code Conversion

This runs on the host computer (laptop/desktop), converting vector graphics into machine-ready G-code. There are three viable approaches.

### Option A: vpype + vpype-gcode (Python) — Recommended

**vpype** is the most mature pen-plotter-focused toolchain. It provides a pipeline-based architecture where SVG reading, path optimization, and G-code output are chained commands:

```
vpype read input.svg linemerge linesort reloop linesimplify gwrite --profile my_plotter output.gcode
```

Key capabilities:
- Read SVGs with color/layer preservation
- `linemerge` — joins path segments that share endpoints
- `linesort` — greedy nearest-neighbor reordering to minimize pen-up travel
- `reloop` — optimizes closed path starting points
- `linesimplify` — reduces point count while preserving shape

The **vpype-gcode** plugin generates fully customizable output via TOML profile files. A profile defines header/footer, pen-up/pen-down sequences, move/line format strings, and axis inversion — all configurable without code changes:

```toml
[gwrite.my_plotter]
unit = "mm"
invert_y = true
header = "G21 G90\n"
move = "G0 Z5\nG0 X%.4f Y%.4f\nG1 Z0 F500\n"
line = "G1 X%.4f Y%.4f F1000\n"
postblock = "G0 Z5\n"
footer = "G0 X0 Y0\nM2\n"
```

**Pros:** Battle-tested in the plotter community, excellent path optimization, extensible via Python plugins, active development.
**Cons:** Python dependency, command-line oriented (though scriptable).

### Option B: sameer/svg2gcode (Rust/WebAssembly)

A standalone converter with both a CLI and a **browser-based web interface** at sameer.github.io/svg2gcode. Features include configurable tool on/off G-code sequences, curve interpolation tolerance, optional G2/G3 circular interpolation, and custom begin/end sequences.

**Pros:** Web UI requires zero installation, fast (Rust/WASM), configurable per-machine.
**Cons:** No built-in path optimization (travel minimization), less plotter-ecosystem integration than vpype.

### Option C: Custom JavaScript Pipeline

For a fully custom web application, a JavaScript stack can be built from:

- **flatten-svg** — converts all SVG shapes (circles, rects, paths) into arrays of line-segment points
- **optimize-paths** — reorders, merges, and filters polylines for minimal pen-up travel
- Custom G-code emitter — straightforward string generation from coordinate arrays

This approach makes sense if building an integrated web app that also handles streaming (see WiFi streaming below).

### Path Optimization Impact

Path ordering dramatically affects plot time. Research on optimization approaches:

| Method | Travel Distance | vs. Unoptimized |
|--------|----------------|-----------------|
| No optimization | ~21,530 units | baseline |
| Greedy nearest-neighbor | ~1,304 units | 6.1% of baseline |
| Greedy + line flipping | ~913 units | 4.2% of baseline |
| TSP solver | even lower | best possible |

For practical use, greedy + line flipping (what vpype's `linesort` does) delivers excellent results with fast computation.

---

## Layer 2: G-Code Streaming (Host → Arduino)

### Option A: Serial USB Streaming

The standard approach used by GRBL and all major CNC senders. The protocol is simple:

1. Send one G-code line (terminated with `\n`)
2. Wait for `ok\n` response
3. Send next line
4. On `error`, handle or abort

A Python sender is straightforward using `pyserial`. More advanced implementations use **buffer-counting flow control**: track how many bytes have been sent but not acknowledged, and keep the Arduino's serial buffer mostly full for smooth motion without pauses between lines.

**Pros:** Universal, reliable, works with any serial terminal or custom sender.
**Cons:** Tethered to USB cable.

### Option B: WiFi WebSocket Streaming

The R4 WiFi supports WebSocket servers natively, enabling real-time bidirectional communication from any browser. A WebSocket-based architecture could:

- Serve a web UI directly from the Arduino (or from a companion web app)
- Stream G-code lines over WebSocket with the same `ok`-based flow control
- Enable wireless plotting from any device on the local network

The **Web Server for Arduino Uno R4 WiFi** library provides integrated HTTP + WebSocket server support. A reference project on ESP32 demonstrates this exact architecture in ~500 lines: web UI → G-code generation → WebSocket streaming → motor control.

**Pros:** Wireless, control from phone/tablet/laptop, modern UX potential.
**Cons:** WiFi latency (~1-10ms) could cause micro-pauses if not buffered properly; more complex firmware.

### Option C: Hybrid — WiFi Upload, Serial Execute

Upload the complete G-code file to the Arduino over WiFi (stored in SRAM or streamed from ESP32's larger flash), then execute locally. This decouples network latency from motion execution. The ESP32-S3 on the R4 WiFi has its own memory and could act as a G-code buffer, feeding lines to the RA4M1 over their internal serial link.

---

## Layer 3: Arduino Firmware (Motion Control)

### Stepper Library Options

| Library | R4 WiFi Support | Steppers | Acceleration | Notes |
|---------|----------------|----------|--------------|-------|
| **MobaTools** | ✅ Confirmed | Up to 6 | Yes (trapezoidal) | WiFi example included; most feature-complete |
| **GPT_Stepper** | ✅ Native | Up to 7 | Yes | Uses RA4M1 hardware GPT timers for precise pulse generation |
| **AccelStepper** | ❌ Broken | — | — | Not compatible with RA4M1 |
| **Stepper.h** | ⚠️ Unreliable | — | No | Basic; reported issues on R4 |

**MobaTools** is the safest choice — it explicitly supports the RA4M1 (UNO R4), handles acceleration/deceleration, and even has a web-controlled stepper example for the R4 WiFi. It supports up to 6 steppers simultaneously, which covers the 4-motor configuration comfortably.

**GPT_Stepper** is a compelling alternative that leverages the RA4M1's hardware General Purpose Timers (GPT) to generate step pulses at the hardware level rather than through software interrupts. Each stepper uses a dedicated timer, and the library supports up to 7 steppers (one per GPT timer). The pin-to-timer mapping means careful pin selection is needed — two pins sharing a timer cannot both drive steppers.

### Coordinated Multi-Axis Motion

For a pen plotter, X and Y must move simultaneously to draw diagonal lines. The standard solution is **Bresenham's line algorithm**, which coordinates step pulses across axes so both arrive at the target simultaneously using only integer math.

The algorithm works by tracking an error accumulator for the shorter axis and stepping it when the error exceeds a threshold — the same technique used for pixel-based line drawing, applied to stepper motors. This is exactly what GRBL does internally, and implementing a basic version is straightforward.

For pen plotters running at reasonable speeds, full trapezoidal acceleration profiles are beneficial but not strictly required — simpler approaches like a brief ramp-up period or constant-speed operation at moderate feed rates work fine.

### G-Code Parser Requirements

The firmware needs only a minimal G-code subset for pen plotting:

- **G0** — Rapid move (pen up travel)
- **G1** — Linear interpolated move (pen down drawing)
- **G28** — Home axes
- **G90/G91** — Absolute/relative positioning
- **G21** — Set units to mm
- **M3/M5** or custom — Pen down/pen up (Z-axis movement)
- **M114** — Report position (optional, for debugging)

Parsing is simple string processing: read a line, extract the command letter and numeric parameters, execute the corresponding motion. Unsupported commands can be safely ignored.

### Dual-Y Motor Synchronization

With the CNC Shield V3, the A-axis can be hardware-jumpered to clone the Y-axis. This means both Y motors receive identical step and direction signals at the electrical level — the firmware only needs to command one Y axis, and both motors move in lockstep. This is the simplest and most reliable approach.

If software synchronization is preferred instead (e.g., for independent homing), MobaTools can drive both motors with matched parameters, but hardware cloning eliminates any risk of software-induced desynchronization.

---

## Recommended Architecture

### Architecture A: Python Host + Serial Firmware (Simpler)

```
[SVG File] → [vpype + vpype-gcode] → [.gcode file]
    → [Python serial sender] → USB → [Arduino R4 firmware]
        → CNC Shield → Stepper Drivers → Motors
```

**Firmware stack:** MobaTools (or GPT_Stepper) + custom G-code parser + Bresenham motion planner. The firmware receives G-code lines over Serial, parses them, plans the motion, and drives the steppers. This mirrors what GRBL does but in a simplified, purpose-built form.

### Architecture B: Web App + WiFi Firmware (More Capable)

```
[SVG File] → [Browser: flatten-svg + optimize-paths + G-code gen]
    → WebSocket → [Arduino R4 WiFi firmware]
        → CNC Shield → Stepper Drivers → Motors
```

**Firmware stack:** Same motion control core, but with WiFi AP/server + WebSocket handler. The web UI runs entirely in the browser, handling SVG parsing and G-code generation client-side. The Arduino receives G-code commands over WebSocket and executes them.

### Architecture C: Hybrid (Best of Both)

Build the firmware to accept G-code from **both** Serial USB and WiFi WebSocket. Use vpype for complex SVG optimization workflows, and the web UI for quick plots. This provides maximum flexibility without committing to a single workflow.

---

## Key Risks and Mitigations

- **Memory constraints (32 KB SRAM):** A line-by-line streaming protocol avoids needing to store the entire G-code file. Keep the command buffer small (8-16 lines).
- **WiFi latency causing stuttered motion:** Implement a lookahead buffer on the Arduino — buffer several G-code lines and only request more when the buffer drops below a threshold.
- **Stepper library conflicts with WiFi:** MobaTools v2.6.1+ includes a specific bugfix for stepper operation with WiFi active on the R4 WiFi.
- **CNC Shield pin conflicts:** The CNC Shield uses pins D0-D13 and A0-A5. WiFi operation on the R4 happens on the ESP32-S3, which uses a separate communication bus — no pin conflict.
- **Acceleration at higher speeds:** For complex drawings with many short segments, even basic acceleration ramps prevent missed steps. MobaTools handles this automatically.

---

## Useful Resources

| Resource | Type | URL |
|----------|------|-----|
| vpype | Path optimization CLI | github.com/abey79/vpype |
| vpype-gcode | G-code generation plugin | github.com/plottertools/vpype-gcode |
| sameer/svg2gcode | SVG→G-code (web + CLI) | sameer.github.io/svg2gcode |
| flatten-svg | JS SVG normalizer | npmjs.com/package/flatten-svg |
| optimize-paths | JS path reordering | github.com/nornagon/optimize-paths |
| MobaTools | R4-compatible stepper lib | github.com/MicroBahner/MobaTools |
| GPT_Stepper | R4 hardware timer steppers | github.com/delta-G/GPT_Stepper |
| ESP32 Pen Plotter | Reference WiFi plotter | hackaday.io/project/204593 |
| Bresenham's for CNC | Motion planning tutorial | marginallyclever.com/2020/07/moving-your-cnc-with-bresenhams-algorithm |
| svgpathtools | Python SVG path parsing | pypi.org/project/svgpathtools |
