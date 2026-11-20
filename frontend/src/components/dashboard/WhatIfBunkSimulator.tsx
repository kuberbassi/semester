import React, { useState, useId } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface WhatIfBunkSimulatorProps {
    overallAttended: number;
    overallTotal: number;
    targetThreshold?: number;
}

export const WhatIfBunkSimulator: React.FC<WhatIfBunkSimulatorProps> = ({
    overallAttended,
    overallTotal,
    targetThreshold = 75,
}) => {
    const sliderId = useId();
    const [futureClasses, setFutureClasses] = useState(10);
    const [futureBunked, setFutureBunked] = useState(2);
    const [lastBunked, setLastBunked] = useState(2);

    const futureAttended = Math.max(0, futureClasses - futureBunked);
    const simulatedAttended = overallAttended + futureAttended;
    const simulatedTotal = overallTotal + futureClasses;
    const currentPct = overallTotal > 0 ? (overallAttended / overallTotal) * 100 : 0;
    const projectedPct = simulatedTotal > 0 ? (simulatedAttended / simulatedTotal) * 100 : 0;

    const delta = projectedPct - currentPct;
    const isSafe = projectedPct >= targetThreshold;
    const isWarning = projectedPct >= 65 && projectedPct < targetThreshold;

    const statusColor = isSafe ? 'text-emerald-500' : isWarning ? 'text-amber-500' : 'text-red-500';
    const statusBg = isSafe
        ? 'bg-emerald-500/10 border-emerald-500/30'
        : isWarning
        ? 'bg-amber-500/10 border-amber-500/30'
        : 'bg-red-500/10 border-red-500/30';

    const handleSliderChange = (newBunked: number) => {
        if (newBunked !== lastBunked) {
            haptics.crownTick();
            setLastBunked(newBunked);
        }
        setFutureBunked(newBunked);
    };

    return (
        <div className="rounded-xl border border-outline/50 bg-surface p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:border-on-surface/20 transition-all">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Sparkles size={16} />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold text-on-surface">"What-If" Bunk Simulator</h3>
                        <p className="text-[11px] text-on-surface-variant/50">Simulate upcoming college leaves or trips</p>
                    </div>
                </div>
                <div className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${statusBg} ${statusColor}`}>
                    {isSafe ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
                    <span>{isSafe ? 'Eligible' : isWarning ? 'Warning' : 'Critical'}</span>
                </div>
            </div>

            {/* Projection Display */}
            <div className="rounded-xl border border-outline/30 bg-surface-container/30 p-4 my-4 flex items-center justify-around">
                <div className="text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 block">Current</span>
                    <span className="text-2xl font-black text-on-surface">{currentPct.toFixed(1)}%</span>
                </div>

                <ArrowRight size={20} className="text-on-surface-variant/30" />

                <div className="text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 block">Projected</span>
                    <motion.span
                        key={projectedPct.toFixed(1)}
                        initial={{ scale: 0.9, opacity: 0.7 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`text-3xl font-black ${statusColor}`}
                    >
                        {projectedPct.toFixed(1)}%
                    </motion.span>
                    <span className={`block text-[10px] font-bold ${delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                    </span>
                </div>
            </div>

            {/* Interactive Slider */}
            <div className="space-y-4 pt-2">
                <div>
                    <div className="flex justify-between text-xs font-semibold text-on-surface mb-1.5">
                        <label htmlFor={sliderId}>Bunking {futureBunked} of next {futureClasses} classes</label>
                        <span className="text-on-surface-variant/50 font-mono">({futureAttended} attended)</span>
                    </div>
                    <input
                        id={sliderId}
                        type="range"
                        min="0"
                        max={futureClasses}
                        step="1"
                        value={futureBunked}
                        onChange={(e) => handleSliderChange(parseInt(e.target.value, 10))}
                        className="w-full accent-primary h-1.5 bg-outline/30 rounded-lg cursor-pointer"
                        aria-label="Number of upcoming classes to bunk"
                    />
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Presets:</span>
                    {[
                        { label: 'Skip 1 Day (4 classes)', bunk: 4, total: 10 },
                        { label: 'Long Weekend (6 classes)', bunk: 6, total: 12 },
                        { label: 'Attend All (0 bunks)', bunk: 0, total: 10 },
                    ].map((preset) => (
                        <button
                            key={preset.label}
                            onClick={() => {
                                haptics.selection();
                                setFutureClasses(preset.total);
                                setFutureBunked(preset.bunk);
                            }}
                            className="text-[10px] font-bold px-2.5 py-1 rounded-md border border-outline/40 bg-surface-container/20 hover:bg-surface-container text-on-surface transition-colors cursor-pointer"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
