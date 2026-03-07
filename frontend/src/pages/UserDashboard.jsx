import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Cpu, Wifi, WifiOff, Zap, Trash2, ChevronRight, RefreshCw, Bluetooth, Radio, Usb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const API = import.meta.env.VITE_API_URL || '';

// Board catalogue
const BOARDS = {
    esp: [
        { id: 'esp32', label: 'ESP32', icon: '🔷', desc: 'Most popular. WiFi + BT. Recommended.' },
        { id: 'esp8266', label: 'ESP8266', icon: '🔵', desc: 'Smaller, cheaper. WiFi only. NodeMCU / D1 Mini.' },
    ],
    arduino: [
        { id: 'uno', label: 'Arduino Uno', icon: '🟦', desc: 'Classic. USB serial control from browser.' },
        { id: 'nano', label: 'Arduino Nano', icon: '🟩', desc: 'Compact Uno form factor.' },
        { id: 'mega', label: 'Arduino Mega', icon: '🟪', desc: 'More pins/memory. Same USB control.' },
    ],
};

export default function UserDashboard() {
    const navigate = useNavigate();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Create wizard state
    const [step, setStep] = useState(1); // 1=platform, 2=board+name
    const [platform, setPlatform] = useState(''); // 'esp' | 'arduino'
    const [selectedBoard, setSelectedBoard] = useState('esp32');
    const [newDeviceName, setNewDeviceName] = useState('');
    const [newDeviceMode, setNewDeviceMode] = useState('wifi'); // wifi | serial | usb
    const [creating, setCreating] = useState(false);

    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const currentUserId = localStorage.getItem('userId');

    useEffect(() => { fetchDevices(); }, []);

    const fetchDevices = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API}/api/devices`, { headers });
            setDevices(res.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const openCreate = () => {
        setStep(1); setPlatform(''); setSelectedBoard('esp32');
        setNewDeviceName(''); setNewDeviceMode('wifi');
        setShowCreate(true);
    };

    const handlePlatformSelect = (p) => {
        setPlatform(p);
        if (p === 'arduino') { setSelectedBoard('uno'); setNewDeviceMode('usb'); }
        else { setSelectedBoard('esp32'); setNewDeviceMode('wifi'); }
        setStep(2);
    };

    const createDevice = async () => {
        if (!newDeviceName.trim()) return;
        try {
            setCreating(true);
            const res = await axios.post(`${API}/api/devices`, {
                name: newDeviceName,
                mode: newDeviceMode,
                board: selectedBoard,
            }, { headers });
            setDevices(prev => [res.data, ...prev]);
            setShowCreate(false);
        } catch (err) {
            alert('Failed to create device');
        } finally { setCreating(false); }
    };

    const deleteDevice = async (deviceId) => {
        try {
            await axios.delete(`${API}/api/devices/${deviceId}`, { headers });
            setDevices(prev => prev.filter(d => d.deviceId !== deviceId));
            setDeleteConfirm(null);
        } catch { alert('Failed to delete device'); }
    };

    const isOwnDevice = (d) => !d.isLive || d.owner?._id?.toString() === currentUserId || d.owner?.toString() === currentUserId;
    const onlineCount = devices.filter(d => d.isConnected).length;

    const getBoardIcon = (b) => ({ esp32: '🔷', esp8266: '🔵', uno: '🟦', nano: '🟩', mega: '🟪' }[b] || '💡');
    const getModeIcon = (d) => {
        if (d.mode === 'serial') return <Bluetooth className="w-5 h-5 text-blue-400" />;
        if (d.mode === 'usb') return <Usb className="w-5 h-5 text-green-400" />;
        return d.isConnected ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-[#333]" />;
    };
    const getModeLabel = (d) => {
        if (d.mode === 'serial') return 'BT/Serial';
        if (d.mode === 'usb') return 'USB';
        return 'WiFi';
    };

    return (
        <div className="min-h-screen p-6 md:p-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                <div>
                    <h2 className="text-3xl font-black font-mono uppercase tracking-widest text-white">My Devices</h2>
                    <p className="text-[#555] font-mono text-sm mt-1 tracking-widest">
                        {devices.length} registered · <span className="text-green-500">{onlineCount} online</span>
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={fetchDevices} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111] border border-[#222] text-gray-400 hover:text-white transition-all text-sm">
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                    <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all shadow-[0_0_20px_#f9731655]">
                        <Plus className="w-4 h-4" /> Add Device
                    </button>
                </div>
            </div>

            {/* Create Modal */}
            <AnimatePresence>
                {showCreate && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0A0A0A] border border-orange-500/30 rounded-2xl p-8 w-full max-w-lg shadow-2xl">

                            {/* Step indicator */}
                            <div className="flex items-center gap-2 mb-6">
                                {[1, 2].map(s => (
                                    <div key={s} className={`flex items-center gap-2 ${s < step ? 'text-orange-500' : s === step ? 'text-white' : 'text-[#333]'}`}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono border transition-all
                                            ${s < step ? 'bg-orange-500 border-orange-500 text-black' : s === step ? 'border-orange-500 text-orange-500' : 'border-[#333] text-[#333]'}`}>
                                            {s}
                                        </div>
                                        <span className="font-mono text-xs uppercase tracking-widest hidden sm:block">
                                            {s === 1 ? 'Platform' : 'Configure'}
                                        </span>
                                        {s < 2 && <span className="text-[#333] mx-1">›</span>}
                                    </div>
                                ))}
                            </div>

                            {step === 1 ? (
                                <>
                                    <h3 className="text-xl font-black font-mono uppercase tracking-widest text-orange-500 mb-2">Choose Platform</h3>
                                    <p className="text-[#555] font-mono text-xs mb-6">What type of hardware are you working with?</p>
                                    <div className="space-y-3">
                                        <button onClick={() => handlePlatformSelect('esp')}
                                            className="w-full flex items-center gap-4 p-5 rounded-2xl border border-[#222] hover:border-orange-500/50 bg-[#0d0d0d] hover:bg-orange-500/5 transition-all text-left group">
                                            <span className="text-3xl">📡</span>
                                            <div className="flex-1">
                                                <p className="text-white font-mono font-bold text-sm group-hover:text-orange-400 transition-colors">ESP / WiFi</p>
                                                <p className="text-[#555] font-mono text-xs mt-0.5">ESP32 or ESP8266 · Cloud dashboard · WiFi polling</p>
                                                <div className="flex gap-2 mt-2">
                                                    {BOARDS.esp.map(b => (
                                                        <span key={b.id} className="text-[10px] font-mono px-2 py-0.5 rounded border border-orange-500/20 text-orange-500/70">{b.label}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-[#333] group-hover:text-orange-500 transition-all" />
                                        </button>
                                        <button onClick={() => handlePlatformSelect('arduino')}
                                            className="w-full flex items-center gap-4 p-5 rounded-2xl border border-[#222] hover:border-green-500/50 bg-[#0d0d0d] hover:bg-green-500/5 transition-all text-left group">
                                            <span className="text-3xl">🔌</span>
                                            <div className="flex-1">
                                                <p className="text-white font-mono font-bold text-sm group-hover:text-green-400 transition-colors">Arduino / USB</p>
                                                <p className="text-[#555] font-mono text-xs mt-0.5">Uno, Nano, Mega · Direct USB control from browser</p>
                                                <div className="flex gap-2 mt-2">
                                                    {BOARDS.arduino.map(b => (
                                                        <span key={b.id} className="text-[10px] font-mono px-2 py-0.5 rounded border border-green-500/20 text-green-500/70">{b.label}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-[#333] group-hover:text-green-500 transition-all" />
                                        </button>
                                    </div>
                                    <button onClick={() => setShowCreate(false)}
                                        className="w-full mt-4 py-2.5 rounded-xl border border-[#333] text-gray-400 hover:text-white transition-all font-mono text-sm">Cancel</button>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 mb-6">
                                        <button onClick={() => setStep(1)} className="text-[#555] hover:text-orange-500 font-mono text-xs transition-colors">← Back</button>
                                        <h3 className="text-xl font-black font-mono uppercase tracking-widest text-orange-500">
                                            {platform === 'esp' ? '📡 ESP Config' : '🔌 Arduino Config'}
                                        </h3>
                                    </div>

                                    {/* Board selection */}
                                    <label className="block text-xs text-[#555] font-mono uppercase tracking-widest mb-2">Board</label>
                                    <div className="grid grid-cols-2 gap-2 mb-5">
                                        {BOARDS[platform].map(b => (
                                            <button key={b.id} onClick={() => setSelectedBoard(b.id)}
                                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${selectedBoard === b.id
                                                    ? (platform === 'esp' ? 'border-orange-500 bg-orange-500/10' : 'border-green-500 bg-green-500/10')
                                                    : 'border-[#222] bg-[#0d0d0d] hover:border-[#333]'}`}>
                                                <span className="text-xl">{b.icon}</span>
                                                <div>
                                                    <p className={`font-mono font-bold text-xs ${selectedBoard === b.id ? (platform === 'esp' ? 'text-orange-400' : 'text-green-400') : 'text-[#666]'}`}>{b.label}</p>
                                                    <p className="text-[#444] font-mono text-[10px] mt-0.5">{b.desc}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Mode selection — only for ESP */}
                                    {platform === 'esp' && (
                                        <>
                                            <label className="block text-xs text-[#555] font-mono uppercase tracking-widest mb-2">Control Mode</label>
                                            <div className="grid grid-cols-2 gap-2 mb-5">
                                                <button onClick={() => setNewDeviceMode('wifi')}
                                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${newDeviceMode === 'wifi' ? 'border-orange-500 bg-orange-500/10' : 'border-[#222] bg-[#0d0d0d] hover:border-[#333]'}`}>
                                                    <Wifi className={`w-5 h-5 ${newDeviceMode === 'wifi' ? 'text-orange-500' : 'text-[#444]'}`} />
                                                    <span className={`font-mono font-bold text-xs ${newDeviceMode === 'wifi' ? 'text-orange-500' : 'text-[#444]'}`}>WiFi / Cloud</span>
                                                </button>
                                                <button onClick={() => setNewDeviceMode('serial')}
                                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${newDeviceMode === 'serial' ? 'border-blue-500 bg-blue-500/10' : 'border-[#222] bg-[#0d0d0d] hover:border-[#333]'}`}>
                                                    <Bluetooth className={`w-5 h-5 ${newDeviceMode === 'serial' ? 'text-blue-400' : 'text-[#444]'}`} />
                                                    <span className={`font-mono font-bold text-xs ${newDeviceMode === 'serial' ? 'text-blue-400' : 'text-[#444]'}`}>Bluetooth / BT</span>
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    <label className="block text-xs text-[#555] font-mono uppercase tracking-widest mb-2">Device Name</label>
                                    <input
                                        value={newDeviceName}
                                        onChange={e => setNewDeviceName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && createDevice()}
                                        placeholder={`e.g. My ${selectedBoard.toUpperCase()} Project`}
                                        className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-3 text-white font-mono text-sm mb-5"
                                        autoFocus
                                    />

                                    <div className="flex gap-3">
                                        <button onClick={() => setShowCreate(false)}
                                            className="flex-1 py-3 rounded-xl border border-[#333] text-gray-400 hover:text-white transition-all font-mono font-bold text-sm">Cancel</button>
                                        <button onClick={createDevice} disabled={creating || !newDeviceName.trim()}
                                            className="flex-1 py-3 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all disabled:opacity-50">
                                            {creating ? 'Creating...' : 'Create Device'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Devices Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
                </div>
            ) : devices.length === 0 ? (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center h-72 border-2 border-dashed border-[#222] rounded-3xl text-center">
                    <Cpu className="w-14 h-14 text-[#333] mb-4" />
                    <p className="text-[#444] font-mono uppercase tracking-widest text-sm">No devices yet</p>
                    <p className="text-[#333] font-mono text-xs mt-1">Click "Add Device" to get started</p>
                    <button onClick={openCreate} className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500 font-bold text-sm hover:bg-orange-500 hover:text-black transition-all">
                        <Plus className="w-4 h-4" /> Add your first device
                    </button>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {devices.map((device, i) => (
                        <motion.div key={device.deviceId}
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                            className="group bg-[#0A0A0A] border border-[#1a1a1a] hover:border-orange-500/30 rounded-2xl p-6 flex flex-col gap-4 transition-all relative overflow-hidden cursor-pointer"
                            onClick={() => navigate(`/device/${device.deviceId}`)}>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-[60px] pointer-events-none group-hover:bg-orange-500/10 transition-all"></div>

                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${device.isConnected ? 'bg-green-500/10 border border-green-500/30' : 'bg-[#111] border border-[#222]'}`}>
                                        {getModeIcon(device)}
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold font-mono text-sm">{device.name}</h3>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase ${device.mode === 'serial' ? 'text-blue-400/70 border-blue-400/20' : device.mode === 'usb' ? 'text-green-400/70 border-green-400/20' : 'text-orange-500/70 border-orange-500/20'}`}>
                                                {getModeLabel(device)}
                                            </span>
                                            {device.board && (
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#222] text-[#555]">
                                                    {getBoardIcon(device.board)} {device.board.toUpperCase()}
                                                </span>
                                            )}
                                            {device.isLive && (
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-purple-400/70 border-purple-400/20 flex items-center gap-1">
                                                    <Radio className="w-2.5 h-2.5" />LIVE
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {isOwnDevice(device) && (
                                    <button onClick={e => { e.stopPropagation(); setDeleteConfirm(device.deviceId); }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-all">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${device.isConnected ? 'bg-green-500 animate-pulse shadow-[0_0_6px_#22c55e]' : 'bg-[#333]'}`}></span>
                                <span className={`text-xs font-mono uppercase tracking-widest ${device.isConnected ? 'text-green-500' : 'text-[#444]'}`}>
                                    {device.mode === 'usb' ? 'USB Direct' : device.isConnected ? 'Online' : 'Offline'}
                                </span>
                                <span className="ml-auto text-[#333] text-xs font-mono">{device.pins?.length || 0} pins</span>
                            </div>

                            {device.pins?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {device.pins.slice(0, 4).map(pin => (
                                        <span key={pin.widgetKey}
                                            style={{ borderColor: pin.color + '44', color: pin.color, backgroundColor: pin.color + '11' }}
                                            className="text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-widest">
                                            {pin.label}
                                        </span>
                                    ))}
                                    {device.pins.length > 4 && (
                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#222] text-[#444]">+{device.pins.length - 4}</span>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-2 border-t border-[#111]">
                                <span className="text-[#444] text-xs font-mono flex items-center gap-1">
                                    <Zap className="w-3 h-3" /> {device.pins?.filter(p => p.mode === 'OUTPUT').length || 0} outputs
                                </span>
                                <ChevronRight className="w-4 h-4 text-[#333] group-hover:text-orange-500 transition-all" />
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Delete Confirm Modal */}
            <AnimatePresence>
                {deleteConfirm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setDeleteConfirm(null)}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-[#0A0A0A] border border-red-500/30 rounded-2xl p-8 w-full max-w-sm">
                            <h3 className="text-red-500 font-black font-mono uppercase tracking-widest mb-2">Delete Device?</h3>
                            <p className="text-[#666] font-mono text-sm mb-6">This action is permanent and cannot be undone.</p>
                            <div className="flex gap-3">
                                <button onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 py-3 rounded-xl border border-[#333] text-gray-400 hover:text-white transition-all font-mono font-bold text-sm">Cancel</button>
                                <button onClick={() => deleteDevice(deleteConfirm)}
                                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-400 transition-all">Delete</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
