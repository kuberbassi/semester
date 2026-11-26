import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { haptics } from '@/utils/haptics';

interface HoldButtonProps {
    children?: React.ReactNode;
    label?: string;
    completedLabel?: string;
    holdDuration?: number;
    holdTime?: number;
    onTrigger?: () => void;
    onComplete?: () => void;
    className?: string;
    variant?: 'danger' | 'warning' | 'emerald' | 'default' | 'primary' | 'secondary';
    title?: string;
    disabled?: boolean;
}

export const HoldButton: React.FC<HoldButtonProps> = ({
    children,
    label,
    completedLabel,
    holdDuration,
    holdTime = 900,
    onTrigger,
    onComplete,
    className = '',
    variant = 'danger',
    title,
    disabled = false,
}) => {
    const duration = holdDuration || holdTime;
    const triggerAction = onComplete || onTrigger || (() => {});
    const [progress, setProgress] = useState(0);
    const [isHolding, setIsHolding] = useState(false);
    const [isTriggered, setIsTriggered] = useState(false);
    const timerRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);

    const startHolding = (e: React.PointerEvent | React.MouseEvent) => {
        e.stopPropagation();
        if (disabled) return;
        setIsHolding(true);
        setIsTriggered(false);
        haptics.light();
        startTimeRef.current = Date.now();

        const tick = () => {
            const elapsed = Date.now() - startTimeRef.current;
            const pct = Math.min(1, elapsed / duration);
            setProgress(pct);

            if (pct >= 1) {
                haptics.success();
                setIsHolding(false);
                setIsTriggered(true);
                setProgress(0);
                triggerAction();
                setTimeout(() => setIsTriggered(false), 1500);
            } else {
                timerRef.current = requestAnimationFrame(tick);
            }
        };

        timerRef.current = requestAnimationFrame(tick);
    };

    const stopHolding = (e: React.PointerEvent | React.MouseEvent) => {
        e.stopPropagation();
        setIsHolding(false);
        setProgress(0);
        if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) cancelAnimationFrame(timerRef.current);
        };
    }, []);

    const variantStyles = {
        danger: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:border-rose-500/50 hover:bg-rose-500/20',
        warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/20',
        primary: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/20',
        secondary: 'bg-white/5 text-white/80 border-white/10 hover:border-white/20 hover:bg-white/10',
        default: 'bg-white/10 text-white border-white/20 hover:border-white/30',
    }[variant];

    const meterBg = {
        danger: 'rgba(244, 63, 94, 0.45)',
        warning: 'rgba(245, 158, 11, 0.45)',
        primary: 'rgba(16, 185, 129, 0.45)',
        emerald: 'rgba(16, 185, 129, 0.45)',
        secondary: 'rgba(255, 255, 255, 0.25)',
        default: 'rgba(255, 255, 255, 0.3)',
    }[variant];

    return (
        <button
            type="button"
            title={title || label || 'Hold to confirm'}
            disabled={disabled}
            onPointerDown={startHolding}
            onPointerUp={stopHolding}
            onPointerLeave={stopHolding}
            onClick={(e) => e.stopPropagation()}
            className={`relative overflow-hidden rounded-xl border font-bold transition-all select-none cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles} ${className}`}
        >
            {/* Liquid Fill Meter */}
            <motion.div
                className="absolute inset-y-0 left-0 -z-10 rounded-xl pointer-events-none"
                style={{
                    width: `${progress * 100}%`,
                    backgroundColor: meterBg,
                    transition: isHolding ? 'none' : 'width 0.18s ease-out',
                }}
            />

            {/* Content Display */}
            <span className="relative z-10 flex items-center justify-center gap-1.5 h-full w-full pointer-events-none">
                {isTriggered ? (
                    completedLabel || '✓ Done!'
                ) : children ? (
                    children
                ) : (
                    <>
                        <span className="opacity-70 text-[10px]">⏳</span>
                        <span>{label || 'Hold'}</span>
                    </>
                )}
            </span>
        </button>
    );
};
