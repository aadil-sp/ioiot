/*
 * IoIoT - Hybrid RC Plane Controller (WiFi + Bluetooth)
 * This code allows the ESP32 to be controlled globally via the IoIoT Web Panel
 * AND locally via any Bluetooth Serial Terminal app.
 *
 * Features:
 * - WiFi connection to IoIoT Backend Server
 * - Classic Bluetooth for local mobile app control
 * - Real-time Airplane Strobe Pattern for LEDs
 * - Synchronized state between Cloud and Local
 */

#include "BluetoothSerial.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

// --- CONFIGURATION ---
const char *ssid = "Asianetgigafiber"; // Corrected SSID
const char *password = "Aadil@123";    // Corrected Password
const char *deviceId = "device-001";
const char *serverUrl = "https://ioiot.vercel.app/api/esp/device-001/state";

// --- COMMAND DEFINITIONS (For Bluetooth App) ---
#define CMD_LED_G 'G'
#define CMD_LED_B 'B'
#define CMD_LED_R 'R'
#define CMD_STROBE_ALL 'F'
#define CMD_MOTOR 'M'
// --------------------

// Pin Definitions
const int PIN_LED_G = 18;
const int PIN_LED_B = 19;
const int PIN_LED_R = 21;
const int PIN_FLASH = 22;
const int PIN_MOTOR = 23;

BluetoothSerial SerialBT;

// State Variables
bool stateG = false;
bool stateB = false;
bool stateR = false;
bool stateFlash = false;
bool stateMotor = false;

// Timing Variables
unsigned long lastStrobeChange = 0;
unsigned long lastServerPoll = 0;
const long pollInterval = 2000; // Poll server every 2 seconds
int strobeStep = 0;

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_FLASH, OUTPUT);
  pinMode(PIN_MOTOR, OUTPUT);

  // Scan for WiFi networks
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  Serial.println("\n--- WiFi Scan Start ---");
  int n = WiFi.scanNetworks();
  if (n == 0) {
    Serial.println("No networks found.");
  } else {
    Serial.print(n);
    Serial.println(" networks found:");
    for (int i = 0; i < n; ++i) {
      Serial.print(i + 1);
      Serial.print(": ");
      Serial.print(WiFi.SSID(i));
      Serial.print(" (");
      Serial.print(WiFi.RSSI(i));
      Serial.print(")");
      Serial.println((WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? " " : "*");
      delay(10);
    }
  }
  Serial.println("--- WiFi Scan Done ---\n");

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nSUCCESS: Connected to WiFi!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFAILED: Connection timed out.");
    Serial.print("Status Code: ");
    Serial.println(WiFi.status());
  }

  // Bluetooth Setup
  if (!SerialBT.begin("IoIoT_RC_PLANE_HYBRID")) {
    Serial.println("Bluetooth Error");
  } else {
    Serial.println("Bluetooth Ready: IoIoT_RC_PLANE_HYBRID");
  }
}

void loop() {
  unsigned long now = millis();

  // 1. Check Bluetooth Commands
  if (SerialBT.available()) {
    char cmd = SerialBT.read();
    Serial.print("Local BT Command: ");
    Serial.println(cmd);
    handleLocalCommand(cmd);
  }

  // 2. Poll Server (Global Control)
  if (WiFi.status() == WL_CONNECTED && (now - lastServerPoll > pollInterval)) {
    lastServerPoll = now;
    pollServer();
  }

  // 3. Update Strobe Logic & Outputs
  if (now - lastStrobeChange > 100) {
    lastStrobeChange = now;
    strobeStep = (strobeStep + 1) % 10;
  }

  updatePhysicalOutputs();
}

void handleLocalCommand(char cmd) {
  switch (cmd) {
  case CMD_LED_G:
    stateG = !stateG;
    break;
  case CMD_LED_B:
    stateB = !stateB;
    break;
  case CMD_LED_R:
    stateR = !stateR;
    break;
  case CMD_STROBE_ALL:
    stateFlash = !stateFlash;
    break;
  case CMD_MOTOR:
    stateMotor = !stateMotor;
    break;
  }
}

void pollServer() {
  HTTPClient http;
  http.begin(serverUrl);
  int code = http.GET();

  if (code > 0) {
    String payload = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      // Direct sync with Server (Dynamic Keys from DeviceControl)
      stateG = doc["ledG"] | stateG;
      stateB = doc["ledB"] | stateB;
      stateR = doc["ledR"] | stateR;
      stateFlash = doc["flash"] | stateFlash;
      stateMotor = doc["propeller"] | stateMotor;
      Serial.println("Server Sync OK");
    }
  }
  http.end();
}

void updatePhysicalOutputs() {
  // Airplane Strobe: 2 blinks then pause
  bool flashOn = (strobeStep == 0 || strobeStep == 2);

  digitalWrite(PIN_LED_G, (stateG || stateFlash) ? flashOn : LOW);
  digitalWrite(PIN_LED_B, (stateB || stateFlash) ? flashOn : LOW);
  digitalWrite(PIN_LED_R, (stateR || stateFlash) ? flashOn : LOW);
  digitalWrite(PIN_FLASH, stateFlash ? flashOn : LOW);
  digitalWrite(PIN_MOTOR, stateMotor ? HIGH : LOW);
}
