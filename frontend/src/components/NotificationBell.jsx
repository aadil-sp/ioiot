import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Bell, Trash2, BellRing } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

const LEVEL_DOT = { info: 'bg-blue-400', success: 'bg-green-400', warning: 'bg-yellow-400', error: 'bg-red-500' };

function timeAgo(value) {
    const diff = Date.now() - new Date(value).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Alerts from automations: live over the socket, plus a browser notification
// when the user has allowed them.
export default function NotificationBell({ dark, socket }) {
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [permission, setPermission] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
    const boxRef = useRef(null);
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    useEffect(() => {
        axios.get(`${API}/api/notifications`, { headers })
            .then(res => { setItems(res.data.items); setUnread(res.data.unread); })
            .catch(() => { });

        const watch = () => socket.emit('watchUser', { token: localStorage.getItem('token') });
        watch();
        socket.on('connect', watch);
        const onNote = (note) => {
            setItems(prev => [note, ...prev.filter(n => n._id !== note._id)].slice(0, 50));
            setUnread(u => u + 1);
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
                // tag dedupes if the bell is mounted twice (desktop + mobile menu)
                new Notification(note.title, { body: note.message, tag: note._id, icon: '/logo.png' });
            }
        };
        socket.on('notification', onNote);
        return () => { socket.off('connect', watch); socket.off('notification', onNote); };
    }, []);

    useEffect(() => {
        if (!open) return;
        const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next && unread) {
            setUnread(0);
            axios.post(`${API}/api/notifications/read`, {}, { headers }).catch(() => { });
        }
    };

    const clearAll = async () => {
        setItems([]);
        await axios.delete(`${API}/api/notifications`, { headers }).catch(() => { });
    };

    const enableBrowserAlerts = async () => {
        if (typeof Notification === 'undefined') return;
        setPermission(await Notification.requestPermission());
    };

    const muted = dark ? 'text-[#888]' : 'text-gray-500';

    return (
        <div className="relative" ref={boxRef}>
            <button onClick={toggle} title="Notifications"
                className={`relative p-2 rounded-xl border transition-all ${dark ? 'border-[#444] bg-[#2a2a35] text-gray-200 hover:border-orange-500' : 'border-gray-200 text-gray-600 hover:border-orange-400'}`}>
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className={`absolute right-0 sm:right-0 left-0 sm:left-auto mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border shadow-2xl z-[60] overflow-hidden ${dark ? 'bg-[#1a1a24] border-[#3f3f4e]' : 'bg-white border-gray-200'}`}>
                    <div className={`flex items-center justify-between px-4 py-3 border-b ${dark ? 'border-[#2f2f3d]' : 'border-gray-100'}`}>
                        <span className={`font-mono font-black text-xs uppercase tracking-widest ${dark ? 'text-white' : 'text-gray-900'}`}>Alerts</span>
                        {items.length > 0 && (
                            <button onClick={clearAll} className={`flex items-center gap-1 font-mono text-[11px] ${muted} hover:text-red-400`}>
                                <Trash2 className="w-3 h-3" /> Clear
                            </button>
                        )}
                    </div>
                    {permission === 'default' && (
                        <button onClick={enableBrowserAlerts}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-left font-mono text-[11px] text-orange-400 bg-orange-500/10 hover:bg-orange-500/20">
                            <BellRing className="w-3.5 h-3.5 shrink-0" /> Also show alerts as browser notifications
                        </button>
                    )}
                    <div className="max-h-[60vh] overflow-y-auto">
                        {items.length === 0 ? (
                            <p className={`font-mono text-xs text-center px-6 py-10 leading-relaxed ${muted}`}>
                                No alerts yet. Set up automations from a device's Automations tab.
                            </p>
                        ) : items.map(n => (
                            <div key={n._id} className={`px-4 py-3 border-b last:border-0 ${dark ? 'border-[#2f2f3d]' : 'border-gray-100'} ${n.read ? '' : dark ? 'bg-orange-500/5' : 'bg-orange-50'}`}>
                                <div className="flex items-start gap-2.5">
                                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${LEVEL_DOT[n.level] || LEVEL_DOT.info}`} />
                                    <div className="min-w-0 flex-1">
                                        <p className={`font-mono font-bold text-xs break-words ${dark ? 'text-white' : 'text-gray-900'}`}>{n.title}</p>
                                        {n.message && <p className={`font-mono text-[11px] mt-0.5 break-words leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{n.message}</p>}
                                        <p className={`font-mono text-[10px] mt-1 ${muted}`}>{timeAgo(n.createdAt)}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
