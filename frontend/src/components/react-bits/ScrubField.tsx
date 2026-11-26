import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { haptics } from '@/utils/haptics';

export interface ScrubFieldProps {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    unit?: string;
    color?: 'primary' | 'red' | 'emerald' | 'amber' | 'cyan';
    variant?: 'slider' | 'compact';
    disabled?: boolean;
    onChange: (val: number) => void;
    className?: string;
}

export const ScrubField: React.FC<ScrubFieldProps> = ({
    value,
    min = 0,
    max = 100,
    step = 1,
    label,
    unit = '%',
    color = 'primary',
    variant = 'slider',
    disabled = false,
    onChange,
    className = '',
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const startValRef = useRef(value);

    // Compute percentage safely
    const range = max - min;
    const clampedVal = Math.min(max, Math.max(min, value));
    const pct = range > 0 ? ((clampedVal - min) / range) * 100 : 0;

    // Color maps
    const colorStyles = {
        primary: {
            fill: 'from-blue-500 via-indigo-500 to-purple-500 shadow-[0_0_14px_rgba(99,102,241,0.5)]',
            badge: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
            glow: 'rgba(99,102,241,0.6)',
        },
        red: {
            fill: 'from-amber-500 via-rose-500 to-red-600 shadow-[0_0_14px_rgba(239,68,68,0.5)]',
            badge: 'text-red-400 bg-red-500/10 border-red-500/30',
            glow: 'rgba(239,68,68,0.6)',
        },
        emerald: {
            fill: 'from-teal-400 via-emerald-500 to-green-500 shadow-[0_0_14px_rgba(16,185,129,0.5)]',
            badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
            glow: 'rgba(16,185,129,0.6)',
        },
        amber: {
            fill: 'from-amber-400 via-yellow-500 to-orange-500 shadow-[0_0_14px_rgba(245,158,11,0.5)]',
            badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
            glow: 'rgba(245,158,11,0.6)',
        },
        cyan: {
            fill: 'from-teal-400 via-cyan-400 to-blue-500 shadow-[0_0_14px_rgba(6,182,212,0.5)]',
            badge: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
            glow: 'rgba(6,182,212,0.6)',
        },
    };

    const currentTheme = colorStyles[color] || colorStyles.primary;

    // Snap to step helper
    const snapToStep = useCallback((val: number) => {
        const stepped = Math.round((val - min) / step) * step + min;
        const clamped = Math.min(max, Math.max(min, stepped));
        // Precision fixing to prevent floating point quirks
        const decimals = (step.toString().split('.')[1] || '').length;
        return Number(clamped.toFixed(decimals));
    }, [min, max, step]);

    // Handle track click or drag scrub for full slider
    const updateFromPointer = useCallback((clientX: number) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const rawVal = min + ratio * (max - min);
        const snapped = snapToStep(rawVal);
        if (snapped !== value) {
            haptics.selection();
            onChange(snapped);
        }
    }, [min, max, snapToStep, value, onChange]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (disabled) return;
        setIsDragging(true);
        startXRef.current = e.clientX;
        startValRef.current = value;
        haptics.light();
        e.currentTarget.setPointerCapture(e.pointerId);

        if (variant === 'slider') {
            updateFromPointer(e.clientX);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || disabled) return;

        if (variant === 'slider') {
            updateFromPointer(e.clientX);
        } else {
            // Delta drag for compact mode
            const deltaX = e.clientX - startXRef.current;
            const change = Math.round(deltaX / 6) * step;
            const nextVal = snapToStep(startValRef.current + change);
            if (nextVal !== value) {
                haptics.selection();
                onChange(nextVal);
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isDragging) {
            setIsDragging(false);
            try {
                e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;
        let nextVal = value;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            nextVal = snapToStep(value - step);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            nextVal = snapToStep(value + step);
        } else if (e.key === 'PageDown') {
            e.preventDefault();
            nextVal = snapToStep(value - step * 10);
        } else if (e.key === 'PageUp') {
            e.preventDefault();
            nextVal = snapToStep(value + step * 10);
        } else if (e.key === 'Home') {
            e.preventDefault();
            nextVal = min;
        } else if (e.key === 'End') {
            e.preventDefault();
            nextVal = max;
        }

        if (nextVal !== value) {
            haptics.selection();
            onChange(nextVal);
        }
    };

    // Compact inline scrubber (Blender / Framer Inspector style)
    if (variant === 'compact') {
        return (
            <div
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-valuenow={value}
                aria-valuemin={min}
                aria-valuemax={max}
                onKeyDown={handleKeyDown}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] hover:border-white/[0.2] transition-all select-none cursor-ew-resize active:scale-[0.98] ${
                    disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
                } ${className}`}
            >
                {label && <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}:</span>}
                <span className="text-xs font-mono font-black text-white">
                    {value}{unit}
                </span>
                <span className="text-[9px] text-white/30 font-mono tracking-tighter">↔ scrub</span>
            </div>
        );
    }

    // Full Framer-tier slider scrubber with track, glow, and grab pill
    return (
        <div className={`w-full select-none ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}>
            {/* Header with Label and Neon Value Badge */}
            <div className="flex items-center justify-between mb-2">
                {label && (
                    <span className="text-[11px] font-semibold text-on-surface-variant/70 tracking-wide uppercase">
                        {label}
                    </span>
                )}
                <div
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold border transition-all ${
                        currentTheme.badge
                    } ${isDragging ? 'scale-105 shadow-sm' : ''}`}
                >
                    {clampedVal}{unit}
                </div>
            </div>

            {/* Interactive Track Area */}
            <div
                ref={trackRef}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-valuenow={clampedVal}
                aria-valuemin={min}
                aria-valuemax={max}
                onKeyDown={handleKeyDown}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="relative py-2 cursor-ew-resize group focus:outline-none"
            >
                {/* Background Track Groove */}
                <div className="relative h-2 w-full rounded-full bg-white/[0.08] dark:bg-white/[0.08] light:bg-black/[0.08] overflow-hidden border border-white/[0.05]">
                    {/* Glowing Fluid Progress Fill */}
                    <div
                        className={`absolute top-0 bottom-0 left-0 bg-gradient-to-r ${currentTheme.fill} transition-[width] duration-75 ease-out`}
                        style={{ width: `${pct}%` }}
                    />
                </div>

                {/* Tactile Scrubber Thumb / Beacon */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none transition-[left] duration-75 ease-out"
                    style={{ left: `${pct}%` }}
                >
                    <div className="-translate-x-1/2 relative flex items-center justify-center">
                        {/* Ambient Glow */}
                        <div
                            className="absolute w-6 h-6 rounded-full blur-md opacity-70 transition-transform group-hover:scale-125"
                            style={{ backgroundColor: currentTheme.glow }}
                        />

                        {/* Core Thumb Capsule */}
                        <motion.div
                            animate={{
                                scale: isDragging ? 1.25 : 1,
                            }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                            className="relative w-4 h-4 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] border-2 border-[#12131a] flex items-center justify-center"
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-[#12131a]/60" />
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Micro range indicators */}
            <div className="flex items-center justify-between text-[9px] font-mono text-on-surface-variant/30 mt-1">
                <span>{min}{unit}</span>
                <span className="text-[8px] opacity-60 tracking-wider">↔ DRAG TO SCRUB</span>
                <span>{max}{unit}</span>
            </div>
        </div>
    );
};
