import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, CalendarClock, CalendarDays, GraduationCap,
    Beaker, Award, StickyNote, Settings, Sun, Moon,
    PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useSemester } from '@/contexts/semester-context';
import { haptics } from '@/utils/haptics';
import BrandLogo from '../ui/BrandLogo';
import UserAvatar from '../ui/UserAvatar';

const PREFETCH: Record<string, () => Promise<unknown>> = {
    '/dashboard': () => import('@/pages/Dashboard'),
    '/timetable': () => import('@/pages/TimeTable'),
    '/calendar': () => import('@/pages/Calendar'),
    '/courses': () => import('@/pages/Courses'),
    '/practicals': () => import('@/pages/Practicals'),
    '/results': () => import('@/pages/Results'),
    '/notes': () => import('@/pages/Notes'),
    '/settings': () => import('@/pages/Settings'),
};

const NAV_GROUPS = [
    {
        label: 'Workspace',
        items: [
            { name: 'Dashboard', hint: 'Attendance overview, liquid cards & live radar', href: '/dashboard', icon: LayoutDashboard, accent: 'from-indigo-500 to-cyan-500' },
            { name: 'Timetable', hint: 'Weekly class schedule & period slots', href: '/timetable', icon: CalendarClock, accent: 'from-violet-500 to-fuchsia-500' },
            { name: 'Calendar', hint: 'Monthly attendance log & daily marking', href: '/calendar', icon: CalendarDays, accent: 'from-cyan-500 to-teal-500' },
        ],
    },
    {
        label: 'Academics',
        items: [
            { name: 'Courses', hint: 'Online courses, certifications & milestones', href: '/courses', icon: GraduationCap, accent: 'from-indigo-500 to-violet-500' },
            { name: 'Practicals', hint: 'Lab experiments & assignment file tracker', href: '/practicals', icon: Beaker, accent: 'from-amber-500 to-rose-500' },
            { name: 'Results', hint: 'IPU ExamWeb portal sync & CGPA analytics', href: '/results', icon: Award, accent: 'from-rose-500 to-purple-500' },
            { name: 'Notes', hint: 'Rich academic notes & task checklists', href: '/notes', icon: StickyNote, accent: 'from-teal-500 to-indigo-500' },
        ],
    },
];

/**
 * Native macOS Desktop Sidebar — crisp frosted alabaster in Light Mode,
 * true deep obsidian graphite (#0c0d13) in Dark Mode, refreshed BrandLogo.
 */
export const DesktopSidebar: React.FC = () => {
    const location = useLocation();
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { currentSemester } = useSemester();

    const [collapsed, setCollapsed] = useState<boolean>(() => {
        try {
            return localStorage.getItem('semester_sidebar_collapsed') === '1';
        } catch {
            return false;
        }
    });

    // Publish sidebar width so fixed overlays (Scroll-to-Top) center on the content area only.
    useEffect(() => {
        document.documentElement.style.setProperty('--sidebar-w', collapsed ? '74px' : '244px');
    }, [collapsed]);

    const toggleCollapsed = () => {
        haptics.crownTick();
        setCollapsed(prev => {
            const next = !prev;
            try {
                localStorage.setItem('semester_sidebar_collapsed', next ? '1' : '0');
            } catch {
                // ignore
            }
            return next;
        });
    };

    const isSettingsActive = location.pathname === '/settings';

    return (
        <aside
            className={`hidden md:flex flex-col shrink-0 sticky top-0 h-screen z-30 border-r border-on-surface/10 bg-white/95 dark:bg-[#0c0d13] select-none transition-[width] duration-200 ease-out ${
                collapsed ? 'w-[74px]' : 'w-[244px]'
            }`}
        >
            {/* Brand Header + Collapse Button */}
            <div className={`h-16 px-4 flex items-center border-b border-on-surface/[0.08] ${collapsed ? 'justify-center' : 'justify-between'}`}>
                {!collapsed && (
                    <Link to="/dashboard" className="no-fluid flex items-center gap-2.5 min-w-0 group">
                        <BrandLogo size={32} className="drop-shadow-[0_5px_10px_rgba(79,70,229,0.45)] transition-transform duration-200 group-hover:scale-105" />
                        <div className="min-w-0">
                            <span className="font-display text-[16px] font-extrabold tracking-tight gradient-text block leading-none">
                                Semester
                            </span>
                            <span className="text-[10px] font-semibold text-on-surface-variant block mt-0.5">
                                Semester {currentSemester}
                            </span>
                        </div>
                    </Link>
                )}

                <button
                    type="button"
                    onClick={toggleCollapsed}
                    className="no-fluid w-8 h-8 rounded-xl hover:bg-on-surface/[0.08] text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
            </div>

            {/* Grouped Navigation */}
            <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 space-y-5">
                {NAV_GROUPS.map((group) => (
                    <div key={group.label}>
                        {!collapsed && (
                            <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">
                                {group.label}
                            </p>
                        )}
                        <div className="space-y-1">
                            {group.items.map((item) => {
                                const Icon = item.icon;
                                const active = location.pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        to={item.href}
                                        onClick={() => haptics.crownTick()}
                                        onMouseEnter={() => { void PREFETCH[item.href]?.(); }}
                                        data-tooltip={collapsed ? item.name : undefined}
                                        data-tooltip-pos="right"
                                        className={`no-fluid relative flex items-center rounded-2xl transition-all duration-150 ${
                                            collapsed ? 'justify-center h-10 px-0' : 'gap-2.5 h-10 px-3'
                                        } ${
                                            active
                                                ? 'bg-primary/[0.13] dark:bg-white/[0.09] text-on-surface font-bold border border-primary/25 dark:border-white/15 shadow-xs'
                                                : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06] hover:translate-x-[2px] border border-transparent'
                                        }`}
                                    >
                                        <span
                                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                                                active
                                                    ? `bg-gradient-to-br ${item.accent} text-white shadow-sm`
                                                    : 'text-on-surface-variant'
                                            }`}
                                        >
                                            <Icon size={14} strokeWidth={active ? 2.4 : 1.9} />
                                        </span>
                                        {!collapsed && (
                                            <span className="text-[13px] truncate">{item.name}</span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Bottom Utility & Account Rail */}
            <div className="p-3 border-t border-on-surface/[0.08] space-y-2">
                <div className={`flex items-center ${collapsed ? 'flex-col gap-1.5' : 'gap-1.5'}`}>
                    <Link
                        to="/settings"
                        onClick={() => haptics.crownTick()}
                        onMouseEnter={() => { void PREFETCH['/settings']?.(); }}
                        data-tooltip={collapsed ? 'Settings' : undefined}
                        data-tooltip-pos="right"
                        className={`no-fluid flex items-center rounded-2xl transition-all duration-150 ${
                            collapsed ? 'justify-center w-10 h-9' : 'flex-1 gap-2.5 h-9 px-3'
                        } ${
                            isSettingsActive
                                ? 'bg-primary/[0.14] dark:bg-white/[0.09] text-on-surface font-bold border border-primary/25 dark:border-white/15'
                                : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06] border border-transparent'
                        }`}
                    >
                        <Settings size={15} strokeWidth={isSettingsActive ? 2.3 : 1.9} className={isSettingsActive ? 'text-primary shrink-0' : 'shrink-0'} />
                        {!collapsed && <span className="text-[13px] truncate">Settings</span>}
                    </Link>

                    <button
                        type="button"
                        onClick={() => { haptics.light(); toggleTheme(); }}
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        className="no-fluid w-9 h-9 rounded-2xl bg-on-surface/[0.06] hover:bg-primary/18 border border-on-surface/10 hover:border-primary/35 text-on-surface hover:text-primary flex items-center justify-center transition-all cursor-pointer shrink-0"
                    >
                        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                    </button>
                </div>

                {/* Compact Profile Row */}
                <div
                    data-tooltip={collapsed ? `${user?.name || 'Student'} · ${user?.email || 'Local workspace'}` : undefined}
                    data-tooltip-pos="right"
                    className={`flex items-center rounded-2xl bg-on-surface/[0.04] border border-on-surface/[0.08] ${
                        collapsed ? 'justify-center p-1.5' : 'gap-2.5 p-2'
                    }`}
                >
                    <UserAvatar user={user} size={32} rounded="full" />
                    {!collapsed && (
                        <>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-on-surface truncate leading-tight">
                                    {user?.name?.replace(/\s*\(Dev Mode\)/i, '') || 'Student'}
                                </p>
                                <p className="text-[10px] text-on-surface-variant truncate">
                                    {user?.email || 'Local workspace'}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default DesktopSidebar;
