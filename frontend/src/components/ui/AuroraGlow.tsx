import React from 'react';

interface AuroraGlowProps {
    variant?: 'cyan' | 'purple' | 'amber' | 'multi';
    className?: string;
    intensity?: 'subtle' | 'vibrant';
}

/**
 * Refined Apple / OpenTune atmospheric light veil:
 * Replaces loud multi-color neon blobs with a barely-there monochrome
 * specular mist so Liquid Glass surfaces stay crisp and professional.
 */
export const AuroraGlow: React.FC<AuroraGlowProps> = ({
    className = '',
    intensity = 'subtle',
}) => {
    const alpha = intensity === 'vibrant' ? 'opacity-[0.09] dark:opacity-[0.11]' : 'opacity-[0.05] dark:opacity-[0.07]';

    return (
        <div className={`pointer-events-none absolute -z-10 overflow-hidden ${className}`} aria-hidden="true">
            <div
                className={`h-[440px] w-[580px] rounded-full bg-gradient-to-b from-white via-zinc-300/40 to-transparent blur-[140px] ${alpha}`}
            />
        </div>
    );
};
