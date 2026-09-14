import React, { useCallback, useState, useEffect } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
    LayoutGrid, List, Plus, Edit3
} from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { attendanceService } from '@/services/attendance.service';
import api from '@/services/api';
import { useSemester } from '@/contexts/semester-context';
import { useToast } from '@/components/ui/toast-context';
import SlotModal from '@/components/modals/SlotModal';
import StructureModal from '@/components/modals/StructureModal';
import { motion, AnimatePresence } from 'framer-motion';
import type { GridPeriod, Subject, TimetableSchedule, TimetableSlot } from '@/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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

    if (subjectField && typeof subjectField === 'object') {
        const subObj = subjectField as Record<string, unknown>;
        const objId = normalizeId(subObj._id || subObj.id);
        if (objId) {
            const matchedByObjId = subjects.find((sub) => normalizeId(sub._id || sub.id) === objId);
            if (matchedByObjId) return matchedByObjId;
        }
        const objName = String(subObj.name || '').trim().toLowerCase();
        if (objName) {
            const matchedByObjName = subjects.find((sub) => String(sub?.name || '').trim().toLowerCase() === objName);
            if (matchedByObjName) return matchedByObjName;
        }
    }

    const slotLabel = String(
        slot?.label
        || slot?.subject_name
        || slot?.subjectName
        || slot?.name
        || subjectObject?.name
        || subjectObject?.code
        || ''
    ).trim().toLowerCase();
    if (!slotLabel || slotLabel === 'break' || slotLabel === 'lunch' || slotLabel === 'gap') return undefined;

    return subjects.find((sub) => {
        const subName = String(sub?.name || '').trim().toLowerCase();
        const subCode = String(sub?.code || '').trim().toLowerCase();
        
        if (subName === slotLabel || subCode === slotLabel) return true;
        
        const acronym = subName.split(/\s+/).map(w => w[0]).join('');
        if (acronym === slotLabel) return true;
        
        if (subName.includes(slotLabel)) return true;
        if (subCode && (subCode.includes(slotLabel) || slotLabel.includes(subCode))) return true;

        return false;
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
        const currentDay = daysOfWeek[now.getDay()];
        if (currentDay !== day) return 'other-day';

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = parseTimeForSort(startTime);
        const endMinutes = parseTimeForSort(endTime);

        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
            return 'active';
        } else if (currentMinutes > endMinutes) {
            return 'passed';
        } else {
            return 'upcoming';
        }
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
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const activeView = isMobile ? 'list' : view;

    const handleSetView = (v: 'grid' | 'list') => { setView(v); localStorage.setItem('Semester_timetable_view', v); api.post('/api/profile/preferences', { timetable_view: v }).catch(() => {}); };

    usePageMeta({
        title: 'Timetable | Semester',
        description: 'View and manage your weekly class schedule. Customize periods and subjects per semester.',
    });

    const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
    const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
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

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

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

    return (
        <div className="pb-32 sm:pb-24 max-w-[1400px] mx-auto">
            {/* Page Header */}
            <div className="mb-8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">
                    Schedule / Timetable
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Timetable</h1>
                        <p className="text-xs text-on-surface-variant/40 mt-0.5">Semester {currentSemester}</p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
                        {/* View toggle */}
                        <div className="hidden sm:flex border border-outline rounded-lg overflow-hidden">
                            <button
                                onClick={() => handleSetView('grid')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${view === 'grid' ? 'bg-on-surface text-surface' : 'text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface'}`}
                            >
                                <LayoutGrid size={13} /> Grid
                            </button>
                            <button
                                onClick={() => handleSetView('list')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all border-l border-outline cursor-pointer ${view === 'list' ? 'bg-on-surface text-surface' : 'text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface'}`}
                            >
                                <List size={13} /> List
                            </button>
                        </div>
                        <button
                            onClick={() => setIsStructureModalOpen(true)}
                            className="h-8 px-3 text-xs font-semibold rounded-lg border border-outline bg-surface text-on-surface hover:bg-surface-container transition-all cursor-pointer"
                        >
                            Edit Periods
                        </button>
                    </div>
                </div>
                <div className="mt-4 h-px bg-outline" />
            </div>

            {loading ? (
                <div className="flex justify-center py-40"><LoadingSpinner /></div>
            ) : activeView === 'grid' ? (
                <div className="pb-10">
                    <div className="overflow-x-auto w-full">
                        <div className="min-w-[750px] bg-surface border border-outline rounded-xl overflow-hidden">
                            <div className="grid grid-cols-[80px_repeat(5,_1fr)]">
                                <div className="h-12 flex items-center justify-center text-xs font-bold text-on-surface-variant/30 border-b border-r border-outline bg-surface-container"></div>
                                {DAYS.map(day => (
                                    <div key={day} className="h-12 flex items-center justify-center text-xs font-bold text-on-surface-variant/70 border-b border-r border-outline bg-surface-container last:border-r-0">{day.slice(0, 3)}</div>
                                ))}

                                {periods.map((period) => (
                                    <React.Fragment key={period.id}>
                                        <div className="flex flex-col justify-center items-center px-2 py-3 border-b border-r border-outline bg-surface-container-low text-center">
                                            <span className="text-on-surface font-bold text-[10px] leading-tight">{getPeriodName(period)}</span>
                                            <span className="text-[9px] font-medium text-on-surface-variant/50 mt-1 leading-none">{getPeriodStartTime(period)}</span>
                                        </div>
                                        {DAYS.map(day => {
                                            const daySlots = timetable[day] || [];
                                            const slot = daySlots.find((s) => normalizeTimeMatch(getSlotStartTime(s)) === normalizeTimeMatch(getPeriodStartTime(period)));
                                            const subject = slot ? findSubjectForSlot(subjects, slot) : undefined;
                                            const isBreak = slot?.type?.toLowerCase() === 'break';

                                            return (
                                                <div key={`${day}-${period.id}`} className="min-h-[80px] border-b border-r border-outline last:border-r-0 p-1 flex">
                                                    {slot ? (
                                                        <motion.div onClick={() => handleEditSlot(slot)} whileHover={{ scale: 1.01 }} className={`h-full w-full rounded-lg p-1.5 sm:p-2.5 flex flex-col justify-center items-center text-center cursor-pointer transition-all border ${isBreak ? 'bg-surface-container-low border-outline opacity-60 hover:opacity-100' : 'bg-surface hover:bg-surface-container border-outline'}`}>
                                                            <span className="text-[8px] font-semibold uppercase tracking-wider text-on-surface-variant/60">{slot.type}</span>
                                                            <span className="text-xs font-bold text-on-surface leading-tight mt-1">{subject?.name || slot.subject_name || slot.subjectName || slot.label || slot.name || (isBreak ? 'Break' : '—')}</span>
                                                            {slot.classroom && <span className="text-[9px] font-medium text-on-surface-variant/40 mt-1 leading-none">{slot.classroom}</span>}
                                                        </motion.div>
                                                    ) : (
                                                        <button onClick={() => handleAddSlot(day, period)} className="h-full w-full rounded-lg hover:bg-surface-container transition-all flex items-center justify-center group border border-dashed border-transparent hover:border-outline">
                                                            <Plus size={16} className="text-on-surface-variant/10 group-hover:text-on-surface-variant/40 transition-colors" />
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
                </div>
            ) : (
                <div className="space-y-12">
                    {DAYS.map(day => (
                        <div key={day} className="space-y-6">
                            <div className="flex items-center gap-4 px-2">
                                <h2 className="text-lg font-bold text-on-surface">{day}</h2>
                                <div className="h-px flex-1 bg-outline-variant" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {([...(timetable[day] || [])]).sort((a, b) => parseTimeForSort(getSlotStartTime(a)) - parseTimeForSort(getSlotStartTime(b))).map((slot, idx) => {
                                    const subject = findSubjectForSlot(subjects, slot);
                                    const status = getSlotStatus(day, getSlotStartTime(slot), getSlotEndTime(slot));
                                    let dotElement = null;

                                    if (status === 'active') {
                                        dotElement = (
                                            <span className="relative flex h-2 w-2" title="Active Now">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                        );
                                    } else if (status === 'upcoming') {
                                        dotElement = (
                                            <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" title="Upcoming Today" />
                                        );
                                    } else if (status === 'passed') {
                                        dotElement = (
                                            <span className="h-2 w-2 rounded-full bg-on-surface-variant/40 flex-shrink-0" title="Completed Today" />
                                        );
                                    } else {
                                        dotElement = (
                                            <span className="h-1.5 w-1.5 rounded-full bg-outline-variant flex-shrink-0" />
                                        );
                                    }

                                    return (
                                        <motion.div key={idx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }} onClick={() => handleEditSlot(slot)} className="p-3.5 rounded-xl border border-outline bg-surface flex items-center justify-between group hover:border-on-surface/20 transition-all cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-12 rounded-lg bg-surface-variant/60 border border-outline flex flex-col items-center justify-center shrink-0">
                                                    <span className="text-[9px] font-bold text-on-surface-variant/60 leading-none">{getSlotStartTime(slot)}</span>
                                                    <div className="w-3 h-px bg-outline-variant my-1" />
                                                    <span className="text-[9px] font-bold text-on-surface-variant/60 leading-none">{getSlotEndTime(slot)}</span>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        {dotElement}
                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60">{slot.type}</span>
                                                        {slot.classroom && (
                                                            <>
                                                                <span className="h-1 w-1 rounded-full bg-outline-variant" />
                                                                <span className="text-[9px] font-semibold text-on-surface-variant/50">{slot.classroom}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <h3 className="text-xs font-bold text-on-surface transition-colors">{subject?.name || slot.subject_name || slot.subjectName || slot.label || slot.name || (slot.type?.toLowerCase() === 'break' ? 'Break' : 'Class')}</h3>
                                                </div>
                                            </div>
                                            <Edit3 size={13} className="text-on-surface-variant/30 group-hover:text-on-surface transition-colors shrink-0" />
                                        </motion.div>
                                    );
                                })}
                                {(!timetable[day] || timetable[day].length === 0) && (
                                    <div className="col-span-full py-8 text-center rounded-xl border border-dashed border-outline bg-surface-container/30">
                                        <p className="text-xs font-semibold text-on-surface-variant/30">No classes scheduled</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
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
        </div>
    );
};

export default TimeTable;

