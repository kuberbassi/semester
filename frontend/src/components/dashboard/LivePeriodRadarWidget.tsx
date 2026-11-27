import React, { useState, useEffect } from 'react';
import { Check, X, MapPin, Clock, ArrowUpRight, CalendarOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { haptics } from '@/utils/haptics';
import type { TimetableSlot, Subject } from '@/types';

interface LivePeriodRadarWidgetProps {
    slots: TimetableSlot[];
    subjects: Subject[];
    onMarkAttendance: (subjectId: string, status: 'present' | 'absent') => void;
}

function formatRoom(raw?: string): string {
    if (!raw) return '';
    return raw.replace(/^room\s+/i, '').trim();
}

function parseTimeToMinutes(tStr: string): number {
    if (!tStr) return 0;
    const match = tStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return 0;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
}

export const LivePeriodRadarWidget: React.FC<LivePeriodRadarWidgetProps> = ({
    slots,
    subjects,
    onMarkAttendance,
}) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 30000);
        return () => clearInterval(interval);
    }, []);

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    return (
        <div className="liquid-glass rounded-[26px] p-5 sm:p-6 flex flex-col justify-between h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-65" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gradient-to-r from-indigo-500 to-cyan-400" />
                    </span>
                    <h3 className="font-display text-base font-extrabold tracking-tight text-on-surface">
                        Today&apos;s Radar
                    </h3>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full tabular-nums">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <Link
                        to="/timetable"
                        className="no-fluid w-7 h-7 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary flex items-center justify-center transition-colors"
                        title="Open Timetable"
                    >
                        <ArrowUpRight size={14} />
                    </Link>
                </div>
            </div>

            {!slots || slots.length === 0 ? (
                <div className="flex-1 py-12 flex flex-col items-center justify-center gap-2 text-center">
                    <CalendarOff size={22} className="text-on-surface-variant/40" />
                    <p className="text-xs font-medium text-on-surface-variant/65">No classes scheduled today</p>
                </div>
            ) : (
                <div className="relative flex-1 space-y-3">
                    <div
                        className="pointer-events-none absolute left-[11px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-indigo-500/45 via-cyan-400/35 to-transparent rounded-full"
                        aria-hidden="true"
                    />

                    {slots.map((slot, idx) => {
                        const startMin = parseTimeToMinutes(slot.start_time || '');
                        const endMin = parseTimeToMinutes(slot.end_time || '');
                        const duration = Math.max(1, endMin - startMin);
                        const isActive = currentMinutes >= startMin && currentMinutes < endMin;
                        const isPast = currentMinutes >= endMin;
                        const remainingMin = isActive ? endMin - currentMinutes : null;
                        const elapsedPct = isActive
                            ? Math.min(100, Math.max(4, ((currentMinutes - startMin) / duration) * 100))
                            : 0;

                        const matchedSubject = subjects.find(
                            (s) => (s._id || s.id) === slot.subject_id || s.name === slot.subject_name
                        );
                        const matchedSubjectId = matchedSubject ? (matchedSubject._id || matchedSubject.id) : undefined;
                        const roomLabel = formatRoom(slot.classroom);

                        return (
                            <div key={slot.id || idx} className="relative pl-7">
                                <span
                                    className={`absolute left-[7px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full ring-4 ring-background transition-colors ${
                                        isActive
                                            ? 'bg-gradient-to-r from-indigo-500 to-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.85)]'
                                            : isPast
                                            ? 'bg-on-surface/20'
                                            : 'bg-primary/50'
                                    }`}
                                />

                                <div
                                    className={`relative overflow-hidden rounded-2xl border px-4 py-3 transition-colors ${
                                        isActive
                                            ? 'bg-gradient-to-r from-indigo-500/[0.13] via-violet-500/[0.09] to-cyan-500/[0.12] border-primary/35 shadow-[0_10px_28px_-14px_rgba(99,102,241,0.45)]'
                                            : isPast
                                            ? 'bg-on-surface/[0.025] border-on-surface/[0.06] opacity-50'
                                            : 'bg-surface/65 dark:bg-white/[0.035] border-primary/12 hover:border-primary/28'
                                    }`}
                                >
                                    {isActive && (
                                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-primary/15">
                                            <div
                                                className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 transition-all duration-700"
                                                style={{ width: `${elapsedPct}%` }}
                                            />
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-[13px] font-bold text-on-surface truncate">
                                                {slot.subject_name || matchedSubject?.name || slot.label || (slot.type?.toLowerCase() === 'break' ? 'Break' : 'Class')}
                                            </h4>
                                            <div className="flex items-center gap-3 mt-0.5 text-[11px] font-medium text-on-surface-variant tabular-nums">
                                                <span>{slot.start_time} – {slot.end_time}</span>
                                                {roomLabel && (
                                                    <span className="inline-flex items-center gap-1 truncate">
                                                        <MapPin size={10} className="shrink-0 text-primary/70" />
                                                        {roomLabel}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {isActive && remainingMin !== null && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-gradient-to-r from-indigo-500 to-cyan-500 px-2.5 py-0.5 rounded-full tabular-nums shadow-sm">
                                                    <Clock size={10} />
                                                    {remainingMin}m
                                                </span>
                                            )}

                                            {matchedSubjectId && !isPast && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            haptics.crownTick();
                                                            onMarkAttendance(matchedSubjectId, 'present');
                                                        }}
                                                        className="no-fluid w-7 h-7 rounded-full bg-indigo-500/15 hover:bg-indigo-500 hover:text-white border border-indigo-500/30 text-indigo-600 dark:text-cyan-300 flex items-center justify-center transition-colors cursor-pointer"
                                                        title="Mark Present"
                                                    >
                                                        <Check size={13} strokeWidth={2.5} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            haptics.selection();
                                                            onMarkAttendance(matchedSubjectId, 'absent');
                                                        }}
                                                        className="no-fluid w-7 h-7 rounded-full bg-rose-500/15 hover:bg-rose-500 hover:text-white border border-rose-500/30 text-rose-500 dark:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                                                        title="Mark Absent"
                                                    >
                                                        <X size={13} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
