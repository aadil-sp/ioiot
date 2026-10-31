import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Download, RefreshCw, LineChart } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

const RANGES = [
    { key: '1h', label: '1H' },
    { key: '24h', label: '24H' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
];

const isBinary = (pin) => pin.type === 'digital';

function formatTick(t, range) {
    const d = new Date(t);
    if (range === '1h' || range === '24h') return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatValue(v, pin) {
    if (v === undefined || v === null) return '—';
    if (isBinary(pin)) return v >= 0.5 ? 'ON' : 'OFF';
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// One chart per pin. Lines break where the device stopped reporting.
function PinChart({ pin, points, stats, from, to, range, dark }) {
    const [hover, setHover] = useState(null);
    const boxRef = useRef(null);
    const W = 1000, H = 160;

    const series = points.filter(p => p[pin.key] !== undefined).map(p => ({ t: p.t, v: p[pin.key] }));
    let lo = isBinary(pin) ? 0 : Math.min(...series.map(s => s.v));
    let hi = isBinary(pin) ? 1 : Math.max(...series.map(s => s.v));
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;

    const x = (t) => ((t - from) / (to - from)) * W;
    const y = (v) => H - ((v - lo) / (hi - lo)) * H;
    const gapMs = ((to - from) / 240) * 4;

    // Build path segments, splitting on gaps; digital pins draw as steps
    const segments = [];
    let current = [];
    series.forEach((s, i) => {
        if (i > 0 && s.t - series[i - 1].t > gapMs) { segments.push(current); current = []; }
        current.push(s);
    });
    if (current.length) segments.push(current);
    const pathFor = (seg) => seg.map((s, i) => {
        if (i === 0) return `M${x(s.t)},${y(s.v)}`;
        return isBinary(pin) ? `H${x(s.t)}V${y(s.v)}` : `L${x(s.t)},${y(s.v)}`;
    }).join('');

    const onMove = (e) => {
        const rect = boxRef.current.getBoundingClientRect();
        const t = from + ((e.clientX - rect.left) / rect.width) * (to - from);
        let best = null;
        for (const s of series) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
        setHover(best && Math.abs(best.t - t) < gapMs ? best : null);
    };

    const color = pin.color || '#f97316';
    const muted = dark ? 'text-[#888]' : 'text-gray-500';

    return (
        <div className={`rounded-2xl border p-4 ${dark ? 'bg-[#1e1e2d] border-[#3f3f4e]' : 'bg-white border-gray-200'}`}>
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div className="min-w-0">
                    <h4 className={`font-mono font-black text-sm truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                        <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: color }} />
                        {pin.label}
                    </h4>
                    <p className={`font-mono text-[10px] uppercase tracking-widest mt-0.5 ${muted}`}>{pin.mode === 'OUTPUT' ? 'Output' : 'Sensor'} · {pin.key}</p>
                </div>
                <div className="text-right">
                    <div className="font-mono font-black text-xl" style={{ color }}>
                        {formatValue(hover ? hover.v : stats.last, pin)}
                    </div>
                    <div className={`font-mono text-[10px] ${muted}`}>
                        {hover ? new Date(hover.t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'latest'}
                    </div>
                </div>
            </div>

            <div ref={boxRef} className="relative h-40 cursor-crosshair touch-none"
                onMouseMove={onMove} onMouseLeave={() => setHover(null)}
                onTouchMove={(e) => onMove(e.touches[0])} onTouchEnd={() => setHover(null)}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                    {[0.25, 0.5, 0.75].map(f => (
                        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke={dark ? '#2f2f3d' : '#eee'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))}
                    {segments.map((seg, i) => (
                        <path key={i} d={pathFor(seg)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    ))}
                    {segments.filter(seg => seg.length === 1).map((seg, i) => (
                        <line key={`dot${i}`} x1={x(seg[0].t)} x2={x(seg[0].t)} y1={y(seg[0].v)} y2={y(seg[0].v)} stroke={color} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    ))}
                    {hover && (
                        <line x1={x(hover.t)} x2={x(hover.t)} y1="0" y2={H} stroke={dark ? '#666' : '#bbb'} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                    )}
                </svg>
                {hover && (
                    <div className="absolute w-2.5 h-2.5 rounded-full border-2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: `${(x(hover.t) / W) * 100}%`, top: `${(y(hover.v) / H) * 100}%`, borderColor: color, backgroundColor: dark ? '#1e1e2d' : '#fff' }} />
                )}
                {!isBinary(pin) && (
                    <>
                        <span className={`absolute top-0 left-0 font-mono text-[9px] ${muted}`}>{formatValue(hi - pad, pin)}</span>
                        <span className={`absolute bottom-0 left-0 font-mono text-[9px] ${muted}`}>{formatValue(lo + pad, pin)}</span>
                    </>
                )}
            </div>
            <div className={`flex justify-between font-mono text-[9px] mt-1 ${muted}`}>
                <span>{formatTick(from, range)}</span>
                <span>{formatTick(from + (to - from) / 2, range)}</span>
                <span>now</span>
            </div>

            {!isBinary(pin) && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                    {[['Min', stats.min], ['Avg', stats.avg], ['Max', stats.max]].map(([label, v]) => (
                        <div key={label} className={`rounded-lg px-2 py-1.5 text-center ${dark ? 'bg-[#16161f]' : 'bg-gray-50'}`}>
                            <div className={`font-mono text-[9px] uppercase tracking-widest ${muted}`}>{label}</div>
                            <div className={`font-mono font-bold text-xs ${dark ? 'text-white' : 'text-gray-900'}`}>{formatValue(v, pin)}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function HistoryPanel({ deviceId, dark }) {
    const [range, setRange] = useState('24h');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    const load = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/api/devices/${deviceId}/history`, { params: { range }, headers });
            setData(res.data);
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load history');
        } finally { setLoading(false); }
    }, [deviceId, range]);

    useEffect(() => {
        setLoading(true);
        load();
        const timer = setInterval(load, 30 * 1000);
        return () => clearInterval(timer);
    }, [load]);

    const downloadCsv = async () => {
        try {
            const res = await axios.get(`${API}/api/devices/${deviceId}/history`, { params: { range, format: 'csv' }, headers, responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${deviceId}-${range}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch { setError('CSV download failed'); }
    };

    const muted = dark ? 'text-[#888]' : 'text-gray-500';
    const btn = dark ? 'border-[#3f3f4e] text-gray-300 hover:text-white hover:border-orange-500' : 'border-gray-200 text-gray-600 hover:border-orange-400';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className={`flex gap-1 p-1 border rounded-xl ${dark ? 'border-[#3f3f4e] bg-[#1e1e2d]' : 'border-gray-200 bg-white'}`}>
                    {RANGES.map(r => (
                        <button key={r.key} onClick={() => setRange(r.key)}
                            className={`px-4 py-2 rounded-lg font-mono font-black text-xs transition-all ${range === r.key ? 'bg-orange-500 text-black' : `${muted} hover:text-orange-400`}`}>
                            {r.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={load} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-mono text-xs font-bold transition-all ${btn}`}>
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                    <button onClick={downloadCsv} disabled={!data?.pins?.length}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-mono text-xs font-bold transition-all disabled:opacity-40 ${btn}`}>
                        <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                </div>
            </div>

            {error && <p className="text-red-400 font-mono text-xs">{error}</p>}

            {loading && !data ? (
                <div className="flex items-center justify-center h-48">
                    <div className="w-8 h-8 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
                </div>
            ) : !data?.pins?.length ? (
                <div className={`text-center py-16 rounded-2xl border border-dashed ${dark ? 'border-[#3f3f4e]' : 'border-gray-300'}`}>
                    <LineChart className={`w-10 h-10 mx-auto mb-3 ${muted}`} />
                    <p className={`font-mono font-bold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>No history in this range yet</p>
                    <p className={`font-mono text-xs mt-1 max-w-sm mx-auto leading-relaxed ${muted}`}>
                        Sensor readings and control changes are saved every 30 seconds while the device is online, and kept for 30 days.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {data.pins.map(pin => (
                        <PinChart key={pin.key} pin={pin} points={data.points} stats={data.stats[pin.key]}
                            from={data.from} to={data.to} range={data.range} dark={dark} />
                    ))}
                </div>
            )}
        </div>
    );
}
