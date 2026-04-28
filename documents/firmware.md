# Arduino Firmware

Firmware lives in [`firmware/penplotter/`](../firmware/penplotter) and targets an Arduino UNO R4 WiFi with a CNC Shield and stepper drivers.

## Files

| File | Responsibility |
| --- | --- |
| [`penplotter.ino`](../firmware/penplotter/penplotter.ino) | Setup/loop, Wi-Fi startup, serial intake, command dispatch, special commands, status responses. |
| [`gcode_parser.h`](../firmware/penplotter/gcode_parser.h) | Minimal parser for G/M commands and numeric parameters. |
| [`wifi_handler.h`](../firmware/penplotter/wifi_handler.h) | WiFiS3 TCP server, line buffering, ping/pong, ready messages. |
| [`motion_planner.h`](../firmware/penplotter/motion_planner.h) | Pin setup, servo pen lift, coordinate state, soft limits, step generation, line/arc/Bezier/ellipse motion. |

## Libraries And Platform

Current includes:

- `Arduino.h`
- `WiFiS3.h`
- `Servo.h`

The current firmware does not include MobaTools. Step pulses are generated directly with `digitalWrite()` and `delayMicroseconds()`.

## Wi-Fi Credentials

`penplotter.ino` currently defines concrete Wi-Fi credential constants. These docs intentionally do not repeat the values. For sharing or production use, treat these as local secrets and replace them with placeholders or a non-committed configuration mechanism.

## Startup

`setup()`:

1. Starts serial at `115200`.
2. Initializes `MotionPlanner`.
3. Passes `isPaused` and `checkForStopCommands` to the motion planner.
4. Starts Wi-Fi if `USE_WIFI` is true.
5. Prints readiness messages and `ok`.

`loop()`:

1. Calls `wifi.update()` when Wi-Fi is enabled.
2. Calls `motion.update()`, which is currently a no-op because moves are blocking.
3. Reads one queued Wi-Fi line if available and processes it.
4. Requests more data when the firmware buffer is low.
5. Reads one serial line if available and processes it.

## Transport

Despite comments saying "WebSocket server", `WiFiHandler` uses `WiFiServer` and `WiFiClient` as a raw TCP server. Messages are newline-delimited text.

Defaults:

| Setting | Value |
| --- | --- |
| Port | `81` |
| G-code buffer lines | `16` |
| Max line length | `96` chars |
| Low buffer threshold | `< 5` lines |
| Ping interval | `5000` ms |
| Timeout | `15000` ms |

When a client connects, firmware sends:

```text
ok PENPLOTTER_READY
```

When the buffer is low, firmware sends:

```text
ready <free_slots>
```

Ping/pong behavior:

- Firmware sends `ping`.
- Backend responds with `pong`.
- If firmware receives `ping`, it sends `pong`.
- Timeout checks can be disabled during long movement commands.

## Command Processing

`processCommand()` handles commands in this order:

1. Echo command to serial for debugging.
2. Handle special control/test/config/status commands.
3. If paused, acknowledge with `ok PAUSED` and do not execute normal G-code.
4. Wait while `motion.isMoving()` before accepting a normal command.
5. Parse the G-code line.
6. Disable Wi-Fi timeout for blocking movement commands.
7. Execute the command.
8. Re-enable Wi-Fi timeout when needed.
9. Send `ok` unless paused/stopped.

Unsupported parsed command types return `error UNKNOWN_COMMAND`. Empty lines and comments are acknowledged as `ok`.

## Special Commands

| Command | Behavior |
| --- | --- |
| `!` or `STOP` | Emergency stop: set paused, request stop, disable and re-enable drivers, respond `ok STOPPED`. |
| `~` or `RESUME` | Clear pause/stop, respond `ok RESUMED`. |
| `PAUSE` | Set paused, respond `ok PAUSED`. |
| `RESET` | Clear paused/running state, clear stop, enable drivers, respond `ok RESET`. |
| `STATUS` | Respond with running/paused/moving/mode/position. |
| `TEST` | Direct pulse test for X, Y1, Y2, then both Y motors. |
| `TESTY` | Direct synchronized Y1/Y2 movement test. |
| `$LIMITS=x,y` | Set firmware soft limits in mm. |
| `$STEPS=x,y,z` | Set steps/mm. |
| `$EASING=1/0` | Enable/disable sinusoidal easing. |
| `$SOFTLIMITS=1/0` | Enable/disable soft-limit clamping. |

## Parsed G-code

[`GCodeParser`](../firmware/penplotter/gcode_parser.h) recognizes:

| Command | Meaning |
| --- | --- |
| `G0` | Rapid move. |
| `G1` | Linear move with feed. |
| `G2` | Clockwise arc. |
| `G3` | Counter-clockwise arc. |
| `G5` | Cubic Bezier with `I/J/P/Q` control offsets. |
| `G6` | Full ellipse with center `X/Y` and radii `I/J`. |
| `G28` | Home axes by moving back to origin. |
| `G90` | Absolute positioning. |
| `G91` | Relative positioning. |
| `G92` | Set current position without moving. |
| `M3` | Pen down. |
| `M5` | Pen up. |
| `M114` | Report position as `ok X:... Y:... Z:...`. |

Parameters recognized:

- `X`, `Y`, `Z`
- `F`
- `I`, `J`
- `R`
- `P`, `Q`

Parsing stops at `;`, `(`, newline, or carriage return.

## Motion Execution

`executeCommand()` dispatches parsed commands to `MotionPlanner`:

- `G0` -> `rapidMove()`
- `G1` -> `linearMove()`
- `G2/G3` -> `arcMove()`
- `G5` -> `bezierMove()`
- `G6` -> `ellipseMove()`
- `G28` -> `homeAxes()`
- `G90/G91` -> set absolute/relative mode
- `G92` -> set current coordinates
- `M3/M5` -> pen servo
- `M114` -> position report

Motion functions are blocking. `motion.update()` does not advance queued non-blocking work.

## Pause And Stop Status Quo

The firmware has stop flags and a stop callback hook, and `penplotter.ino` defines `checkForStopCommands()` for in-motion stop/pause polling. In current source, `stepXY()` does not call `shouldStop()` or `shouldStopWithPoll()`, so long blocking moves do not currently poll for stop/pause inside the stepping loop.

This is important status quo: stop/pause commands are handled between commands, and the code intends to handle them during motion, but the current stepping loop does not call the hook that would make that happen.

## Position Reporting

`M114` returns:

```text
ok X:<x> Y:<y> Z:<z>
```

`STATUS` returns:

```text
ok STATUS running:<0|1> paused:<0|1> moving:<0|1> mode:<ABS|REL> pos:<x>,<y>,<z>
```

The backend parses `M114`-style `X:` messages. Its `status` parser is currently a no-op.
