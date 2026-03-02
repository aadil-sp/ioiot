import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Wifi, WifiOff, Settings, Plus, Trash2, Save, X,
    Zap, Copy, Check, Code2, Sliders, ToggleLeft, Activity, RefreshCw
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const socket = io(API);

const PIN_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#ef4444', '#eab308', '#a855f7', '#06b6d4', '#ec4899'];
const WIDGET_TYPES = ['toggle', 'slider', 'button', 'value_display'];
const PIN_MODES = ['OUTPUT', 'INPUT', 'INPUT_PULLUP'];
const PIN_TYPES = ['digital', 'pwm', 'analog_input'];

export default function DeviceDetail() {
    const { id } = useParams();
    const [device, setDevice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('control'); // 'control' | 'config' | 'code'
    const [editingPins, setEditingPins] = useState([]);
    const [savingPins, setSavingPins] = useState(false);
    const [copied, setCopied] = useState(false);
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const isAdmin = localStorage.getItem('role') === 'admin';

    const fetchDevice = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/api/devices`, { headers });
            const d = res.data.find(d => d.deviceId === id);
            if (d) {
                setDevice(d);
                setEditingPins(JSON.parse(JSON.stringify(d.pins || [])));
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [id]);

    useEffect(() => {
        fetchDevice();
        // Keep-alive
        const keepAlive = setInterval(() => axios.get(`${API}/api/ping`).catch(() => { }), 300000);

        socket.on('deviceStateUpdate', data => {
            if (data.deviceId === id) {
                setDevice(prev => {
                    if (!prev) return prev;
                    const updated = { ...prev };
                    const pin = updated.pins.find(p => p.widgetKey === data.widgetKey);
                    if (pin) pin.value = data.value;
                    return updated;
                });
            }
        });
        socket.on('deviceStatusUpdate', data => {
            if (data.deviceId === id) {
                setDevice(prev => prev ? { ...prev, isConnected: data.isConnected } : prev);
            }
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

    // --- Control Functions ---
    const sendControl = async (widgetKey, value) => {
        // Optimistic update
        setDevice(prev => {
            if (!prev) return prev;
            const updated = { ...prev, pins: prev.pins.map(p => p.widgetKey === widgetKey ? { ...p, value } : p) };
            return updated;
        });
        try {
            await axios.post(`${API}/api/devices/${id}/control`, { widgetKey, value }, { headers });
        } catch (err) {
            console.error(err);
            fetchDevice(); // Revert
        }
    };

    // --- Pin Config ---
    const addPin = () => {
        const usedPins = editingPins.map(p => p.pinNumber);
        const nextPin = [2, 4, 5, 12, 13, 14, 15, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33].find(n => !usedPins.includes(n)) || 99;
        const newPin = {
            pinNumber: nextPin,
            label: `Pin ${nextPin}`,
            mode: 'OUTPUT',
            type: 'digital',
            widgetType: 'toggle',
            widgetKey: `pin_${nextPin}_${Date.now()}`,
            value: false,
            min: 0,
            max: 255,
            color: PIN_COLORS[editingPins.length % PIN_COLORS.length]
        };
        setEditingPins(prev => [...prev, newPin]);
    };

    const updatePin = (idx, field, val) => {
        setEditingPins(prev => prev.map((p, i) => {
            if (i !== idx) return p;
            const updated = { ...p, [field]: val };
            if (field === 'pinNumber') updated.label = `Pin ${val}`;
            if (field === 'type') {
                if (val === 'digital') { updated.widgetType = 'toggle'; updated.value = false; }
                if (val === 'pwm') { updated.widgetType = 'slider'; updated.value = 0; }
                if (val === 'analog_input') { updated.widgetType = 'value_display'; updated.mode = 'INPUT'; }
            }
            if (field === 'mode' && val === 'INPUT') {
                updated.widgetType = 'value_display';
            }
            return updated;
        }));
    };

    const removePin = (idx) => setEditingPins(prev => prev.filter((_, i) => i !== idx));

    const savePins = async () => {
        setSavingPins(true);
        try {
            const res = await axios.put(`${API}/api/devices/${id}/pins`, { pins: editingPins }, { headers });
            setDevice(res.data);
            setTab('control');
        } catch (err) { alert('Failed to save pins'); }
        finally { setSavingPins(false); }
    };

    // --- Code Generator ---
    const generateCode = () => {
        if (!device) return '';
        const pinDefs = device.pins.map(p =>
            `#define PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')} ${p.pinNumber}  // ${p.widgetType}`
        ).join('\n');
        const setupPins = device.pins.map(p =>
            `  pinMode(PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}, ${p.mode});`
        ).join('\n');
        const readLogic = device.pins.filter(p => p.mode === 'OUTPUT').map(p => {
            const varName = p.widgetKey;
            if (p.type === 'digital') return `        bool ${varName} = doc["${varName}"] | false;\n        digitalWrite(PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}, ${varName} ? HIGH : LOW);`;
            if (p.type === 'pwm') return `        int ${varName} = doc["${varName}"] | 0;\n        analogWrite(PIN_${p.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}, ${varName});`;
            return '';
        }).join('\n');

        return `// =============================================
// Generated by IoIoT for device: ${device.name}
// =============================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "esp_wifi.h"

// ----- CONFIGURATION (Fill these in) -----
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* AUTH_TOKEN = "${device.authToken}";
const char* SERVER_URL = "${API || 'https://ioiot.vercel.app'}/api/esp/state";
// ------------------------------------------

// Pin Definitions (Auto-Generated)
${pinDefs}

void setup() {
  Serial.begin(115200);
  delay(2000);

${setupPins}

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  esp_wifi_set_max_tx_power(34);
  Serial.print("Connecting...");
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

${readLogic}

      Serial.println("State updated.");
    } else {
      Serial.println("HTTP Error: " + String(code));
    }
    http.end();
  } else {
    WiFi.reconnect();
  }
  delay(500);
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
        <div className="flex flex-col items-center justify-center h-96 text-center">
            <p className="text-red-500 font-mono uppercase tracking-widest text-xl">Device Not Found</p>
            <a href="/dashboard" className="mt-4 text-orange-500 font-mono text-sm hover:underline">← Back to Dashboard</a>
        </div>
    );

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto">
            {/* Back + Header */}
            <div className="mb-8">
                <a href="/dashboard" className="flex items-center gap-2 text-[#555] hover:text-orange-500 font-mono text-sm transition-all mb-4">
                    <ArrowLeft className="w-4 h-4" /> Back to Devices
                </a>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${device.isConnected ? 'border-green-500/30 bg-green-500/10' : 'border-[#222] bg-[#111]'}`}>
                            {device.isConnected ? <Wifi className="w-7 h-7 text-green-500" /> : <WifiOff className="w-7 h-7 text-[#333]" />}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black font-mono uppercase tracking-widest text-white">{device.name}</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className={`flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest ${device.isConnected ? 'text-green-500' : 'text-[#444]'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${device.isConnected ? 'bg-green-500 animate-pulse' : 'bg-[#333]'}`}></span>
                                    {device.isConnected ? 'Online' : 'Offline'}
                                </span>
                                <span className="text-[#333] text-xs font-mono">{device.deviceId}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={fetchDevice} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111] border border-[#222] text-gray-400 hover:text-white text-sm transition-all">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Auth Token Banner */}
            <div className="mb-6 p-4 bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl flex items-center gap-3">
                <span className="text-[#555] font-mono text-xs uppercase tracking-widest">Auth Token:</span>
                <code className="flex-1 text-orange-400 font-mono text-xs bg-black/40 px-3 py-1.5 rounded-lg overflow-x-auto">{device.authToken}</code>
                <button onClick={() => { navigator.clipboard.writeText(device.authToken); }}
                    className="p-2 rounded-lg text-[#555] hover:text-orange-500 hover:bg-orange-500/10 transition-all">
                    <Copy className="w-4 h-4" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl mb-8">
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
                {tab === 'control' && (
                    <motion.div key="control" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        {device.pins.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-52 border-2 border-dashed border-[#1a1a1a] rounded-2xl text-center">
                                <Zap className="w-10 h-10 text-[#222] mb-3" />
                                <p className="text-[#444] font-mono text-sm">No pins configured yet</p>
                                <button onClick={() => setTab('config')} className="mt-3 text-orange-500 font-mono text-xs hover:underline">
                                    → Go to Pin Config
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {device.pins.map(pin => (
                                    <ControlWidget key={pin.widgetKey} pin={pin} onControl={sendControl} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {tab === 'config' && (
                    <motion.div key="config" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-white font-mono font-bold uppercase tracking-widest">Pin Configuration</h3>
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
                            <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-[#1a1a1a] rounded-2xl">
                                <p className="text-[#444] font-mono text-sm">No pins yet. Add one to get started.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {editingPins.map((pin, idx) => (
                                    <PinConfigRow key={idx} pin={pin} idx={idx} onUpdate={updatePin} onRemove={removePin} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {tab === 'code' && (
                    <motion.div key="code" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-white font-mono font-bold uppercase tracking-widest">Generated ESP32 Code</h3>
                            <button onClick={copyCode}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${copied ? 'bg-green-500 text-black' : 'bg-orange-500/10 border border-orange-500/30 text-orange-500 hover:bg-orange-500 hover:text-black'}`}>
                                {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Code</>}
                            </button>
                        </div>
                        <div className="bg-black border border-[#1a1a1a] rounded-2xl p-6 overflow-auto max-h-[600px]">
                            <pre className="text-xs font-mono text-green-400 leading-relaxed whitespace-pre">{generateCode()}</pre>
                        </div>
                        <p className="mt-4 text-[#444] font-mono text-xs">
                            1. Copy the code above → paste into Arduino IDE → fill in your WiFi credentials → Upload to ESP32
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Control Widget ────────────────────────────────────────────────────────
function ControlWidget({ pin, onControl }) {
    const isOn = pin.value === true || pin.value > 0;

    return (
        <div className={`bg-[#0A0A0A] border rounded-2xl p-5 transition-all ${isOn ? 'border-opacity-50' : 'border-[#1a1a1a]'}`}
            style={{ borderColor: isOn ? pin.color + '55' : undefined, boxShadow: isOn ? `0 0 20px ${pin.color}22` : undefined }}>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h4 className="text-white font-mono font-bold text-sm">{pin.label}</h4>
                    <p className="text-[#555] text-xs font-mono">GPIO {pin.pinNumber} · {pin.type}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded"
                        style={{ color: pin.color, backgroundColor: pin.color + '15', border: `1px solid ${pin.color}33` }}>
                        {pin.widgetType}
                    </span>
                </div>
            </div>

            {pin.widgetType === 'toggle' && (
                <button onClick={() => onControl(pin.widgetKey, !pin.value)}
                    className={`w-full py-3 rounded-xl font-mono font-bold text-sm transition-all ${pin.value ? 'text-black' : 'border border-[#222] text-[#555] hover:text-white'}`}
                    style={pin.value ? { backgroundColor: pin.color } : {}}>
                    {pin.value ? '● ON' : '○ OFF'}
                </button>
            )}

            {pin.widgetType === 'slider' && (
                <div className="space-y-3">
                    <div className="flex justify-between text-xs font-mono text-[#555]">
                        <span>{pin.min}</span>
                        <span style={{ color: pin.color }} className="font-bold text-base">{pin.value}</span>
                        <span>{pin.max}</span>
                    </div>
                    <input type="range" min={pin.min} max={pin.max} value={pin.value}
                        onChange={e => onControl(pin.widgetKey, Number(e.target.value))}
                        className="w-full accent-orange-500 cursor-pointer"
                        style={{ accentColor: pin.color }}
                    />
                </div>
            )}

            {pin.widgetType === 'button' && (
                <button
                    onMouseDown={() => onControl(pin.widgetKey, true)}
                    onMouseUp={() => onControl(pin.widgetKey, false)}
                    onTouchStart={() => onControl(pin.widgetKey, true)}
                    onTouchEnd={() => onControl(pin.widgetKey, false)}
                    className="w-full py-3 rounded-xl font-mono font-bold text-sm transition-all border border-[#222] text-[#555] hover:text-white active:scale-95"
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

// ─── Pin Config Row ────────────────────────────────────────────────────────
function PinConfigRow({ pin, idx, onUpdate, onRemove }) {
    return (
        <div className="bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl p-5 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            {/* Color dot */}
            <div className="col-span-1 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pin.color }}></div>
                <div className="flex-1">
                    <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Label</label>
                    <input value={pin.label} onChange={e => onUpdate(idx, 'label', e.target.value)}
                        className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs" />
                </div>
            </div>
            <div>
                <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">GPIO</label>
                <select value={pin.pinNumber} onChange={e => onUpdate(idx, 'pinNumber', Number(e.target.value))}
                    className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs">
                    {[2, 4, 5, 12, 13, 14, 15, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39].map(n =>
                        <option key={n} value={n}>GPIO {n}</option>
                    )}
                </select>
            </div>
            <div>
                <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Mode</label>
                <select value={pin.mode} onChange={e => onUpdate(idx, 'mode', e.target.value)}
                    className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs">
                    {PIN_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Type</label>
                <select value={pin.type} onChange={e => onUpdate(idx, 'type', e.target.value)}
                    className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs">
                    {PIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Widget</label>
                <select value={pin.widgetType} onChange={e => onUpdate(idx, 'widgetType', e.target.value)}
                    className="w-full bg-black border border-[#222] focus:border-orange-500 outline-none rounded-lg px-2 py-1.5 text-white font-mono text-xs">
                    {WIDGET_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
            </div>
            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <label className="block text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">Color</label>
                    <input type="color" value={pin.color} onChange={e => onUpdate(idx, 'color', e.target.value)}
                        className="w-full h-8 rounded-lg cursor-pointer bg-black border border-[#222] p-0.5" />
                </div>
                <button onClick={() => onRemove(idx)}
                    className="p-2 rounded-lg text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-all mb-0.5">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
