import asyncio
import logging
import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import settings, profile_manager, PlotterProfile
from svg_processor import SVGProcessor
from arduino_bridge import ArduinoBridge, ArduinoState, PlotterStatus


# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create upload directory
upload_dir = Path(settings.upload_dir)
upload_dir.mkdir(exist_ok=True)

# FastAPI app
app = FastAPI(title="Pen Plotter API", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Arduino bridge (singleton)
arduino: Optional[ArduinoBridge] = None

# Connected WebSocket clients
websocket_clients: set[WebSocket] = set()


# Request/Response models
class ConvertRequest(BaseModel):
    filename: str
    optimization_method: str = "greedy_flip"  # none, greedy, greedy_flip
    scale_to_fit: bool = True
    margin: float = 0.0
    alignment: str = "center"  # center, top-left, top-right, bottom-left, bottom-right, custom
    offset_x: float = 0.0  # Only used when alignment="custom"
    offset_y: float = 0.0  # Only used when alignment="custom"
    scale_mode: str = "fit"  # fit, original, percent, width, height
    scale_value: float = 100.0  # Used with scale_mode="percent"
    target_width: float = 0.0  # Used with scale_mode="width"
    target_height: float = 0.0  # Used with scale_mode="height"
    profile: Optional[str] = None
    artboard_enabled: bool = False
    artboard_width: float = 210.0  # A4 width
    artboard_height: float = 297.0  # A4 height
    use_arcs: bool = True  # Use G2/G3 arcs (False = G1 lines only)


class PositionRequest(BaseModel):
    filename: str
    alignment: str = "center"
    offset_x: float = 0.0
    offset_y: float = 0.0
    margin: float = 0.0
    scale_mode: str = "fit"
    scale_value: float = 100.0
    target_width: float = 0.0
    target_height: float = 0.0
    optimization_method: str = "greedy_flip"  # none, greedy, greedy_flip
    scale_to_fit: bool = True
    artboard_enabled: bool = False
    artboard_width: float = 210.0  # A4 width
    artboard_height: float = 297.0  # A4 height


class JogRequest(BaseModel):
    axis: str
    distance: float


class CommandRequest(BaseModel):
    command: str


class TestPlotRequest(BaseModel):
    width: float = 210.0   # Artboard/test width in mm
    height: float = 297.0  # Artboard/test height in mm


# Startup/Shutdown
@app.on_event("startup")
async def startup():
    global arduino
    arduino = ArduinoBridge(settings.arduino_host, settings.arduino_port)
    arduino.set_status_callback(broadcast_status)
    logger.info("Pen Plotter API started")


@app.on_event("shutdown")
async def shutdown():
    global arduino
    if arduino:
        await arduino.disconnect()


# Helper functions
async def broadcast_status(status: PlotterStatus):
    """Broadcast status to all connected WebSocket clients."""
    message = {
        "type": "status",
        "state": status.state.value,
        "position": {
            "x": status.position[0],
            "y": status.position[1],
            "z": status.position[2],
        },
        "progress": status.progress,
        "currentLine": status.current_line,
        "totalLines": status.total_lines,
        "error": status.error_message,
    }

    disconnected = set()
    for ws in websocket_clients:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.add(ws)

    websocket_clients.difference_update(disconnected)


# REST Endpoints

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "arduino_connected": arduino.state != ArduinoState.DISCONNECTED if arduino else False}


@app.post("/api/upload")
async def upload_svg(file: UploadFile = File(...)):
    """Upload an SVG file."""
    if not file.filename or not file.filename.lower().endswith('.svg'):
        raise HTTPException(400, "File must be an SVG")

    # Save file
    file_path = upload_dir / file.filename
    content = await file.read()
    file_path.write_bytes(content)

    # Get preview paths
    profile = profile_manager.get_profile()
    processor = SVGProcessor(profile)

    try:
        paths, dimensions = processor.get_preview_paths(str(file_path))
        return {
            "filename": file.filename,
            "paths": paths,
            "bed": {
                "width": profile.bed_width,
                "height": profile.bed_height,
            },
            "dimensions": dimensions,
        }
    except Exception as e:
        logger.error(f"Error processing SVG: {e}")
        raise HTTPException(400, f"Error processing SVG: {str(e)}")


@app.post("/api/reposition")
async def reposition_svg(request: PositionRequest):
    """Reposition an uploaded SVG and return updated preview paths."""
    logger.info(f"[DEBUG] /api/reposition called with optimization_method='{request.optimization_method}'")
    file_path = upload_dir / request.filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")

    profile = profile_manager.get_profile()
    processor = SVGProcessor(profile)

    try:
        paths, dimensions = processor.get_preview_paths(
            str(file_path),
            optimization_method=request.optimization_method,
            scale_to_fit=request.scale_to_fit,
            margin=request.margin,
            alignment=request.alignment,
            offset_x=request.offset_x,
            offset_y=request.offset_y,
            scale_mode=request.scale_mode,
            scale_value=request.scale_value,
            target_width=request.target_width,
            target_height=request.target_height,
            artboard_enabled=request.artboard_enabled,
            artboard_width=request.artboard_width,
            artboard_height=request.artboard_height,
        )
        return {
            "paths": paths,
            "dimensions": dimensions,
            "alignment": request.alignment,
            "offset_x": request.offset_x,
            "offset_y": request.offset_y,
        }
    except Exception as e:
        logger.error(f"Error repositioning SVG: {e}")
        raise HTTPException(400, f"Error repositioning SVG: {str(e)}")


@app.post("/api/convert")
async def convert_svg(request: ConvertRequest):
    """Convert SVG to G-code."""
    file_path = upload_dir / request.filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")

    profile = profile_manager.get_profile(request.profile)
    processor = SVGProcessor(profile)

    try:
        gcode, stats = processor.process_svg(
            str(file_path),
            optimization_method=request.optimization_method,
            scale_to_fit=request.scale_to_fit,
            margin=request.margin,
            alignment=request.alignment,
            offset_x=request.offset_x,
            offset_y=request.offset_y,
            scale_mode=request.scale_mode,
            scale_value=request.scale_value,
            target_width=request.target_width,
            target_height=request.target_height,
            artboard_enabled=request.artboard_enabled,
            artboard_width=request.artboard_width,
            artboard_height=request.artboard_height,
            use_arcs=request.use_arcs,
        )
        return {
            "gcode": gcode,
            "stats": stats,
        }
    except Exception as e:
        logger.error(f"Error converting SVG: {e}")
        raise HTTPException(400, f"Error converting SVG: {str(e)}")


# Profile endpoints

@app.get("/api/profiles")
async def list_profiles():
    """List all profiles."""
    profiles = {}
    for name in profile_manager.list_profiles():
        profiles[name] = profile_manager.get_profile(name).model_dump()
    return {
        "profiles": profiles,
        "active": profile_manager.active_profile,
    }


@app.get("/api/profiles/{name}")
async def get_profile(name: str):
    """Get a specific profile."""
    if name not in profile_manager.profiles:
        raise HTTPException(404, "Profile not found")
    return profile_manager.get_profile(name).model_dump()


@app.put("/api/profiles/{name}")
async def save_profile(name: str, profile: PlotterProfile):
    """Create or update a profile."""
    profile.name = name
    profile_manager.set_profile(name, profile)
    return {"status": "ok"}


@app.delete("/api/profiles/{name}")
async def delete_profile(name: str):
    """Delete a profile."""
    if not profile_manager.delete_profile(name):
        raise HTTPException(400, "Cannot delete this profile")
    return {"status": "ok"}


@app.post("/api/profiles/{name}/activate")
async def activate_profile(name: str):
    """Set a profile as active."""
    if not profile_manager.set_active(name):
        raise HTTPException(404, "Profile not found")
    return {"status": "ok"}


class BedSizeRequest(BaseModel):
    width: float
    height: float


class StepsPerMmRequest(BaseModel):
    x: float
    y: float
    z: float


class SpeedSettingsRequest(BaseModel):
    rapid_feed_rate: float
    draw_feed_rate: float
    easing_enabled: bool


# Hard limits for bed size (physical constraints)
MAX_BED_WIDTH = 426.0
MAX_BED_HEIGHT = 599.0


@app.post("/api/plotter/bed-size")
async def set_bed_size(request: BedSizeRequest):
    """Update bed size and send to Arduino."""
    # Clamp to hard limits
    width = min(request.width, MAX_BED_WIDTH)
    height = min(request.height, MAX_BED_HEIGHT)

    # Update active profile
    profile = profile_manager.get_profile()
    profile.bed_width = width
    profile.bed_height = height
    profile_manager.set_profile(profile.name, profile)

    # Send to Arduino if connected
    if arduino and arduino.state != ArduinoState.DISCONNECTED:
        await arduino.set_soft_limits(width, height)

    return {"status": "ok", "width": width, "height": height}


@app.post("/api/plotter/steps-per-mm")
async def set_steps_per_mm(request: StepsPerMmRequest):
    """Update steps per mm and send to Arduino."""
    # Update active profile
    profile = profile_manager.get_profile()
    profile.steps_per_mm_x = request.x
    profile.steps_per_mm_y = request.y
    profile.steps_per_mm_z = request.z
    profile_manager.set_profile(profile.name, profile)

    # Send to Arduino if connected
    if arduino and arduino.state != ArduinoState.DISCONNECTED:
        await arduino.set_steps_per_mm(request.x, request.y, request.z)

    return {"status": "ok", "x": request.x, "y": request.y, "z": request.z}


@app.post("/api/plotter/speed-settings")
async def set_speed_settings(request: SpeedSettingsRequest):
    """Update speed settings and send to Arduino."""
    # Update active profile
    profile = profile_manager.get_profile()
    profile.rapid_feed_rate = request.rapid_feed_rate
    profile.draw_feed_rate = request.draw_feed_rate
    profile.easing_enabled = request.easing_enabled
    profile_manager.set_profile(profile.name, profile)

    # Send easing setting to Arduino if connected
    if arduino and arduino.state != ArduinoState.DISCONNECTED:
        await arduino.set_easing(request.easing_enabled)

    return {
        "status": "ok",
        "rapid_feed_rate": request.rapid_feed_rate,
        "draw_feed_rate": request.draw_feed_rate,
        "easing_enabled": request.easing_enabled
    }


# Plotter control endpoints

@app.post("/api/plotter/connect")
async def connect_plotter():
    """Connect to the Arduino."""
    if not arduino:
        raise HTTPException(500, "Arduino bridge not initialized")

    success = await arduino.connect()
    if not success:
        raise HTTPException(500, f"Connection failed: {arduino.status.error_message}")

    # Reset to clean state (clears any stale pause from previous session)
    await arduino.reset()

    # Send configuration from active profile
    profile = profile_manager.get_profile()
    await arduino.set_soft_limits(profile.bed_width, profile.bed_height)
    await arduino.set_easing(profile.easing_enabled)

    return {"status": "connected"}


@app.post("/api/plotter/disconnect")
async def disconnect_plotter():
    """Disconnect from the Arduino."""
    if arduino:
        await arduino.disconnect()
    return {"status": "disconnected"}


@app.get("/api/plotter/status")
async def get_plotter_status():
    """Get current plotter status."""
    if not arduino:
        return {"state": "disconnected"}

    return {
        "state": arduino.status.state.value,
        "position": {
            "x": arduino.status.position[0],
            "y": arduino.status.position[1],
            "z": arduino.status.position[2],
        },
        "progress": arduino.status.progress,
        "currentLine": arduino.status.current_line,
        "totalLines": arduino.status.total_lines,
        "error": arduino.status.error_message,
    }


@app.post("/api/plotter/plot")
async def start_plot(request: ConvertRequest):
    """Convert and start plotting an SVG."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")

    if arduino.state == ArduinoState.PLOTTING:
        raise HTTPException(400, "Already plotting")

    # Convert SVG
    file_path = upload_dir / request.filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")

    profile = profile_manager.get_profile(request.profile)
    processor = SVGProcessor(profile)

    try:
        gcode, stats = processor.process_svg(
            str(file_path),
            optimization_method=request.optimization_method,
            scale_to_fit=request.scale_to_fit,
            margin=request.margin,
            alignment=request.alignment,
            offset_x=request.offset_x,
            offset_y=request.offset_y,
            scale_mode=request.scale_mode,
            scale_value=request.scale_value,
            target_width=request.target_width,
            target_height=request.target_height,
            artboard_enabled=request.artboard_enabled,
            artboard_width=request.artboard_width,
            artboard_height=request.artboard_height,
            use_arcs=request.use_arcs,
        )

        await arduino.start_plot(gcode)
        return {"status": "plotting", "stats": stats}

    except Exception as e:
        logger.error(f"Error starting plot: {e}")
        raise HTTPException(400, str(e))


@app.post("/api/plotter/test-plot")
async def test_plot(request: TestPlotRequest):
    """Run corner test pattern for paper alignment."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")

    if arduino.state == ArduinoState.PLOTTING:
        raise HTTPException(400, "Already plotting")

    profile = profile_manager.get_profile()
    rapid = profile.rapid_feed_rate

    # Generate test G-code: visit each corner and make a dot
    gcode = f"""; Test Plot - Artboard corners
G90
M5

; Corner 1: Bottom-left (0,0)
G0 X0 Y0 F{rapid:.0f}
M3
G4 P0.2
M5

; Corner 2: Bottom-right
G0 X{request.width:.3f} Y0 F{rapid:.0f}
M3
G4 P0.2
M5

; Corner 3: Top-right
G0 X{request.width:.3f} Y{request.height:.3f} F{rapid:.0f}
M3
G4 P0.2
M5

; Corner 4: Top-left
G0 X0 Y{request.height:.3f} F{rapid:.0f}
M3
G4 P0.2
M5

; Return home
G0 X0 Y0 F{rapid:.0f}
"""

    try:
        await arduino.start_plot(gcode)
        return {"status": "testing", "width": request.width, "height": request.height}
    except Exception as e:
        logger.error(f"Error starting test plot: {e}")
        raise HTTPException(400, str(e))


@app.post("/api/plotter/pause")
async def pause_plot():
    """Pause plotting."""
    if arduino:
        await arduino.pause_plot()
    return {"status": "paused"}


@app.post("/api/plotter/resume")
async def resume_plot():
    """Resume plotting."""
    if arduino:
        await arduino.resume_plot()
    return {"status": "plotting"}


@app.post("/api/plotter/stop")
async def stop_plot():
    """Stop plotting."""
    if arduino:
        await arduino.stop_plot()
    return {"status": "stopped"}


@app.post("/api/plotter/reset")
async def reset_plotter():
    """Reset the plotter to a clean state - clears paused state, stops any plot."""
    if arduino:
        await arduino.reset()
    return {"status": "reset"}


@app.post("/api/plotter/home")
async def home_plotter():
    """Home all axes."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")
    await arduino.home()
    return {"status": "ok"}


@app.post("/api/plotter/jog")
async def jog_plotter(request: JogRequest):
    """Jog an axis using configured rapid speed."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")

    if request.axis.upper() not in ['X', 'Y', 'Z']:
        raise HTTPException(400, "Invalid axis")

    # Use rapid speed from profile settings
    profile = profile_manager.get_profile()
    await arduino.jog(request.axis.upper(), request.distance, profile.rapid_feed_rate)
    return {"status": "ok"}


@app.post("/api/plotter/pen/up")
async def pen_up():
    """Raise pen."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")
    await arduino.pen_up()
    return {"status": "ok"}


@app.post("/api/plotter/pen/down")
async def pen_down():
    """Lower pen."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")
    await arduino.pen_down()
    return {"status": "ok"}


@app.post("/api/plotter/soft-limits")
async def set_soft_limits_enabled(enabled: bool):
    """Enable or disable soft limits."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")
    await arduino.set_soft_limits_enabled(enabled)
    return {"status": "ok", "soft_limits_enabled": enabled}


@app.post("/api/plotter/set-home")
async def set_home():
    """Set current position as home (0,0)."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")
    await arduino.set_position(x=0, y=0)
    await arduino.get_position()  # Update status with new position
    return {"status": "ok"}


@app.post("/api/plotter/command")
async def send_command(request: CommandRequest):
    """Send raw G-code command."""
    if not arduino or arduino.state == ArduinoState.DISCONNECTED:
        raise HTTPException(400, "Plotter not connected")

    try:
        response = await arduino.send_command(request.command)
        return {"response": response}
    except Exception as e:
        raise HTTPException(400, str(e))


# WebSocket endpoint
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time status updates."""
    await websocket.accept()
    websocket_clients.add(websocket)
    logger.info("WebSocket client connected")

    try:
        # Send initial status
        if arduino:
            await broadcast_status(arduino.status)

        # Keep connection alive and handle incoming messages
        while True:
            try:
                data = await websocket.receive_json()

                # Handle commands via WebSocket
                if data.get("type") == "command":
                    cmd = data.get("command")
                    if arduino and arduino.state != ArduinoState.DISCONNECTED:
                        response = await arduino.send_command(cmd)
                        await websocket.send_json({"type": "response", "data": response})

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                break

    finally:
        websocket_clients.discard(websocket)
        logger.info("WebSocket client disconnected")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
