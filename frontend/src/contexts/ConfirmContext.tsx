import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ConfirmContext, type ConfirmOptions } from './confirm-context';

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [deleteInput, setDeleteInput] = useState('');

    const resolveRef = useRef<(value: boolean) => void>(() => {});

    const confirm = useCallback((opts: ConfirmOptions) => {
        setOptions(opts);
        setIsOpen(true);
        setDeleteInput('');
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    const handleCancel = () => {
        setIsOpen(false);
        setTimeout(() => {
            resolveRef.current(false);
            setOptions(null);
        }, 140);
    };

    const handleConfirm = () => {
        if (options?.requireDeleteText && deleteInput.toUpperCase() !== 'DELETE') {
            return;
        }
        setIsOpen(false);
        setTimeout(() => {
            resolveRef.current(true);
            setOptions(null);
        }, 140);
    };

    const isConfirmDisabled = options?.requireDeleteText && deleteInput.toUpperCase() !== 'DELETE';

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}

            {createPortal(
                <AnimatePresence>
                    {isOpen && options && (
                        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                onClick={handleCancel}
                                className="absolute inset-0 bg-black/55 dark:bg-black/75 backdrop-blur-[5px]"
                            />

                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 12 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.96, opacity: 0, y: 8 }}
                                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                className="relative w-full max-w-[420px] liquid-glass-overlay rounded-[26px] overflow-hidden flex flex-col text-on-surface"
                            >
                                <div className={`h-[2.5px] w-full shrink-0 ${
                                    options.requireDeleteText
                                        ? 'bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400'
                                        : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500'
                                }`} />

                                <div className="p-6 flex flex-col gap-5 relative">
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="no-fluid absolute top-4 right-4 w-8 h-8 rounded-full bg-on-surface/[0.06] hover:bg-on-surface/[0.14] flex items-center justify-center transition-colors text-on-surface-variant hover:text-on-surface cursor-pointer"
                                >
                                    <X size={15} />
                                </button>

                                <div className="flex gap-3.5 items-start pt-1">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                                        options.requireDeleteText
                                            ? 'bg-rose-500/12 border-rose-500/25 text-rose-500 dark:text-rose-400'
                                            : 'bg-amber-500/12 border-amber-500/25 text-amber-600 dark:text-amber-400'
                                    }`}>
                                        {options.requireDeleteText ? <ShieldAlert size={19} /> : <AlertTriangle size={19} />}
                                    </div>
                                    <div className="flex flex-col gap-1 min-w-0 pr-6">
                                        <h3 className="font-display text-base font-extrabold text-on-surface tracking-tight leading-snug">
                                            {options.title}
                                        </h3>
                                        <p className="text-xs text-on-surface-variant leading-relaxed">
                                            {options.message}
                                        </p>
                                    </div>
                                </div>

                                {options.requireDeleteText && (
                                    <div className="flex flex-col gap-2 bg-on-surface/[0.04] border border-on-surface/[0.09] rounded-2xl p-4">
                                        <p className="text-xs text-on-surface-variant leading-snug">
                                            Type <strong className="text-rose-500 dark:text-rose-400 font-bold select-none">DELETE</strong> to confirm:
                                        </p>
                                        <input
                                            type="text"
                                            value={deleteInput}
                                            onChange={(e) => setDeleteInput(e.target.value)}
                                            placeholder="DELETE"
                                            className="w-full text-xs px-3.5 py-2.5 rounded-xl outline-none uppercase tracking-wider font-bold text-on-surface"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !isConfirmDisabled) handleConfirm();
                                            }}
                                        />
                                    </div>
                                )}

                                <div className="flex gap-2.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        className="no-fluid flex-1 h-10 rounded-full border border-on-surface/[0.11] bg-on-surface/[0.05] text-xs font-semibold text-on-surface hover:bg-on-surface/[0.10] transition-colors cursor-pointer"
                                    >
                                        {options.cancelText || 'Cancel'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirm}
                                        disabled={isConfirmDisabled}
                                        className={`no-fluid flex-1 h-10 rounded-full text-xs font-bold transition-all cursor-pointer flex justify-center items-center ${
                                            isConfirmDisabled
                                                ? 'bg-on-surface/5 text-on-surface-variant/30 cursor-not-allowed'
                                                : options.requireDeleteText
                                                    ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm'
                                                    : 'btn-gradient text-white'
                                        }`}
                                    >
                                        {options.confirmText || 'Delete'}
                                    </button>
                                </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </ConfirmContext.Provider>
    );
};
