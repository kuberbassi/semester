import React, { useId } from 'react';

interface BrandLogoProps {
    size?: number;
    className?: string;
}

/**
 * Refreshed Semester Brand Mark:
 * Architectural dual-ribbon liquid "S" monogram inside a flush precision squircle
 * with luminous Cobalt -> Violet -> Cyan gradient depth and clean alpha corners.
 * Note: Always style glow via CSS `drop-shadow-*` (never rectangular `shadow-*`).
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 34, className = '' }) => {
    const id = useId();
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`shrink-0 block ${className}`}
            aria-label="Semester Logo"
        >
            <defs>
                <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="52%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
                <linearGradient id={`${id}-top`} x1="16" y1="14" x2="48" y2="38" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e0f2fe" />
                </linearGradient>
                <linearGradient id={`${id}-bot`} x1="16" y1="30" x2="48" y2="52" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#cffafe" />
                    <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>
            </defs>

            {/* Flush Squircle Base (transparent corners outside radius) */}
            <rect x="0" y="0" width="64" height="64" rx="17" fill={`url(#${id}-bg)`} />

            {/* Crisp inset glass specular rim */}
            <rect
                x="1"
                y="1"
                width="62"
                height="62"
                rx="16"
                stroke="#ffffff"
                strokeOpacity="0.30"
                strokeWidth="1.5"
            />

            {/* Upper interlocking geometric S-ribbon */}
            <path
                d="M44.5 21.5C44.5 17.6 40.2 15 33.6 15C26.2 15 21 18.7 21 23.8C21 28.5 24.9 31.1 32.2 32.3L36.2 33C40.4 33.7 42.5 35.1 42.5 37.8C42.5 40.9 39.2 43 33.4 43C28.4 43 24.9 41.3 23.7 38.6"
                stroke={`url(#${id}-top)`}
                strokeWidth="5.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Lower liquid wave accent underline */}
            <path
                d="M20.5 48.2C24.8 50.6 31.6 51.3 39.2 48.6C41.8 47.7 43.8 46.3 45.2 44.8"
                stroke={`url(#${id}-bot)`}
                strokeOpacity="0.78"
                strokeWidth="3.2"
                strokeLinecap="round"
            />
        </svg>
    );
};

export default BrandLogo;
