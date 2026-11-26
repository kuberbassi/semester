import { motion } from 'framer-motion';
import { haptics } from '@/utils/haptics';

export interface GlideOption<T extends string> {
    id: T;
    label: string;
    count?: number;
}

interface GlideSelectProps<T extends string> {
    options: readonly (T | GlideOption<T>)[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
    labelMap?: Partial<Record<T, string>>;
}

export function GlideSelect<T extends string>({
    options,
    value,
    onChange,
    className = '',
    labelMap = {},
}: GlideSelectProps<T>) {
    return (
        <div className={`relative flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.08] backdrop-blur-md ${className}`}>
            {options.map((opt) => {
                const optId = (typeof opt === 'object' && opt !== null ? opt.id : opt) as T;
                const optLabel = typeof opt === 'object' && opt !== null ? opt.label : labelMap[optId] || optId;
                const optCount = typeof opt === 'object' && opt !== null ? opt.count : undefined;
                const isSelected = optId === value;

                return (
                    <button
                        key={optId}
                        type="button"
                        onClick={() => {
                            haptics.light();
                            onChange(optId);
                        }}
                        className={`relative z-10 flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            isSelected ? 'text-white' : 'text-white/50 hover:text-white/80'
                        }`}
                    >
                        {isSelected && (
                            <motion.div
                                layoutId="glide-active-pill"
                                className="absolute inset-0 rounded-lg bg-white/[0.12] border border-white/[0.2] shadow-sm -z-10"
                                transition={{
                                    type: 'spring',
                                    stiffness: 400,
                                    damping: 30,
                                }}
                            />
                        )}
                        <span>{optLabel}</span>
                        {optCount !== undefined && (
                            <span className={`text-[10px] font-mono ${isSelected ? 'opacity-80' : 'opacity-40'}`}>
                                {optCount}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
