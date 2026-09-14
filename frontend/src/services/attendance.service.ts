import api from './api';
import type {
    DashboardData,
    ReportsData,
    Subject,
    TimetableSchedule,
    Preferences,
    SystemLog,
    AcademicRecord,
    AttendanceRecord,
    AttendanceMutationResult,
    ScheduledClass,
    GridPeriod,
    TimetableSlot,
    DayOfWeekAnalytics,
    NoticeItem,
    NotificationItem,
    ManualCourse,
    DriveBackup,
    DriveStatus,
    User,
    SemesterResult
} from '@/types';

type JsonObject = Record<string, unknown>;
type TimetablePayload = { schedule?: TimetableSchedule; periods?: GridPeriod[] };
import { formatLocalDate } from '@/lib/date';

const extractApiData = <T>(response: { data?: unknown }, fallback: T): T => {
    const body = response?.data;
    if (body && typeof body === 'object' && 'data' in body) {
        return (body.data ?? fallback) as T;
    }
    return (body ?? fallback) as T;
};

const CACHE_TTL_MS = 12_000;
const requestCache = new Map<string, { expiresAt: number; data: unknown }>();
const PERSISTENT_CACHE_PREFIX = 'zenith_cache:';
let systemLogsUsesLegacyApi = false;

const getPersistentCached = <T>(key: string): T | null => {
    try {
        const raw = localStorage.getItem(`${PERSISTENT_CACHE_PREFIX}${key}`);
        if (!raw) return null;
        const entry = JSON.parse(raw) as { expiresAt: number; data: T };
        if (!entry || Date.now() > entry.expiresAt) {
            localStorage.removeItem(`${PERSISTENT_CACHE_PREFIX}${key}`);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
};

const setPersistentCached = (key: string, data: unknown, ttlMs: number) => {
    try {
        localStorage.setItem(`${PERSISTENT_CACHE_PREFIX}${key}`, JSON.stringify({
            expiresAt: Date.now() + ttlMs,
            data,
        }));
    } catch {
        // ignore quota/storage failures
    }
};

const getCached = <T>(key: string): T | null => {
    const entry = requestCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        requestCache.delete(key);
        return null;
    }
    return entry.data as T;
};

const setCached = (key: string, data: unknown, ttlMs: number = CACHE_TTL_MS) => {
    requestCache.set(key, { expiresAt: Date.now() + ttlMs, data });
};

const getAnyCached = <T>(key: string): T | null => getCached<T>(key) ?? getPersistentCached<T>(key);

const setAnyCached = (key: string, data: unknown, ttlMs: number = CACHE_TTL_MS, persistentTtlMs?: number) => {
    setCached(key, data, ttlMs);
    if (persistentTtlMs && persistentTtlMs > 0) setPersistentCached(key, data, persistentTtlMs);
};

const clearCacheByPrefix = (prefix: string) => {
    for (const key of requestCache.keys()) {
        if (key.startsWith(prefix)) requestCache.delete(key);
    }
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith(`${PERSISTENT_CACHE_PREFIX}${prefix}`)) localStorage.removeItem(key);
        }
    } catch {
        // ignore storage access issues
    }
};

const clearDerivedCaches = () => {
    clearCacheByPrefix('dashboard:');
    clearCacheByPrefix('reports:');
    clearCacheByPrefix('notifications:');
    clearCacheByPrefix('analytics:');
    clearCacheByPrefix('subjects:');
    clearCacheByPrefix('timetable:');
    clearCacheByPrefix('manualCourses');
};

export const attendanceService = {
    // Preferences & Profile
    getPreferences: async (): Promise<Preferences> => {
        const response = await api.get('/api/profile/preferences');
        return response.data;
    },

    updatePreferences: async (data: Partial<Preferences>): Promise<void> => {
        await api.post('/api/profile/preferences', data);
    },

    uploadPfp: async (formData: FormData): Promise<{ url: string }> => {
        const response = await api.post('/api/profile/upload_pfp', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data.data;
    },

    // Dashboard
    getDashboardLocalCache: (semester: number = 1): DashboardData | null => {
        return getPersistentCached<DashboardData>(`dashboard:${semester}`);
    },

    getDashboardData: async (semester: number = 1, refresh = false): Promise<DashboardData> => {
        const cacheKey = `dashboard:${semester}`;
        if (!refresh) {
            const cached = getAnyCached<DashboardData>(cacheKey);
            if (cached) return cached;
        }
        const response = await api.get(`/api/dashboard/data?semester=${semester}${refresh ? '&refresh=1' : ''}`);
        const data = response.data.data;
        setAnyCached(cacheKey, data, 15_000, 24 * 60 * 60 * 1000); // 15s memory cache, 24h localStorage persistence
        return data;
    },

    getDashboardSummary: async (semester: number = 1) => {
        const response = await api.get(`/api/dashboard/data?semester=${semester}`);
        return response.data.data;
    },

    // Reports
    getReportsLocalCache: (semester: number = 1): ReportsData | null => {
        return getPersistentCached<ReportsData>(`reports:${semester}`);
    },

    getReportsData: async (semester: number = 1, refresh = false): Promise<ReportsData> => {
        const cacheKey = `reports:${semester}`;
        if (!refresh) {
            const cached = getAnyCached<ReportsData>(cacheKey);
            if (cached) return cached;
        }
        const response = await api.get(`/api/dashboard/reports_data?semester=${semester}${refresh ? '&refresh=1' : ''}`);
        const data = response.data.data;
        setAnyCached(cacheKey, data, 15_000, 24 * 60 * 60 * 1000); // 15s memory cache, 24h localStorage persistence
        return data;
    },

    // Attendance logs
    getAttendanceLogs: async (page: number = 1, limit: number = 15) => {
        const response = await api.get(`/api/attendance/logs?page=${page}&limit=${limit}`);
        return response.data.data;
    },

    // Mark attendance
    markAttendance: async (
        subjectId: string,
        status: string,
        date?: string,
        notes?: string,
        substitutedById?: string,
        semester?: number,
        type?: string
    ): Promise<AttendanceMutationResult> => {
        const res = await api.post('/api/attendance/mark', {
            subject_id: subjectId,
            status,
            date,
            notes,
            substituted_by: substitutedById,
            semester,
            type,
        });
        clearDerivedCaches();
        return res.data?.data;
    },

    markAllAttendance: async (
        classes: Array<{ subject_id: string; type: string }>,
        status: 'present' | 'absent' | 'approved_medical' | 'cancelled',
        date: string,
        semester: number
    ): Promise<{ marked_count: number; activity_id: string }> => {
        const response = await api.post('/api/attendance/mark-all', { classes, status, date, semester });
        clearDerivedCaches();
        return response.data.data;
    },

    unmarkAttendanceLogs: async (logIds: string[], date: string, semester: number): Promise<{ deleted_count: number; requested_count: number }> => {
        const response = await api.post('/api/attendance/unmark-all', {
            log_ids: logIds,
            date,
            semester,
        });
        clearDerivedCaches();
        return response.data.data;
    },

    getCalendarData: async (year: number, month: number, semester?: number): Promise<AttendanceRecord[]> => {
        const m = String(month).padStart(2, '0');
        const monthStr = `${year}-${m}`;
        const url = semester
            ? `/api/attendance/calendar_data?month=${monthStr}&semester=${semester}`
            : `/api/attendance/calendar_data?month=${monthStr}`;
        const response = await api.get(url);
        const data = response.data.data;

        // Node backend returns { calendar: { "YYYY-MM-DD": { logs, total, attended } }, start_date, end_date }
        // Calendar.tsx expects a flat array of log objects — normalise here
        if (data && typeof data === 'object' && !Array.isArray(data) && data.calendar) {
            const flatLogs: AttendanceRecord[] = [];
            for (const entry of Object.values(data.calendar as Record<string, { logs?: AttendanceRecord[] }>)) {
                if (Array.isArray(entry?.logs)) {
                    flatLogs.push(...entry.logs);
                }
            }
            return flatLogs;
        }

        // Legacy Flask format: flat array already
        return Array.isArray(data) ? data : [];
    },

    editAttendance: async (logId: string, status: string, notes?: string, date?: string): Promise<AttendanceMutationResult> => {
        const res = await api.put(`/api/attendance/logs/${logId}`, {
            status,
            notes,
            date
        });
        clearDerivedCaches();
        return res.data?.data;
    },

    deleteAttendance: async (logId: string): Promise<AttendanceMutationResult> => {
        const res = await api.delete(`/api/attendance/logs/${logId}`);
        clearDerivedCaches();
        return res.data?.data;
    },

    // Classes
    getTodaysClasses: async (): Promise<Subject[]> => {
        const response = await api.get('/api/attendance/classes-for-date?date=' + formatLocalDate());
        return response.data.data;
    },

    getClassesForDate: async (date: string, semester?: number): Promise<ScheduledClass[]> => {
        const url = semester ? `/api/attendance/classes-for-date?date=${date}&semester=${semester}` : `/api/attendance/classes-for-date?date=${date}`;
        const response = await api.get(url);
        const data = response.data.data;

        // Backend returns { classes: [{ slot, subject, log, marked }], extra_logs, ... }
        // AttendanceModal expects a flat array of objects with _id, subject_id, name, marked_status, log_id, time, type
        if (data && Array.isArray(data.classes)) {
            return data.classes.map((c: {
                subject?: Partial<Subject>;
                slot?: Partial<ScheduledClass> & { id?: string; start_time?: string; startTime?: string; end_time?: string; endTime?: string; label?: string };
                log?: AttendanceRecord | null;
                subject_name?: string;
                attendance_type?: string;
                marked?: boolean;
            }) => {
                const subj = c.subject || {};
                const slot = c.slot || {};
                const log = c.log || null;
                const subjId = subj._id || subj.id || slot.subject_id || '';
                return {
                    _id: String(subjId),
                    subject_id: String(subjId),
                    name: subj.name || slot.name || c.subject_name || slot.label || 'Unknown',
                    time: slot.time || ((slot.start_time || slot.startTime) ? `${slot.start_time || slot.startTime}${(slot.end_time || slot.endTime) ? ` - ${slot.end_time || slot.endTime}` : ''}` : ''),
                    type: slot.type || 'Lecture',
                    attendance_type: c.attendance_type || slot.type || 'Lecture',
                    slot_id: String(slot.id || slot._id || slot.start_time || slot.startTime || ''),
                    semester: subj.semester || slot.semester,
                    marked: c.marked || false,
                    marked_status: log ? log.status : 'pending',
                    log_id: log ? String(log._id || log.id) : null,
                    notes: log?.notes || '',
                    attended: subj.attended || 0,
                    total: subj.total || 0,
                };
            });
        }

        // Fallback: if already flat array (Flask format)
        return Array.isArray(data) ? data : [];
    },

    // Subjects
    getSubjects: async (semester: number = 1): Promise<Subject[]> => {
        const cacheKey = `subjects:${semester}`;
        const cached = getAnyCached<Subject[]>(cacheKey);
        if (cached) return cached;

        const response = await api.get(`/api/academic/subjects?semester=${semester}`);
        const payload = extractApiData<Subject[] | { subjects?: Subject[] }>(response, []);
        if (Array.isArray(payload)) {
            setAnyCached(cacheKey, payload, CACHE_TTL_MS, 5 * 60 * 1000);
            return payload as Subject[];
        }
        if (Array.isArray(payload?.subjects)) {
            setAnyCached(cacheKey, payload.subjects, CACHE_TTL_MS, 5 * 60 * 1000);
            return payload.subjects as Subject[];
        }
        return [];
    },

    getFullSubjectsData: async (semester: number = 1): Promise<Subject[]> => {
        const response = await api.get(`/api/academic/full_subjects_data?semester=${semester}`);
        return response.data.data;
    },

    getSubjectDetails: async (subjectId: string): Promise<Subject> => {
        const response = await api.get(`/api/academic/subjects/${subjectId}`);
        return response.data.data;
    },

    addSubject: async (
        subjectName: string,
        semester: number,
        categories?: string[],
        code?: string,
        professor?: string,
        classroom?: string,
        credits?: number
    ): Promise<void> => {
        // Use modern REST endpoint
        await api.post('/api/academic/subjects', {
            name: subjectName, // Backend expects 'name', not 'subject_name'
            semester,
            categories,
            code,
            professor,
            classroom,
            credits
        });
        clearDerivedCaches();
    },

    deleteSubject: async (subjectId: string): Promise<void> => {
        await api.delete(`/api/academic/subjects/${subjectId}`);
        clearDerivedCaches();
    },

    updateSubjectDetails: async (
        subjectId: string,
        professor?: string,
        classroom?: string
    ): Promise<void> => {

        await api.put(`/api/academic/subjects/${subjectId}`, {
            professor,
            classroom,
        });
        clearDerivedCaches();
    },

    updateSubjectFullDetails: async (
        subjectId: string,
        data: Partial<Subject>
    ): Promise<void> => {

        await api.put(`/api/academic/subjects/${subjectId}`, data);
        clearDerivedCaches();
    },

    updateAttendanceCount: async (
        subjectId: string,
        attended: number,
        total: number
    ): Promise<void> => {

        await api.post(`/api/academic/subjects/${subjectId}/attendance-count`, {
            attended,
            total,
        });
        clearDerivedCaches();
    },

    updatePracticals: async (
        subjectId: string,
        data: { total?: number; completed?: number; hardcopy?: boolean }
    ): Promise<Subject> => {

        const response = await api.put(`/api/academic/subjects/${subjectId}`, { practicals: data });
        clearDerivedCaches();
        return response.data?.data?.subject;
    },

    updateAssignments: async (
        subjectId: string,
        data: { total?: number; completed?: number; hardcopy?: boolean }
    ): Promise<Subject> => {

        const response = await api.put(`/api/academic/subjects/${subjectId}`, { assignments: data });
        clearDerivedCaches();
        return response.data?.data?.subject;
    },

    // Timetable
    getTimetable: async (semester: number = 1): Promise<{ schedule: TimetableSchedule; periods?: GridPeriod[] }> => {
        const cacheKey = `timetable:${semester}`;
        const cached = getAnyCached<{ schedule: TimetableSchedule; periods?: GridPeriod[] }>(cacheKey);
        if (cached) return cached;

        const response = await api.get(`/api/timetable?semester=${semester}`);
        const payload = extractApiData<TimetablePayload>(response, {});
        const mapped = {
            schedule: payload?.schedule || {},
            periods: Array.isArray(payload?.periods) ? payload.periods : [],
        };
        setAnyCached(cacheKey, mapped, CACHE_TTL_MS, 10 * 60 * 1000);
        return mapped;
    },

    saveTimetable: async (schedule: TimetableSchedule, semester: number = 1): Promise<void> => {
        await api.post(`/api/timetable?semester=${semester}`, { schedule });
        clearCacheByPrefix('timetable:');
    },

    saveTimetableStructure: async (periods: GridPeriod[], semester: number = 1): Promise<void> => {
        await api.post(`/api/timetable/structure?semester=${semester}`, periods);
        clearCacheByPrefix('timetable:');
    },

    addTimetableSlot: async (slotData: TimetableSlot, semester: number = 1): Promise<void> => {
        await api.post(`/api/timetable/slot?semester=${semester}`, slotData);
        clearCacheByPrefix('timetable:');
    },

    updateTimetableSlot: async (slotId: string, slotData: Partial<TimetableSlot>, semester: number = 1): Promise<void> => {
        await api.put(`/api/timetable/slot/${slotId}?semester=${semester}`, slotData);
        clearCacheByPrefix('timetable:');
    },

    deleteTimetableSlot: async (slotId: string, semester: number = 1, fallback?: { day?: string; start_time?: string }): Promise<void> => {
        const params = new URLSearchParams({ semester: String(semester) });
        if (fallback?.day) params.set('day', fallback.day);
        if (fallback?.start_time) params.set('start_time', fallback.start_time);
        await api.delete(`/api/timetable/slot/${slotId}?${params.toString()}`);
        clearCacheByPrefix('timetable:');
    },

    getLogsForDate: async (date: string) => {
        const response = await api.get(`/api/attendance/logs?date=${date}`);
        return response.data.data;
    },

    // Analytics
    getDayOfWeekAnalytics: async (semester: number = 1) => {
        const cacheKey = `analytics:day-of-week:${semester}`;
        const cached = getAnyCached<DayOfWeekAnalytics>(cacheKey);
        if (cached) return cached;
        const response = await api.get(`/api/dashboard/analytics/day-of-week?semester=${semester}`);
        const data = response.data.data;
        setAnyCached(cacheKey, data, 30_000, 10 * 60 * 1000);
        return data;
    },

    // Medical leaves (not yet ported to Node — return empty stubs)
    getPendingLeaves: async () => {
        return [];
    },

    approveLeave: async (_logId: string): Promise<void> => {
        void _logId;
        // stub
    },

    // Substitutions
    getUnresolvedSubstitutions: async () => {
        // Not ported to Node — return empty
        return [];
    },

    markSubstituted: async (
        originalSubjectId: string,
        substituteSubjectId: string,
        date: string
    ): Promise<void> => {
        await api.post('/api/attendance/mark', {
            subject_id: originalSubjectId,
            status: 'substituted',
            substituted_by: substituteSubjectId,
            date,
        });
    },

    // Data management
    exportData: async () => {
        const response = await api.get('/api/data/export_data', {
            responseType: 'blob',
        });
        return response.data;
    },

    importData: async (data: unknown): Promise<void> => {
        await api.post('/api/data/import_data', data);
    },

    deleteAllData: async (confirmationEmail?: string, backupId?: string) => {
        const response = await api.delete('/api/data/delete_all_data', {
            data: { confirmation_email: confirmationEmail, backup_id: backupId }
        });
        // Return full response for success field checking
        return { ...response.data, ...(response.data?.data || {}) };
    },

    // Backup Management
    createBackup: async (): Promise<{ backup_id: string, expires_at: string }> => {
        const response = await api.post('/api/data/backups');
        return response.data?.data;
    },
    listBackups: async () => {
        const response = await api.get('/api/data/backups');
        return response.data?.data?.backups || [];
    },

    restoreBackup: async (backupId: string) => {
        const response = await api.post(`/api/data/restore_backup/${backupId}`);
        return response.data;
    },

    // User Profile
    getProfile: async () => {
        const response = await api.get('/api/profile/');
        return response.data.data;
    },

    updateProfile: async (data: Partial<User>) => {
        const response = await api.put('/api/profile/', data);
        return response.data;
    },

    syncThresholds: async (semester?: number): Promise<{ modified: number; threshold: number }> => {
        const response = await api.post('/api/profile/sync-thresholds', { semester });
        return response.data.data;
    },

    // System logs
    getSystemLogs: async (limit = 7, offset = 0, snapshot?: string): Promise<{ items: SystemLog[]; has_more: boolean; next_offset: number; snapshot: string }> => {
        const requestedLimit = systemLogsUsesLegacyApi ? offset + limit : limit;
        const params = new URLSearchParams({ limit: String(requestedLimit) });
        if (!systemLogsUsesLegacyApi) params.set('offset', String(offset));
        if (!systemLogsUsesLegacyApi && snapshot) params.set('snapshot', snapshot);
        const response = await api.get(`/api/profile/logs?${params.toString()}`);
        const payload = response.data.data ?? response.data;
        if (Array.isArray(payload)) {
            systemLogsUsesLegacyApi = true;
            const items = payload.slice(offset, offset + limit);
            return { items, has_more: payload.length >= requestedLimit, next_offset: offset + items.length, snapshot: snapshot || new Date().toISOString() };
        }
        systemLogsUsesLegacyApi = false;
        return {
            items: Array.isArray(payload?.items) ? payload.items : [],
            has_more: Boolean(payload?.has_more),
            next_offset: Number(payload?.next_offset) || offset,
            snapshot: String(payload?.snapshot || snapshot || new Date().toISOString()),
        };
    },

    // Academic Records (not ported — stub)
    getAcademicRecords: async (): Promise<AcademicRecord[]> => {
        return [];
    },

    updateAcademicRecord: async (_data: AcademicRecord): Promise<void> => {
        void _data;
        // stub
    },

    // Notices
    getNotices: async (category?: string, forceRefresh = false) => {
        const cacheKey = `notices:${category || 'all'}`;
        if (!forceRefresh) {
            const cached = getAnyCached<NoticeItem[]>(cacheKey);
            if (cached) return cached;
        }
        const search = new URLSearchParams();
        if (category) search.set('category', category);
        if (forceRefresh) search.set('force', 'true');
        const params = search.toString() ? `?${search.toString()}` : '';
        const response = await api.get(`/api/scraper/notices${params}`);
        const data = response.data.data;
        setAnyCached(cacheKey, data, 60_000, 60 * 60 * 1000);
        return data;
    },

    // Notifications
    getNotifications: async (semester?: number) => {
        const cacheKey = `notifications:${semester || 'all'}`;
        const cached = getAnyCached<NotificationItem[]>(cacheKey);
        if (cached) return cached;
        const params = semester ? `?semester=${semester}` : '';
        const response = await api.get(`/api/dashboard/notifications${params}`);
        const data = response.data.data;
        setAnyCached(cacheKey, data, 20_000, 5 * 60 * 1000);
        return data;
    },

    // Manual Course Manager
    getManualCourses: async () => {
        const cacheKey = 'manualCourses';
        const cached = getAnyCached<ManualCourse[]>(cacheKey);
        if (cached) return cached;

        const response = await api.get('/api/academic/courses/manual');
        const payload = extractApiData<ManualCourse[] | { courses?: ManualCourse[] }>(response, []);
        if (Array.isArray(payload)) {
            setAnyCached(cacheKey, payload, CACHE_TTL_MS, 10 * 60 * 1000);
            return payload;
        }
        if (Array.isArray(payload?.courses)) {
            setAnyCached(cacheKey, payload.courses, CACHE_TTL_MS, 10 * 60 * 1000);
            return payload.courses;
        }
        return [];
    },

    saveManualCourses: async (courses: ManualCourse[]) => {
        const response = await api.post('/api/academic/courses/manual', courses);
        clearDerivedCaches();
        return response.data;
    },

    addManualCourse: async (course: ManualCourse) => {
        const response = await api.post('/api/academic/courses/manual', course);
        clearDerivedCaches();
        return response.data;
    },

    updateManualCourse: async (id: string, course: Partial<ManualCourse>) => {
        const response = await api.put(`/api/academic/courses/manual/${id}`, course);
        clearDerivedCaches();
        return response.data;
    },

    deleteManualCourse: async (id: string) => {
        const response = await api.delete(`/api/academic/courses/manual/${id}`);
        clearDerivedCaches();
        return response.data;
    },

    // Get previously saved IPU results from DB (no login needed)
    getSavedIPUResults: async () => {
        const response = await api.get('/api/academic/results/analytics');
        return response.data.data;
    },

    parseResultPdf: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/api/academic/results/parse-pdf', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data.data ?? response.data;
    },

    saveResults: async (payload: { semester: number; subjects: SemesterResult['subjects']; student_info?: JsonObject }) => {
        const response = await api.post('/api/academic/results', payload);
        return response.data.data ?? response.data;
    },

    // Account Migration
    initiateMigration: async (): Promise<{ key: string }> => {
        const response = await api.post('/api/data/migration/initiate');
        return response.data?.data ?? response.data;
    },

    completeMigration: async (key: string): Promise<{ message: string }> => {
        const response = await api.post('/api/data/migration/complete', { key });
        return response.data?.data ?? response.data;
    },

    // Google Drive Backup
    linkGoogleDrive: async (code: string, redirectUri?: string): Promise<{ message: string; has_refresh_token: boolean }> => {
        const response = await api.post('/api/auth/google/link-drive', { code, redirectUri });
        return response.data?.data ?? response.data;
    },

    performDriveBackup: async (): Promise<{ message: string; file_id: string }> => {
        const response = await api.post('/api/data/drive/backup');
        return response.data?.data ?? response.data;
    },

    listDriveBackups: async (): Promise<{ backups: DriveBackup[] }> => {
        const response = await api.get('/api/data/drive/backups');
        return response.data?.data ?? response.data;
    },

    restoreDriveBackup: async (fileId: string): Promise<{ message: string }> => {
        const response = await api.post(`/api/data/drive/restore/${fileId}`);
        return response.data?.data ?? response.data;
    },

    downloadDriveBackup: async (fileId: string): Promise<Blob> => {
        const response = await api.get(`/api/data/drive/download/${fileId}`, {
            responseType: 'blob',
        });
        return response.data;
    },

    getDriveStatus: async (): Promise<DriveStatus> => {
        const response = await api.get('/api/data/drive/status');
        return response.data?.data ?? response.data;
    },

    updateDriveSettings: async (frequency: string): Promise<{ message: string }> => {
        const response = await api.post('/api/data/drive/settings', { frequency });
        return response.data?.data ?? response.data;
    },

    disconnectDrive: async (): Promise<{ message: string }> => {
        const response = await api.post('/api/data/drive/disconnect');
        return response.data?.data ?? response.data;
    },

    clearAllLocalCaches: () => {
        clearDerivedCaches();
        try {
            localStorage.removeItem('zenith_semester');
            localStorage.removeItem('zenith_timetable_view');
            localStorage.removeItem('zenith_skills_filter');
        } catch {
            // ignore storage access issues
        }
    },
};
