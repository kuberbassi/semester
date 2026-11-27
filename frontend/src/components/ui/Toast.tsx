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

/**
 * Apple macOS Liquid Glass Notification Banner:
 * Unified Silver-Iris / Rose / Amber palette, theme-aware in both Light & Dark mode.
 */
export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback((type: ToastType, message: string, duration = 2800) => {
        const id = crypto.randomUUID();
        setToasts((prev) => [...prev.slice(-2), { id, type, message, duration }]);

        if (type === 'success') haptics.success();
        else if (type === 'error') haptics.error();
        else if (type === 'warning') haptics.medium();
        else haptics.light();

        if (duration > 0) {
            setTimeout(() => removeToast(id), duration);
        }
    }, [removeToast]);

    const success = (message: string) => showToast('success', message);
    const error = (message: string) => showToast('error', message);
    const warning = (message: string) => showToast('warning', message);
    const info = (message: string) => showToast('info', message);

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
            case 'success': return <CheckCircle2 className="w-4 h-4 text-primary" />;
            case 'error': return <XCircle className="w-4 h-4 text-rose-400" />;
            case 'warning': return <AlertCircle className="w-4 h-4 text-amber-400" />;
            case 'info': return <Info className="w-4 h-4 text-primary" />;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
            {children}

            <div className="fixed top-5 right-5 left-5 sm:left-auto z-[10001] flex flex-col items-stretch sm:items-end gap-2 pointer-events-none">
                <AnimatePresence initial={false}>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: -12, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.96 }}
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            className="pointer-events-auto liquid-glass-overlay flex w-full sm:w-auto items-center gap-2.5 px-4 py-2.5 rounded-2xl sm:min-w-[260px] max-w-sm select-none"
                        >
                            <span className="shrink-0">{getIcon(toast.type)}</span>
                            <p className="flex-1 min-w-0 text-xs font-semibold leading-snug text-on-surface truncate">
                                {toast.message}
                            </p>
                            <button
                                type="button"
                                onClick={() => removeToast(toast.id)}
                                className="no-fluid p-1 rounded-full hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface transition-colors shrink-0 cursor-pointer"
                                aria-label="Dismiss notification"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};
