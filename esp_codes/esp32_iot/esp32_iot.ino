#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

// WiFi credentials
const char *ssid = "Asianetgigafiber";
const char *password = "Aadil@123";

// Backend URL (Vercel)
const char *serverUrl = "https://ioiot.vercel.app/api/esp/device-001/state";

// Pin definitions
const int LED_GREEN = 18;
const int LED_BLUE = 19;
const int LED_RED = 21;
const int FLASH_PIN = 22;
const int PROPELLER_PIN = 23;

void setup() {
  Serial.begin(115200);
  delay(100); // Give serial a moment

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(FLASH_PIN, OUTPUT);
  pinMode(PROPELLER_PIN, OUTPUT);

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
    Serial.println(
        WiFi.status()); // WL_NO_SSID_AVAIL = 1, WL_CONNECT_FAILED = 4, etc.
  }
}

bool lastG = false, lastB = false, lastR = false, lastF = false, lastP = false;

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    int httpResponseCode = http.GET();

    if (httpResponseCode > 0) {
      String payload = http.getString();
      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, payload);

      if (!error) {
        bool ledG = doc["ledG"] | false;
        bool ledB = doc["ledB"] | false;
        bool ledR = doc["ledR"] | false;
        bool flash = doc["flash"] | false;
        bool propeller = doc["propeller"] | false;

        digitalWrite(LED_GREEN, ledG ? HIGH : LOW);
        digitalWrite(LED_BLUE, ledB ? HIGH : LOW);
        digitalWrite(LED_RED, ledR ? HIGH : LOW);
        digitalWrite(FLASH_PIN, flash ? HIGH : LOW);
        digitalWrite(PROPELLER_PIN, propeller ? HIGH : LOW);

        // Feedback on Change
        if (ledG != lastG) {
          Serial.print("LED_GREEN: ");
          Serial.println(ledG ? "ON" : "OFF");
          lastG = ledG;
        }
        if (ledB != lastB) {
          Serial.print("LED_BLUE: ");
          Serial.println(ledB ? "ON" : "OFF");
          lastB = ledB;
        }
        if (ledR != lastR) {
          Serial.print("LED_RED: ");
          Serial.println(ledR ? "ON" : "OFF");
          lastR = ledR;
        }
        if (flash != lastF) {
          Serial.print("FLASH: ");
          Serial.println(flash ? "ON" : "OFF");
          lastF = flash;
        }
        if (propeller != lastP) {
          Serial.print("PROPELLER: ");
          Serial.println(propeller ? "ON" : "OFF");
          lastP = propeller;
        }

      } else {
        Serial.print("JSON Error: ");
        Serial.println(error.c_str());
      }
    } else {
      Serial.print("HTTP Error: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  } else {
    Serial.println("WiFi Lost. Reconnecting...");
    WiFi.begin(ssid, password);
  }
  delay(1000); // Poll every 1 second for better responsiveness
}
