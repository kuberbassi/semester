import React, { useState, useRef, useEffect, type SelectHTMLAttributes } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { haptics } from '@/utils/haptics';

export interface SelectOption {
    value: string | number;
    label: string;
    icon?: React.ReactNode;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
    label?: string;
    error?: string;
    helperText?: string;
    fullWidth?: boolean;
    options: SelectOption[];
    onChange?: (e: { target: { value: string } }) => void;
}

/**
 * Viewport-aware Liquid Glass Popover Select:
 * Guaranteed `fixed` positioning, flips above if near viewport bottom,
 * clamps horizontally, and glows with gradient accents.
 */
const Select: React.FC<SelectProps> = ({
    label,
    error,
    helperText,
    fullWidth = true,
    options,
    className = '',
    disabled,
    value,
    onChange,
    ...props
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((o) => String(o.value) === String(value));
    const displayLabel = selectedOption?.label || (options.length > 0 ? options[0].label : '');

    const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);

    const computeCoords = () => {
        if (!triggerRef.current) return null;
        const rect = triggerRef.current.getBoundingClientRect();
        const menuWidth = Math.max(rect.width, 148);
        const estimatedHeight = Math.min(260, options.length * 38 + 16);
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < estimatedHeight + 16 && rect.top > estimatedHeight + 16;
        const left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
        const top = openUp ? Math.max(12, rect.top - estimatedHeight - 6) : rect.bottom + 6;
        return { top, left, width: menuWidth, openUp };
    };

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (triggerRef.current?.contains(e.target as Node)) return;
            if (dropdownRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        document.addEventListener('keydown', escHandler);
        return () => {
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('keydown', escHandler);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const updateCoords = () => {
            const next = computeCoords();
            if (next) setCoords(next);
        };
        updateCoords();
        window.addEventListener('resize', updateCoords);
        window.addEventListener('scroll', updateCoords, true);
        return () => {
            window.removeEventListener('resize', updateCoords);
            window.removeEventListener('scroll', updateCoords, true);
        };
    }, [isOpen, options.length]);

    const handleSelect = (optValue: string | number) => {
        haptics.crownTick();
        onChange?.({ target: { value: String(optValue) } });
        setIsOpen(false);
    };

    return (
        <div className={`${fullWidth ? 'w-full' : 'w-auto'} flex flex-col gap-1.5 relative select-none`}>
            {label && (
                <label className="text-[11px] font-semibold text-on-surface-variant ml-0.5">
                    {label}
                </label>
            )}

            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => {
                    if (disabled) return;
                    if (!isOpen) {
                        const next = computeCoords();
                        if (next) setCoords(next);
                    }
                    setIsOpen((prev) => !prev);
                }}
                className={`no-fluid w-full px-3.5 py-2 rounded-full text-left bg-surface/80 dark:bg-white/[0.06] hover:bg-primary/[0.08] border text-on-surface text-xs font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none cursor-pointer flex items-center justify-between gap-2 shadow-xs ${
                    error
                        ? 'border-rose-500/60'
                        : isOpen
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-primary/20 hover:border-primary/40'
                } ${className}`}
            >
                <span className={`truncate flex items-center gap-2 ${selectedOption ? 'text-on-surface' : 'text-on-surface-variant/60'}`}>
                    {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
                    {displayLabel}
                </span>
                <ChevronDown
                    size={14}
                    className={`text-primary transition-transform duration-150 shrink-0 ${
                        isOpen ? 'rotate-180' : ''
                    }`}
                />
            </button>

            {createPortal(
                <AnimatePresence>
                    {isOpen && coords && (
                        <motion.div
                            ref={dropdownRef}
                            role="listbox"
                            initial={{ opacity: 0, y: coords.openUp ? 4 : -4, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: coords.openUp ? 4 : -4, scale: 0.97 }}
                            transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
                            className="fixed liquid-glass-overlay rounded-2xl p-1.5 z-[999999] custom-scrollbar"
                            style={{
                                position: 'fixed',
                                top: `${coords.top}px`,
                                left: `${coords.left}px`,
                                width: `${coords.width}px`,
                                maxHeight: '260px',
                                overflowY: 'auto',
                            }}
                        >
                            <div className="flex flex-col gap-0.5">
                                {options.map((opt, idx) => {
                                    const isSelected = String(opt.value) === String(value);
                                    return (
                                        <button
                                            key={`${opt.value}-${idx}`}
                                            type="button"
                                            role="option"
                                            aria-selected={isSelected}
                                            onClick={() => handleSelect(opt.value)}
                                            className={`no-fluid w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors duration-100 cursor-pointer ${
                                                isSelected
                                                    ? 'bg-gradient-to-r from-indigo-500/18 via-violet-500/14 to-cyan-500/14 text-primary border border-primary/20'
                                                    : 'text-on-surface hover:bg-primary/[0.08] border border-transparent'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2 truncate">
                                                {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                                                <span className="truncate">{opt.label}</span>
                                            </span>
                                            {isSelected && <Check size={13} strokeWidth={2.6} className="shrink-0 text-primary" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <select className="sr-only" value={value} onChange={() => {}} tabIndex={-1} {...props}>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            {(error || helperText) && (
                <p className={`text-xs ml-1 ${error ? 'text-rose-500 font-medium' : 'text-on-surface-variant/65'}`}>
                    {error || helperText}
                </p>
            )}
        </div>
    );
};

export default Select;
