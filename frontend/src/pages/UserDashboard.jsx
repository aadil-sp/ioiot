import { useState } from 'react';
import { Activity, LayoutDashboard, Plane } from 'lucide-react';
import DeviceControl from '../components/DeviceControl';
import { motion, AnimatePresence } from 'framer-motion';

export default function UserDashboard() {
    const username = localStorage.getItem('username');
    const [activeTab, setActiveTab] = useState('device-001');

    const tabs = [
        { id: 'device-001', name: 'RC PLANE DEMO', icon: <Plane className="w-4 h-4" /> },
    ];

    return (
        <div className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#333] pb-6">
                <div>
                    <h2 className="text-4xl lg:text-5xl font-black uppercase tracking-widest text-white mb-2">OPERATOR<span className="text-orange-500">_{username}</span></h2>
                    <p className="text-[#888] font-mono tracking-widest text-sm">NODE DIRECT CONNECTION</p>
                </div>
                <div className="bg-[#111] px-4 py-2 rounded-lg border border-[#333] flex items-center gap-2">
                    <Activity className="w-5 h-5 text-orange-500 animate-pulse" />
                    <span className="text-xs uppercase tracking-widest font-bold text-gray-400">Connection: Active</span>
                </div>
            </div>

            <div className="flex flex-wrap gap-4 border-b border-[#222]">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-3 font-mono text-xs font-bold tracking-widest uppercase transition-all relative ${activeTab === tab.id ? 'text-orange-500' : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        {tab.icon}
                        {tab.name}
                        {activeTab === tab.id && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 shadow-[0_0_10px_#f97316]"
                            />
                        )}
                    </button>
                ))}
            </div>

            <div className="w-full max-w-5xl self-center">
                <AnimatePresence mode="wait">
                    {activeTab === 'device-001' && (
                        <motion.div
                            key="device-001"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <DeviceControl deviceId="device-001" isAdmin={false} deviceName="RC PLANE DEMO" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
