import React from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'warning' | 'error' | 'info';
}

interface SwipeToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export const SwipeToastItem: React.FC<SwipeToastProps> = ({ toast, onDismiss }) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-150, 0, 150], [0, 1, 0]);
  const scale = useTransform(x, [-150, 0, 150], [0.85, 1, 0.85]);

  const borderColors = {
    success: 'border-emerald-500/40 shadow-emerald-500/10',
    warning: 'border-amber-500/40 shadow-amber-500/10',
    error: 'border-rose-500/40 shadow-rose-500/10',
    info: 'border-cyan-500/40 shadow-cyan-500/10',
  };

  const badgeColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-rose-500',
    info: 'bg-cyan-500',
  };

  const type = toast.type || 'info';

  return (
    <motion.div
      layout
      style={{ x, opacity, scale }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 100 || Math.abs(info.velocity.x) > 400) {
          onDismiss(toast.id);
        }
      }}
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      className={`relative w-80 rounded-2xl p-4 bg-slate-900/90 backdrop-blur-xl border ${borderColors[type]} shadow-2xl cursor-grab active:cursor-grabbing select-none overflow-hidden group`}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-start gap-3">
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${badgeColors[type]} shadow-sm shadow-current animate-pulse`} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white tracking-tight">{toast.title}</h4>
          {toast.description && (
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{toast.description}</p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="text-slate-500 hover:text-slate-300 text-xs px-1 py-0.5 rounded transition-colors"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
};

export const SwipeToastContainer: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 pointer-events-auto">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <SwipeToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};
