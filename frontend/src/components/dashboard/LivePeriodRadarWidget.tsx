import React, { useState, useEffect } from 'react';
import { Check, X, MapPin } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import type { TimetableSlot, Subject } from '@/types';

interface LivePeriodRadarWidgetProps {
    slots: TimetableSlot[];
    subjects: Subject[];
    onMarkAttendance: (subjectId: string, status: 'present' | 'absent') => void;
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

    if (!slots || slots.length === 0) {
        return (
            <div className="rounded-xl border border-outline/50 bg-surface p-5 text-center">
                <p className="text-xs text-on-surface-variant/50">No classes scheduled for today 🎉</p>
            </div>
        );
    }

    // Determine current active slot based on local time
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    const parseTimeToMinutes = (tStr: string) => {
        if (!tStr) return 0;
        const match = tStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (!match) return 0;
        let hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const ampm = match[3]?.toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return hours * 60 + mins;
    };

    return (
        <div className="rounded-xl border border-outline/50 bg-surface p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:border-on-surface/20 transition-all">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                    </span>
                    <h3 className="text-sm font-bold text-on-surface">Live Period Radar</h3>
                </div>
                <span className="text-[11px] font-mono text-on-surface-variant/50">
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            <div className="space-y-3">
                {slots.map((slot, idx) => {
                    const startMin = parseTimeToMinutes(slot.start_time || '');
                    const endMin = parseTimeToMinutes(slot.end_time || '');
                    const isActive = currentMinutes >= startMin && currentMinutes < endMin;
                    const isPast = currentMinutes >= endMin;
                    const remainingMin = isActive ? endMin - currentMinutes : null;

                    const matchedSubject = subjects.find(
                        (s) => (s._id || s.id) === slot.subject_id || s.name === slot.subject_name
                    );
                    const matchedSubjectId = matchedSubject ? (matchedSubject._id || matchedSubject.id) : undefined;

                    return (
                        <div
                            key={slot.id || idx}
                            className={`rounded-xl border p-3.5 transition-all ${
                                isActive
                                    ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.12)]'
                                    : isPast
                                    ? 'border-outline/20 bg-surface-container/10 opacity-50'
                                    : 'border-outline/40 bg-surface-container/20'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {/* Beacon Icon */}
                                    <div className="relative">
                                        <div
                                            className={`w-2.5 h-2.5 rounded-full ${
                                                isActive
                                                    ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]'
                                                    : isPast
                                                    ? 'bg-zinc-500'
                                                    : 'bg-blue-500'
                                            }`}
                                        />
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-bold text-on-surface">{slot.subject_name || slot.label || 'Lecture'}</h4>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-on-surface-variant/50">
                                            <span>{slot.start_time} - {slot.end_time}</span>
                                            {slot.classroom && (
                                                <span className="flex items-center gap-0.5">
                                                    <MapPin size={10} /> Room {slot.classroom}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Active countdown chip or 1-tap actions */}
                                {isActive && (
                                    <div className="flex items-center gap-2">
                                        {remainingMin !== null && (
                                            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                                ⏱️ {remainingMin}m left
                                            </span>
                                        )}

                                        {matchedSubjectId && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => {
                                                        haptics.tick();
                                                        onMarkAttendance(matchedSubjectId, 'present');
                                                    }}
                                                    className="p-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 transition-colors cursor-pointer"
                                                    title="Mark Present"
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        haptics.selection();
                                                        onMarkAttendance(matchedSubjectId, 'absent');
                                                    }}
                                                    className="p-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors cursor-pointer"
                                                    title="Mark Absent"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
