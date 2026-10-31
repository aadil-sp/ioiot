// Wi-Fi provisioning for generated ESP32/ESP8266 firmware.
//
// On boot the board tries, in order: the network saved on the board (from a
// previous setup), then the network built into the code. If neither connects it
// opens a "IoIoT-Setup-XXXX" hotspot with a page to pick a network; the choice
// is saved in flash and the board restarts. Holding BOOT for 3s while running
// clears the saved network and reopens setup. Uses only core libraries.

const cString = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function wifiSetupCode({ deviceId, deviceName, ssid, password }) {
    const suffix = String(deviceId).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
    const title = String(deviceName || 'IoIoT device').replace(/[<>&"\\]/g, '');
    return `// ---- IoIoT Wi-Fi setup ----------------------------------------------
#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266WebServer.h>
  #include <EEPROM.h>
  typedef ESP8266WebServer IoiotWebServer;
#else
  #include <WiFi.h>
  #include <WebServer.h>
  #include <Preferences.h>
  typedef WebServer IoiotWebServer;
#endif
#include <DNSServer.h>

const char* IOIOT_DEFAULT_SSID = "${cString(ssid || '')}";
const char* IOIOT_DEFAULT_PASS = "${cString(password || '')}";
const char* IOIOT_SETUP_AP     = "IoIoT-Setup-${suffix}";

#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32C6)
  #define IOIOT_SETUP_BUTTON 9
#else
  #define IOIOT_SETUP_BUTTON 0
#endif
bool ioiotSetupButtonEnabled = true; // turned off if a pin config uses the BOOT pin

String ioiotSavedSsid, ioiotSavedPass;

void ioiotLoadWifi() {
#if defined(ESP8266)
  EEPROM.begin(128);
  ioiotSavedSsid = ""; ioiotSavedPass = "";
  if (EEPROM.read(0) == 0x42) {
    for (int i = 0; i < 32 && EEPROM.read(1 + i); i++) ioiotSavedSsid += (char)EEPROM.read(1 + i);
    for (int i = 0; i < 64 && EEPROM.read(33 + i); i++) ioiotSavedPass += (char)EEPROM.read(33 + i);
  }
  EEPROM.end();
#else
  Preferences p;
  p.begin("ioiot-wifi", true);
  ioiotSavedSsid = p.getString("ssid", "");
  ioiotSavedPass = p.getString("pass", "");
  p.end();
#endif
}

void ioiotStoreWifi(const String& s, const String& pw) {
#if defined(ESP8266)
  EEPROM.begin(128);
  EEPROM.write(0, s.length() ? 0x42 : 0);
  for (int i = 0; i < 32; i++) EEPROM.write(1 + i, i < (int)s.length() ? s[i] : 0);
  for (int i = 0; i < 64; i++) EEPROM.write(33 + i, i < (int)pw.length() ? pw[i] : 0);
  EEPROM.commit();
  EEPROM.end();
#else
  Preferences p;
  p.begin("ioiot-wifi", false);
  p.putString("ssid", s);
  p.putString("pass", pw);
  p.end();
#endif
}

bool ioiotTryConnect(const char* s, const char* pw, unsigned long ms) {
  if (!s || !s[0]) return false;
  Serial.printf("WiFi: connecting to %s", s);
  WiFi.mode(WIFI_STA);
  WiFi.begin(s, pw);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < ms) { delay(250); Serial.print("."); }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" OK " + WiFi.localIP().toString());
    WiFi.setAutoReconnect(true);
    return true;
  }
  Serial.println(" failed");
  WiFi.disconnect();
  return false;
}

String ioiotHtml(const String& s) {
  String o;
  for (unsigned int i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;"; else if (c == '&') o += "&amp;";
    else if (c == '"') o += "&quot;"; else if (c == '\\'') o += "&#39;"; else o += c;
  }
  return o;
}

const char IOIOT_PAGE_HEAD[] PROGMEM = "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
  "<title>IoIoT Wi-Fi setup</title><style>body{font-family:system-ui,sans-serif;background:#12121a;color:#eee;margin:0;padding:24px 16px}"
  ".c{max-width:380px;margin:auto;background:#1e1e2d;border:1px solid #f9731666;border-radius:16px;padding:20px}"
  "h1{color:#f97316;font-size:20px;margin:0 0 4px}p{color:#999;font-size:13px;margin:0 0 16px}label{font-size:12px;color:#aaa}"
  "select,input{width:100%;box-sizing:border-box;padding:12px;margin:6px 0 14px;border-radius:10px;border:1px solid #444;background:#111;color:#fff;font-size:16px}"
  "button{width:100%;padding:13px;border:0;border-radius:10px;background:#f97316;color:#000;font-weight:700;font-size:16px}</style></head><body><div class=c>";

void ioiotRunSetupPortal() {
  Serial.printf("WiFi: starting setup hotspot \\"%s\\"\\n", IOIOT_SETUP_AP);
  WiFi.disconnect();
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(IOIOT_SETUP_AP);
  delay(200);
  DNSServer dns;
  dns.start(53, "*", WiFi.softAPIP());
  IoiotWebServer server(80);
  bool saved = false;

  int found = WiFi.scanNetworks();
  String options;
  for (int i = 0; i < found; i++) {
    String n = WiFi.SSID(i);
    if (n.length() && options.indexOf(">" + ioiotHtml(n) + "<") < 0)
      options += "<option>" + ioiotHtml(n) + "</option>";
  }

  server.on("/", [&]() {
    String page = FPSTR(IOIOT_PAGE_HEAD);
    page += "<h1>${title}</h1><p>Choose the Wi-Fi network this device should use.</p><form method=post action=/save>";
    page += "<label>Network</label><select name=s>" + options + "<option value=''>Other (type below)...</option></select>";
    page += "<input name=o placeholder='Other network name' maxlength=32>";
    page += "<label>Password</label><input name=p type=password maxlength=64 placeholder='Leave empty for open networks'>";
    page += "<button>Save &amp; connect</button></form></div></body></html>";
    server.send(200, "text/html", page);
  });
  server.on("/save", HTTP_POST, [&]() {
    String s = server.arg("o").length() ? server.arg("o") : server.arg("s");
    s.trim();
    if (!s.length() || s.length() > 32 || server.arg("p").length() > 64) {
      server.sendHeader("Location", "/");
      server.send(302, "text/plain", "");
      return;
    }
    ioiotStoreWifi(s, server.arg("p"));
    String page = FPSTR(IOIOT_PAGE_HEAD);
    page += "<h1>Saved</h1><p>The device is restarting and will connect to <b>" + ioiotHtml(s) + "</b>. You can close this page.</p></div></body></html>";
    server.send(200, "text/html", page);
    saved = true;
  });
  // Send every other URL to the setup page so phones show it automatically
  server.onNotFound([&]() {
    server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/");
    server.send(302, "text/plain", "");
  });
  server.begin();

  // Give up after 5 minutes and restart, in case the router was just down
  unsigned long start = millis();
  while (!saved && millis() - start < 5UL * 60 * 1000) {
    dns.processNextRequest();
    server.handleClient();
    delay(2);
  }
  delay(1500);
  ESP.restart();
}

// Connect to Wi-Fi, opening the setup hotspot if no network works
void ioiotWifiBegin() {
  if (ioiotSetupButtonEnabled) pinMode(IOIOT_SETUP_BUTTON, INPUT_PULLUP);
  ioiotLoadWifi();
  if (ioiotTryConnect(ioiotSavedSsid.c_str(), ioiotSavedPass.c_str(), 15000)) return;
  if (ioiotSavedSsid != IOIOT_DEFAULT_SSID && ioiotTryConnect(IOIOT_DEFAULT_SSID, IOIOT_DEFAULT_PASS, 15000)) return;
  ioiotRunSetupPortal();
}

// Call from loop(): handles the BOOT-button reset and long Wi-Fi outages
void ioiotWifiLoop() {
  static unsigned long pressedAt = 0, lostAt = 0;
  if (ioiotSetupButtonEnabled && digitalRead(IOIOT_SETUP_BUTTON) == LOW) {
    if (!pressedAt) pressedAt = millis();
    else if (millis() - pressedAt > 3000) {
      Serial.println("WiFi: BOOT held, clearing saved network");
      ioiotStoreWifi("", "");
      ioiotRunSetupPortal();
    }
  } else pressedAt = 0;

  if (WiFi.status() == WL_CONNECTED) lostAt = 0;
  else if (!lostAt) lostAt = millis();
  else if (millis() - lostAt > 2UL * 60 * 1000) { lostAt = 0; ioiotWifiBegin(); }
}
// ---------------------------------------------------------------------
`;
}
