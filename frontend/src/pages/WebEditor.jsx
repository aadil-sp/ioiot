import { useState, useRef, useEffect, useContext, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { ESPLoader, Transport } from 'esptool-js';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, Terminal, Trash2, Send, Cpu, ChevronDown,
    Usb, AlertTriangle, Check, Download, BookOpen,
    Code2, Zap, Info, Copy
} from 'lucide-react';
import { ThemeContext } from '../App';

const API = import.meta.env.VITE_API_URL || '';

// ─── Pre-installed Libraries ──────────────────────────────────────────────────
const PREINSTALLED_LIBS = [
    { name: 'ESP32Servo', include: '#include <ESP32Servo.h>', desc: 'Servo motor control for ESP32' },
    { name: 'ArduinoJson', include: '#include <ArduinoJson.h>', desc: 'JSON serialization/deserialization' },
    { name: 'WiFi', include: '#include <WiFi.h>', desc: 'ESP32 WiFi connectivity' },
    { name: 'HTTPClient', include: '#include <HTTPClient.h>', desc: 'HTTP client requests' },
    { name: 'WiFiClientSecure', include: '#include <WiFiClientSecure.h>', desc: 'HTTPS / SSL support' },
    { name: 'BluetoothSerial', include: '#include "BluetoothSerial.h"', desc: 'Classic Bluetooth Serial' },
    { name: 'BLEDevice', include: '#include <BLEDevice.h>', desc: 'Bluetooth Low Energy (BLE)' },
    { name: 'Preferences', include: '#include <Preferences.h>', desc: 'Non-volatile storage (NVS)' },
    { name: 'SPIFFS', include: '#include <SPIFFS.h>', desc: 'SPI Flash File System' },
    { name: 'Wire', include: '#include <Wire.h>', desc: 'I2C communication' },
    { name: 'SPI', include: '#include <SPI.h>', desc: 'SPI communication' },
    { name: 'esp_sleep', include: '#include "esp_sleep.h"', desc: 'Deep sleep & power management' },
    { name: 'WebServer', include: '#include <WebServer.h>', desc: 'Built-in ESP32 HTTP server' },
    { name: 'DNSServer', include: '#include <DNSServer.h>', desc: 'DNS server (captive portal)' },
    { name: 'Update', include: '#include <Update.h>', desc: 'OTA firmware update' },
    { name: 'esp_wifi', include: '#include "esp_wifi.h"', desc: 'ESP32 WiFi driver (low-level)' },
];

// ─── Board Options ────────────────────────────────────────────────────────────
const BOARDS = [
    { fqbn: 'esp32:esp32:esp32', label: '🔷 ESP32 Dev Module' },
    { fqbn: 'esp32:esp32:esp32s2', label: '🔷 ESP32-S2' },
    { fqbn: 'esp32:esp32:esp32s3', label: '🔷 ESP32-S3' },
    { fqbn: 'esp32:esp32:esp32c3', label: '🔷 ESP32-C3' },
    { fqbn: 'esp8266:esp8266:nodemcuv2', label: '🔵 ESP8266 NodeMCU v2' },
    { fqbn: 'esp8266:esp8266:d1_mini', label: '🔵 ESP8266 D1 Mini' },
];

// ─── Default Sketch ───────────────────────────────────────────────────────────
const DEFAULT_SKETCH = `// ================================================================
// IoIoT Web Editor — ESP32 Starter Sketch
// Libraries pre-installed: ESP32Servo, ArduinoJson, WiFi, more...
// ================================================================

#include <Arduino.h>

// ── LED Blink Demo ────────────────────────────────────────────────
#define LED_PIN 2   // Built-in LED on most ESP32 dev boards

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(LED_PIN, OUTPUT);
  Serial.println("IoIoT Web Editor — ESP32 Ready!");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED ON");
  delay(500);

  digitalWrite(LED_PIN, LOW);
  Serial.println("LED OFF");
  delay(500);
}
`;

// ─── Code Templates ───────────────────────────────────────────────────────────
const TEMPLATES = [
    {
        name: 'LED Blink',
        icon: '💡',
        code: DEFAULT_SKETCH,
    },
    {
        name: 'Servo Control',
        icon: '🤖',
        code: `// ================================================================
// Servo Control — ESP32Servo
// ================================================================
#include <ESP32Servo.h>

Servo myServo;
#define SERVO_PIN 18

void setup() {
  Serial.begin(115200);
  myServo.attach(SERVO_PIN);
  Serial.println("Servo Ready!");
}

void loop() {
  for (int pos = 0; pos <= 180; pos += 5) {
    myServo.write(pos);
    delay(30);
  }
  for (int pos = 180; pos >= 0; pos -= 5) {
    myServo.write(pos);
    delay(30);
  }
}
`,
    },
    {
        name: 'WiFi Connect',
        icon: '📡',
        code: `// ================================================================
// WiFi Connection — ESP32
// ================================================================
#include <WiFi.h>

const char* ssid     = "YOUR_SSID";
const char* password = "YOUR_PASSWORD";

void setup() {
  Serial.begin(115200);
  delay(1000);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries++ < 40) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\\nFailed to connect!");
  }
}

void loop() {
  delay(1000);
}
`,
    },
    {
        name: 'HTTP GET',
        icon: '🌐',
        code: `// ================================================================
// HTTP GET Request — ESP32
// ================================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

const char* ssid     = "YOUR_SSID";
const char* password = "YOUR_PASSWORD";
const char* serverUrl = "https://httpbin.org/get";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
  Serial.println("WiFi connected!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure(); // Skip SSL verification for demo
    HTTPClient http;
    http.begin(client, serverUrl);
    int code = http.GET();
    Serial.println("HTTP Code: " + String(code));
    if (code == 200) Serial.println(http.getString().substring(0, 200));
    http.end();
  }
  delay(5000);
}
`,
    },
    {
        name: 'JSON Parser',
        icon: '📋',
        code: `// ================================================================
// JSON Parsing — ArduinoJson
// ================================================================
#include <ArduinoJson.h>

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Example JSON string
  const char* json = R"({"device":"ESP32","temp":25.5,"status":true})";

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, json);

  if (error) {
    Serial.print("Error: ");
    Serial.println(error.c_str());
    return;
  }

  const char* device = doc["device"];
  float temp = doc["temp"];
  bool status = doc["status"];

  Serial.println("Device: " + String(device));
  Serial.println("Temp: " + String(temp));
  Serial.println("Status: " + String(status ? "true" : "false"));
}

void loop() {
  delay(1000);
}
`,
    },
    {
        name: 'BLE Beacon',
        icon: '📶',
        code: `// ================================================================
// BLE Advertising Beacon — ESP32
// ================================================================
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

void setup() {
  Serial.begin(115200);
  Serial.println("Starting BLE!");

  BLEDevice::init("IoIoT-ESP32");
  BLEServer* server = BLEDevice::createServer();
  BLEService* service = server->createService(SERVICE_UUID);
  BLECharacteristic* characteristic = service->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  characteristic->setValue("Hello IoIoT!");
  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->start();
  Serial.println("BLE advertising started!");
}

void loop() {
  delay(2000);
}
`,
    },
];

// ─── Monaco Arduino Language Config ──────────────────────────────────────────
const ARDUINO_KEYWORDS = [
    'void', 'setup', 'loop', 'int', 'float', 'bool', 'char', 'String', 'byte',
    'unsigned', 'long', 'short', 'double', 'const', 'true', 'false', 'HIGH',
    'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'NULL', 'return',
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'new', 'delete', 'class', 'public', 'private', 'protected', 'static',
    'volatile', 'auto', 'register', 'extern', 'typedef', 'struct', 'enum', 'union',
    'sizeof', 'nullptr', 'this', 'template', 'namespace', 'inline',
];

const ARDUINO_FUNCTIONS = [
    'pinMode', 'digitalWrite', 'digitalRead', 'analogWrite', 'analogRead',
    'delay', 'delayMicroseconds', 'millis', 'micros', 'Serial', 'begin',
    'println', 'print', 'available', 'read', 'write', 'flush', 'end',
    'map', 'constrain', 'abs', 'min', 'max', 'random', 'randomSeed',
    'attachInterrupt', 'detachInterrupt', 'tone', 'noTone', 'pulseIn',
    'shiftIn', 'shiftOut', 'bit', 'bitRead', 'bitWrite', 'bitSet', 'bitClear',
    'lowByte', 'highByte', 'Serial2', 'Wire', 'SPI', 'EEPROM',
];

export default function WebEditor() {
    const { dark } = useContext(ThemeContext);
    const [code, setCode] = useState(DEFAULT_SKETCH);
    const [selectedBoard, setSelectedBoard] = useState('esp32:esp32:esp32');
    const [compiling, setCompiling] = useState(false);
    const [compileLogs, setCompileLogs] = useState([]);
    const [compiledFiles, setCompiledFiles] = useState(null);
    const [flashing, setFlashing] = useState(false);
    const [flashProgress, setFlashProgress] = useState(0);
    const [flashDone, setFlashDone] = useState(false);
    const [activePanel, setActivePanel] = useState('terminal'); // 'terminal' | 'serial' | 'libs'
    const [showTemplates, setShowTemplates] = useState(false);
    const [copied, setCopied] = useState(false);

    // Serial Monitor
    const [serialConnected, setSerialConnected] = useState(false);
    const [serialLog, setSerialLog] = useState([]);
    const [serialInput, setSerialInput] = useState('');
    const [baudRate, setBaudRate] = useState(115200);
    const portRef = useRef(null);
    const readerRef = useRef(null);
    const bufferRef = useRef('');

    const logRef = useRef(null);
    const serialLogRef = useRef(null);
    const editorRef = useRef(null);

    const supportsWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

    // Auto-scroll logs
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [compileLogs]);

    useEffect(() => {
        if (serialLogRef.current) serialLogRef.current.scrollTop = serialLogRef.current.scrollHeight;
    }, [serialLog]);

    const addLog = useCallback((text, isError = false) => {
        setCompileLogs(prev => [...prev, {
            text,
            isError,
            time: new Date().toLocaleTimeString()
        }]);
    }, []);

    const addSerialLog = useCallback((text, type = 'rx') => {
        setSerialLog(prev => [...prev.slice(-500), {
            type, text, time: new Date().toLocaleTimeString()
        }]);
    }, []);

    // ── Monaco Editor setup ──────────────────────────────────────────────────
    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;

        // Register a basic C++-like language enhancement for Arduino
        monaco.languages.registerCompletionItemProvider('cpp', {
            provideCompletionItems: () => {
                const suggestions = [
                    ...ARDUINO_FUNCTIONS.map(fn => ({
                        label: fn,
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: fn,
                        detail: 'Arduino Function',
                    })),
                    ...ARDUINO_KEYWORDS.map(kw => ({
                        label: kw,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: kw,
                        detail: 'Arduino Keyword',
                    })),
                    ...PREINSTALLED_LIBS.map(lib => ({
                        label: lib.include,
                        kind: monaco.languages.CompletionItemKind.Module,
                        insertText: lib.include,
                        detail: lib.desc,
                    })),
                ];
                return { suggestions };
            }
        });

        // Keyboard shortcut: Ctrl+Enter / Cmd+Enter = Compile
        editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            () => compileCode(editor.getValue())
        );
    };

    // ── Compile ──────────────────────────────────────────────────────────────
    const compileCode = async (codeToCompile) => {
        const src = codeToCompile || code;
        if (!src.trim()) return;

        setCompiling(true);
        setCompileLogs([]);
        setCompiledFiles(null);
        setFlashDone(false);
        setFlashProgress(0);
        setActivePanel('terminal');

        try {
            const response = await fetch(`${API}/api/compile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // No auth required for web editor!
                },
                body: JSON.stringify({ code: src, board: selectedBoard }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                addLog(err.error || 'Compilation request failed', true);
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
                        if (ev.type === 'log') addLog(ev.data, false);
                        else if (ev.type === 'binary') {
                            setCompiledFiles(ev.data.files);
                            addLog(`⚡ Binary ready — ${ev.data.files.length} files to flash`, false);
                        } else if (ev.type === 'error') addLog(ev.data, true);
                    } catch { /* ignore */ }
                }
            }
        } catch (err) {
            addLog(`❌ Compile failed: ${err.message}`, true);
        } finally {
            setCompiling(false);
        }
    };

    // ── Flash ────────────────────────────────────────────────────────────────
    const flashToDevice = async () => {
        if (!compiledFiles || !supportsWebSerial) return;
        setFlashing(true);
        setFlashProgress(0);
        setFlashDone(false);
        setActivePanel('terminal');

        let transport;
        try {
            const port = await navigator.serial.requestPort();
            transport = new Transport(port, true);

            const terminalLogger = {
                clean() { /* ignore */ },
                writeLine(data) { if (data?.trim()) addLog(data.trim()); },
                write() { /* ignore */ },
            };

            const loader = new ESPLoader({
                transport,
                baudrate: 921600,
                romBaudrate: 115200,
                terminal: terminalLogger,
                debugLogging: false,
            });

            addLog('🔌 Connecting to ESP32... (hold BOOT button if it fails)');
            await loader.main();
            addLog(`📜 Chip: ${loader.chip.CHIP_NAME}`);

            const fileArray = compiledFiles.map(f => ({
                address: f.address,
                data: atob(f.data),
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
                },
            });

            setFlashProgress(100);
            setFlashDone(true);
            addLog('✅ Flash complete! ESP32 restarting with your new code.');
            await loader.after();
            await transport.disconnect();
        } catch (err) {
            addLog('❌ Flash failed: ' + err.message, true);
        } finally {
            setFlashing(false);
            if (transport) {
                try {
                    await transport.disconnect();
                } catch { /* ignore */ }
            }
        }
    };

    // ── Serial Monitor ───────────────────────────────────────────────────────
    const startReading = async (port) => {
        const decoder = new TextDecoder();
        const reader = port.readable.getReader();
        readerRef.current = reader;
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                bufferRef.current += decoder.decode(value, { stream: true });
                const lines = bufferRef.current.split('\n');
                bufferRef.current = lines.pop();
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed) addSerialLog(trimmed, 'rx');
                });
            }
        } catch { /* ignore */ }
    };

    const connectSerial = async () => {
        if (!supportsWebSerial) return;
        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: Number(baudRate) });
            portRef.current = port;
            setSerialConnected(true);
            addSerialLog(`✓ Connected at ${baudRate} baud`, 'sys');
            startReading(port);
            setActivePanel('serial');
        } catch (e) {
            if (e.name !== 'NotFoundError') addSerialLog(`✗ ${e.message}`, 'error');
        }
    };

    const disconnectSerial = async () => {
        try {
            if (readerRef.current) { await readerRef.current.cancel(); readerRef.current = null; }
            if (portRef.current) { await portRef.current.close(); portRef.current = null; }
        } catch { /* ignore */ }
        setSerialConnected(false);
        addSerialLog('× Disconnected', 'sys');
    };

    const sendSerial = async () => {
        if (!serialInput.trim() || !portRef.current || !serialConnected) return;
        try {
            const writer = portRef.current.writable.getWriter();
            await writer.write(new TextEncoder().encode(serialInput + '\n'));
            writer.releaseLock();
            addSerialLog(serialInput, 'tx');
            setSerialInput('');
        } catch (e) {
            addSerialLog(`✗ Send failed: ${e.message}`, 'error');
        }
    };

    const downloadCode = () => {
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ioiot_sketch.ino';
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyCode = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const insertLib = (include) => {
        if (code.includes(include)) return;
        if (!editorRef.current) {
            setCode(prev => include + '\n' + prev);
            return;
        }
        const editor = editorRef.current;
        // Insert at line 1
        editor.executeEdits('', [{
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            text: include + '\n',
        }]);
    };

    return (
        <div className={`flex-1 flex flex-col overflow-hidden ${dark ? 'bg-[#0d0d14]' : 'bg-gray-100'} ioiot-editor-container`}>
            <style>{`
                .ioiot-editor-container ::-webkit-scrollbar { width: 8px; height: 8px; }
                .ioiot-editor-container ::-webkit-scrollbar-track { background: ${dark ? '#0d0d14' : '#f3f4f6'}; }
                .ioiot-editor-container ::-webkit-scrollbar-thumb { background: ${dark ? '#222' : '#ddd'}; border-radius: 4px; }
                .ioiot-editor-container ::-webkit-scrollbar-thumb:hover { background: ${dark ? '#333' : '#ccc'}; }
                .monaco-editor .scroll-decoration { box-shadow: none !important; }
            `}</style>
            {/* ── Top Bar ─────────────────────────────────────────────────────── */}
            <div className={`flex items-center gap-3 px-4 py-2.5 border-b flex-wrap ${dark ? 'bg-[#12121e] border-[#252535]' : 'bg-white border-gray-200'}`}>
                {/* Logo area */}
                <div className="flex items-center gap-2 mr-2">
                    <Code2 className="w-5 h-5 text-orange-500" />
                    <span className={`font-mono font-black text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Web Editor</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20">ESP32</span>
                </div>

                {/* Board Selector */}
                <select
                    value={selectedBoard}
                    onChange={e => { setSelectedBoard(e.target.value); setCompiledFiles(null); }}
                    className={`text-xs font-mono border rounded-lg px-3 py-1.5 outline-none transition-colors ${dark
                        ? 'bg-[#1a1a2a] border-[#333] text-white focus:border-orange-500'
                        : 'bg-gray-50 border-gray-300 text-gray-800 focus:border-orange-400'
                        }`}
                >
                    {BOARDS.map(b => <option key={b.fqbn} value={b.fqbn}>{b.label}</option>)}
                </select>

                {/* Templates */}
                <div className="relative">
                    <button
                        onClick={() => setShowTemplates(!showTemplates)}
                        className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${dark
                            ? 'border-[#333] text-gray-400 hover:text-white hover:border-[#555]'
                            : 'border-gray-300 text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        <BookOpen className="w-3.5 h-3.5" />
                        Templates
                        <ChevronDown className="w-3 h-3" />
                    </button>
                    <AnimatePresence>
                        {showTemplates && (
                            <motion.div
                                initial={{ opacity: 0, y: -5, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -5, scale: 0.97 }}
                                className={`absolute top-full mt-1 left-0 z-50 min-w-[180px] rounded-xl border shadow-2xl overflow-hidden ${dark ? 'bg-[#1a1a2a] border-[#333]' : 'bg-white border-gray-200'
                                    }`}
                            >
                                {TEMPLATES.map(t => (
                                    <button
                                        key={t.name}
                                        onClick={() => { setCode(t.code); setShowTemplates(false); setCompiledFiles(null); setCompileLogs([]); }}
                                        className={`w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-xs font-mono transition-colors ${dark
                                            ? 'hover:bg-orange-500/10 text-gray-300 hover:text-white'
                                            : 'hover:bg-orange-50 text-gray-700'
                                            }`}
                                    >
                                        <span>{t.icon}</span>
                                        <span>{t.name}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="flex-1" />

                {/* Right Actions */}
                <div className="flex items-center gap-2">
                    <button onClick={copyCode}
                        className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${dark ? 'border-[#333] text-gray-400 hover:text-white' : 'border-gray-300 text-gray-600 hover:text-gray-900'}`}>
                        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button onClick={downloadCode}
                        className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${dark ? 'border-[#333] text-gray-400 hover:text-white' : 'border-gray-300 text-gray-600 hover:text-gray-900'}`}>
                        <Download className="w-3.5 h-3.5" />
                        .ino
                    </button>

                    {/* Compile */}
                    <button
                        onClick={() => compileCode(code)}
                        disabled={compiling || flashing}
                        className="flex items-center gap-1.5 text-xs font-mono font-bold px-4 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                    >
                        {compiling
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Compiling...</>
                            : <><Zap className="w-3.5 h-3.5" /> Compile</>}
                    </button>

                    {/* Flash */}
                    <button
                        onClick={flashToDevice}
                        disabled={!compiledFiles || flashing || compiling || !supportsWebSerial}
                        className={`flex items-center gap-1.5 text-xs font-mono font-bold px-4 py-1.5 rounded-lg transition-all disabled:opacity-40 ${flashDone
                            ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                            : 'bg-orange-500 text-black hover:bg-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                            }`}
                    >
                        {flashing
                            ? <><div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> {flashProgress}%</>
                            : flashDone
                                ? <><Check className="w-3.5 h-3.5" /> Done!</>
                                : <><Upload className="w-3.5 h-3.5" /> Upload</>}
                    </button>
                </div>
            </div>

            {/* ── Main Layout ──────────────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Editor */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Editor title bar */}
                    <div className={`flex items-center gap-3 px-4 py-1.5 border-b text-xs font-mono ${dark ? 'bg-[#16162a] border-[#222] text-[#666]' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        <span className="text-orange-500">●</span>
                        <span>ioiot_sketch.ino</span>
                        <span className={`ml-auto text-[10px] ${dark ? 'text-[#444]' : 'text-gray-400'}`}>
                            Press Ctrl+Enter to Compile
                        </span>
                    </div>

                    <div className="flex-1">
                        <Editor
                            height="100%"
                            language="cpp"
                            value={code}
                            onChange={val => { setCode(val || ''); setCompiledFiles(null); }}
                            theme={dark ? 'vs-dark' : 'vs'}
                            onMount={handleEditorMount}
                            options={{
                                fontSize: 14,
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                                fontLigatures: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                wordWrap: 'on',
                                lineNumbers: 'on',
                                renderLineHighlight: 'all',
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                cursorSmoothCaretAnimation: 'on',
                                bracketPairColorization: { enabled: true },
                                autoClosingBrackets: 'always',
                                autoClosingQuotes: 'always',
                                formatOnType: false,
                                tabSize: 2,
                                padding: { top: 12, bottom: 12 },
                            }}
                        />
                    </div>
                </div>

                {/* Right: Panel */}
                <div className={`w-80 xl:w-96 flex flex-col border-l ${dark ? 'bg-[#0d0d14] border-[#1e1e2e]' : 'bg-white border-gray-200'}`}>
                    {/* Panel Tab Switcher */}
                    <div className={`flex border-b ${dark ? 'border-[#1e1e2e]' : 'border-gray-200'}`}>
                        {[
                            { key: 'terminal', label: 'Console', icon: <Terminal className="w-3.5 h-3.5" /> },
                            { key: 'serial', label: 'Serial', icon: <Usb className="w-3.5 h-3.5" /> },
                            { key: 'libs', label: 'Libraries', icon: <BookOpen className="w-3.5 h-3.5" /> },
                        ].map(p => (
                            <button
                                key={p.key}
                                onClick={() => setActivePanel(p.key)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono font-bold transition-all border-b-2 ${activePanel === p.key
                                    ? (p.key === 'serial' ? 'border-green-500 text-green-400' : p.key === 'libs' ? 'border-blue-500 text-blue-400' : 'border-purple-500 text-purple-400')
                                    : dark ? 'border-transparent text-[#555] hover:text-gray-300' : 'border-transparent text-gray-400 hover:text-gray-700'
                                    }`}
                            >
                                {p.icon}
                                {p.label}
                                {p.key === 'terminal' && compileLogs.length > 0 && (
                                    <span className={`text-[9px] px-1 rounded-full font-bold ${compileLogs.some(l => l.isError) ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                        {compileLogs.length}
                                    </span>
                                )}
                                {p.key === 'serial' && (
                                    <span className={`w-1.5 h-1.5 rounded-full ${serialConnected ? 'bg-green-400 animate-pulse' : dark ? 'bg-[#444]' : 'bg-gray-300'}`} />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ── Compile Console Panel ───────────────────────────── */}
                    {activePanel === 'terminal' && (
                        <div className="flex flex-col flex-1 overflow-hidden">
                            {/* Flash progress bar */}
                            {flashing && (
                                <div className={`p-3 border-b ${dark ? 'border-[#1e1e2e]' : 'border-gray-200'}`}>
                                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${dark ? 'bg-[#222]' : 'bg-gray-200'}`}>
                                        <motion.div
                                            className="h-full bg-orange-500 rounded-full"
                                            animate={{ width: `${flashProgress}%` }}
                                            transition={{ ease: 'linear' }}
                                        />
                                    </div>
                                    <p className={`font-mono text-xs mt-1.5 text-center ${dark ? 'text-[#666]' : 'text-gray-400'}`}>
                                        Flashing... {flashProgress}%
                                    </p>
                                </div>
                            )}

                            {/* Log area */}
                            <div
                                ref={logRef}
                                className={`flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5 ${dark ? 'bg-[#0a0a0f]' : 'bg-gray-900'}`}
                            >
                                {compileLogs.length === 0 && !compiling ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                        <Zap className="w-8 h-8 text-[#333] mb-2" />
                                        <p className="text-[#444] text-xs">Click Compile to build your sketch</p>
                                        <p className="text-[#333] text-[10px] mt-1">Then Upload to flash your ESP32</p>
                                    </div>
                                ) : (
                                    compileLogs.map((entry, i) => (
                                        <div key={i} className="flex gap-2">
                                            <span className="text-[#444] shrink-0">{entry.time}</span>
                                            <span className={entry.isError ? 'text-red-400' : 'text-green-400'}>
                                                {entry.text}
                                            </span>
                                        </div>
                                    ))
                                )}
                                {compiling && (
                                    <div className="text-orange-400 animate-pulse">▌</div>
                                )}
                            </div>

                            {/* Console footer actions */}
                            <div className={`flex items-center gap-2 px-3 py-2 border-t ${dark ? 'border-[#1e1e2e]' : 'border-gray-200'}`}>
                                <button
                                    onClick={() => setCompileLogs([])}
                                    className={`text-xs font-mono flex items-center gap-1 transition-colors ${dark ? 'text-[#444] hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                                >
                                    <Trash2 className="w-3 h-3" /> Clear
                                </button>
                                {!supportsWebSerial && (
                                    <div className="flex items-center gap-1 ml-auto">
                                        <AlertTriangle className="w-3 h-3 text-yellow-500" />
                                        <span className="text-yellow-500 text-[10px] font-mono">Chrome/Edge required for Upload</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Serial Monitor Panel ────────────────────────────── */}
                    {activePanel === 'serial' && (
                        <div className="flex flex-col flex-1 overflow-hidden">
                            {/* Serial controls header */}
                            <div className={`flex items-center gap-2 px-3 py-2.5 border-b flex-wrap ${dark ? 'border-[#1e1e2e] bg-[#0d0d14]' : 'border-gray-200 bg-gray-50'}`}>
                                <select
                                    value={baudRate}
                                    onChange={e => setBaudRate(Number(e.target.value))}
                                    disabled={serialConnected}
                                    className={`text-xs font-mono border rounded-lg px-2 py-1 outline-none ${dark ? 'bg-[#1a1a2a] border-[#333] text-white' : 'bg-white border-gray-300 text-gray-800'} disabled:opacity-50`}
                                >
                                    {[9600, 19200, 38400, 57600, 115200, 230400].map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                                <div className="flex-1" />
                                {serialConnected ? (
                                    <button
                                        onClick={disconnectSerial}
                                        className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                                    >
                                        Disconnect
                                    </button>
                                ) : (
                                    <button
                                        onClick={connectSerial}
                                        disabled={!supportsWebSerial}
                                        className="flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500 hover:text-black transition-all disabled:opacity-40"
                                    >
                                        <Usb className="w-3 h-3" /> Connect
                                    </button>
                                )}
                                <button
                                    onClick={() => setSerialLog([])}
                                    className={`p-1 rounded transition-colors ${dark ? 'text-[#444] hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Log area */}
                            <div
                                ref={serialLogRef}
                                className={`flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5 ${dark ? 'bg-[#0a0a0f]' : 'bg-gray-900'}`}
                            >
                                {serialLog.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                        <Usb className="w-8 h-8 text-[#333] mb-2" />
                                        <p className="text-[#444] text-xs">Connect your ESP32 via USB</p>
                                        {!supportsWebSerial && (
                                            <div className="flex items-center gap-1 mt-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                                <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
                                                <p className="text-yellow-400 text-[10px]">Requires Chrome or Edge</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    serialLog.map((entry, i) => (
                                        <div key={i} className="flex gap-2">
                                            <span className="text-[#444] shrink-0">{entry.time}</span>
                                            <span className={
                                                entry.type === 'sys' ? 'text-yellow-500'
                                                    : entry.type === 'tx' ? 'text-orange-400'
                                                        : entry.type === 'error' ? 'text-red-400'
                                                            : 'text-green-400'
                                            }>
                                                {entry.type === 'tx' ? '↑ ' : entry.type === 'sys' ? '◉ ' : '↓ '}
                                                {entry.text}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Send input */}
                            <div className={`flex gap-2 p-2 border-t ${dark ? 'border-[#1e1e2e] bg-[#0d0d14]' : 'border-gray-200 bg-gray-50'}`}>
                                <input
                                    value={serialInput}
                                    onChange={e => setSerialInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendSerial()}
                                    placeholder={serialConnected ? 'Send command...' : 'Connect first...'}
                                    disabled={!serialConnected}
                                    className={`flex-1 text-xs font-mono border outline-none rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 ${dark
                                        ? 'bg-black border-[#333] text-white focus:border-green-500 placeholder-[#444]'
                                        : 'bg-white border-gray-300 text-gray-900 focus:border-green-400'
                                        }`}
                                />
                                <button
                                    onClick={sendSerial}
                                    disabled={!serialConnected || !serialInput.trim()}
                                    className="p-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500 hover:text-white transition-all disabled:opacity-40"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Libraries Panel ─────────────────────────────────── */}
                    {activePanel === 'libs' && (
                        <div className={`flex-1 overflow-y-auto p-3 space-y-1`}>
                            <p className={`text-[10px] font-mono uppercase tracking-widest mb-3 ${dark ? 'text-[#444]' : 'text-gray-400'}`}>
                                Pre-installed Libraries — click to insert
                            </p>
                            {PREINSTALLED_LIBS.map(lib => (
                                <button
                                    key={lib.name}
                                    onClick={() => insertLib(lib.include)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all group ${dark
                                        ? 'bg-[#0d0d14] border-[#1a1a2a] hover:border-blue-500/40 hover:bg-blue-500/5'
                                        : 'bg-gray-50 border-gray-200 hover:border-blue-400 hover:bg-blue-50/50'
                                        }`}
                                >
                                    <p className={`font-mono text-xs font-bold group-hover:text-blue-400 transition-colors ${dark ? 'text-white' : 'text-gray-900'}`}>
                                        {lib.name}
                                    </p>
                                    <p className={`font-mono text-[10px] mt-0.5 ${dark ? 'text-[#555]' : 'text-gray-500'}`}>
                                        {lib.desc}
                                    </p>
                                    <code className={`text-[9px] font-mono mt-1 block ${dark ? 'text-[#444]' : 'text-gray-400'}`}>
                                        {lib.include}
                                    </code>
                                </button>
                            ))}

                            <div className={`mt-4 p-3 rounded-xl border ${dark ? 'bg-orange-500/5 border-orange-500/20' : 'bg-orange-50 border-orange-200'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <Info className="w-3.5 h-3.5 text-orange-500" />
                                    <p className="font-mono text-xs font-bold text-orange-500">About Libraries</p>
                                </div>
                                <p className={`font-mono text-[10px] leading-relaxed ${dark ? 'text-[#666]' : 'text-gray-500'}`}>
                                    All libraries above are pre-installed on the compile server. Click any library to add its #include to your code. Cloud compilation uses arduino-cli with the ESP32 core.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Bottom Status Bar ───────────────────────────────────────────── */}
            <div className={`flex items-center gap-4 px-4 py-1.5 border-t text-xs font-mono ${dark ? 'bg-[#0d0d14] border-[#1e1e2e] text-[#444]' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                <div className="flex items-center gap-1.5">
                    <Cpu className="w-3 h-3" />
                    <span>{BOARDS.find(b => b.fqbn === selectedBoard)?.label?.replace(/^[^ ]+ /, '') || 'ESP32'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${serialConnected ? 'bg-green-400 animate-pulse' : dark ? 'bg-[#333]' : 'bg-gray-300'}`} />
                    <span>Serial: {serialConnected ? `Connected (${baudRate})` : 'Disconnected'}</span>
                </div>
                {compiledFiles && (
                    <div className="flex items-center gap-1.5 text-green-400">
                        <Check className="w-3 h-3" />
                        <span>Binary ready</span>
                    </div>
                )}
                <div className="ml-auto text-[10px] opacity-50">
                    IoIoT Web Editor · No Login Required
                </div>
            </div>

            {/* Click-outside to close templates */}
            {showTemplates && (
                <div className="fixed inset-0 z-40" onClick={() => setShowTemplates(false)} />
            )}
        </div>
    );
}
