/*
 * Pen Plotter Firmware for Arduino R4 WiFi
 *
 * Hardware:
 * - Arduino Uno R4 WiFi
 * - CNC Shield v3
 * - NEMA 17 stepper motors (X, Y axes)
 * - Servo or small stepper for Z (pen lift)
 */

#include "gcode_parser.h"
#include "motion_planner.h"
#include "wifi_handler.h"

// WiFi credentials - UPDATE THESE
const char* WIFI_SSID = "KNOLL_NEW";
const char* WIFI_PASS = "9508093947";
const uint16_t WIFI_PORT = 81;

// Enable WiFi mode (set false for serial-only testing)
#define USE_WIFI true

// Objects
GCodeParser parser;
MotionPlanner motion;
WiFiHandler wifi;

// State
bool isRunning = false;
volatile bool isPaused = false;  // volatile for interrupt safety
bool useWiFi = USE_WIFI;

// Forward declaration for stop command polling
void checkForStopCommands();

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);  // Wait for serial, but timeout

  Serial.println("=== Pen Plotter Firmware ===");
  Serial.println("Initializing...");

  // Initialize motion system
  motion.begin();
  // Connect stop flag and callback so motion can be interrupted
  motion.setStopFlag(&isPaused);
  motion.setStopCallback(checkForStopCommands);
  Serial.println("Motion system ready");

  // Initialize WiFi if enabled
  if (useWiFi) {
    if (wifi.begin(WIFI_SSID, WIFI_PASS, WIFI_PORT)) {
      Serial.println("WiFi ready - waiting for connection");
    } else {
      Serial.println("WiFi failed - falling back to serial only");
      useWiFi = false;
    }
  }

  Serial.println("Ready for commands");
  Serial.println("ok");
}

void loop() {
  // Update WiFi handler
  if (useWiFi) {
    wifi.update();
  }

  // Update motion planner
  motion.update();

  // Process commands from WiFi
  if (useWiFi && wifi.hasData()) {
    String line = wifi.readLine();
    processCommand(line.c_str(), true);

    // Request more data if buffer is low
    if (wifi.getBuffer().isLow()) {
      wifi.requestMoreData();
    }
  }

  // Process commands from Serial
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      processCommand(line.c_str(), false);
    }
  }
}

void processCommand(const char* line, bool fromWiFi) {
  // Echo received command for debugging
  Serial.print(">> ");
  Serial.println(line);

  // Handle special commands
  if (strcmp(line, "!") == 0 || strcasecmp(line, "STOP") == 0) {
    emergencyStop();
    sendResponse("ok STOPPED", fromWiFi);
    return;
  }

  if (strcasecmp(line, "~") == 0 || strcasecmp(line, "RESUME") == 0) {
    isPaused = false;
    motion.clearStop();
    sendResponse("ok RESUMED", fromWiFi);
    return;
  }

  if (strcasecmp(line, "PAUSE") == 0) {
    isPaused = true;
    sendResponse("ok PAUSED", fromWiFi);
    return;
  }

  if (strcasecmp(line, "RESET") == 0) {
    resetState();
    sendResponse("ok RESET", fromWiFi);
    return;
  }

  if (strcasecmp(line, "TESTY") == 0) {
    // Test ONLY Y1+Y2 synced movement
    Serial.println("Testing Y1+Y2 SYNCED...");

    pinMode(3, OUTPUT);   // Y1 step
    pinMode(6, OUTPUT);   // Y1 dir
    pinMode(4, OUTPUT);   // Y2 step
    pinMode(7, OUTPUT);   // Y2 dir
    pinMode(8, OUTPUT);   // Enable

    digitalWrite(8, LOW);    // Enable
    digitalWrite(6, HIGH);   // Y1 dir
    digitalWrite(7, LOW);    // Y2 dir (inverted)
    delay(50);

    Serial.println("Moving both Y motors together NOW...");
    for (int i = 0; i < 400; i++) {
      digitalWrite(3, HIGH);
      digitalWrite(4, HIGH);
      delayMicroseconds(10);
      digitalWrite(3, LOW);
      digitalWrite(4, LOW);
      delayMicroseconds(400);
    }
    Serial.println("Done");

    sendResponse("ok TESTY", fromWiFi);
    return;
  }


  if (strcasecmp(line, "STATUS") == 0) {
    reportStatus(fromWiFi);
    return;
  }

  if (strcasecmp(line, "TEST") == 0) {
    // Direct motor test - X, Y1, and Y2 (on Z header)
    Serial.println("Testing all motors...");

    // Set pin modes
    pinMode(2, OUTPUT);   // X step
    pinMode(5, OUTPUT);   // X dir
    pinMode(3, OUTPUT);   // Y1 step
    pinMode(6, OUTPUT);   // Y1 dir
    pinMode(4, OUTPUT);   // Y2 step (Z header)
    pinMode(7, OUTPUT);   // Y2 dir (Z header)
    pinMode(8, OUTPUT);   // Enable

    digitalWrite(8, LOW);   // Enable drivers
    delay(10);

    // Test X motor
    Serial.println("X motor moving...");
    digitalWrite(5, HIGH);
    delay(50);
    for (int i = 0; i < 160; i++) {
      digitalWrite(2, HIGH);
      delayMicroseconds(5);
      digitalWrite(2, LOW);
      delayMicroseconds(400);
    }
    Serial.println("X done");
    delay(500);

    // Test Y1 motor
    Serial.println("Y1 motor moving...");
    digitalWrite(6, HIGH);
    delay(50);
    for (int i = 0; i < 160; i++) {
      digitalWrite(3, HIGH);
      delayMicroseconds(5);
      digitalWrite(3, LOW);
      delayMicroseconds(400);
    }
    Serial.println("Y1 done");
    delay(500);

    // Test Y2 motor (on Z header)
    Serial.println("Y2 motor moving (Z header)...");
    digitalWrite(7, HIGH);
    delay(50);
    for (int i = 0; i < 160; i++) {
      digitalWrite(4, HIGH);
      delayMicroseconds(5);
      digitalWrite(4, LOW);
      delayMicroseconds(400);
    }
    Serial.println("Y2 done");
    delay(500);

    // Test Y1+Y2 together (should move gantry straight)
    Serial.println("Y1+Y2 together (Y1=HIGH, Y2=LOW for opposite motors)...");
    digitalWrite(6, HIGH);   // Y1 direction
    digitalWrite(7, LOW);    // Y2 direction (inverted)
    delay(50);
    for (int i = 0; i < 160; i++) {
      digitalWrite(3, HIGH);
      digitalWrite(4, HIGH);
      delayMicroseconds(5);
      digitalWrite(3, LOW);
      digitalWrite(4, LOW);
      delayMicroseconds(400);
    }
    Serial.println("Y1+Y2 done");

    sendResponse("ok TEST", fromWiFi);
    return;
  }

  // Handle $LIMITS command: $LIMITS=200,300 (X max, Y max in mm)
  if (strncmp(line, "$LIMITS=", 8) == 0) {
    String params = String(line + 8);
    int commaIdx = params.indexOf(',');
    if (commaIdx > 0) {
      float xMax = params.substring(0, commaIdx).toFloat();
      float yMax = params.substring(commaIdx + 1).toFloat();
      if (xMax > 0 && yMax > 0) {
        motion.setSoftLimits(xMax, yMax);
        char buf[64];
        snprintf(buf, sizeof(buf), "ok LIMITS X:%.1f Y:%.1f", xMax, yMax);
        sendResponse(buf, fromWiFi);
      } else {
        sendResponse("error INVALID_LIMITS", fromWiFi);
      }
    } else {
      sendResponse("error INVALID_LIMITS", fromWiFi);
    }
    return;
  }

  // Handle $STEPS command: $STEPS=47.4,47.4,400 (X, Y, Z steps per mm)
  if (strncmp(line, "$STEPS=", 7) == 0) {
    String params = String(line + 7);
    int comma1 = params.indexOf(',');
    int comma2 = params.indexOf(',', comma1 + 1);
    if (comma1 > 0 && comma2 > comma1) {
      float x = params.substring(0, comma1).toFloat();
      float y = params.substring(comma1 + 1, comma2).toFloat();
      float z = params.substring(comma2 + 1).toFloat();
      if (x > 0 && y > 0 && z > 0) {
        motion.setStepsPerMm(x, y, z);
        char buf[64];
        snprintf(buf, sizeof(buf), "ok STEPS X:%.2f Y:%.2f Z:%.2f", x, y, z);
        sendResponse(buf, fromWiFi);
      } else {
        sendResponse("error INVALID_STEPS", fromWiFi);
      }
    } else {
      sendResponse("error INVALID_STEPS", fromWiFi);
    }
    return;
  }

  // Handle $EASING command: $EASING=1 (enabled) or $EASING=0 (disabled)
  if (strncmp(line, "$EASING=", 8) == 0) {
    int val = atoi(line + 8);
    motion.setEasing(val == 1);
    char buf[32];
    snprintf(buf, sizeof(buf), "ok EASING:%d", val == 1 ? 1 : 0);
    sendResponse(buf, fromWiFi);
    return;
  }

  // Handle $SOFTLIMITS command: $SOFTLIMITS=1 (enabled) or $SOFTLIMITS=0 (disabled)
  if (strncmp(line, "$SOFTLIMITS=", 12) == 0) {
    int val = atoi(line + 12);
    motion.setSoftLimitsEnabled(val == 1);
    char buf[32];
    snprintf(buf, sizeof(buf), "ok SOFTLIMITS:%d", val == 1 ? 1 : 0);
    sendResponse(buf, fromWiFi);
    return;
  }

  // Commands while paused - acknowledge but don't execute (clears in-flight count)
  if (isPaused) {
    sendResponse("ok PAUSED", fromWiFi);
    return;
  }

  // Wait for motion to complete before processing next command
  while (motion.isMoving()) {
    motion.update();
    if (useWiFi) wifi.update();
  }

  // Parse G-code
  GCodeCommand cmd;
  if (!parser.parse(line, cmd)) {
    // Empty line or comment - just acknowledge
    sendResponse("ok", fromWiFi);
    return;
  }

  bool suspendTimeout = false;
  if (useWiFi) {
    switch (cmd.type) {
      case GCODE_G0:
      case GCODE_G1:
      case GCODE_G2:
      case GCODE_G3:
      case GCODE_G28:
        wifi.setTimeoutEnabled(false);
        suspendTimeout = true;
        break;
      default:
        break;
    }
  }

  // Execute command
  executeCommand(cmd, fromWiFi);

  if (suspendTimeout) {
    wifi.setTimeoutEnabled(true);
  }
}

void executeCommand(const GCodeCommand& cmd, bool fromWiFi) {
  switch (cmd.type) {
    case GCODE_G0:
      motion.rapidMove(cmd.x, cmd.y, cmd.z, cmd.hasX, cmd.hasY, cmd.hasZ);
      break;

    case GCODE_G1:
      motion.linearMove(cmd.x, cmd.y, cmd.z, cmd.hasX, cmd.hasY, cmd.hasZ, cmd.f);
      break;

    case GCODE_G2:
      // Clockwise arc
      motion.arcMove(cmd.x, cmd.y, cmd.i, cmd.j, cmd.r, cmd.hasI, cmd.hasJ, cmd.hasR, cmd.f, true);
      break;

    case GCODE_G3:
      // Counter-clockwise arc
      motion.arcMove(cmd.x, cmd.y, cmd.i, cmd.j, cmd.r, cmd.hasI, cmd.hasJ, cmd.hasR, cmd.f, false);
      break;

    case GCODE_G5:
      // Cubic Bezier (control points are offsets from start)
      motion.bezierMove(cmd.x, cmd.y, cmd.i, cmd.j, cmd.p, cmd.q,
                        cmd.hasX, cmd.hasY, cmd.hasI, cmd.hasJ, cmd.hasP, cmd.hasQ,
                        cmd.f);
      break;

    case GCODE_G6:
      // Full ellipse (center X/Y, radii I/J), CCW
      motion.ellipseMove(cmd.x, cmd.y, cmd.i, cmd.j,
                         cmd.hasX, cmd.hasY, cmd.hasI, cmd.hasJ,
                         cmd.f);
      break;

    case GCODE_G28:
      motion.homeAxes();
      break;

    case GCODE_G90:
      motion.setAbsoluteMode(true);
      break;

    case GCODE_G91:
      motion.setAbsoluteMode(false);
      break;

    case GCODE_G92:
      // Set position without moving
      motion.setPosition(cmd.x, cmd.y, cmd.z, cmd.hasX, cmd.hasY, cmd.hasZ);
      break;

    case GCODE_M3:
      motion.penDown();
      break;

    case GCODE_M5:
      motion.penUp();
      break;

    case GCODE_M114:
      reportPosition(fromWiFi);
      return;  // Position report includes ok

    default:
      sendResponse("error UNKNOWN_COMMAND", fromWiFi);
      return;
  }

  // Don't send ok if stopped during motion - response was already sent by checkForStopCommands
  if (!isPaused) {
    sendResponse("ok", fromWiFi);
  }
}

void reportPosition(bool fromWiFi) {
  char buf[64];
  snprintf(buf, sizeof(buf), "ok X:%.2f Y:%.2f Z:%.2f",
           motion.getX(), motion.getY(), motion.getZ());
  sendResponse(buf, fromWiFi);
}

void reportStatus(bool fromWiFi) {
  char buf[128];
  snprintf(buf, sizeof(buf), "ok STATUS running:%d paused:%d moving:%d mode:%s pos:%.2f,%.2f,%.2f",
           isRunning ? 1 : 0,
           isPaused ? 1 : 0,
           motion.isMoving() ? 1 : 0,
           motion.isAbsoluteMode() ? "ABS" : "REL",
           motion.getX(), motion.getY(), motion.getZ());
  sendResponse(buf, fromWiFi);
}

void emergencyStop() {
  isPaused = true;
  motion.requestStop();
  motion.setEnabled(false);
  delay(100);
  motion.setEnabled(true);
}

void resetState() {
  isPaused = false;
  isRunning = false;
  motion.clearStop();
  motion.setEnabled(true);
}

void sendResponse(const char* response, bool fromWiFi) {
  Serial.println(response);  // Always echo to serial for debugging
  if (fromWiFi && useWiFi && wifi.hasClient()) {
    wifi.sendMessage(response);
  }
}

// Check for stop commands during motion (called from motion planner)
// This allows stop/pause to work even while a move is in progress
void checkForStopCommands() {
  // Check WiFi for stop commands
  if (useWiFi) {
    wifi.update();
    if (wifi.hasData()) {
      String line = wifi.readLine();
      line.trim();
      if (line == "!" || line.equalsIgnoreCase("STOP")) {
        isPaused = true;
        motion.requestStop();
        wifi.sendMessage("ok STOPPED");
        Serial.println(">> STOP (during motion)");
      } else if (line.equalsIgnoreCase("PAUSE")) {
        isPaused = true;
        wifi.sendMessage("ok PAUSED");
        Serial.println(">> PAUSE (during motion)");
      }
      // Other commands are ignored during motion
    }
  }

  // Check Serial for stop commands
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line == "!" || line.equalsIgnoreCase("STOP")) {
      isPaused = true;
      motion.requestStop();
      Serial.println("ok STOPPED (during motion)");
    } else if (line.equalsIgnoreCase("PAUSE")) {
      isPaused = true;
      Serial.println("ok PAUSED (during motion)");
    }
    // Other commands are ignored during motion
  }
}
