import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, RotateCcw, ShieldAlert, Timer } from 'lucide-react';
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

/**
 * Tactile Press-and-Hold Safety Pill:
 * Uses crisp intentional Lucide icons (zero emojis), theme-aware high contrast,
 * and a smooth liquid progress fill bar.
 */
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
                setTimeout(() => setIsTriggered(false), 1400);
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
        danger: 'bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/30 hover:border-rose-500/55 hover:bg-rose-500/18',
        warning: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:border-amber-500/55 hover:bg-amber-500/18',
        primary: 'bg-primary/12 text-primary border-primary/25 hover:border-primary/50 hover:bg-primary/18',
        emerald: 'bg-primary/12 text-primary border-primary/25 hover:border-primary/50 hover:bg-primary/18',
        secondary: 'bg-on-surface/[0.06] text-on-surface border-on-surface/15 hover:border-on-surface/30 hover:bg-on-surface/[0.10]',
        default: 'bg-on-surface/[0.08] text-on-surface border-on-surface/15 hover:border-on-surface/30',
    }[variant];

    const meterBg = {
        danger: 'rgba(244, 63, 94, 0.35)',
        warning: 'rgba(245, 158, 11, 0.35)',
        primary: 'rgba(99, 102, 241, 0.35)',
        emerald: 'rgba(99, 102, 241, 0.35)',
        secondary: 'rgba(148, 163, 184, 0.30)',
        default: 'rgba(148, 163, 184, 0.30)',
    }[variant];

    const renderLeadingIcon = () => {
        if (variant === 'danger') return <ShieldAlert size={13} className="shrink-0" />;
        if (label?.toLowerCase().includes('reset')) return <RotateCcw size={12} className="shrink-0" />;
        return <Timer size={12} className="shrink-0" />;
    };

    return (
        <button
            type="button"
            title={title || label || 'Hold to confirm'}
            disabled={disabled}
            onPointerDown={startHolding}
            onPointerUp={stopHolding}
            onPointerLeave={stopHolding}
            onClick={(e) => e.stopPropagation()}
            className={`no-fluid relative overflow-hidden rounded-full border font-bold transition-all select-none cursor-pointer active:scale-[0.97] disabled:opacity-45 disabled:cursor-not-allowed ${variantStyles} ${className}`}
        >
            {/* Liquid Progress Fill */}
            <motion.div
                className="absolute inset-y-0 left-0 pointer-events-none"
                style={{
                    width: `${progress * 100}%`,
                    backgroundColor: meterBg,
                    transition: isHolding ? 'none' : 'width 0.18s ease-out',
                }}
            />

            {/* Content Display */}
            <span className="relative z-10 flex items-center justify-center gap-1.5 h-full w-full pointer-events-none">
                {isTriggered ? (
                    <>
                        <Check size={13} strokeWidth={2.6} />
                        <span>{completedLabel || 'Done'}</span>
                    </>
                ) : children ? (
                    children
                ) : (
                    <>
                        {renderLeadingIcon()}
                        <span>{label || 'Hold'}</span>
                    </>
                )}
            </span>
        </button>
    );
};
