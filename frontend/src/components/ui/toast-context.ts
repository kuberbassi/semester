import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastContextValue {
    showToast: (type: ToastType, message: string, duration?: number) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function dispatchGlobalToast(type: ToastType, message: string) {
    window.dispatchEvent(new CustomEvent('global-toast', { detail: { type, message } }));
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}
