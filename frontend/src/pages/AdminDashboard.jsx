import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Wifi, WifiOff, Check, X, Trash2, Shield, Cpu, RefreshCw,
    ExternalLink, Plus, Eye, EyeOff, Bell, Globe, Radio, UserPlus, Lock, Send, UserRound, Smartphone, Monitor
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const socket = io(API);

const DAY = 24 * 60 * 60 * 1000;

function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(value) {
    if (!value) return 'never';
    const diff = Date.now() - new Date(value).getTime();
    if (diff < 60 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < DAY) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
    return formatDate(value);
}

function formatTime(value) {
    return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(ms) {
    const mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

const END_REASONS = { closed: 'closed browser', logout: 'ended session', timeout: 'went idle' };

const within = (value, ms) => value && Date.now() - new Date(value).getTime() < ms;

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [tab, setTab] = useState('devices'); // 'devices' | 'users' | 'guests' | 'notify'
    const [guests, setGuests] = useState([]);
    const [userSort, setUserSort] = useState('joined'); // 'joined' | 'active'
    const [devices, setDevices] = useState([]);
    const [users, setUsers] = useState([]);
    const [autoApprove, setAutoApprove] = useState(false);
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
        const watch = () => socket.emit('watchAdmin', { token: localStorage.getItem('token') });
        watch();
        socket.on('connect', watch);
        socket.on('deviceLiveUpdate', ({ deviceId, isLive }) => {
            setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, isLive } : d));
        });
        return () => {
            socket.off('deviceLiveUpdate');
            socket.off('connect', watch);
        };
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [devRes, usrRes, setRes, guestRes] = await Promise.all([
                axios.get(`${API}/api/admin/devices`, { headers }),
                axios.get(`${API}/api/admin/users`, { headers }),
                axios.get(`${API}/api/admin/settings`, { headers }),
                axios.get(`${API}/api/admin/guests`, { headers }).catch(() => ({ data: [] })),
            ]);
            setDevices(devRes.data);
            setUsers(usrRes.data);
            setGuests(guestRes.data);
            const aaSetting = setRes.data.find(s => s.key === 'autoApprove');
            if (aaSetting) setAutoApprove(aaSetting.value);
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

    const toggleAutoApprove = async () => {
        const newValue = !autoApprove;
        setAutoApprove(newValue);
        try {
            await axios.put(`${API}/api/admin/settings`, { key: 'autoApprove', value: newValue }, { headers });
        } catch (err) {
            console.error('Failed to update setting', err);
            setAutoApprove(!newValue); // revert
        }
    };

    const toggleLive = async (deviceId) => {
        const device = devices.find(d => d.deviceId === deviceId);
        if (!device) return;
        const newLiveState = !device.isLive;

        setLiveLoading(prev => ({ ...prev, [deviceId]: true }));
        // Optimistic update
        setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, isLive: newLiveState } : d));

        try {
            // Primary: use the dedicated /live toggle endpoint
            try {
                const res = await axios.post(`${API}/api/devices/${deviceId}/live`, {}, { headers });
                setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, isLive: res.data.isLive } : d));
            } catch (primaryErr) {
                if (primaryErr.response?.status === 404) {
                    // Fallback: use the universal PUT endpoint (works on all backend versions)
                    const res = await axios.put(`${API}/api/devices/${deviceId}`, { isLive: newLiveState }, { headers });
                    setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, isLive: res.data.isLive ?? newLiveState } : d));
                } else {
                    throw primaryErr;
                }
            }
        } catch (err) {
            console.error('toggleLive error:', err);
            const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Unknown error';
            alert(`Failed to toggle Live/Public: ${errMsg}`);
            // Revert optimistic update on error
            setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, isLive: device.isLive } : d));
        } finally {
            setLiveLoading(prev => ({ ...prev, [deviceId]: false }));
        }
    };

    const createUser = async () => {
        if (!newUsername.trim() || !newPassword) { setCreateUserError('All fields required'); return; }
        setCreatingUser(true); setCreateUserError('');
        try {
            const res = await axios.post(`${API}/api/admin/users/create`, { username: newUsername, password: newPassword, role: newRole }, { headers });
            setUsers(prev => [res.data.user, ...prev]);
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

    const devicesByOwner = devices.reduce((acc, d) => {
        const ownerId = d.owner?._id || d.owner;
        if (ownerId) acc[ownerId] = (acc[ownerId] || 0) + 1;
        return acc;
    }, {});

    const usage = [
        { label: 'Joined today', value: users.filter(u => within(u.joinedAt, DAY)).length },
        { label: 'Joined 7d', value: users.filter(u => within(u.joinedAt, 7 * DAY)).length },
        { label: 'Active 24h', value: users.filter(u => within(u.lastSeenAt, DAY)).length },
        { label: 'Active 7d', value: users.filter(u => within(u.lastSeenAt, 7 * DAY)).length },
    ];

    // New sign-ups per day over the last 14 days, oldest first
    const signupDays = Array.from({ length: 14 }, (_, i) => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (13 - i));
        const end = start.getTime() + DAY;
        const count = users.filter(u => {
            const t = new Date(u.joinedAt).getTime();
            return t >= start.getTime() && t < end;
        }).length;
        return { date: start, count };
    });
    const maxSignups = Math.max(1, ...signupDays.map(d => d.count));

    const sortedUsers = [...users].sort((a, b) => {
        const key = userSort === 'active' ? 'lastSeenAt' : 'joinedAt';
        return new Date(b[key] || 0) - new Date(a[key] || 0);
    });

    const TABS = [
        { key: 'devices', label: `Devices (${devices.length})` },
        { key: 'users', label: `Users (${users.length})` },
        { key: 'guests', label: `Guests (${guests.length})` },
        { key: 'notify', label: `Notify`, icon: <Bell className="w-3.5 h-3.5" /> },
    ];

    return (
        <div className="min-h-screen px-4 py-6 sm:p-6 md:p-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <Shield className="w-8 h-8 text-orange-500" />
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black font-mono uppercase tracking-widest text-white">Admin Panel</h1>
                        <p className="text-gray-400 font-mono text-xs tracking-widest mt-0.5">System Overview</p>
                    </div>
                </div>
                <button onClick={fetchAll} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e1e1e] border border-[#333] text-gray-300 hover:text-white text-sm transition-all shadow-md">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                {[
                    { label: 'Total Devices', value: devices.length, color: '#f97316', icon: <Cpu className="w-5 h-5" /> },
                    { label: 'Online Now', value: onlineDevices, color: '#22c55e', icon: <Wifi className="w-5 h-5" /> },
                    { label: 'Public Devices', value: liveDevices, color: '#a855f7', icon: <Radio className="w-5 h-5" /> },
                    { label: 'Pending Approval', value: pendingUsers, color: '#eab308', icon: <Shield className="w-5 h-5" /> },
                ].map(stat => (
                    <div key={stat.label} className="bg-[#1e1e2d] border border-[#3f3f4e] rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/40 hover:border-orange-500/30 transition-all">
                        <div className="flex items-center gap-3 mb-2" style={{ color: stat.color }}>{stat.icon}</div>
                        <div className="text-3xl sm:text-4xl font-black font-mono" style={{ color: stat.color }}>{stat.value}</div>
                        <div className="text-gray-300 font-mono text-[10px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] font-bold mt-2">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 sm:flex gap-1 p-1 bg-[#22222d] border border-[#3f3f4e] rounded-xl mb-6 sm:mb-8 sm:w-fit shadow-inner">
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex items-center justify-center gap-1.5 px-2 sm:px-6 py-2.5 rounded-lg font-mono font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${tab === t.key ? 'bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.4)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
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
                            className={`bg-[#1e1e2d] border rounded-2xl p-4 sm:p-5 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-5 transition-all shadow-xl ${device.isLive ? 'border-purple-500/60 bg-[#242435]' : 'border-[#3f3f4e] hover:border-orange-500/50 hover:bg-[#252535]'}`}>
                            <div className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl flex items-center justify-center ${device.isConnected ? 'bg-green-500/20 border border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-[#2a2a3a] border border-[#444]'}`}>
                                {device.isConnected ? <Wifi className="w-6 h-6 text-green-400" /> : <WifiOff className="w-6 h-6 text-gray-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                    <h3 className="text-white font-mono font-black text-base break-words min-w-0">{device.name}</h3>
                                    <span className={`text-[10px] px-3 py-1 rounded-full font-black font-mono tracking-widest ${device.isConnected ? 'text-green-400 bg-green-500/20 border border-green-500/40' : 'text-gray-300 bg-[#333] border border-[#555]'}`}>
                                        {device.isConnected ? 'ONLINE' : 'OFFLINE'}
                                    </span>
                                    {device.isLive && (
                                        <span className="text-[10px] px-3 py-1 rounded-full font-black font-mono tracking-widest text-purple-400 bg-purple-500/20 border border-purple-500/40 flex items-center gap-1">
                                            <Radio className="w-3 h-3" /> PUBLIC
                                        </span>
                                    )}
                                </div>
                                <p className="text-gray-300 font-mono text-xs mt-2 font-bold opacity-80 break-all">
                                    {device.deviceId} · Owner: <span className="text-orange-400">{device.owner?.username || 'unknown'}</span> · {device.pins?.length || 0} pins
                                </p>
                            </div>

                            {/* Actions: own row on phones */}
                            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-3 sm:pt-0 border-t border-[#3f3f4e] sm:border-0">
                            {/* Public Toggle */}
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-mono text-[#aaa]">PUBLIC</span>
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
                                className="flex items-center gap-2 text-xs text-orange-400 hover:text-white bg-orange-400/10 border border-orange-400/30 rounded-lg px-4 py-2 font-black font-mono transition-all shrink-0">
                                <ExternalLink className="w-3.5 h-3.5" /> View
                            </button>
                            </div>
                        </motion.div>
                    ))}
                    {devices.length === 0 && (
                        <div className="text-center py-20 text-gray-300 font-mono uppercase tracking-[0.3em] font-black opacity-40">No devices registered</div>
                    )}
                </div>
            ) : tab === 'users' ? (
                <div className="space-y-4">
                    {/* Header actions */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={toggleAutoApprove}
                                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${autoApprove ? 'bg-orange-500' : 'bg-[#333]'}`}
                            >
                                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${autoApprove ? 'left-6.5' : 'left-0.5'}`} />
                            </button>
                            <div>
                                <h3 className="text-white font-mono font-bold text-sm">Auto-Approve Users</h3>
                                <p className="text-[#888] font-mono text-xs">New registrations will be instantly approved</p>
                            </div>
                        </div>

                        <button onClick={() => setShowCreateUser(true)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-all shadow-[0_0_20px_#f9731655]">
                            <UserPlus className="w-4 h-4" /> Create User
                        </button>
                    </div>

                    {/* Usage & traffic */}
                    <div className="bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                            {usage.map(u => (
                                <div key={u.label} className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2.5">
                                    <div className="text-2xl font-black font-mono text-white">{u.value}</div>
                                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#888] mt-0.5">{u.label}</div>
                                </div>
                            ))}
                        </div>
                        <h4 className="text-[10px] font-mono uppercase tracking-widest text-[#888] mb-2">Sign-ups, last 14 days</h4>
                        <div className="flex items-end gap-1 h-20">
                            {signupDays.map(d => (
                                <div key={d.date.toISOString()} className="flex-1 flex flex-col items-center justify-end h-full"
                                    title={`${formatDate(d.date)}: ${d.count} new`}>
                                    {d.count > 0 && <span className="text-[9px] font-mono text-orange-400 mb-0.5">{d.count}</span>}
                                    <div className="w-full rounded-sm bg-orange-500/80"
                                        style={{ height: `${(d.count / maxSignups) * 100}%`, minHeight: d.count ? 3 : 1, opacity: d.count ? 1 : 0.25 }} />
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between text-[9px] font-mono text-[#666] mt-1">
                            <span>{formatDate(signupDays[0].date)}</span><span>Today</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-[#888]">Sort by</span>
                        <div className="flex gap-1 p-1 bg-[#181818] border border-[#2a2a2a] rounded-lg">
                            {[{ key: 'joined', label: 'Newest' }, { key: 'active', label: 'Last active' }].map(o => (
                                <button key={o.key} onClick={() => setUserSort(o.key)}
                                    className={`px-3 py-1.5 rounded-md font-mono text-xs font-bold transition-all ${userSort === o.key ? 'bg-orange-500 text-black' : 'text-[#888] hover:text-white'}`}>
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {sortedUsers.map((user, i) => (
                        <motion.div key={user._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.03 }}
                            className="bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl p-3 sm:p-4 flex items-start sm:items-center gap-3 sm:gap-4">
                            <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border ${user.role === 'admin' ? 'border-orange-500/30 bg-orange-500/10' : 'border-[#2a2a2a] bg-[#181818]'}`}>
                                {user.role === 'admin' ? <Shield className="w-5 h-5 text-orange-500" /> : <Users className="w-5 h-5 text-[#777]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-white font-mono font-bold text-sm break-all min-w-0">{user.username}</h3>
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-widest ${user.role === 'admin' ? 'text-orange-500 bg-orange-500/10 border border-orange-500/20' : 'text-blue-400 bg-blue-500/10 border border-blue-500/20'}`}>
                                        {user.role}
                                    </span>
                                    {!user.isApproved && (
                                        <span className="text-[10px] px-2 py-0.5 rounded font-mono text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 uppercase tracking-widest">
                                            Pending
                                        </span>
                                    )}
                                </div>
                                <p className="text-[#888] font-mono text-xs mt-0.5">
                                    {user.isApproved ? '✓ Approved' : '⏳ Awaiting approval'} · {devicesByOwner[user._id] || 0} devices
                                </p>
                                <p className="text-[#777] font-mono text-[11px] mt-1 leading-relaxed">
                                    Joined {formatDate(user.joinedAt)} · {user.lastSeenAt ? `Active ${timeAgo(user.lastSeenAt)}` : 'Never active'} · {user.loginCount || 0} {user.loginCount === 1 ? 'login' : 'logins'}
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                                {!user.isApproved && (
                                    <button onClick={() => approveUser(user._id)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-xs font-bold hover:bg-green-500 hover:text-black transition-all">
                                        <Check className="w-3.5 h-3.5" /> Approve
                                    </button>
                                )}
                                {user.role !== 'admin' && (
                                    <button onClick={() => deleteUser(user._id)}
                                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500 hover:text-white transition-all">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                    {users.length === 0 && (
                        <div className="text-center py-16 text-[#666] font-mono uppercase tracking-widest">No users found</div>
                    )}
                </div>
            ) : tab === 'guests' ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Here now', value: guests.filter(g => !g.endedAt).length },
                            { label: 'Today', value: guests.filter(g => within(g.startedAt, DAY)).length },
                            { label: 'Last 7d', value: guests.filter(g => within(g.startedAt, 7 * DAY)).length },
                            {
                                label: 'Avg visit', value: (() => {
                                    const ended = guests.filter(g => g.endedAt);
                                    if (!ended.length) return '—';
                                    return formatDuration(ended.reduce((sum, g) => sum + (new Date(g.endedAt) - new Date(g.startedAt)), 0) / ended.length);
                                })()
                            },
                        ].map(u => (
                            <div key={u.label} className="bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2.5">
                                <div className="text-2xl font-black font-mono text-white">{u.value}</div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-[#888] mt-0.5">{u.label}</div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[#777] font-mono text-[11px] leading-relaxed">
                        Guest accounts and their devices are deleted when the visit ends; this log is kept.
                    </p>
                    {guests.map(g => {
                        const live = !g.endedAt;
                        const end = live ? new Date(g.lastSeenAt) : new Date(g.endedAt);
                        return (
                            <div key={g._id} className={`bg-[#0e0e0e] border rounded-xl p-3 sm:p-4 flex items-start gap-3 ${live ? 'border-sky-500/40' : 'border-[#2a2a2a]'}`}>
                                <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border ${live ? 'border-sky-500/40 bg-sky-500/10' : 'border-[#2a2a2a] bg-[#181818]'}`}>
                                    <UserRound className={`w-5 h-5 ${live ? 'text-sky-400' : 'text-[#777]'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-white font-mono font-bold text-sm">{g.name}</h3>
                                        <span className="flex items-center gap-1 text-[10px] font-mono text-[#888]">
                                            {g.device === 'Mobile' ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}{g.device}
                                        </span>
                                        {live && <span className="text-[10px] px-2 py-0.5 rounded font-mono text-sky-400 bg-sky-500/10 border border-sky-500/30 uppercase tracking-widest">Here now</span>}
                                    </div>
                                    <p className="text-[#999] font-mono text-xs mt-1 leading-relaxed">
                                        Came {formatTime(g.startedAt)} · {live ? `on for ${formatDuration(Date.now() - new Date(g.startedAt))}` : `left after ${formatDuration(end - new Date(g.startedAt))}`}
                                    </p>
                                    <p className="text-[#777] font-mono text-[11px] mt-0.5">
                                        {g.devicesCreated || 0} {g.devicesCreated === 1 ? 'device' : 'devices'} created{!live && ` · ${END_REASONS[g.endReason] || 'ended'}`}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    {guests.length === 0 && (
                        <div className="text-center py-16 text-[#666] font-mono uppercase tracking-widest">No guest visits yet</div>
                    )}
                </div>
            ) : (
                /* ── NOTIFICATIONS TAB ── */
                <div className="max-w-2xl space-y-6">
                    <div className="bg-[#0e0e0e] border border-orange-500/30 rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <Bell className="w-5 h-5 text-orange-500" />
                            <h3 className="text-white font-mono font-bold text-sm uppercase tracking-widest">Send Push Notification</h3>
                        </div>
                        <p className="text-[#999] font-mono text-xs mb-5 leading-relaxed">
                            Broadcast a message to ALL currently connected users. Use this for important announcements like update rollouts, maintenance windows, or new features.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Notification Type</label>
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
                                <label className="block text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Title (optional)</label>
                                <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)}
                                    placeholder="e.g. Update Available"
                                    className="w-full bg-black border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-2.5 text-white font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Message *</label>
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
                    <div className="bg-[#0e0e0e] border border-[#2a2a2a] rounded-2xl p-5">
                        <h4 className="text-[#999] font-mono text-xs uppercase tracking-widest mb-3">Quick Templates</h4>
                        <div className="space-y-2">
                            {[
                                { title: 'ESP32 Update', message: '🔄 New update rolled out! Please update your ESP32 code from the device detail page → ESP32 Code tab.', type: 'success' },
                                { title: 'Maintenance', message: '🔧 Brief maintenance scheduled. The platform may be temporarily unavailable.', type: 'warning' },
                                { title: 'New Feature', message: '🚀 New feature available! Check out the latest updates on your dashboard.', type: 'info' },
                            ].map((t, i) => (
                                <button key={i} onClick={() => { setNotifTitle(t.title); setNotifMessage(t.message); setNotifType(t.type); }}
                                    className="w-full text-left p-3 rounded-xl border border-[#2a2a2a] hover:border-orange-500/30 bg-[#181818] transition-all">
                                    <p className="text-white font-mono text-xs font-bold">{t.title}</p>
                                    <p className="text-[#999] font-mono text-xs mt-0.5 leading-relaxed">{t.message}</p>
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
                                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Username</label>
                                    <input value={newUsername} onChange={e => setNewUsername(e.target.value)}
                                        placeholder="username" autoFocus
                                        className="w-full bg-[#111] border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-3 text-white placeholder-[#555] font-mono text-sm" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Password</label>
                                    <div className="relative">
                                        <input value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                            type={showNewPass ? 'text' : 'password'} placeholder="min 6 characters"
                                            className="w-full bg-[#111] border border-[#333] focus:border-orange-500 outline-none rounded-xl px-4 py-3 pr-10 text-white placeholder-[#555] font-mono text-sm" />
                                        <button onClick={() => setShowNewPass(s => !s)}
                                            className="absolute right-3 top-3.5 text-[#555] hover:text-orange-500">
                                            {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Role</label>
                                    <div className="flex gap-2">
                                        {['user', 'admin'].map(r => (
                                            <button key={r} onClick={() => setNewRole(r)}
                                                className={`flex-1 py-2.5 rounded-xl border font-mono font-bold text-sm transition-all ${newRole === r ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-[#333] text-[#888] hover:border-[#444]'}`}>
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
