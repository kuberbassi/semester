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
        }, 150);
    };

    const handleConfirm = () => {
        if (options?.requireDeleteText && deleteInput.toUpperCase() !== 'DELETE') {
            return;
        }
        setIsOpen(false);
        setTimeout(() => {
            resolveRef.current(true);
            setOptions(null);
        }, 150);
    };

    const isConfirmDisabled = options?.requireDeleteText && deleteInput.toUpperCase() !== 'DELETE';

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            
            {createPortal(
                <AnimatePresence>
                    {isOpen && options && (
                        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                onClick={handleCancel}
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            />

                            {/* Dialogue box */}
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 15 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 15 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 450 }}
                                className="relative w-full max-w-[420px] rounded-xl bg-surface border border-outline shadow-2xl p-6 md:p-8 flex flex-col gap-5 text-on-surface"
                            >
                                <button 
                                    onClick={handleCancel}
                                    className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant/40 hover:text-on-surface cursor-pointer"
                                >
                                    <X size={18} />
                                </button>

                                <div className="flex gap-4 items-start mt-2">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                                        options.requireDeleteText 
                                            ? 'bg-red-500/10 border-red-500/20 text-red-500' 
                                            : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                    }`}>
                                        {options.requireDeleteText ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}
                                    </div>
                                    <div className="flex flex-col gap-1.5 min-w-0">
                                        <h3 className="text-base font-bold text-on-surface tracking-tight leading-tight">
                                            {options.title}
                                        </h3>
                                        <p className="text-xs text-on-surface-variant/60 font-medium leading-relaxed">
                                            {options.message}
                                        </p>
                                    </div>
                                </div>

                                {options.requireDeleteText && (
                                    <div className="flex flex-col gap-2 bg-surface-container/30 border border-outline rounded-lg p-4 mt-1">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">
                                            Security Verification
                                        </label>
                                        <p className="text-[10px] text-on-surface-variant/50 font-medium leading-snug">
                                            This action is highly destructive and cannot be undone. To proceed, please type <strong className="text-red-500 font-bold select-none">DELETE</strong> below:
                                        </p>
                                        <input
                                            type="text"
                                            value={deleteInput}
                                            onChange={(e) => setDeleteInput(e.target.value)}
                                            placeholder="Type DELETE"
                                            className="w-full text-xs px-3.5 py-2.5 bg-surface border border-outline rounded-lg outline-none focus:border-red-500 transition-colors uppercase tracking-wider font-bold text-on-surface"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !isConfirmDisabled) {
                                                    handleConfirm();
                                                }
                                            }}
                                        />
                                    </div>
                                )}

                                <div className="flex gap-3 mt-2">
                                    <button
                                        onClick={handleCancel}
                                        className="flex-1 py-3 rounded-lg border border-outline bg-surface text-xs font-bold text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all cursor-pointer"
                                    >
                                        {options.cancelText || 'Cancel'}
                                    </button>
                                    <button
                                        onClick={handleConfirm}
                                        disabled={isConfirmDisabled}
                                        className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex justify-center items-center ${
                                            isConfirmDisabled 
                                                ? 'bg-on-surface/5 border border-outline text-on-surface-variant/30 cursor-not-allowed'
                                                : options.requireDeleteText
                                                    ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/10'
                                                    : 'bg-on-surface text-surface hover:opacity-90'
                                        }`}
                                    >
                                        {options.confirmText || 'Delete'}
                                    </button>
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
