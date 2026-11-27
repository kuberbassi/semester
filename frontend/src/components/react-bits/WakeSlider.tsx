import React, { useState, useRef, useCallback } from 'react';
import { haptics } from '@/utils/haptics';

export interface WakeSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
  label?: string;
  unit?: string;
  color?: 'indigo' | 'primary' | 'amber' | 'rose' | 'red' | 'emerald' | 'cyan';
  disabled?: boolean;
  className?: string;
}

/**
 * Crisp Liquid-Gradient Slider with high-contrast track visibility in both Light & Dark mode.
 */
export const WakeSlider: React.FC<WakeSliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  unit = '%',
  color = 'indigo',
  disabled = false,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastValRef = useRef(value);

  const range = max - min;
  const clampedVal = Math.min(max, Math.max(min, value));
  const percentage = range > 0 ? ((clampedVal - min) / range) * 100 : 0;

  const colorThemes = {
    indigo: {
      fill: 'from-indigo-500 via-violet-500 to-cyan-400',
      thumbBorder: 'border-indigo-500 dark:border-cyan-400',
      thumbDot: 'bg-indigo-500 dark:bg-cyan-400',
      textBadge: 'text-primary',
    },
    primary: {
      fill: 'from-indigo-500 via-violet-500 to-cyan-400',
      thumbBorder: 'border-indigo-500 dark:border-cyan-400',
      thumbDot: 'bg-indigo-500 dark:bg-cyan-400',
      textBadge: 'text-primary',
    },
    cyan: {
      fill: 'from-indigo-500 via-violet-500 to-cyan-400',
      thumbBorder: 'border-cyan-500',
      thumbDot: 'bg-cyan-500',
      textBadge: 'text-cyan-600 dark:text-cyan-300',
    },
    amber: {
      fill: 'from-amber-500 to-orange-400',
      thumbBorder: 'border-amber-500',
      thumbDot: 'bg-amber-500',
      textBadge: 'text-amber-600 dark:text-amber-300',
    },
    rose: {
      fill: 'from-rose-500 to-pink-400',
      thumbBorder: 'border-rose-500',
      thumbDot: 'bg-rose-500',
      textBadge: 'text-rose-600 dark:text-rose-300',
    },
    red: {
      fill: 'from-rose-500 to-pink-400',
      thumbBorder: 'border-rose-500',
      thumbDot: 'bg-rose-500',
      textBadge: 'text-rose-600 dark:text-rose-300',
    },
    emerald: {
      fill: 'from-indigo-500 to-cyan-400',
      thumbBorder: 'border-indigo-500',
      thumbDot: 'bg-indigo-500',
      textBadge: 'text-primary',
    },
  };

  const theme = colorThemes[color] || colorThemes.indigo;

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
        <div className="flex items-center justify-between text-xs font-semibold text-on-surface-variant">
          <span>{label}</span>
          <span className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 tabular-nums ${theme.textBadge}`}>
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
        className="relative h-7 flex items-center cursor-pointer group focus:outline-none px-0.5"
      >
        {/* High-contrast theme-aware track */}
        <div className="w-full h-2 rounded-full bg-on-surface/[0.13] border border-on-surface/[0.08] relative overflow-hidden">
          <div
            className={`absolute left-0 top-0 bottom-0 bg-gradient-to-r ${theme.fill} rounded-full`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Crisp Tactile Thumb */}
        <div
          className={`absolute w-5 h-5 -ml-2.5 rounded-full bg-white border-2 ${theme.thumbBorder} shadow-[0_2px_10px_rgba(15,23,42,0.28)] pointer-events-none flex items-center justify-center transition-transform duration-100 ${
            isDragging ? 'scale-115' : 'group-hover:scale-105'
          }`}
          style={{ left: `${percentage}%` }}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${theme.thumbDot}`} />
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-semibold text-on-surface-variant/65 tabular-nums px-0.5">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
};
