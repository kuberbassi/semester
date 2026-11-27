import React from 'react';

interface FramerSpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    glowColor?: 'cyan' | 'purple' | 'amber' | 'emerald' | 'blue' | 'default';
    spotlightSize?: number;
}

/**
 * Zero-re-render, GPU-composited Liquid Glass card.
 * Eliminates mousemove React state churn and per-frame CSS maskImage repaints.
 */
export const FramerSpotlightCard: React.FC<FramerSpotlightCardProps> = ({
    children,
    className = '',
    glowColor: _glowColor,
    spotlightSize: _spotlightSize,
    ...props
}) => {
    void _glowColor;
    void _spotlightSize;

    return (
        <div
            className={`liquid-glass relative overflow-hidden rounded-[24px] group transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-[1.5px] ${className}`}
            {...props}
        >
            <div className="relative z-10 h-full w-full">
                {children}
            </div>
        </div>
    );
};
