import React, { useState, useEffect, useMemo } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, XCircle, Activity, Edit3 } from 'lucide-react';
import AttendanceModal from '@/components/modals/AttendanceModal';
import { formatLocalDate } from '@/lib/date';
import { attendanceService } from '@/services/attendance.service';
import PageHeader from '@/components/ui/PageHeader';
import { useSemester } from '@/contexts/semester-context';
import { useToast } from '@/components/ui/toast-context';
import type { AttendanceRecord } from '@/types';

const CALENDAR_STATUS_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
    present: { label: 'Present', dot: 'bg-indigo-500 dark:bg-cyan-400', badge: 'bg-indigo-500/14 text-indigo-600 dark:text-cyan-300 border-indigo-500/25' },
    absent: { label: 'Absent', dot: 'bg-rose-500', badge: 'bg-rose-500/14 text-rose-600 dark:text-rose-300 border-rose-500/25' },
    medical: { label: 'Medical', dot: 'bg-sky-500', badge: 'bg-sky-500/14 text-sky-600 dark:text-sky-300 border-sky-500/25' },
    approved_medical: { label: 'Medical', dot: 'bg-sky-500', badge: 'bg-sky-500/14 text-sky-600 dark:text-sky-300 border-sky-500/25' },
    cancelled: { label: 'Cancelled', dot: 'bg-on-surface-variant/45', badge: 'bg-on-surface/[0.06] text-on-surface-variant border-on-surface/[0.12]' },
    substituted: { label: 'Substitution', dot: 'bg-amber-500', badge: 'bg-amber-500/14 text-amber-600 dark:text-amber-300 border-amber-500/25' },
};

const Calendar: React.FC = () => {
    const { showToast } = useToast();
    const { currentSemester } = useSemester();
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord[]>>({});
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
    const fetchToken = React.useRef(0);

    usePageMeta({
        title: 'Calendar | Semester',
        description: 'View and mark your daily attendance on a calendar. Log present, absent, or cancelled classes.',
    });

    const loadData = React.useCallback(async (showLoading = true) => {
        const token = ++fetchToken.current;
        try {
            if (showLoading) setLoading(true);
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;
            const calendarData = await attendanceService.getCalendarData(year, month, currentSemester);

            if (token !== fetchToken.current) return;

            const dataMap: Record<string, AttendanceRecord[]> = {};
            if (Array.isArray(calendarData)) {
                calendarData.forEach((log: AttendanceRecord) => {
                    const date = log.date;
                    if (!dataMap[date]) dataMap[date] = [];
                    dataMap[date].push(log);
                });
            }
            setAttendanceData(dataMap);
        } catch (error) {
            console.error(error);
            showToast('error', 'Sync Failed');
        } finally {
            setLoading(false);
        }
    }, [currentDate, currentSemester, showToast]);

    useEffect(() => { void loadData(); }, [loadData]);

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        let startingDayOfWeek = firstDay.getDay() - 1;
        if (startingDayOfWeek === -1) startingDayOfWeek = 6;
        return { daysInMonth, startingDayOfWeek, year, month };
    };

    const getAttendanceForDate = (date: Date) => attendanceData[formatLocalDate(date)] || [];

    const monthStats = useMemo(() => {
        let present = 0;
        let absent = 0;
        let other = 0;
        Object.values(attendanceData).forEach((logs) => {
            logs.forEach((log) => {
                if (log.status === 'present') present++;
                else if (log.status === 'absent') absent++;
                else other++;
            });
        });
        const denom = present + absent;
        const rate = denom > 0 ? Math.round((present / denom) * 100) : 0;
        return { present, absent, other, rate };
    }, [attendanceData]);

    const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    const handleToday = () => {
        const now = new Date();
        setCurrentDate(now);
        setSelectedDate(now);
    };

    const handleDayClick = (day: number) => {
        const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        setSelectedDate(clickedDate);
        setIsMarkModalOpen(true);
    };

    const handleLogsUpdate = React.useCallback((dateStr: string, logs: AttendanceRecord[]) => {
        setAttendanceData(prev => ({ ...prev, [dateStr]: logs }));
    }, []);

    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const selectedLogs = getAttendanceForDate(selectedDate);

    return (
        <div className="w-full pb-12 select-none">
            <PageHeader
                title={`${currentDate.toLocaleString('default', { month: 'long' })} ${currentDate.getFullYear()}`}
                icon={CalendarDays}
                badge={`Sem ${currentSemester}`}
                actions={
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleToday}
                            data-tooltip="Jump to today's date"
                            className="no-fluid h-8 px-3.5 rounded-full bg-primary/12 border border-primary/25 text-xs font-bold text-primary hover:bg-primary hover:text-white transition-colors cursor-pointer"
                        >
                            Today
                        </button>
                        <button
                            onClick={handlePrevMonth}
                            aria-label="Previous month"
                            data-tooltip="Previous month"
                            className="no-fluid w-8 h-8 rounded-full bg-surface/80 dark:bg-white/[0.06] border border-primary/18 flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <button
                            onClick={handleNextMonth}
                            aria-label="Next month"
                            data-tooltip="Next month"
                            className="no-fluid w-8 h-8 rounded-full bg-surface/80 dark:bg-white/[0.06] border border-primary/18 flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left 8 cols: Interactive Calendar Grid */}
                <div className="lg:col-span-8">
                    {loading ? (
                        <div className="liquid-glass rounded-[26px] p-6">
                            <div className="grid grid-cols-7 gap-2.5">
                                {weekDays.map(d => (
                                    <div key={d} className="h-6 bg-primary/10 rounded-lg animate-pulse" />
                                ))}
                                {Array.from({ length: 35 }).map((_, i) => (
                                    <div key={i} className="aspect-square bg-on-surface/[0.05] rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="liquid-glass rounded-[26px] p-5 sm:p-6">
                            <div className="grid grid-cols-7 mb-3">
                                {weekDays.map(day => (
                                    <div key={day} className="text-center text-[11px] font-bold text-on-surface-variant/65 uppercase tracking-[0.12em] py-1.5">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-2 sm:gap-2.5">
                                {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                                    <div key={`empty-${i}`} className="aspect-square" />
                                ))}

                                {Array.from({ length: daysInMonth }).map((_, i) => {
                                    const day = i + 1;
                                    const date = new Date(year, month, day);
                                    const attendance = getAttendanceForDate(date);
                                    const isToday = new Date().toDateString() === date.toDateString();
                                    const isSelected = selectedDate.toDateString() === date.toDateString();
                                    const total = attendance.length;

                                    return (
                                        <button
                                            key={day}
                                            onClick={() => handleDayClick(day)}
                                            data-tooltip={
                                                total > 0
                                                    ? `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${total} ${total === 1 ? 'record' : 'records'} — Click to edit`
                                                    : `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — Click to mark attendance`
                                            }
                                            className={`no-fluid aspect-square rounded-2xl border p-1.5 relative flex flex-col items-center justify-center transition-all cursor-pointer ${
                                                isSelected
                                                    ? 'bg-gradient-to-br from-indigo-500/20 via-violet-500/15 to-cyan-500/20 border-primary ring-2 ring-primary/25 shadow-sm'
                                                    : isToday
                                                    ? 'bg-primary/12 border-primary/45'
                                                    : total > 0
                                                    ? 'bg-surface/75 dark:bg-white/[0.045] border-primary/14 hover:border-primary/35'
                                                    : 'bg-on-surface/[0.015] border-on-surface/[0.06] hover:bg-primary/[0.05] hover:border-primary/20'
                                            }`}
                                        >
                                            <span
                                                className={`font-display text-sm sm:text-base font-bold tabular-nums leading-none ${
                                                    isSelected || isToday ? 'text-primary font-extrabold' : 'text-on-surface/85'
                                                } ${total > 0 ? 'mb-1.5' : ''}`}
                                            >
                                                {day}
                                            </span>

                                            {total > 0 && (
                                                <div className="absolute bottom-2 left-1 right-1 flex justify-center gap-1 h-1.5 overflow-hidden">
                                                    {attendance.slice(0, 5).map((record, idx) => (
                                                        <div
                                                            key={`${record.status}-${idx}`}
                                                            className={`w-1.5 h-1.5 shrink-0 rounded-full ${CALENDAR_STATUS_STYLES[record.status]?.dot || 'bg-amber-400'}`}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-6 pt-4 border-t border-primary/10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-semibold text-on-surface-variant">
                                {Object.entries(CALENDAR_STATUS_STYLES)
                                    .filter(([status]) => status !== 'medical')
                                    .map(([status, style]) => (
                                        <div key={status} className="flex items-center gap-1.5">
                                            <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                                            <span>{style.label}</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right 4 cols: Monthly Pulse + Live Selected Day Inspector */}
                <div className="lg:col-span-4 space-y-5">
                    <div className="liquid-hero-banner rounded-[24px] p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                                <Activity size={13} />
                                Month Pulse
                            </span>
                            <span className="font-display text-2xl font-extrabold gradient-text tabular-nums">
                                {monthStats.rate}%
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-on-surface/[0.09] overflow-hidden mb-4">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400"
                                style={{ width: `${monthStats.rate}%` }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="rounded-2xl bg-surface/75 dark:bg-white/[0.04] border border-primary/18 p-3 flex items-center gap-2.5">
                                <CheckCircle2 size={16} className="text-indigo-500 dark:text-cyan-400 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Present</p>
                                    <p className="font-display text-lg font-extrabold text-on-surface tabular-nums leading-none">{monthStats.present}</p>
                                </div>
                            </div>
                            <div className="rounded-2xl bg-surface/75 dark:bg-white/[0.04] border border-rose-500/20 p-3 flex items-center gap-2.5">
                                <XCircle size={16} className="text-rose-500 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Absent</p>
                                    <p className="font-display text-lg font-extrabold text-rose-500 dark:text-rose-400 tabular-nums leading-none">{monthStats.absent}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="liquid-glass rounded-[24px] p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-2 pb-3 border-b border-primary/10">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Selected Day</p>
                                <h3 className="font-display text-base font-extrabold text-on-surface">
                                    {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsMarkModalOpen(true)}
                                className="no-fluid h-8 px-3.5 rounded-full btn-gradient text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                                <Edit3 size={12} />
                                Mark Day
                            </button>
                        </div>

                        {selectedLogs.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-xs font-medium text-on-surface-variant/65">No attendance recorded for this date.</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[290px] overflow-y-auto custom-scrollbar pr-0.5">
                                {selectedLogs.map((log, idx) => {
                                    const meta = CALENDAR_STATUS_STYLES[log.status] || CALENDAR_STATUS_STYLES.cancelled;
                                    return (
                                        <div
                                            key={`${log._id || log.id || idx}`}
                                            className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl bg-on-surface/[0.03] border border-primary/10"
                                        >
                                            <span className="text-xs font-bold text-on-surface truncate">
                                                {log.subject_name || 'Class'}
                                            </span>
                                            <span className={`shrink-0 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${meta.badge}`}>
                                                {meta.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AttendanceModal
                isOpen={isMarkModalOpen}
                onClose={() => setIsMarkModalOpen(false)}
                defaultDate={selectedDate}
                onSuccess={() => loadData(false)}
                onLogsUpdate={handleLogsUpdate}
            />
        </div>
    );
};

export default Calendar;
