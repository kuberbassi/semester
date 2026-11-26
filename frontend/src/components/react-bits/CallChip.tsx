import React from 'react';

type ChipVariant = 'emerald' | 'amber' | 'rose' | 'cyan' | 'purple' | 'neutral' | 'success' | 'danger';

interface CallChipProps {
    label: string;
    variant?: ChipVariant;
    pulse?: boolean;
    className?: string;
    icon?: React.ReactNode;
}

export const CallChip: React.FC<CallChipProps> = ({
    label,
    variant = 'emerald',
    pulse = true,
    className = '',
    icon,
}) => {
    const normalizedVariant = variant === 'success' ? 'emerald' : variant === 'danger' ? 'rose' : variant;

    const colorStyles = {
        emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        rose: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
        cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
        purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
        neutral: 'bg-white/5 border-white/10 text-white/70',
    };

    const dotColors = {
        emerald: 'bg-emerald-400',
        amber: 'bg-amber-400',
        rose: 'bg-rose-400',
        cyan: 'bg-cyan-400',
        purple: 'bg-purple-400',
        neutral: 'bg-white',
    };

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-xs ${colorStyles[normalizedVariant]} ${className}`}
        >
            <span className="relative flex h-2 w-2">
                {pulse && (
                    <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColors[normalizedVariant]}`}
                    />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColors[normalizedVariant]}`} />
            </span>
            {icon && <span className="shrink-0">{icon}</span>}
            <span>{label}</span>
        </span>
    );
};
