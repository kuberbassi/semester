import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { haptics } from '@/utils/haptics';

export interface RubberSegmentOption<T extends string = string> {
    id: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    count?: number;
}

export interface RubberSegmentProps<T extends string = string> {
    options: (RubberSegmentOption<T> | T)[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'white' | 'primary' | 'cyan';
    layoutId?: string;
}

export function RubberSegment<T extends string = string>({
    options,
    value,
    onChange,
    className = '',
    size = 'md',
    variant = 'white',
    layoutId,
}: RubberSegmentProps<T>) {
    const autoId = useId();
    const activeLayoutId = layoutId || `rubber-segment-${autoId}`;

    // Normalize options whether array of strings or array of objects
    const normalizedOptions: RubberSegmentOption<T>[] = options.map((opt) =>
        typeof opt === 'string' ? { id: opt as T, label: opt } : opt
    );

    const sizeStyles = {
        sm: {
            container: 'p-1 rounded-xl gap-0.5',
            item: 'px-2.5 py-1 text-[11px]',
            activePill: 'rounded-lg',
        },
        md: {
            container: 'p-1.5 rounded-2xl gap-1',
            item: 'px-4 py-2 text-xs font-semibold',
            activePill: 'rounded-xl',
        },
        lg: {
            container: 'p-2 rounded-2xl gap-1.5',
            item: 'px-5 py-2.5 text-sm font-semibold',
            activePill: 'rounded-xl',
        },
    };

    const activeTheme = {
        white: {
            pill: 'bg-white text-zinc-950 shadow-[0_2px_12px_rgba(0,0,0,0.25)]',
            inactiveText: 'text-zinc-400 hover:text-white',
            countBadgeActive: 'bg-zinc-200/80 text-zinc-900',
            countBadgeInactive: 'bg-white/[0.08] text-zinc-400',
        },
        primary: {
            pill: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_2px_14px_rgba(99,102,241,0.45)]',
            inactiveText: 'text-zinc-400 hover:text-white',
            countBadgeActive: 'bg-white/20 text-white',
            countBadgeInactive: 'bg-white/[0.08] text-zinc-400',
        },
        cyan: {
            pill: 'bg-gradient-to-r from-cyan-500 to-blue-500 text-black font-bold shadow-[0_2px_14px_rgba(6,182,212,0.45)]',
            inactiveText: 'text-zinc-400 hover:text-white',
            countBadgeActive: 'bg-black/20 text-black',
            countBadgeInactive: 'bg-white/[0.08] text-zinc-400',
        },
    }[variant];

    const currentSize = sizeStyles[size] || sizeStyles.md;

    return (
        <div
            role="radiogroup"
            className={`inline-flex items-center bg-[#18181b]/90 dark:bg-[#18181b]/90 light:bg-zinc-900/90 border border-white/[0.08] backdrop-blur-xl shadow-inner select-none ${currentSize.container} ${className}`}
        >
            {normalizedOptions.map((opt) => {
                const isSelected = value === opt.id;

                return (
                    <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                            if (value !== opt.id) {
                                haptics.selection();
                                onChange(opt.id);
                            }
                        }}
                        className={`relative z-10 flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer active:scale-[0.97] focus:outline-none ${
                            currentSize.item
                        } ${isSelected ? 'font-bold' : activeTheme.inactiveText}`}
                    >
                        {/* Active Rubber Pill Indicator */}
                        {isSelected && (
                            <motion.div
                                layoutId={activeLayoutId}
                                className={`absolute inset-0 z-[-1] ${activeTheme.pill} ${currentSize.activePill}`}
                                transition={{
                                    type: 'spring',
                                    stiffness: 480,
                                    damping: 30,
                                    mass: 0.8,
                                }}
                            />
                        )}

                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        <span className="truncate">{opt.label}</span>

                        {opt.count !== undefined && (
                            <span
                                className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full transition-colors ${
                                    isSelected
                                        ? activeTheme.countBadgeActive
                                        : activeTheme.countBadgeInactive
                                }`}
                            >
                                {opt.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
