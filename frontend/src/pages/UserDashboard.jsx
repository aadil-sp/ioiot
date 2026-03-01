import { Activity } from 'lucide-react';
import DeviceControl from '../components/DeviceControl';

export default function UserDashboard() {
    const username = localStorage.getItem('username');

    return (
        <div className="w-full flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700">

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

            <div className="w-full max-w-5xl self-center">
                <DeviceControl deviceId="device-001" isAdmin={false} />
            </div>
        </div>
    );
}
