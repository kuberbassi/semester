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
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((o) => String(o.value) === String(value));
    const displayLabel = selectedOption?.label || (options.length > 0 ? options[0].label : '');

    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
                    return;
                }
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Track coordinates in viewport
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const updateCoords = () => {
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + window.scrollY,
                    left: rect.left + window.scrollX,
                    width: rect.width,
                });
            };
            updateCoords();
            window.addEventListener('resize', updateCoords);
            window.addEventListener('scroll', updateCoords, true);
            return () => {
                window.removeEventListener('resize', updateCoords);
                window.removeEventListener('scroll', updateCoords, true);
            };
        }
    }, [isOpen]);

    // Close on ESC
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        if (isOpen) document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen]);

    const handleSelect = (optValue: string | number) => {
        haptics.selection();
        if (onChange) {
            onChange({ target: { value: String(optValue) } });
        }
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={`${fullWidth ? 'w-full' : 'w-auto'} flex flex-col gap-1.5 relative select-none`}>
            {label && (
                <label className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest ml-1">
                    {label}
                </label>
            )}

            {/* Custom GlideSelect Trigger Button */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (!disabled) {
                        if (!isOpen && containerRef.current) {
                            const rect = containerRef.current.getBoundingClientRect();
                            setCoords({
                                top: rect.bottom + window.scrollY,
                                left: rect.left + window.scrollX,
                                width: rect.width,
                            });
                        }
                        setIsOpen(!isOpen);
                    }
                }}
                className={`
                    w-full px-4 py-2.5 rounded-xl text-left
                    bg-surface/80 dark:bg-slate-900/80 backdrop-blur-xl
                    border transition-all duration-200
                    text-on-surface text-sm font-semibold
                    disabled:opacity-40 disabled:cursor-not-allowed
                    focus:outline-none cursor-pointer flex items-center justify-between gap-2 shadow-xs
                    ${
                        error
                            ? 'border-rose-500/50 shadow-rose-500/10'
                            : isOpen
                            ? 'border-cyan-500/60 ring-2 ring-cyan-500/15 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                            : 'border-outline/40 hover:border-outline hover:bg-surface-container/30'
                    }
                    ${className}
                `}
            >
                <span className={`truncate flex items-center gap-2 ${selectedOption ? 'text-on-surface' : 'text-on-surface-variant/40'}`}>
                    {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
                    {displayLabel}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-on-surface-variant/50 transition-transform duration-250 ease-out ${
                        isOpen ? 'rotate-180 text-cyan-400' : ''
                    }`}
                />
            </button>

            {/* GlideSelect Framer Portal Dropdown */}
            {createPortal(
                <AnimatePresence>
                    {isOpen && coords && (
                        <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, y: -6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 4, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.96 }}
                            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                            onMouseLeave={() => setHoveredIndex(null)}
                            className="fixed rounded-2xl border border-white/15 bg-slate-950/95 dark:bg-slate-900/95 backdrop-blur-2xl p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.4)] z-[999999] overflow-hidden"
                            style={{
                                top: `${coords.top}px`,
                                left: `${coords.left}px`,
                                width: `${coords.width}px`,
                                maxHeight: '260px',
                                overflowY: 'auto',
                            }}
                        >
                            {/* Ambient Top Glow Line */}
                            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

                            <div className="flex flex-col gap-0.5">
                                {options.map((opt, idx) => {
                                    const isSelected = String(opt.value) === String(value);
                                    const isHovered = hoveredIndex === idx;

                                    return (
                                        <div
                                            key={`${opt.value}-${idx}`}
                                            onMouseEnter={() => setHoveredIndex(idx)}
                                            onClick={() => handleSelect(opt.value)}
                                            className="relative cursor-pointer"
                                        >
                                            {/* Gliding Spring Hover Indicator */}
                                            {isHovered && (
                                                <motion.div
                                                    layoutId="glide-dropdown-hover"
                                                    className="absolute inset-0 rounded-xl bg-white/[0.08] border border-white/10 pointer-events-none"
                                                    transition={{
                                                        type: 'spring',
                                                        stiffness: 450,
                                                        damping: 32,
                                                    }}
                                                />
                                            )}

                                            <div
                                                className={`
                                                    relative z-10 w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-bold
                                                    flex items-center justify-between transition-colors
                                                    ${
                                                        isSelected
                                                            ? 'text-cyan-400 bg-cyan-500/10'
                                                            : 'text-slate-200 hover:text-white'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                                                    <span className="truncate">{opt.label}</span>
                                                </div>

                                                {isSelected && (
                                                    <motion.span
                                                        initial={{ scale: 0.5, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        className="shrink-0 text-cyan-400"
                                                    >
                                                        <Check size={14} strokeWidth={2.5} />
                                                    </motion.span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Hidden native select for form accessibility */}
            <select className="sr-only" value={value} onChange={() => {}} tabIndex={-1} {...props}>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            {(error || helperText) && (
                <p className={`text-xs ml-1 ${error ? 'text-rose-500 font-medium' : 'text-on-surface-variant/50'}`}>
                    {error || helperText}
                </p>
            )}
        </div>
    );
};

export default Select;
