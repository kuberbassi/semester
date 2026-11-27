import React, { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: ReactNode;
    subtitle?: string;
    icon?: ReactNode;
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

/**
 * Next-Level macOS Liquid Glass Sheet Modal:
 * Luminous Cobalt→Cyan top hairline, optional icon badge & subtitle,
 * ESC key hint, and silky 180ms GPU deceleration motion.
 */
const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    icon,
    children,
    size = 'md',
    className = '',
}) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });

    useEffect(() => {
        window.dispatchEvent(new Event('semester:hide-tooltips'));
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCloseRef.current();
                return;
            }
            const target = e.target as HTMLElement;
            const isEditable =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                target.isContentEditable;
            if (isEditable) return;

            const content = contentRef.current;
            if (!content) return;
            if (e.key === 'ArrowDown') { content.scrollTop += 60; e.preventDefault(); }
            else if (e.key === 'ArrowUp') { content.scrollTop -= 60; e.preventDefault(); }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const sizeClasses = {
        sm: 'max-w-[420px]',
        md: 'max-w-[520px]',
        lg: 'max-w-[620px]',
        xl: 'max-w-[740px]',
    };

    const hasCustomMaxWidth = className.split(' ').some(c => c.startsWith('max-w-'));

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/55 dark:bg-black/75 backdrop-blur-[5px]"
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.96, opacity: 0, y: 8 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className={`relative w-full ${hasCustomMaxWidth ? '' : sizeClasses[size]} ${className} liquid-glass-overlay rounded-[26px] overflow-hidden max-h-[88vh] flex flex-col text-on-surface`}
                    >
                        {/* Luminous Gradient Top Accent Rail */}
                        <div className="h-[2.5px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 shrink-0" />

                        {title && (
                            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                                <div className="flex items-center gap-3 min-w-0">
                                    {icon && (
                                        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500/18 via-violet-500/14 to-cyan-500/18 border border-primary/25 text-primary flex items-center justify-center shrink-0">
                                            {icon}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <h2 className="font-display text-[17px] font-extrabold tracking-tight text-on-surface truncate leading-tight">
                                            {title}
                                        </h2>
                                        {subtitle && (
                                            <p className="text-[11px] font-medium text-on-surface-variant truncate mt-0.5">
                                                {subtitle}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-on-surface/[0.05] border border-on-surface/[0.09] text-[10px] font-bold text-on-surface-variant/70 tracking-wider">
                                        ESC
                                    </span>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="no-fluid w-8 h-8 rounded-full bg-on-surface/[0.06] hover:bg-on-surface/[0.14] flex items-center justify-center transition-colors text-on-surface-variant hover:text-on-surface cursor-pointer"
                                        aria-label="Close"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div
                            ref={contentRef}
                            tabIndex={-1}
                            className="p-6 overflow-y-auto flex-1 custom-scrollbar focus:outline-none"
                        >
                            {children}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default Modal;
