import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Lightbulb, Zap, Fan, ServerCrash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000');

export default function DeviceControl({ deviceId }) {
    const [device, setDevice] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDevice();

        socket.on('deviceStateUpdate', (data) => {
            if (data.deviceId === deviceId) {
                setDevice(prev => ({ ...prev, state: data.state }));
            }
        });

        socket.on('deviceStatusUpdate', (data) => {
            if (data.deviceId === deviceId) {
                setDevice(prev => ({ ...prev, isConnected: data.isConnected }));
            }
        });

        return () => {
            socket.off('deviceStateUpdate');
            socket.off('deviceStatusUpdate');
        };
    }, [deviceId]);

    const fetchDevice = async () => {
        try {
            const res = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/devices`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const current = res.data.find(d => d.deviceId === deviceId);
            if (current) {
                setDevice(current);
            }
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const toggleControl = async (toggleType) => {
        if (!device) return;
        const newState = !device.state[toggleType];

        // Optimistic UI update
        setDevice(prev => ({
            ...prev,
            state: { ...prev.state, [toggleType]: newState }
        }));

        try {
            await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/devices/${deviceId}/toggle`,
                { toggleType, state: newState },
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        } catch (err) {
            console.error(err);
            // Revert if failed (simplified UX)
            setDevice(prev => ({
                ...prev,
                state: { ...prev.state, [toggleType]: !newState }
            }));
        }
    };

    if (loading) return <div className="animate-pulse h-40 bg-white/5 rounded-xl inset-0"></div>;
    if (!device) return <div className="text-red-400 p-4 glass-panel rounded-xl">Device not found. Please setup backend.</div>;

    return (
        <div className="glass-panel p-8 rounded-3xl grid grid-cols-1 md:grid-cols-2 gap-8 relative overflow-hidden">
            {/* Background glow effects */}
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-cyan-500/20 blur-3xl rounded-full pointer-events-none"></div>
            <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-purple-500/20 blur-3xl rounded-full pointer-events-none"></div>

            <div className="relative z-10 flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-2">
                    <ServerCrash className="w-8 h-8 text-blue-400" />
                    <h3 className="text-2xl font-bold font-mono text-gray-100">{deviceId}</h3>
                </div>
                <div className="flex items-center gap-2 mb-8">
                    <span className="text-sm text-gray-400">Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${device.isConnected ? 'bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                        {device.isConnected ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </div>

                <div className="space-y-6">
                    <ToggleSwitch
                        label="Green LED"
                        icon={<Lightbulb className={`w-5 h-5 ${device.state.ledG ? 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]' : 'text-gray-500'}`} />}
                        active={device.state.ledG}
                        colorClass="peer-checked:bg-green-500"
                        ringClass="focus:ring-green-500"
                        onChange={() => toggleControl('ledG')}
                    />
                    <ToggleSwitch
                        label="Blue LED"
                        icon={<Lightbulb className={`w-5 h-5 ${device.state.ledB ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]' : 'text-gray-500'}`} />}
                        active={device.state.ledB}
                        colorClass="peer-checked:bg-blue-500"
                        ringClass="focus:ring-blue-500"
                        onChange={() => toggleControl('ledB')}
                    />
                    <ToggleSwitch
                        label="Red LED"
                        icon={<Lightbulb className={`w-5 h-5 ${device.state.ledR ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]' : 'text-gray-500'}`} />}
                        active={device.state.ledR}
                        colorClass="peer-checked:bg-red-500"
                        ringClass="focus:ring-red-500"
                        onChange={() => toggleControl('ledR')}
                    />
                </div>
            </div>

            <div className="relative z-10 space-y-6 flex flex-col justify-center">
                <ToggleSwitch
                    label="Flash Pattern"
                    icon={<Zap className={`w-5 h-5 ${device.state.flash ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'text-gray-500'}`} />}
                    active={device.state.flash}
                    colorClass="peer-checked:bg-yellow-500"
                    ringClass="focus:ring-yellow-500"
                    onChange={() => toggleControl('flash')}
                />
                <ToggleSwitch
                    label="Propeller Engine"
                    icon={
                        <motion.div animate={device.state.propeller ? { rotate: 360 } : { rotate: 0 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                            <Fan className={`w-5 h-5 ${device.state.propeller ? 'text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]' : 'text-gray-500'}`} />
                        </motion.div>
                    }
                    active={device.state.propeller}
                    colorClass="peer-checked:bg-purple-500"
                    ringClass="focus:ring-purple-500"
                    onChange={() => toggleControl('propeller')}
                />
            </div>
        </div>
    );
}

function ToggleSwitch({ label, icon, active, colorClass, ringClass, onChange }) {
    return (
        <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-4">
                <div className="p-2 bg-black/30 rounded-xl border border-white/5">
                    {icon}
                </div>
                <span className="font-medium text-gray-200">{label}</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={active} onChange={onChange} />
                <div className={`w-14 h-7 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 ${ringClass} peer-focus:ring-opacity-30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all ${colorClass} peer-checked:shadow-lg transition-colors`}></div>
            </label>
        </div>
    );
}
