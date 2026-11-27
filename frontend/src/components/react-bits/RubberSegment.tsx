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
    layoutId,
}: RubberSegmentProps<T>) {
    const autoId = useId();
    const activeLayoutId = layoutId || `rubber-segment-${autoId}`;

    const normalizedOptions: RubberSegmentOption<T>[] = options.map((opt) =>
        typeof opt === 'string' ? { id: opt as T, label: opt } : opt
    );

    const sizeStyles = {
        sm: {
            container: 'p-1 rounded-full gap-0.5',
            item: 'px-3 py-1 text-[11px]',
            activePill: 'rounded-full',
        },
        md: {
            container: 'p-1 rounded-full gap-1',
            item: 'px-4 py-1.5 text-xs',
            activePill: 'rounded-full',
        },
        lg: {
            container: 'p-1.5 rounded-full gap-1.5',
            item: 'px-5 py-2 text-sm',
            activePill: 'rounded-full',
        },
    };

    const currentSize = sizeStyles[size] || sizeStyles.md;

    return (
        <div
            role="radiogroup"
            className={`inline-flex items-center bg-surface/75 dark:bg-white/[0.05] border border-primary/18 select-none shadow-xs ${currentSize.container} ${className}`}
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
                        className={`no-fluid relative z-10 flex items-center justify-center gap-1.5 font-bold transition-colors duration-150 cursor-pointer focus:outline-none ${
                            currentSize.item
                        } ${isSelected ? 'text-white' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        {isSelected && (
                            <motion.div
                                layoutId={activeLayoutId}
                                className={`absolute inset-0 z-[-1] bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 shadow-[0_6px_16px_-6px_rgba(99,102,241,0.65)] ${currentSize.activePill}`}
                                transition={{
                                    type: 'spring',
                                    stiffness: 520,
                                    damping: 34,
                                    mass: 0.75,
                                }}
                            />
                        )}

                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        <span className="truncate">{opt.label}</span>

                        {opt.count !== undefined && (
                            <span
                                className={`ml-0.5 text-[10px] font-mono px-1.5 py-0.2 rounded-full transition-colors ${
                                    isSelected
                                        ? 'bg-white/22 text-white'
                                        : 'bg-primary/10 text-primary'
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
