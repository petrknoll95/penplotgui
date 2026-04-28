#ifndef MOTION_PLANNER_H
#define MOTION_PLANNER_H

#include <Arduino.h>
#include <Servo.h>

// CNC Shield v3.0 pin mappings
// X axis: single motor on X header
// Y axis: dual motors - Y header + Z header (second Y motor on Z)
#define X_STEP_PIN 2
#define X_DIR_PIN 5
#define Y_STEP_PIN 3
#define Y_DIR_PIN 6
#define Y2_STEP_PIN 4   // Second Y motor on Z header
#define Y2_DIR_PIN 7    // Second Y motor on Z header
#define ENABLE_PIN 8

// Servo for pen lift (on Z+ limit switch header)
#define SERVO_PIN 11
#define SERVO_UP_ANGLE 90      // Angle when pen is up (adjust as needed)
#define SERVO_DOWN_ANGLE 45    // Angle when pen is down (adjust as needed)
#define SERVO_MOVE_DELAY 250   // ms to wait for servo to reach position

// Set to true if motor needs reversed direction
#define X_DIR_INVERTED true
#define Y_DIR_INVERTED true
#define Y2_DIR_INVERTED true

// Default configuration
#define STEPS_PER_MM_X 53.3f
#define STEPS_PER_MM_Y 53.3f
#define STEPS_PER_MM_Z 400.0f

#define DEFAULT_RAPID_SPEED 3000    // mm/min
#define DEFAULT_FEED_SPEED 1000     // mm/min
#define MAX_SPEED 5000              // mm/min

// Stepping timing
#define MIN_STEP_DELAY 200    // microseconds (max speed)
#define MAX_STEP_DELAY 2000   // microseconds (min speed)

// Debug output (set to 1 to enable)
#define DEBUG_STEPPING 0
#define DEBUG_ARCS 0

// Don't apply easing to very short moves (prevents choppy curves made of many segments)
#define EASING_MIN_MM 1.0f

// Easing uses sinusoidal profile across entire movement (no separate accel/decel phases)

// Soft limits (max bed size)
#define DEFAULT_SOFT_LIMIT_X_MAX 426.0f
#define DEFAULT_SOFT_LIMIT_Y_MAX 599.0f

enum MotionState {
  MOTION_IDLE,
  MOTION_RUNNING,
  MOTION_HOMING
};

class MotionPlanner {
public:
  MotionPlanner();

  void begin();
  void setEnabled(bool enabled);

  // Movement commands
  void rapidMove(float x, float y, float z, bool hasX, bool hasY, bool hasZ);
  void linearMove(float x, float y, float z, bool hasX, bool hasY, bool hasZ, float feedRate);
  void arcMove(float x, float y, float i, float j, float r, bool hasI, bool hasJ, bool hasR, float feedRate, bool clockwise);
  void bezierMove(float x, float y, float i, float j, float p, float q,
                  bool hasX, bool hasY, bool hasI, bool hasJ, bool hasP, bool hasQ,
                  float feedRate);
  void ellipseMove(float x, float y, float i, float j,
                   bool hasX, bool hasY, bool hasI, bool hasJ,
                   float feedRate);
  void homeAxes();
  void penUp();
  void penDown();

  // Position management
  void setAbsoluteMode(bool absolute);
  bool isAbsoluteMode() const { return absoluteMode; }

  float getX() const { return currentX; }
  float getY() const { return currentY; }
  float getZ() const { return currentZ; }

  // Motion status
  bool isMoving() { return moving; }
  void update() {}  // Not needed for blocking moves

  // Stop control - allows external code to stop motion mid-move
  void setStopFlag(volatile bool* flag) { stopFlag = flag; }
  void setStopCallback(void (*callback)()) { stopCallback = callback; }
  void requestStop() { stopRequested = true; }
  void clearStop() { stopRequested = false; }
  bool wasStopped() const { return stopRequested; }

  // Configuration
  void setStepsPerMm(float x, float y, float z);
  void setPenPositions(float upPos, float downPos);
  void setRapidSpeed(float speed) { rapidSpeed = speed; }
  void setFeedSpeed(float speed) { defaultFeedSpeed = speed; }
  void setSoftLimits(float xMax, float yMax);
  void setSoftLimitsEnabled(bool enabled) { softLimitsEnabled = enabled; }
  float getSoftLimitX() const { return softLimitXMax; }
  float getSoftLimitY() const { return softLimitYMax; }
  bool isSoftLimitsEnabled() const { return softLimitsEnabled; }
  void setEasing(bool enabled) { easingEnabled = enabled; }
  bool isEasingEnabled() const { return easingEnabled; }

  // Set current position without moving (G92)
  void setPosition(float x, float y, float z, bool hasX, bool hasY, bool hasZ) {
    if (hasX) currentX = x;
    if (hasY) currentY = y;
    if (hasZ) currentZ = z;
  }

private:
  float stepsPerMmX, stepsPerMmY, stepsPerMmZ;
  float currentX, currentY, currentZ;

  float rapidSpeed;
  float defaultFeedSpeed;

  float penUpPosition;
  float penDownPosition;
  bool penIsDown;
  Servo penServo;

  bool absoluteMode;
  MotionState state;
  bool moving;

  // Soft limits
  float softLimitXMax;
  float softLimitYMax;
  bool softLimitsEnabled;

  // Easing (acceleration/deceleration)
  bool easingEnabled;

  // Stop control
  volatile bool* stopFlag;      // External flag (e.g., isPaused from main)
  volatile bool stopRequested;  // Internal stop request
  void (*stopCallback)();       // Callback to poll for stop commands

  // Fast check if stop was requested (just checks flags, no polling)
  bool shouldStop() {
    return stopRequested || (stopFlag != nullptr && *stopFlag);
  }

  // Slower check that also polls for incoming commands via callback
  // Call this less frequently to avoid timing issues
  bool shouldStopWithPoll() {
    if (stopCallback != nullptr) {
      stopCallback();
    }
    return shouldStop();
  }

  // Direct stepping - returns actual steps taken (for position tracking)
  void stepAxis(int stepPin, int dirPin, long steps, int delayUs);
  void stepXY(long stepsX, long stepsY, float feedRate, bool allowEasing,
              long* actualStepsX = nullptr, long* actualStepsY = nullptr);
  long mmToSteps(float mm, float stepsPerMm);
  float stepsToMm(long steps, float stepsPerMm);
  int feedRateToDelay(float feedRate, float stepsPerMm);
  float clampToLimits(float value, float minVal, float maxVal);
};

MotionPlanner::MotionPlanner()
  : stepsPerMmX(STEPS_PER_MM_X),
    stepsPerMmY(STEPS_PER_MM_Y),
    stepsPerMmZ(STEPS_PER_MM_Z),
    currentX(0), currentY(0), currentZ(0),
    rapidSpeed(DEFAULT_RAPID_SPEED),
    defaultFeedSpeed(DEFAULT_FEED_SPEED),
    penUpPosition(5.0f),
    penDownPosition(0.0f),
    penIsDown(false),
    absoluteMode(true),
    state(MOTION_IDLE),
    moving(false),
    softLimitXMax(DEFAULT_SOFT_LIMIT_X_MAX),
    softLimitYMax(DEFAULT_SOFT_LIMIT_Y_MAX),
    softLimitsEnabled(true),
    easingEnabled(true),
    stopFlag(nullptr),
    stopRequested(false),
    stopCallback(nullptr) {
}

void MotionPlanner::begin() {
  // Configure all pins
  pinMode(X_STEP_PIN, OUTPUT);
  pinMode(X_DIR_PIN, OUTPUT);
  pinMode(Y_STEP_PIN, OUTPUT);
  pinMode(Y_DIR_PIN, OUTPUT);
  pinMode(Y2_STEP_PIN, OUTPUT);
  pinMode(Y2_DIR_PIN, OUTPUT);
  pinMode(ENABLE_PIN, OUTPUT);

  // Initialize pins LOW
  digitalWrite(X_STEP_PIN, LOW);
  digitalWrite(Y_STEP_PIN, LOW);
  digitalWrite(Y2_STEP_PIN, LOW);
  digitalWrite(X_DIR_PIN, LOW);
  digitalWrite(Y_DIR_PIN, LOW);
  digitalWrite(Y2_DIR_PIN, LOW);

  // Enable drivers
  setEnabled(true);

  // Initialize servo for pen lift
  penServo.attach(SERVO_PIN);
  penServo.write(SERVO_UP_ANGLE);  // Start with pen up
  delay(SERVO_MOVE_DELAY);

  // Initial position
  currentX = currentY = currentZ = 0;
}

void MotionPlanner::setEnabled(bool enabled) {
  digitalWrite(ENABLE_PIN, enabled ? LOW : HIGH);  // CNC Shield: LOW = enabled
}

long MotionPlanner::mmToSteps(float mm, float stepsPerMm) {
  return (long)(mm * stepsPerMm);
}

float MotionPlanner::stepsToMm(long steps, float stepsPerMm) {
  return (float)steps / stepsPerMm;
}

int MotionPlanner::feedRateToDelay(float feedRate, float stepsPerMm) {
  // feedRate in mm/min -> step delay in microseconds
  float mmPerSec = feedRate / 60.0f;
  float stepsPerSec = mmPerSec * stepsPerMm;
  if (stepsPerSec <= 0) return MAX_STEP_DELAY;
  int delayUs = (int)(1000000.0f / stepsPerSec);
  if (delayUs < MIN_STEP_DELAY) delayUs = MIN_STEP_DELAY;
  if (delayUs > MAX_STEP_DELAY) delayUs = MAX_STEP_DELAY;
  return delayUs;
}

float MotionPlanner::clampToLimits(float value, float minVal, float maxVal) {
  if (value < minVal) return minVal;
  if (value > maxVal) return maxVal;
  return value;
}

void MotionPlanner::stepAxis(int stepPin, int dirPin, long steps, int delayUs) {
  if (steps == 0) return;

  // Set direction
  digitalWrite(dirPin, steps > 0 ? HIGH : LOW);
  delayMicroseconds(5);  // Direction setup time

  long totalSteps = abs(steps);
  for (long i = 0; i < totalSteps; i++) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(5);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(delayUs);
  }
}

void MotionPlanner::stepXY(long stepsX, long stepsY, float feedRate, bool allowEasing,
                           long* actualStepsX, long* actualStepsY) {
  if (stepsX == 0 && stepsY == 0) {
    if (actualStepsX) *actualStepsX = 0;
    if (actualStepsY) *actualStepsY = 0;
    return;
  }

  moving = true;

  // Set directions (apply inversion flags as needed)
  bool xDir = stepsX >= 0;
  if (X_DIR_INVERTED) xDir = !xDir;
  bool yDir = stepsY >= 0;
  if (Y_DIR_INVERTED) yDir = !yDir;
  bool y2Dir = Y2_DIR_INVERTED ? !yDir : yDir;  // Second Y motor may need inverted direction

  digitalWrite(X_DIR_PIN, xDir ? HIGH : LOW);
  digitalWrite(Y_DIR_PIN, yDir ? HIGH : LOW);
  digitalWrite(Y2_DIR_PIN, y2Dir ? HIGH : LOW);
  delayMicroseconds(50);  // Direction setup time

  #if DEBUG_STEPPING
  // Debug output
  Serial.print("stepXY: X=");
  Serial.print(stepsX);
  Serial.print(" Y=");
  Serial.print(stepsY);
  Serial.print(" (Y1dir=");
  Serial.print(yDir ? "+" : "-");
  Serial.print(", Y2dir=");
  Serial.print(y2Dir ? "+" : "-");
  Serial.println(")");
  #endif

  long absX = abs(stepsX);
  long absY = abs(stepsY);
  long totalSteps = max(absX, absY);

  // Calculate step delay from feed rate (use average of X/Y)
  int baseDelay = feedRateToDelay(feedRate, (stepsPerMmX + stepsPerMmY) / 2.0f);
  // Start/end at 2x slower than target speed (not absolute slow)
  int startDelay = min(MAX_STEP_DELAY, baseDelay * 2);

  // Bresenham-style coordinated stepping
  long errX = totalSteps / 2;
  long errY = totalSteps / 2;
  long doneX = 0, doneY = 0;

  for (long i = 0; i < totalSteps; i++) {
    bool stepX = false, stepY = false;

    errX += absX;
    if (errX >= totalSteps) {
      errX -= totalSteps;
      if (doneX < absX) {
        stepX = true;
        doneX++;
      }
    }

    errY += absY;
    if (errY >= totalSteps) {
      errY -= totalSteps;
      if (doneY < absY) {
        stepY = true;
        doneY++;
      }
    }

    // Pulse X and Y+Y2 (dual Y motors)
    if (stepX) digitalWrite(X_STEP_PIN, HIGH);
    if (stepY) {
      digitalWrite(Y_STEP_PIN, HIGH);
      digitalWrite(Y2_STEP_PIN, HIGH);
    }
    delayMicroseconds(5);
    if (stepX) digitalWrite(X_STEP_PIN, LOW);
    if (stepY) {
      digitalWrite(Y_STEP_PIN, LOW);
      digitalWrite(Y2_STEP_PIN, LOW);
    }

    // Calculate delay with smooth sinusoidal easing across entire movement
    // Speed profile: slow at start -> fastest at middle -> slow at end
    int stepDelay = baseDelay;
  float moveMmX = (stepsPerMmX > 0) ? ((float)absX / stepsPerMmX) : 0.0f;
  float moveMmY = (stepsPerMmY > 0) ? ((float)absY / stepsPerMmY) : 0.0f;
  float moveMm = max(moveMmX, moveMmY);
  bool useEasing = allowEasing && easingEnabled && totalSteps > 1 && moveMm >= EASING_MIN_MM;
  if (useEasing) {
    // t goes from 0 to 1 across the movement
    float t = (float)i / (float)(totalSteps - 1);
    // sin(t * PI) gives 0 at start, 1 at middle, 0 at end
    // We want delay high at start/end (slow), low in middle (fast)
    float easeFactor = 1.0f - sin(t * PI);
      stepDelay = baseDelay + (int)((startDelay - baseDelay) * easeFactor);
    }

    delayMicroseconds(stepDelay);
  }

  // Return actual steps taken (with correct sign)
  if (actualStepsX) *actualStepsX = (stepsX >= 0) ? doneX : -doneX;
  if (actualStepsY) *actualStepsY = (stepsY >= 0) ? doneY : -doneY;

  moving = false;
}

void MotionPlanner::rapidMove(float x, float y, float z, bool hasX, bool hasY, bool hasZ) {
  float newX = hasX ? (absoluteMode ? x : currentX + x) : currentX;
  float newY = hasY ? (absoluteMode ? y : currentY + y) : currentY;
  // Z ignored - Z pins used for dual X motors

  // Apply soft limits
  if (softLimitsEnabled) {
    newX = clampToLimits(newX, 0.0f, softLimitXMax);
    newY = clampToLimits(newY, 0.0f, softLimitYMax);
  }

  // XY move (X uses dual motors on X and Z pins)
  if (hasX || hasY) {
    long stepsX = mmToSteps(newX - currentX, stepsPerMmX);
    long stepsY = mmToSteps(newY - currentY, stepsPerMmY);
    long actualX, actualY;
    stepXY(stepsX, stepsY, rapidSpeed, true, &actualX, &actualY);
    // Update position based on actual steps taken
    currentX += stepsToMm(actualX, stepsPerMmX);
    currentY += stepsToMm(actualY, stepsPerMmY);
  }
}

void MotionPlanner::linearMove(float x, float y, float z, bool hasX, bool hasY, bool hasZ, float feedRate) {
  if (feedRate <= 0) feedRate = defaultFeedSpeed;
  if (feedRate > MAX_SPEED) feedRate = MAX_SPEED;

  float newX = hasX ? (absoluteMode ? x : currentX + x) : currentX;
  float newY = hasY ? (absoluteMode ? y : currentY + y) : currentY;
  // Z ignored - Z pins used for dual X motors

  // Apply soft limits
  if (softLimitsEnabled) {
    newX = clampToLimits(newX, 0.0f, softLimitXMax);
    newY = clampToLimits(newY, 0.0f, softLimitYMax);
  }

  // XY move (X uses dual motors on X and Z pins)
  if (hasX || hasY) {
    long stepsX = mmToSteps(newX - currentX, stepsPerMmX);
    long stepsY = mmToSteps(newY - currentY, stepsPerMmY);
    long actualX, actualY;
    // Always ease straight-line G1 moves (pen up or down)
    stepXY(stepsX, stepsY, feedRate, true, &actualX, &actualY);
    // Update position based on actual steps taken
    currentX += stepsToMm(actualX, stepsPerMmX);
    currentY += stepsToMm(actualY, stepsPerMmY);
  }
}

void MotionPlanner::arcMove(float x, float y, float i, float j, float r, bool hasI, bool hasJ, bool hasR, float feedRate, bool clockwise) {
  if (feedRate <= 0) feedRate = defaultFeedSpeed;
  if (feedRate > MAX_SPEED) feedRate = MAX_SPEED;

  // Target position (absolute)
  float targetX = absoluteMode ? x : currentX + x;
  float targetY = absoluteMode ? y : currentY + y;

  // Apply soft limits to target
  if (softLimitsEnabled) {
    targetX = clampToLimits(targetX, 0.0f, softLimitXMax);
    targetY = clampToLimits(targetY, 0.0f, softLimitYMax);
  }

  // Calculate arc center
  float centerX, centerY, radius;

  if (hasI || hasJ) {
    // I/J are offsets from current position to center
    centerX = currentX + (hasI ? i : 0.0f);
    centerY = currentY + (hasJ ? j : 0.0f);
    // Calculate radius from start to center
    float dx = currentX - centerX;
    float dy = currentY - centerY;
    radius = sqrt(dx * dx + dy * dy);
  } else if (hasR) {
    // R is radius - calculate center
    radius = abs(r);
    float dx = targetX - currentX;
    float dy = targetY - currentY;
    float dist = sqrt(dx * dx + dy * dy);

    if (dist > 2 * radius) {
      // Can't reach target with this radius, fall back to line
      linearMove(x, y, 0, true, true, false, feedRate);
      return;
    }

    // Calculate center offset perpendicular to chord
    float h = sqrt(radius * radius - (dist / 2) * (dist / 2));
    float mx = (currentX + targetX) / 2;
    float my = (currentY + targetY) / 2;

    // Perpendicular direction
    float px = -dy / dist;
    float py = dx / dist;

    // Choose center based on clockwise direction and sign of R
    if ((clockwise && r > 0) || (!clockwise && r < 0)) {
      centerX = mx + h * px;
      centerY = my + h * py;
    } else {
      centerX = mx - h * px;
      centerY = my - h * py;
    }
  } else {
    // No arc parameters, do linear move
    linearMove(x, y, 0, true, true, false, feedRate);
    return;
  }

  // Calculate start and end angles
  float startAngle = atan2(currentY - centerY, currentX - centerX);
  float endAngle = atan2(targetY - centerY, targetX - centerX);

  // Calculate angular sweep
  float sweep;
  if (clockwise) {
    sweep = startAngle - endAngle;
    if (sweep <= 0) sweep += 2 * PI;
  } else {
    sweep = endAngle - startAngle;
    if (sweep <= 0) sweep += 2 * PI;
  }

  // Calculate number of segments based on arc length
  float arcLength = radius * sweep;
  // Use ~0.5mm segments for smooth curves
  int numSegments = max(1, (int)(arcLength / 0.5f));
  numSegments = min(numSegments, 500);  // Cap at 500 segments

  #if DEBUG_ARCS
  Serial.print("Arc: center=(");
  Serial.print(centerX);
  Serial.print(",");
  Serial.print(centerY);
  Serial.print(") r=");
  Serial.print(radius);
  Serial.print(" sweep=");
  Serial.print(sweep * 180 / PI);
  Serial.print("deg segs=");
  Serial.println(numSegments);
  #endif

  // Interpolate arc into linear segments
  for (int seg = 1; seg <= numSegments; seg++) {

    float t = (float)seg / numSegments;
    float angle;

    if (clockwise) {
      angle = startAngle - t * sweep;
    } else {
      angle = startAngle + t * sweep;
    }

    float nextX = centerX + radius * cos(angle);
    float nextY = centerY + radius * sin(angle);

    // Apply soft limits
    if (softLimitsEnabled) {
      nextX = clampToLimits(nextX, 0.0f, softLimitXMax);
      nextY = clampToLimits(nextY, 0.0f, softLimitYMax);
    }

    // Move to this point
    long stepsX = mmToSteps(nextX - currentX, stepsPerMmX);
    long stepsY = mmToSteps(nextY - currentY, stepsPerMmY);

    if (stepsX != 0 || stepsY != 0) {
      long actualX, actualY;
      stepXY(stepsX, stepsY, feedRate, !penIsDown, &actualX, &actualY);
      // Update position based on actual steps taken
      currentX += stepsToMm(actualX, stepsPerMmX);
      currentY += stepsToMm(actualY, stepsPerMmY);
    }
  }

  // Ensure we end at exact target position
  long finalStepsX = mmToSteps(targetX - currentX, stepsPerMmX);
  long finalStepsY = mmToSteps(targetY - currentY, stepsPerMmY);
  if (finalStepsX != 0 || finalStepsY != 0) {
    long actualX, actualY;
    stepXY(finalStepsX, finalStepsY, feedRate, !penIsDown, &actualX, &actualY);
    currentX += stepsToMm(actualX, stepsPerMmX);
    currentY += stepsToMm(actualY, stepsPerMmY);
  }
}

void MotionPlanner::bezierMove(float x, float y, float i, float j, float p, float q,
                               bool hasX, bool hasY, bool hasI, bool hasJ, bool hasP, bool hasQ,
                               float feedRate) {
  if (feedRate <= 0) feedRate = defaultFeedSpeed;
  if (feedRate > MAX_SPEED) feedRate = MAX_SPEED;

  // Require full control points
  if (!hasI || !hasJ || !hasP || !hasQ) {
    linearMove(x, y, 0, hasX, hasY, false, feedRate);
    return;
  }

  float startX = currentX;
  float startY = currentY;

  float endX = hasX ? (absoluteMode ? x : currentX + x) : currentX;
  float endY = hasY ? (absoluteMode ? y : currentY + y) : currentY;

  // Control points are offsets from start
  float c1x = startX + i;
  float c1y = startY + j;
  float c2x = startX + p;
  float c2y = startY + q;

  // Apply soft limits to end
  if (softLimitsEnabled) {
    endX = clampToLimits(endX, 0.0f, softLimitXMax);
    endY = clampToLimits(endY, 0.0f, softLimitYMax);
  }

  // Estimate curve length by sampling
  const int sampleCount = 20;
  float prevX = startX;
  float prevY = startY;
  float length = 0.0f;
  for (int s = 1; s <= sampleCount; s++) {
    float t = (float)s / (float)sampleCount;
    float mt = 1.0f - t;
    float px = (mt * mt * mt) * startX +
               3.0f * (mt * mt) * t * c1x +
               3.0f * mt * (t * t) * c2x +
               (t * t * t) * endX;
    float py = (mt * mt * mt) * startY +
               3.0f * (mt * mt) * t * c1y +
               3.0f * mt * (t * t) * c2y +
               (t * t * t) * endY;
    float dx = px - prevX;
    float dy = py - prevY;
    length += sqrt(dx * dx + dy * dy);
    prevX = px;
    prevY = py;
  }

  int numSegments = max(1, (int)(length / 0.5f));
  numSegments = min(numSegments, 2000);

  for (int seg = 1; seg <= numSegments; seg++) {
    float t = (float)seg / (float)numSegments;
    float mt = 1.0f - t;
    float nextX = (mt * mt * mt) * startX +
                  3.0f * (mt * mt) * t * c1x +
                  3.0f * mt * (t * t) * c2x +
                  (t * t * t) * endX;
    float nextY = (mt * mt * mt) * startY +
                  3.0f * (mt * mt) * t * c1y +
                  3.0f * mt * (t * t) * c2y +
                  (t * t * t) * endY;

    if (softLimitsEnabled) {
      nextX = clampToLimits(nextX, 0.0f, softLimitXMax);
      nextY = clampToLimits(nextY, 0.0f, softLimitYMax);
    }

    long stepsX = mmToSteps(nextX - currentX, stepsPerMmX);
    long stepsY = mmToSteps(nextY - currentY, stepsPerMmY);
    if (stepsX != 0 || stepsY != 0) {
      long actualX, actualY;
      stepXY(stepsX, stepsY, feedRate, !penIsDown, &actualX, &actualY);
      currentX += stepsToMm(actualX, stepsPerMmX);
      currentY += stepsToMm(actualY, stepsPerMmY);
    }
  }

  // Ensure exact end position
  long finalStepsX = mmToSteps(endX - currentX, stepsPerMmX);
  long finalStepsY = mmToSteps(endY - currentY, stepsPerMmY);
  if (finalStepsX != 0 || finalStepsY != 0) {
    long actualX, actualY;
    stepXY(finalStepsX, finalStepsY, feedRate, !penIsDown, &actualX, &actualY);
    currentX += stepsToMm(actualX, stepsPerMmX);
    currentY += stepsToMm(actualY, stepsPerMmY);
  }
}

void MotionPlanner::ellipseMove(float x, float y, float i, float j,
                                bool hasX, bool hasY, bool hasI, bool hasJ,
                                float feedRate) {
  if (feedRate <= 0) feedRate = defaultFeedSpeed;
  if (feedRate > MAX_SPEED) feedRate = MAX_SPEED;

  if (!hasX || !hasY || !hasI || !hasJ) {
    return;
  }

  float centerX = absoluteMode ? x : currentX + x;
  float centerY = absoluteMode ? y : currentY + y;
  float rx = abs(i);
  float ry = abs(j);

  if (rx <= 0.0f || ry <= 0.0f) {
    return;
  }

  // Start angle based on current position
  float startAngle = atan2(currentY - centerY, currentX - centerX);

  // Approximate circumference (Ramanujan)
  float h = ((rx - ry) * (rx - ry)) / ((rx + ry) * (rx + ry));
  float circumference = PI * (rx + ry) * (1.0f + (3.0f * h) / (10.0f + sqrt(4.0f - 3.0f * h)));

  int numSegments = max(1, (int)(circumference / 0.5f));
  numSegments = min(numSegments, 3000);

  for (int seg = 1; seg <= numSegments; seg++) {
    float t = (float)seg / (float)numSegments;
    float angle = startAngle + t * 2.0f * PI;  // CCW

    float nextX = centerX + rx * cos(angle);
    float nextY = centerY + ry * sin(angle);

    if (softLimitsEnabled) {
      nextX = clampToLimits(nextX, 0.0f, softLimitXMax);
      nextY = clampToLimits(nextY, 0.0f, softLimitYMax);
    }

    long stepsX = mmToSteps(nextX - currentX, stepsPerMmX);
    long stepsY = mmToSteps(nextY - currentY, stepsPerMmY);
    if (stepsX != 0 || stepsY != 0) {
      long actualX, actualY;
      stepXY(stepsX, stepsY, feedRate, !penIsDown, &actualX, &actualY);
      currentX += stepsToMm(actualX, stepsPerMmX);
      currentY += stepsToMm(actualY, stepsPerMmY);
    }
  }

  // Return to exact start position on the ellipse
  float startX = centerX + rx * cos(startAngle);
  float startY = centerY + ry * sin(startAngle);
  long finalStepsX = mmToSteps(startX - currentX, stepsPerMmX);
  long finalStepsY = mmToSteps(startY - currentY, stepsPerMmY);
  if (finalStepsX != 0 || finalStepsY != 0) {
    long actualX, actualY;
    stepXY(finalStepsX, finalStepsY, feedRate, !penIsDown, &actualX, &actualY);
    currentX += stepsToMm(actualX, stepsPerMmX);
    currentY += stepsToMm(actualY, stepsPerMmY);
  }
}

void MotionPlanner::homeAxes() {
  state = MOTION_HOMING;

  // Lift pen before moving
  penUp();

  // Calculate steps to move back to origin
  long stepsX = mmToSteps(-currentX, stepsPerMmX);
  long stepsY = mmToSteps(-currentY, stepsPerMmY);

  // Move to origin at rapid speed
  if (stepsX != 0 || stepsY != 0) {
    long actualX, actualY;
    stepXY(stepsX, stepsY, rapidSpeed, true, &actualX, &actualY);
    // Update position based on actual steps taken
    currentX += stepsToMm(actualX, stepsPerMmX);
    currentY += stepsToMm(actualY, stepsPerMmY);
  }

  // Position should now be at or near 0,0
  currentZ = 0;

  state = MOTION_IDLE;
}

void MotionPlanner::penUp() {
  if (!penIsDown) return;  // Already up
  penServo.write(SERVO_UP_ANGLE);
  delay(SERVO_MOVE_DELAY);
  penIsDown = false;
  currentZ = penUpPosition;
}

void MotionPlanner::penDown() {
  if (penIsDown) return;  // Already down
  penServo.write(SERVO_DOWN_ANGLE);
  delay(SERVO_MOVE_DELAY);
  penIsDown = true;
  currentZ = penDownPosition;
}

void MotionPlanner::setAbsoluteMode(bool absolute) {
  absoluteMode = absolute;
}

void MotionPlanner::setStepsPerMm(float x, float y, float z) {
  stepsPerMmX = x;
  stepsPerMmY = y;
  stepsPerMmZ = z;
}

void MotionPlanner::setPenPositions(float upPos, float downPos) {
  penUpPosition = upPos;
  penDownPosition = downPos;
}

void MotionPlanner::setSoftLimits(float xMax, float yMax) {
  softLimitXMax = xMax;
  softLimitYMax = yMax;
}

#endif // MOTION_PLANNER_H
