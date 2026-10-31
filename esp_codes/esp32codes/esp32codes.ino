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
 *
 * Every message is signed with the device's Auth Token (shown on the
 * device page). Unsigned or forged commands are ignored.
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

// -- Message Signing (HMAC-SHA256 with this device's auth token) -------
// Commands without a valid signature are ignored. Keep this token secret.
const char* AUTH_TOKEN = "YOUR_DEVICE_AUTH_TOKEN";

char IOIOT_SESSION[17];                  // random per boot
unsigned long long ioiotLastCmdSeq = 0;  // highest command seq accepted
unsigned long long ioiotSendSeq = 0;     // seq of our last published message

static const uint32_t SHA_K[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
};

struct IoiotSha256 { uint32_t h[8]; uint8_t buf[64]; uint64_t len; uint8_t n; };

static inline uint32_t shaRor(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }

static void shaBlock(IoiotSha256* s, const uint8_t* p) {
  uint32_t w[64];
  for (int i = 0; i < 16; i++)
    w[i] = (uint32_t)p[i * 4] << 24 | (uint32_t)p[i * 4 + 1] << 16 | (uint32_t)p[i * 4 + 2] << 8 | p[i * 4 + 3];
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = shaRor(w[i - 15], 7) ^ shaRor(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = shaRor(w[i - 2], 17) ^ shaRor(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  uint32_t a = s->h[0], b = s->h[1], c = s->h[2], d = s->h[3], e = s->h[4], f = s->h[5], g = s->h[6], h = s->h[7];
  for (int i = 0; i < 64; i++) {
    uint32_t t1 = h + (shaRor(e, 6) ^ shaRor(e, 11) ^ shaRor(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i];
    uint32_t t2 = (shaRor(a, 2) ^ shaRor(a, 13) ^ shaRor(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  s->h[0] += a; s->h[1] += b; s->h[2] += c; s->h[3] += d; s->h[4] += e; s->h[5] += f; s->h[6] += g; s->h[7] += h;
}

static void shaInit(IoiotSha256* s) {
  static const uint32_t iv[8] = { 0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19 };
  memcpy(s->h, iv, sizeof(iv)); s->len = 0; s->n = 0;
}

static void shaUpdate(IoiotSha256* s, const void* data, size_t len) {
  const uint8_t* d = (const uint8_t*)data;
  while (len--) {
    s->buf[s->n++] = *d++; s->len++;
    if (s->n == 64) { shaBlock(s, s->buf); s->n = 0; }
  }
}

static void shaFinal(IoiotSha256* s, uint8_t out[32]) {
  uint64_t bits = s->len * 8;
  uint8_t b = 0x80; shaUpdate(s, &b, 1);
  b = 0; while (s->n != 56) shaUpdate(s, &b, 1);
  for (int i = 7; i >= 0; i--) { b = (uint8_t)(bits >> (i * 8)); shaUpdate(s, &b, 1); }
  for (int i = 0; i < 8; i++) {
    out[i * 4] = s->h[i] >> 24; out[i * 4 + 1] = s->h[i] >> 16; out[i * 4 + 2] = s->h[i] >> 8; out[i * 4 + 3] = s->h[i];
  }
}

// out = hex(HMAC-SHA256(AUTH_TOKEN, "<kind>|<session>|<seq>|<json>"))
static void ioiotHmac(const char* kind, const char* session, const char* seq, const char* json, char out[65]) {
  uint8_t key[64] = { 0 }, pad[64], inner[32], mac[32];
  memcpy(key, AUTH_TOKEN, strlen(AUTH_TOKEN));  // token is shorter than 64 bytes
  IoiotSha256 s;
  for (int i = 0; i < 64; i++) pad[i] = key[i] ^ 0x36;
  shaInit(&s); shaUpdate(&s, pad, 64);
  shaUpdate(&s, kind, strlen(kind)); shaUpdate(&s, "|", 1);
  shaUpdate(&s, session, strlen(session)); shaUpdate(&s, "|", 1);
  shaUpdate(&s, seq, strlen(seq)); shaUpdate(&s, "|", 1);
  shaUpdate(&s, json, strlen(json));
  shaFinal(&s, inner);
  for (int i = 0; i < 64; i++) pad[i] = key[i] ^ 0x5c;
  shaInit(&s); shaUpdate(&s, pad, 64); shaUpdate(&s, inner, 32);
  shaFinal(&s, mac);
  static const char hex[] = "0123456789abcdef";
  for (int i = 0; i < 32; i++) { out[i * 2] = hex[mac[i] >> 4]; out[i * 2 + 1] = hex[mac[i] & 15]; }
  out[64] = 0;
}

static void ioiotU64ToStr(unsigned long long v, char out[21]) {
  char tmp[21]; int n = 0;
  do { tmp[n++] = '0' + (v % 10); v /= 10; } while (v);
  for (int i = 0; i < n; i++) out[i] = tmp[n - 1 - i];
  out[n] = 0;
}

static unsigned long long ioiotStrToU64(const char* s) {
  unsigned long long v = 0;
  for (; *s >= '0' && *s <= '9'; s++) v = v * 10 + (*s - '0');
  return v;
}

void ioiotNewSession() {
  static const char hex[] = "0123456789abcdef";
  for (int i = 0; i < 16; i += 8) {
#if defined(ESP32)
    uint32_t r = esp_random();
#else
    uint32_t r = RANDOM_REG32;
#endif
    for (int j = 0; j < 8; j++) { IOIOT_SESSION[i + j] = hex[r & 15]; r >>= 4; }
  }
  IOIOT_SESSION[16] = 0;
  ioiotLastCmdSeq = 0;
  ioiotSendSeq = 0;
}

// Builds "<hmac>|<session>|<seq>|<json>" into out. Returns false if it doesn't fit.
bool ioiotSignInto(const char* kind, unsigned long long seq, const char* json, char* out, size_t outSize) {
  char seqStr[21], mac[65];
  ioiotU64ToStr(seq, seqStr);
  ioiotHmac(kind, IOIOT_SESSION, seqStr, json, mac);
  int n = snprintf(out, outSize, "%s|%s|%s|%s", mac, IOIOT_SESSION, seqStr, json);
  return n > 0 && (size_t)n < outSize;
}

bool ioiotPublish(PubSubClient& client, const char* topic, const char* kind, const char* json, bool retain) {
  static char out[1200];
  if (!ioiotSignInto(kind, ++ioiotSendSeq, json, out, sizeof(out))) return false;
  return client.publish(topic, out, retain);
}

// Verifies an incoming "<hmac>|<session>|<seq>|<json>" message in place.
// Returns the JSON part, or nullptr if it is forged, replayed or from an old session.
const char* ioiotVerify(const char* kind, char* msg) {
  char* p1 = strchr(msg, '|');
  if (!p1 || p1 - msg != 64) return nullptr;
  char* p2 = strchr(p1 + 1, '|'); if (!p2) return nullptr;
  char* p3 = strchr(p2 + 1, '|'); if (!p3) return nullptr;
  *p1 = 0; *p2 = 0; *p3 = 0;
  const char* session = p1 + 1;
  const char* seqStr = p2 + 1;
  const char* json = p3 + 1;
  if (strcmp(session, IOIOT_SESSION) != 0) return nullptr;
  unsigned long long seq = ioiotStrToU64(seqStr);
  if (seq <= ioiotLastCmdSeq) return nullptr;
  char mac[65];
  ioiotHmac(kind, session, seqStr, json, mac);
  uint8_t diff = 0;
  for (int i = 0; i < 64; i++) diff |= mac[i] ^ msg[i];
  if (diff) return nullptr;
  ioiotLastCmdSeq = seq;
  return json;
}

// ─── MQTT CALLBACK ───────────────────────────────────────────────────────────
// Called whenever a message arrives on a subscribed topic
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    // Verify the signature, then parse the JSON payload
    static char buf[1024];
    if (length >= sizeof(buf)) return;
    memcpy(buf, payload, length);
    buf[length] = 0;
    const char* json = ioiotVerify("command", buf);
    if (!json) { Serial.println("Ignored unsigned/invalid message"); return; }

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, json);
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
    static char lwtPayload[200];
    ioiotSignInto("status", 0, "{\"online\":false}", lwtPayload, sizeof(lwtPayload));

    while (!mqttClient.connected()) {
        Serial.print("Connecting to MQTT broker...");

        if (mqttClient.connect(
                clientId.c_str(),
                nullptr, nullptr,          // no username/password for public broker
                TOPIC_STATUS,              // LWT topic
                1,                         // LWT QoS
                true,                      // LWT retain
                lwtPayload                 // LWT payload (signed)
            )) {
            Serial.println(" connected!");

            // Subscribe to command topic
            mqttClient.subscribe(TOPIC_CMD, 1);
            Serial.print("Subscribed to: ");
            Serial.println(TOPIC_CMD);

            // Announce online
            ioiotPublish(mqttClient, TOPIC_STATUS, "status", "{\"online\":true}", true);
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
    ioiotPublish(mqttClient, TOPIC_STATE, "state", buf, false); // not retained
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
    ioiotNewSession();

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
    mqttClient.setBufferSize(1400);

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
