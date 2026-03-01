import { User } from 'lucide-react';
import DeviceControl from '../components/DeviceControl';

export default function UserDashboard() {
    const username = localStorage.getItem('username');

    return (
        <div className="w-full max-w-6xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
                <User className="w-8 h-8 text-cyan-400" />
                <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">User Dashboard</h2>
            </div>
            <p className="text-gray-400">Welcome, {username}. Here is your IoT controller.</p>

            <div className="w-full">
                <DeviceControl deviceId="device-001" />
            </div>
        </div>
    );
}
