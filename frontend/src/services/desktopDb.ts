import { isTauriDesktop } from '@/utils/platform';
import type {
    AttendanceMutationResult,
    AttendanceRecord,
    DashboardData,
    DriveBackup,
    DriveStatus,
    GridPeriod,
    ManualCourse,
    Preferences,
    ScheduledClass,
    Subject,
    SystemLog,
    TimetableSchedule,
    TimetableSlot,
    User,
} from '@/types';
import type { Note } from '@/hooks/useNotes';

interface TauriInternals {
    invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

/**
 * Invoke a Rust Tauri v2 command directly via the runtime's native IPC bridge.
 * Avoids requiring extra npm packages while preserving full async multi-core execution.
 */
export async function tauriInvoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>
): Promise<T> {
    if (typeof window === 'undefined') {
        throw new Error('Tauri IPC is unavailable outside browser context');
    }
    const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') {
        throw new Error(`Tauri IPC unavailable for command: ${cmd}`);
    }
    return internals.invoke<T>(cmd, args ?? {});
}

/**
 * Safely opens an external HTTP(S) URL or mailto: link.
 * In the Windows/macOS/Linux desktop app, hands off directly to the OS default browser/mail client
 * via Rust's `open_external_url` command (never traps the link inside WebView2).
 */
export async function openExternalUrl(url: string): Promise<void> {
    const trimmed = String(url || '').trim();
    if (!trimmed) return;
    if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) {
        throw new Error('Only http://, https://, and mailto: links are allowed');
    }

    if (isTauriDesktop()) {
        await tauriInvoke('open_external_url', { url: trimmed });
        return;
    }

    if (trimmed.toLowerCase().startsWith('mailto:')) {
        window.location.href = trimmed;
    } else {
        window.open(trimmed, '_blank', 'noopener,noreferrer');
    }
}

export interface IpuFieldNames {
    username: string;
    password: string;
    captcha: string;
}

export interface IpuCaptchaSession {
    captcha_image: string;
    hidden_fields: Record<string, string>;
    field_names: IpuFieldNames;
    login_action: string;
    hash_password: boolean;
}

export interface DesktopDriveStatus extends DriveStatus {
    auto_sync_enabled: boolean;
    is_syncing: boolean;
    has_pending_changes: boolean;
    last_error: string | null;
    account_email?: string | null;
    account_name?: string | null;
}

export interface LocalAiResponse {
    response: string;
    suggestions: string[];
    intent?: string;
    provider_used?: 'local' | 'gemini' | 'groq' | string;
    model_used?: string;
}

export interface AiConfig {
    provider: 'local' | 'gemini' | 'groq';
    gemini_model: string;
    groq_model: string;
    has_gemini_key: boolean;
    has_groq_key: boolean;
    gemini_key_hint: string;
    groq_key_hint: string;
    encrypted_storage: boolean;
}

export interface AiTestResult {
    ok: boolean;
    provider: string;
    model: string;
    latency_ms: number;
    preview: string;
}

export interface GoogleOAuthConnectResult {
    user: User;
    restored_from_cloud?: boolean;
    message?: string;
}

export const desktopDb = {
    // ── Profile & Preferences ────────────────────────────────────────────────
    getProfile: () => tauriInvoke<User>('db_get_profile'),
    updateProfile: (patch: Partial<User>) => tauriInvoke<User>('db_update_profile', { patch }),
    getPreferences: () => tauriInvoke<Preferences>('db_get_preferences'),
    updatePreferences: (patch: Partial<Preferences>) =>
        tauriInvoke<Preferences>('db_update_preferences', { patch }),

    // ── Dashboard & Subjects ─────────────────────────────────────────────────
    getDashboard: (semester: number) => tauriInvoke<DashboardData>('db_get_dashboard', { semester }),
    getSubjects: (semester?: number) =>
        tauriInvoke<Subject[]>('db_get_subjects', { semester: semester ?? null }),
    getSubject: (subjectId: string) => tauriInvoke<Subject | null>('db_get_subject', { subjectId }),
    addSubject: (payload: Record<string, unknown>) =>
        tauriInvoke<Subject>('db_add_subject', { payload }),
    updateSubject: (subjectId: string, patch: Partial<Subject>) =>
        tauriInvoke<Subject>('db_update_subject', { subjectId, patch }),
    deleteSubject: (subjectId: string) => tauriInvoke<boolean>('db_delete_subject', { subjectId }),

    // ── Attendance Logs ──────────────────────────────────────────────────────
    markAttendance: (params: {
        subjectId: string;
        status: string;
        date: string;
        notes?: string;
        substitutedBy?: string;
        semester?: number;
        logType?: string;
    }) =>
        tauriInvoke<AttendanceMutationResult>('db_mark_attendance', {
            subjectId: params.subjectId,
            status: params.status,
            date: params.date,
            notes: params.notes ?? null,
            substitutedBy: params.substitutedBy ?? null,
            semester: params.semester ?? null,
            logType: params.logType ?? null,
        }),

    editAttendance: (logId: string, status: string, notes?: string, date?: string) =>
        tauriInvoke<AttendanceMutationResult>('db_edit_attendance', {
            logId,
            status,
            notes: notes ?? null,
            date: date ?? null,
        }),

    deleteAttendance: (logId: string) =>
        tauriInvoke<AttendanceMutationResult>('db_delete_attendance', { logId }),

    markAllAttendance: (
        classes: Array<{ subject_id: string; type: string }>,
        status: string,
        date: string,
        semester: number
    ) =>
        tauriInvoke<{ marked_count: number; activity_id: string; logs: AttendanceRecord[] }>(
            'db_mark_all_attendance',
            { classes, status, date, semester }
        ),

    unmarkAttendanceLogs: (logIds: string[]) =>
        tauriInvoke<{ deleted_count: number; requested_count: number }>(
            'db_unmark_attendance_logs',
            { logIds }
        ),

    getCalendarData: (year: number, month: number, semester?: number) =>
        tauriInvoke<AttendanceRecord[]>('db_get_calendar_data', {
            year,
            month,
            semester: semester ?? null,
        }),

    getLogsForDate: (date: string, semester?: number) =>
        tauriInvoke<AttendanceRecord[]>('db_get_logs_for_date', {
            date,
            semester: semester ?? null,
        }),

    getClassesForDate: (date: string, semester: number) =>
        tauriInvoke<ScheduledClass[]>('db_get_classes_for_date', { date, semester }),

    // ── Timetable ────────────────────────────────────────────────────────────
    getTimetable: (semester: number) =>
        tauriInvoke<{ schedule: TimetableSchedule; periods: GridPeriod[] }>('db_get_timetable', {
            semester,
        }),

    saveTimetableStructure: (semester: number, periods: GridPeriod[]) =>
        tauriInvoke<void>('db_save_timetable_structure', { semester, periods }),

    saveTimetableSlot: (semester: number, slot: Partial<TimetableSlot>) =>
        tauriInvoke<TimetableSlot>('db_save_timetable_slot', { semester, slot }),

    deleteTimetableSlot: (
        slotId: string,
        semester: number,
        fallbackDay?: string,
        fallbackStart?: string
    ) =>
        tauriInvoke<boolean>('db_delete_timetable_slot', {
            slotId,
            semester,
            fallbackDay: fallbackDay ?? null,
            fallbackStart: fallbackStart ?? null,
        }),

    // ── Manual Courses ───────────────────────────────────────────────────────
    getManualCourses: () => tauriInvoke<ManualCourse[]>('db_get_manual_courses'),
    upsertManualCourse: (courseId: string | null, payload: Record<string, unknown>) =>
        tauriInvoke<ManualCourse>('db_upsert_manual_course', { courseId, payload }),
    deleteManualCourse: (courseId: string) =>
        tauriInvoke<boolean>('db_delete_manual_course', { courseId }),

    // ── Results & IPU Direct Portal Sync ─────────────────────────────────────
    getResults: () => tauriInvoke<Record<string, unknown>>('db_get_results'),
    saveResults: (params: {
        enrollmentNumber: string;
        studentInfo: Record<string, unknown>;
        semesters: Array<Record<string, unknown>>;
        source?: string;
    }) =>
        tauriInvoke<Record<string, unknown>>('db_save_results', {
            enrollmentNumber: params.enrollmentNumber,
            studentInfo: params.studentInfo,
            semesters: params.semesters,
            source: params.source ?? 'manual',
        }),
    updateResultSubjectCredit: (semester: number, code: string, name: string, credits: number) =>
        tauriInvoke<Record<string, unknown>>('db_update_result_subject_credit', {
            semester,
            code,
            name,
            credits,
        }),

    ipuFetchCaptcha: () => tauriInvoke<IpuCaptchaSession>('ipu_fetch_captcha'),
    ipuSyncResults: (params: {
        enrollmentNumber: string;
        password: string;
        captcha: string;
        hiddenFields: Record<string, string>;
        fieldNames: IpuFieldNames;
        loginAction: string;
        hashPassword?: boolean;
    }) =>
        tauriInvoke<Record<string, unknown>>('ipu_sync_results', {
            enrollmentNumber: params.enrollmentNumber,
            password: params.password,
            captcha: params.captcha,
            hiddenFields: params.hiddenFields,
            fieldNames: params.fieldNames,
            loginAction: params.loginAction,
            hashPassword: params.hashPassword ?? true,
        }),

    // ── Notes & Tasks ────────────────────────────────────────────────────────
    getNotes: () => tauriInvoke<Note[]>('db_get_notes'),
    saveNote: (note: Partial<Note>) => tauriInvoke<Note>('db_save_note', { note }),
    deleteNote: (noteId: string) => tauriInvoke<boolean>('db_delete_note', { noteId }),

    // ── System Logs, Export, Import, Wipe & Full Account Reset ───────────────
    getSystemLogs: (limit: number, offset: number) =>
        tauriInvoke<{ items: SystemLog[]; has_more: boolean; next_offset: number; snapshot: string }>(
            'db_get_system_logs',
            { limit, offset }
        ),
    exportBackup: () => tauriInvoke<Record<string, unknown>>('db_export_backup'),
    exportBackupToDownloads: () =>
        tauriInvoke<{ path: string; filename: string; size_bytes: number }>('db_export_backup_to_downloads'),
    importBackup: (payload: unknown) =>
        tauriInvoke<Record<string, unknown>>('db_import_backup', { payload }),
    wipeAllData: () => tauriInvoke<Record<string, unknown>>('db_wipe_all_data'),
    resetAccountCompletely: () =>
        tauriInvoke<{ success: boolean; message: string; safety_snapshot?: string | null }>(
            'db_reset_account_completely'
        ),

    // ── Local SQLite & BYOK AI Assistant (Gemini / Groq) ─────────────────────
    aiLocalQuery: (message: string, semester: number) =>
        tauriInvoke<LocalAiResponse>('ai_local_query', { message, semester }),
    aiGetConfig: () => tauriInvoke<AiConfig>('ai_get_config'),
    aiSaveConfig: (config: {
        provider?: 'local' | 'gemini' | 'groq';
        gemini_api_key?: string;
        gemini_model?: string;
        groq_api_key?: string;
        groq_model?: string;
        clear_gemini_key?: boolean;
        clear_groq_key?: boolean;
    }) => tauriInvoke<AiConfig>('ai_save_config', { config }),
    aiTestConnection: (params: { provider: 'local' | 'gemini' | 'groq'; apiKey?: string; model?: string }) =>
        tauriInvoke<AiTestResult>('ai_test_connection', {
            provider: params.provider,
            apiKey: params.apiKey || null,
            model: params.model || null,
        }),
    aiChat: (message: string, history: Array<{ role: string; content: string }>, semester: number) =>
        tauriInvoke<LocalAiResponse>('ai_chat', { message, history, semester }),
    aiProcessNote: (content: string, action: string, customPrompt?: string) =>
        tauriInvoke<{ processedContent: string; provider_used: string }>('ai_process_note', {
            content,
            action,
            customPrompt: customPrompt || null,
        }),

    // ── Google OAuth PKCE & Smart Automatic Drive AppData Sync ───────────────
    googleOAuthConnect: (clientId?: string) =>
        tauriInvoke<GoogleOAuthConnectResult>('google_oauth_connect', {
            clientId: clientId || null,
        }),
    driveGetStatus: () => tauriInvoke<DesktopDriveStatus>('drive_get_status'),
    driveSetAutoSync: (enabled: boolean) =>
        tauriInvoke<void>('drive_set_auto_sync', { enabled }),
    driveSyncNow: () =>
        tauriInvoke<{ message: string; file_id?: string; merged?: boolean; peers_checked?: number }>('drive_sync_now'),
    drivePullSync: () =>
        tauriInvoke<{ merged: boolean; peers_checked?: number; skipped?: boolean; message?: string }>('drive_pull_sync'),
    driveListBackups: () => tauriInvoke<DriveBackup[]>('drive_list_backups'),
    driveRestoreBackup: (fileId: string) =>
        tauriInvoke<{ message: string }>('drive_restore_backup', { fileId }),
    driveDownloadBackup: (fileId: string) =>
        tauriInvoke<Record<string, unknown>>('drive_download_backup', { fileId }),
    driveDownloadBackupToDownloads: (fileId: string, createdAt?: string) =>
        tauriInvoke<{ path: string; filename: string; size_bytes: number }>(
            'drive_download_backup_to_downloads',
            { fileId, createdAt: createdAt || null }
        ),
    savePdfToDownloads: (filename: string, pdfBase64: string) =>
        tauriInvoke<{ path: string; filename: string; size_bytes: number }>(
            'save_pdf_to_downloads',
            { filename, pdfBase64 }
        ),
    driveDisconnect: () => tauriInvoke<void>('drive_disconnect'),
};
