import React, { useState, useEffect } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useDashboard, useMarkAttendance, useDeleteSubject } from '@/hooks/useDashboard';
import { useAuth } from '@/contexts/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Trash2, Edit2, Check, X,
    Target, Flame, ChevronRight, Settings as SettingsIcon
} from 'lucide-react';
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
import { findSubjectForSlot, sortTimetableSlots } from '@/lib/timetable';
import { WhatIfBunkSimulator } from '@/components/dashboard/WhatIfBunkSimulator';
import { LivePeriodRadarWidget } from '@/components/dashboard/LivePeriodRadarWidget';
import { TactileMarkButton } from '@/components/dashboard/TactileMarkButton';
import { triggerCelebration } from '@/utils/celebration';
import { isDevTestMode, resetDevTestData, disableDevTestMode } from '@/utils/devTestData';
import { FramerSpotlightCard } from '@/components/ui/FramerSpotlightCard';
import { AuroraGlow } from '@/components/ui/AuroraGlow';
import { FullCardLiquidFill } from '@/components/ui/FullCardLiquidFill';
import { SubjectAccordionGallery } from '@/components/dashboard/SubjectAccordionGallery';
import {
    GlideSelect,
    HoldButton,
    FuseButton,
    CallChip,
    CometDial,
    WarmTooltip,
    AnimatedList,
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
    onQuickMark: (subjectId: string, status: 'present' | 'absent') => void;
}> = ({
    subject,
    targetThreshold,
    classesNeeded,
    classesCanSkip,
    triggerBubbleMenu,
    setEditingSubject,
    handleDeleteSubject,
    onQuickMark,
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
            className="hover:bg-surface-container/20 transition-colors group cursor-default border-b border-outline/10 last:border-b-0"
        >
            <td className="px-6 py-3.5 font-mono text-xs font-semibold text-on-surface-variant/40">{subject.code || 'COURSE'}</td>
            <td className="px-6 py-3.5 font-bold text-on-surface">
                <div>
                    <p className="truncate max-w-[200px] leading-tight text-xs">{subject.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[8px] font-semibold text-on-surface-variant/40 uppercase tracking-widest">
                            {(subject.categories?.includes('Practical') || subject.type?.toLowerCase() === 'practical' || subject.type?.toLowerCase() === 'lab' || subject.name?.toLowerCase().includes('lab')) ? 'Practical' : 'Theory'}
                        </span>
                        {subject.credits !== null && subject.credits !== undefined && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-on-surface-variant/20" />
                                <span className="text-[8px] font-bold text-primary/70 uppercase tracking-widest">{subject.credits} Credits</span>
                            </>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-6 py-3.5 text-on-surface-variant/50 font-medium text-xs">
                <p className="truncate max-w-[150px] leading-tight">{formatTeacherName(subject.professor || '')}</p>
            </td>
            <td className="px-6 py-3.5 text-center font-semibold text-on-surface text-xs">
                <div>{attended} / {total}</div>
                {medicalLeaveCount > 0 && (
                    <WarmTooltip content={`Medical counted as absent: ${attended}/${totalWithMedical} (${Math.round(withMedicalAsAbsentPct)}%)`}>
                        <div className="mt-1 text-[8px] font-medium text-cyan-400/80 cursor-help underline decoration-dotted">
                            med: +{medicalLeaveCount} excluded
                        </div>
                    </WarmTooltip>
                )}
            </td>
            <td className="px-6 py-3.5 text-center">
                <div className="flex flex-col items-center gap-1">
                    <span className={`font-bold text-xs ${isCritical ? 'text-red-500' : 'text-on-surface'}`}>{Math.round(pct)}%</span>
                    <div className="w-12 h-1 bg-on-surface/5 rounded-full overflow-hidden shrink-0">
                        <div className={`h-full ${isCritical ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                </div>
            </td>
            <td className="px-6 py-3.5 text-center whitespace-nowrap">
                <CallChip
                    label={isCritical ? `Need ${needed} cls` : `${canSkip} Bunks`}
                    variant={isCritical ? 'danger' : 'success'}
                    pulse={isCritical}
                />
            </td>

            <td className="px-6 py-3.5 text-right">
                <div className="flex items-center justify-end gap-2.5">
                    <div className="flex items-center gap-1">
                        <TactileMarkButton
                            status="present"
                            onMark={() => onQuickMark(subjectId, 'present')}
                        />
                        <TactileMarkButton
                            status="absent"
                            onMark={() => onQuickMark(subjectId, 'absent')}
                        />
                    </div>
                    <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                            onClick={() => setEditingSubject(subject)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-transparent text-on-surface-variant/60 hover:border-outline/60 hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-all cursor-pointer"
                            title={`Edit ${subject.name}`}
                            aria-label={`Edit ${subject.name}`}
                        >
                            <Edit2 size={14} strokeWidth={1.8} />
                        </button>
                        <HoldButton
                            variant="danger"
                            holdDuration={750}
                            title={`Hold to delete ${subject.name}`}
                            onComplete={() => handleDeleteSubject(subjectId, subject.name)}
                            className="h-8 w-8 p-0 flex items-center justify-center rounded-lg border border-transparent hover:border-red-500/20"
                        >
                            <Trash2 size={14} strokeWidth={1.8} />
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
                const daySlots = data?.schedule?.[currentDay] || [];
                
                setTodayClasses(sortTimetableSlots(daySlots));
            } catch (err) {
                console.error("Failed to load timetable for dashboard", err);
            }
        };

        if (user) {
            void fetchTimetable();
        }
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
                    showToast('success', status === 'present' ? 'âœ“ Marked Present' : 'âœ• Marked Absent');
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
            {/* Header Section */}
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-1">
                        System / Overview
                    </p>
                    <h1 className="text-2xl font-bold text-on-surface tracking-tight">Dashboard</h1>
                    <p className="text-xs text-on-surface-variant/40 mt-0.5">
                        Manage and track subject attendance.
                    </p>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-auto">
                    {/* GlideSelect Semester Dropdown */}
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
                        className="py-1.5 px-3 text-xs"
                    >
                        <Plus size={14} className="mr-1 inline-block" /> Add Subject
                    </FuseButton>
                </div>
            </div>

            {isDevTestMode() && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 backdrop-blur-xl">
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs font-bold tracking-wide">
                            DEV TEST MODE ACTIVE — Interactive Mock Data Loaded
                        </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <HoldButton
                            label="Hold to Reset Data"
                            completedLabel="Resetting..."
                            holdTime={900}
                            variant="primary"
                            className="py-1 px-3 text-[11px]"
                            onComplete={() => {
                                resetDevTestData();
                                loadDashboard();
                                showToast('success', 'Dev test data reset to initial benchmark state');
                            }}
                        />
                        <FuseButton
                            onClick={() => {
                                disableDevTestMode();
                                window.location.href = '/login';
                            }}
                            variant="secondary"
                            className="py-1 px-3 text-[11px]"
                        >
                            ✕ Exit Dev Mode
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
                    {/* Bento Grid */}
                    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3 md:items-stretch">
                        
                        {/* Bento Card 1: Full Card Gradient Liquid Fill Reservoir */}
                        <FullCardLiquidFill
                            percentage={att}
                            attended={physicalAttended}
                            total={eligibleClasses}
                            safeBunks={safeBunks}
                            deficitCount={riskCount}
                            medicalLeaveCount={medicalLeaveCount}
                            attendanceWithoutMedical={attendanceWithoutMedical}
                            targetThreshold={targetThreshold}
                            className="md:h-full min-h-[380px]"
                        />

                        {/* Bento Card 2: Student Target */}
                        <FramerSpotlightCard glowColor="blue" className="p-5 sm:p-6 flex flex-col justify-between md:h-full">
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Academic Target</span>
                                    <Target size={13} className="text-on-surface-variant/40" />
                                </div>
                                
                                <div className="rounded-2xl border border-white/10 bg-surface-container/20 p-4 mb-5 flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40">Minimum Goal</p>
                                        <p className="text-2xl font-black tracking-tight text-on-surface">{targetThreshold}%</p>
                                        <div className="mt-2 text-[10px] font-semibold">
                                            <span className={hasAttendanceData && targetDelta < 0 ? 'text-red-500' : 'text-emerald-400'}>
                                                {!hasAttendanceData
                                                    ? 'No classes recorded yet'
                                                    : targetDelta >= 0
                                                        ? `${targetDelta.toFixed(1)}% above goal`
                                                        : `${Math.abs(targetDelta).toFixed(1)}% below goal`}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex items-center justify-center">
                                        <CometDial
                                            value={hasAttendanceData ? Math.min(100, Math.max(0, att)) : 0}
                                            size={84}
                                            strokeWidth={8}
                                            color={targetDelta < 0 ? '#f43f5e' : '#38bdf8'}
                                            label="Attended"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4 my-2 border-t border-outline/30 pt-4">
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40">Student Name</p>
                                        <p className="text-sm font-bold text-on-surface">{user?.name || 'Student'}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40 font-mono">Enrollment</p>
                                            <p className="text-xs font-semibold text-on-surface truncate font-mono">{user?.enrollment_number || 'â€”'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40">Batch</p>
                                            <p className="text-xs font-semibold text-on-surface truncate">{user?.batch || 'â€”'}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40">Target Goal</p>
                                            <p className="text-xs font-semibold text-on-surface">{targetThreshold}% Minimum</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40">Current Semester</p>
                                            <p className="text-xs font-semibold text-on-surface">Semester {currentSemester}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-outline/40 pt-4 mt-6">
                                <Link
                                    to="/settings"
                                    className="w-full h-10 flex items-center justify-center gap-2 border border-outline hover:border-on-surface/20 hover:bg-surface-container rounded-md text-xs font-semibold text-on-surface transition-all cursor-pointer shadow-sm"
                                >
                                    <SettingsIcon size={12} />
                                    Configure Settings
                                </Link>
                            </div>
                        </FramerSpotlightCard>

                        {/* Bento Card 3: Today's Schedule */}
                        <FramerSpotlightCard glowColor="purple" className="p-5 sm:p-6 flex flex-col md:h-full">
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Today's Schedule</span>
                                    <Flame size={13} className="text-on-surface-variant/40" />
                                </div>
                                
                                <div className="my-2 min-h-0 flex-1 max-h-[360px] overflow-y-auto custom-scrollbar pr-1 md:flex md:max-h-[430px] md:flex-col">
                                    {todayClasses.length > 0 ? (
                                        <AnimatedList
                                            items={todayClasses}
                                            keyExtractor={(cls) => `${cls.start_time}-${cls.subject_name || cls.subjectName || 'slot'}`}
                                            renderItem={(cls) => {
                                                const sub = findSubjectForSlot(subjects, cls);
                                                return (
                                                    <div className="flex min-h-11 items-center gap-3 py-2.5 border-b border-outline/30 last:border-b-0">
                                                        <div className="text-center bg-surface-container border border-outline/40 rounded-md px-2 py-0.5 shrink-0 min-w-[55px]">
                                                            <span className="block text-[8px] font-bold text-on-surface-variant/50 leading-none">{cls.start_time || cls.startTime || '—'}</span>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-on-surface truncate leading-tight">{sub?.name || cls.subject_name || cls.subjectName || cls.label || cls.name || 'Break'}</p>
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                    ) : (
                                        <div className="py-8 text-center">
                                            <p className="text-xs font-semibold text-on-surface-variant/30 italic">No classes today. Enjoy your day!</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-outline/40 pt-4 mt-6 shrink-0">
                                <Link
                                    to="/timetable"
                                    className="w-full h-10 flex items-center justify-center gap-1 border border-outline hover:border-on-surface/20 hover:bg-surface-container rounded-md text-xs font-semibold text-on-surface transition-all cursor-pointer shadow-sm"
                                >
                                    View Full Timetable
                                    <ChevronRight size={12} />
                                </Link>
                            </div>
                        </FramerSpotlightCard>

                        {/* Kinetic Interactive Section: Live Radar & What-If Simulator */}
                        <div className="md:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6 my-2">
                            <LivePeriodRadarWidget
                                slots={todayClasses}
                                subjects={subjects}
                                onMarkAttendance={handleQuickMark}
                            />
                            <WhatIfBunkSimulator
                                overallAttended={physicalAttended}
                                overallTotal={eligibleClasses}
                                targetThreshold={targetThreshold}
                            />
                        </div>

                        {/* Bento Card 5: Courses Breakdown */}
                        <FramerSpotlightCard glowColor="cyan" className="overflow-hidden md:col-span-3 mt-2">
                            <div className="px-6 py-5 border-b border-outline/30 bg-surface-container/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div>
                                    <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest block">
                                        Courses Breakdown
                                    </span>
                                    <p className="text-xs text-white/50 mt-0.5">
                                        Interactive liquid-filled subject cards with category aurora styling.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
                                    {/* View Mode Toggle */}
                                    <GlideSelect<'gallery' | 'table'>
                                        options={[
                                            { id: 'gallery', label: '🎴 Accordion Gallery' },
                                            { id: 'table', label: '☰ Table' },
                                        ]}
                                        value={subjectViewMode}
                                        onChange={(mode) => {
                                            setSubjectViewMode(mode);
                                            localStorage.setItem('semester_dashboard_subject_view', mode);
                                        }}
                                    />

                                    {/* Category filter tabs */}
                                    <GlideSelect<'Theory' | 'Practical' | 'All'>
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
                                        onChange={(val) => {
                                            const typedVal = val as 'Theory' | 'Practical' | 'All';
                                            setCategoryFilter(typedVal);
                                            localStorage.setItem('semester_dashboard_subject_filter', typedVal);
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
                                <div className="flex flex-col items-center justify-center py-20 bg-surface">
                                    <Target size={24} className="text-on-surface-variant/20 mb-4" />
                                    <p className="text-xs font-bold text-on-surface-variant/40 uppercase tracking-widest">No subjects tracked yet</p>
                                </div>
                                ) : subjectViewMode === 'gallery' ? (
                                    /* Bespoke Liquid Fill Accordion Gallery View */
                                    <div className="p-5 sm:p-6 bg-slate-950/40">
                                        <SubjectAccordionGallery
                                            subjects={sortSubs(filteredSubjects)}
                                            targetThreshold={targetThreshold}
                                            classesNeeded={classesNeeded}
                                            classesCanSkip={classesCanSkip}
                                            onQuickMark={handleQuickMark}
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
                                                <tr className="border-b border-outline/30 bg-surface-container/20 text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest">
                                                    <th className="px-6 py-3.5">Code</th>
                                                    <th className="px-6 py-3.5">Subject Name</th>
                                                    <th className="px-6 py-3.5">Professor</th>
                                                    <th className="px-6 py-3.5 text-center">Attended / Eligible Total</th>
                                                    <th className="px-6 py-3.5 text-center">Percentage</th>
                                                    <th className="px-6 py-3.5 text-center">Can Bunk / Needed</th>
                                                    <th className="px-6 py-3.5 text-right">Actions</th>
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
                                                        onQuickMark={handleQuickMark}
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
                                                            <TactileMarkButton
                                                                status="present"
                                                                onMark={() => handleQuickMark(normalizeId(subject._id || subject.id), 'present')}
                                                            />
                                                            <TactileMarkButton
                                                                status="absent"
                                                                onMark={() => handleQuickMark(normalizeId(subject._id || subject.id), 'absent')}
                                                            />
                                                            <button
                                                                onClick={() => setEditingSubject(subject)}
                                                                className="h-7 px-2.5 border border-outline hover:bg-surface-container rounded-lg flex items-center justify-center text-[10px] font-semibold text-on-surface transition-all cursor-pointer whitespace-nowrap"
                                                            >
                                                                Edit
                                                            </button>
                                                            <HoldButton
                                                                variant="danger"
                                                                label="Hold Delete"
                                                                completedLabel="Deleted"
                                                                holdDuration={750}
                                                                onComplete={() => handleDeleteSubject(normalizeId(subject._id || subject.id), subject.name)}
                                                                className="h-7 px-2.5 text-[10px] rounded-lg"
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
                            className="fixed z-50 bg-surface border border-outline rounded-lg p-1.5 shadow-xl min-w-[150px] text-on-surface flex flex-col"
                        >
                            <button
                                onClick={() => { handleQuickMark(bubbleMenu.subjectId, 'present'); setBubbleMenu(null); }}
                                className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-container rounded-md transition-colors cursor-pointer"
                            >
                                <Check size={12} className="text-primary" />
                                Mark Present
                            </button>
                            <button
                                onClick={() => { handleQuickMark(bubbleMenu.subjectId, 'absent'); setBubbleMenu(null); }}
                                className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-container rounded-md transition-colors cursor-pointer"
                            >
                                <X size={12} className="text-red-500" />
                                Mark Absent
                            </button>
                            <div className="h-px bg-outline my-1" />
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


