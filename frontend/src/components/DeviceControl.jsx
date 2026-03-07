import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Zap, Fan, Server, Radar, Code, Settings, Save, Plus, Trash2, X, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const socket = io(import.meta.env.VITE_API_URL || '');

const IconMap = { Zap, Fan, Server, Radar, Code, Activity };

export default function DeviceControl({ deviceId, isAdmin, deviceName }) {
    const [device, setDevice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [tempControls, setTempControls] = useState([]);

    useEffect(() => {
        fetchDevice();

        // --- SERVER KEEP-ALIVE ---
        // Pings the backend every 5 minutes while the dashboard is open
        // to prevent Render/Vercel free tier sleep.
        const heartbeat = setInterval(() => {
            axios.get(`${import.meta.env.VITE_API_URL || ''}/api/ping`).catch(() => { });
        }, 60000);

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

        socket.on('deviceConfigUpdate', (data) => {
            if (data.deviceId === deviceId) {
                setDevice(prev => ({ ...prev, controls: data.controls }));
            }
        });

        return () => {
            clearInterval(heartbeat);
            socket.off('deviceStateUpdate');
            socket.off('deviceStatusUpdate');
            socket.off('deviceConfigUpdate');
        };
    }, [deviceId]);

    const fetchDevice = async () => {
        try {
            const res = await axios.get(`${import.meta.env.VITE_API_URL || ''}/api/devices`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const current = res.data.find(d => d.deviceId === deviceId);
            if (current) {
                setDevice(current);
                setTempControls(current.controls || []);
            }
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const toggleControl = (toggleType) => {
        if (!device) return;
        const currentState = device.state?.[toggleType] || false;
        const newState = !currentState;

        // --- INSTANT OPTIMISTIC FEEDBACK ---
        setDevice(prev => ({
            ...prev,
            state: { ...prev.state, [toggleType]: newState }
        }));

        // --- INSTANT SOCKET COMMAND ---
        socket.emit('sendControl', {
            deviceId: deviceId,
            widgetKey: toggleType,
            value: newState,
            token: localStorage.getItem('token')
        });
    };

    const saveControls = async () => {
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL || ''}/api/devices/${deviceId}/controls`,
                { controls: tempControls },
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            setDevice(res.data);
            setIsEditing(false);
        } catch (err) {
            console.error(err);
            alert('Failed to save controls');
        }
    };

    const addControl = () => {
        const newKey = `control_${Date.now()}`;
        setTempControls([...tempControls, {
            key: newKey,
            label: 'NEW_CONTROL',
            type: 'toggle',
            icon: 'Zap',
            activeColor: 'shadow-[0_0_20px_#f9731699]',
            handleColor: 'bg-orange-500',
            category: 'logic'
        }]);
    };

    const removeControl = (index) => {
        const newControls = [...tempControls];
        newControls.splice(index, 1);
        setTempControls(newControls);
    };

    const updateControl = (index, field, value) => {
        const newControls = [...tempControls];
        newControls[index][field] = value;
        setTempControls(newControls);
    };

    if (loading) return (
        <div className="bg-[#0A0A0A] border border-orange-500/20 h-96 rounded-3xl flex items-center justify-center flex-col">
            <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
            <div className="text-orange-500 uppercase tracking-widest font-mono text-sm animate-pulse">ESTABLISHING UPLINK...</div>
        </div>
    );

    if (!device) return (
        <div className="bg-[#111] border border-red-500/20 p-8 rounded-3xl text-center">
            <div className="text-red-500 uppercase tracking-widest font-mono text-xl font-bold">NODE_NOT_FOUND</div>
            <p className="text-[#666] mt-2 font-mono text-sm">Verify backend configuration.</p>
        </div>
    );

    const logicControls = isEditing ? tempControls.filter(c => c.category === 'logic') : (device.controls || []).filter(c => c.category === 'logic');
    const heavyControls = isEditing ? tempControls.filter(c => c.category === 'heavy') : (device.controls || []).filter(c => c.category === 'heavy');

    return (
        <div className="bg-[#0A0A0A] rounded-3xl border border-orange-500/20 shadow-[-10px_-10px_30px_#f973160d,10px_10px_30px_#00000080] p-0 relative overflow-hidden group/container">

            {/* Decorative Grid Background */}
            <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            {/* Glow Layer */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-600/5 blur-[100px] pointer-events-none"></div>

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-0 border-b border-[#333]">
                {/* Status Header */}
                <div className="md:col-span-8 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-6 border-r border-[#333]">
                    <div className="w-16 h-16 bg-[#111] border border-orange-500/30 shadow-[0_0_15px_#f9731633] rounded-xl flex items-center justify-center relative">
                        <Server className={`w-8 h-8 ${device.isConnected ? 'text-orange-500' : 'text-gray-600'}`} />
                        {device.isConnected && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-[#0A0A0A] shadow-[0_0_8px_#22c55eff] animate-ping"></div>}
                        {device.isConnected && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-[#0A0A0A]"></div>}
                    </div>
                    <div className="flex-1">
                        <h3 className="text-2xl font-black font-mono tracking-widest text-white uppercase">{deviceName || device.deviceId}</h3>
                        <div className="flex items-center gap-2 mt-2 font-mono text-xs uppercase tracking-widest text-[#777]">
                            <span>Hardware Link:</span>
                            {device.isConnected
                                ? <span className="text-green-500 font-bold">_SYNCED</span>
                                : <span className="text-gray-500 font-bold">_AWAITING</span>}
                        </div>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => {
                                if (isEditing) saveControls();
                                else setIsEditing(true);
                            }}
                            className={`p-3 rounded-xl border transition-all ${isEditing ? 'bg-orange-500 border-orange-400 text-black' : 'bg-[#111] border-[#333] text-orange-500 hover:border-orange-500/50'}`}
                        >
                            {isEditing ? <Save className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
                        </button>
                    )}
                </div>

                {/* Signal Panel */}
                <div className="md:col-span-4 p-6 md:p-8 bg-black/40 flex items-center justify-center relative overflow-hidden">
                    <Radar className="absolute w-64 h-64 text-orange-500/5 stroke-[0.5] right-[-50px]" />
                    <div className="text-center relative z-10">
                        <span className="text-[#555] font-mono text-xs tracking-widest block mb-2 uppercase">Protocol Version</span>
                        <span className="text-white font-mono text-xl font-bold bg-[#111] px-4 py-1 rounded-md border border-[#333]">v1.0.4</span>
                    </div>
                </div>
            </div>

            {/* Control Grid */}
            <div className="relative z-10 p-6 md:p-8">
                <AnimatePresence mode="wait">
                    {isEditing ? (
                        <motion.div
                            key="editing"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-10"
                        >
                            <div className="flex justify-between items-center border-b border-[#222] pb-4">
                                <h4 className="text-orange-500 font-mono font-bold tracking-widest uppercase text-lg">Control Configuration</h4>
                                <div className="flex gap-4">
                                    <button onClick={addControl} className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 text-orange-500 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all hover:bg-orange-500 hover:text-black">
                                        <Plus className="w-4 h-4" /> Add Control
                                    </button>
                                    <button onClick={() => setIsEditing(false)} className="flex items-center gap-2 bg-[#111] border border-[#333] text-[#777] px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all hover:text-white">
                                        <X className="w-4 h-4" /> Cancel
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-6 max-h-[500px] overflow-y-auto pr-2 custom-scroll">
                                {tempControls.map((ctrl, idx) => (
                                    <div key={idx} className="bg-[#111] p-6 rounded-2xl border border-[#222] grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase tracking-widest text-[#555] font-bold">Label</label>
                                            <input
                                                value={ctrl.label}
                                                onChange={(e) => updateControl(idx, 'label', e.target.value)}
                                                className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-orange-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase tracking-widest text-[#555] font-bold">Key (ESP Field)</label>
                                            <input
                                                value={ctrl.key}
                                                onChange={(e) => updateControl(idx, 'key', e.target.value)}
                                                className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-orange-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase tracking-widest text-[#555] font-bold">Category</label>
                                            <select
                                                value={ctrl.category}
                                                onChange={(e) => updateControl(idx, 'category', e.target.value)}
                                                className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-orange-500 outline-none"
                                            >
                                                <option value="logic">Logic Level</option>
                                                <option value="heavy">Heavy Equip</option>
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1 space-y-2">
                                                <label className="text-[10px] uppercase tracking-widest text-[#555] font-bold">Icon</label>
                                                <select
                                                    value={ctrl.icon}
                                                    onChange={(e) => updateControl(idx, 'icon', e.target.value)}
                                                    className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-orange-500 outline-none"
                                                >
                                                    {Object.keys(IconMap).map(iconName => (
                                                        <option key={iconName} value={iconName}>{iconName}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button
                                                onClick={() => removeControl(idx)}
                                                className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all mb-0.5"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {tempControls.length === 0 && (
                                    <div className="text-center py-10 border-2 border-dashed border-[#222] rounded-3xl text-[#555] font-mono uppercase tracking-widest">
                                        No controls defined. Add one to get started.
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="controls"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12"
                        >
                            {/* Logic Level Outputs */}
                            <div>
                                <h4 className="flex items-center gap-2 text-white font-mono font-bold tracking-widest text-sm uppercase border-b border-[#222] pb-3 mb-6">
                                    <Code className="w-4 h-4 text-orange-500" /> Output Stages
                                </h4>
                                <div className="space-y-4">
                                    {logicControls.map((ctrl) => (
                                        <DarkToggleSwitch
                                            key={ctrl.key}
                                            label={ctrl.label}
                                            icon={ctrl.icon && IconMap[ctrl.icon] ? <div className="p-2 bg-[#0A0A0A] rounded-lg border border-[#333]">{(() => {
                                                const Icon = IconMap[ctrl.icon];
                                                if (ctrl.key === 'propeller') {
                                                    return (
                                                        <motion.div animate={device.state?.[ctrl.key] ? { rotate: 360 } : { rotate: 0 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                                                            <Icon className={`w-4 h-4 ${device.state?.[ctrl.key] ? 'text-purple-500' : 'text-gray-600'}`} />
                                                        </motion.div>
                                                    );
                                                }
                                                return <Icon className={`w-4 h-4 ${device.state?.[ctrl.key] ? 'text-orange-500' : 'text-gray-600'}`} />;
                                            })()}</div> : null}
                                            activeColor={ctrl.activeColor}
                                            handleColor={ctrl.handleColor}
                                            active={device.state?.[ctrl.key] || false}
                                            onChange={() => toggleControl(ctrl.key)}
                                        />
                                    ))}
                                    {logicControls.length === 0 && <div className="text-[#333] font-mono text-[10px] uppercase tracking-widest italic">NO_LOGIC_OUTPUTS</div>}
                                </div>
                            </div>

                            {/* High Current / Special Features */}
                            <div>
                                <h4 className="flex items-center gap-2 text-white font-mono font-bold tracking-widest text-sm uppercase border-b border-[#222] pb-3 mb-6">
                                    <Zap className="w-4 h-4 text-orange-500" /> Heavy Equipment
                                </h4>
                                <div className="space-y-4">
                                    {heavyControls.map((ctrl) => (
                                        <DarkToggleSwitch
                                            key={ctrl.key}
                                            label={ctrl.label}
                                            icon={ctrl.icon && IconMap[ctrl.icon] ? <div className="p-2 bg-[#0A0A0A] rounded-lg border border-[#333]">{(() => {
                                                const Icon = IconMap[ctrl.icon];
                                                if (ctrl.key === 'propeller') {
                                                    return (
                                                        <motion.div animate={device.state?.[ctrl.key] ? { rotate: 360 } : { rotate: 0 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                                                            <Icon className={`w-4 h-4 ${device.state?.[ctrl.key] ? 'text-purple-500' : 'text-gray-600'}`} />
                                                        </motion.div>
                                                    );
                                                }
                                                return <Icon className={`w-4 h-4 ${device.state?.[ctrl.key] ? 'text-yellow-500' : 'text-gray-600'}`} />;
                                            })()}</div> : null}
                                            activeColor={ctrl.activeColor}
                                            handleColor={ctrl.handleColor}
                                            active={device.state?.[ctrl.key] || false}
                                            onChange={() => toggleControl(ctrl.key)}
                                        />
                                    ))}
                                    {heavyControls.length === 0 && <div className="text-[#333] font-mono text-[10px] uppercase tracking-widest italic">NO_HEAVY_EQUIPMENT</div>}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function DarkToggleSwitch({ label, active, activeColor, handleColor, icon, onChange }) {
    return (
        <div className="flex items-center justify-between p-4 bg-[#111] hover:bg-[#151515] rounded-xl border border-[#222] hover:border-orange-500/30 transition-all group">
            <div className="flex items-center gap-3">
                {icon}
                <span className={`font-mono text-sm uppercase tracking-widest transition-colors ${active ? 'text-white' : 'text-[#777]'}`}>
                    {label}
                </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={active} onChange={onChange} />
                <div className={`w-14 h-8 bg-black border-2 border-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-600 after:border-gray-600 after:border after:rounded-full after:h-6 after:w-6 after:transition-all ${active ? 'peer-checked:border-orange-500' : ''} ${active ? activeColor : ''}`}>
                    <div className={`absolute top-[4px] left-[4px] w-6 h-6 rounded-full transition-all ${active ? `translate-x-6 ${handleColor}` : 'bg-gray-700'}`}></div>
                </div>
            </label>
        </div>
    );
}
