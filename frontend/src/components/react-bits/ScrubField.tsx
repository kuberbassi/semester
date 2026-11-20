import React, { useRef, useState } from 'react';
import { haptics } from '@/utils/haptics';

interface ScrubFieldProps {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    unit?: string;
    onChange: (val: number) => void;
    className?: string;
}

export const ScrubField: React.FC<ScrubFieldProps> = ({
    value,
    min = 0,
    max = 100,
    step = 1,
    label,
    unit = '%',
    onChange,
    className = '',
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const startXRef = useRef(0);
    const startValRef = useRef(value);

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        startXRef.current = e.clientX;
        startValRef.current = value;
        haptics.light();
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startXRef.current;
        const change = Math.round(deltaX / 5) * step;
        const nextVal = Math.min(max, Math.max(min, startValRef.current + change));

        if (nextVal !== value) {
            haptics.selection();
            onChange(nextVal);
        }
    };

    const handlePointerUp = () => {
        setIsDragging(false);
    };

    return (
        <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] hover:border-white/[0.2] transition-all select-none cursor-ew-resize active:scale-[0.98] ${className}`}
        >
            {label && <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}:</span>}
            <span className="text-xs font-mono font-black text-white">
                {value}{unit}
            </span>
            <span className="text-[9px] text-white/30 font-mono tracking-tighter">↔ scrub</span>
        </div>
    );
};
