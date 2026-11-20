import React, { useRef, useState } from 'react';
import type { MouseEvent } from 'react';

interface MagicBentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export const MagicBentoGrid: React.FC<MagicBentoGridProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 ${className}`}>
      {children}
    </div>
  );
};

interface MagicBentoCardProps {
  children: React.ReactNode;
  colSpan?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2;
  className?: string;
  glowColor?: string;
}

export const MagicBentoCard: React.FC<MagicBentoCardProps> = ({
  children,
  colSpan = 1,
  rowSpan = 1,
  className = '',
  glowColor = 'rgba(56, 189, 248, 0.15)',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const colClasses = {
    1: 'md:col-span-1',
    2: 'md:col-span-2',
    3: 'md:col-span-3',
    4: 'md:col-span-4 lg:col-span-4',
  }[colSpan];

  const rowClasses = {
    1: 'row-span-1',
    2: 'row-span-2',
  }[rowSpan];

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative rounded-3xl p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 overflow-hidden transition-all duration-300 hover:border-white/20 hover:shadow-2xl ${colClasses} ${rowClasses} ${className} ${
        isHovered ? 'ring-1 ring-white/15' : ''
      }`}
    >
      {/* Dynamic Cursor Spotlight Mesh */}
      <div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, ${glowColor}, transparent 40%)`,
        }}
      />

      {/* Subtle top specular sheen */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Card Content */}
      <div className="relative z-10 h-full flex flex-col justify-between">
        {children}
      </div>
    </div>
  );
};
