import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface WakeSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
  label?: string;
  unit?: string;
  className?: string;
}

export const WakeSlider: React.FC<WakeSliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  unit = '%',
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    updateFromPointer(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updateFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const updateFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const rawVal = min + pos * (max - min);
    const steppedVal = Math.round(rawVal / step) * step;
    onChange(Number(steppedVal.toFixed(2)));
  };

  return (
    <div className={`flex flex-col gap-2 select-none ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs font-medium text-slate-300">
          <span>{label}</span>
          <span className="font-mono text-cyan-400 font-bold">
            {value}
            {unit}
          </span>
        </div>
      )}

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-7 flex items-center cursor-pointer group"
      >
        {/* Track background */}
        <div className="w-full h-2 rounded-full bg-slate-800 border border-white/5 relative overflow-hidden">
          {/* Active fill */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 rounded-full transition-all duration-75"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Luminous Wake trailing behind thumb */}
        <div
          className="absolute pointer-events-none transition-all duration-75"
          style={{
            left: `calc(${percentage}% - 30px)`,
            width: '60px',
            height: '24px',
            background: 'radial-gradient(ellipse at center, rgba(34, 211, 238, 0.45) 0%, rgba(34, 211, 238, 0) 70%)',
            filter: 'blur(4px)',
            opacity: isDragging ? 1 : 0.4,
          }}
        />

        {/* Tactile Thumb */}
        <motion.div
          animate={{
            scale: isDragging ? 1.25 : 1,
            boxShadow: isDragging
              ? '0 0 20px rgba(34, 211, 238, 0.8), 0 0 4px #ffffff'
              : '0 0 10px rgba(34, 211, 238, 0.4)',
          }}
          className="absolute w-5 h-5 -ml-2.5 rounded-full bg-white border-2 border-cyan-400 transition-colors pointer-events-none flex items-center justify-center"
          style={{ left: `${percentage}%` }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-600" />
        </motion.div>
      </div>
    </div>
  );
};
