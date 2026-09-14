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
                return <CheckCircle2 className="w-5 h-5" />;
            case 'error':
                return <XCircle className="w-5 h-5" />;
            case 'warning':
                return <AlertCircle className="w-5 h-5" />;
            case 'info':
                return <Info className="w-5 h-5" />;
        }
    };

    const getColors = (type: ToastType) => {
        switch (type) {
            case 'success':
                return 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300';
            case 'error':
                return 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 text-red-800 dark:text-red-300';
            case 'warning':
                return 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25 text-amber-900 dark:text-amber-300';
            case 'info':
                return 'bg-surface border-outline text-on-surface';
        }
    };

    return (
        <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
            {children}

            <div className="fixed top-4 right-4 left-4 sm:left-auto z-50 flex flex-col items-stretch sm:items-end gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, x: 100, scale: 0.8 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 100, scale: 0.8 }}
                            className={`pointer-events-auto flex w-full sm:w-auto items-center gap-3 px-4 py-3 rounded-lg border shadow-lg sm:min-w-[300px] max-w-md ${getColors(toast.type)}`}
                        >
                            <span className="shrink-0">{getIcon(toast.type)}</span>
                            <p className="flex-1 min-w-0 text-sm font-medium leading-snug break-words whitespace-pre-wrap">{toast.message}</p>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="p-1 rounded hover:bg-on-surface/10 transition-colors shrink-0"
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
