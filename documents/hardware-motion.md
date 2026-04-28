# Hardware And Motion Control

This document records the current hardware and motion behavior from source. For the concise hardware sheet, see [device.md](device.md).

## Current Hardware Target

Tracked docs and source consistently target:

- Arduino UNO R4 WiFi.
- CNC Shield v3-style pinout.
- NEMA 17 stepper motors through step/dir drivers such as A4988.
- Servo-based pen lift.

The firmware is the operational source of truth for pin usage.

## Firmware Pin Map

From [`motion_planner.h`](../firmware/penplotter/motion_planner.h):

| Function | Arduino pin | Notes |
| --- | --- | --- |
| X step | `D2` | X axis step pulse. |
| X dir | `D5` | X axis direction. |
| Y step | `D3` | First Y motor step pulse. |
| Y dir | `D6` | First Y motor direction. |
| Y2 step | `D4` | Second Y motor on the CNC Shield Z header. |
| Y2 dir | `D7` | Second Y motor direction on the Z header. |
| Enable | `D8` | Active low; LOW enables drivers. |
| Pen servo | `D11` | On the Z+ limit switch header according to comment. |

Direction inversion constants:

```cpp
#define X_DIR_INVERTED true
#define Y_DIR_INVERTED true
#define Y2_DIR_INVERTED true
```

The firmware pulses Y and Y2 together in `stepXY()`. Y2 direction is derived from Y direction and the Y2 inversion flag.

## Coordinate System

The application presents and generates plotter coordinates in millimeters:

- Origin `(0, 0)` is bottom-left in preview and G-code intent.
- X increases right.
- Y increases up.
- SVG source Y is flipped during backend processing.
- Firmware stores current position in `currentX`, `currentY`, `currentZ`.

The frontend preview also flips the SVG group so plotter coordinates appear bottom-left in the browser.

## Bed And Soft Limits

Current hard maxima in backend and frontend:

| Dimension | Max |
| --- | --- |
| Width | `426` mm |
| Height | `599` mm |

Firmware defaults match:

```cpp
#define DEFAULT_SOFT_LIMIT_X_MAX 426.0f
#define DEFAULT_SOFT_LIMIT_Y_MAX 599.0f
```

Soft limits are clamp-based, not sensor-based:

- `rapidMove()`, `linearMove()`, `arcMove()`, `bezierMove()`, and `ellipseMove()` clamp target/intermediate X/Y to `[0, softLimit]` when enabled.
- There are no limit switch reads in the current firmware.
- `G28` homes by moving back to logical origin from the current in-memory coordinates.
- `G92` sets the current logical position without moving.

The set-home modal in the frontend temporarily sends `$SOFTLIMITS=0`, lets the operator jog, then sends `G92 X0 Y0` and re-enables soft limits.

## Steps Per Millimeter

Defaults:

| Axis | Backend profile | Firmware default |
| --- | --- | --- |
| X | `53.3` | `53.3f` |
| Y | `53.3` | `53.3f` |
| Z | `400.0` | `400.0f` |

Backend endpoint `POST /api/plotter/steps-per-mm` sends:

```text
$STEPS=<x>,<y>,<z>
```

Firmware updates in-memory `stepsPerMmX`, `stepsPerMmY`, and `stepsPerMmZ`. Current motion ignores Z step output because the Z header pins are used for the second Y motor and pen lift uses a servo.

## Pen Lift

Pen lift is servo-based:

| Constant | Value |
| --- | --- |
| `SERVO_PIN` | `11` |
| `SERVO_UP_ANGLE` | `90` |
| `SERVO_DOWN_ANGLE` | `45` |
| `SERVO_MOVE_DELAY` | `250` ms |

`M5` calls `penUp()` and `M3` calls `penDown()`. If the pen is already in the requested state, the function returns immediately.

Logical Z state:

- Pen up sets `currentZ = penUpPosition`, default `5.0`.
- Pen down sets `currentZ = penDownPosition`, default `0.0`.

## Step Generation

`stepXY()` is the core coordinated stepping loop:

1. Determine X, Y, and Y2 directions with inversion flags.
2. Calculate absolute X/Y step counts.
3. Set `totalSteps = max(absX, absY)`.
4. Use Bresenham-style accumulators to decide when to pulse X and Y.
5. Pulse X and both Y motors in the same loop iteration when needed.
6. Delay based on feed rate and optional easing.
7. Return actual steps taken so position can be updated from real step counts.

This is open-loop motion: the firmware tracks what it commanded, not encoder-confirmed position.

## Feed Rates And Speed Limits

Backend profile defaults:

- Rapid feed: `8000` mm/min.
- Draw feed: `6000` mm/min.

Firmware defaults:

- `DEFAULT_RAPID_SPEED = 3000`
- `DEFAULT_FEED_SPEED = 1000`
- `MAX_SPEED = 5000`

Current implications:

- Backend-generated `G0` lines include `F<rapid_feed_rate>`, but firmware `rapidMove()` ignores the parsed `F` value and uses its internal `rapidSpeed`.
- Backend-generated `G1`, `G2`, `G3`, `G5`, and `G6` lines include `F<draw_feed_rate>`, and firmware clamps values above `MAX_SPEED`.
- The frontend settings panel saves rapid/draw speeds to the backend profile, but when connected the backend sends only `$EASING` to firmware for speed settings. There is no current `$RAPID` or `$FEED` command.
- Jogging uses `G1` with the backend rapid speed as feed, so firmware treats it as a linear move and clamps it if above `5000`.

## Easing

Easing is a sinusoidal delay profile across a move:

- Slow at start.
- Fastest near the middle.
- Slow at the end.

It is applied when:

- `allowEasing` is true.
- Firmware `easingEnabled` is true.
- The move has more than one step.
- The larger X/Y move length is at least `EASING_MIN_MM` (`1.0` mm).

Straight G1 moves always call `stepXY(..., allowEasing=true)`. Arc/Bezier/ellipse internal segments call `stepXY(..., allowEasing=!penIsDown)`, so pen-down curve segments do not ease each tiny segment.

## Arc, Bezier, And Ellipse Motion

Firmware curve commands are approximated into line segments:

| Command | Approximation |
| --- | --- |
| `G2/G3` | Arc length divided into about `0.5` mm segments, capped at `500`. |
| `G5` | Cubic Bezier length estimated from 20 samples, then about `0.5` mm segments, capped at `2000`. |
| `G6` | Full ellipse circumference estimated with Ramanujan formula, then about `0.5` mm segments, capped at `3000`. |

Each internal segment is converted to X/Y steps with `mmToSteps()` and executed through `stepXY()`.

## Homing

`G28`:

1. Raises the pen.
2. Computes steps from current logical X/Y back to zero.
3. Moves those steps at firmware rapid speed.
4. Updates current X/Y based on actual steps taken.
5. Sets `currentZ = 0`.

There is no hardware probing or switch detection in current code. Homing means "return to the current logical origin."

## Foundation Candidates

These behaviors appear central to the current system and should be treated carefully before changing:

- Millimeter coordinate system with bottom-left plotter origin.
- Backend Y-axis flip from SVG space into plotter space.
- Soft-limit max of `426 x 599` mm.
- Line-oriented `ok` protocol between backend and firmware.
- Dual Y motor pulse synchronization in the firmware.
- Preview and plot sharing the same positioning and path-order settings.

See [status-quo-audit.md](status-quo-audit.md) for improvement candidates and mismatches.
