import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface FramerSpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    glowColor?: 'cyan' | 'purple' | 'amber' | 'emerald' | 'blue' | 'default';
    spotlightSize?: number;
}

const GLOW_MAP = {
    default: 'rgba(255, 255, 255, 0.08)',
    cyan: 'rgba(6, 182, 212, 0.15)',
    purple: 'rgba(168, 85, 247, 0.15)',
    amber: 'rgba(245, 158, 11, 0.15)',
    emerald: 'rgba(16, 185, 129, 0.15)',
    blue: 'rgba(59, 130, 246, 0.15)',
};

const BORDER_GLOW_MAP = {
    default: 'rgba(255, 255, 255, 0.18)',
    cyan: 'rgba(6, 182, 212, 0.35)',
    purple: 'rgba(168, 85, 247, 0.35)',
    amber: 'rgba(245, 158, 11, 0.35)',
    emerald: 'rgba(16, 185, 129, 0.35)',
    blue: 'rgba(59, 130, 246, 0.35)',
};

export const FramerSpotlightCard: React.FC<FramerSpotlightCardProps> = ({
    children,
    className = '',
    glowColor = 'default',
    spotlightSize = 350,
    ...props
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
    const [isHovered, setIsHovered] = useState(false);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => {
        setIsHovered(false);
        setMousePos({ x: -1000, y: -1000 });
    };

    const innerGlow = GLOW_MAP[glowColor] || GLOW_MAP.default;
    const borderGlow = BORDER_GLOW_MAP[glowColor] || BORDER_GLOW_MAP.default;

    return (
        <motion.div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`relative overflow-hidden rounded-2xl bg-surface/70 dark:bg-[#0c0c0e]/80 backdrop-blur-xl border border-outline/30 dark:border-white/[0.08] transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.12)] group ${className}`}
            whileHover={{ y: -2, transition: { duration: 0.2, ease: 'easeOut' } }}
            {...(props as any)}
        >
            {/* Dynamic Mouse Spotlight Layer */}
            <div
                className="pointer-events-none absolute -inset-px transition-opacity duration-300"
                style={{
                    opacity: isHovered ? 1 : 0,
                    background: `radial-gradient(${spotlightSize}px circle at ${mousePos.x}px ${mousePos.y}px, ${innerGlow}, transparent 70%)`,
                }}
            />

            {/* Specular Border Highlight Layer */}
            <div
                className="pointer-events-none absolute -inset-px rounded-2xl transition-opacity duration-300 border border-transparent"
                style={{
                    opacity: isHovered ? 1 : 0,
                    borderColor: borderGlow,
                    maskImage: `radial-gradient(${spotlightSize * 0.75}px circle at ${mousePos.x}px ${mousePos.y}px, black, transparent 80%)`,
                    WebkitMaskImage: `radial-gradient(${spotlightSize * 0.75}px circle at ${mousePos.x}px ${mousePos.y}px, black, transparent 80%)`,
                }}
            />

            {/* Content Container */}
            <div className="relative z-10 h-full w-full">
                {children}
            </div>
        </motion.div>
    );
};
