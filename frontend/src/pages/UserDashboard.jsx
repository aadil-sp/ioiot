import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Cpu, Wifi, WifiOff, Zap, Trash2, ChevronRight, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API = import.meta.env.VITE_API_URL || '';

export default function UserDashboard() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newDeviceName, setNewDeviceName] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    useEffect(() => { fetchDevices(); }, []);

    const fetchDevices = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API}/api/devices`, { headers });
            setDevices(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const createDevice = async () => {
        if (!newDeviceName.trim()) return;
        try {
            setCreating(true);
            const res = await axios.post(`${API}/api/devices`, { name: newDeviceName }, { headers });
            setDevices(prev => [res.data, ...prev]);
            setNewDeviceName('');
            setShowCreate(false);
        } catch (err) {
            alert('Failed to create device');
        } finally {
            setCreating(false);
        }
    };

    const deleteDevice = async (deviceId) => {
        try {
            await axios.delete(`${API}/api/devices/${deviceId}`, { headers });
            setDevices(prev => prev.filter(d => d.deviceId !== deviceId));
            setDeleteConfirm(null);
        } catch (err) {
            alert('Failed to delete device');
        }
    };

    const onlineCount = devices.filter(d => d.isConnected).length;

    return (
        <div className="min-h-screen p-6 md:p-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                <div>
                    <h2 className="text-3xl font-black font-mono uppercase tracking-widest text-white">
                        My Devices
                    </h2>
                    <p className="text-[#555] font-mono text-sm mt-1 tracking-widest">
                        {devices.length} registered · <span className="text-green-500">{onlineCount} online</span>
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={fetchDevices}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111] border border-[#222] text-gray-400 hover:text-white transition-all text-sm">
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                    <button onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all shadow-[0_0_20px_#f9731655]">
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
                            className="bg-[#0A0A0A] border border-orange-500/30 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                            <h3 className="text-xl font-black font-mono uppercase tracking-widest text-orange-500 mb-6">New Device</h3>
                            <label className="block text-xs text-[#555] font-mono uppercase tracking-widest mb-2">Device Name</label>
                            <input
                                value={newDeviceName}
                                onChange={e => setNewDeviceName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && createDevice()}
                                placeholder="e.g. Smart Home Light"
                                className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-3 text-white font-mono text-sm mb-6"
                                autoFocus
                            />
                            <div className="flex gap-3">
                                <button onClick={() => { setShowCreate(false); setNewDeviceName(''); }}
                                    className="flex-1 py-3 rounded-xl border border-[#333] text-gray-400 hover:text-white transition-all font-mono font-bold text-sm">Cancel</button>
                                <button onClick={createDevice} disabled={creating || !newDeviceName.trim()}
                                    className="flex-1 py-3 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all disabled:opacity-50">
                                    {creating ? 'Creating...' : 'Create Device'}
                                </button>
                            </div>
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
                    <button onClick={() => setShowCreate(true)}
                        className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500 font-bold text-sm hover:bg-orange-500 hover:text-black transition-all">
                        <Plus className="w-4 h-4" /> Add your first device
                    </button>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {devices.map((device, i) => (
                        <motion.div key={device.deviceId}
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                            className="group bg-[#0A0A0A] border border-[#1a1a1a] hover:border-orange-500/30 rounded-2xl p-6 flex flex-col gap-4 transition-all relative overflow-hidden cursor-pointer"
                            onClick={() => window.location.href = `/device/${device.deviceId}`}>
                            {/* glow */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-[60px] pointer-events-none group-hover:bg-orange-500/10 transition-all"></div>

                            {/* Header */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${device.isConnected ? 'bg-green-500/10 border border-green-500/30' : 'bg-[#111] border border-[#222]'}`}>
                                        {device.isConnected
                                            ? <Wifi className="w-5 h-5 text-green-500" />
                                            : <WifiOff className="w-5 h-5 text-[#333]" />}
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold font-mono text-sm">{device.name}</h3>
                                        <p className="text-[#444] text-xs font-mono">{device.deviceId}</p>
                                    </div>
                                </div>
                                <button onClick={e => { e.stopPropagation(); setDeleteConfirm(device.deviceId); }}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-all">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Status */}
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${device.isConnected ? 'bg-green-500 animate-pulse shadow-[0_0_6px_#22c55e]' : 'bg-[#333]'}`}></span>
                                <span className={`text-xs font-mono uppercase tracking-widest ${device.isConnected ? 'text-green-500' : 'text-[#444]'}`}>
                                    {device.isConnected ? 'Online' : 'Offline'}
                                </span>
                                <span className="ml-auto text-[#333] text-xs font-mono">{device.pins?.length || 0} pins</span>
                            </div>

                            {/* Quick widget preview */}
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

                            {/* Footer */}
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
