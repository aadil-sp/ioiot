import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Zap, Fan, Server, Radar, Code } from 'lucide-react';
import { motion } from 'framer-motion';

const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000');

export default function DeviceControl({ deviceId, isAdmin }) {
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
            if (current) setDevice(current);
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
            // Revert if failed
            setDevice(prev => ({
                ...prev,
                state: { ...prev.state, [toggleType]: !newState }
            }));
        }
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
                    <div>
                        <h3 className="text-2xl font-black font-mono tracking-widest text-white uppercase">{device.deviceId}</h3>
                        <div className="flex items-center gap-2 mt-2 font-mono text-xs uppercase tracking-widest text-[#777]">
                            <span>Hardware Link:</span>
                            {device.isConnected
                                ? <span className="text-green-500 font-bold">_SYNCED</span>
                                : <span className="text-gray-500 font-bold">_AWAITING</span>}
                        </div>
                    </div>
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
            <div className="relative z-10 p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

                {/* Logic Level Outputs */}
                <div>
                    <h4 className="flex items-center gap-2 text-white font-mono font-bold tracking-widest text-sm uppercase border-b border-[#222] pb-3 mb-6">
                        <Code className="w-4 h-4 text-orange-500" /> Output Stages
                    </h4>
                    <div className="space-y-4">
                        <DarkToggleSwitch
                            label="LED [ GRN ] // Ch0"
                            activeColor="shadow-[0_0_20px_#22c55e99]" handleColor="bg-green-500"
                            active={device.state.ledG}
                            onChange={() => toggleControl('ledG')}
                        />
                        <DarkToggleSwitch
                            label="LED [ BLU ] // Ch1"
                            activeColor="shadow-[0_0_20px_#3b82f699]" handleColor="bg-blue-500"
                            active={device.state.ledB}
                            onChange={() => toggleControl('ledB')}
                        />
                        <DarkToggleSwitch
                            label="LED [ RED ] // Ch2"
                            activeColor="shadow-[0_0_20px_#ef444499]" handleColor="bg-red-500"
                            active={device.state.ledR}
                            onChange={() => toggleControl('ledR')}
                        />
                    </div>
                </div>

                {/* High Current / Special Features */}
                <div>
                    <h4 className="flex items-center gap-2 text-white font-mono font-bold tracking-widest text-sm uppercase border-b border-[#222] pb-3 mb-6">
                        <Zap className="w-4 h-4 text-orange-500" /> Heavy Equipment
                    </h4>
                    <div className="space-y-4">
                        <DarkToggleSwitch
                            label="PWR_STROBE // D1_F"
                            icon={<Zap className={`w-4 h-4 ${device.state.flash ? 'text-yellow-500' : 'text-gray-600'}`} />}
                            activeColor="shadow-[0_0_25px_#eab30899]" handleColor="bg-yellow-500"
                            active={device.state.flash}
                            onChange={() => toggleControl('flash')}
                        />
                        <DarkToggleSwitch
                            label="DC_MOTOR // M1_T"
                            icon={
                                <motion.div animate={device.state.propeller ? { rotate: 360 } : { rotate: 0 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                                    <Fan className={`w-4 h-4 ${device.state.propeller ? 'text-purple-500' : 'text-gray-600'}`} />
                                </motion.div>
                            }
                            activeColor="shadow-[0_0_30px_#a855f7cc]" handleColor="bg-purple-500"
                            active={device.state.propeller}
                            onChange={() => toggleControl('propeller')}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}

function DarkToggleSwitch({ label, active, activeColor, handleColor, icon, onChange }) {
    return (
        <div className="flex items-center justify-between p-4 bg-[#111] hover:bg-[#151515] rounded-xl border border-[#222] hover:border-orange-500/30 transition-all group">
            <div className="flex items-center gap-3">
                {icon && <div className="hidden sm:flex bg-[#0A0A0A] p-2 rounded-lg border border-[#333]">{icon}</div>}
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
