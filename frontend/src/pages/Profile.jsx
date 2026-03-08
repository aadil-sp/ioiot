import { useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { User, Lock, Zap, Palette, Save, Check, Eye, EyeOff, FlaskConical, Cpu, Shield, Bell, Globe } from 'lucide-react';
import { ThemeContext } from '../App';

const API = import.meta.env.VITE_API_URL || '';

const AVATAR_COLORS = [
    '#f97316', '#22c55e', '#3b82f6', '#ef4444', '#eab308',
    '#a855f7', '#06b6d4', '#ec4899', '#10b981', '#f43f5e'
];

const ACCENT_COLORS = [
    { name: 'Orange', value: '#f97316' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Violet', value: '#a855f7' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Red', value: '#ef4444' },
];

export default function Profile() {
    const { dark, toggle } = useContext(ThemeContext);
    const username = localStorage.getItem('username') || '';
    const role = localStorage.getItem('role') || 'user';

    const [displayName, setDisplayName] = useState(
        () => localStorage.getItem('displayName') || username
    );
    const [bio, setBio] = useState(() => localStorage.getItem('bio') || '');
    const [avatarColor, setAvatarColor] = useState(
        () => localStorage.getItem('avatarColor') || '#f97316'
    );
    const [betaMode, setBetaMode] = useState(
        () => localStorage.getItem('betaMode') === 'true'
    );
    const [notifications, setNotifications] = useState(
        () => localStorage.getItem('notifications') !== 'false'
    );

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [pwSaving, setPwSaving] = useState(false);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwError, setPwError] = useState('');
    const [profileSaved, setProfileSaved] = useState(false);

    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    const card = dark ? 'bg-[#0A0A0A] border-[#1a1a1a]' : 'bg-white border-gray-200';
    const inputCls = dark
        ? 'bg-black border-[#333] focus:border-orange-500 text-white'
        : 'bg-gray-50 border-gray-300 focus:border-orange-400 text-gray-900';
    const mutedText = dark ? 'text-[#999]' : 'text-gray-400';
    const labelCls = `block text-[10px] font-mono uppercase tracking-widest mb-1.5 ${mutedText}`;

    const saveProfile = () => {
        localStorage.setItem('displayName', displayName);
        localStorage.setItem('bio', bio);
        localStorage.setItem('avatarColor', avatarColor);
        localStorage.setItem('betaMode', betaMode.toString());
        localStorage.setItem('notifications', notifications.toString());
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2500);
    };

    const changePassword = async () => {
        if (!oldPassword || !newPassword) { setPwError('Fill in both fields'); return; }
        if (newPassword.length < 6) { setPwError('Password must be at least 6 characters'); return; }
        setPwSaving(true); setPwError('');
        try {
            await axios.post(`${API}/api/auth/change-password`, { oldPassword, newPassword }, { headers });
            setPwSuccess(true);
            setOldPassword(''); setNewPassword('');
            setTimeout(() => setPwSuccess(false), 3000);
        } catch (err) {
            setPwError(err.response?.data?.error || 'Failed to change password');
        } finally { setPwSaving(false); }
    };

    const initials = (displayName || username).slice(0, 2).toUpperCase();

    return (
        <div className="p-6 md:p-10 max-w-3xl mx-auto">
            {/* Header */}
            <div className="mb-8 flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black font-mono text-white"
                    style={{ backgroundColor: avatarColor }}>
                    {initials}
                </div>
                <div>
                    <h2 className={`text-2xl font-black font-mono uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-900'}`}>
                        {displayName || username}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-mono ${mutedText}`}>@{username}</span>
                        {role === 'admin' && (
                            <span className="text-xs text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded font-mono">ADMIN</span>
                        )}
                        {betaMode && (
                            <span className="text-xs text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-mono flex items-center gap-1">
                                <FlaskConical className="w-3 h-3" /> BETA
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Profile Info */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border p-6 ${card}`}>
                    <div className="flex items-center gap-2 mb-5">
                        <User className="w-4 h-4 text-orange-500" />
                        <h3 className={`font-mono font-bold text-sm uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-800'}`}>Profile</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className={labelCls}>Display Name</label>
                            <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                                placeholder={username}
                                className={`w-full border outline-none rounded-xl px-4 py-2.5 font-mono text-sm transition-colors ${inputCls}`} />
                        </div>
                        <div>
                            <label className={labelCls}>Bio / Notes</label>
                            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={2}
                                placeholder="What are you building?"
                                className={`w-full border outline-none rounded-xl px-4 py-2.5 font-mono text-sm transition-colors resize-none ${inputCls}`} />
                        </div>
                    </div>
                </motion.div>

                {/* Avatar Color */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={`rounded-2xl border p-6 ${card}`}>
                    <div className="flex items-center gap-2 mb-5">
                        <Palette className="w-4 h-4 text-orange-500" />
                        <h3 className={`font-mono font-bold text-sm uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-800'}`}>Avatar Color</h3>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {AVATAR_COLORS.map(c => (
                            <button key={c} onClick={() => setAvatarColor(c)}
                                className="w-10 h-10 rounded-xl transition-all relative"
                                style={{ backgroundColor: c, outline: avatarColor === c ? `3px solid ${c}` : 'none', outlineOffset: '2px' }}>
                                {avatarColor === c && (
                                    <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />
                                )}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Appearance */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`rounded-2xl border p-6 ${card}`}>
                    <div className="flex items-center gap-2 mb-5">
                        <Globe className="w-4 h-4 text-orange-500" />
                        <h3 className={`font-mono font-bold text-sm uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-800'}`}>Appearance</h3>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`font-mono text-sm font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>{dark ? 'Dark Mode' : 'Light Mode'}</p>
                            <p className={`font-mono text-xs mt-0.5 ${mutedText}`}>Toggle between dark and light interface</p>
                        </div>
                        <button onClick={toggle}
                            className={`relative w-12 h-6 rounded-full transition-colors ${dark ? 'bg-orange-500' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${dark ? 'left-6' : 'left-0.5'}`} />
                        </button>
                    </div>
                </motion.div>

                {/* Notifications */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className={`rounded-2xl border p-6 ${card}`}>
                    <div className="flex items-center gap-2 mb-5">
                        <Bell className="w-4 h-4 text-orange-500" />
                        <h3 className={`font-mono font-bold text-sm uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-800'}`}>Preferences</h3>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`font-mono text-sm font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>Device Alerts</p>
                            <p className={`font-mono text-xs mt-0.5 ${mutedText}`}>Show notification when a device goes online/offline</p>
                        </div>
                        <button onClick={() => setNotifications(n => !n)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${notifications ? 'bg-orange-500' : dark ? 'bg-[#222]' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${notifications ? 'left-6' : 'left-0.5'}`} />
                        </button>
                    </div>
                </motion.div>

                {/* Beta / What's New */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className={`rounded-2xl border p-6 ${card}`}>
                    <div className="flex items-center gap-2 mb-4">
                        <FlaskConical className="w-4 h-4 text-purple-400" />
                        <h3 className="font-mono font-bold text-sm uppercase tracking-widest text-purple-400">Beta Updates</h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-400/10 border border-purple-400/20 text-purple-400">Active</span>
                    </div>
                    <div className={`p-4 rounded-xl border border-dashed ${dark ? 'border-[#222]' : 'border-gray-200'} flex items-center gap-3`}>
                        <span className="text-2xl">🧪</span>
                        <div>
                            <p className={`font-mono text-sm font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>No Beta Updates Currently</p>
                            <p className={`font-mono text-xs mt-0.5 ${mutedText}`}>
                                All features are stable. Cloud compile & flash, Web Serial Monitor and OTA are all enabled by default.
                            </p>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {['☁️ Cloud Compile', '🔌 Web Serial Flash', '📟 ESP32 Console', '🛜 OTA Ready'].map(f => (
                            <span key={f} className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300">{f}</span>
                        ))}
                    </div>
                </motion.div>

                {/* Change Password */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`rounded-2xl border p-6 ${card}`}>
                    <div className="flex items-center gap-2 mb-5">
                        <Lock className="w-4 h-4 text-orange-500" />
                        <h3 className={`font-mono font-bold text-sm uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-800'}`}>Change Password</h3>
                    </div>
                    <div className="space-y-3">
                        <div className="relative">
                            <label className={labelCls}>Current Password</label>
                            <input value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                                type={showOld ? 'text' : 'password'} placeholder="••••••••"
                                className={`w-full border outline-none rounded-xl px-4 py-2.5 pr-10 font-mono text-sm transition-colors ${inputCls}`} />
                            <button onClick={() => setShowOld(s => !s)} className={`absolute right-3 top-9 ${mutedText} hover:text-orange-500`}>
                                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="relative">
                            <label className={labelCls}>New Password</label>
                            <input value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                type={showNew ? 'text' : 'password'} placeholder="Min. 6 characters"
                                className={`w-full border outline-none rounded-xl px-4 py-2.5 pr-10 font-mono text-sm transition-colors ${inputCls}`} />
                            <button onClick={() => setShowNew(s => !s)} className={`absolute right-3 top-9 ${mutedText} hover:text-orange-500`}>
                                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {pwError && <p className="text-red-400 font-mono text-xs">{pwError}</p>}
                        {pwSuccess && <p className="text-green-400 font-mono text-xs flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Password changed!</p>}
                        <button onClick={changePassword} disabled={pwSaving}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500 font-bold text-sm hover:bg-orange-500 hover:text-black transition-all disabled:opacity-50">
                            <Lock className="w-4 h-4" /> {pwSaving ? 'Changing...' : 'Change Password'}
                        </button>
                    </div>
                </motion.div>

                {/* Save Button */}
                <div className="flex justify-end">
                    <button onClick={saveProfile}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${profileSaved ? 'bg-green-500 text-black' : 'bg-orange-500 hover:bg-orange-400 text-black'}`}>
                        {profileSaved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Profile</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
