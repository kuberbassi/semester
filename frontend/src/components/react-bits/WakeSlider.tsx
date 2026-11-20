import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { haptics } from '@/utils/haptics';

export interface WakeSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
  label?: string;
  unit?: string;
  color?: 'cyan' | 'primary' | 'red' | 'emerald' | 'amber';
  disabled?: boolean;
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
  color = 'cyan',
  disabled = false,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastValRef = useRef(value);

  const range = max - min;
  const clampedVal = Math.min(max, Math.max(min, value));
  const percentage = range > 0 ? ((clampedVal - min) / range) * 100 : 0;

  // Color configurations matching Framer aesthetic
  const colorThemes = {
    cyan: {
      fill: 'from-blue-600 via-cyan-500 to-emerald-400',
      wake: 'rgba(34, 211, 238, 0.55)',
      thumbBorder: 'border-cyan-400',
      thumbDot: 'bg-cyan-500',
      textBadge: 'text-cyan-400',
      shadowGlow: '0 0 20px rgba(34, 211, 238, 0.8), 0 0 6px #ffffff',
    },
    primary: {
      fill: 'from-blue-600 via-indigo-500 to-purple-500',
      wake: 'rgba(99, 102, 241, 0.55)',
      thumbBorder: 'border-indigo-400',
      thumbDot: 'bg-indigo-500',
      textBadge: 'text-indigo-400',
      shadowGlow: '0 0 20px rgba(99, 102, 241, 0.8), 0 0 6px #ffffff',
    },
    red: {
      fill: 'from-amber-500 via-orange-500 to-rose-600',
      wake: 'rgba(244, 63, 94, 0.55)',
      thumbBorder: 'border-rose-400',
      thumbDot: 'bg-rose-500',
      textBadge: 'text-rose-400',
      shadowGlow: '0 0 20px rgba(244, 63, 94, 0.8), 0 0 6px #ffffff',
    },
    emerald: {
      fill: 'from-teal-500 via-emerald-400 to-green-500',
      wake: 'rgba(16, 185, 129, 0.55)',
      thumbBorder: 'border-emerald-400',
      thumbDot: 'bg-emerald-500',
      textBadge: 'text-emerald-400',
      shadowGlow: '0 0 20px rgba(16, 185, 129, 0.8), 0 0 6px #ffffff',
    },
    amber: {
      fill: 'from-yellow-500 via-amber-500 to-orange-500',
      wake: 'rgba(245, 158, 11, 0.55)',
      thumbBorder: 'border-amber-400',
      thumbDot: 'bg-amber-500',
      textBadge: 'text-amber-400',
      shadowGlow: '0 0 20px rgba(245, 158, 11, 0.8), 0 0 6px #ffffff',
    },
  };

  const theme = colorThemes[color] || colorThemes.cyan;

  const updateFromPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current || disabled) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const rawVal = min + pos * (max - min);
    const steppedVal = Math.round(rawVal / step) * step;
    const finalVal = Math.min(max, Math.max(min, Number(steppedVal.toFixed(2))));
    
    if (finalVal !== lastValRef.current) {
      lastValRef.current = finalVal;
      haptics.selection();
      onChange(finalVal);
    }
  }, [disabled, max, min, onChange, step]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    setIsDragging(true);
    haptics.light();
    updateFromPointer(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled) return;
    updateFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let nextVal = value;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextVal = Math.max(min, value - step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextVal = Math.min(max, value + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextVal = min;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextVal = max;
    }

    if (nextVal !== value) {
      haptics.selection();
      onChange(nextVal);
    }
  };

  return (
    <div className={`flex flex-col gap-2 select-none ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs font-semibold text-on-surface-variant/80">
          <span className="tracking-wide uppercase text-[11px]">{label}</span>
          <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] ${theme.textBadge}`}>
            {clampedVal}{unit}
          </span>
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuenow={clampedVal}
        aria-valuemin={min}
        aria-valuemax={max}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-7 flex items-center cursor-pointer group focus:outline-none"
      >
        {/* Track background */}
        <div className="w-full h-2 rounded-full bg-surface-container-high/60 dark:bg-white/[0.08] light:bg-black/[0.08] border border-white/[0.06] relative overflow-hidden">
          {/* Active fill */}
          <div
            className={`absolute left-0 top-0 bottom-0 bg-gradient-to-r ${theme.fill} rounded-full transition-all duration-75`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Luminous Wake trailing behind thumb */}
        <div
          className="absolute pointer-events-none transition-all duration-75"
          style={{
            left: `calc(${percentage}% - 32px)`,
            width: '64px',
            height: '24px',
            background: `radial-gradient(ellipse at center, ${theme.wake} 0%, rgba(0,0,0,0) 70%)`,
            filter: 'blur(5px)',
            opacity: isDragging ? 1 : 0.45,
          }}
        />

        {/* Tactile Thumb */}
        <motion.div
          animate={{
            scale: isDragging ? 1.25 : 1,
            boxShadow: isDragging
              ? theme.shadowGlow
              : `0 0 10px ${theme.wake}`,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className={`absolute w-5 h-5 -ml-2.5 rounded-full bg-white border-2 ${theme.thumbBorder} transition-colors pointer-events-none flex items-center justify-center`}
          style={{ left: `${percentage}%` }}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${theme.thumbDot}`} />
        </motion.div>
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono text-on-surface-variant/30 px-0.5">
        <span>{min}{unit}</span>
        <span className="text-[8px] opacity-60 tracking-wider uppercase">↔ Drag to scrub</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
};
