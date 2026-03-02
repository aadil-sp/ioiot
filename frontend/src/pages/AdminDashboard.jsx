import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Users, Wifi, WifiOff, Check, X, Trash2, Shield, Cpu, RefreshCw, ExternalLink } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

export default function AdminDashboard() {
    const [tab, setTab] = useState('devices'); // 'devices' | 'users'
    const [devices, setDevices] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [devRes, usrRes] = await Promise.all([
                axios.get(`${API}/api/admin/devices`, { headers }),
                axios.get(`${API}/api/admin/users`, { headers })
            ]);
            setDevices(devRes.data);
            setUsers(usrRes.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const approveUser = async (id) => {
        await axios.post(`${API}/api/admin/users/${id}/approve`, {}, { headers });
        setUsers(prev => prev.map(u => u._id === id ? { ...u, isApproved: true } : u));
    };

    const deleteUser = async (id) => {
        if (!confirm('Delete this user and all their devices?')) return;
        await axios.delete(`${API}/api/admin/users/${id}`, { headers });
        setUsers(prev => prev.filter(u => u._id !== id));
    };

    const onlineDevices = devices.filter(d => d.isConnected).length;
    const pendingUsers = users.filter(u => !u.isApproved).length;

    return (
        <div className="min-h-screen p-6 md:p-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <Shield className="w-8 h-8 text-orange-500" />
                    <div>
                        <h2 className="text-3xl font-black font-mono uppercase tracking-widest text-white">Admin Panel</h2>
                        <p className="text-[#555] font-mono text-xs tracking-widest mt-0.5">System Overview</p>
                    </div>
                </div>
                <button onClick={fetchAll} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111] border border-[#222] text-gray-400 hover:text-white text-sm transition-all">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Total Devices', value: devices.length, color: '#f97316', icon: <Cpu className="w-5 h-5" /> },
                    { label: 'Online Now', value: onlineDevices, color: '#22c55e', icon: <Wifi className="w-5 h-5" /> },
                    { label: 'Total Users', value: users.length, color: '#3b82f6', icon: <Users className="w-5 h-5" /> },
                    { label: 'Pending Approval', value: pendingUsers, color: '#eab308', icon: <Shield className="w-5 h-5" /> },
                ].map(stat => (
                    <div key={stat.label} className="bg-[#0A0A0A] border border-[#1a1a1a] rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-2" style={{ color: stat.color }}>{stat.icon}</div>
                        <div className="text-3xl font-black font-mono" style={{ color: stat.color }}>{stat.value}</div>
                        <div className="text-[#444] font-mono text-xs uppercase tracking-widest mt-1">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl mb-6 w-fit">
                {[{ key: 'devices', label: `Devices (${devices.length})` }, { key: 'users', label: `Users (${users.length})` }].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-5 py-2 rounded-lg font-mono font-bold text-sm transition-all ${tab === t.key ? 'bg-orange-500 text-black' : 'text-[#555] hover:text-white'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
                </div>
            ) : tab === 'devices' ? (
                <div className="space-y-3">
                    {devices.map((device, i) => (
                        <motion.div key={device._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                            className="bg-[#0A0A0A] border border-[#1a1a1a] hover:border-orange-500/20 rounded-xl p-4 flex items-center gap-4 transition-all">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${device.isConnected ? 'bg-green-500/10 border border-green-500/30' : 'bg-[#111] border border-[#222]'}`}>
                                {device.isConnected ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-[#333]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-white font-mono font-bold text-sm truncate">{device.name}</h3>
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${device.isConnected ? 'text-green-500 bg-green-500/10 border border-green-500/20' : 'text-[#444] bg-[#111] border border-[#222]'}`}>
                                        {device.isConnected ? 'ONLINE' : 'OFFLINE'}
                                    </span>
                                </div>
                                <p className="text-[#444] font-mono text-xs mt-0.5">
                                    {device.deviceId} · Owner: <span className="text-orange-500/70">{device.owner?.username || 'unknown'}</span> · {device.pins?.length || 0} pins
                                </p>
                            </div>
                            <a href={`/device/${device.deviceId}`}
                                className="flex items-center gap-1 text-xs text-[#555] hover:text-orange-500 font-mono transition-all">
                                <ExternalLink className="w-3.5 h-3.5" /> View
                            </a>
                        </motion.div>
                    ))}
                    {devices.length === 0 && (
                        <div className="text-center py-16 text-[#333] font-mono uppercase tracking-widest">No devices registered</div>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {users.map((user, i) => (
                        <motion.div key={user._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                            className="bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl p-4 flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${user.role === 'admin' ? 'border-orange-500/30 bg-orange-500/10' : 'border-[#222] bg-[#111]'}`}>
                                {user.role === 'admin'
                                    ? <Shield className="w-5 h-5 text-orange-500" />
                                    : <Users className="w-5 h-5 text-[#444]" />}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-white font-mono font-bold text-sm">{user.username}</h3>
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-widest ${user.role === 'admin' ? 'text-orange-500 bg-orange-500/10 border border-orange-500/20' : 'text-blue-400 bg-blue-500/10 border border-blue-500/20'}`}>
                                        {user.role}
                                    </span>
                                    {!user.isApproved && (
                                        <span className="text-[10px] px-2 py-0.5 rounded font-mono text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 uppercase tracking-widest">
                                            Pending
                                        </span>
                                    )}
                                </div>
                                <p className="text-[#444] font-mono text-xs mt-0.5">
                                    {user.isApproved ? '✓ Approved' : '⏳ Awaiting approval'} · {devices.filter(d => d.owner?._id === user._id || d.owner?.toString() === user._id).length} devices
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {!user.isApproved && (
                                    <button onClick={() => approveUser(user._id)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-xs font-bold hover:bg-green-500 hover:text-black transition-all">
                                        <Check className="w-3.5 h-3.5" /> Approve
                                    </button>
                                )}
                                {user.role !== 'admin' && (
                                    <button onClick={() => deleteUser(user._id)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500 hover:text-white transition-all">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                    {users.length === 0 && (
                        <div className="text-center py-16 text-[#333] font-mono uppercase tracking-widest">No users found</div>
                    )}
                </div>
            )}
        </div>
    );
}
