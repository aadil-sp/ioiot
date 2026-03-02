import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Wifi, WifiOff, Settings, Plus, Trash2, Save,
    Zap, Copy, Check, Code2, Sliders, RefreshCw, Eye, EyeOff, Bluetooth
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const socket = io(API);

const PIN_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#ef4444', '#eab308', '#a855f7', '#06b6d4', '#ec4899'];
const WIDGET_TYPES = ['toggle', 'slider', 'button', 'value_display'];
const PIN_MODES = ['OUTPUT', 'INPUT', 'INPUT_PULLUP'];
const PIN_TYPES = ['digital', 'pwm', 'analog_input'];
const COMMON_GPIOS = [2, 4, 5, 12, 13, 14, 15, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];

export default function DeviceDetail() {
    const { id } = useParams();
    const [device, setDevice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('control'); // 'control' | 'config' | 'code'
    const [editingPins, setEditingPins] = useState([]);
    const [savingPins, setSavingPins] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showWifi, setShowWifi] = useState(false);
    const [wifiSSID, setWifiSSID] = useState('');
    const [wifiPassword, setWifiPassword] = useState('');
    const [showWifiPass, setShowWifiPass] = useState(false);
    const [savingWifi, setSavingWifi] = useState(false);
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

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
        const keepAlive = setInterval(() => axios.get(`${API}/api/ping`).catch(() => { }), 300000);

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
            clearInterval(keepAlive);
            socket.off('deviceStateUpdate');
            socket.off('deviceStatusUpdate');
            socket.off('deviceConfigUpdate');
        };
    }, [id]);

    // ─── Control ─────────────────────────────────────────────────────────────
    const sendControl = async (widgetKey, value) => {
        setDevice(prev => {
            if (!prev) return prev;
            return { ...prev, pins: prev.pins.map(p => p.widgetKey === widgetKey ? { ...p, value } : p) };
        });
        try {
            await axios.post(`${API}/api/devices/${id}/control`, { widgetKey, value }, { headers });
        } catch (err) {
            console.error(err);
            fetchDevice();
        }
    };

    // ─── WiFi Credentials ────────────────────────────────────────────────────
    const saveWifi = async () => {
        setSavingWifi(true);
        try {
            await axios.put(`${API}/api/devices/${id}`, { wifiSSID, wifiPassword }, { headers });
            setDevice(prev => prev ? { ...prev, wifiSSID, wifiPassword } : prev);
            setShowWifi(false);
        } catch (err) { alert('Failed to save WiFi credentials'); }
        finally { setSavingWifi(false); }
    };

    // ─── Pin Config ──────────────────────────────────────────────────────────
    const addPin = () => {
        const usedPins = editingPins.map(p => p.pinNumber);
        const nextPin = COMMON_GPIOS.find(n => !usedPins.includes(n)) || 99;
        const label = `Pin ${nextPin}`;
        // Auto-assign an alphabetical command char
        const usedChars = editingPins.map(p => p.commandChar?.toUpperCase()).filter(Boolean);
        const nextChar = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c => !usedChars.includes(c)) || 'X';
        setEditingPins(prev => [...prev, {
            pinNumber: nextPin,
            label,
            mode: 'OUTPUT',
            type: 'digital',
            widgetType: 'toggle',
            widgetKey: `pin_${nextPin}_${Date.now()}`,
            commandChar: nextChar,
            value: false,
            min: 0,
            max: 255,
            color: PIN_COLORS[editingPins.length % PIN_COLORS.length]
        }]);
    };

    const updatePin = (idx, field, val) => {
        setEditingPins(prev => prev.map((p, i) => {
            if (i !== idx) return p;
            const updated = { ...p, [field]: val };
            if (field === 'pinNumber') updated.label = updated.label === `Pin ${p.pinNumber}` ? `Pin ${val}` : updated.label;
            if (field === 'type') {
                if (val === 'digital') { updated.widgetType = 'toggle'; updated.value = false; }
                if (val === 'pwm') { updated.widgetType = 'slider'; updated.value = 0; }
                if (val === 'analog_input') { updated.widgetType = 'value_display'; updated.mode = 'INPUT'; }
            }
            if (field === 'mode' && val !== 'OUTPUT') updated.widgetType = 'value_display';
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
            setTab('control');
        } catch (err) {
            console.error(err);
            alert(`Failed to save pins: ${err.response?.data?.detail || err.message}`);
        }
        finally { setSavingPins(false); }
    };

    // ─── Code Generator ──────────────────────────────────────────────────────
    const generateCode = () => {
        if (!device) return '';
        const ssid = device.wifiSSID || 'YOUR_WIFI_SSID';
        const pass = device.wifiPassword || 'YOUR_WIFI_PASSWORD';
        const isSerial = device.mode === 'serial';

        if (isSerial) {
            // ─── SERIAL / BLUETOOTH BARE-METAL MODE ────────────────────────
            const pinDefs = device.pins.map(p =>
                `#define PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_').padEnd(15)} ${p.pinNumber}`
            ).join('\n');
            const setupPins = device.pins.map(p =>
                `  pinMode(PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}, ${p.mode});`
            ).join('\n');
            const commandCases = device.pins
                .filter(p => p.commandChar && p.mode === 'OUTPUT')
                .map(p => {
                    const macro = `PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
                    if (p.type === 'digital') {
                        return `    case '${p.commandChar.toUpperCase()}':
      // ${p.label} — toggle
      ${macro}_state = !${macro}_state;
      digitalWrite(${macro}, ${macro}_state ? HIGH : LOW);
      Serial.print("${p.label}: "); Serial.println(${macro}_state ? "ON" : "OFF");
      break;`;
                    }
                    return `    case '${p.commandChar.toUpperCase()}':
      // ${p.label} — TODO: Set custom PWM value here
      // analogWrite(${macro}, value);
      Serial.println("${p.label} command received");
      break;`;
                }).join('\n');

            const stateVars = device.pins
                .filter(p => p.type === 'digital' && p.mode === 'OUTPUT' && p.commandChar)
                .map(p => `bool PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_state = false;`)
                .join('\n');

            const charCommands = device.pins
                .filter(p => p.commandChar && p.mode === 'OUTPUT')
                .map(p => `//   '${p.commandChar.toUpperCase()}' → ${p.label}`)
                .join('\n');

            return `// ============================================================
// ${device.name} — IoIoT Serial/Bluetooth Bare-Metal Mode
// ============================================================
// This code listens for single characters over Serial/Bluetooth.
// You can use any Bluetooth Serial Terminal app on your phone.
//
// Command Map (auto-generated from your pin config):
${charCommands}
//
// CUSTOMISE the switch-case below to add your own logic!
// ============================================================

#include "BluetoothSerial.h"

// ── Pin Definitions ──────────────────────────────────────
${pinDefs}

// ── State Variables ───────────────────────────────────────
${stateVars || '// (no digital output pins defined yet)'}

BluetoothSerial SerialBT;

void setup() {
  Serial.begin(115200);
  delay(500);

  // Pin Setup
${setupPins}

  SerialBT.begin("${device.name.replace(/\s+/g, '_')}"); // Bluetooth device name
  Serial.println("Bluetooth started: ${device.name}");
  Serial.println("Waiting for commands...");
}

void loop() {
  char received = 0;

  // Check USB Serial (for testing)
  if (Serial.available()) received = Serial.read();
  // Check Bluetooth
  if (SerialBT.available()) received = SerialBT.read();

  if (received != 0) {
    received = toupper(received); // Accept both upper and lower case
    Serial.print("CMD: "); Serial.println(received);

    switch (received) {
${commandCases || '      // Add pins in Pin Config tab to generate cases here'}

      default:
        Serial.print("Unknown command: ");
        Serial.println(received);
        break;
    }
  }

  delay(10); // Small loop delay
}`;
        }

        // ─── WIFI / CLOUD MODE ──────────────────────────────────────────────
        const pinDefs = device.pins.map(p =>
            `#define PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_').padEnd(15)} ${p.pinNumber}`
        ).join('\n');
        const setupPins = device.pins.map(p =>
            `  pinMode(PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}, ${p.mode});`
        ).join('\n');
        const stateLogic = device.pins.filter(p => p.mode === 'OUTPUT').map(p => {
            const macro = `PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
            const key = p.widgetKey;
            if (p.type === 'digital') return `      { bool v = doc["${key}"] | false; if(v != last_${key}) { digitalWrite(${macro}, v?HIGH:LOW); Serial.println("${p.label}: " + String(v?"ON":"OFF")); last_${key}=v; } }`;
            if (p.type === 'pwm') return `      { int v = doc["${key}"] | 0; analogWrite(${macro}, v); }`;
            return '';
        }).filter(Boolean).join('\n');

        const lastVars = device.pins.filter(p => p.type === 'digital' && p.mode === 'OUTPUT').map(p =>
            `bool last_${p.widgetKey} = false;`
        ).join('\n');

        return `// ============================================================
// ${device.name} — IoIoT WiFi Cloud Mode
// ============================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "esp_wifi.h"

// ── Credentials ───────────────────────────────────────────
const char* ssid      = "${ssid}";
const char* password  = "${pass}";
const char* AUTH_TOKEN = "${device.authToken}";
const char* SERVER_URL = "${API || 'https://ioiot.vercel.app'}/api/esp/state";

// ── Pin Definitions ──────────────────────────────────────
${pinDefs}

// ── Last-state (for change logging) ──────────────────────
${lastVars || '// (no digital output pins)'}

void setup() {
  Serial.begin(115200);
  delay(2000); // Power stabilisation

  // Pin Setup
${setupPins}

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  esp_wifi_set_max_tx_power(34); // Reduce TX power to prevent brown-out
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\\nConnected! IP: " + WiFi.localIP().toString());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("x-auth-token", AUTH_TOKEN);
    http.setTimeout(15000);
    int code = http.GET();

    if (code > 0) {
      StaticJsonDocument<512> doc;
      deserializeJson(doc, http.getString());

      // ── Apply Pin States ──────────────────────────────
${stateLogic || '      // Configure pins in Pin Config tab'}

    } else {
      Serial.println("HTTP Error: " + String(code));
    }
    http.end();
  } else {
    Serial.println("WiFi lost. Reconnecting...");
    WiFi.reconnect();
  }
  delay(500); // Poll every 500ms
}`;
    };

    const copyCode = () => {
        navigator.clipboard.writeText(generateCode());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-96">
            <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
        </div>
    );

    if (!device) return (
        <div className="flex flex-col items-center justify-center h-96">
            <p className="text-red-500 font-mono uppercase tracking-widest">Device Not Found</p>
            <a href="/dashboard" className="mt-4 text-orange-500 font-mono text-sm hover:underline">← Back</a>
        </div>
    );

    const isSerial = device.mode === 'serial';

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto">
            {/* Back + Header */}
            <div className="mb-6">
                <a href="/dashboard" className="flex items-center gap-2 text-[#555] hover:text-orange-500 font-mono text-sm mb-4">
                    <ArrowLeft className="w-4 h-4" /> Back to Devices
                </a>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${device.isConnected ? 'border-green-500/30 bg-green-500/10' : 'border-[#222] bg-[#111]'}`}>
                            {isSerial
                                ? <Bluetooth className="w-7 h-7 text-blue-400" />
                                : device.isConnected ? <Wifi className="w-7 h-7 text-green-500" /> : <WifiOff className="w-7 h-7 text-[#333]" />}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black font-mono uppercase tracking-widest text-white">{device.name}</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className={`flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest ${device.isConnected ? 'text-green-500' : 'text-[#444]'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${device.isConnected ? 'bg-green-500 animate-pulse' : 'bg-[#333]'}`}></span>
                                    {device.isConnected ? 'Online' : 'Offline'}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded font-mono border ${isSerial ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' : 'text-orange-500 border-orange-500/20 bg-orange-500/10'}`}>
                                    {isSerial ? 'Bluetooth/Serial' : 'WiFi / Cloud'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={fetchDevice} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111] border border-[#222] text-gray-400 hover:text-white text-sm transition-all">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Auth Token Banner (WiFi mode only) */}
            {!isSerial && (
                <div className="mb-4 p-4 bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-[#555] font-mono text-xs uppercase tracking-widest shrink-0">Auth Token:</span>
                        <code className="flex-1 text-orange-400 font-mono text-xs bg-black/40 px-3 py-1.5 rounded-lg overflow-x-auto min-w-0">{device.authToken}</code>
                        <button onClick={() => navigator.clipboard.writeText(device.authToken)}
                            className="p-2 rounded-lg text-[#555] hover:text-orange-500 transition-all shrink-0">
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={() => setShowWifi(!showWifi)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all shrink-0 ${showWifi ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'border-[#222] text-[#555] hover:text-white'}`}>
                        <Wifi className="w-3.5 h-3.5" /> WiFi Credentials
                    </button>
                </div>
            )}

            {/* WiFi Credentials Panel */}
            <AnimatePresence>
                {showWifi && !isSerial && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mb-4 p-5 bg-[#0A0A0A] border border-orange-500/20 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 items-end overflow-hidden">
                        <div>
                            <label className="block text-[10px] text-[#555] font-mono uppercase tracking-widest mb-1.5">WiFi SSID</label>
                            <input value={wifiSSID} onChange={e => setWifiSSID(e.target.value)}
                                placeholder="Your WiFi name"
                                className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-lg px-3 py-2 text-white font-mono text-sm" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-[#555] font-mono uppercase tracking-widest mb-1.5">WiFi Password</label>
                            <div className="relative">
                                <input value={wifiPassword} onChange={e => setWifiPassword(e.target.value)}
                                    type={showWifiPass ? 'text' : 'password'} placeholder="••••••••"
                                    className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-lg px-3 py-2 pr-9 text-white font-mono text-sm" />
                                <button onClick={() => setShowWifiPass(!showWifiPass)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-orange-500">
                                    {showWifiPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <button onClick={saveWifi} disabled={savingWifi}
                            className="flex items-center justify-center gap-2 py-2 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all disabled:opacity-50">
                            <Save className="w-4 h-4" /> {savingWifi ? 'Saving...' : 'Save Credentials'}
                        </button>
                        <p className="col-span-full text-[#444] text-xs font-mono">Credentials are stored securely and auto-filled into the generated ESP32 code.</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl mb-6">
                {[
                    { key: 'control', icon: <Sliders className="w-4 h-4" />, label: 'Control' },
                    { key: 'config', icon: <Settings className="w-4 h-4" />, label: 'Pin Config' },
                    { key: 'code', icon: <Code2 className="w-4 h-4" />, label: 'ESP32 Code' },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-mono font-bold text-sm transition-all ${tab === t.key ? 'bg-orange-500 text-black' : 'text-[#555] hover:text-white'}`}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                {/* ── CONTROL TAB ─────────────────────────────────────────── */}
                {tab === 'control' && (
                    <motion.div key="control" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        {isSerial && (
                            <div className="mb-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                                <p className="text-blue-400 font-mono text-xs">
                                    <span className="font-bold">Bluetooth/Serial mode:</span> Controls below send single characters to your ESP32's Serial/Bluetooth input. Wire up your code to <code className="bg-black/40 px-1 rounded">received</code> variable.
                                </p>
                            </div>
                        )}
                        {device.pins.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-52 border-2 border-dashed border-[#1a1a1a] rounded-2xl text-center">
                                <Zap className="w-10 h-10 text-[#222] mb-3" />
                                <p className="text-[#444] font-mono text-sm">No pins configured yet</p>
                                <button onClick={() => setTab('config')} className="mt-3 text-orange-500 font-mono text-xs hover:underline">→ Go to Pin Config</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {device.pins.map(pin => (
                                    <ControlWidget key={pin.widgetKey} pin={pin} isSerial={isSerial} onControl={sendControl} />
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
                                <h3 className="text-white font-mono font-bold uppercase tracking-widest">Pin Configuration</h3>
                                <p className="text-[#444] font-mono text-xs mt-0.5">Each pin gets a command character used in Serial/WiFi mode</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={addPin}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500 text-sm font-bold hover:bg-orange-500 hover:text-black transition-all">
                                    <Plus className="w-4 h-4" /> Add Pin
                                </button>
                                <button onClick={savePins} disabled={savingPins}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-black text-sm font-bold hover:bg-orange-400 transition-all disabled:opacity-50">
                                    <Save className="w-4 h-4" /> {savingPins ? 'Saving...' : 'Save & Apply'}
                                </button>
                            </div>
                        </div>

                        {editingPins.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-36 border-2 border-dashed border-[#1a1a1a] rounded-2xl">
                                <p className="text-[#444] font-mono text-sm">No pins yet. Click "Add Pin".</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {editingPins.map((pin, idx) => (
                                    <PinConfigRow key={idx} pin={pin} idx={idx} onUpdate={updatePin} onRemove={removePin} isSerial={isSerial} />
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
                                <h3 className="text-white font-mono font-bold uppercase tracking-widest">Generated ESP32 Code</h3>
                                <p className="text-[#444] font-mono text-xs mt-0.5">
                                    Mode: <span className={isSerial ? 'text-blue-400' : 'text-orange-500'}>{isSerial ? 'Bluetooth/Serial Bare-Metal' : 'WiFi / Cloud Polling'}</span>
                                </p>
                            </div>
                            <button onClick={copyCode}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${copied ? 'bg-green-500 text-black' : 'bg-orange-500/10 border border-orange-500/30 text-orange-500 hover:bg-orange-500 hover:text-black'}`}>
                                {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Code</>}
                            </button>
                        </div>
                        <div className="bg-black border border-[#1a1a1a] rounded-2xl p-6 overflow-auto max-h-[600px]">
                            <pre className="text-xs font-mono text-green-400 leading-relaxed whitespace-pre">{generateCode()}</pre>
                        </div>
                        {isSerial ? (
                            <p className="mt-4 text-[#444] font-mono text-xs leading-relaxed">
                                📱 Upload → Open Bluetooth Terminal on your phone → Connect to <strong className="text-white">{device.name.replace(/\s+/g, '_')}</strong> → Send command characters to control pins.
                            </p>
                        ) : (
                            <p className="mt-4 text-[#444] font-mono text-xs leading-relaxed">
                                📡 Fill in WiFi credentials in the banner above (they auto-fill here) → Upload to ESP32 → Pins will respond to your IoIoT dashboard controls.
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Control Widget ───────────────────────────────────────────────────────────
function ControlWidget({ pin, isSerial, onControl }) {
    const isOn = pin.value === true || pin.value > 0;

    const charBadge = isSerial && pin.commandChar ? (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 ml-1">
            '{pin.commandChar.toUpperCase()}'
        </span>
    ) : null;

    return (
        <div className={`bg-[#0A0A0A] border rounded-2xl p-5 transition-all`}
            style={{ borderColor: isOn ? pin.color + '44' : '#1a1a1a', boxShadow: isOn ? `0 0 20px ${pin.color}15` : 'none' }}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-1">
                        <h4 className="text-white font-mono font-bold text-sm">{pin.label}</h4>
                        {charBadge}
                    </div>
                    <p className="text-[#555] text-xs font-mono mt-0.5">GPIO {pin.pinNumber} · {pin.type}</p>
                </div>
            </div>

            {pin.widgetType === 'toggle' && (
                <button onClick={() => onControl(pin.widgetKey, !pin.value)}
                    className={`w-full py-3 rounded-xl font-mono font-bold text-sm transition-all active:scale-95 ${pin.value ? 'text-black' : 'border border-[#222] text-[#555] hover:text-white'}`}
                    style={pin.value ? { backgroundColor: pin.color } : {}}>
                    {pin.value ? '● ON' : '○ OFF'}
                </button>
            )}
            {pin.widgetType === 'slider' && (
                <div className="space-y-3">
                    <div className="flex justify-between text-xs font-mono text-[#555]">
                        <span>{pin.min}</span>
                        <span className="font-bold text-base" style={{ color: pin.color }}>{pin.value}</span>
                        <span>{pin.max}</span>
                    </div>
                    <input type="range" min={pin.min} max={pin.max} value={pin.value}
                        onChange={e => onControl(pin.widgetKey, Number(e.target.value))}
                        className="w-full cursor-pointer" style={{ accentColor: pin.color }} />
                </div>
            )}
            {pin.widgetType === 'button' && (
                <button
                    onMouseDown={() => onControl(pin.widgetKey, true)}
                    onMouseUp={() => onControl(pin.widgetKey, false)}
                    onTouchStart={() => onControl(pin.widgetKey, true)}
                    onTouchEnd={() => onControl(pin.widgetKey, false)}
                    className="w-full py-3 rounded-xl font-mono font-bold text-sm border border-[#222] text-[#555] hover:text-white active:scale-95 transition-all"
                    style={{ backgroundColor: pin.value ? pin.color + '33' : '' }}>
                    ⚡ HOLD TO ACTIVATE
                </button>
            )}
            {pin.widgetType === 'value_display' && (
                <div className="flex items-center justify-center py-4 rounded-xl bg-black/40 border border-[#111]">
                    <span className="text-4xl font-mono font-black" style={{ color: pin.color }}>{pin.value ?? '—'}</span>
                </div>
            )}
        </div>
    );
}

// ─── Pin Config Row ───────────────────────────────────────────────────────────
function PinConfigRow({ pin, idx, onUpdate, onRemove, isSerial }) {
    return (
        <div className="bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl p-4 grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
            {/* Label */}
            <div className="col-span-2 md:col-span-2 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pin.color }}></div>
                <div className="flex-1">
                    <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Label</label>
                    <input value={pin.label} onChange={e => onUpdate(idx, 'label', e.target.value)}
                        className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs" />
                </div>
            </div>
            {/* GPIO */}
            <div>
                <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">GPIO</label>
                <select value={pin.pinNumber} onChange={e => onUpdate(idx, 'pinNumber', Number(e.target.value))}
                    className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs">
                    {COMMON_GPIOS.map(n => <option key={n} value={n}>GPIO {n}</option>)}
                </select>
            </div>
            {/* Mode */}
            <div>
                <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Mode</label>
                <select value={pin.mode} onChange={e => onUpdate(idx, 'mode', e.target.value)}
                    className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs">
                    {PIN_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>
            {/* Type */}
            <div>
                <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Type</label>
                <select value={pin.type} onChange={e => onUpdate(idx, 'type', e.target.value)}
                    className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs">
                    {PIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>
            {/* Widget */}
            <div>
                <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">{isSerial ? 'Cmd Char' : 'Widget'}</label>
                {isSerial ? (
                    <input value={pin.commandChar || ''} onChange={e => onUpdate(idx, 'commandChar', e.target.value.slice(-1).toUpperCase())}
                        placeholder="A" maxLength={1}
                        className="w-full bg-black border border-[#222] focus:border-blue-500 outline-none rounded-lg px-2 py-1.5 text-blue-400 font-mono text-sm text-center uppercase" />
                ) : (
                    <select value={pin.widgetType} onChange={e => onUpdate(idx, 'widgetType', e.target.value)}
                        className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs">
                        {WIDGET_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                )}
            </div>
            {/* Color + Delete */}
            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Color</label>
                    <input type="color" value={pin.color} onChange={e => onUpdate(idx, 'color', e.target.value)}
                        className="w-full h-8 rounded-lg cursor-pointer bg-black border border-[#222] p-0.5" />
                </div>
                <button onClick={() => onRemove(idx)}
                    className="p-2 rounded-lg text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all mb-0.5">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
