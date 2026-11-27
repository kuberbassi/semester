import React, { useId } from 'react';
import { motion } from 'framer-motion';

/**
 * Liquid Gradient Orbital Loader:
 * Crisp dual-arc SVG ring with Indigo → Cyan gradient stroke.
 */
export const Loader: React.FC<{ size?: number; className?: string }> = ({ size = 34, className = '' }) => {
    const id = useId();
    return (
        <div
            className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
            style={{ width: size, height: size }}
            aria-label="Loading"
        >
            <motion.svg
                width={size}
                height={size}
                viewBox="0 0 36 36"
                fill="none"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
            >
                <defs>
                    <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="55%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.05" />
                    </linearGradient>
                </defs>
                <circle
                    cx="18"
                    cy="18"
                    r="14"
                    stroke="currentColor"
                    strokeOpacity="0.12"
                    strokeWidth="3"
                />
                <circle
                    cx="18"
                    cy="18"
                    r="14"
                    stroke={`url(#${id})`}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="62 32"
                />
            </motion.svg>
        </div>
    );
};

export default Loader;
