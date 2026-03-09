import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ESPLoader, Transport } from 'esptool-js';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Wifi, WifiOff, Settings, Plus, Trash2, Save,
    Zap, Copy, Check, Code2, Sliders, RefreshCw, Eye, EyeOff, Bluetooth, ChevronDown,
    MonitorPlay, Download, Usb, Terminal, Send, Trash, AlertTriangle
} from 'lucide-react';
import { ThemeContext } from '../App';
import { useSerial } from '../contexts/SerialContext';

const API = import.meta.env.VITE_API_URL || '';
const socket = io(API);

const PIN_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#ef4444', '#eab308', '#a855f7', '#06b6d4', '#ec4899'];

// ─── Hardware Component Presets ──────────────────────────────────────────────
const HARDWARE_PRESETS = [
    {
        id: 'led',
        name: 'LED',
        icon: '💡',
        description: 'Simple on/off LED control',
        defaults: { mode: 'OUTPUT', type: 'digital', widgetType: 'toggle', value: false }
    },
    {
        id: 'pwm_led',
        name: 'PWM LED / Dimmer',
        icon: '🔆',
        description: 'Dimmable LED with brightness slider',
        defaults: { mode: 'OUTPUT', type: 'pwm', widgetType: 'slider', value: 0, min: 0, max: 255 }
    },
    {
        id: 'relay',
        name: 'Relay / Switch',
        icon: '🔌',
        description: 'Control high-voltage loads like bulbs, fans',
        defaults: { mode: 'OUTPUT', type: 'digital', widgetType: 'toggle', value: false }
    },
    {
        id: 'dc_motor',
        name: 'DC Motor (Speed)',
        icon: '⚙️',
        description: 'PWM speed control for DC motors',
        defaults: { mode: 'OUTPUT', type: 'pwm', widgetType: 'slider', value: 0, min: 0, max: 255 }
    },
    {
        id: 'servo',
        name: 'Servo Motor',
        icon: '🤖',
        description: 'Angle control 0°–180° for servo motors',
        defaults: { mode: 'OUTPUT', type: 'servo', widgetType: 'servo_slider', value: 90, min: 0, max: 180 }
    },
    {
        id: 'push_button',
        name: 'Push Button',
        icon: '🔘',
        description: 'Momentary push button (hold to activate)',
        defaults: { mode: 'OUTPUT', type: 'digital', widgetType: 'button', value: false }
    },
    {
        id: 'toggle_switch',
        name: 'Toggle Switch',
        icon: '🔄',
        description: 'Persistent on/off toggle',
        defaults: { mode: 'OUTPUT', type: 'digital', widgetType: 'toggle', value: false }
    },
    {
        id: 'analog_sensor',
        name: 'Analog Sensor',
        icon: '📊',
        description: 'Read analog values (temperature, light, etc.)',
        defaults: { mode: 'INPUT', type: 'analog_input', widgetType: 'value_display', value: 0 }
    },
    {
        id: 'digital_sensor',
        name: 'Digital Sensor',
        icon: '📡',
        description: 'Read digital HIGH/LOW (PIR, door sensor, etc.)',
        defaults: { mode: 'INPUT', type: 'digital', widgetType: 'value_display', value: false }
    },
];

const BOARD_PINS = {
    uno: {
        all: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
        analog: [14, 15, 16, 17, 18, 19],
        pwm: [3, 5, 6, 9, 10, 11],
        getLabel: (n) => n >= 14 ? `Pin A${n - 14}` : `Pin ${n}`
    },
    nano: {
        all: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
        analog: [14, 15, 16, 17, 18, 19, 20, 21],
        pwm: [3, 5, 6, 9, 10, 11],
        getLabel: (n) => n >= 14 ? `Pin A${n - 14}` : `Pin ${n}`
    },
    mega: {
        all: Array.from({ length: 68 }, (_, i) => i + 2),
        analog: Array.from({ length: 16 }, (_, i) => i + 54),
        pwm: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46],
        getLabel: (n) => n >= 54 ? `Pin A${n - 54}` : `Pin ${n}`
    },
    esp32: {
        all: [2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39],
        analog: [32, 33, 34, 35, 36, 39],
        pwm: [2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
        getLabel: (n) => `GPIO ${n}`
    },
    esp8266: {
        all: [0, 2, 4, 5, 12, 13, 14, 15, 16, 17],
        analog: [17],
        pwm: [0, 2, 4, 5, 12, 13, 14, 15],
        getLabel: (n) => n === 17 ? 'Pin A0' : `GPIO ${n}`
    },
    default: {
        all: [2, 4, 5, 12, 13, 14, 15, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39],
        analog: [32, 33, 34, 35, 36, 39, 14, 15, 16, 17, 18, 19],
        pwm: [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15],
        getLabel: (n) => `GPIO ${n}`
    }
};

// Map device board to compile FQBN
const BOARD_FQBN = {
    esp32: 'esp32:esp32:esp32',
    esp8266: 'esp8266:esp8266:nodemcuv2',
    uno: 'arduino:avr:uno',
    nano: 'arduino:avr:nano',
    mega: 'arduino:avr:mega',
};

export default function DeviceDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { dark } = useContext(ThemeContext);
    const [device, setDevice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('control');
    const [editingPins, setEditingPins] = useState([]);
    const [savingPins, setSavingPins] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showWifi, setShowWifi] = useState(false);
    const [wifiSSID, setWifiSSID] = useState('');
    const [wifiPassword, setWifiPassword] = useState('');
    const [showWifiPass, setShowWifiPass] = useState(false);
    const [savingWifi, setSavingWifi] = useState(false);
    const [showPresets, setShowPresets] = useState(false);
    const [otaUpdating, setOtaUpdating] = useState(false);
    const [otaStatus, setOtaStatus] = useState('');
    const betaMode = true; // Flash & Monitor is always enabled
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    // ── Global serial from context (persists across tab changes) ──
    const { serialConnected, serialLog, setSerialLog, baudRate, setBaudRate, connect: connectSerial, disconnect: disconnectSerial, send: sendSerialRaw, addLog: addSerialLog, autoConnecting } = useSerial();
    const [serialInput, setSerialInput] = useState('');

    // Theme classes
    const bg = dark ? 'bg-[#050505]' : 'bg-gray-50';
    const card = dark ? 'bg-[#0A0A0A] border-[#1a1a1a]' : 'bg-white border-gray-200';
    const inputCls = dark
        ? 'bg-black border-[#333] focus:border-orange-500 text-white'
        : 'bg-gray-50 border-gray-300 focus:border-orange-400 text-gray-900';
    const mutedText = dark ? 'text-[#555]' : 'text-gray-400';

    const fetchDevice = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/api/devices`, { headers });
            const d = res.data.find(d => d.deviceId === id);
            if (d) {
                setDevice(d);
                setEditingPins(JSON.parse(JSON.stringify(d.pins || [])));
                setWifiSSID(d.wifiSSID || '');
                setWifiPassword(d.wifiPassword || '');
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [id]);

    useEffect(() => {
        fetchDevice();
        const heartbeat = setInterval(() => {
            axios.get(`${import.meta.env.VITE_API_URL || ''}/api/ping`).catch(() => { });
        }, 60000);
        socket.on('deviceStateUpdate', data => {
            if (data.deviceId === id) {
                setDevice(prev => {
                    if (!prev) return prev;
                    const pins = prev.pins.map(p =>
                        p.widgetKey === data.widgetKey ? { ...p, value: data.value } : p
                    );
                    return { ...prev, pins };
                });
            }
        });
        socket.on('deviceStatusUpdate', data => {
            if (data.deviceId === id)
                setDevice(prev => prev ? { ...prev, isConnected: data.isConnected } : prev);
        });
        socket.on('deviceConfigUpdate', data => {
            if (data.deviceId === id) {
                setDevice(prev => prev ? { ...prev, pins: data.pins } : prev);
                setEditingPins(JSON.parse(JSON.stringify(data.pins || [])));
            }
        });
        return () => {
            clearInterval(heartbeat);
            socket.off('deviceStateUpdate');
            socket.off('deviceStatusUpdate');
            socket.off('deviceConfigUpdate');
        };
    }, [id]);

    // ── Arduino USB: send JSON control command over serial ──
    const sendSerialControl = useCallback((widgetKey, value) => {
        sendSerialRaw({ k: widgetKey, v: value });
    }, [sendSerialRaw]);

    const sendSerial = async () => {
        if (!serialInput.trim()) return;
        await sendSerialRaw(serialInput + '\n');
        setSerialInput('');
    };

    const sendControl = (widgetKey, value) => {
        // Optimistic UI update
        setDevice(prev => {
            if (!prev) return prev;
            return { ...prev, pins: prev.pins.map(p => p.widgetKey === widgetKey ? { ...p, value } : p) };
        });

        if (device?.mode === 'usb') {
            // Arduino USB: send JSON via Web Serial
            sendSerialControl(widgetKey, value);
        } else {
            // WiFi/Cloud: Instant socket command (Blynk-style)
            socket.emit('sendControl', {
                deviceId: id,
                widgetKey,
                value,
                token: localStorage.getItem('token')
            });
        }
    };

    const saveWifi = async () => {
        setSavingWifi(true);
        try {
            await axios.put(`${API}/api/devices/${id}`, { wifiSSID, wifiPassword, otaEnabled: device.otaEnabled }, { headers });
            setDevice(prev => prev ? { ...prev, wifiSSID, wifiPassword } : prev);
            setShowWifi(false);
        } catch (err) { alert('Failed to save settings'); }
        finally { setSavingWifi(false); }
    };

    const addPinFromPreset = (preset) => {
        const boardType = device?.board || 'esp32';
        const config = BOARD_PINS[boardType] || BOARD_PINS.default;
        const type = preset.defaults?.type;
        const gpioList = (type === 'analog_input') ? config.analog : (type === 'pwm' || type === 'servo') ? config.pwm : config.all;
        const usedPins = editingPins.map(p => p.pinNumber);
        const nextPin = gpioList.find(n => !usedPins.includes(n)) || gpioList[0] || (boardType === 'mega' ? 2 : 13);
        const usedChars = editingPins.map(p => p.commandChar?.toUpperCase()).filter(Boolean);
        const nextChar = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c => !usedChars.includes(c)) || 'X';
        setEditingPins(prev => [...prev, {
            pinNumber: nextPin,
            label: `${preset.name}`,
            hardwareType: preset.id,
            ...preset.defaults,
            widgetKey: `pin_${nextPin}_${Date.now()}`,
            commandChar: nextChar,
            color: PIN_COLORS[prev.length % PIN_COLORS.length]
        }]);
        setShowPresets(false);
    };

    const updatePin = (idx, field, val) => {
        setEditingPins(prev => prev.map((p, i) => {
            if (i !== idx) return p;
            const updated = { ...p, [field]: val };
            if (field === 'pinNumber') updated.label = updated.label === `Pin ${p.pinNumber}` ? `Pin ${val}` : updated.label;
            return updated;
        }));
    };

    const removePin = (idx) => setEditingPins(prev => prev.filter((_, i) => i !== idx));

    const savePins = async () => {
        setSavingPins(true);
        try {
            const res = await axios.put(`${API}/api/devices/${id}/pins`, { pins: editingPins }, { headers });
            setDevice(res.data);
            setEditingPins(JSON.parse(JSON.stringify(res.data.pins || [])));
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
            // STAY on config tab — do NOT switch to control
        } catch (err) {
            console.error(err);
            alert(`Failed to save pins: ${err.response?.data?.detail || err.message}`);
        }
        finally { setSavingPins(false); }
    };

    // ─── Code Generator ──────────────────────────────────────────────────────
    const generateCode = () => {
        if (!device) return '';
        const board = device.board || 'esp32';
        const isArduino = ['uno', 'nano', 'mega'].includes(board);
        const isESP8266 = board === 'esp8266';
        const ssid = device.wifiSSID || 'YOUR_WIFI_SSID';
        const pass = device.wifiPassword || 'YOUR_WIFI_PASSWORD';
        const isSerial = device.mode === 'serial';
        const isUSB = device.mode === 'usb';

        const pinMacroFn = (p) => `PIN_${sanitize(p.label)}`;
        const sanitizeFn = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '_');

        const pinDefs = device.pins.map(p =>
            `#define ${pinMacroFn(p).padEnd(20)} ${p.pinNumber}`
        ).join('\n');

        const setupPins = device.pins.map(p => {
            if (p.type === 'servo') return `  myServo_${sanitizeFn(p.label)}.attach(${pinMacroFn(p)});`;
            return `  pinMode(${pinMacroFn(p)}, ${p.mode === 'INPUT' ? 'INPUT' : p.mode === 'INPUT_PULLUP' ? 'INPUT_PULLUP' : 'OUTPUT'});`;
        }).join('\n');

        const servoLib = isArduino ? '#include <Servo.h>' : (board === 'esp8266' ? '#include <Servo.h>' : '#include <ESP32Servo.h>');
        const servoIncludes = device.pins.some(p => p.type === 'servo') ? servoLib + '\n' : '';
        const servoObjects = device.pins.filter(p => p.type === 'servo')
            .map(p => `Servo myServo_${sanitizeFn(p.label)};`).join('\n');

        // ── ARDUINO USB MODE ──────────────────────────────────────────────
        if (isUSB || isArduino) {
            const stateVars = device.pins.filter(p => p.type === 'digital' && p.mode === 'OUTPUT')
                .map(p => `bool ${sanitizeFn(p.label)}_state = false;`).join('\n');

            const applyLogic = device.pins.filter(p => p.mode === 'OUTPUT').map(p => {
                const macro = pinMacroFn(p);
                const key = p.widgetKey;
                if (p.type === 'servo') {
                    return `    if (doc.containsKey("${key}")) { int a = doc["${key}"]; a = constrain(a, ${p.min || 0}, ${p.max || 180}); myServo_${sanitizeFn(p.label)}.write(a); }`;
                }
                if (p.type === 'pwm') {
                    return `    if (doc.containsKey("${key}")) { analogWrite(${macro}, (int)doc["${key}"]); }`;
                }
                return `    if (doc.containsKey("${key}")) { bool v = doc["${key}"]; ${sanitizeFn(p.label)}_state = v; digitalWrite(${macro}, v ? HIGH : LOW); }`;
            }).filter(Boolean).join('\n');

            return `// ================================================================
// ${device.name} — IoIoT Arduino USB Direct Control
// ================================================================
// Browser sends JSON commands via Web Serial API:
//   {"k":"<widgetKey>","v":<value>}\n
// This sketch parses and applies them instantly.
// Required Library: ArduinoJson
// ================================================================

${servoIncludes}#include <ArduinoJson.h>

// ── Pin Definitions ────────────────────────────────────────────
${pinDefs}

// ── Servo Objects ──────────────────────────────────────────────
${servoObjects || '// (no servo pins)'}

// ── State ──────────────────────────────────────────────────────
${stateVars || '// (none)'}

void setup() {
  Serial.begin(115200);
  while (!Serial); // Leonardo/Mega: wait for USB
  delay(300);

  // ── Initialize Pins ──────────────────────────────────────
${setupPins}

  Serial.println("IoIoT Ready");
}

void loop() {
  if (Serial.available() > 0) {
    String line = Serial.readStringUntil('\\n');
    line.trim();
    if (line.length() == 0) return;

    StaticJsonDocument<128> doc;
    DeserializationError err = deserializeJson(doc, line);
    if (err) { Serial.println("ERR:JSON"); return; }

    const char* k = doc["k"];
    if (!k) { Serial.println("ERR:KEY"); return; }

    String key = String(k);

    // ── Apply Commands ──────────────────────────────────────
${applyLogic || '    // Configure pins in Pin Config tab first'}

    // Echo back as confirmation
    Serial.println(line);
  }
}`;
        }

        // ── BLUETOOTH / SERIAL MODE ───────────────────────────────────────
        const stateVarsBT = device.pins
            .filter(p => p.type === 'digital' && p.mode === 'OUTPUT')
            .map(p => `bool ${pinMacroFn(p)}_state = false;`).join('\n');
        const commandCases = device.pins
            .filter(p => p.commandChar && p.mode === 'OUTPUT')
            .map(p => {
                const macro = pinMacroFn(p);
                if (p.type === 'servo') return `    case '${p.commandChar.toUpperCase()}':\n      myServo_${sanitizeFn(p.label)}.write(90);\n      Serial.println("${p.label}: 90 deg"); break;`;
                if (p.type === 'pwm') return `    case '${p.commandChar.toUpperCase()}':\n      analogWrite(${macro}, 128);\n      Serial.println("${p.label}: speed set"); break;`;
                return `    case '${p.commandChar.toUpperCase()}':\n      ${macro}_state = !${macro}_state;\n      digitalWrite(${macro}, ${macro}_state ? HIGH : LOW);\n      Serial.println("${p.label}: " + String(${macro}_state ? "ON" : "OFF")); break;`;
            }).join('\n');
        const charMap = device.pins.filter(p => p.commandChar && p.mode === 'OUTPUT')
            .map(p => `//   '${p.commandChar.toUpperCase()}' → ${p.label}`).join('\n');

        if (isSerial) {
            const btInclude = board === 'esp8266' ? '' : '\n#include "BluetoothSerial.h"\nBluetoothSerial SerialBT;';
            const btBegin = board === 'esp8266' ? '' : `  SerialBT.begin("${device.name.replace(/\s+/g, '_')}");`;
            const btRead = board === 'esp8266' ? '' : '\n  if (SerialBT.available()) received = SerialBT.read();';
            return `// ================================================================
// ${device.name} — IoIoT Bluetooth/Serial Mode (${board.toUpperCase()})
// COMMAND MAP:\n${charMap || '// (no output pins defined)'}
// ================================================================

${servoIncludes}${btInclude}

${pinDefs}
${servoObjects ? '\n' + servoObjects : ''}
${stateVarsBT ? '\n' + stateVarsBT : ''}

void setup() {
  Serial.begin(115200);
${setupPins}
${btBegin}
  Serial.println("Ready — ${device.name}");
}

void loop() {
  char received = 0;
  if (Serial.available()) received = Serial.read();${btRead}
  if (received) {
    received = toupper(received);
    switch (received) {
${commandCases || '      // Add pins in Pin Config tab'}
      default: break;
    }
  }
  delay(10);
}`;
        }

        // ── WIFI CLOUD MODE ───────────────────────────────────────────────
        const stateVarsWifi = device.pins.filter(p => p.type === 'digital' && p.mode === 'OUTPUT')
            .map(p => `bool last_${sanitizeFn(p.label)} = false;`).join('\n');
        const applyLogicWifi = device.pins.filter(p => p.mode === 'OUTPUT').map(p => {
            const macro = pinMacroFn(p);
            const key = p.widgetKey;
            if (p.type === 'servo') return `      { int angle = doc["${key}"] | 90; angle = constrain(angle, ${p.min || 0}, ${p.max || 180}); myServo_${sanitizeFn(p.label)}.write(angle); }`;
            if (p.type === 'pwm') return `      { int spd = doc["${key}"] | 0; analogWrite(${macro}, spd); }`;
            if (p.type === 'digital') return `      { bool v = doc["${key}"] | false; if(v != last_${sanitizeFn(p.label)}) { digitalWrite(${macro}, v ? HIGH : LOW); last_${sanitizeFn(p.label)} = v; } }`;
            return '';
        }).filter(Boolean).join('\n');

        const fastConnectLib = isESP8266 ? '' : '#include <Preferences.h>\nPreferences prefs;';
        const wifiLib = isESP8266 ? '#include <ESP8266WiFi.h>\n#include <ESP8266HTTPClient.h>' : '#include <WiFi.h>\n#include <HTTPClient.h>\n#include <WiFiClientSecure.h>\n#include "esp_wifi.h"';
        const otaLib = device.otaEnabled && !isESP8266 ? '#include <HTTPUpdate.h>\n' : '';
        const wifiPower = isESP8266 ? '  WiFi.setOutputPower(10);' : '  esp_wifi_set_max_tx_power(34);';
        const boardName = board === 'esp8266' ? 'ESP8266' : 'ESP32';

        return `// ================================================================
// ${device.name} — IoIoT WiFi Cloud Mode (${boardName})
// Optimized for Fast Connect (stores BSSID/Channel in NVS)
// ================================================================

${servoIncludes}${wifiLib}
${otaLib}${fastConnectLib}
#include <ArduinoJson.h>

const char* ssid      = "${ssid}";
const char* password  = "${pass}";
const char* AUTH_TOKEN = "${device.authToken}";
const char* SERVER_URL = "${API || 'https://aadilsp-ioiot-backend.hf.space'}/api/esp/state";
const char* VERSION    = "${Date.now()}"; // Used for OTA tracking

// ── Global Client ────────────────────────────────────────────────
${isESP8266 ? 'WiFiClient client;' : 'NetworkClientSecure client;'}

// ── Pin Definitions ────────────────────────────────────────────
${pinDefs}

${servoObjects || '// (no servo pins)'}
${stateVarsWifi ? '\n' + stateVarsWifi : ''}

void setup() {
  Serial.begin(115200);
  delay(${isESP8266 ? '1000' : '2000'});

${setupPins}

  ${!isESP8266 ? 'client.setInsecure(); // Allow HTTPS without certificate validation' : ''}

  WiFi.mode(WIFI_STA);
  Serial.print("Connecting to WiFi");

  ${!isESP8266 ? `
  // --- FAST CONNECT (ESP32) ---
  Preferences prefs;
  prefs.begin("wifi-cfg", true);
  int ch = prefs.getInt("ch", 0);
  uint8_t bssid[6];
  bool hasBssid = prefs.getBytes("bssid", bssid, 6) == 6;
  prefs.end();

  if (ch > 0 && hasBssid) {
    Serial.print(" (Fast Connect)");
    WiFi.begin(ssid, password, ch, bssid);
  } else {
    WiFi.begin(ssid, password);
  }
  ` : 'WiFi.begin(ssid, password);'}

${wifiPower}
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries++ < 40) {
    delay(500); Serial.print(".");
    ${!isESP8266 ? 'if (tries == 12) { WiFi.disconnect(); WiFi.begin(ssid, password); Serial.print(" (retry)"); }' : ''}
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\\n\u2713 Connected! IP: " + WiFi.localIP().toString());
    ${!isESP8266 ? `
    // Save BSSID/channel for next fast connect
    Preferences prefs2;
    prefs2.begin("wifi-cfg", false);
    prefs2.putInt("ch", WiFi.channel());
    prefs2.putBytes("bssid", WiFi.BSSID(), 6);
    prefs2.end();
    ` : ''}
  } else {
    Serial.println("\\n\u2717 WiFi failed. Restarting...");
    ESP.restart();
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost, reconnecting...");
    WiFi.reconnect();
    delay(5000);
    return;
  }

  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("x-auth-token", AUTH_TOKEN);
  http.setTimeout(3000);
  int code = http.GET();

  if (code == 200) {
    StaticJsonDocument<1024> doc;
    DeserializationError err = deserializeJson(doc, http.getString());
    if (!err) {
${applyLogicWifi || '      // Configure pins in Pin Config tab'}
${device.otaEnabled ? `
      // \u2500\u2500 Wireless Cloud Update (OTA) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if (doc.containsKey("_ota")) {
        String url = doc["_ota"]["url"];
        String v = doc["_ota"]["ver"];
        if (v != String(VERSION)) {
          Serial.println("OTA Update: " + v);
          httpUpdate.update(client, url);
        }
      }` : ''}
    }
  } else if (code < 0) {
    Serial.println("HTTP error: " + String(code));
  }
  http.end();
  delay(20); // 20ms = ~50 polls/sec for near-instant control
}`;
    };
    const pinMacro = (p) => `PIN_${sanitize(p.label)}`;
    const sanitize = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    const copyCode = () => {
        navigator.clipboard.writeText(generateCode());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadCode = () => {
        const code = generateCode();
        const name = device?.name?.replace(/\s+/g, '_') || 'ioiot_device';
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.ino`;
        a.click(); URL.revokeObjectURL(url);
    };

    const getOS = () => {
        const ua = navigator.userAgent;
        if (/Android/i.test(ua)) return 'android';
        if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
        if (/Win/i.test(ua)) return 'windows';
        if (/Mac/i.test(ua)) return 'mac';
        if (/Linux/i.test(ua)) return 'linux';
        return 'unknown';
    };
    const os = getOS();
    const supportsWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

    // ── Cloud Compile + Flash state ──────────────────────────────────────────
    const [selectedBoard, setSelectedBoard] = useState('esp32:esp32:esp32');
    const [compiling, setCompiling] = useState(false);
    const [compileLogs, setCompileLogs] = useState([]);
    const [compiledFiles, setCompiledFiles] = useState(null);
    const [flashing, setFlashing] = useState(false);
    const [flashProgress, setFlashProgress] = useState(0);
    const [flashDone, setFlashDone] = useState(false);
    const compileLogRef = useRef(null);

    // Set board from device when loaded
    useEffect(() => {
        if (device?.board) setSelectedBoard(BOARD_FQBN[device.board] || 'esp32:esp32:esp32');
    }, [device?.board]);

    // Auto-scroll compile log
    useEffect(() => {
        if (compileLogRef.current) compileLogRef.current.scrollTop = compileLogRef.current.scrollHeight;
    }, [compileLogs]);

    const BOARDS = [
        { fqbn: 'esp32:esp32:esp32', label: '🔷 ESP32 Dev Module' },
        { fqbn: 'esp32:esp32:esp32s2', label: '🔷 ESP32-S2' },
        { fqbn: 'esp32:esp32:esp32s3', label: '🔷 ESP32-S3' },
        { fqbn: 'esp32:esp32:esp32c3', label: '🔷 ESP32-C3' },
        { fqbn: 'esp8266:esp8266:nodemcuv2', label: '🔵 ESP8266 NodeMCU v2' },
        { fqbn: 'esp8266:esp8266:d1_mini', label: '🔵 ESP8266 Wemos D1 Mini' },
        { fqbn: 'arduino:avr:uno', label: '🟦 Arduino Uno' },
        { fqbn: 'arduino:avr:nano', label: '🟩 Arduino Nano' },
        { fqbn: 'arduino:avr:mega', label: '🟪 Arduino Mega' },
    ];

    const compileCode = async () => {
        setCompiling(true);
        setCompileLogs([]);
        setCompiledFiles(null);
        setFlashDone(false);
        setFlashProgress(0);

        const code = generateCode();
        const addLog = (text, isError = false) => {
            setCompileLogs(prev => [...prev, { text, isError, time: new Date().toLocaleTimeString() }]);
        };

        try {
            const response = await fetch(`${API}/api/compile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ code, board: selectedBoard })
            });

            if (!response.ok) {
                const err = await response.json();
                addLog(err.error || 'Compile request failed', true);
                setCompiling(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const ev = JSON.parse(line.slice(6));
                        if (ev.type === 'log') addLog(ev.data);
                        else if (ev.type === 'binary') {
                            setCompiledFiles(ev.data.files);
                            addLog(`⚡ Binary ready — ${ev.data.files.length} files to flash`);
                        }
                        else if (ev.type === 'error') addLog(ev.data, true);
                    } catch { }
                }
            }
        } catch (err) {
            addLog(`Compile request failed: ${err.message}`, true);
        }
        setCompiling(false);
    };

    const flashToESP32 = async () => {
        if (!compiledFiles || !supportsWebSerial) return;
        setFlashing(true);
        setFlashProgress(0);
        setFlashDone(false);

        const addLog = (text, isError = false) => {
            setCompileLogs(prev => [...prev, { text, isError, time: new Date().toLocaleTimeString() }]);
        };

        let transport;
        try {
            const port = await navigator.serial.requestPort();
            transport = new Transport(port, true);

            const terminalLogger = {
                clean() { },
                writeLine(data) { if (data?.trim()) addLog(data.trim()); },
                write(data) { }
            };

            const loader = new ESPLoader({
                transport,
                baudrate: 921600,
                romBaudrate: 115200,
                terminal: terminalLogger,
                debugLogging: false
            });

            addLog('🔌 Connecting to ESP32... (hold BOOT button if it fails)');
            await loader.main();
            addLog(`📜 Chip detected: ${loader.chip.CHIP_NAME}`);

            // Convert base64 to binary strings for esptool-js
            const fileArray = compiledFiles.map(f => ({
                address: f.address,
                data: atob(f.data)
            }));

            addLog(`📤 Flashing ${fileArray.length} files...`);

            await loader.writeFlash({
                fileArray,
                flashSize: 'keep',
                flashMode: 'keep',
                flashFreq: 'keep',
                eraseAll: false,
                compress: true,
                reportProgress: (fileIndex, written, total) => {
                    const pct = Math.round((written / total) * 100);
                    setFlashProgress(pct);
                    if (pct % 20 === 0) addLog(`→ File ${fileIndex + 1}: ${pct}%`);
                }
            });

            setFlashProgress(100);
            setFlashDone(true);
            addLog('✅ Flash complete! ESP32 is restarting with your new code.');
            await loader.after();
            await transport.disconnect();
        } catch (err) {
            console.error(err);
            addLog('❌ Flashing failed: ' + err.message, true);
        } finally {
            setFlashing(false);
        }
    };

    const pushOTAUpdate = async () => {
        if (!compiledFiles) return;
        const sketch = compiledFiles.files.find(f => f.name === 'Sketch');
        if (!sketch) { alert('Compiled sketch not found'); return; }

        setOtaUpdating(true);
        setOtaStatus('Uploading firmware to cloud...');
        try {
            await axios.post(`${API}/api/devices/${id}/firmware`, {
                binary: sketch.data,
                version: Date.now().toString()
            }, { headers });
            setOtaStatus('Success! Device will update wirelessly.');
            setTimeout(() => { setOtaUpdating(false); setOtaStatus(''); }, 3000);
        } catch (err) {
            setOtaStatus('Upload failed: ' + (err.response?.data?.error || err.message));
            setTimeout(() => { setOtaUpdating(false); setOtaStatus(''); }, 5000);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-96">
            <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
        </div>
    );

    if (!device) return (
        <div className="flex flex-col items-center justify-center h-96">
            <p className="text-red-500 font-mono uppercase tracking-widest">Device Not Found</p>
            <button onClick={() => navigate('/dashboard')} className="mt-4 text-orange-500 font-mono text-sm hover:underline">← Back</button>
        </div>
    );

    const isSerial = device.mode === 'serial';
    const isUSB = device.mode === 'usb';
    const isESP8266 = device.board === 'esp8266';
    const boardLabel = device.board ? ({ esp32: 'ESP32', esp8266: 'ESP8266', uno: 'Uno', nano: 'Nano', mega: 'Mega' }[device.board] || device.board.toUpperCase()) : null;

    return (
        <div className={`min-h-screen p-6 md:p-10 max-w-5xl mx-auto`}>
            {/* Back + Header */}
            <div className="mb-6">
                <button onClick={() => navigate('/dashboard')} className={`flex items-center gap-2 font-mono text-sm mb-4 transition-colors ${dark ? 'text-[#555] hover:text-orange-500' : 'text-gray-400 hover:text-orange-500'}`}>
                    <ArrowLeft className="w-4 h-4" /> Back to Devices
                </button>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 ${serialConnected && isUSB ? 'border-green-500/50 bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : device.isConnected && !isUSB ? 'border-green-500/50 bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : dark ? 'border-[#444] bg-[#2a2a3a]' : 'border-gray-200 bg-gray-100'}`}>
                            {isUSB
                                ? <Usb className={`w-8 h-8 ${serialConnected ? 'text-green-400' : 'text-gray-400'}`} />
                                : isSerial
                                    ? <Bluetooth className="w-8 h-8 text-blue-400" />
                                    : device.isConnected ? <Wifi className="w-8 h-8 text-green-400" /> : <WifiOff className={`w-8 h-8 ${dark ? 'text-[#555]' : 'text-gray-300'}`} />}
                        </div>
                        <div>
                            <h2 className={`text-2xl font-black font-mono uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-900'}`}>{device.name}</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className={`flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] font-black ${device.isConnected ? 'text-green-400' : dark ? 'text-gray-400' : 'text-gray-400'}`}>
                                    <span className={`w-2 h-2 rounded-full ${device.isConnected ? 'bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]' : dark ? 'bg-gray-700' : 'bg-gray-300'}`}></span>
                                    {device.isConnected ? 'Online' : 'Offline'}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded font-mono border ${isUSB ? 'text-green-400 border-green-500/20 bg-green-500/10' : isSerial ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' : 'text-orange-500 border-orange-500/20 bg-orange-500/10'}`}>
                                    {isUSB ? 'USB Direct' : isSerial ? 'Bluetooth/Serial' : 'WiFi / Cloud'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={fetchDevice} className={`flex items-center gap-2 px-6 py-3 rounded-xl border-2 text-sm font-black transition-all shadow-xl ${dark ? 'bg-[#2a2a3a] border-[#444] text-white hover:bg-orange-500 hover:text-black hover:border-orange-500' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900'}`}>
                        <RefreshCw className="w-5 h-5" /> Refresh
                    </button>
                </div>
            </div>

            {/* Auth Token Banner — only for WiFi devices */}
            {!isSerial && !isUSB && (
                <div className={`mb-4 p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 ${card}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`font-mono text-xs uppercase tracking-widest shrink-0 ${mutedText}`}>Auth Token:</span>
                        <code className="flex-1 text-orange-400 font-mono text-xs bg-black/40 px-3 py-1.5 rounded-lg overflow-x-auto min-w-0">{device.authToken}</code>
                        <button onClick={() => navigator.clipboard.writeText(device.authToken)} className={`p-2 rounded-lg transition-all ${dark ? 'text-[#555] hover:text-orange-500' : 'text-gray-400 hover:text-orange-500'}`}>
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={() => setShowWifi(!showWifi)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all shrink-0 ${showWifi ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : dark ? 'border-[#222] text-[#555] hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'}`}>
                        <Wifi className="w-3.5 h-3.5" /> WiFi Credentials
                    </button>
                    {/* OTA Toggle — always visible, ESP32 only */}
                    {!isSerial && !isUSB && device.board === 'esp32' && (
                        <button
                            onClick={async () => {
                                const newVal = !device.otaEnabled;
                                setDevice(prev => ({ ...prev, otaEnabled: newVal }));
                                try { await axios.put(`${API}/api/devices/${id}`, { otaEnabled: newVal }, { headers }); } catch { }
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all shrink-0 ${device.otaEnabled
                                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                                    : dark ? 'border-[#333] text-[#555] hover:text-purple-400 hover:border-purple-500/30' : 'border-gray-300 text-gray-400 hover:text-purple-500'
                                }`}>
                            <div className={`w-2 h-2 rounded-full ${device.otaEnabled ? 'bg-purple-400 animate-pulse' : 'bg-gray-600'}`} />
                            Cloud OTA {device.otaEnabled ? 'ON' : 'OFF'}
                        </button>
                    )}
                </div>
            )}

            {/* WiFi Credentials Panel */}
            <AnimatePresence>
                {showWifi && !isSerial && !isUSB && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className={`mb-4 p-5 border border-orange-500/20 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 items-end overflow-hidden ${card}`}>
                        <div>
                            <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1.5 ${mutedText}`}>WiFi SSID</label>
                            <input value={wifiSSID} onChange={e => setWifiSSID(e.target.value)} placeholder="Your WiFi name"
                                className={`w-full border outline-none rounded-lg px-3 py-2 font-mono text-sm transition-colors ${inputCls}`} />
                        </div>
                        <div>
                            <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1.5 ${mutedText}`}>WiFi Password</label>
                            <div className="relative">
                                <input value={wifiPassword} onChange={e => setWifiPassword(e.target.value)} type={showWifiPass ? 'text' : 'password'} placeholder="••••••••"
                                    className={`w-full border outline-none rounded-lg px-3 py-2 pr-9 font-mono text-sm transition-colors ${inputCls}`} />
                                <button onClick={() => setShowWifiPass(!showWifiPass)} className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${mutedText} hover:text-orange-500`}>
                                    {showWifiPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <p className={`col-span-full font-mono text-[10px] ${mutedText}`}>
                            WiFi credentials are stored securely and auto-filled in generated code.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tabs */}
            <div className={`flex gap-1 p-1 border rounded-xl mb-6 overflow-x-auto ${card}`}>
                {[
                    { key: 'control', icon: <Sliders className="w-4 h-4" />, label: 'Control' },
                    { key: 'config', icon: <Settings className="w-4 h-4" />, label: 'Pin Config' },
                    { key: 'code', icon: <Code2 className="w-4 h-4" />, label: 'Device Code' },
                    { key: 'flash', icon: <MonitorPlay className="w-4 h-4" />, label: 'Flash & Monitor', beta: true },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex-shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-mono font-black text-xs sm:text-sm transition-all ${tab === t.key
                            ? (t.beta ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] border-transparent' : 'bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.4)] border-transparent')
                            : dark ? 'text-gray-400 border border-[#3f3f4e] hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-gray-900 hover:bg-black/5'
                            }`}>
                        {t.icon}
                        <span className="hidden sm:inline">{t.label}</span>
                        <span className="sm:hidden">{t.label.split(' ')[0]}</span>
                        {t.beta && <span className="text-[9px] bg-purple-400/20 px-1 rounded hidden sm:inline">BETA</span>}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                {/* ── CONTROL TAB ─────────────────────────────────────────── */}
                {tab === 'control' && (
                    <motion.div key="control" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        {device.mode === 'usb' && (
                            <div className={`mb-6 p-6 rounded-2xl border-2 flex items-center justify-between gap-4 ${serialConnected ? 'bg-green-500/10 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.1)]' : 'bg-[#1e1e2d] border-[#3f3f4e]'
                                } shadow-2xl`}>
                                <div className="flex items-center gap-3">
                                    <Usb className={`w-5 h-5 shrink-0 ${serialConnected ? 'text-green-400' : 'text-gray-500'}`} />
                                    <div>
                                        <p className={`font-mono text-xs font-bold ${serialConnected ? 'text-green-400' : dark ? 'text-white' : 'text-gray-800'}`}>
                                            {serialConnected ? 'USB Connected — Direct control active' : autoConnecting ? 'Auto-connecting...' : 'USB Not Connected'}
                                        </p>
                                        <p className={`font-mono text-xs mt-0.5 ${mutedText}`}>
                                            {serialConnected ? 'Commands sent directly to Arduino over USB' : 'Connect via Flash & Monitor tab to control via USB'}
                                        </p>
                                    </div>
                                </div>
                                {!serialConnected && (
                                    <button onClick={() => connectSerial({ requestNew: true })}
                                        className="shrink-0 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-mono font-bold hover:bg-green-500 hover:text-white transition-all">
                                        <Usb className="w-3.5 h-3.5 inline mr-1" />Connect
                                    </button>
                                )}
                            </div>
                        )}
                        {isSerial && (
                            <div className="mb-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                                <p className="text-blue-400 font-mono text-xs">
                                    <span className="font-bold">Bluetooth/Serial mode:</span> Controls send single command characters to your ESP32. Pair your device and use a Bluetooth Terminal app.
                                </p>
                            </div>
                        )}
                        {device.pins.length === 0 ? (
                            <div className={`flex flex-col items-center justify-center h-52 border-2 border-dashed rounded-2xl text-center ${dark ? 'border-[#1a1a1a]' : 'border-gray-200'}`}>
                                <Zap className={`w-10 h-10 mb-3 ${dark ? 'text-[#222]' : 'text-gray-200'}`} />
                                <p className={`font-mono text-sm ${dark ? 'text-[#444]' : 'text-gray-400'}`}>No pins configured yet</p>
                                <button onClick={() => setTab('config')} className="mt-3 text-orange-500 font-mono text-xs hover:underline">→ Go to Pin Config</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {device.pins.map(pin => (
                                    <ControlWidget key={pin.widgetKey} pin={pin} isSerial={isSerial} onControl={sendControl} dark={dark} board={device?.board} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ── CONFIG TAB ──────────────────────────────────────────── */}
                {tab === 'config' && (
                    <motion.div key="config" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center mb-5">
                            <div>
                                <h3 className={`font-mono font-bold uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-900'}`}>Pin Configuration</h3>
                                <p className={`font-mono text-xs mt-0.5 ${mutedText}`}>Add hardware components and configure their GPIO pins</p>
                            </div>
                            <div className="flex gap-3 items-center">
                                {/* Save Success Message */}
                                {saveSuccess && (
                                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-green-400 font-mono text-xs flex items-center gap-1">
                                        <Check className="w-3.5 h-3.5" /> Saved!
                                    </motion.span>
                                )}
                                {/* Add Component Dropdown */}
                                <div className="relative">
                                    <button onClick={() => setShowPresets(!showPresets)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500 text-sm font-bold hover:bg-orange-500 hover:text-black transition-all">
                                        <Plus className="w-4 h-4" /> Add Component <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                    <AnimatePresence>
                                        {showPresets && (
                                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                                                className={`absolute right-0 top-full mt-2 w-72 border rounded-2xl shadow-2xl z-50 overflow-hidden ${dark ? 'bg-[#0D0D0D] border-[#222]' : 'bg-white border-gray-200'}`}>
                                                <div className="p-3">
                                                    <p className={`text-[10px] font-mono uppercase tracking-widest mb-2 px-1 ${mutedText}`}>Choose Hardware Component</p>
                                                    <div className="space-y-1">
                                                        {HARDWARE_PRESETS.map(preset => (
                                                            <button key={preset.id} onClick={() => addPinFromPreset(preset)}
                                                                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${dark ? 'hover:bg-orange-500/10' : 'hover:bg-orange-50'}`}>
                                                                <span className="text-xl w-7 text-center">{preset.icon}</span>
                                                                <div>
                                                                    <p className={`text-sm font-bold font-mono ${dark ? 'text-white' : 'text-gray-900'}`}>{preset.name}</p>
                                                                    <p className={`text-xs ${mutedText}`}>{preset.description}</p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <button onClick={savePins} disabled={savingPins}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-black text-sm font-bold hover:bg-orange-400 transition-all disabled:opacity-50">
                                    <Save className="w-4 h-4" /> {savingPins ? 'Saving...' : 'Save & Apply'}
                                </button>
                            </div>
                        </div>

                        {editingPins.length === 0 ? (
                            <div className={`flex flex-col items-center justify-center h-52 border-2 border-dashed rounded-2xl ${dark ? 'border-[#1a1a1a]' : 'border-gray-200'}`}>
                                <p className={`font-mono text-sm mb-3 ${dark ? 'text-[#444]' : 'text-gray-400'}`}>No components yet</p>
                                <p className={`font-mono text-xs ${mutedText}`}>Click "Add Component" to get started</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {editingPins.map((pin, idx) => (
                                    <PinConfigRow key={idx} pin={pin} idx={idx} onUpdate={updatePin} onRemove={removePin} isSerial={isSerial} dark={dark} card={card} inputCls={inputCls} mutedText={mutedText} board={device.board} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ── CODE TAB ────────────────────────────────────────────── */}
                {tab === 'code' && (
                    <motion.div key="code" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className={`font-mono font-bold uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-900'}`}>Generated ESP32 Code</h3>
                                <p className={`font-mono text-xs mt-0.5 ${mutedText}`}>
                                    Mode: <span className={isSerial ? 'text-blue-400' : 'text-orange-500'}>{isSerial ? 'Bluetooth/Serial Bare-Metal' : 'WiFi / Cloud Polling'}</span>
                                </p>
                            </div>
                            <button onClick={copyCode}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${copied ? 'bg-green-500 text-black' : 'bg-orange-500/10 border border-orange-500/30 text-orange-500 hover:bg-orange-500 hover:text-black'}`}>
                                {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Code</>}
                            </button>
                        </div>

                        {/* Required Libraries Note */}
                        <div className={`mb-4 p-4 border rounded-xl ${dark ? 'bg-blue-950/20 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
                            <p className="text-blue-400 font-mono text-xs font-bold mb-1">📦 Required Arduino Libraries (install via Library Manager):</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {['ArduinoJson', ...(device.pins.some(p => p.type === 'servo') ? ['ESP32Servo'] : []), ...(!isSerial ? ['WiFi (built-in)'] : [])].map(lib => (
                                    <span key={lib} className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">{lib}</span>
                                ))}
                            </div>
                        </div>

                        <div className={`border rounded-2xl p-6 overflow-auto max-h-[600px] ${dark ? 'bg-black border-[#1a1a1a]' : 'bg-gray-900 border-gray-700'}`}>
                            <pre className="text-xs font-mono text-green-400 leading-relaxed whitespace-pre">{generateCode()}</pre>
                        </div>
                        <p className={`mt-4 font-mono text-xs leading-relaxed ${mutedText}`}>
                            {isSerial
                                ? '📱 Upload → Open Bluetooth Terminal on your phone → Connect to device → Send command characters to control components.'
                                : '📡 Fill in WiFi credentials above → Upload to ESP32 → It will poll your dashboard every 100ms for an ultra-fast, instantaneous response.'}
                        </p>
                    </motion.div>
                )}

                {/* ── FLASH & MONITOR TAB ──────────────────────────────── */}
                {tab === 'flash' && (
                    <motion.div key="flash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

                        {/* ── Compile & Flash Panel ── */}
                        <div className={`p-5 border rounded-2xl ${betaMode ? 'border-purple-500/30 bg-purple-500/5' : card}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg">🚀</span>
                                        <h3 className={`font-mono font-bold text-sm uppercase tracking-widest ${betaMode ? 'text-purple-400' : dark ? 'text-white' : 'text-gray-900'}`}>
                                            Compile &amp; Flash
                                        </h3>
                                        {betaMode && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-400/20 text-purple-300">BETA</span>}
                                    </div>
                                    <p className={`font-mono text-xs ${mutedText}`}>
                                        {betaMode
                                            ? `Cloud-compile your code then flash directly to ${selectedBoard.startsWith('arduino:') ? 'Arduino' : 'ESP32'} over USB`
                                            : 'Enable Beta Mode in Profile to unlock one-click compile & flash'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button onClick={downloadCode}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${dark ? 'border-[#333] text-gray-400 hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'}`}>
                                        <Download className="w-3.5 h-3.5" /> .ino
                                    </button>
                                    {betaMode && (
                                        <>
                                            <button onClick={compileCode} disabled={compiling || flashing}
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 text-white text-xs font-mono font-bold hover:bg-purple-400 transition-all disabled:opacity-50">
                                                {compiling
                                                    ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Compiling...</>
                                                    : <>⚙️ Compile</>}
                                            </button>
                                            <button onClick={flashToESP32}
                                                disabled={!compiledFiles || flashing || compiling || !supportsWebSerial}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all disabled:opacity-40 ${flashDone ? 'bg-green-500 text-black' : 'bg-orange-500 text-black hover:bg-orange-400'}`}>
                                                {flashing
                                                    ? <><div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Flashing {flashProgress}%</>
                                                    : flashDone ? <><Check className="w-3.5 h-3.5" /> Done!</>
                                                        : <><Usb className="w-3.5 h-3.5" /> Flash via USB</>}
                                            </button>
                                            {device.otaEnabled && (selectedBoard.includes('esp32') || selectedBoard.includes('esp8266')) && (
                                                <button onClick={pushOTAUpdate}
                                                    disabled={!compiledFiles || otaUpdating || compiling}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 text-white text-xs font-mono font-bold hover:bg-purple-400 transition-all disabled:opacity-40 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                                                    {otaUpdating
                                                        ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {otaStatus || 'Updating...'}</>
                                                        : <><Wifi className="w-3.5 h-3.5" /> Upload via Cloud (OTA)</>}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {betaMode && (
                                <div className="mb-4">
                                    <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1.5 ${mutedText}`}>Board / Chip</label>
                                    <select value={selectedBoard} onChange={e => { setSelectedBoard(e.target.value); setCompiledFiles(null); }}
                                        className={`w-full border outline-none rounded-xl px-3 py-2 font-mono text-xs transition-colors ${inputCls}`}>
                                        {BOARDS.map(b => <option key={b.fqbn} value={b.fqbn}>{b.label}</option>)}
                                    </select>
                                </div>
                            )}

                            {flashing && (
                                <div className="mb-4">
                                    <div className={`w-full h-2 rounded-full overflow-hidden ${dark ? 'bg-[#222]' : 'bg-gray-200'}`}>
                                        <div className="h-full bg-orange-500 transition-all rounded-full" style={{ width: `${flashProgress}%` }} />
                                    </div>
                                    <p className={`font-mono text-xs mt-1 text-center ${mutedText}`}>{flashProgress}% flashed</p>
                                </div>
                            )}

                            {(compiling || compileLogs.length > 0) && (
                                <div ref={compileLogRef} className={`h-44 overflow-y-auto rounded-xl p-3 font-mono text-xs border ${dark ? 'bg-black border-[#1a1a1a]' : 'bg-gray-900 border-gray-700'}`}>
                                    {compileLogs.map((entry, i) => (
                                        <div key={i} className={`mb-0.5 flex gap-2 ${entry.isError ? 'text-red-400' : 'text-green-400'}`}>
                                            <span className="text-[#444] shrink-0">{entry.time}</span>
                                            <span>{entry.text}</span>
                                        </div>
                                    ))}
                                    {compiling && <div className="text-orange-400 animate-pulse">▌</div>}
                                </div>
                            )}

                            {!betaMode && (
                                <a href="/profile" className="inline-flex items-center gap-2 mt-2 text-orange-500 font-mono text-xs hover:underline">
                                    → Enable Beta Mode in Profile to compile &amp; flash
                                </a>
                            )}

                            {betaMode && !supportsWebSerial && (
                                <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                                    <p className="text-yellow-400 font-mono text-xs">Flashing requires Chrome or Edge on Desktop. Compilation works in any browser.</p>
                                </div>
                            )}
                        </div>

                        {/* Platform info + download */}
                        <div className={`p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 justify-between ${card}`}>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{os === 'windows' ? '🪟' : os === 'mac' ? '🍎' : os === 'linux' ? '🐧' : os === 'android' ? '🤖' : os === 'ios' ? '📱' : '💻'}</span>
                                <div>
                                    <p className={`font-mono text-sm font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>
                                        {os === 'android' ? 'Android' : os === 'ios' ? 'iPhone / iPad' : `${os.charAt(0).toUpperCase() + os.slice(1)}`} Detected
                                    </p>
                                    <p className={`font-mono text-xs ${mutedText}`}>
                                        {os === 'ios' || os === 'android' ? 'Use Arduino Web Editor for mobile uploads' : 'Arduino IDE also supported — download .ino and upload manually'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={downloadCode}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all shrink-0">
                                <Download className="w-4 h-4" /> Download .ino
                            </button>
                        </div>

                        {/* Flash Steps */}
                        <div className={`p-5 border rounded-xl ${card}`}>
                            <h3 className={`font-mono font-bold text-sm uppercase tracking-widest mb-4 ${dark ? 'text-white' : 'text-gray-900'}`}>
                                📋 How to Flash Your {boardLabel || 'Device'}
                            </h3>
                            <div className="space-y-3">
                                {(isUSB ? [
                                    { step: '1', title: 'Download the Code', desc: 'Click "Download .ino" to save your Arduino sketch.' },
                                    { step: '2', title: 'Install Arduino IDE', desc: 'Get Arduino IDE from arduino.cc/en/software for your OS.' },
                                    { step: '3', title: 'Install ArduinoJson Library', desc: 'Tools → Manage Libraries → Search "ArduinoJson" → Install. Required for JSON USB commands.' },
                                    { step: '4', title: 'Select Board & Port', desc: `Tools → Board → Arduino AVR Boards → ${boardLabel || 'Arduino Uno'}. Tools → Port → your COM/USB port.` },
                                    { step: '5', title: 'Upload!', desc: 'Click the Upload button (→). Then come back and use the Serial Monitor here to control it live.' },
                                ] : [
                                    { step: '1', title: 'Download the Code', desc: 'Click "Download .ino" above to save the generated Arduino code file.' },
                                    { step: '2', title: 'Install Arduino IDE', desc: os === 'windows' ? 'Download Arduino IDE from arduino.cc/en/software — Windows installer available.' : os === 'mac' ? 'Download Arduino IDE from arduino.cc/en/software or install via Homebrew: brew install --cask arduino.' : 'sudo apt install arduino OR download from arduino.cc/en/software.' },
                                    { step: '3', title: 'Add Board Support', desc: isESP8266 ? 'Add ESP8266 board URL: http://arduino.esp8266.com/stable/package_esp8266com_index.json. Then Board Manager → Search "esp8266" → Install.' : 'File → Preferences → Add "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json". Then Board Manager → Search "esp32" → Install.' },
                                    { step: '4', title: 'Install Libraries', desc: `Tools → Manage Libraries → Search and install: ArduinoJson${device?.pins.some(p => p.type === 'servo') ? (isESP8266 || isUSB ? ', Servo' : ', ESP32Servo') : ''}.` },
                                    { step: '5', title: 'Select Board & Port', desc: `Tools → Board → ${boardLabel || 'ESP32 Dev Module'}. Tools → Port → your COM/USB port.` },
                                    { step: '6', title: 'Upload!', desc: 'Click the Upload button (→). Hold the BOOT button on your ESP32 during upload if needed.' },
                                ]).map(({ step, title, desc }) => (
                                    <div key={step} className="flex gap-3">
                                        <div className="w-7 h-7 rounded-lg bg-orange-500 text-black font-black font-mono text-sm flex items-center justify-center shrink-0">{step}</div>
                                        <div>
                                            <p className={`font-mono text-sm font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>{title}</p>
                                            <p className={`font-mono text-xs mt-0.5 leading-relaxed ${mutedText}`}>{desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Web Serial Monitor (Beta) */}
                        {betaMode ? (
                            <div className={`p-5 border border-purple-500/30 rounded-xl bg-purple-500/5`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Terminal className="w-4 h-4 text-purple-400" />
                                        <h3 className="font-mono font-bold text-sm uppercase tracking-widest text-purple-400">Web Serial Monitor</h3>
                                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-400/20 text-purple-300">BETA</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select value={baudRate} onChange={e => setBaudRate(e.target.value)}
                                            disabled={serialConnected}
                                            className={`text-xs font-mono border rounded-lg px-2 py-1 outline-none ${dark ? 'bg-black border-[#333] text-white' : 'bg-white border-gray-300 text-gray-800'}`}>
                                            {[9600, 19200, 38400, 57600, 115200, 230400].map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                        {serialConnected ? (
                                            <button onClick={() => disconnectSerial()}
                                                className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-mono font-bold hover:bg-red-500 hover:text-white transition-all">
                                                Disconnect
                                            </button>
                                        ) : (
                                            <button onClick={() => connectSerial({ requestNew: true, baud: Number(baudRate) })}
                                                disabled={!supportsWebSerial}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-mono font-bold hover:bg-purple-500 hover:text-white transition-all disabled:opacity-40">
                                                <Usb className="w-3 h-3" /> {autoConnecting ? 'Auto-connecting...' : 'Connect USB'}
                                            </button>
                                        )}
                                        <button onClick={() => setSerialLog([])} className="p-1.5 rounded-lg text-red-400/40 hover:text-red-400 transition-all">
                                            <Trash className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {!supportsWebSerial && (
                                    <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                                        <p className="text-yellow-400 font-mono text-xs">Web Serial requires Chrome or Edge on Desktop. Not supported on mobile or Safari.</p>
                                    </div>
                                )}

                                {/* Log Output */}
                                <div className={`h-52 sm:h-72 overflow-y-auto rounded-xl p-3 font-mono text-xs border ${dark ? 'bg-black border-[#1a1a1a]' : 'bg-gray-900 border-gray-700'}`}>
                                    {serialLog.length === 0 ? (
                                        <p className="text-[#333] text-center mt-8">Connect your ESP32 and click "Connect USB" to start monitoring...</p>
                                    ) : (
                                        serialLog.map((entry, i) => (
                                            <div key={i} className="flex gap-2 mb-0.5">
                                                <span className="text-[#444] shrink-0">{entry.time}</span>
                                                <span className={entry.type === 'sys' ? 'text-yellow-500' : entry.type === 'tx' ? 'text-orange-400' : 'text-green-400'}>
                                                    {entry.type === 'tx' ? '→ ' : entry.type === 'sys' ? '● ' : ''}{entry.text}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Send Input */}
                                <div className="flex gap-2 mt-3">
                                    <input
                                        value={serialInput}
                                        onChange={e => setSerialInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && sendSerial()}
                                        placeholder={serialConnected ? 'Type command and press Enter...' : 'Connect first...'}
                                        disabled={!serialConnected}
                                        className={`flex-1 border outline-none rounded-xl px-3 py-2 font-mono text-xs transition-colors ${dark ? 'bg-black border-[#333] text-white focus:border-purple-500 placeholder-[#444]' : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-purple-400'} disabled:opacity-40`}
                                    />
                                    <button onClick={sendSerial} disabled={!serialConnected || !serialInput.trim()}
                                        className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500 hover:text-white transition-all disabled:opacity-40">
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className={`p-5 border border-dashed rounded-xl text-center ${dark ? 'border-[#222]' : 'border-gray-200'}`}>
                                <Terminal className={`w-8 h-8 mx-auto mb-2 ${dark ? 'text-[#333]' : 'text-gray-300'}`} />
                                <p className={`font-mono text-sm font-bold mb-1 ${dark ? 'text-[#444]' : 'text-gray-400'}`}>Web Serial Monitor</p>
                                <p className={`font-mono text-xs ${mutedText}`}>Enable Beta Mode in your Profile to use the in-browser serial monitor and connect to your ESP32 directly over USB.</p>
                                <a href="/profile" className="inline-block mt-3 text-orange-500 font-mono text-xs hover:underline">→ Go to Profile → Enable Beta Mode</a>
                            </div>
                        )
                        }
                    </motion.div >
                )
                }
            </AnimatePresence >
        </div >
    );
}

// ─── Control Widget ────────────────────────────────────────────────────────────
function ControlWidget({ pin, isSerial, onControl, dark, board }) {
    const config = BOARD_PINS[board] || BOARD_PINS.default;
    const isOn = pin.value === true || Number(pin.value) > 0;
    const cardBorder = dark ? '#1a1a1a' : '#e5e7eb';

    return (
        <div className={`rounded-2xl p-5 border transition-all`}
            style={{ borderColor: isOn ? pin.color + '66' : cardBorder, boxShadow: isOn ? `0 0 20px ${pin.color}15` : 'none', background: dark ? '#0A0A0A' : '#fff' }}>
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-base">{HARDWARE_PRESETS.find(p => p.id === pin.hardwareType)?.icon || '📍'}</span>
                        <h4 className={`font-mono font-bold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>{pin.label}</h4>
                        {isSerial && pin.commandChar && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                '{pin.commandChar.toUpperCase()}'
                            </span>
                        )}
                    </div>
                    <p className={`text-xs font-mono mt-0.5 ${dark ? 'text-[#555]' : 'text-gray-400'}`}>{config.getLabel(pin.pinNumber)} · {pin.hardwareType || pin.type}</p>
                </div>
                <div className="w-2 h-2 rounded-full mt-1" style={{ backgroundColor: isOn ? pin.color : dark ? '#333' : '#ddd' }}></div>
            </div>

            {/* Toggle */}
            {pin.widgetType === 'toggle' && (
                <button onClick={() => onControl(pin.widgetKey, !pin.value)}
                    className={`w-full py-3 rounded-xl font-mono font-bold text-sm transition-all active:scale-95 ${pin.value ? 'text-black' : dark ? 'border border-[#222] text-[#555] hover:text-white' : 'border border-gray-200 text-gray-400 hover:text-gray-700'}`}
                    style={pin.value ? { backgroundColor: pin.color } : {}}>
                    {pin.value ? '● ON' : '○ OFF'}
                </button>
            )}

            {/* Slider (PWM / DC Motor / Servo) */}
            {(pin.widgetType === 'slider' || pin.widgetType === 'servo_slider') && (
                <div className="space-y-3">
                    <div className="flex justify-between text-xs font-mono" style={{ color: dark ? '#555' : '#999' }}>
                        <span>{pin.min ?? 0}{pin.widgetType === 'servo_slider' ? '°' : ''}</span>
                        <span className="font-black text-base" style={{ color: pin.color }}>{pin.value}{pin.widgetType === 'servo_slider' ? '°' : ''}</span>
                        <span>{pin.max ?? 255}{pin.widgetType === 'servo_slider' ? '°' : ''}</span>
                    </div>
                    <input type="range" min={pin.min ?? 0} max={pin.max ?? 255} value={pin.value ?? 0}
                        onChange={e => onControl(pin.widgetKey, Number(e.target.value))}
                        className="w-full cursor-pointer" style={{ accentColor: pin.color }} />
                    {pin.widgetType === 'servo_slider' && (
                        <div className="flex gap-2">
                            {[0, 45, 90, 135, 180].map(angle => (
                                <button key={angle} onClick={() => onControl(pin.widgetKey, angle)}
                                    className={`flex-1 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${Number(pin.value) === angle ? 'text-black' : dark ? 'border border-[#222] text-[#555]' : 'border border-gray-200 text-gray-400'}`}
                                    style={Number(pin.value) === angle ? { backgroundColor: pin.color } : {}}>
                                    {angle}°
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Momentary Button */}
            {pin.widgetType === 'button' && (
                <button
                    onMouseDown={() => onControl(pin.widgetKey, true)}
                    onMouseUp={() => onControl(pin.widgetKey, false)}
                    onTouchStart={() => onControl(pin.widgetKey, true)}
                    onTouchEnd={() => onControl(pin.widgetKey, false)}
                    className={`w-full py-3 rounded-xl font-mono font-bold text-sm border active:scale-95 transition-all select-none ${dark ? 'border-[#222] text-[#555] hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-700'}`}
                    style={{ backgroundColor: pin.value ? pin.color + '33' : '' }}>
                    {pin.value ? '⚡ ACTIVE' : '⚡ HOLD TO ACTIVATE'}
                </button>
            )}

            {/* Value Display */}
            {pin.widgetType === 'value_display' && (
                <div className={`flex items-center justify-center py-4 rounded-xl border ${dark ? 'bg-black/40 border-[#111]' : 'bg-gray-50 border-gray-100'}`}>
                    <span className="text-4xl font-mono font-black" style={{ color: pin.color }}>
                        {pin.value === true ? 'HIGH' : pin.value === false ? 'LOW' : (pin.value ?? '—')}
                    </span>
                </div>
            )}
        </div>
    );
}

// ─── Pin Config Row ────────────────────────────────────────────────────────────
function PinConfigRow({ pin, idx, onUpdate, onRemove, isSerial, dark, card, inputCls, mutedText, board }) {
    const config = BOARD_PINS[board] || BOARD_PINS.default;
    const gpioList = (pin.type === 'analog_input') ? config.analog : (pin.type === 'pwm' || pin.type === 'servo') ? config.pwm : config.all;
    const preset = HARDWARE_PRESETS.find(p => p.id === pin.hardwareType);

    return (
        <div className={`border rounded-xl p-4 transition-all ${card}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span>{preset?.icon || '📍'}</span>
                    <span className={`text-sm font-bold font-mono ${dark ? 'text-white' : 'text-gray-900'}`}>{preset?.name || pin.hardwareType || 'Custom'}</span>
                    <span className={`text-[10px] font-mono px-2 py-1 rounded-xl bg-black/40 border ${dark ? 'border-[#333] text-orange-400' : 'border-gray-200 text-gray-400'}`}>{config.getLabel(pin.pinNumber)}</span>
                </div>
                <button onClick={() => onRemove(idx)} className="p-1.5 rounded-lg text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                    <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1 ${mutedText}`}>Label</label>
                    <input value={pin.label} onChange={e => onUpdate(idx, 'label', e.target.value)}
                        className={`w-full border outline-none rounded-lg px-2 py-1.5 font-mono text-xs transition-colors ${inputCls}`} />
                </div>
                <div>
                    <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1 ${mutedText}`}>GPIO Pin</label>
                    <select value={pin.pinNumber} onChange={e => onUpdate(idx, 'pinNumber', Number(e.target.value))}
                        className={`w-full border outline-none rounded-lg px-2 py-1.5 font-mono text-xs transition-colors ${inputCls}`}>
                        {gpioList.map(n => <option key={n} value={n}>{config.getLabel(n)}</option>)}
                    </select>
                </div>
                {isSerial ? (
                    <div>
                        <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1 ${mutedText}`}>Command Char</label>
                        <input value={pin.commandChar || ''} onChange={e => onUpdate(idx, 'commandChar', e.target.value.slice(-1).toUpperCase())}
                            placeholder="A" maxLength={1}
                            className={`w-full border outline-none rounded-lg px-2 py-1.5 text-blue-400 font-mono text-sm text-center uppercase ${inputCls}`} />
                    </div>
                ) : (
                    <div>
                        <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1 ${mutedText}`}>Widget Type</label>
                        <select value={pin.widgetType} onChange={e => onUpdate(idx, 'widgetType', e.target.value)}
                            className={`w-full border outline-none rounded-lg px-2 py-1.5 font-mono text-xs ${inputCls}`}>
                            <option value="toggle">Toggle Switch</option>
                            <option value="slider">Slider (PWM)</option>
                            <option value="servo_slider">Servo Angle Slider</option>
                            <option value="button">Push Button (Hold)</option>
                            <option value="value_display">Value Display (Sensor)</option>
                        </select>
                    </div>
                )}
                <div>
                    <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1 ${mutedText}`}>Color</label>
                    <input type="color" value={pin.color} onChange={e => onUpdate(idx, 'color', e.target.value)}
                        className={`w-full h-8 rounded-lg cursor-pointer border p-0.5 ${dark ? 'bg-black border-[#222]' : 'bg-white border-gray-200'}`} />
                </div>
                {(pin.widgetType === 'slider' || pin.widgetType === 'servo_slider') && (
                    <>
                        <div>
                            <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1 ${mutedText}`}>Min</label>
                            <input type="number" value={pin.min ?? 0} onChange={e => onUpdate(idx, 'min', Number(e.target.value))}
                                className={`w-full border outline-none rounded-lg px-2 py-1.5 font-mono text-xs ${inputCls}`} />
                        </div>
                        <div>
                            <label className={`block text-[10px] font-mono uppercase tracking-widest mb-1 ${mutedText}`}>Max</label>
                            <input type="number" value={pin.max ?? (pin.widgetType === 'servo_slider' ? 180 : 255)} onChange={e => onUpdate(idx, 'max', Number(e.target.value))}
                                className={`w-full border outline-none rounded-lg px-2 py-1.5 font-mono text-xs ${inputCls}`} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
