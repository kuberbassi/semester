import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

type Placement = 'top' | 'bottom' | 'left' | 'right';

interface ActiveTooltip {
    text: string;
    el: HTMLElement;
    preferred: Placement;
    id: number;
}

interface PositionedCoords {
    left: number;
    top: number;
    placement: Placement;
}

const TOOLTIP_GAP = 9;
const VIEWPORT_PAD = 10;
const INITIAL_DELAY_MS = 280;
const HANDOFF_DELAY_MS = 65;
const HANDOFF_WINDOW_MS = 320;

function hasTooltipBlocker(): boolean {
    return Boolean(document.querySelector('[data-tooltip-blocker="true"]'));
}

function isElementVisible(el: HTMLElement): boolean {
    if (!el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (
        rect.bottom <= 0 ||
        rect.top >= window.innerHeight ||
        rect.right <= 0 ||
        rect.left >= window.innerWidth
    ) {
        return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity || '1') < 0.08) return false;
    return true;
}

function isPointerStillOver(el: HTMLElement, x: number, y: number): boolean {
    if (!isElementVisible(el)) return false;
    const rect = el.getBoundingClientRect();
    const tol = 3;
    if (x < rect.left - tol || x > rect.right + tol || y < rect.top - tol || y > rect.bottom + tol) {
        return false;
    }
    const topEl = document.elementFromPoint(x, y);
    if (!topEl) return false;
    // Ensure the hovered element isn't buried underneath a splash screen, loading overlay, or modal backdrop
    if (topEl.closest('[data-tooltip-blocker="true"]')) return false;
    return el === topEl || el.contains(topEl);
}

function getPreferredPlacement(target: HTMLElement): Placement {
    const explicit = target.getAttribute('data-tooltip-pos') as Placement | null;
    if (explicit === 'top' || explicit === 'bottom' || explicit === 'left' || explicit === 'right') {
        return explicit;
    }
    if (target.closest('aside')) return 'right';
    return 'top';
}

function findTooltipHost(start: EventTarget | null): HTMLElement | null {
    if (!(start instanceof Element)) return null;
    if (start.closest('[data-tooltip-blocker="true"]')) return null;

    let el: HTMLElement | null = start instanceof HTMLElement ? start : start.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
        if (el.hasAttribute('data-tooltip-blocker')) return null;
        const custom = el.getAttribute('data-tooltip')?.trim();
        if (custom) return el;
        const nativeTitle = el.getAttribute('title')?.trim();
        if (nativeTitle) return el;
        const stashed = el.getAttribute('data-tt-native')?.trim();
        if (stashed) return el;
        el = el.parentElement;
    }
    return null;
}

function getTooltipText(el: HTMLElement): string {
    const custom = el.getAttribute('data-tooltip')?.trim();
    if (custom) return custom;
    const nativeTitle = el.getAttribute('title')?.trim();
    if (nativeTitle) return nativeTitle;
    return el.getAttribute('data-tt-native')?.trim() || '';
}

function computeClampedCoords(
    anchorRect: DOMRect,
    tipWidth: number,
    tipHeight: number,
    preferred: Placement,
): PositionedCoords {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let placement: Placement = preferred;

    // Auto-flip along primary axis if preferred side clips the viewport
    if (placement === 'top' && anchorRect.top - TOOLTIP_GAP - tipHeight < VIEWPORT_PAD) {
        if (anchorRect.bottom + TOOLTIP_GAP + tipHeight <= vh - VIEWPORT_PAD) {
            placement = 'bottom';
        }
    } else if (placement === 'bottom' && anchorRect.bottom + TOOLTIP_GAP + tipHeight > vh - VIEWPORT_PAD) {
        if (anchorRect.top - TOOLTIP_GAP - tipHeight >= VIEWPORT_PAD) {
            placement = 'top';
        }
    } else if (placement === 'right' && anchorRect.right + TOOLTIP_GAP + tipWidth > vw - VIEWPORT_PAD) {
        if (anchorRect.left - TOOLTIP_GAP - tipWidth >= VIEWPORT_PAD) {
            placement = 'left';
        } else {
            placement = anchorRect.top - TOOLTIP_GAP - tipHeight >= VIEWPORT_PAD ? 'top' : 'bottom';
        }
    } else if (placement === 'left' && anchorRect.left - TOOLTIP_GAP - tipWidth < VIEWPORT_PAD) {
        if (anchorRect.right + TOOLTIP_GAP + tipWidth <= vw - VIEWPORT_PAD) {
            placement = 'right';
        } else {
            placement = anchorRect.top - TOOLTIP_GAP - tipHeight >= VIEWPORT_PAD ? 'top' : 'bottom';
        }
    }

    let left: number;
    let top: number;

    if (placement === 'right') {
        left = anchorRect.right + TOOLTIP_GAP;
        top = anchorRect.top + (anchorRect.height - tipHeight) / 2;
    } else if (placement === 'left') {
        left = anchorRect.left - TOOLTIP_GAP - tipWidth;
        top = anchorRect.top + (anchorRect.height - tipHeight) / 2;
    } else if (placement === 'bottom') {
        left = anchorRect.left + (anchorRect.width - tipWidth) / 2;
        top = anchorRect.bottom + TOOLTIP_GAP;
    } else {
        left = anchorRect.left + (anchorRect.width - tipWidth) / 2;
        top = anchorRect.top - TOOLTIP_GAP - tipHeight;
    }

    left = Math.max(VIEWPORT_PAD, Math.min(vw - VIEWPORT_PAD - tipWidth, left));
    top = Math.max(VIEWPORT_PAD, Math.min(vh - VIEWPORT_PAD - tipHeight, top));

    return { left: Math.round(left), top: Math.round(top), placement };
}

/**
 * App-wide Liquid-Glass Tooltip Host:
 * - Never leaks over splash screens, full-screen loaders, or overlays (hit-test + blocker-gated).
 * - Pre-paint `useLayoutEffect` measurement & auto-flip (zero first-frame jump or clipping).
 * - Suppresses WebView2 native `title` popups cleanly without leaving duplicates or orphans.
 * - Immediately dismisses on route change, unmount, scroll, wheel, click, Escape, or window blur.
 */
export const GlobalTooltipHost: React.FC = () => {
    const location = useLocation();
    const [tip, setTip] = useState<ActiveTooltip | null>(null);
    const [coords, setCoords] = useState<PositionedCoords | null>(null);

    const activeElRef = useRef<HTMLElement | null>(null);
    const stashedElsRef = useRef<HTMLElement[]>([]);
    const showTimerRef = useRef<number | null>(null);
    const lastHideRef = useRef<number>(0);
    const seqRef = useRef<number>(0);
    const pointerPosRef = useRef<{ x: number; y: number; active: boolean }>({ x: -1, y: -1, active: false });
    const tipRef = useRef<HTMLDivElement | null>(null);
    const hideRef = useRef<() => void>(() => {});

    useEffect(() => {
        const restoreAllStashedTitles = () => {
            const list = stashedElsRef.current;
            if (list.length === 0) return;
            for (const el of list) {
                const orig = el.getAttribute('data-tt-native');
                if (orig !== null) {
                    el.setAttribute('title', orig);
                    el.removeAttribute('data-tt-native');
                }
            }
            stashedElsRef.current = [];
        };

        const stashTitleChain = (start: EventTarget | null, host: HTMLElement) => {
            let cur: HTMLElement | null = start instanceof HTMLElement ? start : host;
            while (cur && cur !== document.body) {
                const origTitle = cur.getAttribute('title');
                if (origTitle !== null) {
                    cur.setAttribute('data-tt-native', origTitle);
                    cur.removeAttribute('title');
                    if (!stashedElsRef.current.includes(cur)) {
                        stashedElsRef.current.push(cur);
                    }
                }
                if (cur === host) break;
                cur = cur.parentElement;
            }
        };

        const clearPending = () => {
            if (showTimerRef.current !== null) {
                window.clearTimeout(showTimerRef.current);
                showTimerRef.current = null;
            }
        };

        const hide = () => {
            clearPending();
            restoreAllStashedTitles();
            if (activeElRef.current) {
                activeElRef.current = null;
                lastHideRef.current = Date.now();
            }
            setTip(null);
            setCoords(null);
        };

        hideRef.current = hide;

        const scheduleShow = (el: HTMLElement, viaKeyboard: boolean, rawTarget: EventTarget | null) => {
            if (hasTooltipBlocker()) {
                hide();
                return;
            }
            if (activeElRef.current === el) return;

            restoreAllStashedTitles();
            clearPending();

            const text = getTooltipText(el);
            if (!text || !isElementVisible(el)) {
                activeElRef.current = null;
                setTip(null);
                setCoords(null);
                return;
            }

            // Suppress WebView2's native yellow OS tooltip across the hovered chain
            stashTitleChain(rawTarget, el);

            activeElRef.current = el;
            const fastHandoff = Date.now() - lastHideRef.current < HANDOFF_WINDOW_MS;
            const delay = viaKeyboard ? 90 : fastHandoff ? HANDOFF_DELAY_MS : INITIAL_DELAY_MS;

            showTimerRef.current = window.setTimeout(() => {
                showTimerRef.current = null;
                if (activeElRef.current !== el) return;
                if (hasTooltipBlocker() || !isElementVisible(el)) {
                    hide();
                    return;
                }
                if (!viaKeyboard && pointerPosRef.current.active) {
                    if (!isPointerStillOver(el, pointerPosRef.current.x, pointerPosRef.current.y)) {
                        hide();
                        return;
                    }
                }
                const liveText = getTooltipText(el);
                if (!liveText) {
                    hide();
                    return;
                }
                seqRef.current += 1;
                setCoords(null);
                setTip({
                    text: liveText,
                    el,
                    preferred: getPreferredPlacement(el),
                    id: seqRef.current,
                });
            }, delay);
        };

        const onPointerMove = (e: PointerEvent) => {
            if (e.pointerType === 'touch') {
                if (activeElRef.current) hide();
                return;
            }
            pointerPosRef.current = { x: e.clientX, y: e.clientY, active: true };

            if (hasTooltipBlocker()) {
                if (activeElRef.current) hide();
                return;
            }

            const host = findTooltipHost(e.target);
            if (host) {
                if (host !== activeElRef.current) {
                    scheduleShow(host, false, e.target);
                } else {
                    // Refresh title suppression if moving across nested children
                    stashTitleChain(e.target, host);
                }
            } else if (activeElRef.current) {
                hide();
            }
        };

        const onPointerOver = (e: PointerEvent) => {
            if (e.pointerType === 'touch') return;
            pointerPosRef.current = { x: e.clientX, y: e.clientY, active: true };
            if (hasTooltipBlocker()) {
                if (activeElRef.current) hide();
                return;
            }
            const host = findTooltipHost(e.target);
            if (host) {
                scheduleShow(host, false, e.target);
            } else if (activeElRef.current) {
                hide();
            }
        };

        const onPointerOut = (e: PointerEvent) => {
            if (!activeElRef.current) return;
            if (!e.relatedTarget) {
                hide();
                return;
            }
            const related = findTooltipHost(e.relatedTarget);
            if (related === activeElRef.current) return;
            if (!related) hide();
        };

        const onFocusIn = (e: FocusEvent) => {
            if (hasTooltipBlocker()) return;
            const target = e.target;
            if (target instanceof HTMLElement && target.matches(':focus-visible')) {
                const host = findTooltipHost(target);
                if (host) scheduleShow(host, true, target);
            }
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') hide();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible') hide();
        };

        const onDocLeave = () => {
            pointerPosRef.current.active = false;
            hide();
        };

        document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
        document.addEventListener('pointerover', onPointerOver, { capture: true, passive: true });
        document.addEventListener('pointerout', onPointerOut, { capture: true, passive: true });
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', hide, true);
        document.addEventListener('pointerdown', hide, true);
        document.addEventListener('mousedown', hide, true);
        document.addEventListener('contextmenu', hide, true);
        document.addEventListener('dragstart', hide, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('visibilitychange', onVisibilityChange);
        document.documentElement.addEventListener('mouseleave', onDocLeave);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('wheel', hide, { capture: true, passive: true });
        window.addEventListener('resize', hide);
        window.addEventListener('blur', hide);
        window.addEventListener('semester:hide-tooltips', hide);

        return () => {
            hide();
            document.removeEventListener('pointermove', onPointerMove, true);
            document.removeEventListener('pointerover', onPointerOver, true);
            document.removeEventListener('pointerout', onPointerOut, true);
            document.removeEventListener('focusin', onFocusIn, true);
            document.removeEventListener('focusout', hide, true);
            document.removeEventListener('pointerdown', hide, true);
            document.removeEventListener('mousedown', hide, true);
            document.removeEventListener('contextmenu', hide, true);
            document.removeEventListener('dragstart', hide, true);
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            document.documentElement.removeEventListener('mouseleave', onDocLeave);
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('wheel', hide, true);
            window.removeEventListener('resize', hide);
            window.removeEventListener('blur', hide);
            window.removeEventListener('semester:hide-tooltips', hide);
        };
    }, []);

    // Immediately dismiss any open tooltip on route navigation
    useEffect(() => {
        hideRef.current();
    }, [location.pathname, location.search, location.hash]);

    // Watch for active trigger unmount or full-screen blocker insertion while tooltip is visible
    useEffect(() => {
        if (!tip) return;
        const observer = new MutationObserver(() => {
            if (!tip.el.isConnected || hasTooltipBlocker() || !isElementVisible(tip.el)) {
                hideRef.current();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [tip]);

    // Measure actual tooltip dimensions synchronously BEFORE first paint — zero jump or clipping
    useLayoutEffect(() => {
        if (!tip || !tipRef.current) return;
        if (!isElementVisible(tip.el) || hasTooltipBlocker()) {
            hideRef.current();
            return;
        }
        const anchorRect = tip.el.getBoundingClientRect();
        const tipRect = tipRef.current.getBoundingClientRect();
        setCoords(computeClampedCoords(anchorRect, tipRect.width, tipRect.height, tip.preferred));
    }, [tip]);

    if (!tip || typeof document === 'undefined') return null;

    return createPortal(
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
            <div
                key={tip.id}
                className={`max-w-[260px] px-3 py-1.5 rounded-xl bg-[#0e111b]/96 dark:bg-[#171b2a]/96 text-slate-50 border border-white/15 dark:border-indigo-300/22 text-[11px] font-semibold leading-snug tracking-tight shadow-[0_12px_30px_-8px_rgba(0,0,0,0.55)] backdrop-blur-md ${
                    coords ? 'animate-tooltip-pop' : ''
                }`}
            >
                {tip.text}
            </div>
        </div>,
        document.body,
    );
};

export default GlobalTooltipHost;
