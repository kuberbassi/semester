import React, { useId } from 'react';
import { motion } from 'framer-motion';

interface CometDialProps {
    value: number;
    max?: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    secondaryColor?: string;
    label?: string;
    sublabel?: string;
    className?: string;
    tooltip?: string;
}

/**
 * Theme-aware Liquid Gradient CometDial with dynamic inner typography sizing
 * so 3-digit values like "100%" stay cleanly centered inside compact rings.
 */
export const CometDial: React.FC<CometDialProps> = ({
    value,
    max = 100,
    size = 112,
    strokeWidth = 8,
    color = '#6366f1',
    secondaryColor = '#06b6d4',
    label,
    sublabel,
    className = '',
    tooltip,
}) => {
    const gradId = useId();
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(1, Math.max(0, value / max));
    const strokeDashoffset = circumference - progress * circumference;

    const displayText = `${Math.round(value)}%`;
    const innerDiameter = Math.max(24, size - strokeWidth * 2 - 4);
    const fontScale = displayText.length >= 4 ? 0.27 : 0.31;
    const valueFontPx = Math.max(11, Math.min(24, Math.round(innerDiameter * fontScale)));
    const labelFontPx = Math.max(8, Math.min(10, Math.round(innerDiameter * 0.11)));

    return (
        <div
            className={`relative flex flex-col items-center justify-center shrink-0 ${className}`}
            style={{ width: size, height: size }}
            data-tooltip={tooltip}
        >
            <svg width={size} height={size} className="rotate-[-90deg]">
                <defs>
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={color} />
                        <stop offset="100%" stopColor={secondaryColor} />
                    </linearGradient>
                </defs>

                {/* Theme-aware Track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    className="text-on-surface/[0.09]"
                />

                {/* Vibrant Gradient Progress Arc */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={`url(#${gradId})`}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                    strokeLinecap="round"
                    fill="transparent"
                />
            </svg>

            {/* Center Content — dynamically scaled so 100% never touches the ring */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-1.5">
                <span
                    className="font-display font-extrabold tracking-tight text-on-surface tabular-nums leading-none"
                    style={{ fontSize: `${valueFontPx}px` }}
                >
                    {displayText}
                </span>
                {label && (
                    <span
                        className="font-bold uppercase tracking-wider text-on-surface-variant mt-1 leading-none"
                        style={{ fontSize: `${labelFontPx}px` }}
                    >
                        {label}
                    </span>
                )}
                {sublabel && (
                    <span className="text-[8px] font-medium text-on-surface-variant/65 mt-0.5 leading-none">
                        {sublabel}
                    </span>
                )}
            </div>
        </div>
    );
};
