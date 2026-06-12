/*
 * IoIoT - MQTT WiFi Controller
 * ================================================================
 * Controls ESP32 hardware in real-time via MQTT.
 * Commands arrive from the IoIoT Web Panel through an MQTT broker.
 * No Bluetooth, no HTTP polling — pure MQTT pub/sub.
 *
 * Required Libraries (install via Arduino Library Manager):
 *   - PubSubClient  by Nick O'Leary
 *   - ArduinoJson   by Benoit Blanchon
 *
 * MQTT Topics:
 *   Subscribe: ioiot/<deviceId>/command  ← receives control commands
 *   Publish:   ioiot/<deviceId>/state    → sends sensor/heartbeat data
 *   LWT:       ioiot/<deviceId>/status   → offline notification
 * ================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const char* ssid       = "YOUR_WIFI_SSID";
const char* password   = "YOUR_WIFI_PASSWORD";
const char* DEVICE_ID  = "device-001";           // Your IoIoT device ID
const char* MQTT_HOST  = "broker.hivemq.com";
const int   MQTT_PORT  = 1883;

// ─── MQTT TOPICS ─────────────────────────────────────────────────────────────
char TOPIC_CMD[64];    // ioiot/<deviceId>/command
char TOPIC_STATE[64];  // ioiot/<deviceId>/state
char TOPIC_STATUS[64]; // ioiot/<deviceId>/status  (LWT)

// ─── PIN DEFINITIONS ─────────────────────────────────────────────────────────
const int PIN_LED_G  = 18;
const int PIN_LED_B  = 19;
const int PIN_LED_R  = 21;
const int PIN_FLASH  = 22;
const int PIN_MOTOR  = 23;

// ─── STATE ───────────────────────────────────────────────────────────────────
bool stateG     = false;
bool stateB     = false;
bool stateR     = false;
bool stateFlash = false;
int  stateMotor = 0;

// ─── TIMING ──────────────────────────────────────────────────────────────────
unsigned long lastHeartbeat   = 0;
unsigned long lastStrobeChange = 0;
const long    HEARTBEAT_INTERVAL = 5000; // Publish state every 5s
const long    STROBE_INTERVAL    = 100;
int           strobeStep = 0;

// ─── MQTT CLIENT ─────────────────────────────────────────────────────────────
WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);

// ─── MQTT CALLBACK ───────────────────────────────────────────────────────────
// Called whenever a message arrives on a subscribed topic
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    // Parse JSON payload
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
        Serial.print("JSON parse error: ");
        Serial.println(err.c_str());
        return;
    }

    Serial.print("CMD received: ");
    serializeJson(doc, Serial);
    Serial.println();

    // Apply each key in the command JSON to the matching state variable
    if (doc.containsKey("ledG"))   { stateG     = doc["ledG"].as<bool>(); }
    if (doc.containsKey("ledB"))   { stateB     = doc["ledB"].as<bool>(); }
    if (doc.containsKey("ledR"))   { stateR     = doc["ledR"].as<bool>(); }
    if (doc.containsKey("flash"))  { stateFlash = doc["flash"].as<bool>(); }
    if (doc.containsKey("motor"))  { stateMotor = doc["motor"].as<int>(); }

    // Apply physical outputs immediately after any command
    updatePhysicalOutputs();
}

// ─── WIFI CONNECT ─────────────────────────────────────────────────────────────
void connectWifi() {
    Serial.print("Connecting to WiFi: ");
    Serial.println(ssid);
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);

    int tries = 0;
    while (WiFi.status() != WL_CONNECTED && tries < 40) {
        delay(500);
        Serial.print(".");
        tries++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✓ WiFi connected: " + WiFi.localIP().toString());
    } else {
        Serial.println("\n✗ WiFi failed. Restarting...");
        ESP.restart();
    }
}

// ─── MQTT CONNECT ─────────────────────────────────────────────────────────────
void connectMqtt() {
    String clientId = String("ioiot-esp-") + String(DEVICE_ID) + "-" + String(random(0xffff), HEX);

    // Last Will & Testament: publish {"online":false} if we disconnect ungracefully
    String lwtPayload = "{\"online\":false}";

    while (!mqttClient.connected()) {
        Serial.print("Connecting to MQTT broker...");

        if (mqttClient.connect(
                clientId.c_str(),
                nullptr, nullptr,          // no username/password for public broker
                TOPIC_STATUS,              // LWT topic
                1,                         // LWT QoS
                true,                      // LWT retain
                lwtPayload.c_str()         // LWT payload
            )) {
            Serial.println(" connected!");

            // Subscribe to command topic
            mqttClient.subscribe(TOPIC_CMD, 1);
            Serial.print("Subscribed to: ");
            Serial.println(TOPIC_CMD);

            // Announce online
            mqttClient.publish(TOPIC_STATUS, "{\"online\":true}", true);
        } else {
            Serial.print(" failed, rc=");
            Serial.print(mqttClient.state());
            Serial.println(". Retry in 3s...");
            delay(3000);
        }
    }
}

// ─── PUBLISH HEARTBEAT ────────────────────────────────────────────────────────
// Sends current device state to the server every HEARTBEAT_INTERVAL ms.
// Also used to report sensor/INPUT pin values back to the dashboard.
void publishHeartbeat() {
    StaticJsonDocument<256> doc;
    doc["online"]    = true;
    doc["ledG"]      = stateG;
    doc["ledB"]      = stateB;
    doc["ledR"]      = stateR;
    doc["flash"]     = stateFlash;
    doc["motor"]     = stateMotor;
    // Add analog/sensor readings here if needed:
    // doc["temperature"] = readTemperature();

    char buf[256];
    serializeJson(doc, buf);
    mqttClient.publish(TOPIC_STATE, buf, false); // not retained
    Serial.println("Heartbeat published.");
}

// ─── PHYSICAL OUTPUTS ────────────────────────────────────────────────────────
void updatePhysicalOutputs() {
    // Airplane strobe: 2 quick blinks then a pause
    bool flashOn = (strobeStep == 0 || strobeStep == 2);

    digitalWrite(PIN_LED_G, (stateG  || stateFlash) ? (flashOn ? HIGH : LOW) : LOW);
    digitalWrite(PIN_LED_B, (stateB  || stateFlash) ? (flashOn ? HIGH : LOW) : LOW);
    digitalWrite(PIN_LED_R, (stateR  || stateFlash) ? (flashOn ? HIGH : LOW) : LOW);
    digitalWrite(PIN_FLASH, stateFlash ? (flashOn ? HIGH : LOW) : LOW);
    analogWrite(PIN_MOTOR, stateMotor);
}

// ─── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout detector
    Serial.begin(115200);
    delay(1000);

    // Build topic strings from device ID
    snprintf(TOPIC_CMD,    sizeof(TOPIC_CMD),    "ioiot/%s/command", DEVICE_ID);
    snprintf(TOPIC_STATE,  sizeof(TOPIC_STATE),  "ioiot/%s/state",   DEVICE_ID);
    snprintf(TOPIC_STATUS, sizeof(TOPIC_STATUS), "ioiot/%s/status",  DEVICE_ID);

    // Setup pins
    pinMode(PIN_LED_G, OUTPUT);
    pinMode(PIN_LED_B, OUTPUT);
    pinMode(PIN_LED_R, OUTPUT);
    pinMode(PIN_FLASH, OUTPUT);
    pinMode(PIN_MOTOR, OUTPUT);

    // Start all outputs LOW
    digitalWrite(PIN_LED_G, LOW);
    digitalWrite(PIN_LED_B, LOW);
    digitalWrite(PIN_LED_R, LOW);
    digitalWrite(PIN_FLASH, LOW);
    analogWrite(PIN_MOTOR, 0);

    // Connect WiFi → MQTT
    connectWifi();

    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setCallback(onMqttMessage);
    mqttClient.setKeepAlive(60);
    mqttClient.setBufferSize(512);

    connectMqtt();

    Serial.println("IoIoT MQTT Ready.");
}

// ─── LOOP ────────────────────────────────────────────────────────────────────
void loop() {
    // Reconnect WiFi if dropped
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi lost. Reconnecting...");
        connectWifi();
    }

    // Reconnect MQTT if dropped
    if (!mqttClient.connected()) {
        connectMqtt();
    }

    // Process incoming MQTT messages
    mqttClient.loop();

    // Update strobe animation step
    unsigned long now = millis();
    if (now - lastStrobeChange > STROBE_INTERVAL) {
        lastStrobeChange = now;
        strobeStep = (strobeStep + 1) % 10;
        if (stateFlash) updatePhysicalOutputs(); // re-apply strobe
    }

    // Periodic heartbeat / sensor publish
    if (now - lastHeartbeat > HEARTBEAT_INTERVAL) {
        lastHeartbeat = now;
        publishHeartbeat();
    }
}
