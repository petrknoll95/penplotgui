#ifndef WIFI_HANDLER_H
#define WIFI_HANDLER_H

#include <Arduino.h>
#include <WiFiS3.h>

// Buffer configuration - fits in 32KB SRAM
#define GCODE_BUFFER_LINES 16
#define GCODE_LINE_LENGTH 96
#define BUFFER_LOW_THRESHOLD 5

// Connection states
enum WiFiState {
  WIFI_DISCONNECTED,
  WIFI_CONNECTING,
  WIFI_CONNECTED,
  WIFI_CLIENT_CONNECTED
};

// Circular buffer for G-code lines
class GCodeBuffer {
public:
  GCodeBuffer() : head(0), tail(0), count(0) {}

  bool push(const char* line) {
    if (count >= GCODE_BUFFER_LINES) return false;

    strncpy(buffer[head], line, GCODE_LINE_LENGTH - 1);
    buffer[head][GCODE_LINE_LENGTH - 1] = '\0';
    head = (head + 1) % GCODE_BUFFER_LINES;
    count++;
    return true;
  }

  bool pop(char* line) {
    if (count == 0) return false;

    strcpy(line, buffer[tail]);
    tail = (tail + 1) % GCODE_BUFFER_LINES;
    count--;
    return true;
  }

  bool isEmpty() const { return count == 0; }
  bool isFull() const { return count >= GCODE_BUFFER_LINES; }
  int available() const { return count; }
  bool isLow() const { return count < BUFFER_LOW_THRESHOLD; }

private:
  char buffer[GCODE_BUFFER_LINES][GCODE_LINE_LENGTH];
  int head;
  int tail;
  int count;
};

class WiFiHandler {
public:
  WiFiHandler();

  bool begin(const char* ssid, const char* password, uint16_t port = 81);
  void update();

  // Client communication
  bool hasClient() const { return clientConnected; }
  bool hasData();
  String readLine();
  void sendOk();
  void sendError(const char* msg);
  void sendStatus(const char* status);
  void sendPosition(float x, float y, float z);
  void sendMessage(const char* msg);
  void setTimeoutEnabled(bool enabled);

  // Buffer management
  GCodeBuffer& getBuffer() { return gcodeBuffer; }
  void requestMoreData();

  // Connection status
  WiFiState getState() const { return state; }
  IPAddress getIP() const { return WiFi.localIP(); }

  // Heartbeat
  void sendPing();
  bool checkConnection();

private:
  WiFiServer server;
  WiFiClient client;
  WiFiState state;
  bool clientConnected;
  GCodeBuffer gcodeBuffer;

  unsigned long lastPingTime;
  unsigned long lastPongTime;
  static const unsigned long PING_INTERVAL = 5000;  // 5 seconds
  static const unsigned long TIMEOUT = 15000;       // 15 seconds
  bool timeoutEnabled;

  String inputBuffer;
  void processIncomingData();
};

WiFiHandler::WiFiHandler()
  : server(81),
    state(WIFI_DISCONNECTED),
    clientConnected(false),
    lastPingTime(0),
    lastPongTime(0),
    timeoutEnabled(true) {
}

bool WiFiHandler::begin(const char* ssid, const char* password, uint16_t port) {
  state = WIFI_CONNECTING;

  // Check for WiFi module
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("WiFi module not found!");
    return false;
  }

  // Connect to WiFi
  Serial.print("Connecting to ");
  Serial.println(ssid);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    WiFi.begin(ssid, password);
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi connection failed!");
    state = WIFI_DISCONNECTED;
    return false;
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Start server
  server = WiFiServer(port);
  server.begin();
  Serial.print("WebSocket server started on port ");
  Serial.println(port);

  state = WIFI_CONNECTED;
  return true;
}

void WiFiHandler::update() {
  if (state == WIFI_DISCONNECTED || state == WIFI_CONNECTING) return;

  // Check for new client
  if (!clientConnected) {
    WiFiClient newClient = server.available();
    if (newClient) {
      client = newClient;
      clientConnected = true;
      lastPongTime = millis();
      Serial.println("Client connected!");
      state = WIFI_CLIENT_CONNECTED;

      // Send welcome message
      client.println("ok PENPLOTTER_READY");
    }
  }

  // Handle existing client
  if (clientConnected) {
    if (!client.connected()) {
      clientConnected = false;
      state = WIFI_CONNECTED;
      Serial.println("Client disconnected");
      return;
    }

    // Process incoming data
    processIncomingData();

    // Heartbeat check
    unsigned long now = millis();
    if (now - lastPingTime > PING_INTERVAL) {
      sendPing();
      lastPingTime = now;
    }

    // Timeout check
    if (timeoutEnabled && now - lastPongTime > TIMEOUT) {
      Serial.println("Client timeout - disconnecting");
      client.stop();
      clientConnected = false;
      state = WIFI_CONNECTED;
    }
  }
}

void WiFiHandler::processIncomingData() {
  while (client.available()) {
    char c = client.read();

    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        // Handle special messages
        if (inputBuffer == "pong") {
          lastPongTime = millis();
        } else if (inputBuffer == "ping") {
          client.println("pong");
        } else {
          // Add to G-code buffer
          if (!gcodeBuffer.isFull()) {
            gcodeBuffer.push(inputBuffer.c_str());
          } else {
            sendError("BUFFER_FULL");
          }
        }
        inputBuffer = "";
      }
    } else {
      if (inputBuffer.length() < GCODE_LINE_LENGTH - 1) {
        inputBuffer += c;
      }
    }
  }
}

bool WiFiHandler::hasData() {
  return !gcodeBuffer.isEmpty();
}

String WiFiHandler::readLine() {
  char line[GCODE_LINE_LENGTH];
  if (gcodeBuffer.pop(line)) {
    return String(line);
  }
  return "";
}

void WiFiHandler::sendOk() {
  if (clientConnected && client.connected()) {
    client.println("ok");
  }
}

void WiFiHandler::sendError(const char* msg) {
  if (clientConnected && client.connected()) {
    client.print("error ");
    client.println(msg);
  }
}

void WiFiHandler::sendStatus(const char* status) {
  if (clientConnected && client.connected()) {
    client.print("status ");
    client.println(status);
  }
}

void WiFiHandler::sendPosition(float x, float y, float z) {
  if (clientConnected && client.connected()) {
    client.print("pos X:");
    client.print(x, 2);
    client.print(" Y:");
    client.print(y, 2);
    client.print(" Z:");
    client.println(z, 2);
  }
}

void WiFiHandler::requestMoreData() {
  if (clientConnected && client.connected()) {
    client.print("ready ");
    client.println(GCODE_BUFFER_LINES - gcodeBuffer.available());
  }
}

void WiFiHandler::sendPing() {
  if (clientConnected && client.connected()) {
    client.println("ping");
  }
}

bool WiFiHandler::checkConnection() {
  return clientConnected && client.connected();
}

void WiFiHandler::sendMessage(const char* msg) {
  if (clientConnected && client.connected()) {
    client.println(msg);
  }
}

void WiFiHandler::setTimeoutEnabled(bool enabled) {
  timeoutEnabled = enabled;
  if (enabled) {
    lastPongTime = millis();
  }
}

#endif // WIFI_HANDLER_H
