import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { haptics } from '@/utils/haptics';

interface JellyRadioProps<T extends string> {
    options: { value: T; label: string; icon?: ReactNode }[];
    value: T;
    onChange: (val: T) => void;
    className?: string;
    name?: string;
}

export function JellyRadio<T extends string>({
    options,
    value,
    onChange,
    className = '',
}: JellyRadioProps<T>) {
    return (
        <div className={`inline-flex items-center gap-1.5 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-md ${className}`}>
            {options.map((opt) => {
                const isSelected = opt.value === value;

                return (
                    <motion.button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                            haptics.light();
                            onChange(opt.value);
                        }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.94 }}
                        className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer select-none ${
                            isSelected ? 'text-white' : 'text-white/50 hover:text-white/80'
                        }`}
                    >
                        {isSelected && (
                            <motion.div
                                layoutId="jelly-spring-active"
                                className="absolute inset-0 rounded-xl bg-cyan-500/20 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.25)] -z-10"
                                transition={{
                                    type: 'spring',
                                    stiffness: 450,
                                    damping: 24,
                                    mass: 0.8,
                                }}
                            />
                        )}
                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        <span>{opt.label}</span>
                    </motion.button>
                );
            })}
        </div>
    );
}
