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
}

export const HoldButton: React.FC<HoldButtonProps> = ({
    children,
    label,
    completedLabel,
    holdDuration,
    holdTime = 1200,
    onTrigger,
    onComplete,
    className = '',
    variant = 'primary',
}) => {
    const duration = holdDuration || holdTime;
    const triggerAction = onComplete || onTrigger || (() => {});
    const [progress, setProgress] = useState(0);
    const [isHolding, setIsHolding] = useState(false);
    const [isTriggered, setIsTriggered] = useState(false);
    const timerRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);

    const startHolding = (e: React.PointerEvent) => {
        e.preventDefault();
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

    const stopHolding = () => {
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
        primary: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 meter-emerald-500',
        danger: 'bg-rose-500/10 text-rose-400 border-rose-500/30 meter-rose-500',
        warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30 meter-amber-500',
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 meter-emerald-500',
        secondary: 'bg-white/5 text-white/80 border-white/10 meter-white/30',
        default: 'bg-white/10 text-white border-white/20 meter-white',
    }[variant];

    const meterBg = {
        primary: 'rgba(16, 185, 129, 0.35)',
        danger: 'rgba(244, 63, 94, 0.35)',
        warning: 'rgba(245, 158, 11, 0.35)',
        emerald: 'rgba(16, 185, 129, 0.35)',
        secondary: 'rgba(255, 255, 255, 0.2)',
        default: 'rgba(255, 255, 255, 0.25)',
    }[variant];

    return (
        <button
            type="button"
            onPointerDown={startHolding}
            onPointerUp={stopHolding}
            onPointerLeave={stopHolding}
            className={`relative overflow-hidden rounded-xl border px-3 py-1.5 text-xs font-bold transition-all select-none cursor-pointer active:scale-95 ${variantStyles} ${className}`}
        >
            {/* Liquid Fill Meter */}
            <motion.div
                className="absolute inset-y-0 left-0 -z-10 rounded-xl"
                style={{
                    width: `${progress * 100}%`,
                    backgroundColor: meterBg,
                    transition: isHolding ? 'none' : 'width 0.2s ease-out',
                }}
            />

            <span className="relative z-10 flex items-center justify-center gap-1.5">
                {isTriggered ? (
                    completedLabel || '✓ Done!'
                ) : children ? (
                    children
                ) : (
                    <>
                        <span className="opacity-70">↺</span>
                        <span>{label || 'Hold'}</span>
                    </>
                )}
            </span>
        </button>
    );
};
