import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
    GripVertical, Settings2, Trash2, Plus, Check, X, RotateCcw,
    ToggleRight, CircleDot, SlidersHorizontal, Hash, Gauge, Lightbulb, LineChart, Type,
    ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

export const WIDGETS = {
    switch: { label: 'Switch', icon: ToggleRight, control: true, w: 1, h: 1 },
    button: { label: 'Push button', icon: CircleDot, control: true, w: 1, h: 1 },
    slider: { label: 'Slider', icon: SlidersHorizontal, control: true, w: 2, h: 1 },
    value: { label: 'Value', icon: Hash, w: 1, h: 1 },
    gauge: { label: 'Gauge', icon: Gauge, w: 1, h: 2 },
    led: { label: 'LED', icon: Lightbulb, w: 1, h: 1 },
    chart: { label: 'Chart', icon: LineChart, w: 2, h: 2 },
    label: { label: 'Label', icon: Type, w: 4, h: 1 },
};

const COLORS = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];

const newId = () => Math.random().toString(36).slice(2, 10);

const pinMax = (pin) => pin.type === 'servo' ? 180 : pin.type === 'analog_input' ? 4095 : pin.type === 'pwm' ? (pin.max || 255) : 1;

// A starting layout built from the device's pins
export function defaultDashboard(pins) {
    const widgets = [];
    for (const pin of pins) {
        const base = { id: newId(), key: pin.widgetKey, title: pin.label, color: pin.color || '#f97316', min: pin.min || 0, max: pinMax(pin), unit: '', range: '1h' };
        if (pin.mode === 'OUTPUT') {
            widgets.push(pin.type === 'pwm' || pin.type === 'servo'
                ? { ...base, type: 'slider', w: 2, h: 1 }
                : { ...base, type: 'switch', w: 1, h: 1 });
        } else if (pin.type === 'analog_input') {
            widgets.push({ ...base, type: 'gauge', w: 1, h: 2 });
            widgets.push({ ...base, id: newId(), type: 'chart', w: 2, h: 2 });
        } else {
            widgets.push({ ...base, type: 'led', w: 1, h: 1, min: 0, max: 1 });
        }
    }
    return widgets;
}

const toNumber = (v) => typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);

function useColumns() {
    const query = '(min-width: 640px)';
    const [wide, setWide] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const on = () => setWide(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return wide ? 4 : 2;
}

// ── Widget bodies ────────────────────────────────────────────────────────────

function SwitchBody({ widget, value, onControl, disabled }) {
    const on = !!toNumber(value);
    return (
        <button disabled={disabled} onClick={() => onControl(widget.key, !on)}
            className="relative w-16 h-9 rounded-full transition-colors disabled:opacity-50"
            style={{ backgroundColor: on ? widget.color : '#3a3a48' }}>
            <span className={`absolute top-1 w-7 h-7 rounded-full bg-white shadow transition-all ${on ? 'left-8' : 'left-1'}`} />
        </button>
    );
}

function ButtonBody({ widget, onControl, disabled }) {
    const [pressed, setPressed] = useState(false);
    const press = (down) => {
        if (disabled || down === pressed) return;
        setPressed(down);
        onControl(widget.key, down);
    };
    return (
        <button disabled={disabled}
            onPointerDown={() => press(true)} onPointerUp={() => press(false)} onPointerLeave={() => press(false)} onPointerCancel={() => press(false)}
            className="w-16 h-16 rounded-full border-4 font-mono font-black text-xs transition-all select-none touch-none disabled:opacity-50"
            style={{ borderColor: widget.color, backgroundColor: pressed ? widget.color : 'transparent', color: pressed ? '#000' : widget.color, transform: pressed ? 'scale(0.94)' : 'none' }}>
            PUSH
        </button>
    );
}

function SliderBody({ widget, value, onControl, disabled }) {
    const [local, setLocal] = useState(toNumber(value) || 0);
    const dragging = useRef(false);
    const timer = useRef(null);
    useEffect(() => { if (!dragging.current) setLocal(toNumber(value) || 0); }, [value]);

    const change = (v) => {
        setLocal(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onControl(widget.key, v), 120);
    };
    return (
        <div className="w-full px-1">
            <div className="font-mono font-black text-2xl mb-2" style={{ color: widget.color }}>{local}{widget.unit && <span className="text-xs ml-1 opacity-70">{widget.unit}</span>}</div>
            <input type="range" min={widget.min} max={widget.max} value={local} disabled={disabled}
                onPointerDown={() => { dragging.current = true; }} onPointerUp={() => { dragging.current = false; }}
                onChange={e => change(Number(e.target.value))}
                className="w-full disabled:opacity-50" style={{ accentColor: widget.color }} />
        </div>
    );
}

function formatValue(v, unit) {
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'ON' : 'OFF';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return `${Number.isInteger(n) ? n : n.toFixed(2)}${unit ? ` ${unit}` : ''}`;
}

function ValueBody({ widget, value }) {
    return <div className="font-mono font-black text-3xl sm:text-4xl break-all text-center" style={{ color: widget.color }}>{formatValue(value, widget.unit)}</div>;
}

function GaugeBody({ widget, value, dark }) {
    const n = toNumber(value);
    const span = widget.max - widget.min || 1;
    const frac = Number.isFinite(n) ? Math.min(1, Math.max(0, (n - widget.min) / span)) : 0;
    // Semicircle from 180° to 0°
    const R = 40, cx = 50, cy = 50;
    const angle = Math.PI * (1 - frac);
    const end = { x: cx + R * Math.cos(angle), y: cy - R * Math.sin(angle) };
    return (
        <div className="w-full max-w-[220px] flex flex-col items-center">
            <svg viewBox="0 0 100 58" className="w-full">
                <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} fill="none" stroke={dark ? '#2f2f3d' : '#e5e7eb'} strokeWidth="9" strokeLinecap="round" />
                {frac > 0 && <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${end.x},${end.y}`} fill="none" stroke={widget.color} strokeWidth="9" strokeLinecap="round" />}
            </svg>
            <div className="font-mono font-black text-2xl -mt-4" style={{ color: widget.color }}>{formatValue(Number.isFinite(n) ? n : undefined, widget.unit)}</div>
            <div className={`w-full flex justify-between font-mono text-[10px] px-1 ${dark ? 'text-[#777]' : 'text-gray-400'}`}><span>{widget.min}</span><span>{widget.max}</span></div>
        </div>
    );
}

function LedBody({ widget, value }) {
    const on = toNumber(value) > 0;
    return (
        <div className="w-12 h-12 rounded-full border-2 transition-all"
            style={{ borderColor: widget.color, backgroundColor: on ? widget.color : 'transparent', boxShadow: on ? `0 0 24px ${widget.color}` : 'none' }} />
    );
}

function ChartBody({ widget, deviceId, value, dark }) {
    const [points, setPoints] = useState([]);
    const load = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/api/devices/${deviceId}/history`, {
                params: { range: widget.range },
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            setPoints(res.data.points.filter(p => p[widget.key] !== undefined).map(p => ({ t: p.t, v: p[widget.key] })));
        } catch { }
    }, [deviceId, widget.key, widget.range]);
    useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

    if (points.length < 2) {
        return <p className={`font-mono text-[11px] text-center ${dark ? 'text-[#777]' : 'text-gray-400'}`}>Not enough history yet</p>;
    }
    const W = 300, H = 100;
    const lo = Math.min(...points.map(p => p.v)), hi = Math.max(...points.map(p => p.v));
    const span = hi - lo || 1;
    const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
    const xy = points.map(p => [((p.t - t0) / (t1 - t0 || 1)) * W, H - ((p.v - lo) / span) * (H - 8) - 4]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('');
    return (
        <div className="w-full h-full flex flex-col">
            <div className="font-mono font-black text-lg" style={{ color: widget.color }}>{formatValue(value, widget.unit)}</div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full flex-1 min-h-0">
                <path d={`${line}L${W},${H}L0,${H}Z`} fill={widget.color} opacity="0.12" />
                <path d={line} fill="none" stroke={widget.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className={`flex justify-between font-mono text-[9px] ${dark ? 'text-[#777]' : 'text-gray-400'}`}>
                <span>{formatValue(lo)}–{formatValue(hi)}</span><span>last {widget.range}</span>
            </div>
        </div>
    );
}

function WidgetBody(props) {
    switch (props.widget.type) {
        case 'switch': return <SwitchBody {...props} />;
        case 'button': return <ButtonBody {...props} />;
        case 'slider': return <SliderBody {...props} />;
        case 'value': return <ValueBody {...props} />;
        case 'gauge': return <GaugeBody {...props} />;
        case 'led': return <LedBody {...props} />;
        case 'chart': return <ChartBody {...props} />;
        default: return null;
    }
}

// ── Widget settings dialog ───────────────────────────────────────────────────

function WidgetSettings({ widget, pins, dark, onSave, onCancel }) {
    const [w, setW] = useState(widget);
    const meta = WIDGETS[w.type];
    const choices = meta.control ? pins.filter(p => p.mode === 'OUTPUT') : pins;
    const set = (patch) => setW(prev => ({ ...prev, ...patch }));
    const pickType = (type) => {
        const m = WIDGETS[type];
        const ok = m.control ? pins.filter(p => p.mode === 'OUTPUT') : pins;
        const key = type === 'label' ? '' : ok.some(p => p.widgetKey === w.key) ? w.key : ok[0]?.widgetKey || '';
        set({ type, key, w: m.w, h: m.h });
    };
    const pickPin = (key) => {
        const pin = pins.find(p => p.widgetKey === key);
        set({ key, title: w.title || pin?.label || '', max: pin ? pinMax(pin) : w.max });
    };

    const input = `w-full rounded-xl px-3 py-2.5 font-mono text-sm outline-none border focus:border-orange-500 ${dark ? 'bg-[#16161f] border-[#3f3f4e] text-white' : 'bg-white border-gray-200 text-gray-900'}`;
    const label = `block text-[10px] font-mono uppercase tracking-widest mb-1.5 ${dark ? 'text-[#999]' : 'text-gray-500'}`;

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onCancel}>
            <div onClick={e => e.stopPropagation()}
                className={`w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border p-5 space-y-4 ${dark ? 'bg-[#1a1a24] border-[#3f3f4e]' : 'bg-white border-gray-200'}`}>
                <h3 className={`font-mono font-black uppercase tracking-widest text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Widget</h3>
                <div className="grid grid-cols-4 gap-2">
                    {Object.entries(WIDGETS).map(([type, m]) => {
                        const Icon = m.icon;
                        const unavailable = m.control && !pins.some(p => p.mode === 'OUTPUT');
                        return (
                            <button key={type} disabled={unavailable} onClick={() => pickType(type)}
                                className={`flex flex-col items-center gap-1 p-2 rounded-xl border font-mono text-[10px] font-bold transition-all disabled:opacity-30 ${w.type === type ? 'border-orange-500 bg-orange-500/10 text-orange-400' : dark ? 'border-[#3f3f4e] text-[#aaa]' : 'border-gray-200 text-gray-500'}`}>
                                <Icon className="w-5 h-5" />{m.label}
                            </button>
                        );
                    })}
                </div>

                {w.type !== 'label' && (
                    <div>
                        <label className={label}>Pin</label>
                        <select className={input} value={w.key} onChange={e => pickPin(e.target.value)}>
                            {choices.map(p => <option key={p.widgetKey} value={p.widgetKey}>{p.label} ({p.mode === 'OUTPUT' ? 'output' : 'input'})</option>)}
                        </select>
                    </div>
                )}
                <div>
                    <label className={label}>{w.type === 'label' ? 'Text' : 'Title'}</label>
                    <input className={input} value={w.title} maxLength={40} onChange={e => set({ title: e.target.value })} />
                </div>
                {['slider', 'gauge'].includes(w.type) && (
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className={label}>Min</label><input className={input} type="number" value={w.min} onChange={e => set({ min: Number(e.target.value) })} /></div>
                        <div><label className={label}>Max</label><input className={input} type="number" value={w.max} onChange={e => set({ max: Number(e.target.value) })} /></div>
                    </div>
                )}
                {['slider', 'gauge', 'value', 'chart'].includes(w.type) && (
                    <div><label className={label}>Unit</label><input className={input} value={w.unit} maxLength={10} placeholder="e.g. °C, %" onChange={e => set({ unit: e.target.value })} /></div>
                )}
                {w.type === 'chart' && (
                    <div>
                        <label className={label}>Time range</label>
                        <div className="flex gap-2">
                            {['1h', '24h', '7d'].map(r => (
                                <button key={r} onClick={() => set({ range: r })}
                                    className={`flex-1 py-2 rounded-xl border font-mono text-xs font-bold ${w.range === r ? 'border-orange-500 bg-orange-500/10 text-orange-400' : dark ? 'border-[#3f3f4e] text-[#aaa]' : 'border-gray-200 text-gray-500'}`}>{r}</button>
                            ))}
                        </div>
                    </div>
                )}
                <div>
                    <label className={label}>Color</label>
                    <div className="flex flex-wrap gap-2">
                        {COLORS.map(c => (
                            <button key={c} onClick={() => set({ color: c })} className={`w-8 h-8 rounded-full border-2 ${w.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 pt-2">
                    <button onClick={onCancel} className={`flex-1 py-2.5 rounded-xl border font-mono text-sm font-bold ${dark ? 'border-[#3f3f4e] text-gray-300' : 'border-gray-200 text-gray-600'}`}>Cancel</button>
                    <button onClick={() => onSave(w)} disabled={w.type !== 'label' && !w.key}
                        className="flex-1 py-2.5 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 disabled:opacity-40">Done</button>
                </div>
            </div>
        </div>
    );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard({ device, dark, canEdit, editing, setEditing, onControl, onSaved }) {
    const cols = useColumns();
    const [draft, setDraft] = useState(null);
    const [configuring, setConfiguring] = useState(null); // { widget, isNew }
    const [dragId, setDragId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const pins = device.pins || [];

    useEffect(() => {
        if (editing) setDraft(device.dashboard?.length ? device.dashboard.map(w => ({ ...w })) : defaultDashboard(pins));
        else setDraft(null);
    }, [editing]);

    const widgets = editing ? (draft || []) : (device.dashboard || []);
    const valueOf = (key) => pins.find(p => p.widgetKey === key)?.value;
    const update = (id, patch) => setDraft(ws => ws.map(w => w.id === id ? { ...w, ...patch } : w));

    // Drag by the handle: as the pointer passes over another widget, move there
    useEffect(() => {
        if (!dragId) return;
        const move = (e) => {
            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-widget-id]');
            const overId = target?.dataset.widgetId;
            if (!overId || overId === dragId) return;
            setDraft(ws => {
                const from = ws.findIndex(w => w.id === dragId);
                const to = ws.findIndex(w => w.id === overId);
                if (from < 0 || to < 0) return ws;
                const next = [...ws];
                const [item] = next.splice(from, 1);
                next.splice(to, 0, item);
                return next;
            });
        };
        const up = () => setDragId(null);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
    }, [dragId]);

    const save = async () => {
        setSaving(true); setError('');
        try {
            const res = await axios.put(`${API}/api/devices/${device.deviceId}/dashboard`, { widgets: draft },
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            onSaved(res.data.dashboard);
            setEditing(false);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not save the dashboard');
        } finally { setSaving(false); }
    };

    const addWidget = () => {
        const sensor = pins.find(p => p.mode !== 'OUTPUT') || pins[0];
        setConfiguring({
            isNew: true,
            widget: { id: newId(), type: 'value', key: sensor?.widgetKey || '', title: sensor?.label || '', w: 1, h: 1, color: '#f97316', min: 0, max: sensor ? pinMax(sensor) : 100, unit: '', range: '1h' },
        });
    };

    const card = dark ? 'bg-[#1e1e2d] border-[#3f3f4e]' : 'bg-white border-gray-200';
    const muted = dark ? 'text-[#888]' : 'text-gray-500';
    const iconBtn = `p-1.5 rounded-lg ${dark ? 'bg-black/40 text-gray-300 hover:text-white' : 'bg-white/80 text-gray-600 hover:text-gray-900'}`;
    const controlsDisabled = !canEdit;

    return (
        <div>
            {editing && (
                <div className={`sticky top-0 z-20 mb-4 rounded-2xl border p-3 flex flex-wrap items-center gap-2 backdrop-blur ${dark ? 'bg-[#1a1a24]/95 border-orange-500/40' : 'bg-white/95 border-orange-300'}`}>
                    <p className={`font-mono text-xs flex-1 min-w-[12rem] ${muted}`}>Drag <GripVertical className="w-3 h-3 inline" /> to move, arrows to resize, <Settings2 className="w-3 h-3 inline" /> to configure.</p>
                    <button onClick={addWidget} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-orange-500/50 text-orange-400 font-mono text-xs font-bold hover:bg-orange-500/10">
                        <Plus className="w-3.5 h-3.5" /> Widget
                    </button>
                    <button onClick={() => setDraft(defaultDashboard(pins))} title="Rebuild from pins"
                        className={`flex items-center gap-1 px-3 py-2 rounded-xl border font-mono text-xs font-bold ${dark ? 'border-[#3f3f4e] text-gray-300' : 'border-gray-200 text-gray-600'}`}>
                        <RotateCcw className="w-3.5 h-3.5" /> Auto
                    </button>
                    <button onClick={() => setEditing(false)} className={`flex items-center gap-1 px-3 py-2 rounded-xl border font-mono text-xs font-bold ${dark ? 'border-[#3f3f4e] text-gray-300' : 'border-gray-200 text-gray-600'}`}>
                        <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button onClick={save} disabled={saving} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-orange-500 text-black font-mono text-xs font-black hover:bg-orange-400 disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
                    </button>
                    {error && <p className="w-full text-red-400 font-mono text-xs">{error}</p>}
                </div>
            )}

            {widgets.length === 0 ? (
                <div className={`text-center py-12 rounded-2xl border border-dashed font-mono text-sm ${muted} ${dark ? 'border-[#3f3f4e]' : 'border-gray-300'}`}>
                    Empty dashboard — add a widget.
                </div>
            ) : (
                <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: '120px', gridAutoFlow: 'dense' }}>
                    {widgets.map(widget => {
                        const pin = pins.find(p => p.widgetKey === widget.key);
                        const missing = widget.type !== 'label' && !pin;
                        const title = widget.title || pin?.label || WIDGETS[widget.type].label;
                        return (
                            <div key={widget.id} data-widget-id={widget.id}
                                className={`relative rounded-2xl border p-3 flex flex-col overflow-hidden transition-shadow ${card} ${dragId === widget.id ? 'ring-2 ring-orange-500 opacity-80' : ''} ${editing ? 'select-none' : ''}`}
                                style={{ gridColumn: `span ${Math.min(widget.w, cols)}`, gridRow: `span ${widget.h}` }}>
                                {widget.type === 'label' ? (
                                    <div className="flex-1 flex items-center">
                                        <h3 className={`font-mono font-black text-lg sm:text-xl break-words ${dark ? 'text-white' : 'text-gray-900'}`} style={{ borderLeft: `4px solid ${widget.color}`, paddingLeft: 10 }}>{title}</h3>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between gap-2 min-w-0">
                                            <span className={`font-mono font-bold text-[11px] uppercase tracking-wider truncate ${muted}`}>{title}</span>
                                        </div>
                                        <div className="flex-1 min-h-0 flex items-center justify-center">
                                            {missing ? (
                                                <p className="font-mono text-[11px] text-red-400 text-center">Pin removed — pick another in settings</p>
                                            ) : (
                                                <WidgetBody widget={widget} value={valueOf(widget.key)} onControl={onControl} deviceId={device.deviceId}
                                                    disabled={editing || controlsDisabled} dark={dark} />
                                            )}
                                        </div>
                                    </>
                                )}

                                {editing && (
                                    <div className={`absolute inset-0 rounded-2xl border-2 border-dashed border-orange-500/50 ${dark ? 'bg-black/30' : 'bg-white/40'}`}>
                                        <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between gap-1">
                                            <button onPointerDown={(e) => { e.preventDefault(); setDragId(widget.id); }}
                                                className={`${iconBtn} cursor-grab active:cursor-grabbing touch-none`} title="Drag to move">
                                                <GripVertical className="w-4 h-4" />
                                            </button>
                                            <div className="flex gap-1">
                                                <button onClick={() => setConfiguring({ widget, isNew: false })} className={iconBtn} title="Configure"><Settings2 className="w-4 h-4" /></button>
                                                <button onClick={() => setDraft(ws => ws.filter(w => w.id !== widget.id))} className={`${iconBtn} !text-red-400`} title="Remove"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                        <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                                            <button onClick={() => update(widget.id, { w: Math.max(1, Math.min(widget.w, cols) - 1) })} disabled={widget.w <= 1} className={`${iconBtn} disabled:opacity-30`} title="Narrower"><ChevronLeft className="w-4 h-4" /></button>
                                            <button onClick={() => update(widget.id, { w: Math.min(4, widget.w + 1) })} disabled={widget.w >= 4} className={`${iconBtn} disabled:opacity-30`} title="Wider"><ChevronRight className="w-4 h-4" /></button>
                                            <button onClick={() => update(widget.id, { h: Math.max(1, widget.h - 1) })} disabled={widget.h <= 1} className={`${iconBtn} disabled:opacity-30`} title="Shorter"><ChevronUp className="w-4 h-4" /></button>
                                            <button onClick={() => update(widget.id, { h: Math.min(3, widget.h + 1) })} disabled={widget.h >= 3} className={`${iconBtn} disabled:opacity-30`} title="Taller"><ChevronDown className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {configuring && (
                <WidgetSettings widget={configuring.widget} pins={pins} dark={dark}
                    onCancel={() => setConfiguring(null)}
                    onSave={(w) => {
                        setDraft(ws => configuring.isNew ? [...ws, w] : ws.map(x => x.id === w.id ? w : x));
                        setConfiguring(null);
                    }} />
            )}
        </div>
    );
}
