# Pen Plotter Hardware Setup

This document is the concise hardware setup sheet for the current firmware. For deeper motion behavior, see [hardware-motion.md](hardware-motion.md).

## Components

| Qty | Component | Current role |
| --- | --- | --- |
| 1x | Arduino UNO R4 WiFi | Main controller and Wi-Fi line server. |
| 1x | CNC Shield V3-style shield | Step/dir breakout for stepper drivers. |
| 3x | Stepper driver channels | X, Y1, and Y2. The shield Z header is used as the second Y channel. |
| 1x | Servo | Pen lift on pin `D11`. |
| 3x | Stepper motors | One X motor and two synchronized Y motors in current firmware. |

The repository's older planning notes mentioned a four-stepper setup and other rail assignments. The current source of truth is [`firmware/penplotter/motion_planner.h`](../firmware/penplotter/motion_planner.h).

## Firmware Pin Map

| Function | Arduino pin | Notes |
| --- | --- | --- |
| X step | `D2` | X-axis step pulse. |
| X direction | `D5` | Direction is inverted in firmware. |
| Y1 step | `D3` | First Y motor step pulse. |
| Y1 direction | `D6` | Direction is inverted in firmware. |
| Y2 step | `D4` | Second Y motor, using the CNC Shield Z step pin. |
| Y2 direction | `D7` | Derived from Y direction and `Y2_DIR_INVERTED`. |
| Enable | `D8` | Active LOW; firmware writes LOW to enable drivers. |
| Pen servo | `D11` | Servo pen lift, noted as Z+ limit switch header in firmware comments. |

## Motion Configuration

| Setting | Current value |
| --- | --- |
| X steps/mm | `53.3` |
| Y steps/mm | `53.3` |
| Z steps/mm | `400.0` logical only; physical Z stepping is not used by current firmware. |
| Max soft-limit width | `426.0` mm |
| Max soft-limit height | `599.0` mm |
| Servo up angle | `90` degrees |
| Servo down angle | `45` degrees |

## Coordinate Model

- Plotter origin is logical `(0, 0)` at bottom left.
- X increases right.
- Y increases upward.
- `G28` returns to the current logical origin; it does not probe limit switches.
- `G92 X0 Y0` sets the current physical position as the logical home.
- Soft limits clamp requested positions when enabled.

## Technical Notes

### Arduino UNO R4 WiFi Compatibility

The Arduino UNO R4 WiFi is incompatible with standard GRBL firmware for classic 8-bit Uno boards, so this repository uses custom firmware.

### CNC Shield V3 Compatibility

The current firmware assumes CNC Shield-style step, direction, and enable pins. The shield Z channel is repurposed for the second Y motor, and pen lift is handled by a servo instead of Z stepper motion.

### Pin Current Constraint

The RA4M1 output current is limited compared with classic Uno boards. This is acceptable for stepper driver inputs on a CNC shield, but it should be considered before adding directly driven peripherals.
