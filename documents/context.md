# Research Context And Historical Notes

This file preserves the useful research context from the original planning notes while clearly separating it from the current implementation. For source-of-truth behavior, use [architecture.md](architecture.md), [svg-processing.md](svg-processing.md), [firmware.md](firmware.md), and [hardware-motion.md](hardware-motion.md).

## Why Custom Firmware Exists

The project targets Arduino UNO R4 WiFi hardware. Standard GRBL firmware was designed around classic 8-bit Arduino Uno boards, so this repository uses custom firmware for the R4 WiFi instead of treating GRBL as a drop-in base.

The system still follows the same broad plotter architecture:

```text
SVG artwork -> host-side processing -> line-oriented G-code stream -> firmware motion control -> motors and pen
```

## Original Research Options

The original research identified three SVG-to-G-code paths:

| Option | Why it was attractive | Current status |
| --- | --- | --- |
| `vpype` + `vpype-gcode` | Mature pen-plotter path optimization and configurable G-code profiles. | Not used in current source. |
| Rust/WASM `svg2gcode` tools | Fast conversion and browser-friendly deployment. | Not used in current source. |
| Custom processing pipeline | Full control inside this app's backend/frontend workflow. | Current backend uses this direction with `svgpathtools` and local geometry code. |

The original research also identified Wi-Fi streaming and serial streaming as viable communication models. Current source implements both serial input on firmware and a Wi-Fi TCP line server, with the backend using Wi-Fi TCP by default.

## Original Stepper Library Research

The original notes considered libraries such as MobaTools and GPT_Stepper because the UNO R4 WiFi differs from classic Uno boards. Current firmware does not use those libraries. It generates step/dir pulses directly in [`motion_planner.h`](../firmware/penplotter/motion_planner.h).

This is an important design fork for future work:

- Keep direct GPIO stepping if simplicity and exact local control are more valuable.
- Re-evaluate a stepper library if acceleration profiles, timer precision, or non-blocking motion become priorities.

## Current Implementation Snapshot

| Layer | Current implementation |
| --- | --- |
| SVG processing | Custom `SVGProcessor` with `svgpathtools`, `numpy`, point sampling, RDP simplification, greedy ordering, and G-code output. |
| Browser/backend protocol | REST endpoints under `/api` plus browser WebSocket `/api/ws` for status. |
| Backend/Arduino protocol | Raw newline-delimited TCP on port `81` with `ok`, `ready`, `ping`, and `pong` messages. |
| Firmware parser | Custom parser for `G0`, `G1`, `G2`, `G3`, `G5`, `G6`, `G28`, `G90`, `G91`, `G92`, `M3`, `M5`, `M114`, and config commands. |
| Motion | Blocking direct GPIO stepping with Bresenham-style X/Y coordination, dual Y pulses, soft-limit clamping, and servo pen lift. |

## Preserved Research Takeaways

These points remain useful even though the implementation changed:

- Path ordering has a large effect on plot duration, so `greedy_flip` remains an important default.
- Line-oriented ok/ack flow control is a good fit for small firmware buffers.
- Large SVGs can overwhelm conversion and firmware execution unless simplified or segmented.
- Wi-Fi latency is less harmful when the sender and firmware have buffering and acknowledgements.
- R4 WiFi memory limits favor streaming commands rather than storing complete jobs on the board.

## Reconciliation Notes

The original planning language sometimes described `vpype`, MobaTools, and WebSockets as the chosen path. The current source has moved away from those choices. Future design work should decide whether to keep the current direct/custom approach or intentionally migrate back toward one of the researched tools.
