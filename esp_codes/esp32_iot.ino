#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Backend URL (e.g. Render URL)
const char* serverUrl = "https://your-backend-app.onrender.com/api/esp/device-001/state"; 

// Pin definitions
const int LED_GREEN = 18;
const int LED_BLUE = 19;
const int LED_RED = 21;
const int FLASH_PIN = 22;
const int PROPELLER_PIN = 23;

void setup() {
  Serial.begin(115200);
  
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(FLASH_PIN, OUTPUT);
  pinMode(PROPELLER_PIN, OUTPUT);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
}

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
        
        // Flash logic - just turn on for now, or you can implement a blinking without delay here
        digitalWrite(FLASH_PIN, flash ? HIGH : LOW);
        
        // Propeller logic - motor switch
        digitalWrite(PROPELLER_PIN, propeller ? HIGH : LOW);
        
        Serial.println("Updated state from server.");
      } else {
        Serial.print("deserializeJson() failed: ");
        Serial.println(error.c_str());
      }
    } else {
      Serial.print("Error code: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  }
  // Poll every 2 seconds
  delay(2000); 
}
