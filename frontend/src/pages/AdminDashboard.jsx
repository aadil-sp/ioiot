import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Wifi, WifiOff, Check, X, Trash2, Shield, Cpu, RefreshCw,
    ExternalLink, Plus, Eye, EyeOff, Bell, Globe, Radio, UserPlus, Lock, Send
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const socket = io(API);

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [tab, setTab] = useState('devices'); // 'devices' | 'users' | 'notify'
    const [devices, setDevices] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    // Create user state
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('user');
    const [showNewPass, setShowNewPass] = useState(false);
    const [creatingUser, setCreatingUser] = useState(false);
    const [createUserError, setCreateUserError] = useState('');

    // Notification state
    const [notifTitle, setNotifTitle] = useState('');
    const [notifMessage, setNotifMessage] = useState('');
    const [notifType, setNotifType] = useState('info');
    const [sendingNotif, setSendingNotif] = useState(false);
    const [notifSent, setNotifSent] = useState(false);

    // Live toggle loading state per device
    const [liveLoading, setLiveLoading] = useState({});

    useEffect(() => {
        fetchAll();
        socket.on('deviceLiveUpdate', ({ deviceId, isLive }) => {
            setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, isLive } : d));
        });
        return () => socket.off('deviceLiveUpdate');
    }, []);

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

    const toggleLive = async (deviceId) => {
        setLiveLoading(prev => ({ ...prev, [deviceId]: true }));
        try {
            const res = await axios.post(`${API}/api/devices/${deviceId}/live`, {}, { headers });
            setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, isLive: res.data.isLive } : d));
        } catch (err) { console.error(err); }
        finally { setLiveLoading(prev => ({ ...prev, [deviceId]: false })); }
    };

    const createUser = async () => {
        if (!newUsername.trim() || !newPassword) { setCreateUserError('All fields required'); return; }
        setCreatingUser(true); setCreateUserError('');
        try {
            const res = await axios.post(`${API}/api/admin/users/create`, { username: newUsername, password: newPassword, role: newRole }, { headers });
            setUsers(prev => [...prev, res.data.user]);
            setNewUsername(''); setNewPassword(''); setNewRole('user');
            setShowCreateUser(false);
        } catch (err) {
            setCreateUserError(err.response?.data?.error || 'Failed to create user');
        } finally { setCreatingUser(false); }
    };

    const sendNotification = async () => {
        if (!notifMessage.trim()) return;
        setSendingNotif(true);
        try {
            await axios.post(`${API}/api/admin/notify`, { title: notifTitle, message: notifMessage, type: notifType }, { headers });
            setNotifSent(true);
            setNotifTitle(''); setNotifMessage(''); setNotifType('info');
            setTimeout(() => setNotifSent(false), 3000);
        } catch (err) { console.error(err); }
        finally { setSendingNotif(false); }
    };

    const onlineDevices = devices.filter(d => d.isConnected).length;
    const pendingUsers = users.filter(u => !u.isApproved).length;
    const liveDevices = devices.filter(d => d.isLive).length;

    const TABS = [
        { key: 'devices', label: `Devices (${devices.length})` },
        { key: 'users', label: `Users (${users.length})` },
        { key: 'notify', label: `Notify`, icon: <Bell className="w-3.5 h-3.5" /> },
    ];

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
                    { label: 'Public Devices', value: liveDevices, color: '#a855f7', icon: <Radio className="w-5 h-5" /> },
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
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex items-center gap-1.5 px-5 py-2 rounded-lg font-mono font-bold text-sm transition-all ${tab === t.key ? 'bg-orange-500 text-black' : 'text-[#555] hover:text-white'}`}>
                        {t.icon}{t.label}
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
                            className={`bg-[#0A0A0A] border rounded-xl p-4 flex items-center gap-4 transition-all ${device.isLive ? 'border-purple-500/30' : 'border-[#1a1a1a] hover:border-orange-500/20'}`}>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${device.isConnected ? 'bg-green-500/10 border border-green-500/30' : 'bg-[#111] border border-[#222]'}`}>
                                {device.isConnected ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-[#333]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-white font-mono font-bold text-sm truncate">{device.name}</h3>
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${device.isConnected ? 'text-green-500 bg-green-500/10 border border-green-500/20' : 'text-[#444] bg-[#111] border border-[#222]'}`}>
                                        {device.isConnected ? 'ONLINE' : 'OFFLINE'}
                                    </span>
                                    {device.isLive && (
                                        <span className="text-[10px] px-2 py-0.5 rounded font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 flex items-center gap-1">
                                            <Radio className="w-2.5 h-2.5" /> PUBLIC
                                        </span>
                                    )}
                                </div>
                                <p className="text-[#444] font-mono text-xs mt-0.5">
                                    {device.deviceId} · Owner: <span className="text-orange-500/70">{device.owner?.username || 'unknown'}</span> · {device.pins?.length || 0} pins
                                </p>
                            </div>

                            {/* Public Toggle */}
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-mono text-[#444] hidden sm:block">PUBLIC</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleLive(device.deviceId); }}
                                    disabled={!!liveLoading[device.deviceId]}
                                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 cursor-pointer ${device.isLive ? 'bg-purple-500' : 'bg-[#222]'}`}
                                    title={device.isLive ? 'Remove from public view' : 'Make visible to all users'}
                                >
                                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${device.isLive ? 'left-5' : 'left-0.5'}`} />
                                </button>
                            </div>

                            <button onClick={() => navigate(`/device/${device.deviceId}`)}
                                className="flex items-center gap-1 text-xs text-[#555] hover:text-orange-500 font-mono transition-all shrink-0">
                                <ExternalLink className="w-3.5 h-3.5" /> View
                            </button>
                        </motion.div>
                    ))}
                    {devices.length === 0 && (
                        <div className="text-center py-16 text-[#333] font-mono uppercase tracking-widest">No devices registered</div>
                    )}
                </div>
            ) : tab === 'users' ? (
                <div className="space-y-4">
                    {/* Create User Button */}
                    <div className="flex justify-end">
                        <button onClick={() => setShowCreateUser(true)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all shadow-[0_0_20px_#f9731655]">
                            <UserPlus className="w-4 h-4" /> Create User
                        </button>
                    </div>

                    {users.map((user, i) => (
                        <motion.div key={user._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                            className="bg-[#0A0A0A] border border-[#1a1a1a] rounded-xl p-4 flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${user.role === 'admin' ? 'border-orange-500/30 bg-orange-500/10' : 'border-[#222] bg-[#111]'}`}>
                                {user.role === 'admin' ? <Shield className="w-5 h-5 text-orange-500" /> : <Users className="w-5 h-5 text-[#444]" />}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
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
            ) : (
                /* ── NOTIFICATIONS TAB ── */
                <div className="max-w-2xl space-y-6">
                    <div className="bg-[#0A0A0A] border border-orange-500/20 rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <Bell className="w-5 h-5 text-orange-500" />
                            <h3 className="text-white font-mono font-bold text-sm uppercase tracking-widest">Send Push Notification</h3>
                        </div>
                        <p className="text-[#555] font-mono text-xs mb-5 leading-relaxed">
                            Broadcast a message to ALL currently connected users. Use this for important announcements like update rollouts, maintenance windows, or new features.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-mono uppercase tracking-widest text-[#555] mb-1.5">Notification Type</label>
                                <div className="flex gap-2 flex-wrap">
                                    {[
                                        { key: 'info', label: '📣 Info', color: 'border-blue-500/40 text-blue-400 bg-blue-500/10' },
                                        { key: 'success', label: '✅ Update', color: 'border-green-500/40 text-green-400 bg-green-500/10' },
                                        { key: 'warning', label: '⚠ Warning', color: 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10' },
                                        { key: 'error', label: '🚨 Critical', color: 'border-red-500/40 text-red-400 bg-red-500/10' },
                                    ].map(t => (
                                        <button key={t.key} onClick={() => setNotifType(t.key)}
                                            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all ${notifType === t.key ? t.color : 'border-[#222] text-[#555] bg-[#111] hover:border-[#333]'}`}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase tracking-widest text-[#555] mb-1.5">Title (optional)</label>
                                <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)}
                                    placeholder="e.g. Update Available"
                                    className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-2.5 text-white font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase tracking-widest text-[#555] mb-1.5">Message *</label>
                                <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} rows={3}
                                    placeholder="e.g. New update rolled out! Please update your ESP32 code from the device code tab..."
                                    className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-2.5 text-white font-mono text-sm resize-none" />
                            </div>
                            <button onClick={sendNotification} disabled={sendingNotif || !notifMessage.trim()}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 ${notifSent ? 'bg-green-500 text-black' : 'bg-orange-500 text-black hover:bg-orange-400'}`}>
                                {notifSent ? <><Check className="w-4 h-4" /> Sent to all users!</> : <><Send className="w-4 h-4" /> {sendingNotif ? 'Sending...' : 'Broadcast Notification'}</>}
                            </button>
                        </div>
                    </div>

                    {/* Quick Templates */}
                    <div className="bg-[#0A0A0A] border border-[#1a1a1a] rounded-2xl p-5">
                        <h4 className="text-[#555] font-mono text-xs uppercase tracking-widest mb-3">Quick Templates</h4>
                        <div className="space-y-2">
                            {[
                                { title: 'ESP32 Update', message: '🔄 New update rolled out! Please update your ESP32 code from the device detail page → ESP32 Code tab.', type: 'success' },
                                { title: 'Maintenance', message: '🔧 Brief maintenance scheduled. The platform may be temporarily unavailable.', type: 'warning' },
                                { title: 'New Feature', message: '🚀 New feature available! Check out the latest updates on your dashboard.', type: 'info' },
                            ].map((t, i) => (
                                <button key={i} onClick={() => { setNotifTitle(t.title); setNotifMessage(t.message); setNotifType(t.type); }}
                                    className="w-full text-left p-3 rounded-xl border border-[#1a1a1a] hover:border-orange-500/20 bg-[#111] transition-all">
                                    <p className="text-white font-mono text-xs font-bold">{t.title}</p>
                                    <p className="text-[#555] font-mono text-xs mt-0.5 leading-relaxed">{t.message}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Create User Modal */}
            <AnimatePresence>
                {showCreateUser && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setShowCreateUser(false)}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-[#0A0A0A] border border-orange-500/30 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
                            <div className="flex items-center gap-2 mb-6">
                                <UserPlus className="w-5 h-5 text-orange-500" />
                                <h3 className="text-xl font-black font-mono uppercase tracking-widest text-orange-500">Create User</h3>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#555] mb-1.5">Username</label>
                                    <input value={newUsername} onChange={e => setNewUsername(e.target.value)}
                                        placeholder="username" autoFocus
                                        className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-3 text-white font-mono text-sm" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#555] mb-1.5">Password</label>
                                    <div className="relative">
                                        <input value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                            type={showNewPass ? 'text' : 'password'} placeholder="min 6 characters"
                                            className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-3 pr-10 text-white font-mono text-sm" />
                                        <button onClick={() => setShowNewPass(s => !s)}
                                            className="absolute right-3 top-3.5 text-[#555] hover:text-orange-500">
                                            {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#555] mb-1.5">Role</label>
                                    <div className="flex gap-2">
                                        {['user', 'admin'].map(r => (
                                            <button key={r} onClick={() => setNewRole(r)}
                                                className={`flex-1 py-2.5 rounded-xl border font-mono font-bold text-sm transition-all ${newRole === r ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-[#222] text-[#555] hover:border-[#333]'}`}>
                                                {r === 'admin' ? '🛡 Admin' : '👤 User'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {createUserError && <p className="text-red-400 font-mono text-xs">{createUserError}</p>}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => { setShowCreateUser(false); setCreateUserError(''); }}
                                    className="flex-1 py-3 rounded-xl border border-[#333] text-gray-400 hover:text-white transition-all font-mono font-bold text-sm">Cancel</button>
                                <button onClick={createUser} disabled={creatingUser}
                                    className="flex-1 py-3 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all disabled:opacity-50">
                                    {creatingUser ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
