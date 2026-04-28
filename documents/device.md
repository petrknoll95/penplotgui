# Pen Plotter Hardware Setup

This document serves as the source of truth for the pen plotter hardware configuration.

## Components

| Qty | Component | Description |
|-----|-----------|-------------|
| 1x | Arduino UNO R4 WiFi | Renesas RA4M1 (ARM Cortex-M4, 48 MHz) |
| 4x | NEMA 17 Motors | Stepper motors |
| 4x | A4988 Drivers | Stepper motor drivers |
| 1x | CNC Shield V3.00 | Motor driver shield |

## Motor Rail Configuration

| Motor | Axis | Shield Connection | Function |
|-------|------|-------------------|----------|
| Motor 1 | X | X | X-axis movement |
| Motor 2 | X | A | X-axis movement (synchronized with Motor 1) |
| Motor 3 | Y | Y | Y-axis movement |
| Motor 4 | Z | Z | Pen up/down |

## CNC Shield V3 Pin Mapping

| Axis | Step Pin | Direction Pin | Notes |
|------|----------|---------------|-------|
| X | D2 | D5 | Single motor |
| Y | D3 | D6 | Needs synchronized duplicate |
| Z | D4 | D7 | Pen up/down |
| A (clone) | D12 | D13 | Clone Y for 2nd Y motor |
| Enable | D8 | — | Active LOW; pulled HIGH by default |

## Technical Notes

### Arduino UNO R4 WiFi Compatibility

The Arduino UNO R4 WiFi is **incompatible** with standard GRBL firmware (designed for 8-bit ATmega328P) and is currently unsupported by grblHAL. A custom application is required.

### CNC Shield V3 Compatibility

The CNC Shield V3 is confirmed compatible with the R4 form factor.

### Pin Current Constraint

The RA4M1 outputs only **8 mA per pin**, compared to 20–30 mA on classic Uno boards. This is acceptable when using the CNC shield with stepper drivers (which have high-impedance inputs), but could be a limiting factor if directly driving other peripherals.
