import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { haptics } from '@/utils/haptics';

interface FuseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    sparkColor?: string;
    variant?: 'primary' | 'secondary' | 'emerald' | 'danger';
    className?: string;
}

export const FuseButton: React.FC<FuseButtonProps> = ({
    children,
    sparkColor = '#38bdf8',
    variant = 'primary',
    className = '',
    onClick,
    ...props
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const baseStyles = 'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 text-xs font-bold transition-all duration-300 active:scale-[0.98] cursor-pointer';

    const variantStyles = {
        primary: 'bg-white text-black hover:bg-white/90 shadow-[0_0_25px_rgba(255,255,255,0.25)]',
        secondary: 'bg-white/[0.06] text-white border border-white/[0.12] hover:bg-white/[0.12]',
        emerald: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 shadow-[0_0_20px_rgba(16,185,129,0.2)]',
        danger: 'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 shadow-[0_0_20px_rgba(239,68,68,0.2)]',
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        haptics.light();
        onClick?.(e);
    };

    return (
        <button
            ref={buttonRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleClick}
            className={`${baseStyles} ${variantStyles[variant]} ${className}`}
            {...props}
        >
            {/* Luminous Fuse Border Spark */}
            {isHovered && (
                <motion.div
                    className="pointer-events-none absolute -inset-[1px] rounded-xl"
                    style={{
                        background: `linear-gradient(90deg, transparent 0%, ${sparkColor} 50%, transparent 100%)`,
                        filter: 'blur(2px)',
                    }}
                    animate={{
                        rotate: 360,
                    }}
                    transition={{
                        duration: 2.2,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                />
            )}

            {/* Ambient Glass Inset */}
            <div className="absolute inset-[1px] rounded-[11px] bg-inherit -z-10" />

            <span className="relative z-10 flex items-center gap-2">
                {children}
            </span>
        </button>
    );
};
