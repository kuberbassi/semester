import React from 'react';
import { motion } from 'framer-motion';

interface AuroraGlowProps {
    variant?: 'cyan' | 'purple' | 'amber' | 'multi';
    className?: string;
    intensity?: 'subtle' | 'vibrant';
}

export const AuroraGlow: React.FC<AuroraGlowProps> = ({
    variant = 'cyan',
    className = '',
    intensity = 'vibrant',
}) => {
    const opacityClass = intensity === 'vibrant' ? 'opacity-40 dark:opacity-60' : 'opacity-20 dark:opacity-35';

    if (variant === 'cyan') {
        return (
            <div className={`pointer-events-none absolute -z-10 overflow-hidden ${className}`}>
                <motion.div
                    animate={{
                        scale: [1, 1.15, 1],
                        opacity: [0.35, 0.55, 0.35],
                    }}
                    transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                    className={`h-[420px] w-[500px] rounded-full bg-gradient-to-tr from-cyan-500/40 via-blue-600/30 to-teal-400/20 blur-[130px] ${opacityClass}`}
                />
            </div>
        );
    }

    if (variant === 'purple') {
        return (
            <div className={`pointer-events-none absolute -z-10 overflow-hidden ${className}`}>
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.5, 0.3],
                    }}
                    transition={{
                        duration: 9,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                    className={`h-[450px] w-[520px] rounded-full bg-gradient-to-tr from-purple-600/40 via-indigo-600/30 to-fuchsia-500/25 blur-[140px] ${opacityClass}`}
                />
            </div>
        );
    }

    if (variant === 'amber') {
        return (
            <div className={`pointer-events-none absolute -z-10 overflow-hidden ${className}`}>
                <motion.div
                    animate={{
                        scale: [1, 1.18, 1],
                        opacity: [0.35, 0.55, 0.35],
                    }}
                    transition={{
                        duration: 8.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                    className={`h-[420px] w-[500px] rounded-full bg-gradient-to-tr from-amber-500/40 via-orange-600/30 to-rose-500/20 blur-[130px] ${opacityClass}`}
                />
            </div>
        );
    }

    // Multi-color ambient mesh
    return (
        <div className={`pointer-events-none absolute -z-10 overflow-hidden ${className}`}>
            <motion.div
                animate={{
                    x: [0, 30, 0],
                    y: [0, -20, 0],
                    scale: [1, 1.1, 1],
                }}
                transition={{
                    duration: 12,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
                className={`absolute top-0 left-1/4 h-[500px] w-[600px] rounded-full bg-gradient-to-tr from-cyan-500/30 via-indigo-600/20 to-purple-600/25 blur-[140px] ${opacityClass}`}
            />
            <motion.div
                animate={{
                    x: [0, -30, 0],
                    y: [0, 25, 0],
                    scale: [1.1, 1, 1.1],
                }}
                transition={{
                    duration: 14,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
                className={`absolute top-1/3 right-1/4 h-[450px] w-[550px] rounded-full bg-gradient-to-bl from-purple-500/25 via-fuchsia-600/20 to-blue-500/20 blur-[130px] ${opacityClass}`}
            />
        </div>
    );
};
