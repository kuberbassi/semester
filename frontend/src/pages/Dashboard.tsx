import React, { useState, useEffect, useRef } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useDashboard, useMarkAttendance, useDeleteSubject } from '@/hooks/useDashboard';
import { useAuth } from '@/contexts/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Trash2, Edit2, Check, X,
    Activity, Target, Flame, ChevronRight, ChevronsUpDown, Settings as SettingsIcon
} from 'lucide-react';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import EditSubjectModal from '@/components/modals/EditSubjectModal';
import AttendanceModal from '@/components/modals/AttendanceModal';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import useLongPress from '@/hooks/useLongPress';
import { useSemester } from '@/contexts/semester-context';
import { Link } from 'react-router-dom';
import { formatTeacherName } from '@/utils/formatters';
import { useConfirm } from '@/contexts/confirm-context';
import type { Subject, TimetableSlot } from '@/types';
import { findSubjectForSlot, sortTimetableSlots } from '@/lib/timetable';

type SubjectMenuEvent = React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>;

const normalizeId = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

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
    const pct = subject.attendance_percentage || 0;
    const isCritical = pct < targetThreshold;
    const needed = classesNeeded(subject.attended || 0, subject.total || 0);
    const canSkip = classesCanSkip(subject.attended || 0, subject.total || 0);
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
            <td className="px-6 py-3.5 text-center font-semibold text-on-surface text-xs">{subject.attended || 0} / {subject.total || 0}</td>
            <td className="px-6 py-3.5 text-center">
                <div className="flex flex-col items-center gap-1">
                    <span className={`font-bold text-xs ${isCritical ? 'text-red-500' : 'text-on-surface'}`}>{Math.round(pct)}%</span>
                    <div className="w-12 h-0.5 bg-on-surface/5 rounded-full overflow-hidden shrink-0">
                        <div className={`h-full ${isCritical ? 'bg-red-500' : 'bg-on-surface'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                </div>
            </td>
            <td className="px-6 py-3.5 text-center whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border whitespace-nowrap tracking-wide ${
                    isCritical 
                        ? 'bg-red-500/5 border-red-500/10 text-red-500' 
                        : 'bg-primary/5 border-outline/30 text-on-surface-variant/80'
                }`}>
                    {isCritical ? `Need ${needed} cls` : `${canSkip} Bunks`}
                </span>
            </td>

            <td className="px-6 py-3.5 text-right">
                <div className="flex justify-end gap-1.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                        onClick={() => setEditingSubject(subject)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-transparent text-on-surface-variant/60 hover:border-outline/60 hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-all cursor-pointer"
                        title={`Edit ${subject.name}`}
                        aria-label={`Edit ${subject.name}`}
                    >
                        <Edit2 size={14} strokeWidth={1.8} />
                    </button>
                    <button
                        onClick={() => handleDeleteSubject(subjectId, subject.name)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-transparent text-on-surface-variant/60 hover:border-red-500/20 hover:bg-red-500/5 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 transition-all cursor-pointer"
                        title={`Delete ${subject.name}`}
                        aria-label={`Delete ${subject.name}`}
                    >
                        <Trash2 size={14} strokeWidth={1.8} />
                    </button>
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
    const [semDropOpen, setSemDropOpen] = useState(false);
    const semRef = useRef<HTMLDivElement>(null);

    // Close mobile semester dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (semRef.current && !semRef.current.contains(e.target as Node)) {
                setSemDropOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const markAttendanceMutation = useMarkAttendance();
    const deleteSubjectMutation = useDeleteSubject();

    usePageMeta({
        title: 'Dashboard | Semester',
        description: 'Your academic overview — attendance, upcoming classes, and performance at a glance.',
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

    const handleQuickMark = async (subjectId: string, status: 'present' | 'absent') => {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(15);
        }
        try {
            await markAttendanceMutation.mutateAsync({ subjectId, status });
            showToast('success', `Marked ${status}`);
        } catch {
            showToast('error', 'Failed to mark attendance');
        }
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

    const att = dashboardData?.overall_attendance || 0;
    const attendanceWithoutMedical = dashboardData?.attendance_without_medical ?? att;
    const medicalLeaveCount = dashboardData?.medical_leave_count ?? 0;
    const subjects = dashboardData?.subjects || [];
    const totalClasses = subjects.reduce((a, c) => a + (c.total || 0), 0) || 0;
    const safeCount = subjects.filter(s => (s.attendance_percentage || 0) >= targetThreshold).length || 0;
    const riskCount = subjects.filter(s => (s.attendance_percentage || 0) < targetThreshold).length || 0;
    const subjectCount = dashboardData?.total_subjects || subjects.length || 0;
    const totalAttended = subjects.reduce((sum, subject) => sum + (subject.attended || 0), 0);
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

        setBubbleMenu({
            subjectId,
            x: boundedX,
            y: boundedY
        });
    };

    return (
        <div className="pb-24 w-full select-none">
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
                    {/* Semester Selector */}
                    <div ref={semRef} className="relative z-20">
                        <button
                            onClick={() => setSemDropOpen(!semDropOpen)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline bg-surface hover:bg-surface-container-high transition-colors text-xs font-semibold text-on-surface-variant hover:text-on-surface whitespace-nowrap cursor-pointer"
                        >
                            Sem {currentSemester}
                            <ChevronsUpDown size={14} aria-hidden="true" />
                        </button>
                        <AnimatePresence>
                            {semDropOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.1 }}
                                    className="absolute left-0 top-full mt-2 w-32 bg-surface border border-outline rounded-lg p-1 shadow-lg z-50 text-on-surface"
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                        <button
                                            key={s}
                                            onClick={() => { setCurrentSemester(s); setSemDropOpen(false); }}
                                            className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] font-semibold transition-colors cursor-pointer flex justify-between items-center ${s === currentSemester
                                                ? 'bg-on-surface text-surface font-bold'
                                                : 'text-on-surface-variant hover:bg-surface-container'
                                                }`}
                                        >
                                            <span>Sem {s}</span>
                                            {s === currentSemester && <Check size={10} aria-hidden="true" />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-on-surface text-surface text-xs font-bold transition-all hover:bg-on-surface/90 cursor-pointer"
                    >
                        <Plus size={14} /> Add Subject
                    </button>
                </div>
            </div>

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
                        
                        {/* Bento Card 1: Academic Health */}
                        <div className="rounded-xl border border-outline/50 bg-surface p-5 sm:p-6 flex flex-col justify-between hover:border-on-surface/20 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.01)] md:h-full">
                            <div className="flex items-center justify-between mb-6">
                                <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Overall Academic Health</span>
                                <Activity size={13} className="text-on-surface-variant/40" />
                            </div>
                            
                            <div className="flex flex-col justify-between gap-6 my-2">
                                <div>
                                    <p className="text-5xl md:text-6xl font-black tracking-tighter text-on-surface leading-none">{att.toFixed(1)}%</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40 mt-3">Overall Conducted Classes</p>
                                    <div className="mt-3 inline-flex items-baseline gap-1.5 rounded-md border border-outline/50 bg-surface-container/50 px-2 py-1">
                                        <span className="text-xs font-black text-on-surface">{attendanceWithoutMedical.toFixed(1)}%</span>
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/50">
                                            Medical as absent{medicalLeaveCount > 0 ? ` · ${medicalLeaveCount}` : ''}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="w-full space-y-4">
                                    <div>
                                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-2">
                                            <span>Conduct Progress</span>
                                            <span>{totalAttended} / {totalClasses} classes</span>
                                        </div>
                                        <div className="w-full h-1 bg-on-surface/5 border border-outline/35 rounded-full overflow-hidden">
                                            <div className="h-full bg-on-surface" style={{ width: `${Math.min(100, totalClasses > 0 ? (totalAttended / totalClasses) * 100 : 0)}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 border-t border-outline/40 pt-4 mt-8">
                                <div className="text-left">
                                    <span className="block text-[8px] font-bold text-on-surface-variant/45 uppercase tracking-wider">Deficit Risk</span>
                                    <span className={`text-sm md:text-base font-bold ${riskCount > 0 ? 'text-red-500' : 'text-on-surface'}`}>{riskCount} {riskCount === 1 ? 'Subject' : 'Subjects'}</span>
                                </div>
                                <div className="text-left">
                                    <span className="block text-[8px] font-bold text-on-surface-variant/45 uppercase tracking-wider">Safe Bunks</span>
                                    <span className="text-sm md:text-base font-bold text-on-surface">{safeBunks} Left</span>
                                </div>
                                <div className="text-left">
                                    <span className="block text-[8px] font-bold text-on-surface-variant/45 uppercase tracking-wider">Total Tracked</span>
                                    <span className="text-sm md:text-base font-bold text-on-surface">{safeCount}/{subjectCount}</span>
                                </div>
                            </div>
                        </div>

                        {/* Bento Card 2: Student Target */}
                        <div className="rounded-xl border border-outline/50 bg-surface p-5 sm:p-6 flex flex-col justify-between hover:border-on-surface/20 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.01)] md:h-full">
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Academic Target</span>
                                    <Target size={13} className="text-on-surface-variant/40" />
                                </div>
                                
                                <div className="rounded-lg border border-outline/50 bg-surface-container/25 p-4 mb-5">
                                    <div className="flex items-end justify-between gap-4">
                                        <div>
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40">Minimum Goal</p>
                                            <p className="text-2xl font-black tracking-tight text-on-surface">{targetThreshold}%</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40">Current</p>
                                            <p className={`text-base font-bold ${hasAttendanceData && targetDelta < 0 ? 'text-red-500' : 'text-on-surface'}`}>
                                                {hasAttendanceData ? `${att.toFixed(1)}%` : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="relative mt-3 h-1.5 rounded-full bg-on-surface/5">
                                        <div
                                            className={`h-full rounded-full ${hasAttendanceData && targetDelta < 0 ? 'bg-red-500' : 'bg-on-surface'}`}
                                            style={{ width: `${hasAttendanceData ? Math.min(100, Math.max(0, att)) : 0}%` }}
                                        />
                                        <span
                                            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface"
                                            style={{ left: `${Math.min(100, Math.max(0, targetThreshold))}%` }}
                                            title={`${targetThreshold}% target`}
                                        />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-3 text-[9px] font-semibold">
                                        <span className="text-on-surface-variant/40">0%</span>
                                        <span className={hasAttendanceData && targetDelta < 0 ? 'text-red-500' : 'text-on-surface-variant/60'}>
                                            {!hasAttendanceData
                                                ? 'No classes recorded yet'
                                                : targetDelta >= 0
                                                    ? `${targetDelta.toFixed(1)} points above target`
                                                    : `${Math.abs(targetDelta).toFixed(1)} points below target`}
                                        </span>
                                        <span className="text-on-surface-variant/40">100%</span>
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
                                            <p className="text-xs font-semibold text-on-surface truncate font-mono">{user?.enrollment_number || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40">Batch</p>
                                            <p className="text-xs font-semibold text-on-surface truncate">{user?.batch || '—'}</p>
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
                        </div>

                        {/* Bento Card 3: Today's Schedule */}
                        <div className="rounded-xl border border-outline/50 bg-surface p-5 sm:p-6 flex flex-col hover:border-on-surface/20 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.01)] md:h-full">
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Today's Schedule</span>
                                    <Flame size={13} className="text-on-surface-variant/40" />
                                </div>
                                
                                <div className="my-2 min-h-0 flex-1 max-h-[360px] overflow-y-auto custom-scrollbar pr-1 md:flex md:max-h-[430px] md:flex-col">
                                    {todayClasses.length > 0 ? (
                                        todayClasses.map((cls, idx) => {
                                            const sub = findSubjectForSlot(subjects, cls);
                                            return (
                                                <div key={idx} className="flex min-h-11 items-center gap-3 py-2.5 border-b border-outline/30 last:border-b-0">
                                                    <div className="text-center bg-surface-container border border-outline/40 rounded-md px-2 py-0.5 shrink-0 min-w-[55px]">
                                                        <span className="block text-[8px] font-bold text-on-surface-variant/50 leading-none">{cls.start_time || cls.startTime || '—'}</span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-on-surface truncate leading-tight">{sub?.name || cls.subject_name || cls.subjectName || cls.label || cls.name || 'Break'}</p>
                                                    </div>
                                                </div>
                                            );
                                        })
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
                        </div>


                        {/* Bento Card 5: Courses Breakdown */}
                        <div className="rounded-xl border border-outline/50 bg-surface overflow-hidden md:col-span-3 hover:border-on-surface/20 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.01)] mt-2">
                            <div className="px-6 py-5 border-b border-outline/30 bg-surface-container/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Courses Breakdown</span>
                                {/* Category filter tabs */}
                                <div className="flex items-center gap-1 p-0.5 bg-surface border border-outline/50 rounded-md self-start sm:self-auto">
                                    {(['Theory', 'Practical', 'All'] as const).map(cat => {
                                        const count = cat === 'All'
                                            ? subjects.length
                                            : subjects.filter((s) => {
                                                const isPractical = s.categories?.includes('Practical') || 
                                                                    s.type?.toLowerCase() === 'practical' || 
                                                                    s.type?.toLowerCase() === 'lab' || 
                                                                    s.name?.toLowerCase().includes('lab');
                                                return cat === 'Theory' ? !isPractical : isPractical;
                                            }).length;
                                        return (
                                            <button
                                                key={cat}
                                                onClick={() => {
                                                    setCategoryFilter(cat);
                                                    localStorage.setItem('semester_dashboard_subject_filter', cat);
                                                }}
                                                className={`flex items-center gap-1.5 px-3 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                                    categoryFilter === cat
                                                        ? 'bg-on-surface text-surface'
                                                        : 'text-on-surface-variant/50 hover:text-on-surface'
                                                }`}
                                            >
                                                {cat}
                                                <span className={`text-[8px] ${categoryFilter === cat ? 'opacity-60' : 'opacity-40'}`}>{count}</span>
                                            </button>
                                        );
                                    })}
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
                                                    <th className="px-6 py-3.5 text-center">Attended</th>
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
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile/Tablet Card-list View */}
                                    <div className="block md:hidden divide-y divide-outline/20">
                                        {sortSubs(filteredSubjects).map((subject) => {
                                            const pct = subject.attendance_percentage || 0;
                                            const isCritical = pct < targetThreshold;
                                            const needed = classesNeeded(subject.attended || 0, subject.total || 0);
                                            const canSkip = classesCanSkip(subject.attended || 0, subject.total || 0);

                                            return (
                                                <div
                                                    key={subject._id}
                                                    className="p-5 flex flex-col gap-3 hover:bg-surface-container/10 transition-colors"
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
                                                            <span className="text-[10px] font-semibold text-on-surface-variant/40 leading-none">
                                                                {subject.attended || 0}/{subject.total || 0} classes
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="w-full h-1 bg-on-surface/5 border border-outline/35 rounded-full overflow-hidden">
                                                        <div className={`h-full ${isCritical ? 'bg-red-500' : 'bg-on-surface'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                                    </div>

                                                    <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-outline/10">
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border tracking-wide whitespace-nowrap ${
                                                            isCritical 
                                                                ? 'bg-red-500/5 border-red-500/10 text-red-500' 
                                                                : 'bg-primary/5 border-outline/30 text-on-surface-variant/80'
                                                        }`}>
                                                            {isCritical ? `Need ${needed} cls` : `${canSkip} Bunks`}
                                                        </span>

                                                        <div className="flex gap-2 shrink-0">
                                                            <button
                                                                onClick={() => setEditingSubject(subject)}
                                                                className="h-7 px-3 border border-outline hover:bg-surface-container rounded-lg flex items-center justify-center text-[10px] font-semibold text-on-surface transition-all cursor-pointer whitespace-nowrap"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteSubject(normalizeId(subject._id || subject.id), subject.name)}
                                                                className="h-7 px-3 border border-red-500/20 hover:bg-red-500/5 rounded-lg flex items-center justify-center text-[10px] font-semibold text-red-500 transition-all cursor-pointer whitespace-nowrap"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}


            {/* Float Hold Bubble Menu */}
            <AnimatePresence>
                {bubbleMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-50"
                            onClick={() => setBubbleMenu(null)}
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
                                            onClick={() => { setEditingSubject(targetSub); setBubbleMenu(null); }}
                                            className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-container rounded-md transition-colors cursor-pointer"
                                        >
                                            <Edit2 size={12} />
                                            Edit Details
                                        </button>
                                        <button
                                            onClick={() => { handleDeleteSubject(targetSubId, targetSub.name); setBubbleMenu(null); }}
                                            className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/5 rounded-md transition-colors cursor-pointer"
                                        >
                                            <Trash2 size={12} />
                                            Delete Course
                                        </button>
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



