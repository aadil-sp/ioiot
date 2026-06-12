import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Zap, Activity, Edit2, Trash2, ChevronRight, Check } from 'lucide-react';

/**
 * Executes a sequence of steps against a control function.
 * Returns a cancel function.
 * @param {Array} steps
 * @param {Function} controlFn  - (widgetKey, value) => void
 * @param {Function} onStep     - (stepIndex) => void
 * @param {Function} onDone     - () => void
 */
function runSequence(steps, controlFn, onStep, onDone) {
    let cancelled = false;
    let timeouts = [];

    const fireStep = (i) => {
        if (cancelled || i >= steps.length) {
            if (!cancelled) onDone();
            return;
        }
        const step = steps[i];
        onStep(i);

        // Fire all pins in this step
        step.pins.forEach(widgetKey => {
            controlFn(widgetKey, step.value);
        });

        // If pulse: schedule auto-off
        if (step.pulse && step.pulseMs > 0) {
            const t = setTimeout(() => {
                if (!cancelled) {
                    step.pins.forEach(widgetKey => {
                        controlFn(widgetKey, !step.value);
                    });
                }
            }, step.pulseMs);
            timeouts.push(t);
        }

        // Schedule next step
        const delay = step.delay ?? 150;
        const t2 = setTimeout(() => fireStep(i + 1), delay);
        timeouts.push(t2);
    };

    fireStep(0);

    return () => {
        cancelled = true;
        timeouts.forEach(clearTimeout);
    };
}

const SIZE_GRID = {
    sm: 'col-span-1',
    md: 'col-span-1',
    lg: 'col-span-2',
    full: 'col-span-full',
};

export default function CustomActionWidget({
    action,
    pins,
    deviceState = {},
    onControl,
    onEdit,
    onDelete,
    dark,
    editMode = false,
}) {
    const [running, setRunning] = useState(false);
    const [activeStep, setActiveStep] = useState(-1);
    const [isOn, setIsOn] = useState(false);
    const cancelRef = useRef(null);

    // Determine if action is "on" by checking first step's first pin's current state
    useEffect(() => {
        const firstOnStep = action.onSequence?.[0];
        const firstPin = firstOnStep?.pins?.[0];
        if (firstPin !== undefined) {
            setIsOn(!!deviceState[firstPin]);
        }
    }, [deviceState, action]);

    const handleTrigger = useCallback(() => {
        if (running) {
            // Cancel running sequence
            if (cancelRef.current) cancelRef.current();
            cancelRef.current = null;
            setRunning(false);
            setActiveStep(-1);
            return;
        }

        const sequence = isOn ? action.offSequence : action.onSequence;
        if (!sequence || sequence.length === 0) return;

        setRunning(true);
        setActiveStep(0);

        cancelRef.current = runSequence(
            sequence,
            onControl,
            (stepIdx) => setActiveStep(stepIdx),
            () => {
                setRunning(false);
                setActiveStep(-1);
                setIsOn(prev => !prev);
            }
        );
    }, [running, isOn, action, onControl]);

    // Cleanup on unmount
    useEffect(() => () => { if (cancelRef.current) cancelRef.current(); }, []);

    const color = action.color || '#f97316';
    const mutedText = dark ? 'text-[#555]' : 'text-gray-400';
    const cardBg = dark ? 'bg-[#0d0d15]' : 'bg-white';
    const size = action.widgetSize || 'lg';

    // Which pins are currently active (from device state)
    const allActionPins = [...new Set([
        ...(action.onSequence || []).flatMap(s => s.pins),
        ...(action.offSequence || []).flatMap(s => s.pins),
    ])];

    // Pins in the currently running step
    const stepPins = running && activeStep >= 0
        ? (isOn ? action.offSequence : action.onSequence)?.[activeStep]?.pins || []
        : [];

    return (
        <div className={`${SIZE_GRID[size] || SIZE_GRID.lg} relative`}>
            <motion.div
                layout
                className={`relative rounded-2xl border overflow-hidden ${cardBg}`}
                style={{
                    borderColor: running ? color + 'aa' : isOn ? color + '55' : (dark ? '#1a1a2a' : '#e5e7eb'),
                    boxShadow: running
                        ? `0 0 30px ${color}44, 0 0 60px ${color}22`
                        : isOn ? `0 0 15px ${color}33` : 'none',
                    transition: 'box-shadow 0.3s, border-color 0.3s',
                }}
            >
                {/* Animated sweep line when running */}
                {running && (
                    <motion.div
                        className="absolute top-0 left-0 h-0.5 z-10"
                        style={{ backgroundColor: color }}
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 0.4, ease: 'easeInOut' }}
                        key={activeStep}
                    />
                )}

                {/* Glowing bg pulse when on */}
                {isOn && !running && (
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}12, transparent 70%)` }}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                    />
                )}

                <div className="relative p-4">
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                            <motion.span
                                className="text-xl"
                                animate={running ? { scale: [1, 1.2, 1] } : {}}
                                transition={{ repeat: Infinity, duration: 0.6 }}
                            >
                                {action.icon}
                            </motion.span>
                            <div>
                                <p className={`font-mono font-black uppercase tracking-widest text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>
                                    {action.name}
                                </p>
                                <p className={`font-mono text-[10px] ${mutedText}`}>
                                    {running
                                        ? `Step ${activeStep + 1} of ${(isOn ? action.offSequence : action.onSequence)?.length}`
                                        : isOn
                                            ? `${action.offSequence?.length || 0}-step OFF sequence`
                                            : `${action.onSequence?.length || 0}-step ON sequence`
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Edit/delete buttons in edit mode */}
                        {editMode && (
                            <div className="flex gap-1">
                                <button onClick={() => onEdit(action)}
                                    className={`p-1.5 rounded-lg ${mutedText} hover:text-orange-500 transition-colors`}>
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => onDelete(action.id)}
                                    className={`p-1.5 rounded-lg ${mutedText} hover:text-red-500 transition-colors`}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Big play/stop button */}
                    <button
                        onClick={handleTrigger}
                        className="w-full rounded-xl py-4 font-mono font-black text-sm transition-all relative overflow-hidden group"
                        style={{
                            backgroundColor: running ? '#ef4444' + '22' : isOn ? color + '22' : color + '15',
                            borderWidth: 2,
                            borderStyle: 'solid',
                            borderColor: running ? '#ef4444' + '88' : isOn ? color + '88' : color + '44',
                            color: running ? '#ef4444' : isOn ? color : color,
                        }}
                    >
                        {/* Sweep animation on hover */}
                        <motion.div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                            style={{ background: `linear-gradient(90deg, transparent, ${color}18, transparent)` }}
                        />

                        <div className="relative flex items-center justify-center gap-2">
                            {running ? (
                                <>
                                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                                        className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full" />
                                    <span>STOP</span>
                                </>
                            ) : isOn ? (
                                <>
                                    <Square className="w-4 h-4" />
                                    <span>TURN OFF</span>
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4" />
                                    <span>ACTIVATE</span>
                                </>
                            )}
                        </div>
                    </button>

                    {/* Step progress indicator */}
                    {running && (
                        <div className="mt-2 flex gap-1">
                            {(isOn ? action.offSequence : action.onSequence)?.map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="flex-1 h-1 rounded-full"
                                    style={{ backgroundColor: i < activeStep ? color : i === activeStep ? color : (dark ? '#1a1a2a' : '#e5e7eb') }}
                                    animate={i === activeStep ? { opacity: [1, 0.4, 1] } : {}}
                                    transition={{ repeat: Infinity, duration: 0.5 }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Individual mini-buttons per pin */}
                    {allActionPins.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {allActionPins.map(widgetKey => {
                                const pin = pins.find(p => p.widgetKey === widgetKey);
                                if (!pin) return null;
                                const pinOn = !!deviceState[widgetKey];
                                const isFiring = stepPins.includes(widgetKey);

                                return (
                                    <motion.button
                                        key={widgetKey}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onControl(widgetKey, !pinOn);
                                        }}
                                        animate={isFiring ? { scale: [1, 1.1, 1] } : {}}
                                        transition={{ repeat: isFiring ? Infinity : 0, duration: 0.3 }}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-bold border transition-all"
                                        style={{
                                            backgroundColor: pinOn ? (pin.color || color) + '22' : 'transparent',
                                            borderColor: isFiring ? (pin.color || color) : pinOn ? (pin.color || color) + '55' : (dark ? '#222' : '#e5e7eb'),
                                            color: pinOn || isFiring ? (pin.color || color) : (dark ? '#444' : '#9ca3af'),
                                            boxShadow: isFiring ? `0 0 8px ${pin.color || color}88` : 'none',
                                        }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full inline-block"
                                            style={{ backgroundColor: pinOn ? (pin.color || color) : (dark ? '#333' : '#ddd') }} />
                                        {pin.label}
                                    </motion.button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
