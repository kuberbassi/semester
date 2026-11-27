import React from 'react';

interface ClickSparkProps {
    sparkColor?: string;
    sparkSize?: number;
    sparkRadius?: number;
    sparkCount?: number;
    duration?: number;
    children?: React.ReactNode;
    className?: string;
}

/**
 * Disabled spark particle bursts to keep interactions crisp, minimal, and Apple-grade.
 */
export const ClickSpark: React.FC<ClickSparkProps> = ({ children, className = '' }) => {
    if (!className) return <>{children}</>;
    return <div className={className}>{children}</div>;
};
