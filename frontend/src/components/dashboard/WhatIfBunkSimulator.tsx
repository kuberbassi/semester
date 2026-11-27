import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle, ShieldCheck, ArrowRight, Minus, Plus,
    SlidersHorizontal, RotateCcw, CheckCircle2, XCircle
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface WhatIfBunkSimulatorProps {
    overallAttended: number;
    overallTotal: number;
    targetThreshold?: number;
}

/**
 * Super-Simple What-If Attendance Simulator:
 * Just pick how many upcoming classes you plan to Attend or Skip — instant live projection
 * and plain-English verdict with zero confusing window-size math.
 */
export const WhatIfBunkSimulator: React.FC<WhatIfBunkSimulatorProps> = ({
    overallAttended,
    overallTotal,
    targetThreshold = 75,
}) => {
    const [planAttend, setPlanAttend] = useState(0);
    const [planSkip, setPlanSkip] = useState(0);

    const simulatedAttended = overallAttended + planAttend;
    const simulatedTotal = overallTotal + planAttend + planSkip;
    const currentPct = overallTotal > 0 ? (overallAttended / overallTotal) * 100 : 0;
    const projectedPct = simulatedTotal > 0 ? (simulatedAttended / simulatedTotal) * 100 : 0;

    const delta = projectedPct - currentPct;
    const isSafe = projectedPct >= targetThreshold;
    const isWarning = projectedPct >= Math.max(50, targetThreshold - 8) && projectedPct < targetThreshold;
    const hasChanges = planAttend > 0 || planSkip > 0;

    const neededAfter = isSafe || targetThreshold >= 100
        ? 0
        : Math.max(0, Math.ceil((targetThreshold * simulatedTotal - simulatedAttended * 100) / (100 - targetThreshold)));

    const tone = isSafe
        ? {
            text: 'text-indigo-600 dark:text-cyan-300',
            bar: 'bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400',
            pill: 'bg-gradient-to-r from-indigo-500/15 to-cyan-500/15 border-primary/30 text-indigo-600 dark:text-cyan-300',
        }
        : isWarning
        ? {
            text: 'text-amber-600 dark:text-amber-300',
            bar: 'bg-gradient-to-r from-amber-500 to-orange-500',
            pill: 'bg-amber-500/14 border-amber-500/30 text-amber-600 dark:text-amber-300',
        }
        : {
            text: 'text-rose-600 dark:text-rose-400',
            bar: 'bg-gradient-to-r from-rose-500 to-pink-500',
            pill: 'bg-rose-500/14 border-rose-500/30 text-rose-600 dark:text-rose-300',
        };

    const stepAttend = (d: number) => {
        haptics.crownTick();
        setPlanAttend(prev => Math.max(0, Math.min(40, prev + d)));
    };

    const stepSkip = (d: number) => {
        haptics.crownTick();
        setPlanSkip(prev => Math.max(0, Math.min(40, prev + d)));
    };

    return (
        <div className="liquid-glass rounded-[24px] p-5 sm:p-6 flex flex-col justify-between h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-primary/20 text-primary flex items-center justify-center">
                        <SlidersHorizontal size={14} />
                    </span>
                    <div>
                        <h3 className="font-display text-base font-extrabold tracking-tight text-on-surface leading-tight">
                            What-If Simulator
                        </h3>
                        <p className="text-[11px] font-medium text-on-surface-variant/75">
                            Test skipping or attending upcoming classes
                        </p>
                    </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold shrink-0 ${tone.pill}`}>
                    {isSafe ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
                    <span>{isSafe ? 'Safe' : isWarning ? 'Tight' : 'Below Goal'}</span>
                </span>
            </div>

            {/* Live Projection Readout */}
            <div className="rounded-2xl bg-on-surface/[0.03] dark:bg-white/[0.035] border border-on-surface/[0.08] p-4 mb-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <span className="text-[11px] font-semibold text-on-surface-variant block">Now</span>
                        <span className="font-display text-2xl font-extrabold text-on-surface/85 tabular-nums">
                            {currentPct.toFixed(1)}%
                        </span>
                    </div>

                    <ArrowRight size={17} className="text-on-surface-variant/45 shrink-0" />

                    <div className="text-right">
                        <span className="text-[11px] font-semibold text-on-surface-variant block">After Plan</span>
                        <div className="flex items-baseline justify-end gap-2">
                            <motion.span
                                key={projectedPct.toFixed(1)}
                                initial={{ opacity: 0.7, y: 2 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.14 }}
                                className={`font-display text-3xl font-extrabold tracking-tight tabular-nums ${tone.text}`}
                            >
                                {projectedPct.toFixed(1)}%
                            </motion.span>
                            {hasChanges && (
                                <span className={`text-xs font-bold tabular-nums ${delta >= 0 ? 'text-indigo-600 dark:text-cyan-300' : 'text-rose-500 dark:text-rose-400'}`}>
                                    {delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Progress Track with Target Marker */}
                <div className="relative mt-3.5 h-2 rounded-full bg-on-surface/[0.10] overflow-visible">
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${tone.bar}`}
                        style={{ width: `${Math.min(100, Math.max(0, projectedPct))}%` }}
                    />
                    <span
                        className="absolute top-1/2 -translate-y-1/2 w-[2.5px] h-3.5 rounded-full bg-on-surface shadow-sm"
                        style={{ left: `${Math.min(100, Math.max(0, targetThreshold))}%` }}
                        title={`${targetThreshold}% goal`}
                    />
                </div>

                {/* Plain-English Verdict */}
                <p className="mt-3 text-[11px] font-semibold text-on-surface-variant">
                    {!hasChanges
                        ? `Tap + below to simulate attending or skipping classes.`
                        : isSafe
                        ? `You stay ${(projectedPct - targetThreshold).toFixed(1)}% above your ${targetThreshold}% goal.`
                        : `Drops below ${targetThreshold}% — you'd need ${neededAfter} straight ${neededAfter === 1 ? 'class' : 'classes'} to recover.`}
                </p>
            </div>

            {/* Two Crystal-Clear Side-by-Side Steppers */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-2xl bg-indigo-500/[0.06] dark:bg-indigo-500/[0.08] border border-indigo-500/20 p-3 flex flex-col justify-between gap-2.5">
                    <div className="flex items-center gap-1.5 text-indigo-600 dark:text-cyan-300">
                        <CheckCircle2 size={14} />
                        <span className="text-xs font-bold">Attend next</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                        <button
                            type="button"
                            onClick={() => stepAttend(-1)}
                            disabled={planAttend === 0}
                            className="no-fluid w-8 h-8 rounded-full bg-surface/80 dark:bg-white/[0.07] border border-on-surface/[0.10] hover:border-primary/40 text-on-surface disabled:opacity-35 flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Decrease attend count"
                        >
                            <Minus size={13} />
                        </button>
                        <span className="font-display text-xl font-extrabold text-on-surface tabular-nums">
                            {planAttend}
                        </span>
                        <button
                            type="button"
                            onClick={() => stepAttend(1)}
                            className="no-fluid w-8 h-8 rounded-full bg-primary/18 hover:bg-primary hover:text-white border border-primary/30 text-primary flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Increase attend count"
                        >
                            <Plus size={13} />
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl bg-rose-500/[0.06] dark:bg-rose-500/[0.08] border border-rose-500/20 p-3 flex flex-col justify-between gap-2.5">
                    <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                        <XCircle size={14} />
                        <span className="text-xs font-bold">Skip next</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                        <button
                            type="button"
                            onClick={() => stepSkip(-1)}
                            disabled={planSkip === 0}
                            className="no-fluid w-8 h-8 rounded-full bg-surface/80 dark:bg-white/[0.07] border border-on-surface/[0.10] hover:border-rose-400/40 text-on-surface disabled:opacity-35 flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Decrease skip count"
                        >
                            <Minus size={13} />
                        </button>
                        <span className="font-display text-xl font-extrabold text-on-surface tabular-nums">
                            {planSkip}
                        </span>
                        <button
                            type="button"
                            onClick={() => stepSkip(1)}
                            className="no-fluid w-8 h-8 rounded-full bg-rose-500/18 hover:bg-rose-500 hover:text-white border border-rose-500/30 text-rose-500 dark:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Increase skip count"
                        >
                            <Plus size={13} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Human Presets */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => { haptics.crownTick(); setPlanAttend(0); setPlanSkip(3); }}
                    className="no-fluid flex-1 h-8 rounded-full bg-on-surface/[0.05] hover:bg-rose-500/14 border border-on-surface/[0.09] hover:border-rose-500/30 text-[11px] font-bold text-on-surface-variant hover:text-rose-500 dark:hover:text-rose-300 transition-colors cursor-pointer"
                >
                    Skip 1 Day (3)
                </button>
                <button
                    type="button"
                    onClick={() => { haptics.crownTick(); setPlanAttend(5); setPlanSkip(0); }}
                    className="no-fluid flex-1 h-8 rounded-full bg-on-surface/[0.05] hover:bg-primary/14 border border-on-surface/[0.09] hover:border-primary/30 text-[11px] font-bold text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                >
                    Attend 5
                </button>
                <button
                    type="button"
                    onClick={() => { haptics.crownTick(); setPlanAttend(0); setPlanSkip(0); }}
                    disabled={!hasChanges}
                    className="no-fluid h-8 px-3 rounded-full bg-on-surface/[0.05] hover:bg-on-surface/[0.11] border border-on-surface/[0.09] text-[11px] font-bold text-on-surface-variant hover:text-on-surface disabled:opacity-35 inline-flex items-center gap-1 transition-colors cursor-pointer"
                    title="Reset simulation"
                >
                    <RotateCcw size={11} />
                    Reset
                </button>
            </div>
        </div>
    );
};
