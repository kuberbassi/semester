import React, { useCallback, useState, useEffect, type ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptics } from '@/utils/haptics';
import { ToastContext, type ToastType } from './toast-context';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback((type: ToastType, message: string, duration = 3000) => {
        const id = crypto.randomUUID();
        const newToast: Toast = { id, type, message, duration };

        setToasts((prev) => [...prev, newToast]);

        // Trigger mobile haptics based on type
        if (type === 'success') {
            haptics.success();
        } else if (type === 'error') {
            haptics.error();
        } else if (type === 'warning') {
            haptics.medium();
        } else {
            haptics.light();
        }

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, [removeToast]);

    const success = (message: string) => showToast('success', message);
    const error = (message: string) => showToast('error', message);
    const warning = (message: string) => showToast('warning', message);
    const info = (message: string) => showToast('info', message);

    // Listen for global toast events fired from outside React (e.g. api.ts)
    useEffect(() => {
        const handler = (e: Event) => {
            const { type, message } = (e as CustomEvent<{ type: ToastType; message: string }>).detail;
            showToast(type, message);
        };
        window.addEventListener('global-toast', handler);
        return () => window.removeEventListener('global-toast', handler);
    }, [showToast]);

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success':
                return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
            case 'error':
                return <XCircle className="w-5 h-5 text-rose-400" />;
            case 'warning':
                return <AlertCircle className="w-5 h-5 text-amber-400" />;
            case 'info':
                return <Info className="w-5 h-5 text-cyan-400" />;
        }
    };

    const getColors = (type: ToastType) => {
        switch (type) {
            case 'success':
                return 'border-emerald-500/40 bg-slate-900/90 text-emerald-300 shadow-emerald-500/10';
            case 'error':
                return 'border-rose-500/40 bg-slate-900/90 text-rose-300 shadow-rose-500/10';
            case 'warning':
                return 'border-amber-500/40 bg-slate-900/90 text-amber-300 shadow-amber-500/10';
            case 'info':
                return 'border-cyan-500/40 bg-slate-900/90 text-cyan-300 shadow-cyan-500/10';
        }
    };

    return (
        <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
            {children}

            <div className="fixed top-5 right-5 left-5 sm:left-auto z-50 flex flex-col items-stretch sm:items-end gap-2.5 pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            layout
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.7}
                            onDragEnd={(_, info) => {
                                if (Math.abs(info.offset.x) > 100 || Math.abs(info.velocity.x) > 350) {
                                    removeToast(toast.id);
                                }
                            }}
                            initial={{ opacity: 0, y: -20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
                            className={`pointer-events-auto flex w-full sm:w-auto items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl sm:min-w-[320px] max-w-md cursor-grab active:cursor-grabbing select-none ${getColors(
                                toast.type
                            )}`}
                        >
                            <span className="shrink-0">{getIcon(toast.type)}</span>
                            <p className="flex-1 min-w-0 text-sm font-semibold leading-snug break-words whitespace-pre-wrap text-white">
                                {toast.message}
                            </p>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0"
                                aria-label="Dismiss notification"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};
