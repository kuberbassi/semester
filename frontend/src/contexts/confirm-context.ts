import { createContext, useContext } from 'react';

export interface ConfirmOptions {
    title: string;
    message: string;
    requireDeleteText?: boolean;
    confirmText?: string;
    cancelText?: string;
}

export type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;
export const ConfirmContext = createContext<ConfirmFunction | null>(null);

export function useConfirm(): ConfirmFunction {
    const context = useContext(ConfirmContext);
    if (!context) throw new Error('useConfirm must be used within a ConfirmProvider');
    return context;
}
