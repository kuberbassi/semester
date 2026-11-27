import React, { type ButtonHTMLAttributes, type ReactNode } from 'react';
import Loader from './Loader';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'link' | 'filled' | 'tonal' | 'outlined' | 'text';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    icon?: ReactNode;
    children: ReactNode;
}

const Button: React.FC<ButtonProps> = ({
    variant = 'filled',
    size = 'md',
    isLoading = false,
    icon,
    className = '',
    children,
    disabled,
    ...props
}) => {
    const baseClasses = "no-fluid inline-flex items-center justify-center font-bold transition-all duration-150 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer shrink-0 whitespace-nowrap flex-nowrap active:scale-[0.97]";

    const variantClasses: Record<string, string> = {
        primary: "btn-gradient",
        filled: "btn-gradient",

        secondary: "bg-on-surface/[0.06] text-on-surface hover:bg-on-surface/[0.11] border border-on-surface/15",
        tonal: "bg-primary/14 text-primary hover:bg-primary/22 border border-primary/25",

        outlined: "border border-on-surface/15 text-on-surface hover:bg-on-surface/[0.06]",
        outline: "border border-on-surface/15 text-on-surface hover:bg-on-surface/[0.06]",

        ghost: "text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.07] border border-transparent",
        text: "text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.07] border border-transparent",

        danger: "bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:brightness-110 border border-transparent shadow-sm",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto bg-transparent",
    };

    const sizeClasses = {
        sm: "px-3.5 h-8 text-xs rounded-full gap-1.5",
        md: "px-5 h-10 text-xs rounded-full gap-2",
        lg: "px-6 h-11 text-sm rounded-full gap-2.5",
    };

    return (
        <button
            className={`${baseClasses} ${variantClasses[variant] || variantClasses.filled} ${sizeClasses[size] || sizeClasses.md} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <div className="flex items-center gap-2">
                    <Loader size={15} />
                    <span>Loading…</span>
                </div>
            ) : (
                <>
                    {icon && <span className="shrink-0">{icon}</span>}
                    <span className="whitespace-nowrap">{children}</span>
                </>
            )}
        </button>
    );
};

export default Button;
