import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard, CalendarClock, Settings,
    GraduationCap, Sun, Moon,
    CalendarDays, Beaker, LogOut, ChevronRight, type LucideIcon
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';

import { haptics } from '@/utils/haptics';

const radialItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Timetable', href: '/timetable', icon: CalendarClock },
    { name: 'Calendar', href: '/calendar', icon: CalendarDays },
    { name: 'Courses', href: '/courses', icon: GraduationCap },
    { name: 'Practicals & Assignments', href: '/practicals', icon: Beaker },
    { name: 'Settings', href: '/settings', icon: Settings },
];

type CenterIconInfo =
    | { type: 'logo'; element: string; key: string }
    | { type: 'icon'; element: LucideIcon; key: string };

const BottomNav: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [isHolding, setIsHolding] = useState(false);
    const [pointerDownTime, setPointerDownTime] = useState(0);
    const [center, setCenter] = useState({ x: 0, y: 0 });
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const [lastTap, setLastTap] = useState(0);
    const [profileOpen, setProfileOpen] = useState(false);

    const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Light vibration feedback when pointer hovers over menu items
    useEffect(() => {
        if (activeIdx !== null) {
            haptics.light();
        }
    }, [activeIdx]);

    // Triggers when user presses the central navigation button
    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);

        const buttonRect = e.currentTarget.getBoundingClientRect();
        const centerX = buttonRect.left + buttonRect.width / 2;
        const centerY = buttonRect.top + buttonRect.height / 2;
        setCenter({ x: centerX, y: centerY });
        
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        
        holdTimerRef.current = setTimeout(() => {
            setIsHolding(true);
            haptics.medium();
        }, 220);
        
        setPointerDownTime(Date.now());
    };

    useEffect(() => {
        if (!pointerDownTime) return;

        // Tracks user dragging motion to calculate highlighted menu items
        const handlePointerMove = (e: PointerEvent) => {
            if (!isHolding) return;
            const dX = e.clientX - center.x;
            const dY = e.clientY - center.y;
            const distance = Math.sqrt(dX * dX + dY * dY);
            
            let angle = Math.atan2(-dY, dX) * 180 / Math.PI;
            if (angle < 0) angle += 360;

            // Check if distance is inside the radial menu target zone
            if (distance > 30 && distance < 240) {
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
                setActiveIdx(closestIdx);
            } else {
                setActiveIdx(null);
            }
        };

        // Handles pointer release to trigger navigation or open profile drawer
        const handlePointerUp = () => {
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
            
            const duration = Date.now() - pointerDownTime;
            if (duration < 250) {
                const now = Date.now();
                if (now - lastTap < 300) {
                    setProfileOpen(true);
                }
                setLastTap(now);
            } else if (isHolding && activeIdx !== null) {
                const target = radialItems[activeIdx];
                navigate(target.href);
            }
            
            setIsHolding(false);
            setActiveIdx(null);
            setPointerDownTime(0);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [pointerDownTime, isHolding, center, activeIdx, lastTap, navigate]);

    // Determines which icon to display at the center of the bubble button
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

    return (
        <>
            {/* SVG Connecting Line */}
            {isHolding && activeIdx !== null && (
                <svg className="fixed inset-0 w-full h-full pointer-events-none z-[997]">
                    <defs>
                        <linearGradient id="glow-line" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.1" />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.8" />
                        </linearGradient>
                    </defs>
                    {(() => {
                        const itemAngle = startAngle - activeIdx * angleStep;
                        const rad = itemAngle * Math.PI / 180;
                        const radius = 100;
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
                                className="text-primary stroke-current opacity-70"
                            />
                        );
                    })()}
                </svg>
            )}

            {/* Floating Fingerprint Radial Nav Button (Mobile & Desktop) */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[999]">
                <button
                    onPointerDown={handlePointerDown}
                    className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all select-none cursor-pointer touch-none ${
                        isHolding
                            ? 'bg-primary border-primary text-on-primary scale-95 shadow-inner'
                            : 'bg-surface/85 border-outline text-on-surface backdrop-blur-md shadow-2xl hover:scale-105 active:scale-95'
                    }`}
                >
                    {isHolding && (
                        <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-60 pointer-events-none" />
                    )}
                    <AnimatePresence mode="wait">
                        {centerIconInfo.type === 'logo' ? (
                            <motion.img
                                key={centerIconInfo.key}
                                initial={{ scale: 0.7, opacity: 0, rotate: -30 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                exit={{ scale: 0.7, opacity: 0, rotate: 30 }}
                                transition={{ duration: 0.12 }}
                                src={centerIconInfo.element}
                                alt="Semester"
                                className={`w-6.5 h-6.5 object-contain ${
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
                                        initial={{ scale: 0.7, opacity: 0, rotate: -30 }}
                                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                        exit={{ scale: 0.7, opacity: 0, rotate: 30 }}
                                        transition={{ duration: 0.12 }}
                                    >
                                        <IconComp className="w-6 h-6 text-current" />
                                    </motion.div>
                                );
                            })()
                        )}
                    </AnimatePresence>
                </button>
            </div>

            {/* Radial Menu Fan overlay */}
            <AnimatePresence>
                {isHolding && (
                    <div className="fixed inset-0 z-[998] pointer-events-none select-none bg-black/15 backdrop-blur-[2px]">
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
                                    className="absolute z-[2] max-w-[min(16rem,calc(100vw-2rem))] rounded-full border border-outline/70 bg-surface/95 px-4 py-2 text-center text-xs font-bold tracking-wide text-on-surface shadow-lg backdrop-blur-md"
                                    style={{ left: center.x, top: Math.max(16, center.y - 174) }}
                                >
                                    {focusedNavItem.name}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div 
                            className="absolute rounded-full bg-primary/5 border border-primary/20 pointer-events-none animate-pulse"
                            style={{
                                left: center.x - 30,
                                top: center.y - 30,
                                width: 60,
                                height: 60
                            }}
                        />
                        {radialItems.map((item, idx) => {
                            const itemAngle = startAngle - idx * angleStep;
                            const rad = itemAngle * Math.PI / 180;
                            const radius = 100; // Radius distance from fingerprint center
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
                                        scale: isActive ? 1.3 : 1, 
                                        x: tx, 
                                        y: ty,
                                        transition: { type: 'spring', damping: 16, stiffness: 220 }
                                    }}
                                    exit={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                                    className="absolute"
                                    style={{
                                        left: center.x - 20,
                                        top: center.y - 20,
                                    }}
                                >
                                    <div 
                                        className={`w-10 h-10 rounded-full flex flex-col items-center justify-center border transition-all ${
                                            isActive
                                                ? 'bg-primary text-on-primary border-primary shadow-lg shadow-primary/30'
                                                : isCurrentRoute
                                                    ? 'bg-surface-container-high border-primary text-primary shadow'
                                                    : 'bg-surface border-outline text-on-surface shadow-md'
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

            {/* Profile popover drawer */}
            <AnimatePresence>
                {profileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 z-[9998] backdrop-blur-sm"
                            onClick={() => setProfileOpen(false)}
                        />

                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                            className="fixed bottom-0 left-0 right-0 md:max-w-md md:mx-auto bg-surface border-t border-outline/60 rounded-t-xl z-[9999] max-h-[60vh] overflow-y-auto text-on-surface p-6 shadow-2xl"
                        >
                            <div className="w-12 h-1 bg-outline-variant/30 rounded-full mx-auto mb-6" />

                            {/* User Profile Info Card */}
                            <div className="bg-surface-container/50 border border-outline/10 rounded-xl p-4 flex items-center gap-4 mb-5">
                                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                                    {user?.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-xs font-bold text-on-surface truncate">{user?.name || 'User'}</h3>
                                    <p className="text-[10px] text-on-surface-variant/50 truncate mt-0.5">{user?.email}</p>
                                </div>
                            </div>

                            {/* Quick Actions Grid */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                {/* Theme Action */}
                                <button
                                    onClick={() => { toggleTheme(); }}
                                    className="flex flex-col items-start justify-between p-4 h-24 rounded-xl border border-outline/10 bg-surface-container-low hover:bg-surface-container transition-all text-left cursor-pointer"
                                >
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                        {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-on-surface">Theme</p>
                                        <span className="text-[10px] text-on-surface-variant/50 capitalize">{theme} Mode</span>
                                    </div>
                                </button>

                                {/* Settings Action */}
                                <Link
                                    to="/settings"
                                    onClick={() => setProfileOpen(false)}
                                    className="flex flex-col items-start justify-between p-4 h-24 rounded-xl border border-outline/10 bg-surface-container-low hover:bg-surface-container transition-all text-left"
                                >
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                        <Settings size={15} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-on-surface">Settings</p>
                                        <span className="text-[10px] text-on-surface-variant/50">Configure App</span>
                                    </div>
                                </Link>

                                {/* Logout Action */}
                                <button
                                    onClick={() => { setProfileOpen(false); logout(); }}
                                    className="col-span-2 flex items-center justify-between p-4 rounded-xl border border-red-500/15 bg-red-500/5 hover:bg-red-500/10 transition-all text-left cursor-pointer animate-fade-in"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                                            <LogOut size={15} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-red-500">Sign Out</p>
                                            <span className="text-[10px] text-red-500/50">Disconnect account</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-red-500" aria-hidden="true" />
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


