import asyncio
import logging
from typing import Optional, Callable, Awaitable
from enum import Enum
from dataclasses import dataclass


logger = logging.getLogger(__name__)


class ArduinoState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    PLOTTING = "plotting"
    PAUSED = "paused"
    ERROR = "error"


@dataclass
class PlotterStatus:
    state: ArduinoState
    position: tuple[float, float, float] = (0.0, 0.0, 0.0)
    progress: float = 0.0
    current_line: int = 0
    total_lines: int = 0
    buffer_available: int = 0
    error_message: Optional[str] = None


class ArduinoBridge:
    """
    WebSocket bridge to Arduino pen plotter.

    Handles connection, G-code streaming with flow control,
    and status updates.
    """

    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.state = ArduinoState.DISCONNECTED
        self.status = PlotterStatus(state=ArduinoState.DISCONNECTED)

        # G-code streaming
        self._gcode_lines: list[str] = []
        self._current_line_index: int = 0
        self._lines_in_flight: int = 0
        self._max_in_flight: int = 8  # Send up to 8 lines ahead

        # Callbacks
        self._status_callback: Optional[Callable[[PlotterStatus], Awaitable[None]]] = None
        self._response_callback: Optional[Callable[[str], Awaitable[None]]] = None

        # Connection management
        self._receive_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None
        self._reconnect_attempts: int = 0
        self._max_reconnect_attempts: int = 5

    async def connect(self) -> bool:
        """Connect to the Arduino WebSocket server."""
        self.state = ArduinoState.CONNECTING
        self._update_status()

        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=10.0
            )
            logger.info(f"Connected to Arduino at {self.host}:{self.port}")

            self.state = ArduinoState.CONNECTED
            self._reconnect_attempts = 0
            self._update_status()

            # Start receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())
            self._ping_task = asyncio.create_task(self._ping_loop())

            return True

        except asyncio.TimeoutError:
            logger.error("Connection timeout")
            self.state = ArduinoState.ERROR
            self.status.error_message = "Connection timeout"
            self._update_status()
            return False

        except Exception as e:
            logger.error(f"Connection failed: {e}")
            self.state = ArduinoState.ERROR
            self.status.error_message = str(e)
            self._update_status()
            return False

    async def disconnect(self):
        """Disconnect from Arduino."""
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except (asyncio.CancelledError, Exception):
                pass
            self._receive_task = None

        if self._ping_task:
            self._ping_task.cancel()
            try:
                await self._ping_task
            except (asyncio.CancelledError, Exception):
                pass
            self._ping_task = None

        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass

        self.reader = None
        self.writer = None
        self._gcode_lines = []
        self._current_line_index = 0
        self._lines_in_flight = 0
        self.state = ArduinoState.DISCONNECTED
        self.status = PlotterStatus(state=ArduinoState.DISCONNECTED)
        self._update_status()
        logger.info("Disconnected from Arduino")

    async def _receive_loop(self):
        """Background task to receive messages from Arduino."""
        try:
            while self.reader:
                line = await self.reader.readline()
                if not line:
                    break

                message = line.decode('utf-8').strip()
                await self._handle_message(message)

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Receive error: {e}")
            self.state = ArduinoState.ERROR
            self.status.error_message = str(e)
            self._update_status()

    async def _ping_loop(self):
        """Send periodic pings to keep connection alive."""
        try:
            while True:
                await asyncio.sleep(5.0)
                # Avoid pinging during plotting: Arduino may be blocking on motion
                # and not reading from the socket, which can cause buffer buildup
                # and disconnects.
                if (self.writer and
                    self.state != ArduinoState.DISCONNECTED and
                    self.state != ArduinoState.PLOTTING):
                    await self._send("ping")
        except asyncio.CancelledError:
            raise

    async def _handle_message(self, message: str):
        """Process a message from Arduino."""
        logger.debug(f"Arduino: {message}")

        if message == "pong":
            return

        if message == "ping":
            await self._send("pong")
            return

        if message.startswith("ok"):
            # Command acknowledged
            if self._lines_in_flight > 0:
                self._lines_in_flight -= 1

            # Parse position if included
            if "X:" in message:
                self._parse_position(message)

            # Send more G-code if plotting
            if self.state == ArduinoState.PLOTTING:
                await self._send_next_lines()

            self._update_status()

        elif message.startswith("ready"):
            # Arduino is ready for more data
            parts = message.split()
            if len(parts) > 1:
                try:
                    self.status.buffer_available = int(parts[1])
                except ValueError:
                    pass

            if self.state == ArduinoState.PLOTTING:
                await self._send_next_lines()

        elif message.startswith("error"):
            error_msg = message[6:].strip() if len(message) > 6 else "Unknown error"
            logger.error(f"Arduino error: {error_msg}")
            self.status.error_message = error_msg

            if self._response_callback:
                await self._response_callback(message)

        elif message.startswith("pos"):
            self._parse_position(message)
            self._update_status()

        elif message.startswith("status"):
            self._parse_status(message)

        # Notify callback
        if self._response_callback:
            await self._response_callback(message)

    def _parse_position(self, message: str):
        """Parse position from message like 'ok X:10.00 Y:20.00 Z:5.00'."""
        # Skip config responses and messages without position data
        if "STEPS" in message or "LIMITS" in message:
            return
        if "X:" not in message:
            return  # Don't reset position if no coordinates in message
        try:
            x = y = z = 0.0
            for part in message.split():
                if part.startswith("X:"):
                    x = float(part[2:])
                elif part.startswith("Y:"):
                    y = float(part[2:])
                elif part.startswith("Z:"):
                    z = float(part[2:])
            self.status.position = (x, y, z)
        except ValueError:
            pass

    def _parse_status(self, message: str):
        """Parse full status message."""
        # status running:1 paused:0 moving:0 mode:ABS pos:10.00,20.00,5.00
        pass  # Implement if needed

    async def _send(self, message: str):
        """Send a message to Arduino."""
        if self.writer:
            try:
                self.writer.write((message + "\n").encode('utf-8'))
                await self.writer.drain()
                logger.debug(f"Sent: {message}")
            except Exception as e:
                logger.error(f"Send error: {e}")
                raise

    async def _send_next_lines(self):
        """Send next G-code lines based on flow control."""
        while (self._lines_in_flight < self._max_in_flight and
               self._current_line_index < len(self._gcode_lines)):

            line = self._gcode_lines[self._current_line_index]
            await self._send(line)
            self._current_line_index += 1
            self._lines_in_flight += 1

            # Update progress
            self.status.current_line = self._current_line_index
            self.status.progress = (self._current_line_index / len(self._gcode_lines)) * 100

        # Check if done
        if (self._current_line_index >= len(self._gcode_lines) and
            self._lines_in_flight == 0):
            self.state = ArduinoState.CONNECTED
            self.status.progress = 100.0
            logger.info("Plotting complete")

        self._update_status()

    def _update_status(self):
        """Update and broadcast status."""
        self.status.state = self.state
        self.status.total_lines = len(self._gcode_lines)

        if self._status_callback:
            asyncio.create_task(self._status_callback(self.status))

    def set_status_callback(self, callback: Callable[[PlotterStatus], Awaitable[None]]):
        """Set callback for status updates."""
        self._status_callback = callback

    def set_response_callback(self, callback: Callable[[str], Awaitable[None]]):
        """Set callback for Arduino responses."""
        self._response_callback = callback

    async def start_plot(self, gcode: str):
        """Start plotting G-code."""
        if self.state != ArduinoState.CONNECTED:
            raise RuntimeError(f"Cannot start plot in state: {self.state}")

        # Parse G-code lines
        self._gcode_lines = [
            line.strip() for line in gcode.splitlines()
            if line.strip() and not line.strip().startswith(';')
        ]
        self._current_line_index = 0
        self._lines_in_flight = 0

        self.status.total_lines = len(self._gcode_lines)
        self.status.current_line = 0
        self.status.progress = 0.0

        self.state = ArduinoState.PLOTTING
        self._update_status()

        # Start sending
        await self._send_next_lines()

    async def pause_plot(self):
        """Pause the current plot."""
        if self.state == ArduinoState.PLOTTING:
            await self._send("PAUSE")
            self.state = ArduinoState.PAUSED
            self._update_status()

    async def resume_plot(self):
        """Resume a paused plot."""
        if self.state == ArduinoState.PAUSED:
            await self._send("RESUME")
            self.state = ArduinoState.PLOTTING
            self._update_status()
            await self._send_next_lines()

    async def stop_plot(self):
        """Stop the current plot."""
        await self._send("!")
        self._gcode_lines = []
        self._current_line_index = 0
        self._lines_in_flight = 0
        self.state = ArduinoState.CONNECTED
        self.status.error_message = None  # Clear any error state
        self._update_status()

    async def reset(self):
        """Reset the plotter to a clean state."""
        await self._send("RESET")
        self._gcode_lines = []
        self._current_line_index = 0
        self._lines_in_flight = 0
        self.state = ArduinoState.CONNECTED
        self.status.error_message = None
        self._update_status()

    async def send_command(self, command: str) -> str:
        """Send a single command and wait for response."""
        if self.state == ArduinoState.DISCONNECTED:
            raise RuntimeError("Not connected")

        response_future: asyncio.Future[str] = asyncio.Future()

        async def capture_response(msg: str):
            if not response_future.done():
                response_future.set_result(msg)

        old_callback = self._response_callback
        self._response_callback = capture_response

        try:
            await self._send(command)
            response = await asyncio.wait_for(response_future, timeout=5.0)
            return response
        finally:
            self._response_callback = old_callback

    async def jog(self, axis: str, distance: float, feed_rate: float = 1000):
        """Jog an axis by a relative distance."""
        await self._send("G91")  # Relative mode
        await self._send(f"G1 {axis}{distance:.3f} F{feed_rate:.0f}")  # G1 respects feed rate
        await self._send("G90")  # Back to absolute
        await self.get_position()  # Update position after jog

    async def home(self):
        """Home all axes."""
        await self._send("G28")
        await self.get_position()  # Update position after home

    async def pen_up(self):
        """Raise the pen."""
        await self._send("M5")

    async def pen_down(self):
        """Lower the pen."""
        await self._send("M3")

    async def get_position(self) -> tuple[float, float, float]:
        """Get current position."""
        response = await self.send_command("M114")
        self._parse_position(response)
        self._update_status()  # Broadcast position update
        return self.status.position

    async def set_soft_limits(self, x_max: float, y_max: float):
        """Set soft limits on the Arduino."""
        await self._send(f"$LIMITS={x_max:.1f},{y_max:.1f}")

    async def set_steps_per_mm(self, x: float, y: float, z: float):
        """Set steps per mm on the Arduino."""
        await self._send(f"$STEPS={x:.2f},{y:.2f},{z:.2f}")

    async def set_easing(self, enabled: bool):
        """Enable or disable motion easing (acceleration/deceleration)."""
        await self._send(f"$EASING={1 if enabled else 0}")

    async def set_soft_limits_enabled(self, enabled: bool):
        """Enable or disable soft limits."""
        await self._send(f"$SOFTLIMITS={1 if enabled else 0}")

    async def set_position(self, x: float = None, y: float = None):
        """Set current position without moving (G92)."""
        cmd = "G92"
        if x is not None:
            cmd += f" X{x:.3f}"
        if y is not None:
            cmd += f" Y{y:.3f}"
        await self._send(cmd)
