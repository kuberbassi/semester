import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/toast-context';
import { useSemester } from '@/contexts/semester-context';
import { attendanceService } from '@/services/attendance.service';
import api from '@/services/api';
import { formatLocalDate } from '@/lib/date';
import {
    Check, X, MoreHorizontal, Calendar as CalendarIcon, Trash2,
    ChevronLeft, ChevronRight, Stethoscope, Ban, ArrowLeftRight, CalendarCheck2
} from 'lucide-react';
import { useConfirm } from '@/contexts/confirm-context';
import { isTauriDesktop } from '@/utils/platform';
import { desktopDb } from '@/services/desktopDb';
import axios from 'axios';
import type { AttendanceRecord, ScheduledClass, Subject } from '@/types';

type SimpleAttendanceStatus = 'present' | 'absent';
type DetailAttendanceStatus = AttendanceRecord['status'];

interface AttendanceClass extends ScheduledClass {
    id?: string;
    subjectId?: string;
    subject_name?: string;
    isMerged?: boolean;
    originalClasses?: ScheduledClass[];
    startTime?: string;
}

interface GroupedAttendanceClass extends AttendanceClass {
    isMerged: boolean;
    originalClasses: ScheduledClass[];
    startTime: string;
}

const getApiErrorMessage = (error: unknown, fallback: string) =>
    axios.isAxiosError<{ error?: string }>(error) ? error.response?.data?.error || fallback : fallback;


interface AttendanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    // If provided, default to this date, otherwise today
    defaultDate?: Date;
    onSuccess?: () => void;
    onLogsUpdate?: (dateStr: string, logs: AttendanceRecord[]) => void;
}

const ATTENDANCE_STATUS_META: Record<string, { label: string; className: string }> = {
    present: { label: 'Present', className: 'bg-primary/14 text-primary border-primary/25' },
    absent: { label: 'Absent', className: 'bg-rose-500/12 text-rose-400 border-rose-500/25' },
    late: { label: 'Late', className: 'bg-amber-500/12 text-amber-400 border-amber-500/25' },
    medical: { label: 'Medical', className: 'bg-sky-500/12 text-sky-400 border-sky-500/25' },
    approved_medical: { label: 'Medical', className: 'bg-sky-500/12 text-sky-400 border-sky-500/25' },
    duty: { label: 'Duty', className: 'bg-sky-500/12 text-sky-400 border-sky-500/25' },
    cancelled: { label: 'Cancelled', className: 'bg-on-surface/[0.06] text-on-surface-variant border-on-surface/[0.12]' },
    substituted: { label: 'Substituted', className: 'bg-amber-500/12 text-amber-300 border-amber-500/25' },
};

const DETAIL_STATUS_OPTIONS: Array<{ id: DetailAttendanceStatus; label: string; shortLabel: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'present', label: 'Present', shortLabel: 'Present', icon: Check },
    { id: 'absent', label: 'Absent', shortLabel: 'Absent', icon: X },
    { id: 'approved_medical', label: 'Medical Leave', shortLabel: 'Medical', icon: Stethoscope },
    { id: 'cancelled', label: 'Cancelled', shortLabel: 'Cancelled', icon: Ban },
    { id: 'substituted', label: 'Substituted', shortLabel: 'Sub', icon: ArrowLeftRight },
];

const isDetailAttendanceStatus = (status: string): status is DetailAttendanceStatus =>
    status in ATTENDANCE_STATUS_META || status === 'excused';

const attendanceStatusMeta = (status: unknown) => ATTENDANCE_STATUS_META[String(status)] || {
    label: String(status || 'Pending').replaceAll('_', ' '),
    className: 'bg-surface-container text-on-surface-variant border-outline',
};

const AttendanceModal: React.FC<AttendanceModalProps> = ({ isOpen, onClose, defaultDate, onSuccess, onLogsUpdate }) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const { currentSemester } = useSemester();
    const [selectedDate, setSelectedDate] = useState<Date>(defaultDate || new Date());
    const [loading, setLoading] = useState(false);
    const [scheduledClasses, setScheduledClasses] = useState<ScheduledClass[]>([]);
    const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
    const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsError, setLogsError] = useState<string | null>(null);
    const [loadedLogsDate, setLoadedLogsDate] = useState<string | null>(null);
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const [isMarkAllOpen, setIsMarkAllOpen] = useState(false);
    const [isMarkingAll, setIsMarkingAll] = useState(false);
    const markAllRef = React.useRef<HTMLDivElement>(null);
    const classesRequestRef = React.useRef(0);
    const logsRequestRef = React.useRef(0);

    const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const debouncedOnSuccess = React.useCallback(() => {
        if (!onSuccess) return;
        if (isTauriDesktop()) {
            // Local SQLite writes finish in <1ms — update parent metrics immediately with zero artificial delay
            onSuccess();
            return;
        }
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            debounceTimer.current = null;
            onSuccess();
        }, 350);
    }, [onSuccess]);

    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
                debounceTimer.current = null;
                onSuccess?.();
            }
        };
    }, [onSuccess]);

    // Detailed marking state
    const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
    const [detailStatus, setDetailStatus] = useState<DetailAttendanceStatus>('present');
    const [detailNotes, setDetailNotes] = useState('');
    const [detailSubstitutedBy, setDetailSubstitutedBy] = useState<string>('');

    useEffect(() => {
        if (!isMarkAllOpen) return;
        const closeMenu = (event: MouseEvent) => {
            if (markAllRef.current && !markAllRef.current.contains(event.target as Node)) {
                setIsMarkAllOpen(false);
            }
        };
        document.addEventListener('mousedown', closeMenu);
        return () => document.removeEventListener('mousedown', closeMenu);
    }, [isMarkAllOpen]);

    // Instantly sync our local (optimistic & fetched) logs to the parent Calendar view
    useEffect(() => {
        if (onLogsUpdate && selectedDate && loadedLogsDate === formatLocalDate(selectedDate) && !logsLoading && !logsError) {
            const dateStr = formatLocalDate(selectedDate);
            onLogsUpdate(dateStr, attendanceLogs);
        }
    }, [attendanceLogs, selectedDate, loadedLogsDate, logsLoading, logsError, onLogsUpdate]);

    const loadClassesForDate = React.useCallback(async (date: Date, silent = false) => {
        const requestId = ++classesRequestRef.current;
        if (!silent) setLoading(true);
        try {
            // Fix timezone issue: Avoid toISOString() which shifts day for regions like India
            const dateStr = formatLocalDate(date);

            const [scheduled, subjects] = await Promise.all([
                attendanceService.getClassesForDate(dateStr, currentSemester),
                attendanceService.getSubjects(currentSemester)
            ]);
            if (requestId !== classesRequestRef.current) return null;
            setScheduledClasses(scheduled);
            setAllSubjects(subjects);
            return scheduled;
        } catch (error) {
            if (requestId !== classesRequestRef.current) return null;
            console.error(error);
            showToast('error', 'Failed to load classes');
            return null;
        } finally {
            if (!silent && requestId === classesRequestRef.current) setLoading(false);
        }
    }, [currentSemester, showToast]);

    const selectDate = (newDate: Date) => {
        if (!isNaN(newDate.getTime())) {
            setSelectedDate(newDate);
            setAttendanceLogs([]);
            setLoadedLogsDate(null);
            setLogsError(null);
            setExpandedSubjectId(null);
            setIsMarkAllOpen(false);
            loadClassesForDate(newDate);
            fetchAttendanceLogs(newDate, true);
        }
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        selectDate(new Date(`${e.target.value}T00:00:00`));
    };

    const stepDate = (deltaDays: number) => {
        const next = new Date(selectedDate);
        next.setDate(next.getDate() + deltaDays);
        selectDate(next);
    };

    const fetchAttendanceLogs = React.useCallback(async (date: Date, clearFirst = false): Promise<AttendanceRecord[] | null> => {
        const requestId = ++logsRequestRef.current;
        const dateStr = formatLocalDate(date);
        setLogsLoading(true);
        setLogsError(null);
        if (clearFirst) {
            setAttendanceLogs([]);
            setLoadedLogsDate(null);
        }
        try {
            if (isTauriDesktop()) {
                const logs = (await desktopDb.getLogsForDate(dateStr, currentSemester)) as AttendanceRecord[];
                if (requestId !== logsRequestRef.current) return null;
                setAttendanceLogs(logs);
                setLoadedLogsDate(dateStr);
                return logs;
            }
            const response = await api.get(`/api/attendance/logs?date=${dateStr}&limit=100&semester=${currentSemester}`);

            // Backend returns success_response({"logs": [...], ...}) 
            // So response.data.data is the payload we want
            const data = response.data.data;
            const logs = (Array.isArray(data.logs) ? data.logs : []) as AttendanceRecord[];
            if (requestId !== logsRequestRef.current) return null;
            setAttendanceLogs(logs);
            setLoadedLogsDate(dateStr);
            return logs;
        } catch (error) {
            if (requestId !== logsRequestRef.current) return null;
            console.error('Failed to fetch attendance logs:', error);
            setLogsError('Marked records could not be loaded. Check your connection and retry.');
            return null;
        } finally {
            if (requestId === logsRequestRef.current) setLogsLoading(false);
        }
    }, [currentSemester]);

    useEffect(() => {
        if (!isOpen) return;

        const initialDate = defaultDate || new Date();
        setSelectedDate(initialDate);
        setAttendanceLogs([]);
        setLoadedLogsDate(null);
        setLogsError(null);
        setExpandedSubjectId(null);
        setIsMarkAllOpen(false);
        void loadClassesForDate(initialDate);
        void fetchAttendanceLogs(initialDate, true);
    }, [isOpen, defaultDate, loadClassesForDate, fetchAttendanceLogs]);

    const reconcileSelectedDate = async () => {
        const [logs, classes] = await Promise.all([
            fetchAttendanceLogs(selectedDate),
            loadClassesForDate(selectedDate, true),
        ]);
        return logs !== null && classes !== null;
    };

    useEffect(() => {
        if (!isOpen || !logsError) return;

        const reloadAfterReconnect = () => {
            void fetchAttendanceLogs(selectedDate, true);
            void loadClassesForDate(selectedDate, true);
        };
        window.addEventListener('online', reloadAfterReconnect);
        return () => window.removeEventListener('online', reloadAfterReconnect);
    }, [isOpen, logsError, selectedDate, fetchAttendanceLogs, loadClassesForDate]);



    const applyOptimisticMark = (subject: ScheduledClass, status: SimpleAttendanceStatus, dateStr: string) => {
        const prevScheduled = [...scheduledClasses];
        const prevLogs = [...attendanceLogs];
        const subjectId = String(subject?._id || subject?.id || subject?.subject_id || '');
        const attendanceType = String(subject?.attendance_type || subject?.type || 'Lecture');
        const logId = String(subject?.log_id || `optimistic-${subjectId}-${dateStr}-${attendanceType}`);
        const subjectName = String(subject?.name || subject?.subject_name || 'Unknown Subject');

        setScheduledClasses((prev) => prev.map((row) => {
            const rowId = String(row?._id || row?.id || row?.subject_id || '');
            const rowAttendanceType = String(row?.attendance_type || row?.type || 'Lecture');
            if (rowId !== subjectId || rowAttendanceType !== attendanceType) return row;
            return {
                ...row,
                marked: true,
                marked_status: status,
                log_id: row?.log_id || logId,
            };
        }));

        setAttendanceLogs((prev) => {
            // Check by both log_id and subject_id to prevent duplicates on the same date
            const existingIndex = prev.findIndex((l) =>
                (subject?.log_id && String(l?._id || l?.id) === String(subject?.log_id)) ||
                (String(l?.subject_id) === subjectId && l?.date === dateStr && String(l?.type || '') === attendanceType)
            );
            if (existingIndex >= 0) {
                const next = [...prev];
                next[existingIndex] = { ...next[existingIndex], status };
                return next;
            }
            return [{
                _id: logId,
                subject_id: subjectId,
                subject_name: subjectName,
                date: dateStr,
                status,
                type: attendanceType,
            }, ...prev];
        });

        return { prevScheduled, prevLogs };
    };

    const deleteLog = async (logId: string, subjectId?: string) => {
        if (subjectId && processingIds.has(subjectId)) return;
        if (subjectId) setProcessingIds(prev => new Set(prev).add(subjectId));
        
        try {
            await attendanceService.deleteAttendance(logId);
            showToast('success', 'Log deleted');
            await Promise.all([
                fetchAttendanceLogs(selectedDate),
                loadClassesForDate(selectedDate, true),
            ]);
            if (onSuccess) onSuccess();
        } catch (error: unknown) {
            const reconciled = await reconcileSelectedDate();
            showToast(
                'error',
                reconciled
                    ? 'The delete response was not confirmed. Verified records were reloaded.'
                    : getApiErrorMessage(error, 'Delete could not be verified. Reconnect and retry loading.')
            );
        } finally {
            if (subjectId) {
                setProcessingIds(prev => {
                    const next = new Set(prev);
                    next.delete(subjectId);
                    return next;
                });
            }
        }
    };

    const markSimple = async (subject: ScheduledClass, status: SimpleAttendanceStatus) => {
        const subjectId = String(subject?._id || subject?.id || subject?.subject_id || '');
        if (processingIds.has(subjectId)) return;
        setProcessingIds(prev => new Set(prev).add(subjectId));
        const dateStr = formatLocalDate(selectedDate);
        const snapshot = applyOptimisticMark(subject, status, dateStr);
        try {
            let res;
            if (subject.log_id && !subject.log_id.startsWith('optimistic-')) {
                res = await attendanceService.editAttendance(subject.log_id, status, undefined, dateStr);
                showToast('success', `Updated to ${status}`);
            } else {
                res = await attendanceService.markAttendance(subjectId, status, dateStr, undefined, undefined, currentSemester, subject.attendance_type);
                if (res?.duplicate && res?.log?._id && res.log.status !== status) {
                    res = await attendanceService.editAttendance(String(res.log._id), status, undefined, dateStr);
                }
                showToast('success', `Marked ${status}`);
            }
            if (res?.log?._id) {
                const realId = String(res.log._id);
                setScheduledClasses(prev => prev.map(r => String(r._id) === subjectId && String(r.attendance_type) === String(subject.attendance_type) ? { ...r, log_id: realId, marked: true, marked_status: status } : r));
                setAttendanceLogs(prev => prev.map(l => (String(l.subject_id) === subjectId && l.date === dateStr && String(l.type) === String(subject.attendance_type)) ? { ...l, _id: realId, status } : l));
            }
            debouncedOnSuccess();
        } catch (error: unknown) {
            setScheduledClasses(snapshot.prevScheduled);
            setAttendanceLogs(snapshot.prevLogs);
            const reconciled = await reconcileSelectedDate();
            showToast(
                'error',
                reconciled
                    ? 'The mark response was not confirmed. Verified records were reloaded.'
                    : getApiErrorMessage(error, 'Mark could not be verified. Reconnect and retry loading.')
            );
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(subjectId);
                return next;
            });
        }
    };

    const markAllScheduled = async (status: 'present' | 'absent' | 'approved_medical' | 'cancelled') => {
        if (isMarkingAll || processingIds.size > 0 || scheduledClasses.length === 0) return;

        const dateStr = formatLocalDate(selectedDate);
        if (logsLoading || logsError || loadedLogsDate !== dateStr) {
            showToast('error', 'Wait for Marked Records to load before marking all');
            return;
        }

        const existingRecords = attendanceLogs.filter(log => log?.date === dateStr);
        if (existingRecords.length > 0) {
            setIsMarkAllOpen(false);
            showToast('error', 'Some records are already marked. Use Unmark all first, then bulk mark the date.');
            return;
        }

        setIsMarkAllOpen(false);
        setIsMarkingAll(true);
        const classes = groupConsecutiveClasses(scheduledClasses).map(subject =>
            subject.isMerged ? subject.originalClasses[0] : subject
        );

        try {
            const requestedClasses = classes.map(subject => ({
                subject_id: String(subject?._id || subject?.id || subject?.subject_id || ''),
                type: String(subject.attendance_type || subject.type || 'Lecture'),
            }));
            if (requestedClasses.some(subject => !subject.subject_id)) throw new Error('Scheduled class has no subject ID');

            const result = await attendanceService.markAllAttendance(requestedClasses, status, dateStr, currentSemester);
            if (result.marked_count !== requestedClasses.length) {
                throw new Error('Bulk response count did not match the requested classes');
            }

            // The mutation response is authoritative. Apply it directly instead
            // of immediately replacing the successful state with a possibly
            // stale GET response from an older in-flight request.
            const returnedLogs = Array.isArray(result.logs) ? result.logs : [];
            const logsByIdentity = new Map(returnedLogs.map(log => [
                `${String(log.subject_id)}::${String(log.type || 'Lecture')}`,
                log,
            ]));
            setScheduledClasses(prev => prev.map(subject => {
                const subjectId = String(subject?._id || subject?.id || subject?.subject_id || '');
                const attendanceType = String(subject.attendance_type || subject.type || 'Lecture');
                const log = logsByIdentity.get(`${subjectId}::${attendanceType}`);
                return log ? {
                    ...subject,
                    marked: true,
                    marked_status: status,
                    log_id: String(log._id || log.id),
                } : subject;
            }));
            if (returnedLogs.length > 0) {
                setAttendanceLogs(returnedLogs);
                setLoadedLogsDate(dateStr);
                setLogsError(null);
            }

            const label = status === 'approved_medical' ? 'medical leave' : status;
            showToast('success', `All scheduled classes marked ${label}`);
            debouncedOnSuccess();
        } catch (error: unknown) {
            const [refreshedLogs, refreshedClasses] = await Promise.all([
                fetchAttendanceLogs(selectedDate),
                loadClassesForDate(selectedDate, true),
            ]);
            const refreshedBlocks = refreshedClasses
                ? groupConsecutiveClasses(refreshedClasses).map(subject => subject.isMerged ? subject.originalClasses[0] : subject)
                : [];
            const wasApplied = Boolean(refreshedLogs && refreshedBlocks.length > 0
                && refreshedBlocks.every(subject => subject.marked_status === status));
            if (wasApplied) {
                const label = status === 'approved_medical' ? 'medical leave' : status;
                showToast('success', `All scheduled classes marked ${label}`);
                debouncedOnSuccess();
            } else {
                showToast('error', getApiErrorMessage(error, 'Failed to mark all classes'));
            }
        } finally {
            setIsMarkingAll(false);
        }
    };

    const unmarkAllScheduled = async () => {
        if (isMarkingAll || processingIds.size > 0) return;

        const dateStr = formatLocalDate(selectedDate);
        if (logsLoading || logsError || loadedLogsDate !== dateStr) {
            showToast('error', 'Wait for Marked Records to load before clearing');
            return;
        }
        const visibleLogs = attendanceLogs.filter(log => log?.date === dateStr);
        const logIds = [...new Set(visibleLogs
            .map(log => String(log?._id || log?.id || ''))
            .filter(logId => logId && !logId.startsWith('optimistic-')))];
        setIsMarkAllOpen(false);
        if (logIds.length === 0) {
            showToast('error', 'No marked records to clear for this date');
            return;
        }

        const isConfirmed = await confirm({
            title: 'Unmark All Attendance',
            message: `Clear all ${logIds.length} marked record${logIds.length === 1 ? '' : 's'} shown for ${dateStr}? This cannot affect another date.`,
        });
        if (!isConfirmed) return;

        setIsMarkingAll(true);
        try {
            await attendanceService.unmarkAttendanceLogs(logIds, dateStr, currentSemester);
            const [refreshedLogs] = await Promise.all([fetchAttendanceLogs(selectedDate), loadClassesForDate(selectedDate, true)]);
            if (!refreshedLogs) {
                showToast('error', 'Records were cleared, but the latest data could not be reloaded');
                return;
            }
            showToast('success', `Cleared all ${logIds.length} marked record${logIds.length === 1 ? '' : 's'}`);
            debouncedOnSuccess();
        } catch (error: unknown) {
            const [refreshedLogs] = await Promise.all([
                fetchAttendanceLogs(selectedDate),
                loadClassesForDate(selectedDate, true),
            ]);
            const remainingIds = new Set((refreshedLogs || []).map((log) => String(log?._id || log?.id || '')));
            const wasApplied = !!refreshedLogs && logIds.every(logId => !remainingIds.has(logId));
            if (wasApplied) {
                showToast('success', `Cleared all ${logIds.length} marked record${logIds.length === 1 ? '' : 's'}`);
                debouncedOnSuccess();
            } else {
                showToast('error', getApiErrorMessage(error, 'No records were cleared. Check your connection and retry.'));
            }
        } finally {
            setIsMarkingAll(false);
        }
    };

    const handleDelete = async (subject: ScheduledClass) => {
        const subjectId = String(subject?._id || subject?.id || subject?.subject_id || '');
        if (processingIds.has(subjectId)) return;
        if (!subject.log_id) {
            showToast('error', 'No attendance record found to delete.');
            return;
        }
        setProcessingIds(prev => new Set(prev).add(subjectId));
        const prevScheduled = [...scheduledClasses];
        const prevLogs = [...attendanceLogs];
        const logId = String(subject?.log_id || '');
        const attendanceType = String(subject?.attendance_type || subject?.type || 'Lecture');
        setScheduledClasses((prev) => prev.map((row) => {
            const rowId = String(row?._id || row?.id || row?.subject_id || '');
            const rowAttendanceType = String(row?.attendance_type || row?.type || 'Lecture');
            if (rowId !== subjectId || rowAttendanceType !== attendanceType) return row;
            return { ...row, marked: false, marked_status: 'pending', log_id: null };
        }));
        setAttendanceLogs((prev) => prev.filter((log) => String(log?._id || log?.id) !== logId));
        try {
            if (!logId.startsWith('optimistic-')) {
                await attendanceService.deleteAttendance(logId);
            }
            showToast('success', 'Attendance cleared');
            debouncedOnSuccess();
        } catch (error: unknown) {
            setScheduledClasses(prevScheduled);
            setAttendanceLogs(prevLogs);
            const reconciled = await reconcileSelectedDate();
            showToast(
                'error',
                reconciled
                    ? 'The clear response was not confirmed. Verified records were reloaded.'
                    : getApiErrorMessage(error, 'Clear could not be verified. Reconnect and retry loading.')
            );
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(subjectId);
                return next;
            });
        }
    };

    const submitDetailedMark = async (subject: ScheduledClass) => {
        const subjectId = String(subject?._id || subject?.id || subject?.subject_id || '');
        if (processingIds.has(subjectId)) return;
        
        try {
            const dateStr = formatLocalDate(selectedDate);
            // If substituted, ensure we selected a substitute subject
            if (detailStatus === 'substituted' && !detailSubstitutedBy) {
                showToast('error', 'Please select the substituting subject');
                return;
            }

            setProcessingIds(prev => new Set(prev).add(subjectId));
            const isSubstitution = detailStatus === 'substituted' || (subject.marked_status === 'substituted');

            let res;
            if (subject.log_id && !subject.log_id.startsWith('optimistic-') && !isSubstitution) {
                res = await attendanceService.editAttendance(subject.log_id, detailStatus, detailNotes, dateStr);
                showToast('success', 'Attendance updated');
            } else {
                if (subject.log_id && !subject.log_id.startsWith('optimistic-') && isSubstitution) {
                    await attendanceService.deleteAttendance(subject.log_id);
                }
                res = await attendanceService.markAttendance(
                    subjectId, detailStatus, dateStr, detailNotes,
                    detailStatus === 'substituted' ? detailSubstitutedBy : undefined, currentSemester, subject.attendance_type
                );
                if (res?.duplicate && res?.log?._id) {
                    const existingLogId = String(res.log._id);
                    if (detailStatus === 'substituted') {
                        await attendanceService.deleteAttendance(existingLogId);
                        res = await attendanceService.markAttendance(
                            subjectId, detailStatus, dateStr, detailNotes,
                            detailSubstitutedBy, currentSemester, subject.attendance_type
                        );
                    } else if (res.log.status !== detailStatus) {
                        res = await attendanceService.editAttendance(existingLogId, detailStatus, detailNotes, dateStr);
                    }
                }
                showToast('success', 'Attendance marked successfully');
            }

            if (res?.log?._id) {
                const realId = String(res.log._id);
                setScheduledClasses(prev => prev.map(r => String(r._id) === subjectId && String(r.attendance_type) === String(subject.attendance_type) ? { ...r, log_id: realId, marked: true, marked_status: detailStatus } : r));
                setAttendanceLogs(prev => {
                    const existingIndex = prev.findIndex((l) =>
                        (subject.log_id && String(l?._id || l?.id) === String(subject.log_id)) ||
                        (String(l.subject_id) === subjectId && l.date === dateStr && String(l.type) === String(subject.attendance_type))
                    );
                    if (existingIndex >= 0) {
                        const next = [...prev];
                        next[existingIndex] = { ...next[existingIndex], _id: realId, status: detailStatus };
                        return next;
                    }
                    return [{
                        _id: realId,
                        subject_id: subjectId,
                        subject_name: subject.name || subject.subject_name || 'Unknown Subject',
                        date: dateStr,
                        status: detailStatus,
                        type: String(subject?.attendance_type || subject?.type || 'Lecture'),
                    }, ...prev];
                });
            }

            setExpandedSubjectId(null);
            resetDetailForm();
            debouncedOnSuccess();
        } catch (error: unknown) {
            const reconciled = await reconcileSelectedDate();
            showToast(
                'error',
                reconciled
                    ? 'The update response was not confirmed. Verified records were reloaded.'
                    : getApiErrorMessage(error, 'Update could not be verified. Reconnect and retry loading.')
            );
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(subjectId);
                return next;
            });
        }
    };

    const resetDetailForm = () => {
        setDetailStatus('present');
        setDetailNotes('');
        setDetailSubstitutedBy('');
    };

    const openDetails = (subjectId: string, currentStatus?: string, currentNotes?: string) => {
        setExpandedSubjectId(subjectId);
        // Pre-fill if needed, mostly default
        setDetailStatus(currentStatus && isDetailAttendanceStatus(currentStatus) ? currentStatus : 'present');
        setDetailNotes(currentNotes || '');
        setDetailSubstitutedBy('');
    };

    const scheduledOrder = new Map<string, number>();
    groupConsecutiveClasses(scheduledClasses).forEach((row, idx) => {
        const sid = String(row?.subject_id || row?.subjectId || row?._id || row?.id || '');
        if (sid && !scheduledOrder.has(sid)) scheduledOrder.set(sid, idx);
    });
    const sortedAttendanceLogs = [...attendanceLogs].sort((a, b) => {
        const aSid = String(a?.subject_id || a?.subjectId || '');
        const bSid = String(b?.subject_id || b?.subjectId || '');
        const aOrder = scheduledOrder.has(aSid) ? (scheduledOrder.get(aSid) as number) : Number.MAX_SAFE_INTEGER;
        const bOrder = scheduledOrder.has(bSid) ? (scheduledOrder.get(bSid) as number) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aTs = String(a?.timestamp || '');
        const bTs = String(b?.timestamp || '');
        return aTs.localeCompare(bTs);
    });
    const selectedDateStr = formatLocalDate(selectedDate);
    const recordsReady = loadedLogsDate === selectedDateStr && !logsLoading && !logsError;
    const markedRecordsCount = attendanceLogs.filter(log =>
        recordsReady
        && log?.date === selectedDateStr
        && (log?._id || log?.id)
        && !String(log?._id || log?.id).startsWith('optimistic-')
    ).length;



    const isToday = formatLocalDate(selectedDate) === formatLocalDate(new Date());

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Mark Attendance"
            subtitle="Quick-log daily classes, medical leaves, or substitutions"
            icon={<CalendarCheck2 size={18} />}
            size="lg"
        >
            <div className="space-y-5">
                {/* Sleek Pill Date Navigator Bar */}
                <div className="flex items-center justify-between gap-2 p-2 rounded-2xl bg-on-surface/[0.035] dark:bg-white/[0.04] border border-on-surface/[0.09]">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <button
                            type="button"
                            onClick={() => stepDate(-1)}
                            title="Previous day"
                            className="no-fluid w-8 h-8 rounded-xl bg-on-surface/[0.05] hover:bg-primary/14 text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                        >
                            <ChevronLeft size={15} />
                        </button>

                        <label className="relative flex-1 min-w-0 flex items-center justify-center gap-2 h-8 px-3 rounded-xl hover:bg-on-surface/[0.06] transition-colors cursor-pointer">
                            <CalendarIcon size={14} className="text-primary shrink-0" />
                            <span className="font-display text-xs sm:text-sm font-bold text-on-surface truncate">
                                {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <input
                                type="date"
                                aria-label="Choose date"
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                value={formatLocalDate(selectedDate)}
                                onChange={handleDateChange}
                            />
                        </label>

                        <button
                            type="button"
                            onClick={() => stepDate(1)}
                            title="Next day"
                            className="no-fluid w-8 h-8 rounded-xl bg-on-surface/[0.05] hover:bg-primary/14 text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>

                    {!isToday && (
                        <button
                            type="button"
                            onClick={() => selectDate(new Date())}
                            className="no-fluid h-8 px-3 rounded-xl bg-primary/14 border border-primary/25 text-[11px] font-bold text-primary hover:bg-primary hover:text-white transition-colors shrink-0 cursor-pointer"
                        >
                            Today
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="py-10 flex justify-center">
                        <LoadingSpinner size="sm" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Scheduled List */}
                        <div>
                            <div className="h-7 mb-2.5 px-1 flex items-center justify-between">
                                <h3 className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-wider">Scheduled Classes</h3>
                                {(scheduledClasses.length > 0 || markedRecordsCount > 0) && (
                                    <div ref={markAllRef} className="relative h-7">
                                        <button
                                            type="button"
                                            onClick={() => setIsMarkAllOpen(open => !open)}
                                            disabled={isMarkingAll || processingIds.size > 0 || !recordsReady}
                                            aria-label="Mark all scheduled classes"
                                            aria-expanded={isMarkAllOpen}
                                            className="h-7 w-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high disabled:opacity-50 transition-colors cursor-pointer"
                                            title="Mark all scheduled classes"
                                        >
                                            {isMarkingAll ? <LoadingSpinner size="sm" /> : <MoreHorizontal size={15} />}
                                        </button>
                                        {isMarkAllOpen && (
                                            <div className="absolute right-0 top-8 z-[70] w-48 overflow-hidden rounded-2xl liquid-glass-overlay p-1.5">
                                                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/55">Mark all as</div>
                                                {markedRecordsCount > 0 && (
                                                    <p className="mx-1 mb-1 rounded-xl bg-amber-500/10 px-2.5 py-2 text-[10px] font-medium leading-relaxed text-amber-400">
                                                        Unmark existing {markedRecordsCount} record{markedRecordsCount === 1 ? '' : 's'} before bulk marking.
                                                    </p>
                                                )}
                                                {[
                                                    { status: 'present', label: 'Present', dot: 'bg-primary' },
                                                    { status: 'absent', label: 'Absent', dot: 'bg-rose-400' },
                                                    { status: 'approved_medical', label: 'Medical Leave', dot: 'bg-sky-400' },
                                                    { status: 'cancelled', label: 'Cancelled', dot: 'bg-on-surface-variant/40' },
                                                ].map(option => (
                                                    <button
                                                        key={option.status}
                                                        type="button"
                                                        onClick={() => markAllScheduled(option.status as 'present' | 'absent' | 'approved_medical' | 'cancelled')}
                                                        disabled={scheduledClasses.length === 0 || !recordsReady || markedRecordsCount > 0}
                                                        title={markedRecordsCount > 0 ? 'Use Unmark all before bulk marking again' : `Mark all as ${option.label}`}
                                                        className="no-fluid w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                                                    >
                                                        <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                                                        {option.label}
                                                    </button>
                                                ))}
                                                <div className="my-1 border-t border-on-surface/[0.08]" />
                                                <button
                                                    type="button"
                                                    onClick={unmarkAllScheduled}
                                                    disabled={!recordsReady || markedRecordsCount === 0}
                                                    className="no-fluid w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-rose-400 hover:bg-rose-500/12 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                                                >
                                                    <Trash2 size={13} />
                                                    Unmark all
                                                    {markedRecordsCount > 0 && <span className="ml-auto text-[10px] opacity-70">{markedRecordsCount}</span>}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {scheduledClasses.length > 0 ? (
                                <div
                                    className={`space-y-2 ${(isMarkingAll || !recordsReady) ? 'pointer-events-none opacity-60' : ''}`}
                                    aria-busy={isMarkingAll || !recordsReady}
                                >
                                    {groupConsecutiveClasses(scheduledClasses).map((subject, idx) => {
                                        const subId = subject._id;
                                        const rowId = `${subId}-${subject.attendance_type || idx}`;
                                        return (
                                            <SubjectRow
                                                key={`scheduled-${rowId}`}
                                                subject={subject}
                                                status={subject.marked_status}
                                                expanded={expandedSubjectId === rowId}
                                                onSimpleMark={(subj, status) => {
                                                    if (subject.isMerged) {
                                                        const primary = subject.originalClasses[0];
                                                        markSimple(primary, status);
                                                    } else {
                                                        markSimple(subj, status);
                                                    }
                                                }}
                                                onDelete={(subj) => {
                                                    const primary = subj.isMerged ? subj.originalClasses[0] : subj;
                                                    if (primary.log_id) {
                                                        handleDelete(primary);
                                                    } else {
                                                        showToast('error', 'No attendance record found to delete.');
                                                    }
                                                }}
                                                onOpenDetails={(_id: string, status: string) => openDetails(rowId, status, subject.notes)}
                                                onCloseDetails={() => setExpandedSubjectId(null)}
                                                detailStatus={detailStatus}
                                                setDetailStatus={setDetailStatus}
                                                detailNotes={detailNotes}
                                                setDetailNotes={setDetailNotes}
                                                detailSubstitutedBy={detailSubstitutedBy}
                                                setDetailSubstitutedBy={setDetailSubstitutedBy}
                                                allSubjects={allSubjects}
                                                onSubmitDetail={() => {
                                                    if (subject.isMerged) {
                                                        const primary = subject.originalClasses[0];
                                                        submitDetailedMark(primary);
                                                    } else {
                                                        submitDetailedMark(subject);
                                                    }
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs text-on-surface-variant/50 italic text-center py-4">No classes scheduled.</p>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-outline"></div>

                        {/* All Attendance Logs Section */}
                        <div>
                            <h3 className="text-[10px] font-bold text-on-surface-variant/50 mb-2.5 uppercase tracking-wider flex items-center gap-1.5 px-1">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                                Marked Records ({recordsReady ? sortedAttendanceLogs.length : '—'})
                            </h3>
                            {logsLoading ? (
                                <div className="flex items-center justify-center gap-2 py-6 text-xs text-on-surface-variant/50">
                                    <LoadingSpinner size="sm" />
                                    Loading marked records…
                                </div>
                            ) : logsError ? (
                                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-3 text-center">
                                    <p className="text-xs font-medium text-red-500">{logsError}</p>
                                    <button
                                        type="button"
                                        onClick={() => fetchAttendanceLogs(selectedDate, true)}
                                        className="mt-2 h-7 px-3 rounded-md border border-red-500/20 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/10 transition-colors"
                                    >
                                        Retry loading
                                    </button>
                                </div>
                            ) : recordsReady && sortedAttendanceLogs.length > 0 ? (
                                <div className="space-y-1.5">
                                    {sortedAttendanceLogs.map((log, idx) => {
                                        const logSubjectId = String(log.subject_id || '');
                                        const logSubject = allSubjects.find((s) => String(s._id || s.id) === logSubjectId);
                                        const statusMeta = attendanceStatusMeta(log.status);
                                        const logId = String(log._id || log.id || idx);

                                        return (
                                            <div
                                                key={`log-entry-${logId}-${idx}`}
                                                className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container/30 border border-outline"
                                            >
                                                <div className="flex-1 min-w-0 pr-2">
                                                    <div className="font-bold text-xs text-on-surface truncate">{log.subject_name || log.subject_info?.name || logSubject?.name || 'Unknown Subject'}</div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${statusMeta.className}`}>
                                                            {statusMeta.label}
                                                        </span>
                                                        {log.notes && (
                                                            <span className="text-[10px] text-on-surface-variant truncate">• {log.notes}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        const subName = log.subject_name || log.subject_info?.name || logSubject?.name || 'this subject';
                                                        const isConfirmed = await confirm({
                                                            title: 'Delete Attendance Entry',
                                                            message: `Delete this ${log.status} entry for ${subName}?`,
                                                        });
                                                        if (isConfirmed) {
                                                            deleteLog(logId, logSubjectId);
                                                        }
                                                    }}
                                                    className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-on-surface-variant hover:text-red-500 shrink-0 cursor-pointer"
                                                    title="Delete this log entry"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : recordsReady ? (
                                <div className="text-center py-6">
                                    <p className="text-xs text-on-surface-variant/40 italic">No attendance marked for this date</p>
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-xs text-on-surface-variant/40 italic">Waiting for verified records…</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

interface SubjectRowProps {
    subject: GroupedAttendanceClass;
    status: string;
    expanded: boolean;
    onSimpleMark: (subject: ScheduledClass, status: SimpleAttendanceStatus) => void;
    onDelete: (subject: GroupedAttendanceClass) => void;
    onOpenDetails: (id: string, status: string, notes?: string) => void;
    onCloseDetails: () => void;
    detailStatus: DetailAttendanceStatus;
    setDetailStatus: React.Dispatch<React.SetStateAction<DetailAttendanceStatus>>;
    detailNotes: string;
    setDetailNotes: React.Dispatch<React.SetStateAction<string>>;
    detailSubstitutedBy: string;
    setDetailSubstitutedBy: React.Dispatch<React.SetStateAction<string>>;
    allSubjects: Subject[];
    onSubmitDetail: () => void;
}

const SubjectRow = ({
    subject, status, expanded, onSimpleMark, onDelete, onOpenDetails, onCloseDetails,
    detailStatus, setDetailStatus, detailNotes, setDetailNotes, detailSubstitutedBy, setDetailSubstitutedBy, allSubjects, onSubmitDetail
}: SubjectRowProps) => {

    const isMarked = status && status !== 'pending';
    const statusMeta = attendanceStatusMeta(status);

    if (expanded) {
        return (
            <div className="rounded-2xl bg-on-surface/[0.03] dark:bg-white/[0.04] border border-primary/30 p-4 shadow-sm animate-fade-in">
                <div className="flex justify-between items-center mb-3.5 pb-2.5 border-b border-on-surface/[0.08]">
                    <div className="min-w-0 pr-2">
                        <h4 className="font-display font-bold text-on-surface text-sm truncate">{subject.name}</h4>
                        {subject.time && (
                            <p className="text-[11px] font-medium text-on-surface-variant mt-0.5">{subject.time}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onCloseDetails}
                        className="no-fluid w-7 h-7 rounded-full bg-on-surface/[0.06] hover:bg-on-surface/[0.14] text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="space-y-3.5">
                    {/* Balanced 5-Chip Segmented Status Selector */}
                    <div>
                        <label className="text-[10px] font-bold text-on-surface-variant/75 uppercase tracking-wider block mb-2">
                            Attendance Status
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                            {DETAIL_STATUS_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                const active = detailStatus === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setDetailStatus(opt.id)}
                                        className={`no-fluid px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                                            active
                                                ? `${attendanceStatusMeta(opt.id).className} shadow-xs`
                                                : 'bg-on-surface/[0.035] border-on-surface/[0.08] text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface'
                                        }`}
                                    >
                                        <Icon size={12} />
                                        <span className="truncate">{opt.shortLabel}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Substitution Dropdown */}
                    {detailStatus === 'substituted' && (() => {
                        const filteredSubjects = allSubjects.filter((s) => {
                            const sId = String(s._id || s.id);
                            const currentId = String(subject._id || subject.id);
                            return sId !== currentId;
                        });
                        const selectedSub = filteredSubjects.find((s) => {
                            const sId = String(s._id || s.id);
                            return sId === detailSubstitutedBy;
                        });
                        return (
                            <div className="animate-fade-in p-3 bg-on-surface/[0.035] rounded-2xl border border-on-surface/[0.09]">
                                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                                    Substituted By
                                </label>
                                <SubstitutionDropdown
                                    subjects={filteredSubjects}
                                    value={detailSubstitutedBy}
                                    selectedName={selectedSub?.name}
                                    onChange={setDetailSubstitutedBy}
                                />
                            </div>
                        );
                    })()}

                    {/* Notes */}
                    <div>
                        <label className="text-[10px] font-bold text-on-surface-variant/75 uppercase tracking-wider block mb-1.5">
                            Notes (Optional)
                        </label>
                        <textarea
                            className="w-full bg-on-surface/[0.04] border border-on-surface/[0.10] focus:border-primary rounded-xl px-3 py-2 text-xs resize-none text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none transition-all"
                            placeholder="Add reason or lecture details…"
                            rows={2}
                            value={detailNotes}
                            onChange={(e) => setDetailNotes(e.target.value)}
                        />
                    </div>

                    {/* Balanced Action Footer */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-on-surface/[0.08]">
                        <div>
                            {isMarked && (
                                <Button
                                    type="button"
                                    variant="text"
                                    size="sm"
                                    className="text-rose-500 hover:bg-rose-500/12 hover:text-rose-600"
                                    onClick={() => onDelete(subject)}
                                >
                                    Clear Mark
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="text" size="sm" onClick={onCloseDetails}>
                                Cancel
                            </Button>
                            <Button type="button" size="sm" onClick={onSubmitDetail}>
                                Save Mark
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Collapsed View
    return (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-on-surface/[0.03] dark:bg-white/[0.035] border border-on-surface/[0.08] hover:border-primary/30 transition-all group">
            <div className="min-w-0 pr-3">
                <span className="font-bold text-xs text-on-surface block truncate">{subject.name}</span>
                {subject.time && (
                    <span className="text-[10px] font-medium text-on-surface-variant/75 block">{subject.time}</span>
                )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                {!isMarked ? (
                    <>
                        <button
                            type="button"
                            onClick={() => onSimpleMark(subject, 'present')}
                            className="no-fluid h-7 w-7 rounded-full bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            title="Mark Present"
                        >
                            <Check size={13} strokeWidth={2.5} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onSimpleMark(subject, 'absent')}
                            className="no-fluid h-7 w-7 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            title="Mark Absent"
                        >
                            <X size={13} strokeWidth={2.5} />
                        </button>
                    </>
                ) : (
                    <div className="flex items-center gap-1.5 mr-0.5">
                        <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border font-bold ${statusMeta.className}`}>
                            {statusMeta.label}
                        </span>

                        <button
                            type="button"
                            onClick={() => onDelete(subject)}
                            className="no-fluid h-7 w-7 rounded-full text-on-surface-variant hover:text-rose-500 hover:bg-rose-500/12 flex items-center justify-center transition-colors cursor-pointer"
                            title="Delete/Clear"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => onOpenDetails(subject._id, status, subject.notes)}
                    className="no-fluid h-7 w-7 rounded-full bg-on-surface/[0.05] text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.12] flex items-center justify-center transition-colors cursor-pointer"
                    title="More options"
                >
                    <MoreHorizontal size={14} />
                </button>
            </div>
        </div>
    );
};

const parseTime = (timeStr: string) => {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return 0;
    const [, h, m, ampm] = match;
    let hours = parseInt(h, 10);
    const minutes = parseInt(m, 10);
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
};

const groupConsecutiveClasses = (classes: ScheduledClass[]): GroupedAttendanceClass[] => {
    if (!classes || classes.length === 0) return [];

    // Sort classes by starting time before grouping
    const sortedClasses = [...classes].sort((a, b) => {
        return parseTime(a.time) - parseTime(b.time);
    });

    const grouped: GroupedAttendanceClass[] = [];
    let currentGroup: GroupedAttendanceClass | null = null;

    sortedClasses.forEach((slot) => {
        const slotId = String(slot._id || slot.id || '');
        const subjectId = String(slot.subject_id || slot.subjectId || '');

        const currentGroupSubId = currentGroup ? String(currentGroup.subject_id || currentGroup.subjectId || '') : null;
        const hasSameAttendanceBlock = String(slot.attendance_type || '') === String(currentGroup?.attendance_type || '');

        // Merge Condition:
        // 1. Same Subject ID (if present)
        // 2. OR Same Name (Fallback if IDs missing/messy) - Strong signal for consecutive slots
        // 3. MUST be same Type
        const isSameSubject = (subjectId && currentGroupSubId && subjectId === currentGroupSubId) ||
            (slot.name === currentGroup?.name);

        if (currentGroup && isSameSubject && slot.type === currentGroup.type && hasSameAttendanceBlock) {
            // Merge
            currentGroup.originalClasses.push(slot);
            // Update time range
            if (slot.time && currentGroup.startTime) {
                const parts = slot.time.split(' - ');
                const end = parts[1] || parts[0];
                currentGroup.time = `${currentGroup.startTime} - ${end}`;
            }
            // Status Priority: Show first slot's status
            currentGroup.marked_status = currentGroup.originalClasses[0].marked_status;
            // Notes priority? First slot notes?
            currentGroup.notes = currentGroup.originalClasses[0].notes || currentGroup.notes; // Keep notes from first log

        } else {
            // New Group
            const timeParts = slot.time ? slot.time.split(' - ') : [];
            const startTime = timeParts[0] || '';

            currentGroup = {
                ...slot,
                _id: slotId,
                isMerged: true,
                originalClasses: [slot],
                startTime: startTime
            };
            grouped.push(currentGroup);
        }
    });

    return grouped.map(g => ({
        ...g,
        isMerged: g.originalClasses.length > 1,
    }));
};

const SubstitutionDropdown = ({ subjects, value, selectedName, onChange }: {
    subjects: Subject[];
    value: string;
    selectedName?: string;
    onChange: (val: string) => void;
}) => {
    const [open, setOpen] = useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="no-fluid w-full bg-on-surface/[0.04] border border-on-surface/[0.10] text-on-surface rounded-xl px-3.5 py-2 text-xs font-medium text-left flex items-center justify-between hover:border-primary/45 transition-colors cursor-pointer"
            >
                <span className={value ? 'text-on-surface' : 'text-on-surface-variant/45'}>{selectedName || 'Select Subject...'}</span>
                <svg className={`w-3.5 h-3.5 text-on-surface-variant/50 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {open && (
                <div className="absolute left-0 right-0 z-[60] mt-1.5 rounded-2xl liquid-glass-overlay p-1.5 max-h-[180px] overflow-y-auto custom-scrollbar space-y-0.5">
                    <button
                        type="button"
                        onClick={() => { onChange(''); setOpen(false); }}
                        className={`no-fluid w-full px-3 py-2 rounded-xl text-left text-xs font-medium transition-colors cursor-pointer ${!value ? 'bg-primary/14 text-primary font-semibold' : 'text-on-surface-variant hover:bg-on-surface/[0.07] hover:text-on-surface'}`}
                    >
                        Select Subject...
                    </button>
                    {subjects.map((s) => {
                        const sId = String(s._id || s.id);
                        const isSelected = sId === value;
                        return (
                            <button
                                key={`sub-drop-${sId}`}
                                type="button"
                                onClick={() => { onChange(sId); setOpen(false); }}
                                className={`no-fluid w-full px-3 py-2 rounded-xl text-left text-xs font-medium transition-colors cursor-pointer ${isSelected ? 'bg-primary/14 text-primary font-semibold' : 'text-on-surface-variant hover:bg-on-surface/[0.07] hover:text-on-surface'}`}
                            >
                                {s.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AttendanceModal;
