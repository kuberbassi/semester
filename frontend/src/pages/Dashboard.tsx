import React, { useState, useEffect } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useDashboard, useMarkAttendance, useDeleteSubject } from '@/hooks/useDashboard';
import { useAuth } from '@/contexts/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Trash2, Edit2,
    Target, Settings as SettingsIcon, LayoutGrid, List, LayoutDashboard
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import EditSubjectModal from '@/components/modals/EditSubjectModal';
import AttendanceModal from '@/components/modals/AttendanceModal';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import useLongPress from '@/hooks/useLongPress';
import { useSemester } from '@/contexts/semester-context';
import { Link } from 'react-router-dom';
import { formatTeacherName } from '@/utils/formatters';
import { useConfirm } from '@/contexts/confirm-context';
import { haptics } from '@/utils/haptics';
import type { Subject, TimetableSlot } from '@/types';
import { sortTimetableSlots } from '@/lib/timetable';
import { WhatIfBunkSimulator } from '@/components/dashboard/WhatIfBunkSimulator';
import { LivePeriodRadarWidget } from '@/components/dashboard/LivePeriodRadarWidget';
import { DashboardTodoWidget } from '@/components/dashboard/DashboardTodoWidget';
import { triggerCelebration } from '@/utils/celebration';
import { isDevTestMode, resetDevTestData, disableDevTestMode } from '@/utils/devTestData';
import { FramerSpotlightCard } from '@/components/ui/FramerSpotlightCard';
import { AuroraGlow } from '@/components/ui/AuroraGlow';
import { FullCardLiquidFill } from '@/components/ui/FullCardLiquidFill';
import { SubjectAccordionGallery } from '@/components/dashboard/SubjectAccordionGallery';
import {
    RubberSegment,
    HoldButton,
    FuseButton,
    CallChip,
    CometDial,
    WarmTooltip,
} from '@/components/react-bits';

type SubjectMenuEvent = React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>;

const normalizeId = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

const getMedicalAdjustedCounts = (subject: Subject) => {
    const medicalLeaveCount = Math.max(0, subject.medical_leave_count || 0);
    const attended = Math.max(0, (subject.attended || 0) - medicalLeaveCount);
    return {
        attended,
        total: Math.max(0, (subject.total || 0) - medicalLeaveCount),
        totalWithMedical: Math.max(0, subject.total || 0),
        medicalLeaveCount,
    };
};

const SubjectRow: React.FC<{
    subject: Subject;
    targetThreshold: number;
    classesNeeded: (attended: number, total: number) => number;
    classesCanSkip: (attended: number, total: number) => number;
    triggerBubbleMenu: (subjectId: string, event: SubjectMenuEvent) => void;
    setEditingSubject: (subject: Subject) => void;
    handleDeleteSubject: (subjectId: string, subjectName: string) => void;
}> = ({
    subject,
    targetThreshold,
    classesNeeded,
    classesCanSkip,
    triggerBubbleMenu,
    setEditingSubject,
    handleDeleteSubject,
}) => {
    const { attended, total, totalWithMedical, medicalLeaveCount } = getMedicalAdjustedCounts(subject);
    const pct = subject.attendance_percentage ?? (total > 0 ? (attended / total) * 100 : 0);
    const withMedicalAsAbsentPct = totalWithMedical > 0 ? (attended / totalWithMedical) * 100 : 0;
    const isCritical = pct < targetThreshold;
    const needed = classesNeeded(attended, total);
    const canSkip = classesCanSkip(attended, total);
    const subjectId = normalizeId(subject._id || subject.id);
    const longPressHandlers = useLongPress((event) => triggerBubbleMenu(subjectId, event), {
        threshold: 600,
        onCancel: () => {}
    });

    return (
        <tr
            {...longPressHandlers}
            className="hover:bg-on-surface/[0.025] transition-colors group cursor-default border-b border-on-surface/[0.07] last:border-b-0"
        >
            <td
                className="px-5 py-3.5 font-mono text-[11px] font-bold text-on-surface-variant whitespace-nowrap"
                data-tooltip={subject.code ? `Course code: ${subject.code}` : 'No course code assigned'}
            >
                <span className="px-2 py-0.5 rounded-full bg-on-surface/[0.05] border border-on-surface/[0.08]">
                    {subject.code || '—'}
                </span>
            </td>
            <td className="px-5 py-3.5 font-bold text-on-surface">
                <div className="min-w-0">
                    <p className="truncate max-w-[240px] leading-tight text-xs font-bold" data-tooltip={subject.name}>
                        {subject.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] font-semibold text-on-surface-variant/65 uppercase tracking-wider">
                            {(subject.categories?.includes('Practical') || subject.type?.toLowerCase() === 'practical' || subject.type?.toLowerCase() === 'lab' || subject.name?.toLowerCase().includes('lab')) ? 'Practical' : 'Theory'}
                        </span>
                        {subject.credits !== null && subject.credits !== undefined && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-on-surface-variant/30" />
                                <span className="text-[9px] font-bold text-primary/85 uppercase tracking-wider whitespace-nowrap">
                                    {subject.credits} {subject.credits === 1 ? 'Credit' : 'Credits'}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-5 py-3.5 text-on-surface-variant font-medium text-xs">
                <p
                    className="truncate max-w-[160px] leading-tight"
                    data-tooltip={subject.professor ? `Faculty: ${formatTeacherName(subject.professor)}` : undefined}
                >
                    {formatTeacherName(subject.professor || '') || '—'}
                </p>
            </td>
            <td className="px-5 py-3.5 text-center font-semibold text-on-surface text-xs whitespace-nowrap tabular-nums">
                <div>{attended} / {total}</div>
                {medicalLeaveCount > 0 && (
                    <WarmTooltip content={`${medicalLeaveCount} medical leaves excluded · Counted as absent: ${attended}/${totalWithMedical} (${Math.round(withMedicalAsAbsentPct)}%)`}>
                        <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-[9.5px] font-bold text-sky-700 dark:text-cyan-300 cursor-help">
                            +{medicalLeaveCount} med
                        </div>
                    </WarmTooltip>
                )}
            </td>
            <td className="px-5 py-3.5 text-center whitespace-nowrap">
                <div
                    className="flex flex-col items-center gap-1"
                    data-tooltip={`${pct.toFixed(1)}% attendance (Goal: ${targetThreshold}%)`}
                >
                    <span className={`font-bold text-xs tabular-nums ${isCritical ? 'text-rose-500 dark:text-rose-400' : 'text-on-surface'}`}>{Math.round(pct)}%</span>
                    <div className="w-14 h-1.5 bg-on-surface/[0.08] rounded-full overflow-hidden shrink-0">
                        <div className={`h-full rounded-full ${isCritical ? 'bg-gradient-to-r from-rose-500 to-pink-500' : 'bg-gradient-to-r from-indigo-500 to-cyan-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                </div>
            </td>
            <td className="px-5 py-3.5 text-center whitespace-nowrap">
                <span
                    data-tooltip={
                        isCritical
                            ? `Attend the next ${needed} consecutive ${needed === 1 ? 'class' : 'classes'} to reach ${targetThreshold}%`
                            : `You can safely miss ${canSkip} more ${canSkip === 1 ? 'class' : 'classes'} and remain at or above ${targetThreshold}%`
                    }
                >
                    <CallChip
                        label={isCritical ? `Need ${needed} cls` : `${canSkip} Bunks`}
                        variant={isCritical ? 'danger' : 'success'}
                        pulse={isCritical}
                    />
                </span>
            </td>

            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                <div className="flex items-center justify-end gap-1.5">
                    <div className="flex justify-end gap-1 opacity-80 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                            onClick={() => setEditingSubject(subject)}
                            className="no-fluid h-8 w-8 inline-flex items-center justify-center rounded-full border border-on-surface/[0.08] bg-on-surface/[0.03] text-on-surface-variant hover:border-primary/35 hover:bg-primary/12 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-all cursor-pointer"
                            title={`Edit ${subject.name}`}
                            aria-label={`Edit ${subject.name}`}
                        >
                            <Edit2 size={13} strokeWidth={1.9} />
                        </button>
                        <HoldButton
                            variant="danger"
                            holdDuration={750}
                            title={`Hold to delete ${subject.name}`}
                            onComplete={() => handleDeleteSubject(subjectId, subject.name)}
                            className="h-8 w-8 p-0 flex items-center justify-center rounded-full"
                        >
                            <Trash2 size={13} strokeWidth={1.9} />
                        </HoldButton>
                    </div>
                </div>
            </td>
        </tr>
    );
};

const Dashboard: React.FC = () => {
    const { showToast } = useToast();
    const { user } = useAuth();
    const { currentSemester, setCurrentSemester } = useSemester();
    const { data: dashboardData, isLoading, refetch: loadDashboard } = useDashboard();

    const markAttendanceMutation = useMarkAttendance();
    const deleteSubjectMutation = useDeleteSubject();

    usePageMeta({
        title: 'Dashboard | Semester',
        description: 'Your academic overview â€” attendance, upcoming classes, and performance at a glance.',
    });

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
    const [markingSubjectId, setMarkingSubjectId] = useState<string | null>(null);
    const [bubbleMenu, setBubbleMenu] = useState<{
        subjectId: string;
        x: number;
        y: number;
    } | null>(null);

    const [todayClasses, setTodayClasses] = useState<TimetableSlot[]>([]);
    const confirm = useConfirm();

    const [categoryFilter, setCategoryFilter] = useState<'Theory' | 'Practical' | 'All'>(() => {
        const saved = localStorage.getItem('semester_dashboard_subject_filter');
        return (saved === 'Theory' || saved === 'Practical' || saved === 'All') ? saved : 'All';
    });
    const [subjectViewMode, setSubjectViewMode] = useState<'gallery' | 'table'>(() => {
        const saved = localStorage.getItem('semester_dashboard_subject_view');
        return (saved === 'table' || saved === 'gallery') ? saved : 'gallery';
    });
    const targetThreshold = user?.attendance_threshold || 75;

    useEffect(() => {
        const fetchTimetable = async () => {
            try {
                const data = await attendanceService.getTimetable(currentSemester);
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const currentDay = dayNames[new Date().getDay()];
                const daySlots = (data?.schedule?.[currentDay] || []).filter(
                    (slot) => !['break', 'lunch', 'gap', 'free'].includes(String(slot.type || '').toLowerCase())
                );
                
                setTodayClasses(sortTimetableSlots(daySlots));
            } catch (err) {
                console.error("Failed to load timetable for dashboard", err);
            }
        };

        if (user) {
            void fetchTimetable();
        }
        const onLocalDbChange = () => {
            if (user) void fetchTimetable();
        };
        window.addEventListener('semester:local-db-changed', onLocalDbChange);
        return () => window.removeEventListener('semester:local-db-changed', onLocalDbChange);
    }, [currentSemester, user]);

    const handleDeleteSubject = async (subjectId: string, subjectName: string) => {
        const isConfirmed = await confirm({
            title: 'Delete Subject',
            message: `Are you sure you want to delete "${subjectName}"? This will permanently remove all its classes and attendance records.`,
        });
        if (!isConfirmed) return;
        try {
            await deleteSubjectMutation.mutateAsync(subjectId);
            showToast('success', `Deleted ${subjectName}`);
        } catch {
            showToast('error', 'Failed to delete subject');
        }
    };

    const handleQuickMark = (subjectId: string, status: 'present' | 'absent') => {
        if (status === 'present') {
            haptics.success();
        } else {
            haptics.medium();
        }
        markAttendanceMutation.mutate(
            { subjectId, status },
            {
                onSuccess: () => {
                    showToast('success', status === 'present' ? 'Marked Present' : 'Marked Absent');
                    if (status === 'present' && att >= 74.0) {
                        triggerCelebration();
                    }
                },
                onError: () => {
                    showToast('error', 'Failed to mark attendance');
                },
            }
        );
    };

    const classesNeeded = (attended: number, total: number) => {
        if (total === 0) return 0;
        if ((attended / total) * 100 >= targetThreshold) return 0;
        return Math.ceil((targetThreshold * total - attended * 100) / (100 - targetThreshold));
    };

    const classesCanSkip = (attended: number, total: number) => {
        if (total === 0) return 0;
        return Math.max(0, Math.floor((attended * 100 - targetThreshold * total) / targetThreshold));
    };

    const subjects = dashboardData?.subjects || [];
    const attendanceTotals = subjects.reduce((totals, subject) => {
        const medicalCount = Math.max(0, subject.medical_leave_count || 0);
        totals.attended += Math.max(0, (subject.attended || 0) - medicalCount);
        totals.eligibleClasses += Math.max(0, (subject.total || 0) - medicalCount);
        totals.totalClasses += subject.total || 0;
        totals.medicalLeaveCount += medicalCount;
        return totals;
    }, { attended: 0, eligibleClasses: 0, totalClasses: 0, medicalLeaveCount: 0 });
    const { attended: physicalAttended, eligibleClasses, totalClasses, medicalLeaveCount } = attendanceTotals;
    const riskCount = subjects.filter(s => (s.attendance_percentage || 0) < targetThreshold).length || 0;
    const att = eligibleClasses > 0 ? (physicalAttended / eligibleClasses) * 100 : 0;
    const attendanceWithoutMedical = totalClasses > 0 ? (physicalAttended / totalClasses) * 100 : 0;
    const safeBunks = dashboardData?.summary?.safe_bunks_remaining ?? 0;
    const targetDelta = att - targetThreshold;
    const hasAttendanceData = totalClasses > 0;

    // Seed ambient top glow with unified Silver-Iris / Amber / Rose palette
    useEffect(() => {
        const accent = !hasAttendanceData || att >= targetThreshold
            ? '#818cf8'
            : att >= Math.max(50, targetThreshold - 10)
                ? '#fbbf24'
                : '#fb7185';
        document.documentElement.style.setProperty('--semester-ambient-accent', accent);
    }, [att, targetThreshold, hasAttendanceData]);

    const sortSubs = (subs: Subject[]) => {
        if (!subs) return [];
        return [...subs].sort((a, b) => {
            const priority = (subject: Subject) => {
                const categories = subject.categories || [];
                return categories.includes('Theory') ? 0 : categories.includes('Lab') ? 1 : 2;
            };
            return priority(a) - priority(b);
        });
    };

    // Bubble menu trigger
    const triggerBubbleMenu = (subjectId: string, event: SubjectMenuEvent) => {
        event.preventDefault();
        const touch = 'touches' in event ? event.touches[0] : undefined;
        const clientX = ('clientX' in event ? event.clientX : touch?.clientX) || 0;
        const clientY = ('clientY' in event ? event.clientY : touch?.clientY) || 0;
        
        const menuWidth = 160;
        const menuHeight = 145;
        const boundedX = Math.max(12, Math.min(clientX, window.innerWidth - menuWidth - 12));
        const boundedY = Math.max(12, Math.min(clientY, window.innerHeight - menuHeight - 12));

        haptics.medium();
        setBubbleMenu({
            subjectId,
            x: boundedX,
            y: boundedY
        });
    };

    return (
        <div className="pb-24 w-full select-none relative">
            <AuroraGlow variant="multi" className="top-[-50px] left-1/2 -translate-x-1/2" intensity="subtle" />
            <PageHeader
                title="Dashboard"
                icon={LayoutDashboard}
                badge={`Sem ${currentSemester}`}
                actions={
                    <>
                        <div className="w-28 shrink-0">
                            <Select
                                options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({
                                    value: s,
                                    label: `Sem ${s}`,
                                }))}
                                value={currentSemester}
                                onChange={(e) => setCurrentSemester(parseInt(e.target.value) || 1)}
                                className="py-1.5 px-3 text-xs"
                            />
                        </div>
                        <FuseButton
                            onClick={() => setIsAddModalOpen(true)}
                            className="py-1.5 px-3.5 text-xs"
                        >
                            <Plus size={14} className="mr-1 inline-block" /> Add Subject
                        </FuseButton>
                    </>
                }
            />

            {isDevTestMode() && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl liquid-glass">
                    <div className="flex items-center gap-2.5">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span className="text-xs font-semibold text-on-surface/85">
                            Dev Preview Mode
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <HoldButton
                            label="Hold to Reset"
                            completedLabel="Resetting..."
                            holdTime={800}
                            variant="primary"
                            className="py-1 px-3 text-[11px]"
                            onComplete={() => {
                                resetDevTestData();
                                loadDashboard();
                                showToast('success', 'Dev preview data reset');
                            }}
                        />
                        <FuseButton
                            onClick={() => {
                                disableDevTestMode();
                                window.location.href = '/';
                            }}
                            variant="secondary"
                            className="py-1 px-3 text-[11px]"
                        >
                            Exit
                        </FuseButton>
                    </div>
                </div>
            )}

            {isLoading && !dashboardData ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="animate-pulse h-48 bg-surface-container border border-outline rounded-lg md:col-span-2" />
                        <div className="animate-pulse h-48 bg-surface-container border border-outline rounded-lg" />
                    </div>
                    <div className="animate-pulse h-64 bg-surface-container border border-outline rounded-lg" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Asymmetric Hero Bento Stage (12-Column Desktop Studio Layout) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                        {/* Left Hero (5 cols): Tall Gradient Liquid Fill Reservoir */}
                        <div className="lg:col-span-5 flex flex-col">
                            <FullCardLiquidFill
                                percentage={att}
                                attended={physicalAttended}
                                total={eligibleClasses}
                                safeBunks={safeBunks}
                                deficitCount={riskCount}
                                medicalLeaveCount={medicalLeaveCount}
                                attendanceWithoutMedical={attendanceWithoutMedical}
                                targetThreshold={targetThreshold}
                                className="flex-1 min-h-[410px]"
                            />
                        </div>

                        {/* Right Column (7 cols): Luminous Academic Command Deck + Wide Tasks Panel */}
                        <div className="lg:col-span-7 flex flex-col gap-6">
                            {/* Top Command Banner */}
                            <div className="liquid-hero-banner rounded-[26px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/14 border border-primary/25 text-[11px] font-bold text-primary">
                                            <Target size={11} />
                                            Goal {targetThreshold}%
                                        </span>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums border ${
                                            !hasAttendanceData
                                                ? 'text-on-surface-variant bg-on-surface/[0.06] border-on-surface/[0.10]'
                                                : targetDelta >= 0
                                                    ? 'text-indigo-600 dark:text-cyan-300 bg-cyan-500/12 border-cyan-500/25'
                                                    : 'text-rose-600 dark:text-rose-300 bg-rose-500/12 border-rose-500/25'
                                        }`}>
                                            {!hasAttendanceData
                                                ? 'No logs yet'
                                                : targetDelta >= 0
                                                    ? `+${targetDelta.toFixed(1)}% above goal`
                                                    : `${Math.abs(targetDelta).toFixed(1)}% below goal`}
                                        </span>
                                    </div>

                                    <h2 className="font-display text-2xl sm:text-[26px] font-extrabold tracking-tight text-on-surface leading-tight truncate">
                                        {user?.name?.replace(/\s*\(Dev Mode\)/i, '') || 'Student'}
                                    </h2>

                                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-on-surface-variant">
                                        <span className="font-mono text-on-surface/85">{user?.enrollment_number || 'Add enrollment in Settings'}</span>
                                        <span className="opacity-35">·</span>
                                        <span>Batch {user?.batch || '—'}</span>
                                        <span className="opacity-35">·</span>
                                        <span>Semester {currentSemester}</span>
                                    </div>

                                    <div className="mt-4">
                                        <Link
                                            to="/settings"
                                            className="no-fluid inline-flex items-center gap-1.5 px-3.5 h-8 rounded-full bg-surface/80 dark:bg-white/[0.08] hover:bg-primary/15 border border-primary/20 text-xs font-bold text-on-surface hover:text-primary transition-colors cursor-pointer"
                                        >
                                            <SettingsIcon size={12} />
                                            Configure Targets
                                        </Link>
                                    </div>
                                </div>

                                <div className="shrink-0 flex items-center justify-center sm:pl-4 sm:border-l sm:border-primary/15">
                                    <CometDial
                                        value={hasAttendanceData ? Math.min(100, Math.max(0, att)) : 0}
                                        size={104}
                                        strokeWidth={8}
                                        color={targetDelta < 0 ? '#f43f5e' : '#6366f1'}
                                        secondaryColor={targetDelta < 0 ? '#f59e0b' : '#06b6d4'}
                                        label="Attended"
                                        tooltip={hasAttendanceData ? `${physicalAttended} of ${eligibleClasses} eligible classes (${att.toFixed(1)}%)` : 'No attendance logged yet'}
                                    />
                                </div>
                            </div>

                            {/* Bottom Wide Tasks & Notes Widget */}
                            <FramerSpotlightCard className="p-5 sm:p-6 flex-1 flex flex-col">
                                <DashboardTodoWidget />
                            </FramerSpotlightCard>
                        </div>
                    </div>

                    {/* Row 2: Asymmetric Interactive Live Radar (7 cols) & What-If Simulator (5 cols) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                        <div className="lg:col-span-7">
                            <LivePeriodRadarWidget
                                slots={todayClasses}
                                subjects={subjects}
                                onMarkAttendance={handleQuickMark}
                            />
                        </div>
                        <div className="lg:col-span-5">
                            <WhatIfBunkSimulator
                                overallAttended={physicalAttended}
                                overallTotal={eligibleClasses}
                                targetThreshold={targetThreshold}
                            />
                        </div>
                    </div>

                    {/* Row 3: Courses Liquid Gallery / Table */}
                    <FramerSpotlightCard className="overflow-hidden">
                        <div className="px-6 py-4 border-b border-primary/12 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <h2 className="font-display text-lg font-extrabold tracking-tight text-on-surface">
                                    Enrolled Subjects
                                </h2>
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary/12 border border-primary/20 text-primary tabular-nums">
                                    {subjects.length}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
                                <RubberSegment<'gallery' | 'table'>
                                    options={[
                                        { id: 'gallery', label: 'Liquid', icon: <LayoutGrid size={13} /> },
                                        { id: 'table', label: 'Table', icon: <List size={13} /> },
                                    ]}
                                    value={subjectViewMode}
                                    size="sm"
                                    variant="white"
                                    layoutId="subject-view-mode-rubber"
                                    onChange={(mode) => {
                                        setSubjectViewMode(mode);
                                        localStorage.setItem('semester_dashboard_subject_view', mode);
                                    }}
                                />

                                <RubberSegment<'Theory' | 'Practical' | 'All'>
                                    options={[
                                        { id: 'All', label: 'All', count: subjects.length },
                                        {
                                            id: 'Theory',
                                            label: 'Theory',
                                            count: subjects.filter((s) => {
                                                const isPractical = s.categories?.includes('Practical') ||
                                                                    s.type?.toLowerCase() === 'practical' ||
                                                                    s.type?.toLowerCase() === 'lab' ||
                                                                    s.name?.toLowerCase().includes('lab');
                                                return !isPractical;
                                            }).length
                                        },
                                        {
                                            id: 'Practical',
                                            label: 'Practical',
                                            count: subjects.filter((s) => {
                                                const isPractical = s.categories?.includes('Practical') ||
                                                                    s.type?.toLowerCase() === 'practical' ||
                                                                    s.type?.toLowerCase() === 'lab' ||
                                                                    s.name?.toLowerCase().includes('lab');
                                                return isPractical;
                                            }).length
                                        },
                                    ]}
                                    value={categoryFilter}
                                    size="sm"
                                    variant="white"
                                    layoutId="category-filter-rubber"
                                    onChange={(val) => {
                                        setCategoryFilter(val);
                                        localStorage.setItem('semester_dashboard_subject_filter', val);
                                    }}
                                />
                            </div>
                        </div>

                        {(() => {
                            const filteredSubjects = categoryFilter === 'All'
                                ? subjects
                                : subjects.filter((s) => {
                                    const isPractical = s.categories?.includes('Practical') ||
                                                        s.type?.toLowerCase() === 'practical' ||
                                                        s.type?.toLowerCase() === 'lab' ||
                                                        s.name?.toLowerCase().includes('lab');
                                    return categoryFilter === 'Theory' ? !isPractical : isPractical;
                                });
                            return filteredSubjects.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Target size={24} className="text-on-surface-variant/30 mb-3" />
                                <p className="text-xs font-bold text-on-surface-variant/55 uppercase tracking-widest">No subjects tracked yet</p>
                            </div>
                            ) : subjectViewMode === 'gallery' ? (
                                /* Theme-Aware Luminous Liquid Gallery Stage */
                                <div className="p-5 sm:p-6">
                                    <SubjectAccordionGallery
                                        subjects={sortSubs(filteredSubjects)}
                                        targetThreshold={targetThreshold}
                                        classesNeeded={classesNeeded}
                                        classesCanSkip={classesCanSkip}
                                        onEditSubject={setEditingSubject}
                                        onDeleteSubject={handleDeleteSubject}
                                    />
                                </div>
                            ) : (
                                <>
                                    {/* Desktop View */}
                                    <div className="hidden md:block overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-xs select-none min-w-[650px]">
                                            <thead>
                                                <tr className="border-b border-on-surface/[0.08] bg-on-surface/[0.02] text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">
                                                    <th className="px-5 py-3.5 whitespace-nowrap">Code</th>
                                                    <th className="px-5 py-3.5 whitespace-nowrap">Subject</th>
                                                    <th className="px-5 py-3.5 whitespace-nowrap">Faculty</th>
                                                    <th className="px-5 py-3.5 text-center whitespace-nowrap" data-tooltip="Attended vs. eligible classes (excluding approved medical leaves)">Attended</th>
                                                    <th className="px-5 py-3.5 text-center whitespace-nowrap">Rate</th>
                                                    <th className="px-5 py-3.5 text-center whitespace-nowrap" data-tooltip="Safe skips available or consecutive classes needed to hit target">Standing</th>
                                                    <th className="px-5 py-3.5 text-right whitespace-nowrap">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-outline/20">
                                                {sortSubs(filteredSubjects).map((subject) => (
                                                    <SubjectRow
                                                        key={subject._id}
                                                        subject={subject}
                                                        targetThreshold={targetThreshold}
                                                        classesNeeded={classesNeeded}
                                                        classesCanSkip={classesCanSkip}
                                                        triggerBubbleMenu={triggerBubbleMenu}
                                                        setEditingSubject={setEditingSubject}
                                                        handleDeleteSubject={handleDeleteSubject}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile/Tablet Card-list View */}
                                    <div className="block md:hidden divide-y divide-outline/20">
                                        {sortSubs(filteredSubjects).map((subject) => {
                                            const { attended, total, totalWithMedical, medicalLeaveCount } = getMedicalAdjustedCounts(subject);
                                            const pct = subject.attendance_percentage ?? (total > 0 ? (attended / total) * 100 : 0);
                                            const withMedicalAsAbsentPct = totalWithMedical > 0 ? (attended / totalWithMedical) * 100 : 0;
                                            const isCritical = pct < targetThreshold;
                                            const needed = classesNeeded(attended, total);
                                            const canSkip = classesCanSkip(attended, total);

                                            return (
                                                <div
                                                    key={subject._id}
                                                    className="p-4 sm:p-5 flex flex-col gap-3 hover:bg-surface-container/10 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                <span className="font-mono text-[9px] font-bold text-on-surface-variant/40 tracking-wider">
                                                                    {subject.code || 'COURSE'}
                                                                </span>
                                                                <span className="px-1.5 py-0.5 text-[8px] font-semibold tracking-wider rounded border border-outline bg-surface-container-low text-on-surface-variant/50 uppercase">
                                                                    {(subject.categories?.includes('Practical') || subject.type?.toLowerCase() === 'practical' || subject.type?.toLowerCase() === 'lab' || subject.name?.toLowerCase().includes('lab')) ? 'Practical' : 'Theory'}
                                                                </span>
                                                                {subject.credits !== null && subject.credits !== undefined && (
                                                                    <span className="px-1.5 py-0.5 text-[8px] font-bold tracking-wider rounded border border-outline bg-surface-container-low text-primary/70 uppercase">
                                                                        {subject.credits} Credits
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h4 className="text-xs font-bold text-on-surface truncate max-w-[220px]">
                                                                {subject.name}
                                                            </h4>
                                                            {subject.professor && (
                                                                <p className="text-[10px] text-on-surface-variant/50 font-medium mt-0.5 truncate max-w-[200px]">
                                                                    Prof. {formatTeacherName(subject.professor)}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="text-right flex flex-col items-end gap-1 shrink-0">
                                                            <span className={`text-sm font-bold ${isCritical ? 'text-red-500' : 'text-on-surface'}`}>
                                                                {Math.round(pct)}%
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="rounded-md border border-outline/35 bg-surface-container/25 px-3 py-2">
                                                        <div className="flex items-center justify-between gap-3 text-[9px]">
                                                            <span className="font-semibold uppercase tracking-wide text-on-surface-variant/50">{medicalLeaveCount > 0 ? 'Medical excluded' : 'Attendance'}</span>
                                                            <span className="shrink-0 font-bold text-on-surface">{attended} / {total}</span>
                                                        </div>
                                                        {medicalLeaveCount > 0 && (
                                                            <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-outline/20 pt-1.5 text-[9px]">
                                                                <span className="font-semibold uppercase tracking-wide text-on-surface-variant/50">Medical counted absent</span>
                                                                <span className="shrink-0 font-bold text-on-surface-variant/75">{Math.round(withMedicalAsAbsentPct)}% Â· {attended}/{totalWithMedical}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="w-full h-1 bg-on-surface/5 border border-outline/35 rounded-full overflow-hidden">
                                                        <div className={`h-full ${isCritical ? 'bg-red-500' : 'bg-on-surface'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                                    </div>

                                                    <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-outline/10">
                                                        <CallChip
                                                            label={isCritical ? `Need ${needed} cls` : `${canSkip} Bunks`}
                                                            variant={isCritical ? 'danger' : 'success'}
                                                            pulse={isCritical}
                                                        />

                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <button
                                                                onClick={() => setEditingSubject(subject)}
                                                                className="h-7 px-3 border border-on-surface/[0.10] hover:bg-on-surface/[0.08] rounded-full flex items-center justify-center text-[11px] font-semibold text-on-surface transition-all cursor-pointer whitespace-nowrap"
                                                            >
                                                                Edit
                                                            </button>
                                                            <HoldButton
                                                                variant="danger"
                                                                label="Hold Delete"
                                                                completedLabel="Deleted"
                                                                holdDuration={750}
                                                                onComplete={() => handleDeleteSubject(normalizeId(subject._id || subject.id), subject.name)}
                                                                className="h-7 px-3 text-[11px] rounded-full"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                                );
                        })()}
                    </FramerSpotlightCard>
                </div>
            )}


            {/* Float Hold Bubble Menu */}
            <AnimatePresence>
                {bubbleMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-50"
                            onClick={() => {
                                haptics.light();
                                setBubbleMenu(null);
                            }}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={{ top: bubbleMenu.y, left: bubbleMenu.x }}
                            className="fixed z-50 liquid-glass-overlay rounded-2xl p-2 shadow-xl min-w-[168px] text-on-surface flex flex-col gap-1"
                        >
                            {(() => {
                                const targetSub = subjects.find(s => (s._id || s.id) === bubbleMenu.subjectId);
                                if (!targetSub) return null;
                                const targetSubId = targetSub._id || targetSub.id;
                                if (!targetSubId) return null;
                                return (
                                    <>
                                        <button
                                            onClick={() => {
                                                haptics.selection();
                                                setEditingSubject(targetSub);
                                                setBubbleMenu(null);
                                            }}
                                            className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-container rounded-md transition-colors cursor-pointer"
                                        >
                                            <Edit2 size={12} />
                                            Edit Details
                                        </button>
                                        <HoldButton
                                            variant="danger"
                                            label="Hold to Delete Course"
                                            completedLabel="Deleted"
                                            holdDuration={750}
                                            onComplete={() => {
                                                haptics.heavy();
                                                handleDeleteSubject(targetSubId, targetSub.name);
                                                setBubbleMenu(null);
                                            }}
                                            className="w-full text-left px-2.5 py-1.5 text-xs font-semibold rounded-md mt-1"
                                        >
                                            <Trash2 size={12} className="mr-1 inline-block" />
                                            <span>Hold to Delete</span>
                                        </HoldButton>
                                    </>
                                );
                            })()}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <AddSubjectModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={loadDashboard} currentSemester={currentSemester} />
            {editingSubject && <EditSubjectModal isOpen={!!editingSubject} onClose={() => setEditingSubject(null)} subject={editingSubject} onSuccess={loadDashboard} />}
            {markingSubjectId && <AttendanceModal isOpen={!!markingSubjectId} onClose={() => setMarkingSubjectId(null)} onSuccess={loadDashboard} />}
        </div>
    );
};

export default Dashboard;


