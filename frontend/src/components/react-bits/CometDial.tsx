import React from 'react';
import { motion } from 'framer-motion';

interface CometDialProps {
    value: number;
    max?: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    label?: string;
    sublabel?: string;
    className?: string;
}

export const CometDial: React.FC<CometDialProps> = ({
    value,
    max = 100,
    size = 140,
    strokeWidth = 10,
    color = '#10b981',
    label,
    sublabel,
    className = '',
}) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(1, Math.max(0, value / max));
    const strokeDashoffset = circumference - progress * circumference;

    return (
        <div className={`relative flex flex-col items-center justify-center ${className}`} style={{ width: size, height: size }}>
            <svg width={size} height={size} className="rotate-[-90deg]">
                {/* Background Track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />

                {/* Progress Arc */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    strokeLinecap="round"
                    fill="transparent"
                />
            </svg>

            {/* Glowing Comet Head Particle */}
            <motion.div
                className="pointer-events-none absolute h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_12px_#ffffff]"
                style={{
                    top: '50%',
                    left: '50%',
                    transformOrigin: `0px 0px`,
                }}
                animate={{
                    rotate: progress * 360 - 90,
                    x: radius * Math.cos(((progress * 360 - 90) * Math.PI) / 180),
                    y: radius * Math.sin(((progress * 360 - 90) * Math.PI) / 180),
                }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
            />

            {/* Center Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black tracking-tight text-white">
                    {Math.round(value)}%
                </span>
                {label && <span className="text-[9px] font-bold uppercase tracking-wider text-white/50">{label}</span>}
                {sublabel && <span className="text-[8px] text-white/30">{sublabel}</span>}
            </div>
        </div>
    );
};
