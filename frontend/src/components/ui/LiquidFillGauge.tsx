import React, { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { haptics } from '@/utils/haptics';

interface LiquidFillGaugeProps {
    percentage: number;
    size?: number;
    targetThreshold?: number;
    sublabel?: string;
    onClick?: () => void;
}

export const LiquidFillGauge: React.FC<LiquidFillGaugeProps> = ({
    percentage,
    size = 180,
    targetThreshold = 75,
    sublabel = 'Attendance Health',
    onClick,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wave1Ref = useRef<SVGPathElement>(null);
    const wave2Ref = useRef<SVGPathElement>(null);
    const [isSloshing, setIsSloshing] = useState(false);

    // Clamped percentage
    const clampedPct = Math.max(0, Math.min(100, percentage));
    const isSafe = clampedPct >= targetThreshold;
    const isWarning = clampedPct >= 65 && clampedPct < targetThreshold;

    // Fluid theme colors
    const primaryColor = isSafe ? '#10B981' : isWarning ? '#F59E0B' : '#EF4444';
    const secondaryColor = isSafe ? '#059669' : isWarning ? '#D97706' : '#DC2626';
    const glowColor = isSafe
        ? 'rgba(16, 185, 129, 0.25)'
        : isWarning
        ? 'rgba(245, 158, 11, 0.25)'
        : 'rgba(239, 68, 68, 0.25)';

    // Wave parameters
    const fillLevel = size * (1 - clampedPct / 100);

    // Dynamic wave animation loop via requestAnimationFrame & GSAP
    useEffect(() => {
        let animationFrameId: number;
        let step = 0;

        const animateWaves = () => {
            step += 0.04;
            const amp1 = isSloshing ? 14 : 7;
            const amp2 = isSloshing ? 10 : 5;

            // Generate cubic bezier wave 1 path
            const y1 = fillLevel;
            const points1 = [];
            for (let x = 0; x <= size; x += 10) {
                const dy = Math.sin(step + (x / 25)) * amp1;
                points1.push(`${x},${y1 + dy}`);
            }
            const d1 = `M 0,${size} L 0,${y1} ` +
                points1.map(p => `L ${p}`).join(' ') +
                ` L ${size},${size} Z`;

            // Generate wave 2 path (phase shifted)
            const y2 = fillLevel;
            const points2 = [];
            for (let x = 0; x <= size; x += 10) {
                const dy = Math.cos(step * 0.8 + (x / 20)) * amp2;
                points2.push(`${x},${y2 + dy}`);
            }
            const d2 = `M 0,${size} L 0,${y2} ` +
                points2.map(p => `L ${p}`).join(' ') +
                ` L ${size},${size} Z`;

            if (wave1Ref.current) wave1Ref.current.setAttribute('d', d1);
            if (wave2Ref.current) wave2Ref.current.setAttribute('d', d2);

            animationFrameId = requestAnimationFrame(animateWaves);
        };

        animationFrameId = requestAnimationFrame(animateWaves);
        return () => cancelAnimationFrame(animationFrameId);
    }, [clampedPct, fillLevel, isSloshing, size]);

    // Handle interactive fluid slosh on click / tap
    const handleTap = useCallback(() => {
        haptics.crownTick();
        setIsSloshing(true);

        // Micro bounce scale with GSAP
        if (containerRef.current) {
            gsap.timeline()
                .to(containerRef.current, { scale: 0.94, duration: 0.12, ease: 'power2.out' })
                .to(containerRef.current, { scale: 1.04, duration: 0.22, ease: 'elastic.out(1, 0.4)' })
                .to(containerRef.current, { scale: 1.0, duration: 0.18, ease: 'power2.inOut' });
        }

        setTimeout(() => setIsSloshing(false), 900);
        if (onClick) onClick();
    }, [onClick]);

    return (
        <div
            ref={containerRef}
            onClick={handleTap}
            className="relative flex flex-col items-center justify-center cursor-pointer select-none group transition-transform"
            style={{ width: size, height: size }}
            title="Click to agitate liquid"
        >
            {/* Outer Specular Glow Ring */}
            <div
                className="absolute inset-0 rounded-full transition-all duration-700 pointer-events-none"
                style={{
                    boxShadow: `0 0 24px ${glowColor}, inset 0 0 16px rgba(255, 255, 255, 0.08)`,
                    border: `1.5px solid ${primaryColor}40`,
                }}
            />

            {/* SVG Mask Container */}
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="rounded-full overflow-hidden"
            >
                <defs>
                    <linearGradient id="waveGradFront" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={primaryColor} stopOpacity="0.85" />
                        <stop offset="100%" stopColor={secondaryColor} stopOpacity="0.95" />
                    </linearGradient>
                    <linearGradient id="waveGradBack" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={primaryColor} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={secondaryColor} stopOpacity="0.5" />
                    </linearGradient>
                </defs>

                {/* Background Sphere Fluid Reservoir */}
                <circle cx={size / 2} cy={size / 2} r={size / 2} fill="#18181B" />

                {/* Back Wave (Parallax) */}
                <path ref={wave2Ref} fill="url(#waveGradBack)" />

                {/* Front Wave */}
                <path ref={wave1Ref} fill="url(#waveGradFront)" />

                {/* Glass Highlights */}
                <ellipse
                    cx={size * 0.35}
                    cy={size * 0.22}
                    rx={size * 0.2}
                    ry={size * 0.08}
                    fill="rgba(255, 255, 255, 0.12)"
                    transform={`rotate(-25 ${size * 0.35} ${size * 0.22})`}
                />
            </svg>

            {/* Central Holographic Percentage Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none drop-shadow-md">
                <span className="text-3xl font-black tracking-tight text-white font-mono leading-none">
                    {clampedPct.toFixed(1)}%
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300/80 mt-1">
                    {sublabel}
                </span>
            </div>
        </div>
    );
};
