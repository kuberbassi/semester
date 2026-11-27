import React, { useId, useState } from 'react';
import { ShieldCheck, AlertTriangle, Stethoscope, Target, CheckCircle2 } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface FullCardLiquidFillProps {
    percentage: number;
    attended: number;
    total: number;
    safeBunks: number;
    deficitCount: number;
    medicalLeaveCount?: number;
    attendanceWithoutMedical?: number;
    targetThreshold?: number;
    className?: string;
    onSlosh?: () => void;
}

/**
 * 120FPS GPU-Accelerated Multi-Stop Gradient Liquid Glass Reservoir:
 * Dual flowing SVG wave crests with vibrant gradient sheen, bold Bricolage display numeral,
 * and rich contrasty stat tiles in both Light and Dark themes.
 */
export const FullCardLiquidFill: React.FC<FullCardLiquidFillProps> = ({
    percentage,
    attended,
    total,
    safeBunks,
    deficitCount,
    medicalLeaveCount = 0,
    attendanceWithoutMedical,
    targetThreshold = 75,
    className = '',
    onSlosh,
}) => {
    const gradId = useId();
    const [rippling, setRippling] = useState(false);

    const clampedPct = Math.min(100, Math.max(0, percentage));
    const isSafe = clampedPct >= targetThreshold;
    const isWarning = clampedPct >= targetThreshold - 10 && clampedPct < targetThreshold;

    const tone = isSafe
        ? {
            stopA: '#6366f1',
            stopB: '#06b6d4',
            stopC: '#8b5cf6',
            dot: 'bg-gradient-to-r from-indigo-500 to-cyan-400',
            text: 'text-indigo-600 dark:text-cyan-300',
            badge: 'bg-indigo-500/12 border-indigo-500/25 text-indigo-600 dark:text-indigo-300',
        }
        : isWarning
        ? {
            stopA: '#f59e0b',
            stopB: '#f97316',
            stopC: '#fb7185',
            dot: 'bg-gradient-to-r from-amber-500 to-orange-500',
            text: 'text-amber-600 dark:text-amber-300',
            badge: 'bg-amber-500/12 border-amber-500/25 text-amber-600 dark:text-amber-300',
        }
        : {
            stopA: '#f43f5e',
            stopB: '#ec4899',
            stopC: '#a855f7',
            dot: 'bg-gradient-to-r from-rose-500 to-pink-500',
            text: 'text-rose-600 dark:text-rose-300',
            badge: 'bg-rose-500/12 border-rose-500/25 text-rose-600 dark:text-rose-300',
        };

    const handleCardClick = () => {
        haptics.crownTick();
        setRippling(true);
        setTimeout(() => setRippling(false), 500);
        onSlosh?.();
    };

    const fillHeight = `${Math.max(12, Math.min(94, clampedPct))}%`;

    return (
        <div
            onClick={handleCardClick}
            className={`liquid-glass group relative overflow-hidden rounded-[28px] p-6 sm:p-7 cursor-pointer select-none flex flex-col justify-between ${rippling ? 'liquid-rippling' : ''} ${className}`}
            title="Click to ripple liquid"
        >
            {/* GPU-Accelerated Multi-Stop Gradient Liquid Layers */}
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 transition-[height,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                    height: fillHeight,
                    transform: rippling ? 'scaleY(1.045)' : 'scaleY(1)',
                    transformOrigin: 'bottom',
                    contain: 'paint',
                }}
            >
                {/* Back luminous wave crest */}
                <div className="absolute -top-5 left-0 right-0 h-6 overflow-hidden">
                    <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="liquid-wave-track-slow h-full">
                        <defs>
                            <linearGradient id={`${gradId}-back`} x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor={tone.stopB} stopOpacity="0.22" />
                                <stop offset="50%" stopColor={tone.stopC} stopOpacity="0.24" />
                                <stop offset="100%" stopColor={tone.stopB} stopOpacity="0.22" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M0 10 Q 25 2 50 10 T 100 10 T 150 10 T 200 10 L 200 20 L 0 20 Z"
                            fill={`url(#${gradId}-back)`}
                        />
                    </svg>
                </div>

                {/* Front vibrant gradient wave crest */}
                <div className="absolute -top-3.5 left-0 right-0 h-5 overflow-hidden">
                    <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="liquid-wave-track h-full">
                        <defs>
                            <linearGradient id={`${gradId}-front`} x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor={tone.stopA} stopOpacity="0.34" />
                                <stop offset="50%" stopColor={tone.stopB} stopOpacity="0.36" />
                                <stop offset="100%" stopColor={tone.stopA} stopOpacity="0.34" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M0 10 Q 25 18 50 10 T 100 10 T 150 10 T 200 10 L 200 20 L 0 20 Z"
                            fill={`url(#${gradId}-front)`}
                        />
                    </svg>
                </div>

                {/* Translucent gradient fluid body */}
                <div
                    className="w-full h-full"
                    style={{
                        background: `linear-gradient(155deg, ${tone.stopA}42 0%, ${tone.stopB}2c 52%, ${tone.stopC}12 100%)`,
                    }}
                />
            </div>

            {/* Foreground Content */}
            <div className="relative z-10 flex flex-col justify-between h-full gap-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${tone.dot} shadow-sm`} />
                        <span className="font-display text-sm font-bold tracking-tight text-on-surface">
                            Attendance Pulse
                        </span>
                    </div>
                    <div
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold ${tone.badge}`}
                        title={`Minimum target: ${targetThreshold}%`}
                    >
                        <Target size={12} />
                        <span className="tabular-nums">{targetThreshold}% Goal</span>
                    </div>
                </div>

                <div className="my-auto py-3">
                    <div className="font-display text-6xl sm:text-[76px] font-extrabold tracking-tighter text-on-surface leading-none tabular-nums">
                        {clampedPct.toFixed(1)}
                        <span className={`text-3xl font-bold ml-1 ${tone.text}`}>%</span>
                    </div>
                    <div className="mt-3.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface/90 dark:bg-[#141722]/90 border border-on-surface/[0.09] text-xs font-bold text-on-surface tabular-nums">
                        <CheckCircle2 size={14} className={tone.text} />
                        <span>{attended} / {total} Classes Attended</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-3.5 border-t border-on-surface/[0.09]">
                    <div
                        className="rounded-2xl bg-surface/90 dark:bg-[#141722]/90 border border-indigo-500/20 px-3 py-2.5 flex flex-col gap-1"
                        title="Safe bunks remaining"
                    >
                        <div className="flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-indigo-500 dark:text-cyan-400 shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Safe</span>
                        </div>
                        <span className="font-display text-lg font-extrabold text-on-surface tabular-nums leading-none">
                            +{safeBunks}
                        </span>
                    </div>

                    <div
                        className="rounded-2xl bg-surface/90 dark:bg-[#141722]/90 border border-rose-500/20 px-3 py-2.5 flex flex-col gap-1"
                        title="Courses below target"
                    >
                        <div className="flex items-center gap-1.5">
                            <AlertTriangle size={14} className={deficitCount > 0 ? 'text-rose-500 shrink-0' : 'text-on-surface-variant/60 shrink-0'} />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Risk</span>
                        </div>
                        <span className={`font-display text-lg font-extrabold tabular-nums leading-none ${deficitCount > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-on-surface'}`}>
                            {deficitCount}
                        </span>
                    </div>

                    <div
                        className="rounded-2xl bg-surface/90 dark:bg-[#141722]/90 border border-violet-500/20 px-3 py-2.5 flex flex-col gap-1"
                        title={attendanceWithoutMedical !== undefined ? `${medicalLeaveCount} medical leaves (${attendanceWithoutMedical.toFixed(1)}% raw)` : 'Medical leaves'}
                    >
                        <div className="flex items-center gap-1.5">
                            <Stethoscope size={14} className="text-violet-500 dark:text-violet-400 shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Med</span>
                        </div>
                        <span className="font-display text-lg font-extrabold text-on-surface tabular-nums leading-none">
                            {medicalLeaveCount}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
