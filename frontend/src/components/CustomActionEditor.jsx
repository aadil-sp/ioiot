import { useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
    X, Plus, Trash2, GripVertical, Zap, ChevronDown, ChevronUp,
    PlayCircle, StopCircle, Clock, Cpu, ToggleLeft, Activity,
    Check, Copy, ArrowRight, ArrowDown, Maximize2
} from 'lucide-react';

const ICON_OPTIONS = ['⚡', '💡', '🌈', '🔥', '🎆', '🌊', '🎵', '🚀', '🌟', '🎯', '🔮', '💫'];
const COLOR_OPTIONS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#ef4444', '#06b6d4', '#8b5cf6'];

const SIZE_OPTIONS = [
    { key: 'sm', label: 'S', desc: 'Compact' },
    { key: 'md', label: 'M', desc: 'Default' },
    { key: 'lg', label: 'L', desc: 'Wide' },
    { key: 'full', label: '⟷', desc: 'Full Row' },
];

const DEFAULT_STEP = () => ({ pins: [], value: true, delay: 150, pulse: false, pulseMs: 200 });

function StepRow({ step, index, pins, onChange, onRemove, dark, label }) {
    const [expanded, setExpanded] = useState(false);
    const mutedText = dark ? 'text-[#555]' : 'text-gray-400';
    const inputCls = dark
        ? 'bg-[#111] border-[#333] text-white focus:border-orange-500 placeholder-[#444]'
        : 'bg-white border-gray-200 text-gray-900 focus:border-orange-400';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`border rounded-xl overflow-hidden ${dark ? 'border-[#2a2a3a] bg-[#0d0d15]' : 'border-gray-100 bg-gray-50'}`}
        >
            {/* Step header */}
            <div className="flex items-center gap-2 p-3">
                <GripVertical className={`w-4 h-4 cursor-grab shrink-0 ${mutedText}`} />
                <span className={`font-mono text-xs uppercase tracking-widest font-bold px-2 py-0.5 rounded ${dark ? 'bg-[#1a1a2a] text-orange-400' : 'bg-orange-50 text-orange-500'}`}>
                    {label} {index + 1}
                </span>

                {/* Pin chips */}
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                    {step.pins.length === 0
                        ? <span className={`font-mono text-xs italic ${mutedText}`}>no pins selected</span>
                        : step.pins.map(pk => {
                            const pin = pins.find(p => p.widgetKey === pk);
                            return pin ? (
                                <span key={pk} className="font-mono text-[10px] px-1.5 py-0.5 rounded-md"
                                    style={{ backgroundColor: (pin.color || '#f97316') + '22', color: pin.color || '#f97316', border: `1px solid ${pin.color || '#f97316'}44` }}>
                                    {pin.label}
                                </span>
                            ) : null;
                        })
                    }
                </div>

                <span className={`font-mono text-xs shrink-0 ${mutedText}`}>{step.delay}ms</span>
                {step.pulse && <span className="text-[10px] font-mono text-blue-400 shrink-0">PULSE</span>}

                <button onClick={() => setExpanded(e => !e)} className={`p-1 rounded ${mutedText} hover:text-orange-500`}>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <button onClick={onRemove} className={`p-1 rounded ${mutedText} hover:text-red-500`}>
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Expanded editor */}
            <AnimatePresence>
                {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className={`px-3 pb-3 border-t overflow-hidden ${dark ? 'border-[#1a1a2a]' : 'border-gray-100'}`}>
                        <div className="pt-3 space-y-3">
                            {/* Pin selector */}
                            <div>
                                <p className={`font-mono text-[10px] uppercase tracking-widest mb-2 ${mutedText}`}>Select Pins</p>
                                <div className="flex flex-wrap gap-2">
                                    {pins.filter(p => p.mode === 'OUTPUT').map(pin => {
                                        const selected = step.pins.includes(pin.widgetKey);
                                        return (
                                            <button key={pin.widgetKey}
                                                onClick={() => {
                                                    const next = selected
                                                        ? step.pins.filter(k => k !== pin.widgetKey)
                                                        : [...step.pins, pin.widgetKey];
                                                    onChange({ ...step, pins: next });
                                                }}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all border"
                                                style={{
                                                    backgroundColor: selected ? (pin.color || '#f97316') + '22' : 'transparent',
                                                    color: selected ? (pin.color || '#f97316') : (dark ? '#555' : '#9ca3af'),
                                                    borderColor: selected ? (pin.color || '#f97316') + '66' : (dark ? '#333' : '#e5e7eb'),
                                                }}>
                                                {selected && <Check className="w-3 h-3" />}
                                                {pin.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Value */}
                            <div className="flex gap-3 flex-wrap">
                                <div className="flex-1 min-w-[120px]">
                                    <p className={`font-mono text-[10px] uppercase tracking-widest mb-1 ${mutedText}`}>Value</p>
                                    <div className="flex gap-2">
                                        {[{ v: true, label: 'ON / HIGH' }, { v: false, label: 'OFF / LOW' }].map(opt => (
                                            <button key={String(opt.v)}
                                                onClick={() => onChange({ ...step, value: opt.v })}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${step.value === opt.v
                                                    ? 'bg-orange-500 border-orange-500 text-black'
                                                    : dark ? 'border-[#333] text-[#555] hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-900'}`}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Delay */}
                                <div className="flex-1 min-w-[120px]">
                                    <p className={`font-mono text-[10px] uppercase tracking-widest mb-1 ${mutedText}`}>Delay after step</p>
                                    <div className="flex items-center gap-2">
                                        <input type="range" min="0" max="2000" step="50" value={step.delay}
                                            onChange={e => onChange({ ...step, delay: Number(e.target.value) })}
                                            className="flex-1 accent-orange-500" />
                                        <span className={`font-mono text-xs w-14 text-right ${dark ? 'text-white' : 'text-gray-900'}`}>{step.delay}ms</span>
                                    </div>
                                </div>
                            </div>

                            {/* Pulse toggle */}
                            <div className="flex items-center gap-3">
                                <button onClick={() => onChange({ ...step, pulse: !step.pulse })}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${step.pulse
                                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                                        : dark ? 'border-[#333] text-[#555] hover:text-blue-400' : 'border-gray-200 text-gray-400 hover:text-blue-400'}`}>
                                    <Activity className="w-3.5 h-3.5" />
                                    Pulse/Flash Mode
                                </button>
                                {step.pulse && (
                                    <div className="flex items-center gap-2">
                                        <span className={`font-mono text-[10px] ${mutedText}`}>Duration</span>
                                        <input type="range" min="50" max="1000" step="50" value={step.pulseMs}
                                            onChange={e => onChange({ ...step, pulseMs: Number(e.target.value) })}
                                            className="w-24 accent-blue-500" />
                                        <span className="font-mono text-xs text-blue-400">{step.pulseMs}ms</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function SequenceBuilder({ sequence, onChange, pins, dark, label, color }) {
    const mutedText = dark ? 'text-[#555]' : 'text-gray-400';

    const addStep = () => onChange([...sequence, DEFAULT_STEP()]);
    const removeStep = (i) => onChange(sequence.filter((_, idx) => idx !== i));
    const updateStep = (i, step) => onChange(sequence.map((s, idx) => idx === i ? step : s));

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <p className={`font-mono text-xs uppercase tracking-widest font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{label} Sequence</p>
                    <span className={`font-mono text-[10px] ${mutedText}`}>({sequence.length} steps)</span>
                </div>
                <button onClick={addStep}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border border-orange-500/30 text-orange-500 hover:bg-orange-500 hover:text-black transition-all">
                    <Plus className="w-3 h-3" /> Add Step
                </button>
            </div>

            {sequence.length === 0 ? (
                <div className={`border-2 border-dashed rounded-xl p-6 text-center ${dark ? 'border-[#1a1a2a]' : 'border-gray-200'}`}>
                    <p className={`font-mono text-xs ${mutedText}`}>No steps yet — add your first step above</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {/* Timeline connector */}
                    <div className="relative">
                        {sequence.map((step, i) => (
                            <div key={i} className="relative mb-2">
                                {i < sequence.length - 1 && (
                                    <div className="absolute left-5 top-full w-0.5 h-2 z-10" style={{ backgroundColor: color + '44' }} />
                                )}
                                <StepRow
                                    step={step}
                                    index={i}
                                    pins={pins}
                                    onChange={(s) => updateStep(i, s)}
                                    onRemove={() => removeStep(i)}
                                    dark={dark}
                                    label={label}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CustomActionEditor({ action, pins, onSave, onClose, dark }) {
    const [draft, setDraft] = useState(action || {
        id: Math.random().toString(36).slice(2),
        name: 'Swipe On',
        icon: '⚡',
        color: '#f97316',
        onSequence: [],
        offSequence: [],
        widgetSize: 'lg',
    });

    const [activeTab, setActiveTab] = useState('on');
    const [saving, setSaving] = useState(false);

    const card = dark ? 'bg-[#0d0d15] border-[#1a1a2a]' : 'bg-white border-gray-100';
    const mutedText = dark ? 'text-[#555]' : 'text-gray-400';

    const handleSave = async () => {
        setSaving(true);
        await onSave(draft);
        setSaving(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${card}`}
            >
                {/* Header */}
                <div className={`flex items-center justify-between p-5 border-b ${dark ? 'border-[#1a1a2a]' : 'border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{draft.icon}</span>
                        <div>
                            <h2 className={`font-mono font-black uppercase tracking-widest text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>
                                {action ? 'Edit Action' : 'New Custom Action'}
                            </h2>
                            <p className={`font-mono text-[10px] ${mutedText}`}>Design a multi-pin sequence</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-lg ${mutedText} hover:text-red-500 transition-colors`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Name + Icon + Color */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={`block font-mono text-[10px] uppercase tracking-widest mb-1.5 ${mutedText}`}>Action Name</label>
                            <input
                                value={draft.name}
                                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                placeholder="e.g. Rainbow Sweep"
                                className={`w-full border outline-none rounded-lg px-3 py-2 font-mono text-sm transition-colors ${dark ? 'bg-[#111] border-[#333] text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`}
                            />
                        </div>
                        <div>
                            <label className={`block font-mono text-[10px] uppercase tracking-widest mb-1.5 ${mutedText}`}>Widget Size</label>
                            <div className="flex gap-1.5">
                                {SIZE_OPTIONS.map(s => (
                                    <button key={s.key} onClick={() => setDraft(d => ({ ...d, widgetSize: s.key }))}
                                        title={s.desc}
                                        className={`flex-1 py-2 rounded-lg font-mono text-xs font-bold border transition-all ${draft.widgetSize === s.key
                                            ? 'bg-orange-500 border-orange-500 text-black'
                                            : dark ? 'border-[#333] text-[#555] hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-900'}`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Icon picker */}
                    <div>
                        <label className={`block font-mono text-[10px] uppercase tracking-widest mb-1.5 ${mutedText}`}>Icon</label>
                        <div className="flex flex-wrap gap-2">
                            {ICON_OPTIONS.map(icon => (
                                <button key={icon} onClick={() => setDraft(d => ({ ...d, icon }))}
                                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-all ${draft.icon === icon
                                        ? 'border-orange-500 bg-orange-500/20 scale-110'
                                        : dark ? 'border-[#222] hover:border-[#444]' : 'border-gray-100 hover:border-gray-300'}`}>
                                    {icon}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Color picker */}
                    <div>
                        <label className={`block font-mono text-[10px] uppercase tracking-widest mb-1.5 ${mutedText}`}>Accent Color</label>
                        <div className="flex flex-wrap gap-2">
                            {COLOR_OPTIONS.map(c => (
                                <button key={c} onClick={() => setDraft(d => ({ ...d, color: c }))}
                                    className="w-7 h-7 rounded-full border-2 transition-all"
                                    style={{
                                        backgroundColor: c,
                                        borderColor: draft.color === c ? 'white' : 'transparent',
                                        boxShadow: draft.color === c ? `0 0 0 3px ${c}66` : 'none',
                                        transform: draft.color === c ? 'scale(1.2)' : 'scale(1)',
                                    }} />
                            ))}
                        </div>
                    </div>

                    {/* Sequence tabs */}
                    <div>
                        <div className={`flex gap-1 p-1 rounded-xl mb-4 ${dark ? 'bg-[#111]' : 'bg-gray-100'}`}>
                            {[
                                { key: 'on', label: '▶ ON Sequence', icon: PlayCircle },
                                { key: 'off', label: '■ OFF Sequence', icon: StopCircle },
                            ].map(t => (
                                <button key={t.key} onClick={() => setActiveTab(t.key)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-mono text-xs font-bold transition-all ${activeTab === t.key
                                        ? t.key === 'on'
                                            ? 'bg-orange-500 text-black shadow-[0_0_15px_rgba(249,115,22,0.4)]'
                                            : 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                                        : dark ? 'text-[#555] hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}>
                                    <t.icon className="w-3.5 h-3.5" />
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <AnimatePresence mode="wait">
                            {activeTab === 'on' ? (
                                <motion.div key="on" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                                    <SequenceBuilder
                                        sequence={draft.onSequence}
                                        onChange={seq => setDraft(d => ({ ...d, onSequence: seq }))}
                                        pins={pins}
                                        dark={dark}
                                        label="ON"
                                        color={draft.color}
                                    />
                                </motion.div>
                            ) : (
                                <motion.div key="off" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <button onClick={() => setDraft(d => ({ ...d, offSequence: [...d.onSequence].reverse() }))}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${dark ? 'border-[#333] text-[#555] hover:text-white hover:border-[#555]' : 'border-gray-200 text-gray-400 hover:text-gray-900'}`}>
                                            <Copy className="w-3 h-3" /> Mirror ON (reversed)
                                        </button>
                                    </div>
                                    <SequenceBuilder
                                        sequence={draft.offSequence}
                                        onChange={seq => setDraft(d => ({ ...d, offSequence: seq }))}
                                        pins={pins}
                                        dark={dark}
                                        label="OFF"
                                        color="#3b82f6"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Footer */}
                <div className={`flex items-center justify-between gap-3 p-4 border-t ${dark ? 'border-[#1a1a2a]' : 'border-gray-100'}`}>
                    <div>
                        <p className={`font-mono text-xs ${mutedText}`}>
                            {draft.onSequence.length} ON steps · {draft.offSequence.length} OFF steps
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose}
                            className={`px-4 py-2 rounded-xl font-mono text-sm border transition-all ${dark ? 'border-[#333] text-[#555] hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-900'}`}>
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving || !draft.name.trim()}
                            className="px-6 py-2 rounded-xl font-mono font-black text-sm bg-orange-500 text-black hover:bg-orange-400 transition-all disabled:opacity-50 flex items-center gap-2"
                            style={{ boxShadow: `0 0 20px ${draft.color}44` }}>
                            {saving ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                                className="w-4 h-4 border-2 border-black border-t-transparent rounded-full" />
                                : <Check className="w-4 h-4" />}
                            Save Action
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
