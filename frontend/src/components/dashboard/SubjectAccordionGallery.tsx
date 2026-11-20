import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Edit2, Trash2, Award, UserCheck, AlertCircle } from 'lucide-react';
import type { Subject } from '@/types';
import { formatTeacherName } from '@/utils/formatters';
import { haptics } from '@/utils/haptics';
import { TactileMarkButton } from '@/components/dashboard/TactileMarkButton';
import { CallChip } from '@/components/react-bits/CallChip';
import { WarmTooltip } from '@/components/react-bits/WarmTooltip';
import { HoldButton } from '@/components/react-bits/HoldButton';

interface SubjectAccordionGalleryProps {
    subjects: Subject[];
    targetThreshold: number;
    classesNeeded: (attended: number, total: number) => number;
    classesCanSkip: (attended: number, total: number) => number;
    onQuickMark: (subjectId: string, status: 'present' | 'absent') => void;
    onEditSubject: (subject: Subject) => void;
    onDeleteSubject: (subjectId: string, subjectName: string) => void;
    className?: string;
}

const normalizeId = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

const getMedicalAdjustedCounts = (subject: Subject) => {
    const medicalLeaveCount = Math.max(0, subject.medical_leave_count || 0);
    const attended = Math.max(0, (subject.attended || 0) - medicalLeaveCount);
    const total = Math.max(0, (subject.total || 0) - medicalLeaveCount);
    const totalWithMedical = Math.max(0, subject.total || 0);
    return {
        attended,
        total,
        totalWithMedical,
        medicalLeaveCount,
    };
};

/**
 * Individual Liquid Card for Subject Accordion
 */
const SubjectLiquidCard: React.FC<{
    subject: Subject;
    isActive: boolean;
    targetThreshold: number;
    classesNeeded: (attended: number, total: number) => number;
    classesCanSkip: (attended: number, total: number) => number;
    onActivate: () => void;
    onQuickMark: (subjectId: string, status: 'present' | 'absent') => void;
    onEditSubject: (subject: Subject) => void;
    onDeleteSubject: (subjectId: string, subjectName: string) => void;
}> = ({
    subject,
    isActive,
    targetThreshold,
    classesNeeded,
    classesCanSkip,
    onActivate,
    onQuickMark,
    onEditSubject,
    onDeleteSubject,
}) => {
    const { attended, total, totalWithMedical, medicalLeaveCount } = getMedicalAdjustedCounts(subject);
    const pct = subject.attendance_percentage ?? (total > 0 ? (attended / total) * 100 : 0);
    const withMedicalAsAbsentPct = totalWithMedical > 0 ? (attended / totalWithMedical) * 100 : 0;
    const isCritical = pct < targetThreshold;
    const isWarning = pct >= targetThreshold && pct < targetThreshold + 5;
    const needed = classesNeeded(attended, total);
    const canSkip = classesCanSkip(attended, total);
    const subjectId = normalizeId(subject._id || subject.id);

    const isPractical =
        subject.categories?.includes('Practical') ||
        subject.type?.toLowerCase() === 'practical' ||
        subject.type?.toLowerCase() === 'lab' ||
        subject.name?.toLowerCase().includes('lab');

    const categoryLabel = isPractical ? 'Practical' : 'Theory';

    // Dynamic Vibrant Palette based on Category & Attendance Health
    const colorTheme = isPractical
        ? isCritical
            ? {
                  gradientStart: '#f43f5e',
                  gradientEnd: '#9f1239',
                  waveColor: 'rgba(244, 63, 94, 0.45)',
                  ambientGlow: 'rgba(244, 63, 94, 0.3)',
                  borderColor: 'border-rose-500/40',
                  badgeColor: 'rose',
                  accentHex: '#f43f5e',
              }
            : isWarning
            ? {
                  gradientStart: '#d946ef',
                  gradientEnd: '#f59e0b',
                  waveColor: 'rgba(217, 70, 239, 0.4)',
                  ambientGlow: 'rgba(217, 70, 239, 0.25)',
                  borderColor: 'border-fuchsia-500/40',
                  badgeColor: 'purple',
                  accentHex: '#d946ef',
              }
            : {
                  gradientStart: '#8b5cf6',
                  gradientEnd: '#06b6d4',
                  waveColor: 'rgba(139, 92, 246, 0.45)',
                  ambientGlow: 'rgba(139, 92, 246, 0.3)',
                  borderColor: 'border-purple-500/40',
                  badgeColor: 'purple',
                  accentHex: '#8b5cf6',
              }
        : isCritical
        ? {
              gradientStart: '#f43f5e',
              gradientEnd: '#e11d48',
              waveColor: 'rgba(244, 63, 94, 0.45)',
              ambientGlow: 'rgba(244, 63, 94, 0.3)',
              borderColor: 'border-rose-500/40',
              badgeColor: 'rose',
              accentHex: '#f43f5e',
          }
        : isWarning
        ? {
              gradientStart: '#f59e0b',
              gradientEnd: '#ea580c',
              waveColor: 'rgba(245, 158, 11, 0.4)',
              ambientGlow: 'rgba(245, 158, 11, 0.25)',
              borderColor: 'border-amber-500/40',
              badgeColor: 'amber',
              accentHex: '#f59e0b',
          }
        : {
              gradientStart: '#10b981',
              gradientEnd: '#06b6d4',
              waveColor: 'rgba(16, 185, 129, 0.45)',
              ambientGlow: 'rgba(16, 185, 129, 0.3)',
              borderColor: 'border-emerald-500/40',
              badgeColor: 'emerald',
              accentHex: '#10b981',
          };

    // Animated SVG Liquid Wave
    const wave1Ref = useRef<SVGPathElement>(null);
    const wave2Ref = useRef<SVGPathElement>(null);
    const cardContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let frameId: number;
        let time = 0;
        const clampedPct = Math.min(100, Math.max(0, pct));

        const animate = () => {
            time += 0.04;
            const targetY = 100 - clampedPct;
            const amp = isActive ? 5 : 3;

            const w1_y1 = targetY + Math.sin(time * 1.5) * amp;
            const w1_y2 = targetY + Math.sin(time * 1.5 + Math.PI * 0.5) * amp;
            const w1_y3 = targetY + Math.sin(time * 1.5 + Math.PI) * amp;

            const w2_y1 = targetY + Math.cos(time * 1.2) * (amp * 0.8);
            const w2_y2 = targetY + Math.cos(time * 1.2 + Math.PI * 0.7) * (amp * 0.8);
            const w2_y3 = targetY + Math.cos(time * 1.2 + Math.PI * 1.4) * (amp * 0.8);

            if (wave1Ref.current) {
                wave1Ref.current.setAttribute(
                    'd',
                    `M 0 100 L 0 ${w1_y1} Q 25 ${w1_y2} 50 ${targetY} T 100 ${w1_y3} L 100 100 Z`
                );
            }

            if (wave2Ref.current) {
                wave2Ref.current.setAttribute(
                    'd',
                    `M 0 100 L 0 ${w2_y1} Q 25 ${w2_y2} 50 ${targetY} T 100 ${w2_y3} L 100 100 Z`
                );
            }

            frameId = requestAnimationFrame(animate);
        };

        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
    }, [pct, isActive]);

    return (
        <motion.div
            ref={cardContainerRef}
            layout
            transition={{
                type: 'spring',
                stiffness: 340,
                damping: 28,
            }}
            onClick={onActivate}
            onMouseEnter={onActivate}
            className={`relative rounded-3xl overflow-hidden cursor-pointer select-none transition-all duration-300 border ${
                isActive
                    ? `md:flex-[3.8] bg-slate-900/90 shadow-2xl ${colorTheme.borderColor} min-h-[380px]`
                    : `md:flex-[1] bg-slate-900/50 hover:bg-slate-900/75 border-white/10 opacity-75 hover:opacity-100 min-h-[72px] md:min-h-[380px]`
            }`}
            style={{
                boxShadow: isActive ? `0 20px 40px -15px ${colorTheme.ambientGlow}` : undefined,
            }}
        >
            {/* Ambient Aurora Glow in Expanded Mode */}
            <div
                className="pointer-events-none absolute inset-0 transition-opacity duration-500"
                style={{
                    background: `radial-gradient(circle at 50% 100%, ${colorTheme.ambientGlow} 0%, transparent 75%)`,
                    opacity: isActive ? 1 : 0.25,
                }}
            />

            {/* Background Liquid Wave Reservoir */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full"
                >
                    <defs>
                        <linearGradient id={`grad-sub-1-${subjectId}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={colorTheme.gradientStart} stopOpacity={isActive ? 0.45 : 0.3} />
                            <stop offset="100%" stopColor={colorTheme.gradientEnd} stopOpacity={isActive ? 0.15 : 0.08} />
                        </linearGradient>
                        <linearGradient id={`grad-sub-2-${subjectId}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={colorTheme.gradientEnd} stopOpacity={isActive ? 0.35 : 0.2} />
                            <stop offset="100%" stopColor={colorTheme.gradientStart} stopOpacity={isActive ? 0.1 : 0.05} />
                        </linearGradient>
                    </defs>

                    {/* Base water line path */}
                    <path
                        ref={wave2Ref}
                        fill={`url(#grad-sub-2-${subjectId})`}
                        className="transition-opacity duration-300"
                    />
                    <path
                        ref={wave1Ref}
                        fill={`url(#grad-sub-1-${subjectId})`}
                        filter={`drop-shadow(0 -2px 6px ${colorTheme.accentHex}44)`}
                    />
                </svg>

                {/* Subtle frothy bubbles rising when active */}
                {isActive && (
                    <div className="absolute inset-x-0 bottom-4 flex justify-around opacity-40">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" style={{ animationDuration: '3s' }} />
                        <span className="w-1 h-1 rounded-full bg-white animate-ping" style={{ animationDuration: '4s', animationDelay: '1s' }} />
                        <span className="w-2 h-2 rounded-full bg-white animate-ping" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }} />
                    </div>
                )}
            </div>

            {/* Specular Top Sheen */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent z-10" />

            {/* Card Content Layer */}
            <div className="relative z-10 h-full w-full p-5 flex flex-col justify-between">
                {isActive ? (
                    /* ── Expanded Full Card View ── */
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28 }}
                        className="h-full flex flex-col justify-between"
                    >
                        {/* Top Metadata Row */}
                        <div>
                            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-bold text-white/70 bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/15">
                                        {subject.code || 'COURSE'}
                                    </span>
                                    <span
                                        className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${
                                            isPractical
                                                ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                                                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                                        }`}
                                    >
                                        {categoryLabel}
                                    </span>
                                    {subject.credits !== null && subject.credits !== undefined && (
                                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/60 flex items-center gap-1">
                                            <Award size={10} />
                                            {subject.credits} Credits
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditSubject(subject);
                                        }}
                                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                                        title={`Edit ${subject.name}`}
                                    >
                                        <Edit2 size={13} />
                                    </button>
                                    <HoldButton
                                        variant="danger"
                                        holdDuration={750}
                                        title={`Hold to delete ${subject.name}`}
                                        onComplete={() => onDeleteSubject(subjectId, subject.name)}
                                        className="h-8 w-8 p-0 flex items-center justify-center rounded-lg"
                                    >
                                        <Trash2 size={13} />
                                    </HoldButton>
                                </div>
                            </div>

                            <h3 className="text-xl font-black text-white tracking-tight leading-snug truncate">
                                {subject.name}
                            </h3>
                            {subject.professor && (
                                <p className="text-xs text-white/50 font-medium mt-0.5 flex items-center gap-1.5 truncate">
                                    <UserCheck size={12} className="text-white/40" />
                                    Prof. {formatTeacherName(subject.professor)}
                                </p>
                            )}
                        </div>

                        {/* Mid Section: Hero Liquid Health Metrics */}
                        <div className="my-5 p-4 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">
                                        Subject Attendance
                                    </span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-white tracking-tight drop-shadow-md">
                                            {pct.toFixed(1)}%
                                        </span>
                                        <span className="text-xs font-semibold text-white/50">
                                            ({attended}/{total} classes)
                                        </span>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <CallChip
                                        label={isCritical ? `Need ${needed} cls` : `${canSkip} Bunks Safe`}
                                        variant={colorTheme.badgeColor as any}
                                        pulse={isCritical}
                                    />
                                </div>
                            </div>

                            {/* Medical Exclusion Note */}
                            {medicalLeaveCount > 0 && (
                                <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-white/60">
                                    <span>Medical Leave Count:</span>
                                    <WarmTooltip content={`Counted absent: ${attended}/${totalWithMedical} (${Math.round(withMedicalAsAbsentPct)}%)`}>
                                        <span className="font-semibold text-cyan-300 underline decoration-dotted cursor-help">
                                            +{medicalLeaveCount} excluded from total
                                        </span>
                                    </WarmTooltip>
                                </div>
                            )}
                        </div>

                        {/* Bottom Row: Quick 1-Tap Attendance Marking */}
                        <div className="pt-2 flex items-center justify-between gap-3 border-t border-white/10">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                                Quick Mark:
                            </span>

                            <div className="flex items-center gap-2">
                                <TactileMarkButton
                                    status="present"
                                    label="Present"
                                    onMark={() => onQuickMark(subjectId, 'present')}
                                />
                                <TactileMarkButton
                                    status="absent"
                                    label="Absent"
                                    onMark={() => onQuickMark(subjectId, 'absent')}
                                />
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    /* ── Collapsed Vertical Strip View ── */
                    <div className="h-full flex flex-row md:flex-col items-center justify-between py-2 text-center w-full">
                        {/* Subject Code & Category Indicator */}
                        <div className="flex items-center md:flex-col gap-1.5">
                            <span className="font-mono text-[10px] font-extrabold text-white/80 bg-white/10 px-2 py-0.5 rounded border border-white/15">
                                {subject.code ? subject.code.substring(0, 7) : 'SUB'}
                            </span>
                            <span
                                className={`w-2 h-2 rounded-full ${
                                    isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'
                                }`}
                                title={isCritical ? 'Deficit Risk' : 'Safe Attendance'}
                            />
                        </div>

                        {/* Rotated Subject Name on Desktop, Inline on Mobile */}
                        <div className="my-auto truncate max-w-[140px] md:max-w-none">
                            <span className="text-xs font-bold text-white/80 block md:[writing-mode:vertical-rl] md:rotate-180 truncate md:max-h-[160px]">
                                {subject.name}
                            </span>
                        </div>

                        {/* Compact Percentage Fill Pill */}
                        <div className="flex items-center md:flex-col gap-1">
                            <span
                                className={`text-xs font-black px-2 py-0.5 rounded-full ${
                                    isCritical
                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                            >
                                {Math.round(pct)}%
                            </span>
                            <span className="text-[8px] font-semibold text-white/40 hidden md:block">
                                {attended}/{total}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export const SubjectAccordionGallery: React.FC<SubjectAccordionGalleryProps> = ({
    subjects,
    targetThreshold,
    classesNeeded,
    classesCanSkip,
    onQuickMark,
    onEditSubject,
    onDeleteSubject,
    className = '',
}) => {
    const [activeSubjectId, setActiveSubjectId] = useState<string>(() => {
        return subjects[0] ? normalizeId(subjects[0]._id || subjects[0].id) : '';
    });

    useEffect(() => {
        if (!activeSubjectId && subjects.length > 0) {
            setActiveSubjectId(normalizeId(subjects[0]._id || subjects[0].id));
        }
    }, [subjects, activeSubjectId]);

    if (subjects.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-surface rounded-2xl border border-white/5">
                <AlertCircle size={28} className="text-white/20 mb-3" />
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">
                    No subjects in this category
                </p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col md:flex-row gap-3 w-full min-h-[390px] select-none ${className}`}>
            {subjects.map((subject) => {
                const id = normalizeId(subject._id || subject.id);
                const isActive = id === activeSubjectId;

                return (
                    <SubjectLiquidCard
                        key={id}
                        subject={subject}
                        isActive={isActive}
                        targetThreshold={targetThreshold}
                        classesNeeded={classesNeeded}
                        classesCanSkip={classesCanSkip}
                        onActivate={() => {
                            if (activeSubjectId !== id) {
                                haptics.selection();
                                setActiveSubjectId(id);
                            }
                        }}
                        onQuickMark={onQuickMark}
                        onEditSubject={onEditSubject}
                        onDeleteSubject={onDeleteSubject}
                    />
                );
            })}
        </div>
    );
};
