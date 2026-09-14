import React, { useState, useEffect } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AttendanceModal from '@/components/modals/AttendanceModal';
import { formatLocalDate } from '@/lib/date';
import { attendanceService } from '@/services/attendance.service';
import { useSemester } from '@/contexts/semester-context';
import { useToast } from '@/components/ui/toast-context';
import type { AttendanceRecord } from '@/types';

const CALENDAR_STATUS_STYLES: Record<string, { label: string; dot: string }> = {
    present: { label: 'Present', dot: 'bg-on-surface' },
    absent: { label: 'Absent', dot: 'bg-red-500' },
    medical: { label: 'Medical Leave', dot: 'bg-blue-500' },
    approved_medical: { label: 'Medical Leave', dot: 'bg-blue-500' },
    cancelled: { label: 'Cancelled', dot: 'bg-slate-400' },
    substituted: { label: 'Substitution', dot: 'bg-violet-500' },
};

const Calendar: React.FC = () => {
    const { showToast } = useToast();
    const { currentSemester } = useSemester();
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord[]>>({});
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
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

    const getAttendanceForDate = (date: Date) => {
        return attendanceData[formatLocalDate(date)] || [];
    };

    const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));

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

    return (
        <div className="max-w-4xl mx-auto pb-24 select-none">
            {/* Page Header */}
            <div className="mb-8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">
                    Attendance / Calendar
                </p>
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-on-surface tracking-tight">
                        {currentDate.toLocaleString('default', { month: 'long' })} {currentDate.getFullYear()}
                    </h1>
                    <div className="flex items-center gap-1.5">
                        <button onClick={handlePrevMonth} className="w-8 h-8 rounded-md border border-outline/60 bg-surface flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                            <ChevronLeft size={14} />
                        </button>
                        <button onClick={handleNextMonth} className="w-8 h-8 rounded-md border border-outline/60 bg-surface flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
                <div className="mt-4 h-px bg-outline/30" />
            </div>

            {loading ? (
                /* Non-blocking Skeleton Grid */
                <div className="border border-outline/50 bg-surface rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                    <div className="grid grid-cols-7 gap-2">
                        {weekDays.map(d => (
                            <div key={d} className="h-6 bg-surface-container-high rounded animate-pulse" />
                        ))}
                        {Array.from({ length: 35 }).map((_, i) => (
                            <div key={i} className="aspect-square bg-surface-container-high border border-outline/40 rounded animate-pulse" />
                        ))}
                    </div>
                </div>
            ) : (
                /* Calendar Grid */
                <div className="rounded-xl border border-outline/50 bg-surface p-6 relative overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 mb-4">
                        {weekDays.map(day => (
                            <div key={day} className="text-center text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest py-1.5">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                        {/* Empty Slots */}
                        {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square border border-transparent" />
                        ))}

                        {/* Days */}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const date = new Date(year, month, day);
                            const attendance = getAttendanceForDate(date);
                            const isToday = new Date().toDateString() === date.toDateString();
                            const total = attendance.length;

                            return (
                                <button
                                    key={day}
                                    onClick={() => handleDayClick(day)}
                                    className={`aspect-square rounded-md border p-1 md:p-2 relative flex flex-col items-center justify-center transition-all ${isToday
                                        ? 'bg-on-surface/5 border-on-surface font-bold shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                                        : total > 0
                                            ? 'bg-surface-container/60 border-outline/50 hover:bg-surface-container-high hover:border-on-surface'
                                            : 'bg-transparent border-outline/25 hover:bg-surface-container/40 hover:border-on-surface'
                                        }`}
                                >
                                    <span className={`text-xs sm:text-sm md:text-base font-bold ${isToday ? 'text-on-surface' : 'text-on-surface-variant/80'} leading-none ${total > 0 ? 'mb-1.5' : ''}`}>
                                        {day}
                                    </span>

                                    {total > 0 && (
                                        <div className="absolute bottom-1 left-1 right-1 flex justify-center gap-0.5 h-1 overflow-hidden">
                                            {attendance.slice(0, 6).map((record, idx) => (
                                                <div
                                                    key={`${record.status}-${idx}`}
                                                    className={`w-1 h-1 shrink-0 rounded-full ${CALENDAR_STATUS_STYLES[record.status]?.dot || 'bg-orange-500'}`}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-8 pt-5 border-t border-outline/30 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
                        {Object.entries(CALENDAR_STATUS_STYLES)
                            .filter(([status]) => status !== 'medical')
                            .map(([status, style]) => (
                                <div key={status} className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                                    <span>{style.label}</span>
                                </div>
                            ))}
                        <div className="flex items-center gap-2">
                            <div className="px-2 py-0.5 rounded border border-on-surface/50 text-[8px] font-black">Today</div>
                        </div>
                    </div>
                </div>
            )}

            <AttendanceModal
                isOpen={isMarkModalOpen}
                onClose={() => setIsMarkModalOpen(false)}
                defaultDate={selectedDate || new Date()}
                onSuccess={() => loadData(false)}
                onLogsUpdate={handleLogsUpdate}
            />
        </div>
    );
};

export default Calendar;

