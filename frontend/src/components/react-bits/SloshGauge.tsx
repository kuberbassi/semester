import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface SloshGaugeProps {
  value: number; // 0 - 100
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: string;
  className?: string;
}

export const SloshGauge: React.FC<SloshGaugeProps> = ({
  value,
  size = 140,
  strokeWidth = 10,
  label,
  sublabel,
  color = '#10b981',
  className = '',
}) => {
  const waveRef = useRef<SVGPathElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clampedValue = Math.min(100, Math.max(0, value));

  useEffect(() => {
    let ctx = gsap.context(() => {
      let t = 0;
      const animate = () => {
        t += 0.04;
        if (!waveRef.current) return;
        const radius = (size - strokeWidth * 2) / 2;
        const cy = size / 2;
        const fillHeight = (clampedValue / 100) * (radius * 2);
        const yBase = cy + radius - fillHeight;

        // Slosh wave bezier
        const amp = 4 + Math.sin(t * 1.5) * 2;
        const x1 = strokeWidth;
        const x2 = size - strokeWidth;
        const mx = size / 2;
        const my1 = yBase + Math.sin(t) * amp;
        const my2 = yBase - Math.sin(t + 1.2) * amp;

        const pathData = `M ${x1} ${yBase} Q ${x1 + (mx - x1) / 2} ${my1}, ${mx} ${yBase} Q ${mx + (x2 - mx) / 2} ${my2}, ${x2} ${yBase} L ${x2} ${size} L ${x1} ${size} Z`;
        waveRef.current.setAttribute('d', pathData);
        requestAnimationFrame(animate);
      };
      const reqId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(reqId);
    }, containerRef);

    return () => ctx.revert();
  }, [clampedValue, size, strokeWidth]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex flex-col items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="overflow-visible">
        <defs>
          <clipPath id={`slosh-clip-${size}`}>
            <circle cx={size / 2} cy={size / 2} r={(size - strokeWidth * 2) / 2} />
          </clipPath>
          <linearGradient id={`slosh-grad-${size}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.8} />
            <stop offset="100%" stopColor={color} stopOpacity={0.2} />
          </linearGradient>
        </defs>

        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Sloshing fluid body inside circle mask */}
        <g clipPath={`url(#slosh-clip-${size})`}>
          <rect
            x="0"
            y="0"
            width={size}
            height={size}
            fill="rgba(15, 23, 42, 0.4)"
          />
          <path
            ref={waveRef}
            fill={`url(#slosh-grad-${size})`}
            filter="drop-shadow(0 -2px 6px rgba(16, 185, 129, 0.3))"
          />
        </g>

        {/* Outer glowing progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            filter: `drop-shadow(0 0 8px ${color}66)`,
          }}
        />
      </svg>

      {/* Center percentage & labels */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xl font-bold tracking-tight text-white drop-shadow-md">
          {clampedValue.toFixed(0)}%
        </span>
        {label && (
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            {label}
          </span>
        )}
        {sublabel && (
          <span className="text-[9px] text-slate-500">{sublabel}</span>
        )}
      </div>
    </div>
  );
};
