import React, { useState, useRef, useEffect } from 'react';
import { Clock, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { haptics } from '@/utils/haptics';

interface TimePickerProps {
    label?: string;
    value: string; // "HH:mm" 24-hour format (e.g. "09:00", "14:30")
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}

const HOURS_12 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES_STEP = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function parse24h(val: string): { hour12: string; minute: string; period: 'AM' | 'PM' } {
    if (!val || !val.includes(':')) {
        return { hour12: '09', minute: '00', period: 'AM' };
    }
    const [hStr, mStr] = val.split(':');
    const h24 = Math.max(0, Math.min(23, parseInt(hStr, 10) || 0));
    const min = Math.max(0, Math.min(59, parseInt(mStr, 10) || 0));
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return {
        hour12: h12.toString().padStart(2, '0'),
        minute: min.toString().padStart(2, '0'),
        period,
    };
}

function formatTo24h(hour12: string, minute: string, period: 'AM' | 'PM'): string {
    let h = parseInt(hour12, 10) || 12;
    if (period === 'AM') {
        if (h === 12) h = 0;
    } else {
        if (h !== 12) h += 12;
    }
    return `${h.toString().padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

/**
 * Custom Liquid Glass Time Picker:
 * Replaces ugly OS/Chromium `<input type="time">` popups with a smooth
 * viewport-aware fixed-portal 3-column selector (Hour | Minute | AM/PM).
 */
export const TimePicker: React.FC<TimePickerProps> = ({
    label,
    value,
    onChange,
    disabled = false,
    className = '',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null);

    const parsed = parse24h(value);
    const displayLabel = `${parsed.hour12}:${parsed.minute} ${parsed.period}`;

    const minuteOptions = MINUTES_STEP.includes(parsed.minute)
        ? MINUTES_STEP
        : [...MINUTES_STEP, parsed.minute].sort();

    const computeCoords = () => {
        if (!triggerRef.current) return null;
        const rect = triggerRef.current.getBoundingClientRect();
        const popoverWidth = 248;
        const popoverHeight = 278;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < popoverHeight + 14 && rect.top > popoverHeight + 14;
        const left = Math.max(12, Math.min(rect.left, window.innerWidth - popoverWidth - 12));
        const top = openUp ? Math.max(12, rect.top - popoverHeight - 6) : rect.bottom + 6;
        return { top, left, openUp };
    };

    useEffect(() => {
        if (!isOpen) return;
        const onMouseDown = (e: MouseEvent) => {
            if (triggerRef.current?.contains(e.target as Node)) return;
            if (popoverRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setIsOpen(false);
            }
        };
        const update = () => {
            const next = computeCoords();
            if (next) setCoords(next);
        };
        update();
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [isOpen]);

    const emit = (nextHour: string, nextMinute: string, nextPeriod: 'AM' | 'PM') => {
        haptics.crownTick();
        onChange(formatTo24h(nextHour, nextMinute, nextPeriod));
    };

    return (
        <div className="w-full flex flex-col gap-1.5 relative select-none">
            {label && (
                <label className="text-[11px] font-semibold text-on-surface-variant/80 ml-0.5">
                    {label}
                </label>
            )}

            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    if (!isOpen) {
                        const next = computeCoords();
                        if (next) setCoords(next);
                    }
                    setIsOpen((prev) => !prev);
                }}
                className={`no-fluid w-full h-9 px-3 rounded-xl bg-on-surface/[0.04] hover:bg-on-surface/[0.07] border text-left text-xs font-semibold text-on-surface tabular-nums flex items-center justify-between gap-2 transition-all duration-150 cursor-pointer disabled:opacity-40 ${
                    isOpen
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-on-surface/[0.11] hover:border-primary/40'
                } ${className}`}
            >
                <span className="truncate">{displayLabel}</span>
                <Clock size={13} className={`shrink-0 transition-colors ${isOpen ? 'text-primary' : 'text-on-surface-variant/70'}`} />
            </button>

            {createPortal(
                <AnimatePresence>
                    {isOpen && coords && (
                        <motion.div
                            ref={popoverRef}
                            initial={{ opacity: 0, y: coords.openUp ? 6 : -6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: coords.openUp ? 4 : -4, scale: 0.96 }}
                            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                            className="fixed z-[999999] w-[248px] rounded-[22px] liquid-glass-overlay overflow-hidden"
                            style={{
                                position: 'fixed',
                                top: `${coords.top}px`,
                                left: `${coords.left}px`,
                            }}
                        >
                            {/* Top gradient hairline */}
                            <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400" />

                            {/* Live Time Readout Header */}
                            <div className="px-3.5 py-2.5 border-b border-on-surface/[0.08] flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                                    Select Time
                                </span>
                                <span className="font-display text-sm font-extrabold gradient-text tabular-nums">
                                    {displayLabel}
                                </span>
                            </div>

                            {/* 3-Column Scrollable Wheel */}
                            <div className="grid grid-cols-3 gap-1.5 p-2.5">
                                {/* Hours */}
                                <div className="flex flex-col gap-0.5 max-h-[172px] overflow-y-auto custom-scrollbar pr-0.5">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60 text-center pb-1 sticky top-0 bg-surface/90 backdrop-blur-sm">
                                        Hr
                                    </span>
                                    {HOURS_12.map((hr) => {
                                        const active = hr === parsed.hour12;
                                        return (
                                            <button
                                                key={hr}
                                                type="button"
                                                onClick={() => emit(hr, parsed.minute, parsed.period)}
                                                className={`no-fluid h-7 rounded-xl text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                                                    active
                                                        ? 'btn-gradient text-white shadow-xs'
                                                        : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.07]'
                                                }`}
                                            >
                                                {hr}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Minutes */}
                                <div className="flex flex-col gap-0.5 max-h-[172px] overflow-y-auto custom-scrollbar pr-0.5">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60 text-center pb-1 sticky top-0 bg-surface/90 backdrop-blur-sm">
                                        Min
                                    </span>
                                    {minuteOptions.map((min) => {
                                        const active = min === parsed.minute;
                                        return (
                                            <button
                                                key={min}
                                                type="button"
                                                onClick={() => emit(parsed.hour12, min, parsed.period)}
                                                className={`no-fluid h-7 rounded-xl text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                                                    active
                                                        ? 'btn-gradient text-white shadow-xs'
                                                        : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.07]'
                                                }`}
                                            >
                                                {min}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* AM / PM */}
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60 text-center pb-1">
                                        Meridiem
                                    </span>
                                    {(['AM', 'PM'] as const).map((p) => {
                                        const active = p === parsed.period;
                                        return (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => emit(parsed.hour12, parsed.minute, p)}
                                                className={`no-fluid h-9 rounded-xl text-xs font-extrabold tracking-wide transition-colors cursor-pointer ${
                                                    active
                                                        ? 'bg-primary/18 text-primary border border-primary/35'
                                                        : 'bg-on-surface/[0.04] text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.08] border border-transparent'
                                                }`}
                                            >
                                                {p}
                                            </button>
                                        );
                                    })}

                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        className="no-fluid mt-auto h-8 rounded-xl bg-on-surface/[0.07] hover:bg-primary hover:text-white text-[11px] font-bold text-on-surface flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                    >
                                        <Check size={12} />
                                        Done
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default TimePicker;
