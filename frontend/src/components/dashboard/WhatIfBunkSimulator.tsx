import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { WakeSlider } from '@/components/react-bits/WakeSlider';
import { ScrubField } from '@/components/react-bits/ScrubField';
import { JellyRadio } from '@/components/react-bits/JellyRadio';

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
    const [futureClasses, setFutureClasses] = useState(10);
    const [futureBunked, setFutureBunked] = useState(2);
    const [presetChoice, setPresetChoice] = useState('custom');

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

    const handlePreset = (id: string) => {
        setPresetChoice(id);
        haptics.selection();
        if (id === 'skip1') {
            setFutureClasses(10);
            setFutureBunked(4);
        } else if (id === 'weekend') {
            setFutureClasses(12);
            setFutureBunked(6);
        } else if (id === 'attendAll') {
            setFutureClasses(10);
            setFutureBunked(0);
        }
    };

    return (
        <div className="rounded-2xl border border-outline/50 bg-surface/90 backdrop-blur-xl p-5 sm:p-6 shadow-2xl hover:border-on-surface/20 transition-all">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                        <Sparkles size={16} />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold text-on-surface tracking-tight">"What-If" Bunk Simulator</h3>
                        <p className="text-[11px] text-on-surface-variant/50">Simulate upcoming college leaves or trips with spring physics</p>
                    </div>
                </div>
                <div className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm ${statusBg} ${statusColor}`}>
                    {isSafe ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
                    <span>{isSafe ? 'Eligible' : isWarning ? 'Warning' : 'Critical'}</span>
                </div>
            </div>

            {/* Projection Display */}
            <div className="rounded-xl border border-white/10 bg-surface-container/30 backdrop-blur-md p-4 my-4 flex items-center justify-around">
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
                        className={`text-3xl font-black ${statusColor} drop-shadow-md`}
                    >
                        {projectedPct.toFixed(1)}%
                    </motion.span>
                    <span className={`block text-[10px] font-bold ${delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                    </span>
                </div>
            </div>

            {/* Precision Controls */}
            <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-container/20 p-3 rounded-xl border border-outline/30">
                    <div className="text-xs font-semibold text-on-surface">
                        Upcoming Total Classes:
                    </div>
                    <ScrubField
                        variant="compact"
                        value={futureClasses}
                        onChange={(val) => {
                            setFutureClasses(val);
                            if (futureBunked > val) setFutureBunked(val);
                            setPresetChoice('custom');
                        }}
                        min={1}
                        max={60}
                        step={1}
                        label="Classes window"
                        unit=" cls"
                    />
                </div>

                {/* React Bits WakeSlider with luminous particle wake */}
                <div>
                    <WakeSlider
                        label={`Bunking ${futureBunked} classes (${futureAttended} attended)`}
                        min={0}
                        max={futureClasses}
                        step={1}
                        value={futureBunked}
                        unit=" bunks"
                        onChange={(val) => {
                            setFutureBunked(val);
                            setPresetChoice('custom');
                        }}
                    />
                </div>

                {/* React Bits JellyRadio for Presets */}
                <div className="pt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40 block mb-2">
                        Quick Scenarios (Jelly Spring):
                    </span>
                    <JellyRadio
                        options={[
                            { value: 'custom', label: 'Custom' },
                            { value: 'skip1', label: 'Skip 1 Day (4)' },
                            { value: 'weekend', label: 'Long Weekend (6)' },
                            { value: 'attendAll', label: 'Attend All (0)' },
                        ]}
                        value={presetChoice}
                        onChange={handlePreset}
                    />
                </div>
            </div>
        </div>
    );
};
