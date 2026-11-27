import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
    title: string;
    icon: LucideIcon;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

/**
 * Expressive Desktop Window Toolbar Header:
 * Uses Bricolage Grotesque display typography, luminous gradient icon badge,
 * and a refined hairline divider for consistent top alignment across every view.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    icon: Icon,
    badge,
    actions,
    className = '',
}) => {
    return (
        <header
            className={`pb-5 mb-6 border-b border-primary/12 flex flex-wrap items-center justify-between gap-4 ${className}`}
        >
            <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 text-white flex items-center justify-center shadow-[0_8px_20px_-8px_rgba(99,102,241,0.75)] shrink-0">
                    <Icon size={17} strokeWidth={2.2} />
                </div>
                <h1 className="font-display text-2xl sm:text-[28px] font-extrabold tracking-tight text-on-surface truncate leading-none">
                    {title}
                </h1>
                {badge && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500/12 via-violet-500/10 to-cyan-500/12 border border-primary/20 text-[11px] font-bold text-primary tabular-nums shrink-0">
                        {badge}
                    </span>
                )}
            </div>

            {actions && (
                <div className="flex items-center gap-2.5 flex-wrap">
                    {actions}
                </div>
            )}
        </header>
    );
};

export default PageHeader;
