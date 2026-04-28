#ifndef GCODE_PARSER_H
#define GCODE_PARSER_H

#include <Arduino.h>

// G-code command types
enum GCodeType {
  GCODE_NONE = 0,
  GCODE_G0,   // Rapid move
  GCODE_G1,   // Linear interpolated move
  GCODE_G2,   // Clockwise arc
  GCODE_G3,   // Counter-clockwise arc
  GCODE_G5,   // Cubic Bezier
  GCODE_G6,   // Ellipse (full)
  GCODE_G28,  // Home axes
  GCODE_G90,  // Absolute positioning
  GCODE_G91,  // Relative positioning
  GCODE_G92,  // Set position (coordinate offset)
  GCODE_M3,   // Pen down (spindle on)
  GCODE_M5,   // Pen up (spindle off)
  GCODE_M114, // Report position
  GCODE_UNKNOWN
};

// Parsed G-code command structure
struct GCodeCommand {
  GCodeType type;
  bool hasX;
  bool hasY;
  bool hasZ;
  bool hasF;
  bool hasI;
  bool hasJ;
  bool hasR;
  bool hasP;
  bool hasQ;
  float x;
  float y;
  float z;
  float f;  // Feed rate
  float i;  // Arc center X offset (relative to start)
  float j;  // Arc center Y offset (relative to start)
  float r;  // Arc radius (alternative to I/J)
  float p;  // Bezier control2 X offset (relative to start)
  float q;  // Bezier control2 Y offset (relative to start)
};

class GCodeParser {
public:
  GCodeParser();

  // Parse a line of G-code, returns true if valid command
  bool parse(const char* line, GCodeCommand& cmd);

private:
  // Skip whitespace and return pointer to next non-whitespace
  const char* skipWhitespace(const char* p);

  // Parse a float value, returns pointer after the number
  const char* parseFloat(const char* p, float& value);

  // Parse parameter (X, Y, Z, F followed by number)
  const char* parseParameter(const char* p, GCodeCommand& cmd);
};

GCodeParser::GCodeParser() {
}

const char* GCodeParser::skipWhitespace(const char* p) {
  while (*p == ' ' || *p == '\t') p++;
  return p;
}

const char* GCodeParser::parseFloat(const char* p, float& value) {
  char* end;
  value = strtof(p, &end);
  return end;
}

const char* GCodeParser::parseParameter(const char* p, GCodeCommand& cmd) {
  p = skipWhitespace(p);

  char param = toupper(*p);
  if (param == 'X' || param == 'Y' || param == 'Z' || param == 'F' ||
      param == 'I' || param == 'J' || param == 'R' || param == 'P' || param == 'Q') {
    p++;
    float val;
    p = parseFloat(p, val);

    switch (param) {
      case 'X': cmd.hasX = true; cmd.x = val; break;
      case 'Y': cmd.hasY = true; cmd.y = val; break;
      case 'Z': cmd.hasZ = true; cmd.z = val; break;
      case 'F': cmd.hasF = true; cmd.f = val; break;
      case 'I': cmd.hasI = true; cmd.i = val; break;
      case 'J': cmd.hasJ = true; cmd.j = val; break;
      case 'R': cmd.hasR = true; cmd.r = val; break;
      case 'P': cmd.hasP = true; cmd.p = val; break;
      case 'Q': cmd.hasQ = true; cmd.q = val; break;
    }
  }

  return p;
}

bool GCodeParser::parse(const char* line, GCodeCommand& cmd) {
  // Initialize command
  cmd.type = GCODE_NONE;
  cmd.hasX = cmd.hasY = cmd.hasZ = cmd.hasF = false;
  cmd.hasI = cmd.hasJ = cmd.hasR = cmd.hasP = cmd.hasQ = false;
  cmd.x = cmd.y = cmd.z = cmd.f = 0.0f;
  cmd.i = cmd.j = cmd.r = cmd.p = cmd.q = 0.0f;

  const char* p = skipWhitespace(line);

  // Skip empty lines and comments
  if (*p == '\0' || *p == ';' || *p == '(' || *p == '\n' || *p == '\r') {
    return false;
  }

  // Parse command letter
  char cmdLetter = toupper(*p);
  p++;

  // Parse command number
  int cmdNum = 0;
  while (*p >= '0' && *p <= '9') {
    cmdNum = cmdNum * 10 + (*p - '0');
    p++;
  }

  // Identify command type
  if (cmdLetter == 'G') {
    switch (cmdNum) {
      case 0:  cmd.type = GCODE_G0; break;
      case 1:  cmd.type = GCODE_G1; break;
      case 2:  cmd.type = GCODE_G2; break;
      case 3:  cmd.type = GCODE_G3; break;
      case 5:  cmd.type = GCODE_G5; break;
      case 6:  cmd.type = GCODE_G6; break;
      case 28: cmd.type = GCODE_G28; break;
      case 90: cmd.type = GCODE_G90; break;
      case 91: cmd.type = GCODE_G91; break;
      case 92: cmd.type = GCODE_G92; break;
      default: cmd.type = GCODE_UNKNOWN; break;
    }
  } else if (cmdLetter == 'M') {
    switch (cmdNum) {
      case 3:   cmd.type = GCODE_M3; break;
      case 5:   cmd.type = GCODE_M5; break;
      case 114: cmd.type = GCODE_M114; break;
      default:  cmd.type = GCODE_UNKNOWN; break;
    }
  } else {
    cmd.type = GCODE_UNKNOWN;
  }

  // Parse parameters
  while (*p != '\0' && *p != ';' && *p != '(' && *p != '\n' && *p != '\r') {
    const char* oldP = p;
    p = parseParameter(p, cmd);
    if (p == oldP) {
      // No progress, skip character
      p++;
    }
  }

  return cmd.type != GCODE_NONE && cmd.type != GCODE_UNKNOWN;
}

#endif // GCODE_PARSER_H
