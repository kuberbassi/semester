import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ChevronDown } from 'lucide-react';
import type { Subject } from '@/types';
import { haptics } from '@/utils/haptics';

interface HorizontalLiquidSubjectsProps {
    subjects: Subject[];
    targetThreshold: number;
    classesNeeded: (attended: number, total: number) => number;
    classesCanSkip: (attended: number, total: number) => number;
    onQuickMark: (subjectId: string, status: 'present' | 'absent') => void;
    onSelectAccent?: (hex: string) => void;
}

const getHealthColor = (pct: number, target: number) => {
    if (pct >= target) return { main: '#10B981', soft: '#34D399' };
    if (pct >= Math.max(50, target - 10)) return { main: '#F59E0B', soft: '#FBBF24' };
    return { main: '#EF4444', soft: '#F87171' };
};

/**
 * Semester's signature Collapsible Horizontal Liquid Subjects Shelf
 * upgraded with OpenTune's Liquid Glass material, live animated SVG liquid wave
 * fills, and spring morphing between Expanded Cards and Compact Liquid Pills.
 */
export const HorizontalLiquidSubjects: React.FC<HorizontalLiquidSubjectsProps> = ({
    subjects,
    targetThreshold,
    classesNeeded,
    classesCanSkip,
    onQuickMark,
    onSelectAccent,
}) => {
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        try {
            return localStorage.getItem('semester_liquid_strip_collapsed') === '1';
        } catch {
            return false;
        }
    });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [phase, setPhase] = useState(0);

    // Single shared rAF clock for all horizontal liquid waves
    useEffect(() => {
        let rafId = 0;
        const step = () => {
            setPhase(p => (p + 0.045) % (Math.PI * 2));
            rafId = requestAnimationFrame(step);
        };
        rafId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafId);
    }, []);

    const toggleCollapse = () => {
        haptics.crownTick();
        setCollapsed(prev => {
            const next = !prev;
            try {
                localStorage.setItem('semester_liquid_strip_collapsed', next ? '1' : '0');
            } catch {
                // ignore
            }
            return next;
        });
    };

    if (subjects.length === 0) return null;

    return (
        <section className="w-full">
            {/* OpenTune SectionHeader with Liquid Collapse Pill */}
            <div className="flex items-center justify-between mb-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/70">
                        {collapsed ? 'Compact Liquid Strip' : 'Live Fluid Attendance Cards'}
                    </p>
                    <h2 className="text-lg font-bold tracking-tight text-on-surface">
                        Liquid Courses
                    </h2>
                </div>

                <button
                    type="button"
                    onClick={toggleCollapse}
                    className="liquid-glass-pill rounded-full px-3.5 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-on-surface cursor-pointer"
                >
                    <span>{collapsed ? 'Expand' : 'Collapse'}</span>
                    <motion.span
                        animate={{ rotate: collapsed ? 0 : 180 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                        className="inline-flex text-primary"
                    >
                        <ChevronDown size={15} />
                    </motion.span>
                </button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
                {collapsed ? (
                    <motion.div
                        key="compact-pills"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-2"
                    >
                        {subjects.map((subject, idx) => {
                            const id = String(subject._id || subject.id || idx);
                            const med = Math.max(0, subject.medical_leave_count || 0);
                            const attended = Math.max(0, (subject.attended || 0) - med);
                            const total = Math.max(0, (subject.total || 0) - med);
                            const pct = subject.attendance_percentage ?? (total > 0 ? (attended / total) * 100 : 0);
                            const { main } = getHealthColor(pct, targetThreshold);
                            const isSelected = selectedId === id;

                            return (
                                <motion.button
                                    key={id}
                                    type="button"
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => {
                                        haptics.crownTick();
                                        setSelectedId(isSelected ? null : id);
                                        onSelectAccent?.(main);
                                    }}
                                    className="no-fluid relative shrink-0 h-11 px-4 rounded-2xl liquid-glass overflow-hidden flex items-center gap-2.5 cursor-pointer"
                                    style={{
                                        borderColor: isSelected ? `${main}99` : undefined,
                                    }}
                                >
                                    {/* Mini animated liquid bottom bar */}
                                    <div
                                        className="absolute bottom-0 left-0 h-1.5 transition-all duration-500 rounded-r-full"
                                        style={{
                                            width: `${Math.max(8, Math.min(100, pct))}%`,
                                            background: `linear-gradient(90deg, ${main}aa, ${main}44)`,
                                        }}
                                    />
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: main }}
                                    />
                                    <span className="text-xs font-bold text-on-surface whitespace-nowrap">
                                        {subject.code || subject.name.slice(0, 12)}
                                    </span>
                                    <span
                                        className="text-xs font-extrabold tabular-nums"
                                        style={{ color: main }}
                                    >
                                        {Math.round(pct)}%
                                    </span>
                                </motion.button>
                            );
                        })}
                    </motion.div>
                ) : (
                    <motion.div
                        key="expanded-cards"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                        className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-2"
                    >
                        {subjects.map((subject, idx) => {
                            const id = String(subject._id || subject.id || idx);
                            const med = Math.max(0, subject.medical_leave_count || 0);
                            const attended = Math.max(0, (subject.attended || 0) - med);
                            const total = Math.max(0, (subject.total || 0) - med);
                            const pct = subject.attendance_percentage ?? (total > 0 ? (attended / total) * 100 : 0);
                            const isCritical = pct < targetThreshold;
                            const needed = classesNeeded(attended, total);
                            const canSkip = classesCanSkip(attended, total);
                            const { main, soft } = getHealthColor(pct, targetThreshold);
                            const isSelected = selectedId === id;

                            // Build smooth wave SVG path proportional to attendance
                            const w = 200;
                            const h = 190;
                            const fillRatio = 0.16 + (Math.max(0, Math.min(100, pct)) / 100) * 0.58;
                            const waterY = h * (1 - fillRatio);
                            const pts: string[] = [];
                            for (let x = 0; x <= w; x += 20) {
                                const y = waterY + Math.sin(phase + idx * 0.8 + x / 32) * 5.5;
                                pts.push(`${x},${y.toFixed(1)}`);
                            }
                            const wavePath = `M 0,${h} L 0,${waterY.toFixed(1)} L ${pts.join(' L ')} L ${w},${h} Z`;

                            return (
                                <motion.div
                                    key={id}
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => {
                                        haptics.crownTick();
                                        setSelectedId(isSelected ? null : id);
                                        onSelectAccent?.(main);
                                    }}
                                    className="relative shrink-0 w-[200px] h-[190px] rounded-[24px] liquid-glass overflow-hidden p-4 flex flex-col justify-between cursor-pointer"
                                    style={{
                                        borderColor: isSelected ? `${main}aa` : undefined,
                                        boxShadow: isSelected ? `0 18px 40px -14px ${main}55` : undefined,
                                    }}
                                >
                                    {/* Live animated SVG liquid wave rising inside the card */}
                                    <svg
                                        viewBox={`0 0 ${w} ${h}`}
                                        preserveAspectRatio="none"
                                        className="absolute inset-0 w-full h-full pointer-events-none"
                                    >
                                        <defs>
                                            <linearGradient id={`liqGrad-${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                                <stop offset="0%" stopColor={main} stopOpacity="0.28" />
                                                <stop offset="100%" stopColor={main} stopOpacity="0.06" />
                                            </linearGradient>
                                        </defs>
                                        <path d={wavePath} fill={`url(#liqGrad-${idx})`} />
                                    </svg>

                                    {/* Top Row: Code pill + Big % */}
                                    <div className="relative z-10 flex items-start justify-between gap-2">
                                        <span className="px-2 py-0.5 rounded-lg bg-on-surface/10 text-[10px] font-bold tracking-wider uppercase text-on-surface-variant truncate max-w-[96px]">
                                            {subject.code || 'COURSE'}
                                        </span>
                                        <span
                                            className="text-xl font-extrabold tracking-tight leading-none tabular-nums"
                                            style={{ color: main }}
                                        >
                                            {Math.round(pct)}%
                                        </span>
                                    </div>

                                    {/* Middle: Title + BunkGuard */}
                                    <div className="relative z-10 my-1">
                                        <p className="text-sm font-bold text-on-surface leading-snug line-clamp-2">
                                            {subject.name}
                                        </p>
                                        <p
                                            className="text-[11px] font-semibold mt-1 truncate"
                                            style={{ color: soft }}
                                        >
                                            {isCritical ? `Attend next ${needed}` : `Safe to bunk ${canSkip}`}
                                        </p>
                                    </div>

                                    {/* Bottom Row: Counts + 1-Tap Present/Skip Orbs */}
                                    <div className="relative z-10 flex items-center justify-between">
                                        <span className="text-xs font-semibold text-on-surface-variant tabular-nums">
                                            {attended}/{total}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onQuickMark(id, 'present');
                                                }}
                                                className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/45 text-emerald-400 hover:bg-emerald-500/30 flex items-center justify-center cursor-pointer"
                                                title="Mark Present"
                                            >
                                                <Check size={15} strokeWidth={2.5} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onQuickMark(id, 'absent');
                                                }}
                                                className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/45 text-red-400 hover:bg-red-500/30 flex items-center justify-center cursor-pointer"
                                                title="Mark Absent"
                                            >
                                                <X size={15} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
};

export default HorizontalLiquidSubjects;
