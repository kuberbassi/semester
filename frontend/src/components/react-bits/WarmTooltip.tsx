import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface WarmTooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
    className?: string;
}

const GAP = 9;
const PAD = 10;

/**
 * Unified Liquid-Glass Tooltip wrapper:
 * - For text/number content, delegates directly to `GlobalTooltipHost` (`data-tooltip`) so
 *   delay, splash-blocking, viewport auto-flip, and dismissal are 100% consistent app-wide.
 * - For rich JSX content, renders a blocker-aware, pre-paint measured portal tooltip.
 */
export const WarmTooltip: React.FC<WarmTooltipProps> = ({
    content,
    children,
    position = 'top',
    className = '',
}) => {
    const isPlainText = typeof content === 'string' || typeof content === 'number';
    const [openState, setOpenState] = useState(false);
    const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    const tipRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<number | null>(null);

    const close = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setOpenState(false);
        setCoords(null);
    };

    const scheduleOpen = () => {
        if (isPlainText) return;
        if (document.querySelector('[data-tooltip-blocker="true"]')) return;
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            if (document.querySelector('[data-tooltip-blocker="true"]')) return;
            setOpenState(true);
        }, 240);
    };

    useEffect(() => {
        if (isPlainText || !openState) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        window.addEventListener('scroll', close, true);
        window.addEventListener('wheel', close, { capture: true, passive: true });
        window.addEventListener('resize', close);
        window.addEventListener('blur', close);
        window.addEventListener('semester:hide-tooltips', close);
        document.addEventListener('pointerdown', close, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('wheel', close, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('blur', close);
            window.removeEventListener('semester:hide-tooltips', close);
            document.removeEventListener('pointerdown', close, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [isPlainText, openState]);

    useEffect(() => () => close(), []);

    useLayoutEffect(() => {
        if (isPlainText || !openState || !anchorRef.current || !tipRef.current) return;
        const a = anchorRef.current.getBoundingClientRect();
        const t = tipRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let side = position;
        if (side === 'top' && a.top - GAP - t.height < PAD) side = 'bottom';
        else if (side === 'bottom' && a.bottom + GAP + t.height > vh - PAD) side = 'top';
        else if (side === 'right' && a.right + GAP + t.width > vw - PAD) side = 'left';
        else if (side === 'left' && a.left - GAP - t.width < PAD) side = 'right';

        let left = a.left + (a.width - t.width) / 2;
        let top = a.top - GAP - t.height;
        if (side === 'bottom') top = a.bottom + GAP;
        else if (side === 'right') { left = a.right + GAP; top = a.top + (a.height - t.height) / 2; }
        else if (side === 'left') { left = a.left - GAP - t.width; top = a.top + (a.height - t.height) / 2; }

        setCoords({
            left: Math.round(Math.max(PAD, Math.min(vw - PAD - t.width, left))),
            top: Math.round(Math.max(PAD, Math.min(vh - PAD - t.height, top))),
        });
    }, [isPlainText, openState, position]);

    if (isPlainText) {
        return (
            <div
                className={`relative inline-flex items-center justify-center ${className}`}
                data-tooltip={String(content)}
                data-tooltip-pos={position}
            >
                {children}
            </div>
        );
    }

    return (
        <div
            ref={anchorRef}
            className={`relative inline-flex items-center justify-center ${className}`}
            onMouseEnter={scheduleOpen}
            onMouseLeave={close}
            onFocus={scheduleOpen}
            onBlur={close}
        >
            {children}
            {openState && typeof document !== 'undefined' && createPortal(
                <div
                    ref={tipRef}
                    role="tooltip"
                    style={{
                        position: 'fixed',
                        left: coords ? `${coords.left}px` : '-9999px',
                        top: coords ? `${coords.top}px` : '-9999px',
                        visibility: coords ? 'visible' : 'hidden',
                        zIndex: 10050,
                    }}
                    className="pointer-events-none select-none"
                >
                    <div className={`max-w-[260px] px-3 py-1.5 rounded-xl bg-[#0e111b]/96 dark:bg-[#171b2a]/96 text-slate-50 border border-white/15 dark:border-indigo-300/22 text-[11px] font-semibold leading-snug shadow-[0_12px_30px_-8px_rgba(0,0,0,0.55)] backdrop-blur-md ${coords ? 'animate-tooltip-pop' : ''}`}>
                        {content}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};
