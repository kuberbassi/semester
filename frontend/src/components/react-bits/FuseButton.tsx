import React from 'react';
import { haptics } from '@/utils/haptics';

interface FuseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    sparkColor?: string;
    variant?: 'primary' | 'secondary' | 'emerald' | 'danger';
    className?: string;
}

export const FuseButton: React.FC<FuseButtonProps> = ({
    children,
    variant = 'primary',
    className = '',
    onClick,
    ...props
}) => {
    const baseStyles =
        'no-fluid relative inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all duration-150 active:scale-[0.96] cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none';

    const variantStyles = {
        primary: 'btn-gradient',
        secondary: 'bg-surface/80 dark:bg-white/[0.06] text-on-surface border border-primary/20 hover:bg-primary/10 hover:border-primary/40',
        emerald: 'bg-indigo-500/15 text-indigo-600 dark:text-cyan-300 border border-indigo-500/25 hover:bg-indigo-500/25',
        danger: 'bg-rose-500/14 text-rose-600 dark:text-rose-300 border border-rose-500/25 hover:bg-rose-500/25',
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        haptics.light();
        onClick?.(e);
    };

    return (
        <button
            onClick={handleClick}
            className={`${baseStyles} ${variantStyles[variant]} ${className}`}
            {...props}
        >
            <span className="relative z-10 flex items-center gap-1.5">
                {children}
            </span>
        </button>
    );
};
