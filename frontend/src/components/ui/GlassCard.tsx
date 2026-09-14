import React, { type ReactNode, useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    hover?: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
}

const GlassCard: React.FC<GlassCardProps> = ({
    children,
    className = '',
    hover = false,
    onClick,
    style
}) => {
    const ref = useRef<HTMLDivElement>(null);

    // 3D Tilt Effect Values
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
    const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["7deg", "-7deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-7deg", "7deg"]);
    const brightness = useTransform(mouseYSpring, [-0.5, 0.5], [1.1, 0.9]);
    const brightnessFilter = useMotionTemplate`brightness(${brightness})`;
    const glareBackground = useTransform(
        x,
        (latestX) => `linear-gradient(${180 + (latestX * 90)}deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 100%)`
    );
    const highlightBackground = useTransform(
        () => `radial-gradient(circle at ${(x.get() + 0.5) * 100}% ${(y.get() + 0.5) * 100}%, rgba(255,255,255,0.3) 0%, transparent 60%)`
    );

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!hover || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();

        const width = rect.width;
        const height = rect.height;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;

        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        if (!hover) return;
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                rotateX: hover ? rotateX : 0,
                rotateY: hover ? rotateY : 0,
                filter: hover ? brightnessFilter : 'none',
                transformStyle: "preserve-3d",
                ...style,
            }}
            className={`
                relative overflow-hidden
                bg-surface/70 dark:bg-surface/75 
                border border-outline-variant/50 
                rounded-xl
                shadow-xs
                transition-all duration-300
                backdrop-blur-xl
                ${hover ? 'hover:shadow-lg hover:shadow-primary/5 hover:border-outline cursor-pointer' : ''}
                ${className}
            `}
            whileTap={hover ? { scale: 0.98 } : undefined}
            onClick={onClick}
        >
            {/* Specular Glare (Opposite to light source) */}
            {hover && (
                <motion.div
                    className="absolute inset-0 pointer-events-none z-0 mix-blend-color-dodge opacity-60"
                    style={{ background: glareBackground }}
                />
            )}

            {/* Dynamic Glass Highlight (Following Mouse) */}
            {hover && (
                <motion.div
                    className="absolute inset-0 pointer-events-none z-0 mix-blend-overlay opacity-50"
                    style={{ background: highlightBackground }}
                />
            )}

            {/* Subtle static gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none mix-blend-overlay z-0" />

            {/* Content Container (shifted forward for 3D parallax) */}
            <div
                className="relative z-10 w-full h-full"
                style={{ transform: hover ? "translateZ(30px)" : "none", transition: "transform 0.3s ease-out" }}
            >
                {children}
            </div>
        </motion.div>
    );
};

export default GlassCard;
