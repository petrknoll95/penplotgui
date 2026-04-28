# Backend And API

The backend is a FastAPI application in [`backend/main.py`](../backend/main.py). It handles SVG upload, preview generation, SVG-to-G-code conversion, plotter profiles, plotter control endpoints, and a browser-facing status WebSocket.

## Runtime And Dependencies

Observed local runtime during this documentation pass:

```text
Python 3.14.2
```

Tracked backend dependencies in [`backend/requirements.txt`](../backend/requirements.txt):

| Package | Purpose |
| --- | --- |
| `fastapi` | REST and WebSocket API. |
| `uvicorn[standard]` | ASGI server. |
| `websockets` | Installed dependency, though current Arduino bridge uses `asyncio.open_connection`. |
| `python-multipart` | Multipart SVG upload support. |
| `aiofiles` | Installed dependency; not directly used in current source. |
| `pydantic`, `pydantic-settings` | Request/profile models and env settings. |
| `svgpathtools` | SVG path parsing. |
| `numpy` | Point simplification and geometry helpers. |

## Settings

[`Settings`](../backend/config.py) uses `pydantic-settings` with `env_prefix = "PLOTTER_"`.

| Setting field | Default | Env var |
| --- | --- | --- |
| `host` | `0.0.0.0` | `PLOTTER_HOST` |
| `port` | `8000` | `PLOTTER_PORT` |
| `arduino_host` | Local network IP in source | `PLOTTER_ARDUINO_HOST` |
| `arduino_port` | `81` | `PLOTTER_ARDUINO_PORT` |
| `upload_dir` | `uploads` | `PLOTTER_UPLOAD_DIR` |
| `profiles_file` | `profiles.json` | `PLOTTER_PROFILES_FILE` |

The app creates `upload_dir` at import/runtime startup with `mkdir(exist_ok=True)`. Because paths are relative, `profiles.json` and `uploads/` are relative to the process working directory.

## Plotter Profiles

[`PlotterProfile`](../backend/config.py) stores plotter dimensions, feed rates, pen heights, steps/mm, and easing.

Current defaults:

| Field | Default |
| --- | --- |
| `name` | `default` |
| `bed_width` | `426.0` mm |
| `bed_height` | `599.0` mm |
| `rapid_feed_rate` | `8000.0` mm/min |
| `draw_feed_rate` | `6000.0` mm/min |
| `pen_up_height` | `5.0` mm |
| `pen_down_height` | `0.0` mm |
| `steps_per_mm_x` | `53.3` |
| `steps_per_mm_y` | `53.3` |
| `steps_per_mm_z` | `400.0` |
| `easing_enabled` | `true` |

`model_post_init()` clamps bed width and height to hard maxima:

- `MAX_BED_WIDTH = 426.0`
- `MAX_BED_HEIGHT = 599.0`

`ProfileManager` loads `profiles.json` if present, ensures a `default` profile exists, and saves profile changes as JSON.

## API Endpoints

### Health

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Returns backend health and whether the Arduino bridge is not disconnected. |

### SVG Processing

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload` | Accepts an `.svg` upload, saves it, and returns preview paths, bed size, and dimensions. |
| `POST` | `/api/reposition` | Recomputes preview paths for an uploaded filename with placement/scale/optimization settings. |
| `POST` | `/api/convert` | Converts an uploaded filename to G-code and returns stats. |

`ConvertRequest` fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `filename` | required | Previously uploaded SVG filename. |
| `optimization_method` | `greedy_flip` | `none`, `greedy`, or `greedy_flip`. |
| `scale_to_fit` | `true` | Whether to scale and position paths. |
| `margin` | `0.0` | Margin in mm. |
| `alignment` | `center` | Alignment keyword. |
| `offset_x`, `offset_y` | `0.0` | Used when `alignment = "custom"`. |
| `scale_mode` | `fit` | `fit`, `original`, `percent`, `width`, or `height`. |
| `scale_value` | `100.0` | Percent scale value. |
| `target_width`, `target_height` | `0.0` | Width/height target for scale modes. |
| `profile` | `null` | Optional profile name. |
| `artboard_enabled` | `false` | Use artboard as the container. |
| `artboard_width`, `artboard_height` | `210.0`, `297.0` | Artboard size in mm. |
| `use_arcs` | `true` | Allow G2/G3/G5/G6 generation path. |

`PositionRequest` is similar but returns preview paths and does not include `use_arcs`.

### Profiles

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/profiles` | Return all profiles and active profile name. |
| `GET` | `/api/profiles/{name}` | Return one profile. |
| `PUT` | `/api/profiles/{name}` | Create or update a profile. |
| `DELETE` | `/api/profiles/{name}` | Delete a profile except `default`. |
| `POST` | `/api/profiles/{name}/activate` | Set the active profile. |

### Plotter Settings

| Method | Path | Body/query | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/plotter/bed-size` | `{ "width": number, "height": number }` | Clamp and save bed size; send `$LIMITS` when connected. |
| `POST` | `/api/plotter/steps-per-mm` | `{ "x": number, "y": number, "z": number }` | Save steps/mm; send `$STEPS` when connected. |
| `POST` | `/api/plotter/speed-settings` | `{ "rapid_feed_rate": number, "draw_feed_rate": number, "easing_enabled": boolean }` | Save speeds and easing; send only `$EASING` when connected. |
| `POST` | `/api/plotter/soft-limits` | `enabled` query boolean | Send `$SOFTLIMITS=1` or `$SOFTLIMITS=0`. |

### Plotter Control

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/plotter/connect` | Connect bridge, send `RESET`, send `$LIMITS`, send `$EASING`. |
| `POST` | `/api/plotter/disconnect` | Close bridge connection and reset bridge state. |
| `GET` | `/api/plotter/status` | Return current bridge status. |
| `POST` | `/api/plotter/plot` | Convert uploaded SVG and stream G-code. |
| `POST` | `/api/plotter/test-plot` | Generate a four-corner dot pattern and stream it. |
| `POST` | `/api/plotter/pause` | Send `PAUSE`. |
| `POST` | `/api/plotter/resume` | Send `RESUME`. |
| `POST` | `/api/plotter/stop` | Send `!` and clear bridge queue. |
| `POST` | `/api/plotter/reset` | Send `RESET` and clear bridge queue. |
| `POST` | `/api/plotter/home` | Send `G28` then `M114`. |
| `POST` | `/api/plotter/jog` | Send relative `G1` jog then return to absolute mode. |
| `POST` | `/api/plotter/pen/up` | Send `M5`. |
| `POST` | `/api/plotter/pen/down` | Send `M3`. |
| `POST` | `/api/plotter/set-home` | Send `G92 X0 Y0`, then `M114`. |
| `POST` | `/api/plotter/command` | Send raw command and wait for one response. |

### Browser WebSocket

| Method | Path | Purpose |
| --- | --- | --- |
| `WEBSOCKET` | `/api/ws` | Browser-facing status channel. |

Status messages have this shape:

```json
{
  "type": "status",
  "state": "connected",
  "position": { "x": 0.0, "y": 0.0, "z": 5.0 },
  "progress": 0.0,
  "currentLine": 0,
  "totalLines": 0,
  "error": null
}
```

The same WebSocket can accept `{ "type": "command", "command": "M114" }` and will send a response message when connected.

## ArduinoBridge

[`ArduinoBridge`](../backend/arduino_bridge.py) models these states:

- `disconnected`
- `connecting`
- `connected`
- `plotting`
- `paused`
- `error`

Connection behavior:

- Opens TCP to `settings.arduino_host:settings.arduino_port` with a 10 second timeout.
- Starts a receive loop and a ping loop.
- Pings every 5 seconds only when not disconnected and not plotting.
- Cancels tasks and closes the writer during disconnect.

Streaming behavior:

- `start_plot()` splits G-code into non-empty, non-comment lines.
- `_max_in_flight` is `8`.
- Each `ok` decrements in-flight count.
- `ready <n>` updates `buffer_available` and can trigger more sending.
- Progress is based on lines sent, not lines completed by motion.
- When all lines are sent and acknowledged, bridge state returns to `connected`.

Message handling:

| Firmware message | Bridge behavior |
| --- | --- |
| `pong` | Keepalive response; no status change. |
| `ping` | Bridge sends `pong`. |
| `ok...` | Decrement in-flight, parse position if `X:` fields are present, send more if plotting. |
| `ready N` | Store buffer availability and send more if plotting. |
| `error ...` | Store error text, call response callback. |
| `pos ...` | Parse position and update status. |
| `status ...` | Calls `_parse_status()`, which is currently a no-op. |

## Error Behavior

- Most REST handlers convert processing or bridge exceptions into `HTTPException(400, ...)`.
- Connecting failures return `HTTPException(500, ...)`.
- Plotter actions that require a connection return `400` when disconnected.
- CORS is wide open with `allow_origins=["*"]`.

## Runtime Files

The backend writes or depends on these ignored runtime files:

- `uploads/`: raw uploaded SVGs by original filename.
- `profiles.json`: profile store.
- `__pycache__/`: Python bytecode cache.
- `venv/`: local virtual environment, if created.

The current upload path uses the supplied filename directly under `upload_dir`.
