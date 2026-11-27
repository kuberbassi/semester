import React, { useState, useEffect, useId, useRef, useCallback } from 'react';
import {
    Edit2, Trash2, Award, User, AlertCircle, MapPin, ChevronLeft, ChevronRight,
    BookOpen, FlaskConical, ShieldCheck, AlertTriangle, Stethoscope
} from 'lucide-react';
import type { Subject } from '@/types';
import { formatTeacherName } from '@/utils/formatters';
import { haptics } from '@/utils/haptics';
import { WarmTooltip } from '@/components/react-bits/WarmTooltip';
import { HoldButton } from '@/components/react-bits/HoldButton';

interface SubjectAccordionGalleryProps {
    subjects: Subject[];
    targetThreshold: number;
    classesNeeded: (attended: number, total: number) => number;
    classesCanSkip: (attended: number, total: number) => number;
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
    return { attended, total, totalWithMedical, medicalLeaveCount };
};

const SubjectLiquidCard: React.FC<{
    subject: Subject;
    isActive: boolean;
    scrollRailMode: boolean;
    targetThreshold: number;
    classesNeeded: (attended: number, total: number) => number;
    classesCanSkip: (attended: number, total: number) => number;
    onActivate: () => void;
    onEditSubject: (subject: Subject) => void;
    onDeleteSubject: (subjectId: string, subjectName: string) => void;
    cardRef?: (el: HTMLDivElement | null) => void;
}> = ({
    subject,
    isActive,
    scrollRailMode,
    targetThreshold,
    classesNeeded,
    classesCanSkip,
    onActivate,
    onEditSubject,
    onDeleteSubject,
    cardRef,
}) => {
    const gradId = useId();
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

    const tone = isCritical
        ? {
            stopA: '#f43f5e',
            stopB: '#ec4899',
            text: 'text-rose-600 dark:text-rose-300',
            dot: 'bg-gradient-to-r from-rose-500 to-pink-500',
            ring: 'border-rose-500/45 shadow-[0_14px_34px_-14px_rgba(244,63,94,0.45)]',
            pill: 'bg-rose-500/14 border-rose-500/30 text-rose-600 dark:text-rose-300',
        }
        : isWarning
        ? {
            stopA: '#f59e0b',
            stopB: '#f97316',
            text: 'text-amber-600 dark:text-amber-300',
            dot: 'bg-gradient-to-r from-amber-500 to-orange-500',
            ring: 'border-amber-500/45 shadow-[0_14px_34px_-14px_rgba(245,158,11,0.40)]',
            pill: 'bg-amber-500/14 border-amber-500/30 text-amber-600 dark:text-amber-300',
        }
        : {
            stopA: '#6366f1',
            stopB: '#06b6d4',
            text: 'text-indigo-600 dark:text-cyan-300',
            dot: 'bg-gradient-to-r from-indigo-500 to-cyan-400',
            ring: 'border-primary/45 shadow-[0_14px_34px_-14px_rgba(99,102,241,0.45)]',
            pill: 'bg-indigo-500/14 border-indigo-500/30 text-indigo-600 dark:text-cyan-200',
        };

    const fillHeight = `${Math.max(12, Math.min(92, pct))}%`;

    const sizeClass = scrollRailMode
        ? isActive
            ? `md:w-[356px] md:shrink-0 min-h-[330px] snap-center ${tone.ring}`
            : 'md:w-[64px] md:shrink-0 min-h-[66px] md:min-h-[330px] snap-start opacity-85 hover:opacity-100'
        : isActive
        ? `md:flex-[4.6] md:min-w-[330px] min-h-[330px] ${tone.ring}`
        : 'md:flex-[1] md:min-w-[58px] min-h-[66px] md:min-h-[330px] opacity-85 hover:opacity-100';

    return (
        <div
            ref={cardRef}
            onClick={onActivate}
            data-tooltip={!isActive ? `${subject.name} · ${pct.toFixed(1)}% (${attended}/${total}) — Click to expand` : undefined}
            style={{ contain: 'layout style paint', willChange: 'width, flex-grow' }}
            className={`liquid-glass relative rounded-[26px] overflow-hidden cursor-pointer select-none transition-[width,flex-grow,opacity,border-color] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] ${sizeClass}`}
        >
            {/* Multi-Stop Gradient Liquid Fill */}
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-0 transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ height: fillHeight, contain: 'paint' }}
            >
                {isActive && (
                    <div className="absolute -top-3.5 left-0 right-0 h-4 overflow-hidden">
                        <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="liquid-wave-track h-full">
                            <defs>
                                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor={tone.stopA} stopOpacity="0.32" />
                                    <stop offset="50%" stopColor={tone.stopB} stopOpacity="0.35" />
                                    <stop offset="100%" stopColor={tone.stopA} stopOpacity="0.32" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M0 10 Q 25 18 50 10 T 100 10 T 150 10 T 200 10 L 200 20 L 0 20 Z"
                                fill={`url(#${gradId})`}
                            />
                        </svg>
                    </div>
                )}
                <div
                    className="w-full h-full"
                    style={{
                        background: `linear-gradient(160deg, ${tone.stopA}${isActive ? '3d' : '26'} 0%, ${tone.stopB}${isActive ? '26' : '18'} 60%, ${tone.stopA}0a 100%)`,
                    }}
                />
            </div>

            <div className={`relative z-10 h-full w-full ${isActive ? 'p-5' : 'px-2.5 py-4'} flex flex-col justify-between`}>
                {isActive ? (
                    <div className="h-full min-w-[290px] flex flex-col justify-between animate-fade-in">
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                    <span
                                        className="font-mono text-[11px] font-bold text-on-surface bg-surface/90 dark:bg-[#141722]/90 px-2.5 py-1 rounded-full border border-on-surface/[0.10] whitespace-nowrap shrink-0"
                                        data-tooltip={subject.code ? `Course code: ${subject.code}` : 'No course code set'}
                                    >
                                        {subject.code || 'SUB'}
                                    </span>
                                    <span
                                        className="w-7 h-7 rounded-full bg-surface/70 dark:bg-white/[0.06] border border-on-surface/[0.10] flex items-center justify-center text-primary shrink-0"
                                        data-tooltip={isPractical ? 'Practical / Lab subject' : 'Theory subject'}
                                    >
                                        {isPractical ? <FlaskConical size={13} /> : <BookOpen size={13} />}
                                    </span>
                                    {subject.credits !== null && subject.credits !== undefined && (
                                        <span
                                            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-surface/70 dark:bg-white/[0.06] border border-on-surface/[0.10] text-on-surface-variant inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                            data-tooltip={`${subject.credits} ${subject.credits === 1 ? 'Credit' : 'Credits'} (synced automatically to Results GPA)`}
                                        >
                                            <Award size={11} className="text-primary shrink-0" />
                                            <span>{subject.credits} Cr</span>
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditSubject(subject);
                                        }}
                                        className="no-fluid h-8 w-8 inline-flex items-center justify-center rounded-full border border-on-surface/[0.10] bg-surface/75 dark:bg-white/[0.06] hover:bg-primary/15 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                                        title={`Edit ${subject.name}`}
                                    >
                                        <Edit2 size={13} />
                                    </button>
                                    <HoldButton
                                        variant="danger"
                                        holdDuration={700}
                                        title={`Hold to delete ${subject.name}`}
                                        onComplete={() => onDeleteSubject(subjectId, subject.name)}
                                        className="h-8 w-8 p-0 flex items-center justify-center rounded-full"
                                    >
                                        <Trash2 size={13} />
                                    </HoldButton>
                                </div>
                            </div>

                            <h3
                                className="font-display text-xl sm:text-2xl font-extrabold text-on-surface tracking-tight leading-snug truncate"
                                data-tooltip={subject.name}
                            >
                                {subject.name}
                            </h3>
                            {subject.professor && (
                                <p
                                    className="text-xs text-on-surface-variant font-medium mt-1 flex items-center gap-1.5 truncate"
                                    data-tooltip={`Faculty: ${formatTeacherName(subject.professor)}`}
                                >
                                    <User size={12} className="shrink-0 text-primary/70" />
                                    <span className="truncate">{formatTeacherName(subject.professor)}</span>
                                </p>
                            )}
                        </div>

                        <div className="my-4 p-3.5 sm:p-4 rounded-2xl bg-surface/92 dark:bg-[#141722]/92 border border-on-surface/[0.09]">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-baseline gap-2 min-w-0">
                                    <span
                                        className="font-display text-3xl sm:text-[34px] font-extrabold text-on-surface tracking-tight tabular-nums leading-none whitespace-nowrap"
                                        data-tooltip={`Eligible attendance: ${attended} attended out of ${total} classes`}
                                    >
                                        {pct.toFixed(1)}%
                                    </span>
                                    <span className="text-xs font-bold text-on-surface-variant tabular-nums whitespace-nowrap">
                                        {attended}/{total}
                                    </span>
                                </div>

                                <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold tabular-nums whitespace-nowrap shrink-0 ${tone.pill}`}
                                    data-tooltip={
                                        isCritical
                                            ? `Attend the next ${needed} consecutive ${needed === 1 ? 'class' : 'classes'} to reach ${targetThreshold}%`
                                            : `You can safely miss ${canSkip} more ${canSkip === 1 ? 'class' : 'classes'} and stay at or above ${targetThreshold}%`
                                    }
                                >
                                    {isCritical ? <AlertTriangle size={11} className="shrink-0" /> : <ShieldCheck size={11} className="shrink-0" />}
                                    <span>{isCritical ? `Need ${needed}` : `+${canSkip} Safe`}</span>
                                </span>
                            </div>

                            {medicalLeaveCount > 0 && (
                                <div className="mt-2.5 pt-2 border-t border-on-surface/[0.08] flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold text-on-surface-variant/70">
                                        Medical adjusted
                                    </span>
                                    <WarmTooltip content={`${medicalLeaveCount} approved medical leaves excluded · Counted as absent: ${attended}/${totalWithMedical} (${Math.round(withMedicalAsAbsentPct)}%)`}>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-[10px] font-bold text-sky-700 dark:text-cyan-300 cursor-help whitespace-nowrap">
                                            <Stethoscope size={11} />
                                            +{medicalLeaveCount} med
                                        </span>
                                    </WarmTooltip>
                                </div>
                            )}
                        </div>

                        <div className="pt-2.5 flex items-center justify-between gap-2 border-t border-on-surface/[0.09]">
                            <div
                                className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant truncate"
                                data-tooltip={subject.classroom ? `Classroom: ${subject.classroom}` : undefined}
                            >
                                {subject.classroom ? (
                                    <>
                                        <MapPin size={12} className="text-primary/70 shrink-0" />
                                        <span className="truncate">{subject.classroom}</span>
                                    </>
                                ) : (
                                    <span className="truncate">{isCritical ? `Attend next ${needed} to reach ${targetThreshold}%` : `Buffer: ${canSkip} safe ${canSkip === 1 ? 'skip' : 'skips'}`}</span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEditSubject(subject);
                                }}
                                data-tooltip="Open subject details, syllabus & counters"
                                className="no-fluid h-7 px-3 rounded-full bg-surface/75 dark:bg-white/[0.07] hover:bg-primary/15 border border-on-surface/[0.10] hover:border-primary/35 text-[11px] font-bold text-on-surface hover:text-primary inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer whitespace-nowrap"
                            >
                                <Edit2 size={11} />
                                Details
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-row md:flex-col items-center justify-between py-1 text-center w-full gap-2">
                        <div className="flex items-center md:flex-col gap-1.5 shrink-0">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tone.dot}`} />
                            <span className="font-mono text-[9.5px] font-bold text-on-surface-variant whitespace-nowrap">
                                {subject.code ? subject.code.substring(0, 7) : 'SUB'}
                            </span>
                        </div>

                        <div className="my-auto truncate max-w-[150px] md:max-w-none">
                            <span className="text-xs font-bold text-on-surface block md:[writing-mode:vertical-rl] md:rotate-180 truncate md:max-h-[168px]">
                                {subject.name}
                            </span>
                        </div>

                        <span className={`font-display text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap shrink-0 ${tone.text}`}>
                            {Math.round(pct)}%
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export const SubjectAccordionGallery: React.FC<SubjectAccordionGalleryProps> = ({
    subjects,
    targetThreshold,
    classesNeeded,
    classesCanSkip,
    onEditSubject,
    onDeleteSubject,
    className = '',
}) => {
    const [activeSubjectId, setActiveSubjectId] = useState<string>(() => {
        return subjects[0] ? normalizeId(subjects[0]._id || subjects[0].id) : '';
    });
    const railRef = useRef<HTMLDivElement | null>(null);
    const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Switch automatically to smooth horizontal scroll-snap rail when there are > 8 subjects
    // so strips never get crushed or clipped off the right edge.
    const scrollRailMode = subjects.length > 8;

    useEffect(() => {
        if (subjects.length === 0) return;
        const exists = subjects.some((s) => normalizeId(s._id || s.id) === activeSubjectId);
        if (!exists) {
            setActiveSubjectId(normalizeId(subjects[0]._id || subjects[0].id));
        }
    }, [subjects, activeSubjectId]);

    const activeIdx = Math.max(
        0,
        subjects.findIndex((s) => normalizeId(s._id || s.id) === activeSubjectId)
    );

    const activateByIndex = useCallback(
        (nextIdx: number) => {
            if (subjects.length === 0) return;
            const bounded = (nextIdx + subjects.length) % subjects.length;
            const target = subjects[bounded];
            const id = normalizeId(target._id || target.id);
            haptics.crownTick();
            setActiveSubjectId(id);
            window.requestAnimationFrame(() => {
                cardRefs.current[id]?.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest',
                });
            });
        },
        [subjects]
    );

    if (subjects.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <AlertCircle size={24} className="text-on-surface-variant/35 mb-2" />
                <p className="text-xs font-medium text-on-surface-variant/60">No courses</p>
            </div>
        );
    }

    return (
        <div className={`space-y-3 select-none ${className}`}>
            {scrollRailMode && (
                <div className="hidden md:flex items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant">
                        <span className="px-2.5 py-0.5 rounded-full bg-primary/12 border border-primary/25 text-primary font-mono font-bold tabular-nums">
                            {activeIdx + 1} / {subjects.length}
                        </span>
                        <span className="truncate max-w-[300px] text-on-surface font-bold">
                            {subjects[activeIdx]?.name}
                        </span>
                        <span className="text-on-surface-variant/55">· Scroll or use arrows to browse all subjects</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => activateByIndex(activeIdx - 1)}
                            data-tooltip="Previous subject"
                            className="no-fluid h-7 w-7 rounded-full border border-on-surface/[0.11] bg-on-surface/[0.04] hover:border-primary/40 hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => activateByIndex(activeIdx + 1)}
                            data-tooltip="Next subject"
                            className="no-fluid h-7 w-7 rounded-full border border-on-surface/[0.11] bg-on-surface/[0.04] hover:border-primary/40 hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            <div
                ref={railRef}
                className={
                    scrollRailMode
                        ? 'flex flex-col md:flex-row gap-3 w-full min-h-[340px] md:overflow-x-auto md:snap-x md:snap-proximity custom-scrollbar md:pb-2.5 md:pr-2'
                        : 'flex flex-col md:flex-row gap-3.5 w-full min-h-[340px]'
                }
            >
                {subjects.map((subject) => {
                    const id = normalizeId(subject._id || subject.id);
                    const isActive = id === activeSubjectId;

                    return (
                        <SubjectLiquidCard
                            key={id}
                            cardRef={(el) => {
                                cardRefs.current[id] = el;
                            }}
                            subject={subject}
                            isActive={isActive}
                            scrollRailMode={scrollRailMode}
                            targetThreshold={targetThreshold}
                            classesNeeded={classesNeeded}
                            classesCanSkip={classesCanSkip}
                            onActivate={() => {
                                if (activeSubjectId !== id) {
                                    haptics.crownTick();
                                    setActiveSubjectId(id);
                                    if (scrollRailMode) {
                                        window.requestAnimationFrame(() => {
                                            cardRefs.current[id]?.scrollIntoView({
                                                behavior: 'smooth',
                                                inline: 'center',
                                                block: 'nearest',
                                            });
                                        });
                                    }
                                }
                            }}
                            onEditSubject={onEditSubject}
                            onDeleteSubject={onDeleteSubject}
                        />
                    );
                })}
            </div>
        </div>
    );
};
