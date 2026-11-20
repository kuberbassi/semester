import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WarmTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const WarmTooltip: React.FC<WarmTooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const posStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`absolute ${posStyles[position]} z-50 pointer-events-none whitespace-nowrap`}
          >
            {/* Luminous Warm Backing */}
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-cyan-500/20 blur-md rounded-xl" />
            
            {/* Frosted Glass Body */}
            <div className="relative px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-amber-500/30 text-xs font-medium text-slate-100 shadow-xl shadow-amber-500/5">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
