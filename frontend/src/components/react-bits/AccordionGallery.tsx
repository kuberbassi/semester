import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { haptics } from '@/utils/haptics';

export interface AccordionItem {
  id: string | number;
  title: string;
  subtitle?: string;
  badge?: string;
  image?: string;
  color?: string;
  content?: React.ReactNode;
}

interface AccordionGalleryProps {
  items: AccordionItem[];
  defaultActiveId?: string | number;
  onChange?: (id: string | number) => void;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  triggerOnHover?: boolean;
}

export const AccordionGallery: React.FC<AccordionGalleryProps> = ({
  items,
  defaultActiveId,
  onChange,
  className = '',
  orientation = 'horizontal',
  triggerOnHover = true,
}) => {
  const [activeId, setActiveId] = useState<string | number>(
    defaultActiveId ?? (items[0]?.id || '')
  );

  const handleActivate = (id: string | number) => {
    if (activeId !== id) {
      haptics.selection();
      setActiveId(id);
      onChange?.(id);
    }
  };

  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={`flex ${
        isHorizontal ? 'flex-col md:flex-row' : 'flex-col'
      } gap-3 w-full min-h-[420px] select-none ${className}`}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <motion.div
            key={item.id}
            layout
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 30,
            }}
            onClick={() => handleActivate(item.id)}
            onMouseEnter={() => {
              if (triggerOnHover) handleActivate(item.id);
            }}
            className={`relative rounded-3xl overflow-hidden cursor-pointer transition-all duration-300 border border-white/10 ${
              isActive
                ? 'flex-[3.5] bg-slate-900/90 shadow-2xl border-white/20'
                : 'flex-1 bg-slate-900/50 hover:bg-slate-900/70 opacity-70 hover:opacity-100'
            }`}
            style={{
              minHeight: isHorizontal ? 'auto' : isActive ? '280px' : '64px',
              minWidth: isHorizontal ? (isActive ? '260px' : '72px') : 'auto',
            }}
          >
            {/* Ambient Background Aura */}
            {item.color && (
              <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-500"
                style={{
                  background: `radial-gradient(ellipse at bottom, ${item.color} 0%, transparent 70%)`,
                  opacity: isActive ? 0.35 : 0.08,
                }}
              />
            )}

            {/* Specular Edge Line */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

            {/* Content Layer */}
            <div className="relative z-10 h-full w-full p-5 flex flex-col justify-between">
              {isActive ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="h-full flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {item.badge && (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 border border-white/15 text-white/80 mb-2">
                          {item.badge}
                        </span>
                      )}
                      <h3 className="text-xl font-black text-white tracking-tight">
                        {item.title}
                      </h3>
                      {item.subtitle && (
                        <p className="text-xs text-white/50 mt-1 font-medium">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {item.content && <div className="mt-4">{item.content}</div>}
                </motion.div>
              ) : (
                /* Collapsed Strip View */
                <div className="h-full flex flex-col items-center justify-between py-2 text-center">
                  {item.badge && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
                      {item.badge}
                    </span>
                  )}

                  <div className="my-auto">
                    <span className="text-xs font-bold text-white/70 block [writing-mode:horizontal-tb] md:[writing-mode:vertical-rl] md:rotate-180 truncate max-h-[140px]">
                      {item.title}
                    </span>
                  </div>

                  <span className="w-2 h-2 rounded-full bg-white/30" />
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
