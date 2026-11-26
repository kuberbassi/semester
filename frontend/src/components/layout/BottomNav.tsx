import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard, CalendarClock, Settings,
    GraduationCap, Sun, Moon,
    CalendarDays, Beaker, Award, StickyNote, LogOut, ChevronRight, type LucideIcon
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { haptics } from '@/utils/haptics';

const dockTabs = [
    { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Timetable', href: '/timetable', icon: CalendarClock },
    { name: 'Courses', href: '/courses', icon: GraduationCap },
    { name: 'Results', href: '/results', icon: Award },
    { name: 'Notes', href: '/notes', icon: StickyNote },
];

const radialItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Timetable', href: '/timetable', icon: CalendarClock },
    { name: 'Calendar', href: '/calendar', icon: CalendarDays },
    { name: 'Courses', href: '/courses', icon: GraduationCap },
    { name: 'Practicals & Assignments', href: '/practicals', icon: Beaker },
    { name: 'IPU Results', href: '/results', icon: Award },
    { name: 'Notes', href: '/notes', icon: StickyNote },
    { name: 'Settings', href: '/settings', icon: Settings },
];

type CenterIconInfo =
    | { type: 'logo'; element: string; key: string }
    | { type: 'icon'; element: LucideIcon; key: string };

/**
 * Port of OpenTune's frame-clock stretching lens physics (`rememberStretchingLens`):
 * Integrates the leading & trailing edges of the active pill lens with asymmetric springs
 * so the leading edge shoots ahead and the trailing edge follows like liquid.
 */
function useStretchingLens(activeIndex: number, count: number) {
    const [lens, setLens] = useState(() => ({
        leftPct: (Math.max(0, activeIndex) / count) * 100,
        widthPct: 100 / count,
    }));

    const stateRef = useRef({
        left: Math.max(0, activeIndex),
        right: Math.max(0, activeIndex) + 1,
        leftVel: 0,
        rightVel: 0,
        targetIdx: Math.max(0, activeIndex),
    });

    useEffect(() => {
        stateRef.current.targetIdx = Math.max(0, Math.min(count - 1, activeIndex));
        let rafId = 0;
        let lastTime = performance.now();

        const leadK = 520;
        const leadD = 0.82;
        const trailK = 190;
        const trailD = 0.88;

        const tick = (now: number) => {
            const dt = Math.min(0.032, Math.max(0.004, (now - lastTime) / 1000));
            lastTime = now;

            const s = stateRef.current;
            const toLeft = s.targetIdx;
            const toRight = s.targetIdx + 1;
            const movingRight = toLeft > s.left;

            const lK = movingRight ? trailK : leadK;
            const lD = movingRight ? trailD : leadD;
            const rK = movingRight ? leadK : trailK;
            const rD = movingRight ? leadD : trailD;

            const steps = Math.max(1, Math.min(6, Math.ceil(dt / 0.0075)));
            const h = dt / steps;
            for (let i = 0; i < steps; i++) {
                const lAccel = lK * (toLeft - s.left) - 2 * lD * Math.sqrt(lK) * s.leftVel;
                s.leftVel += lAccel * h;
                s.left += s.leftVel * h;

                const rAccel = rK * (toRight - s.right) - 2 * rD * Math.sqrt(rK) * s.rightVel;
                s.rightVel += rAccel * h;
                s.right += s.rightVel * h;
            }

            const settled =
                Math.abs(toLeft - s.left) < 0.002 &&
                Math.abs(toRight - s.right) < 0.002 &&
                Math.abs(s.leftVel) < 0.01 &&
                Math.abs(s.rightVel) < 0.01;

            if (settled) {
                s.left = toLeft;
                s.right = toRight;
                s.leftVel = 0;
                s.rightVel = 0;
            }

            setLens({
                leftPct: (s.left / count) * 100,
                widthPct: Math.max(0.2, s.right - s.left) * (100 / count),
            });

            if (!settled) {
                rafId = requestAnimationFrame(tick);
            }
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [activeIndex, count]);

    return lens;
}

const BottomNav: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();

    // OpenTune ChromeScrollConnection: fold dock on scroll down, expand on scroll up
    const [dockInline, setDockInline] = useState(false);
    const scrollAccRef = useRef(0);
    const lastScrollYRef = useRef(0);

    useEffect(() => {
        const onScroll = () => {
            const y = window.scrollY;
            const dy = y - lastScrollYRef.current;
            lastScrollYRef.current = y;
            if (y < 32) {
                setDockInline(false);
                scrollAccRef.current = 0;
                return;
            }
            if ((scrollAccRef.current > 0 && dy < 0) || (scrollAccRef.current < 0 && dy > 0)) {
                scrollAccRef.current = 0;
            }
            scrollAccRef.current += dy;
            if (scrollAccRef.current > 56) {
                setDockInline(true);
                scrollAccRef.current = 0;
            } else if (scrollAccRef.current < -48) {
                setDockInline(false);
                scrollAccRef.current = 0;
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Expand dock on route change
    useEffect(() => {
        setDockInline(false);
    }, [location.pathname]);

    const matchedDockIdx = dockTabs.findIndex(t => t.href === location.pathname);
    const activeDockIdx = matchedDockIdx >= 0 ? matchedDockIdx : 0;
    const isRouteInDock = matchedDockIdx >= 0;
    const lens = useStretchingLens(activeDockIdx, dockTabs.length);

    // Digital Crown Radial Bubble Menu State (Semester's signature interaction)
    const [isHolding, setIsHolding] = useState(false);
    const [pointerDownTime, setPointerDownTime] = useState(0);
    const [center, setCenter] = useState({ x: 0, y: 0 });
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const [lastTap, setLastTap] = useState(0);
    const [profileOpen, setProfileOpen] = useState(false);

    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCrownAngleRef = useRef<number | null>(null);
    const lastCrownDistanceRef = useRef<number>(0);
    const lastCrownTickTimeRef = useRef<number>(0);
    const prevActiveIdxRef = useRef<number | null>(null);

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        haptics.light();

        const buttonRect = e.currentTarget.getBoundingClientRect();
        setCenter({
            x: buttonRect.left + buttonRect.width / 2,
            y: buttonRect.top + buttonRect.height / 2,
        });
        lastCrownAngleRef.current = null;
        lastCrownDistanceRef.current = 0;
        prevActiveIdxRef.current = null;

        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        holdTimerRef.current = setTimeout(() => {
            setIsHolding(true);
            haptics.medium();
            lastCrownTickTimeRef.current = performance.now() + 50;
        }, 200);

        setPointerDownTime(Date.now());
    }, []);

    useEffect(() => {
        if (!pointerDownTime) return;

        const handlePointerMove = (e: PointerEvent) => {
            if (!isHolding) return;
            const dX = e.clientX - center.x;
            const dY = e.clientY - center.y;
            const distance = Math.sqrt(dX * dX + dY * dY);

            let angle = Math.atan2(-dY, dX) * 180 / Math.PI;
            if (angle < 0) angle += 360;

            const now = performance.now();

            if (distance > 24) {
                if (lastCrownAngleRef.current === null) {
                    lastCrownAngleRef.current = angle;
                    lastCrownDistanceRef.current = distance;
                } else {
                    let diff = angle - lastCrownAngleRef.current;
                    if (diff > 180) diff -= 360;
                    if (diff < -180) diff += 360;
                    if (Math.abs(diff) >= 7.2 || Math.abs(distance - lastCrownDistanceRef.current) >= 28) {
                        if (now - lastCrownTickTimeRef.current >= 30) {
                            haptics.crownTick();
                            lastCrownTickTimeRef.current = now;
                        }
                        lastCrownAngleRef.current = angle;
                        lastCrownDistanceRef.current = distance;
                    }
                }
            }

            if (distance > 30 && distance < 250) {
                let closestIdx = 0;
                let minDiff = Infinity;
                const startAngle = 180;
                const endAngle = 0;
                const angleStep = (startAngle - endAngle) / (radialItems.length - 1);
                radialItems.forEach((_, idx) => {
                    const itemAngle = startAngle - idx * angleStep;
                    let diff = Math.abs(angle - itemAngle);
                    if (diff > 180) diff = 360 - diff;
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIdx = idx;
                    }
                });

                if (closestIdx !== prevActiveIdxRef.current) {
                    haptics.focus();
                    lastCrownTickTimeRef.current = now + 25;
                    prevActiveIdxRef.current = closestIdx;
                }
                setActiveIdx(closestIdx);
            } else {
                if (prevActiveIdxRef.current !== null) {
                    haptics.tick();
                    prevActiveIdxRef.current = null;
                }
                setActiveIdx(null);
            }
        };

        const handlePointerUp = () => {
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);

            const duration = Date.now() - pointerDownTime;
            if (duration < 240) {
                const now = Date.now();
                if (now - lastTap < 320) {
                    haptics.medium();
                    setProfileOpen(true);
                } else {
                    haptics.light();
                    setProfileOpen(prev => !prev);
                }
                setLastTap(now);
            } else if (isHolding && activeIdx !== null) {
                haptics.selection();
                navigate(radialItems[activeIdx].href);
            } else if (isHolding) {
                haptics.tick();
            }

            setIsHolding(false);
            setActiveIdx(null);
            setPointerDownTime(0);
            lastCrownAngleRef.current = null;
            lastCrownDistanceRef.current = 0;
            prevActiveIdxRef.current = null;
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [pointerDownTime, isHolding, center, activeIdx, lastTap, navigate]);

    const currentNavItem = radialItems.find(item => item.href === location.pathname);
    const focusedNavItem = activeIdx !== null ? radialItems[activeIdx] : currentNavItem;

    const getCenterIcon = (): CenterIconInfo => {
        if (activeIdx !== null) {
            return { type: 'icon', element: radialItems[activeIdx].icon, key: `hovered-${activeIdx}` };
        }
        if (isHolding) {
            return { type: 'logo', element: '/Semester-logo-96.png', key: 'logo' };
        }
        if (currentNavItem) {
            return { type: 'icon', element: currentNavItem.icon, key: `current-${location.pathname}` };
        }
        return { type: 'logo', element: '/Semester-logo-96.png', key: 'logo' };
    };

    const centerIconInfo = getCenterIcon();
    const startAngle = 180;
    const endAngle = 0;
    const angleStep = (startAngle - endAngle) / (radialItems.length - 1);
    const ActiveTabIcon = dockTabs[activeDockIdx]?.icon || LayoutDashboard;

    return (
        <>
            {/* SVG Connecting Line when Crown Orb is active */}
            {isHolding && activeIdx !== null && (
                <svg className="fixed inset-0 w-full h-full pointer-events-none z-[997]">
                    {(() => {
                        const itemAngle = startAngle - activeIdx * angleStep;
                        const rad = itemAngle * Math.PI / 180;
                        const radius = 108;
                        const tx = Math.cos(rad) * radius;
                        const ty = -Math.sin(rad) * radius;

                        return (
                            <motion.line
                                initial={{ x2: center.x, y2: center.y }}
                                animate={{ x2: center.x + tx, y2: center.y + ty }}
                                transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                                x1={center.x}
                                y1={center.y}
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeDasharray="5 4"
                                className="text-primary stroke-current opacity-75"
                            />
                        );
                    })()}
                </svg>
            )}

            {/* OpenTune Floating Liquid Glass Bottom Chrome + Companion Crown Orb */}
            <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-2.5 max-w-[calc(100vw-24px)]">
                {/* Stretching-Lens Liquid Glass Dock Pill */}
                <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    className={`liquid-glass-pill rounded-[32px] p-1.5 flex items-center overflow-hidden ${
                        dockInline ? 'h-[54px] w-[54px] justify-center cursor-pointer' : 'h-[62px] w-[min(430px,calc(100vw-92px))]'
                    }`}
                    onClick={dockInline ? () => { haptics.crownTick(); setDockInline(false); } : undefined}
                    title={dockInline ? 'Expand navigation dock' : undefined}
                >
                    {dockInline ? (
                        <motion.div
                            key="dock-collapsed-icon"
                            initial={{ scale: 0.75, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.75, opacity: 0 }}
                            className="text-primary flex items-center justify-center"
                        >
                            <ActiveTabIcon size={22} />
                        </motion.div>
                    ) : (
                        <div className="relative w-full h-full flex items-center">
                            {/* Physics-Integrated Stretching Liquid Lens */}
                            {isRouteInDock && (
                                <div
                                    className="pointer-events-none absolute top-0 bottom-0 rounded-[26px] border border-primary/45 bg-gradient-to-b from-primary/25 to-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                                    style={{
                                        left: `${lens.leftPct}%`,
                                        width: `${lens.widthPct}%`,
                                        willChange: 'left, width',
                                    }}
                                />
                            )}

                            {dockTabs.map((tab, idx) => {
                                const Icon = tab.icon;
                                const isSelected = isRouteInDock && idx === activeDockIdx;
                                return (
                                    <button
                                        key={tab.href}
                                        type="button"
                                        onClick={() => {
                                            if (location.pathname !== tab.href) {
                                                haptics.crownTick();
                                                navigate(tab.href);
                                            }
                                        }}
                                        className={`no-fluid relative z-10 flex-1 h-full flex flex-col items-center justify-center gap-0.5 rounded-[26px] cursor-pointer transition-colors duration-200 ${
                                            isSelected
                                                ? 'text-primary'
                                                : 'text-on-surface-variant hover:text-on-surface'
                                        }`}
                                    >
                                        <motion.div
                                            animate={{ scale: isSelected ? 1.08 : 1 }}
                                            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                                        >
                                            <Icon size={20} strokeWidth={isSelected ? 2.3 : 1.9} />
                                        </motion.div>
                                        <span className="text-[10px] font-semibold tracking-tight leading-none">
                                            {tab.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </motion.div>

                {/* Companion Liquid Glass Digital Crown Orb (Hold & Drag for Radial Menu, Click for Profile) */}
                <motion.button
                    layout
                    onPointerDown={handlePointerDown}
                    transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                    className={`no-fluid relative rounded-full flex items-center justify-center select-none cursor-pointer touch-none ${
                        dockInline ? 'w-[54px] h-[54px]' : 'w-[62px] h-[62px]'
                    } ${
                        isHolding
                            ? 'bg-primary text-on-primary scale-95 shadow-[0_0_30px_rgba(16,185,129,0.5)] border border-primary'
                            : 'liquid-glass-pill text-on-surface hover:scale-105 active:scale-90'
                    }`}
                    title="Click for Profile & Theme • Hold & Drag for Radial Crown Menu"
                >
                    {isHolding && (
                        <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-60 pointer-events-none" />
                    )}
                    <AnimatePresence mode="wait">
                        {centerIconInfo.type === 'logo' ? (
                            <motion.img
                                key={centerIconInfo.key}
                                initial={{ scale: 0.7, opacity: 0, rotate: -24 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                exit={{ scale: 0.7, opacity: 0, rotate: 24 }}
                                transition={{ duration: 0.14 }}
                                src={centerIconInfo.element}
                                alt="Semester"
                                className={`w-6 h-6 object-contain ${
                                    isHolding
                                        ? (theme === 'dark' ? 'invert' : 'invert-0')
                                        : (theme === 'dark' ? 'invert-0' : 'invert')
                                }`}
                            />
                        ) : (
                            (() => {
                                const IconComp = centerIconInfo.element;
                                return (
                                    <motion.div
                                        key={centerIconInfo.key}
                                        initial={{ scale: 0.7, opacity: 0, rotate: -24 }}
                                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                        exit={{ scale: 0.7, opacity: 0, rotate: 24 }}
                                        transition={{ duration: 0.14 }}
                                    >
                                        <IconComp className="w-5 h-5 text-current" />
                                    </motion.div>
                                );
                            })()
                        )}
                    </AnimatePresence>
                </motion.button>
            </div>

            {/* Radial Menu Fan Overlay */}
            <AnimatePresence>
                {isHolding && (
                    <div className="fixed inset-0 z-[998] pointer-events-none select-none bg-black/25 backdrop-blur-[3px]">
                        <AnimatePresence mode="wait">
                            {focusedNavItem && (
                                <motion.div
                                    key={focusedNavItem.href}
                                    initial={{ opacity: 0, x: '-50%', y: 6, scale: 0.96 }}
                                    animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
                                    exit={{ opacity: 0, x: '-50%', y: -4, scale: 0.96 }}
                                    transition={{ duration: 0.12 }}
                                    role="status"
                                    aria-live="polite"
                                    className="absolute z-[2] max-w-[min(16rem,calc(100vw-2rem))] rounded-full liquid-glass-pill px-4 py-2 text-center text-xs font-bold tracking-wide text-on-surface"
                                    style={{ left: center.x, top: Math.max(16, center.y - 180) }}
                                >
                                    {focusedNavItem.name}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {radialItems.map((item, idx) => {
                            const itemAngle = startAngle - idx * angleStep;
                            const rad = itemAngle * Math.PI / 180;
                            const radius = 108;
                            const tx = Math.cos(rad) * radius;
                            const ty = -Math.sin(rad) * radius;
                            const isActive = activeIdx === idx;
                            const isCurrentRoute = location.pathname === item.href;

                            return (
                                <motion.div
                                    key={item.href}
                                    initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                                    animate={{
                                        opacity: 1,
                                        scale: isActive ? 1.28 : 1,
                                        x: tx,
                                        y: ty,
                                        transition: { type: 'spring', damping: 16, stiffness: 240 }
                                    }}
                                    exit={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                                    className="absolute"
                                    style={{ left: center.x - 21, top: center.y - 21 }}
                                >
                                    <div
                                        className={`w-[42px] h-[42px] rounded-full flex items-center justify-center border transition-all ${
                                            isActive
                                                ? 'bg-primary text-on-primary border-primary shadow-lg shadow-primary/40'
                                                : isCurrentRoute
                                                    ? 'liquid-glass-pill border-primary/70 text-primary'
                                                    : 'liquid-glass-pill text-on-surface'
                                        }`}
                                    >
                                        <item.icon size={19} />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </AnimatePresence>

            {/* Liquid Glass Profile & Quick Settings Drawer */}
            <AnimatePresence>
                {profileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 z-[9998] backdrop-blur-sm"
                            onClick={() => {
                                haptics.light();
                                setProfileOpen(false);
                            }}
                        />

                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                            className="fixed bottom-4 left-4 right-4 md:max-w-md md:mx-auto liquid-glass rounded-[28px] z-[9999] max-h-[65vh] overflow-y-auto text-on-surface p-6"
                        >
                            <div className="w-12 h-1 bg-on-surface/20 rounded-full mx-auto mb-5" />

                            <div className="bg-surface-container/60 border border-outline/40 rounded-2xl p-4 flex items-center gap-4 mb-5">
                                <div className="w-11 h-11 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                                    {user?.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-bold text-on-surface truncate">{user?.name || 'User'}</h3>
                                    <p className="text-xs text-on-surface-variant truncate mt-0.5">{user?.email}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <button
                                    onClick={() => {
                                        haptics.light();
                                        toggleTheme();
                                    }}
                                    className="flex flex-col items-start justify-between p-4 h-24 rounded-2xl border border-outline/40 bg-surface-container/50 hover:bg-surface-container-high transition-all text-left cursor-pointer"
                                >
                                    <div className="p-2 rounded-xl bg-primary/15 text-primary">
                                        {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-on-surface">Theme</p>
                                        <span className="text-[11px] text-on-surface-variant capitalize">{theme} Mode</span>
                                    </div>
                                </button>

                                <Link
                                    to="/settings"
                                    onClick={() => {
                                        haptics.light();
                                        setProfileOpen(false);
                                    }}
                                    className="flex flex-col items-start justify-between p-4 h-24 rounded-2xl border border-outline/40 bg-surface-container/50 hover:bg-surface-container-high transition-all text-left"
                                >
                                    <div className="p-2 rounded-xl bg-primary/15 text-primary">
                                        <Settings size={16} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-on-surface">Settings</p>
                                        <span className="text-[11px] text-on-surface-variant">Configure App</span>
                                    </div>
                                </Link>

                                <button
                                    onClick={() => {
                                        haptics.medium();
                                        setProfileOpen(false);
                                        logout();
                                    }}
                                    className="col-span-2 flex items-center justify-between p-4 rounded-2xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/15 transition-all text-left cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-red-500/15 text-red-400">
                                            <LogOut size={16} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-red-400">Sign Out</p>
                                            <span className="text-[11px] text-red-400/70">Disconnect account</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={15} className="text-red-400" aria-hidden="true" />
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default BottomNav;
