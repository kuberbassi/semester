import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Activity, Shield, Sparkles } from 'lucide-react';
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
    const cardRef = useRef<HTMLDivElement>(null);
    const wave1Ref = useRef<SVGPathElement>(null);
    const wave2Ref = useRef<SVGPathElement>(null);
    const [sloshEnergy, setSloshEnergy] = useState(0);

    const clampedPct = Math.min(100, Math.max(0, percentage));
    const isSafe = clampedPct >= targetThreshold;
    const isWarning = clampedPct >= targetThreshold - 10 && clampedPct < targetThreshold;

    // Palette selection matching Framer aurora aesthetic
    const gradientColors = isSafe
        ? {
              top: 'from-emerald-500/30 via-teal-500/25 to-cyan-500/35',
              surface: '#10b981',
              ambient: 'rgba(16, 185, 129, 0.25)',
              stroke: '#34d399',
          }
        : isWarning
        ? {
              top: 'from-amber-500/30 via-orange-500/25 to-yellow-500/35',
              surface: '#f59e0b',
              ambient: 'rgba(245, 158, 11, 0.25)',
              stroke: '#fbbf24',
          }
        : {
              top: 'from-rose-500/30 via-red-500/25 to-pink-500/35',
              surface: '#f43f5e',
              ambient: 'rgba(244, 63, 94, 0.25)',
              stroke: '#fb7185',
          };

    // GSAP sinusoidal wave fluid simulation
    useEffect(() => {
        let frameId: number;
        let time = 0;

        const animate = () => {
            time += 0.04;

            // Height offset: 0% is bottom (100 in SVG viewBox Y), 100% is top (0 in SVG viewBox Y)
            const targetY = 100 - clampedPct;
            const amp1 = 4 + sloshEnergy * 10;
            const amp2 = 3 + sloshEnergy * 8;

            const w1_y1 = targetY + Math.sin(time * 1.5) * amp1;
            const w1_y2 = targetY + Math.sin(time * 1.5 + Math.PI * 0.5) * amp1;
            const w1_y3 = targetY + Math.sin(time * 1.5 + Math.PI) * amp1;

            const w2_y1 = targetY + Math.cos(time * 1.2) * amp2;
            const w2_y2 = targetY + Math.cos(time * 1.2 + Math.PI * 0.7) * amp2;
            const w2_y3 = targetY + Math.cos(time * 1.2 + Math.PI * 1.4) * amp2;

            if (wave1Ref.current) {
                wave1Ref.current.setAttribute(
                    'd',
                    `M 0 100 L 0 ${w1_y1} Q 25 ${w1_y2} 50 ${targetY} T 100 ${w1_y3} L 100 100 Z`
                );
            }

            if (wave2Ref.current) {
                wave2Ref.current.setAttribute(
                    'd',
                    `M 0 100 L 0 ${w2_y1} Q 25 ${w2_y2} 50 ${targetY} T 100 ${w2_y3} L 100 100 Z`
                );
            }

            frameId = requestAnimationFrame(animate);
        };

        frameId = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(frameId);
    }, [clampedPct, sloshEnergy]);

    // Handle physical slosh on tap
    const handleCardClick = () => {
        haptics.medium();
        setSloshEnergy(1);
        gsap.to(
            {},
            {
                duration: 1.5,
                onUpdate: function () {
                    setSloshEnergy(1 - this.progress());
                },
                ease: 'power2.out',
            }
        );
        onSlosh?.();
    };

    return (
        <div
            ref={cardRef}
            onClick={handleCardClick}
            className={`group relative overflow-hidden rounded-3xl bg-[#0b0b0e] border border-white/[0.1] backdrop-blur-2xl p-7 transition-all duration-300 hover:border-white/[0.22] hover:shadow-[0_0_50px_rgba(0,0,0,0.8)] cursor-pointer select-none ${className}`}
            style={{
                boxShadow: `0 20px 50px -10px ${gradientColors.ambient}, inset 0 1px 1px rgba(255, 255, 255, 0.1)`,
            }}
        >
            {/* Ambient Background Aura Glow behind liquid */}
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
                style={{
                    background: `radial-gradient(circle at 50% 100%, ${gradientColors.ambient}, transparent 70%)`,
                }}
            />

            {/* Full Card Animated SVG Liquid Layers */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full"
                >
                    <defs>
                        {/* Primary wave gradient */}
                        <linearGradient id="liquidGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={gradientColors.surface} stopOpacity="0.45" />
                            <stop offset="50%" stopColor={gradientColors.surface} stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#050508" stopOpacity="0.85" />
                        </linearGradient>

                        {/* Back crest wave gradient */}
                        <linearGradient id="liquidGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={gradientColors.surface} stopOpacity="0.30" />
                            <stop offset="60%" stopColor={gradientColors.surface} stopOpacity="0.15" />
                            <stop offset="100%" stopColor="#020204" stopOpacity="0.95" />
                        </linearGradient>
                    </defs>

                    {/* Background wave */}
                    <path ref={wave2Ref} fill="url(#liquidGrad2)" />

                    {/* Foreground wave */}
                    <path ref={wave1Ref} fill="url(#liquidGrad1)" />

                    {/* Specular glowing meniscus line at liquid surface */}
                    <line
                        x1="0"
                        y1={100 - clampedPct}
                        x2="100"
                        y2={100 - clampedPct}
                        stroke={gradientColors.stroke}
                        strokeWidth="0.8"
                        strokeOpacity="0.75"
                        strokeDasharray="2, 1"
                    />
                </svg>

                {/* Floating micro-bubbles / froth particles in fluid */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <div className="absolute bottom-8 left-1/4 w-1.5 h-1.5 rounded-full bg-white animate-ping" style={{ animationDuration: '3s' }} />
                    <div className="absolute bottom-16 right-1/3 w-1 h-1 rounded-full bg-white animate-ping" style={{ animationDuration: '4s' }} />
                </div>
            </div>

            {/* Card Content (Layered over the fluid with glassmorphic backdrop) */}
            <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
                
                {/* Top Badge Strip */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/70">
                            Academic Health Reservoir
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/[0.12] backdrop-blur-md">
                        <Activity size={12} className={isSafe ? 'text-emerald-400' : 'text-amber-400'} />
                        <span className="text-[10px] font-bold text-white/90">
                            {isSafe ? 'Safe Zone' : isWarning ? 'Warning' : 'Critical Deficit'}
                        </span>
                    </div>
                </div>

                {/* Giant Metric Display with Frosted Glass Numbers */}
                <div className="py-2">
                    <div className="flex items-baseline gap-3">
                        <h1 className="text-6xl sm:text-7xl font-black tracking-tighter text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
                            {clampedPct.toFixed(1)}%
                        </h1>
                        <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">
                            Live Fluid
                        </span>
                    </div>

                    {/* Class count pill */}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-white/80">
                        <div className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.08] backdrop-blur-md flex items-center gap-2">
                            <span className="text-white/40">Attended:</span>
                            <span className="text-white font-mono font-bold">{attended} / {total} Classes</span>
                        </div>
                        {safeBunks > 0 && (
                            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold backdrop-blur-md flex items-center gap-1.5">
                                <Sparkles size={12} />
                                <span>{safeBunks} Bunks Available</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Secondary Insight Row (Medical & Progress) */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="rounded-2xl bg-black/40 border border-white/[0.08] p-3.5 backdrop-blur-md">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40 block mb-1">
                            Medical Adjusted
                        </span>
                        <div className="flex items-baseline justify-between">
                            <span className="text-lg font-bold text-white">
                                {attendanceWithoutMedical ? attendanceWithoutMedical.toFixed(1) : clampedPct.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">
                                {medicalLeaveCount} Leaves
                            </span>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-black/40 border border-white/[0.08] p-3.5 backdrop-blur-md">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40 block mb-1">
                            Deficit Risks
                        </span>
                        <div className="flex items-baseline justify-between">
                            <span className={`text-lg font-bold ${deficitCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {deficitCount} {deficitCount === 1 ? 'Subject' : 'Subjects'}
                            </span>
                            <Shield size={14} className={deficitCount > 0 ? 'text-rose-400' : 'text-emerald-400'} />
                        </div>
                    </div>
                </div>

                {/* Bottom Interactive Tap Hint */}
                <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-[10px] text-white/40 font-medium">
                    <span>Tap card to induce physical wave slosh</span>
                    <span className="text-white/60 group-hover:text-white transition-colors">Target: {targetThreshold}%</span>
                </div>
            </div>
        </div>
    );
};
