import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Loader from './Loader';

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    fullScreen?: boolean;
    variant?: 'spinner' | 'skeleton';
    skeletonClassName?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
    size = 'md',
    fullScreen = false,
    variant = 'spinner',
    skeletonClassName = 'h-24 w-full',
}) => {
    useEffect(() => {
        if (!fullScreen) return;
        window.dispatchEvent(new Event('semester:hide-tooltips'));
        return () => {
            window.dispatchEvent(new Event('semester:hide-tooltips'));
        };
    }, [fullScreen]);

    if (variant === 'skeleton') {
        return (
            <div className={`animate-pulse bg-surface-container-high rounded-xl ${skeletonClassName}`} />
        );
    }

    const loaderSizes = {
        sm: 20,
        md: 32,
        lg: 48,
    };

    const spinner = <Loader size={loaderSizes[size]} />;

    if (fullScreen) {
        return createPortal(
            <div
                data-tooltip-blocker="true"
                className="fixed inset-0 flex items-center justify-center bg-background/45 backdrop-blur-md z-[10080] pointer-events-auto animate-fade-in"
            >
                <div className="bg-surface/80 border border-outline/25 backdrop-blur-xl p-6 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-3">
                    {spinner}
                </div>
            </div>,
            document.body,
        );
    }

    return <div className="flex items-center justify-center p-4">{spinner}</div>;
};

export default LoadingSpinner;
