import React, { type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
    fullWidth?: boolean;
}

const Input: React.FC<InputProps> = ({
    label,
    error,
    helperText,
    fullWidth = true,
    className = '',
    disabled,
    ...props
}) => {
    return (
        <div className={`${fullWidth ? 'w-full' : 'w-auto'} flex flex-col gap-1.5`}>
            {label && (
                <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">
                    {label}
                </label>
            )}
            <div className="relative group">
                <input
                    className={`
                        w-full px-3.5 py-2.5 rounded-xl
                        bg-on-surface/[0.04]
                        border transition-all duration-150
                        text-on-surface text-xs font-medium placeholder:text-on-surface-variant/40
                        disabled:opacity-50 disabled:cursor-not-allowed
                        focus:outline-none focus:ring-2 focus:ring-primary/20
                        ${error
                            ? 'border-rose-500/60 focus:border-rose-400 text-rose-400'
                            : 'border-on-surface/[0.10] focus:border-primary/50 hover:border-on-surface/[0.18]'
                        }
                        ${className}
                    `}
                    disabled={disabled}
                    {...props}
                />
            </div>
            {(error || helperText) && (
                <p className={`text-[11px] ml-0.5 ${error ? 'text-rose-400 font-medium' : 'text-on-surface-variant/70'}`}>
                    {error || helperText}
                </p>
            )}
        </div>
    );
};

export default Input;
