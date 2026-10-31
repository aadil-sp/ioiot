import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Trash2, Play, Pencil, Bell, Zap, Clock, WifiOff, Wifi, Activity, X, Check } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OPS = ['>', '<', '>=', '<=', '==', '!='];

const TRIGGERS = [
    { type: 'value', label: 'Pin value', icon: Activity },
    { type: 'offline', label: 'Goes offline', icon: WifiOff },
    { type: 'online', label: 'Comes online', icon: Wifi },
    { type: 'schedule', label: 'Schedule', icon: Clock },
];

const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function blankRule(pins) {
    const sensor = pins.find(p => p.mode !== 'OUTPUT') || pins[0];
    return {
        name: '',
        enabled: true,
        trigger: { type: 'value', key: sensor?.widgetKey || '', op: '>', value: 0, forSeconds: 0, forMinutes: 5, time: '07:00', days: [0, 1, 2, 3, 4, 5, 6], timeZone: userTimeZone() },
        actions: [{ type: 'notify', message: '' }],
        cooldownMinutes: 5,
    };
}

const isOnOff = (pin) => pin?.type === 'digital';

function formatPinValue(pin, value) {
    if (isOnOff(pin)) return value === true || value === 1 ? 'ON' : 'OFF';
    return String(value);
}

function describeTrigger(t, pins) {
    const pin = pins.find(p => p.widgetKey === t.key);
    switch (t.type) {
        case 'value': return `${pin?.label || t.key} ${t.op} ${t.value}${t.forSeconds ? ` for ${t.forSeconds}s` : ''}`;
        case 'offline': return `Device offline for ${t.forMinutes} min`;
        case 'online': return 'Device comes online';
        case 'schedule': {
            const days = t.days.length === 7 ? 'every day' : t.days.map(d => DAYS[d]).join(', ');
            return `At ${t.time} ${days}`;
        }
        default: return '';
    }
}

function describeAction(a, pins) {
    if (a.type === 'notify') return 'Notify me';
    const pin = pins.find(p => p.widgetKey === a.key);
    return `Set ${pin?.label || a.key} → ${formatPinValue(pin, a.value)}`;
}

function RuleEditor({ initial, pins, dark, onCancel, onSave }) {
    const [rule, setRule] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const outputs = pins.filter(p => p.mode === 'OUTPUT');
    const t = rule.trigger;

    const setTrigger = (patch) => setRule(r => ({ ...r, trigger: { ...r.trigger, ...patch } }));
    const setAction = (i, patch) => setRule(r => ({ ...r, actions: r.actions.map((a, j) => j === i ? { ...a, ...patch } : a) }));
    const removeAction = (i) => setRule(r => ({ ...r, actions: r.actions.filter((_, j) => j !== i) }));
    const addAction = (type) => setRule(r => ({
        ...r,
        actions: [...r.actions, type === 'notify' ? { type, message: '' } : { type, key: outputs[0]?.widgetKey, value: isOnOff(outputs[0]) ? true : 0 }]
    }));

    const save = async () => {
        setSaving(true); setError('');
        try { await onSave({ ...rule, name: rule.name.trim() || describeTrigger(t, pins) }); }
        catch (err) { setError(err.response?.data?.error || 'Could not save'); setSaving(false); }
    };

    const input = `w-full rounded-xl px-3 py-2.5 font-mono text-sm outline-none border focus:border-orange-500 ${dark ? 'bg-[#16161f] border-[#3f3f4e] text-white' : 'bg-white border-gray-200 text-gray-900'}`;
    const label = `block text-[10px] font-mono uppercase tracking-widest mb-1.5 ${dark ? 'text-[#999]' : 'text-gray-500'}`;
    const chip = (on) => `flex items-center gap-1.5 px-3 py-2 rounded-xl border font-mono text-xs font-bold transition-all ${on ? 'border-orange-500 bg-orange-500/10 text-orange-400' : dark ? 'border-[#3f3f4e] text-[#999] hover:border-[#555]' : 'border-gray-200 text-gray-500'}`;

    return (
        <div className={`rounded-2xl border p-4 sm:p-5 space-y-5 ${dark ? 'bg-[#1e1e2d] border-orange-500/40' : 'bg-white border-orange-300'}`}>
            <div>
                <label className={label}>Name</label>
                <input className={input} value={rule.name} maxLength={60} placeholder="e.g. Too hot alert"
                    onChange={e => setRule(r => ({ ...r, name: e.target.value }))} />
            </div>

            <div>
                <label className={label}>When</label>
                <div className="flex flex-wrap gap-2 mb-3">
                    {TRIGGERS.map(({ type, label: l, icon: Icon }) => (
                        <button key={type} onClick={() => setTrigger({ type })} className={chip(t.type === type)}>
                            <Icon className="w-3.5 h-3.5" /> {l}
                        </button>
                    ))}
                </div>

                {t.type === 'value' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <select className={`${input} col-span-2 sm:col-span-1`} value={t.key} onChange={e => setTrigger({ key: e.target.value })}>
                            {pins.map(p => <option key={p.widgetKey} value={p.widgetKey}>{p.label}</option>)}
                        </select>
                        <select className={input} value={t.op} onChange={e => setTrigger({ op: e.target.value })}>
                            {OPS.map(op => <option key={op} value={op}>{op}</option>)}
                        </select>
                        <input className={input} type="number" value={t.value} onChange={e => setTrigger({ value: e.target.value })} />
                        <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                            <input className={input} type="number" min="0" value={t.forSeconds} onChange={e => setTrigger({ forSeconds: e.target.value })} />
                            <span className={`font-mono text-xs shrink-0 ${dark ? 'text-[#999]' : 'text-gray-500'}`}>sec hold</span>
                        </div>
                        {isOnOff(pins.find(p => p.widgetKey === t.key)) && (
                            <p className={`col-span-full font-mono text-[11px] ${dark ? 'text-[#888]' : 'text-gray-500'}`}>On/off pins use 1 for ON and 0 for OFF.</p>
                        )}
                    </div>
                )}
                {t.type === 'offline' && (
                    <div className="flex items-center gap-2 max-w-xs">
                        <span className={`font-mono text-xs shrink-0 ${dark ? 'text-[#999]' : 'text-gray-500'}`}>for</span>
                        <input className={input} type="number" min="1" value={t.forMinutes} onChange={e => setTrigger({ forMinutes: e.target.value })} />
                        <span className={`font-mono text-xs shrink-0 ${dark ? 'text-[#999]' : 'text-gray-500'}`}>minutes</span>
                    </div>
                )}
                {t.type === 'schedule' && (
                    <div className="space-y-2">
                        <input className={`${input} max-w-[10rem]`} type="time" value={t.time} onChange={e => setTrigger({ time: e.target.value })} />
                        <div className="flex flex-wrap gap-1.5">
                            {DAYS.map((d, i) => (
                                <button key={d} className={chip(t.days.includes(i))}
                                    onClick={() => setTrigger({ days: t.days.includes(i) ? t.days.filter(x => x !== i) : [...t.days, i].sort() })}>
                                    {d}
                                </button>
                            ))}
                        </div>
                        <p className={`font-mono text-[11px] ${dark ? 'text-[#888]' : 'text-gray-500'}`}>Time zone: {t.timeZone}</p>
                    </div>
                )}
            </div>

            <div>
                <label className={label}>Then</label>
                <div className="space-y-2">
                    {rule.actions.map((a, i) => {
                        const pin = pins.find(p => p.widgetKey === a.key);
                        return (
                            <div key={i} className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 rounded-xl border ${dark ? 'border-[#3f3f4e]' : 'border-gray-200'}`}>
                                {a.type === 'notify' ? (
                                    <>
                                        <Bell className="w-4 h-4 text-orange-400 shrink-0 ml-1" />
                                        <input className={input} value={a.message} maxLength={200} placeholder="Notify me (optional custom message)"
                                            onChange={e => setAction(i, { message: e.target.value })} />
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4 text-orange-400 shrink-0 ml-1" />
                                        <select className={input} value={a.key} onChange={e => {
                                            const next = outputs.find(p => p.widgetKey === e.target.value);
                                            setAction(i, { key: e.target.value, value: isOnOff(next) ? true : 0 });
                                        }}>
                                            {outputs.map(p => <option key={p.widgetKey} value={p.widgetKey}>{p.label}</option>)}
                                        </select>
                                        {isOnOff(pin) ? (
                                            <select className={`${input} sm:max-w-[7rem]`} value={a.value ? 'on' : 'off'} onChange={e => setAction(i, { value: e.target.value === 'on' })}>
                                                <option value="on">ON</option>
                                                <option value="off">OFF</option>
                                            </select>
                                        ) : (
                                            <input className={`${input} sm:max-w-[7rem]`} type="number" min={pin?.min} max={pin?.max} value={a.value}
                                                onChange={e => setAction(i, { value: Number(e.target.value) })} />
                                        )}
                                    </>
                                )}
                                <button onClick={() => removeAction(i)} className="p-2 text-red-400 hover:text-red-300 shrink-0" title="Remove">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={() => addAction('notify')} className={chip(false)}><Bell className="w-3.5 h-3.5" /> Add notification</button>
                    {outputs.length > 0 && (
                        <button onClick={() => addAction('set')} className={chip(false)}><Zap className="w-3.5 h-3.5" /> Add pin control</button>
                    )}
                </div>
            </div>

            {t.type !== 'schedule' && (
                <div className="flex items-center gap-2 max-w-sm">
                    <span className={`font-mono text-xs shrink-0 ${dark ? 'text-[#999]' : 'text-gray-500'}`}>Wait at least</span>
                    <input className={input} type="number" min="0" value={rule.cooldownMinutes}
                        onChange={e => setRule(r => ({ ...r, cooldownMinutes: e.target.value }))} />
                    <span className={`font-mono text-xs shrink-0 ${dark ? 'text-[#999]' : 'text-gray-500'}`}>min between runs</span>
                </div>
            )}

            {error && <p className="text-red-400 font-mono text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
                <button onClick={onCancel} className={`px-4 py-2.5 rounded-xl border font-mono text-sm font-bold ${dark ? 'border-[#3f3f4e] text-gray-300' : 'border-gray-200 text-gray-600'}`}>Cancel</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 disabled:opacity-50">
                    <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    );
}

export default function AutomationsPanel({ device, dark }) {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // null | 'new' | rule._id
    const [draft, setDraft] = useState(null);
    const [flash, setFlash] = useState('');
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const base = `${API}/api/devices/${device.deviceId}/rules`;
    const pins = device.pins || [];

    const load = useCallback(async () => {
        try { setRules((await axios.get(base, { headers })).data); }
        catch { }
        finally { setLoading(false); }
    }, [base]);

    useEffect(() => { load(); }, [load]);

    const startNew = (preset) => {
        const rule = blankRule(pins);
        if (preset === 'offline') Object.assign(rule, { name: 'Device offline alert', trigger: { ...rule.trigger, type: 'offline', forMinutes: 5 } });
        if (preset === 'online') Object.assign(rule, { name: 'Back online', trigger: { ...rule.trigger, type: 'online' } });
        setDraft(rule);
        setEditing('new');
    };

    const save = async (rule) => {
        if (editing === 'new') await axios.post(base, rule, { headers });
        else await axios.put(`${base}/${editing}`, rule, { headers });
        setEditing(null);
        await load();
    };

    const toggle = async (rule) => {
        setRules(rs => rs.map(r => r._id === rule._id ? { ...r, enabled: !r.enabled } : r));
        await axios.put(`${base}/${rule._id}`, { enabled: !rule.enabled }, { headers }).catch(load);
    };

    const remove = async (rule) => {
        if (!confirm(`Delete "${rule.name}"?`)) return;
        await axios.delete(`${base}/${rule._id}`, { headers });
        setRules(rs => rs.filter(r => r._id !== rule._id));
    };

    const test = async (rule) => {
        await axios.post(`${base}/${rule._id}/test`, {}, { headers });
        setFlash(rule._id);
        setTimeout(() => setFlash(''), 2000);
    };

    const muted = dark ? 'text-[#888]' : 'text-gray-500';
    const card = dark ? 'bg-[#1e1e2d] border-[#3f3f4e]' : 'bg-white border-gray-200';

    if (!pins.length) {
        return <p className={`font-mono text-sm text-center py-16 ${muted}`}>Add pins in Pin Config first, then create automations for them.</p>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className={`font-mono text-xs leading-relaxed max-w-lg ${muted}`}>
                    Get alerts and control pins automatically. Automations run on the server, so they work even when this page is closed.
                </p>
                {!editing && (
                    <button onClick={() => startNew()} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400">
                        <Plus className="w-4 h-4" /> New automation
                    </button>
                )}
            </div>

            {editing && (
                <RuleEditor key={editing} initial={draft} pins={pins} dark={dark} onCancel={() => setEditing(null)} onSave={save} />
            )}

            {loading ? (
                <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" /></div>
            ) : rules.length === 0 && !editing ? (
                <div className={`rounded-2xl border border-dashed p-6 text-center ${dark ? 'border-[#3f3f4e]' : 'border-gray-300'}`}>
                    <p className={`font-mono font-bold text-sm mb-3 ${dark ? 'text-white' : 'text-gray-900'}`}>No automations yet. Start from one:</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        <button onClick={() => startNew('offline')} className={`px-3 py-2 rounded-xl border font-mono text-xs font-bold ${card}`}>📴 Alert me if it goes offline</button>
                        <button onClick={() => startNew()} className={`px-3 py-2 rounded-xl border font-mono text-xs font-bold ${card}`}>🌡 Alert on a sensor value</button>
                        <button onClick={() => startNew('online')} className={`px-3 py-2 rounded-xl border font-mono text-xs font-bold ${card}`}>✅ Tell me when it's back online</button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map(rule => (
                        <div key={rule._id} className={`rounded-2xl border p-4 flex flex-wrap sm:flex-nowrap items-center gap-3 ${card} ${rule.enabled ? '' : 'opacity-60'}`}>
                            <button onClick={() => toggle(rule)} title={rule.enabled ? 'Pause' : 'Enable'}
                                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${rule.enabled ? 'bg-orange-500' : dark ? 'bg-[#333]' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${rule.enabled ? 'left-5' : 'left-0.5'}`} />
                            </button>
                            <div className="flex-1 min-w-0">
                                <h4 className={`font-mono font-black text-sm break-words ${dark ? 'text-white' : 'text-gray-900'}`}>{rule.name}</h4>
                                <p className={`font-mono text-xs mt-0.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    When {describeTrigger(rule.trigger, pins)} → {rule.actions.map(a => describeAction(a, pins)).join(', ')}
                                </p>
                                <p className={`font-mono text-[11px] mt-0.5 ${muted}`}>
                                    {rule.lastFiredAt ? `Last ran ${new Date(rule.lastFiredAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Has not run yet'}
                                </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0 ml-auto">
                                <button onClick={() => test(rule)} title="Run actions now"
                                    className={`flex items-center gap-1 px-3 py-2 rounded-lg border font-mono text-xs font-bold ${flash === rule._id ? 'border-green-500 text-green-400' : dark ? 'border-[#3f3f4e] text-gray-300 hover:border-orange-500' : 'border-gray-200 text-gray-600'}`}>
                                    {flash === rule._id ? <Check className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />} Test
                                </button>
                                <button onClick={() => { setDraft({ ...blankRule(pins), ...rule, trigger: { ...blankRule(pins).trigger, ...rule.trigger } }); setEditing(rule._id); }}
                                    className={`p-2 rounded-lg border ${dark ? 'border-[#3f3f4e] text-gray-300 hover:border-orange-500' : 'border-gray-200 text-gray-600'}`} title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => remove(rule)} className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10" title="Delete">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
