import React, { useCallback, useState, useEffect } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
    LayoutGrid, List, Plus, Edit3, CalendarClock, MapPin, Clock, QrCode
} from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { attendanceService } from '@/services/attendance.service';
import api from '@/services/api';
import { useSemester } from '@/contexts/semester-context';
import { useToast } from '@/components/ui/toast-context';
import PageHeader from '@/components/ui/PageHeader';
import { RubberSegment } from '@/components/react-bits';
import SlotModal from '@/components/modals/SlotModal';
import StructureModal from '@/components/modals/StructureModal';
import TimetableQrModal from '@/components/modals/TimetableQrModal';
import { AnimatePresence } from 'framer-motion';
import type { GridPeriod, Subject, TimetableSchedule, TimetableSlot } from '@/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SLOT_PALETTES = [
    {
        card: 'bg-gradient-to-br from-indigo-500/14 via-indigo-500/8 to-cyan-500/10 border-indigo-500/28 hover:border-indigo-500/50',
        bar: 'bg-gradient-to-b from-indigo-500 to-cyan-400',
        pill: 'text-indigo-600 dark:text-indigo-300',
    },
    {
        card: 'bg-gradient-to-br from-cyan-500/14 via-sky-500/8 to-teal-500/10 border-cyan-500/28 hover:border-cyan-500/50',
        bar: 'bg-gradient-to-b from-cyan-500 to-teal-400',
        pill: 'text-cyan-700 dark:text-cyan-300',
    },
    {
        card: 'bg-gradient-to-br from-violet-500/14 via-purple-500/8 to-fuchsia-500/10 border-violet-500/28 hover:border-violet-500/50',
        bar: 'bg-gradient-to-b from-violet-500 to-fuchsia-400',
        pill: 'text-violet-600 dark:text-violet-300',
    },
    {
        card: 'bg-gradient-to-br from-rose-500/13 via-pink-500/8 to-orange-500/10 border-rose-500/26 hover:border-rose-500/50',
        bar: 'bg-gradient-to-b from-rose-500 to-orange-400',
        pill: 'text-rose-600 dark:text-rose-300',
    },
    {
        card: 'bg-gradient-to-br from-amber-500/14 via-orange-500/8 to-yellow-500/10 border-amber-500/28 hover:border-amber-500/50',
        bar: 'bg-gradient-to-b from-amber-500 to-orange-400',
        pill: 'text-amber-700 dark:text-amber-300',
    },
    {
        card: 'bg-gradient-to-br from-emerald-500/14 via-teal-500/8 to-cyan-500/10 border-emerald-500/28 hover:border-emerald-500/50',
        bar: 'bg-gradient-to-b from-emerald-500 to-cyan-400',
        pill: 'text-emerald-700 dark:text-emerald-300',
    },
];

function getSlotPalette(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return SLOT_PALETTES[Math.abs(hash) % SLOT_PALETTES.length];
}

const normalizeId = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

const findSubjectForSlot = (subjects: Subject[], slot: TimetableSlot): Subject | undefined => {
    const explicitType = String(slot?.type || '').trim().toLowerCase();
    const subjectObject = typeof slot.subject === 'object' && slot.subject !== null ? slot.subject : undefined;

    if (['break', 'lunch', 'gap', 'free', 'custom'].includes(explicitType)) return undefined;

    const slotSubjectId = normalizeId(slot.subject_id || slot.subjectId || subjectObject?._id || subjectObject?.id);
    if (slotSubjectId) {
        const matchedById = subjects.find((sub) => normalizeId(sub._id || sub.id) === slotSubjectId);
        if (matchedById) return matchedById;
    }

    const subjectField = slot?.subject;
    if (typeof subjectField === 'string' && subjectField.trim()) {
        const needle = subjectField.trim().toLowerCase();
        const matchedByName = subjects.find((sub) => String(sub?.name || '').trim().toLowerCase() === needle);
        if (matchedByName) return matchedByName;
    }

    const slotLabel = String(
        slot?.label || slot?.subject_name || slot?.subjectName || slot?.name || subjectObject?.name || subjectObject?.code || ''
    ).trim().toLowerCase();
    if (!slotLabel || slotLabel === 'break' || slotLabel === 'lunch' || slotLabel === 'gap') return undefined;

    return subjects.find((sub) => {
        const subName = String(sub?.name || '').trim().toLowerCase();
        const subCode = String(sub?.code || '').trim().toLowerCase();
        return subName === slotLabel || subCode === slotLabel || subName.includes(slotLabel);
    });
};

const parseTimeForSort = (time12h: string) => {
    if (!time12h) return 0;
    try {
        const parts = time12h.split(' ');
        const time = parts[0];
        const modifier = parts[1] || '';
        const [hours, minutes] = time.split(':');
        let h = parseInt(hours, 10);
        if (modifier) {
            if (h === 12) h = 0;
            if (modifier.toLowerCase() === 'pm') h += 12;
        }
        return h * 60 + parseInt(minutes, 10);
    } catch { return 0; }
};

const normalizeTimeMatch = (t: string) => {
    if (!t) return '';
    try {
        const parts = t.trim().split(' ');
        if (parts.length === 1 && t.includes(':')) {
            const [hours, minutes] = t.split(':');
            let h = parseInt(hours, 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return `${h.toString().padStart(2, '0')}:${minutes} ${ampm}`;
        }
        return t.trim().toUpperCase();
    } catch { return t.trim(); }
};

const getPeriodStartTime = (period: GridPeriod) => String(period.startTime || period.start_time || '').trim();
const getPeriodName = (period: GridPeriod) => String(period.name || period.label || '').trim();
const getSlotStartTime = (slot: TimetableSlot) => String(slot.start_time || slot.startTime || '').trim();
const getSlotEndTime = (slot: TimetableSlot) => String(slot.end_time || slot.endTime || '').trim();

const getSlotStatus = (day: string, startTime: string, endTime: string) => {
    try {
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const now = new Date();
        if (daysOfWeek[now.getDay()] !== day) return 'other-day';
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = parseTimeForSort(startTime);
        const endMinutes = parseTimeForSort(endTime);
        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) return 'active';
        if (currentMinutes > endMinutes) return 'passed';
        return 'upcoming';
    } catch {
        return 'other-day';
    }
};

const TimeTable: React.FC = () => {
    const { currentSemester } = useSemester();
    const { showToast } = useToast();
    const [timetable, setTimetable] = useState<TimetableSchedule>({});
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [periods, setPeriods] = useState<GridPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('Semester_timetable_view') as 'grid' | 'list') || 'grid');
    const [timelineDayFilter, setTimelineDayFilter] = useState<string>('All');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const activeView = isMobile ? 'list' : view;
    const handleSetView = (v: 'grid' | 'list') => {
        setView(v);
        localStorage.setItem('Semester_timetable_view', v);
        api.post('/api/profile/preferences', { timetable_view: v }).catch(() => {});
    };

    usePageMeta({
        title: 'Timetable | Semester',
        description: 'View and manage your weekly class schedule. Customize periods and subjects per semester.',
    });

    const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
    const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<GridPeriod | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [data, subjectsData] = await Promise.all([
                attendanceService.getTimetable(currentSemester),
                attendanceService.getSubjects(currentSemester),
            ]);
            setTimetable(data.schedule || {});
            setPeriods(data.periods || []);
            setSubjects(subjectsData || []);
        } catch (error) {
            console.error('Failed to load timetable', error);
            showToast('error', 'Connection Error');
        } finally {
            setLoading(false);
        }
    }, [currentSemester, showToast]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const handleAddSlot = (day: string, period: GridPeriod) => {
        setSelectedSlot(null);
        setSelectedDay(day);
        setSelectedPeriod(period);
        setIsSlotModalOpen(true);
    };

    const handleEditSlot = (slot: TimetableSlot) => {
        setSelectedSlot(slot);
        setSelectedDay(slot.day);
        setSelectedPeriod(periods.find((p) => normalizeTimeMatch(getPeriodStartTime(p)) === normalizeTimeMatch(getSlotStartTime(slot))) || null);
        setIsSlotModalOpen(true);
    };

    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    return (
        <div className="w-full pb-12 select-none">
            <PageHeader
                title="Timetable"
                icon={CalendarClock}
                badge={`Sem ${currentSemester} · ${periods.length} slots`}
                actions={
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="hidden sm:block">
                            <RubberSegment<'grid' | 'list'>
                                options={[
                                    { id: 'grid', label: 'Board', icon: <LayoutGrid size={12} /> },
                                    { id: 'list', label: 'Timeline', icon: <List size={12} /> },
                                ]}
                                value={view}
                                size="sm"
                                layoutId="timetable-view-segment"
                                onChange={handleSetView}
                            />
                        </div>
                        <button
                            onClick={() => setIsQrModalOpen(true)}
                            data-tooltip="Share your timetable QR or import a code from phone/classmate"
                            className="no-fluid h-8 px-3.5 text-xs font-bold rounded-full bg-on-surface/[0.06] border border-primary/20 text-on-surface hover:border-primary/45 hover:text-primary inline-flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            <QrCode size={13} />
                            QR Share
                        </button>
                        <button
                            onClick={() => setIsStructureModalOpen(true)}
                            data-tooltip="Customize period timings & break rows for this semester"
                            className="no-fluid h-8 px-4 text-xs font-bold rounded-full btn-gradient cursor-pointer"
                        >
                            Edit Periods
                        </button>
                    </div>
                }
            />

            {loading ? (
                <div className="flex justify-center py-40"><LoadingSpinner /></div>
            ) : activeView === 'grid' ? (
                <div className="overflow-x-auto pb-6">
                    <div className="min-w-[820px] liquid-glass rounded-[28px] overflow-hidden">
                        <div className="grid grid-cols-[96px_repeat(5,_1fr)]">
                            {/* Top-left header */}
                            <div className="h-13 flex items-center justify-center gap-1 text-[11px] font-bold text-on-surface-variant/65 border-b border-r border-primary/12 bg-primary/[0.03]">
                                <Clock size={12} className="text-primary" />
                                Time
                            </div>
                            {DAYS.map(day => {
                                const isTodayCol = todayName === day;
                                return (
                                    <div
                                        key={day}
                                        className={`h-13 flex items-center justify-center gap-2 text-xs font-extrabold border-b border-r border-primary/12 last:border-r-0 ${
                                            isTodayCol
                                                ? 'bg-gradient-to-r from-indigo-500/18 via-violet-500/14 to-cyan-500/18 text-primary'
                                                : 'bg-primary/[0.025] text-on-surface-variant'
                                        }`}
                                    >
                                        {isTodayCol && <span className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 shadow-sm" />}
                                        <span className="font-display tracking-tight text-[13px]">{day}</span>
                                    </div>
                                );
                            })}

                            {/* Period rows */}
                            {periods.map((period) => (
                                <React.Fragment key={period.id}>
                                    <div className="flex flex-col justify-center items-center px-2 py-3.5 border-b border-r border-primary/10 bg-primary/[0.02] text-center">
                                        <span className="text-on-surface font-bold text-[11px] leading-tight">{getPeriodName(period)}</span>
                                        <span className="text-[10px] font-semibold text-primary/80 mt-1 leading-none tabular-nums">
                                            {getPeriodStartTime(period)}
                                        </span>
                                    </div>
                                    {DAYS.map(day => {
                                        const isTodayCol = todayName === day;
                                        const daySlots = timetable[day] || [];
                                        const slot = daySlots.find((s) => normalizeTimeMatch(getSlotStartTime(s)) === normalizeTimeMatch(getPeriodStartTime(period)));
                                        const subject = slot ? findSubjectForSlot(subjects, slot) : undefined;
                                        const isBreak = slot?.type?.toLowerCase() === 'break';
                                        const title = subject?.name || slot?.subject_name || slot?.subjectName || slot?.label || slot?.name || (isBreak ? 'Break' : '—');
                                        const palette = getSlotPalette(title);

                                        return (
                                            <div
                                                key={`${day}-${period.id}`}
                                                className={`min-h-[92px] border-b border-r border-primary/10 last:border-r-0 p-2 flex ${
                                                    isTodayCol ? 'bg-primary/[0.025]' : ''
                                                }`}
                                            >
                                                {slot ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditSlot(slot)}
                                                        data-tooltip={`${title} (${getSlotStartTime(slot)} – ${getSlotEndTime(slot)})${slot.classroom ? ` · Room ${slot.classroom.replace(/^room\s+/i, '')}` : ''} — Click to edit`}
                                                        className={`no-fluid relative overflow-hidden h-full w-full rounded-2xl p-2.5 pl-3.5 flex flex-col justify-center items-start text-left cursor-pointer transition-all border ${
                                                            isBreak
                                                                ? 'bg-on-surface/[0.03] border-on-surface/[0.08] opacity-65 hover:opacity-100'
                                                                : palette.card
                                                        }`}
                                                    >
                                                        {!isBreak && (
                                                            <span className={`absolute left-0 top-2 bottom-2 w-[3.5px] rounded-r-full ${palette.bar}`} />
                                                        )}
                                                        <span className="text-xs font-bold text-on-surface leading-snug line-clamp-2">
                                                            {title}
                                                        </span>
                                                        {slot.classroom && (
                                                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1.5 truncate max-w-full ${palette.pill}`}>
                                                                <MapPin size={9} />
                                                                {slot.classroom.replace(/^room\s+/i, '')}
                                                            </span>
                                                        )}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddSlot(day, period)}
                                                        className="no-fluid h-full w-full rounded-2xl hover:bg-primary/[0.06] transition-colors flex items-center justify-center group border border-dashed border-transparent hover:border-primary/25 cursor-pointer"
                                                        title={`Add class on ${day}`}
                                                    >
                                                        <Plus size={15} className="text-on-surface-variant/20 group-hover:text-primary transition-colors" />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Day Focus Filter Strip */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                        {(['All', ...DAYS] as const).map((dayOption) => {
                            const active = timelineDayFilter === dayOption;
                            const isTodayPill = dayOption === todayName;
                            const count = dayOption === 'All'
                                ? DAYS.reduce((sum, d) => sum + (timetable[d]?.length || 0), 0)
                                : (timetable[dayOption]?.length || 0);
                            return (
                                <button
                                    key={dayOption}
                                    type="button"
                                    onClick={() => setTimelineDayFilter(dayOption)}
                                    className={`no-fluid h-9 px-4 rounded-full text-xs font-bold inline-flex items-center gap-2 shrink-0 transition-all cursor-pointer border ${
                                        active
                                            ? 'btn-gradient border-transparent'
                                            : 'bg-surface/80 dark:bg-white/[0.04] border-on-surface/[0.09] text-on-surface-variant hover:text-on-surface hover:border-primary/35'
                                    }`}
                                >
                                    {isTodayPill && !active && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" />
                                    )}
                                    <span>{dayOption === 'All' ? 'Full Week' : dayOption}</span>
                                    <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                                        active ? 'bg-white/20 text-white' : 'bg-on-surface/[0.07] text-on-surface-variant'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* True Vertical Chronological Timeline Sections */}
                    <div className="space-y-5">
                        {(timelineDayFilter === 'All' ? DAYS : [timelineDayFilter]).map(day => {
                            const isTodayDay = todayName === day;
                            const dayList = [...(timetable[day] || [])].sort(
                                (a, b) => parseTimeForSort(getSlotStartTime(a)) - parseTimeForSort(getSlotStartTime(b))
                            );
                            return (
                                <section key={day} className="liquid-glass rounded-[24px] overflow-hidden">
                                    {/* Day Section Header */}
                                    <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-on-surface/[0.07] bg-on-surface/[0.015]">
                                        <div className="flex items-center gap-2.5">
                                            <h2 className={`font-display text-base font-extrabold tracking-tight ${isTodayDay ? 'gradient-text' : 'text-on-surface'}`}>
                                                {day}
                                            </h2>
                                            {isTodayDay && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-indigo-500 to-cyan-500 text-white">
                                                    Today
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] font-semibold text-on-surface-variant tabular-nums">
                                            {dayList.length} {dayList.length === 1 ? 'session' : 'sessions'}
                                        </span>
                                    </div>

                                    {/* Chronological Vertical Track */}
                                    {dayList.length === 0 ? (
                                        <div className="py-10 px-6 text-center">
                                            <p className="text-xs font-medium text-on-surface-variant/65">No classes scheduled for {day}.</p>
                                        </div>
                                    ) : (
                                        <div className="relative px-6 py-5 space-y-3">
                                            {/* Vertical Spine */}
                                            <div
                                                className="pointer-events-none absolute left-[138px] sm:left-[154px] top-7 bottom-7 w-[2px] bg-gradient-to-b from-indigo-500/40 via-cyan-400/35 to-on-surface/10 rounded-full hidden sm:block"
                                                aria-hidden="true"
                                            />

                                            {dayList.map((slot, idx) => {
                                                const subject = findSubjectForSlot(subjects, slot);
                                                const startStr = getSlotStartTime(slot);
                                                const endStr = getSlotEndTime(slot);
                                                const status = getSlotStatus(day, startStr, endStr);
                                                const isBreak = slot.type?.toLowerCase() === 'break';
                                                const title = subject?.name || slot.subject_name || slot.subjectName || slot.label || slot.name || (isBreak ? 'Break' : 'Class');
                                                const palette = getSlotPalette(title);
                                                const durationMins = Math.max(0, parseTimeForSort(endStr) - parseTimeForSort(startStr));

                                                return (
                                                    <div
                                                        key={slot.id || slot._id || idx}
                                                        onClick={() => handleEditSlot(slot)}
                                                        className="group flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-5 cursor-pointer"
                                                    >
                                                        {/* Left Time Column */}
                                                        <div className="sm:w-[116px] shrink-0 flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-center gap-1 tabular-nums">
                                                            <span className={`text-xs font-extrabold leading-none ${status === 'active' ? 'text-primary' : 'text-on-surface'}`}>
                                                                {startStr}
                                                            </span>
                                                            <span className="text-[11px] font-medium text-on-surface-variant leading-none">
                                                                {endStr}{durationMins > 0 ? ` · ${durationMins}m` : ''}
                                                            </span>
                                                        </div>

                                                        {/* Center Timeline Node */}
                                                        <div className="hidden sm:flex items-center justify-center w-5 shrink-0 relative z-10">
                                                            <span className={`w-3 h-3 rounded-full ring-4 ring-surface transition-transform group-hover:scale-125 ${
                                                                status === 'active'
                                                                    ? 'bg-gradient-to-r from-indigo-500 to-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.85)]'
                                                                    : isBreak
                                                                    ? 'bg-on-surface-variant/40'
                                                                    : palette.bar
                                                            }`} />
                                                        </div>

                                                        {/* Right Chronological Session Row */}
                                                        <div
                                                            className={`relative flex-1 overflow-hidden rounded-2xl border px-4 py-3.5 pl-5 flex items-center justify-between gap-4 transition-all duration-150 ${
                                                                status === 'active'
                                                                    ? 'bg-gradient-to-r from-indigo-500/[0.14] via-violet-500/[0.08] to-cyan-500/[0.12] border-primary/40 shadow-sm'
                                                                    : isBreak
                                                                    ? 'bg-on-surface/[0.025] border-on-surface/[0.07] opacity-70 hover:opacity-100'
                                                                    : 'bg-on-surface/[0.025] dark:bg-white/[0.03] border-on-surface/[0.08] hover:border-primary/35 hover:bg-on-surface/[0.045]'
                                                            }`}
                                                        >
                                                            <span className={`absolute left-0 top-2.5 bottom-2.5 w-[3.5px] rounded-r-full ${isBreak ? 'bg-on-surface-variant/35' : palette.bar}`} />

                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <h3 className="font-display text-sm font-bold text-on-surface truncate">
                                                                        {title}
                                                                    </h3>
                                                                    {subject?.code && (
                                                                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-on-surface/[0.06] text-on-surface-variant">
                                                                            {subject.code}
                                                                        </span>
                                                                    )}
                                                                    {status === 'active' && (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-indigo-500 to-cyan-500 text-white">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                                                            Live
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2.5 mt-1 text-[11px] font-medium text-on-surface-variant">
                                                                    <span className="capitalize">{slot.type || 'Class'}</span>
                                                                    {slot.classroom && (
                                                                        <>
                                                                            <span className="opacity-35">·</span>
                                                                            <span className={`inline-flex items-center gap-1 font-semibold ${isBreak ? '' : palette.pill}`}>
                                                                                <MapPin size={10} />
                                                                                {slot.classroom.replace(/^room\s+/i, '')}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <span className="w-8 h-8 rounded-full bg-on-surface/[0.04] group-hover:bg-primary/14 text-on-surface-variant/50 group-hover:text-primary flex items-center justify-center transition-colors shrink-0">
                                                                <Edit3 size={13} />
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                </div>
            )}

            <AnimatePresence>
                {isSlotModalOpen && (
                    <SlotModal
                        isOpen={isSlotModalOpen}
                        onClose={() => setIsSlotModalOpen(false)}
                        onSuccess={fetchData}
                        slot={selectedSlot}
                        day={selectedDay}
                        period={selectedPeriod}
                        subjects={subjects}
                        semester={currentSemester}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isStructureModalOpen && (
                    <StructureModal
                        isOpen={isStructureModalOpen}
                        onClose={() => setIsStructureModalOpen(false)}
                        onSuccess={fetchData}
                        currentPeriods={periods}
                        semester={currentSemester}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isQrModalOpen && (
                    <TimetableQrModal
                        isOpen={isQrModalOpen}
                        onClose={() => setIsQrModalOpen(false)}
                        onImported={fetchData}
                        semester={currentSemester}
                        periods={periods}
                        schedule={timetable}
                        subjects={subjects}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default TimeTable;
