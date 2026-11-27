package com.semester.app.core

import android.content.Context
import android.util.Log
import com.semester.app.network.AiProvider
import com.semester.app.network.ByokAiClient
import com.semester.app.network.IpuCaptchaChallenge
import com.semester.app.network.IpuPortalClient
import com.semester.app.network.IpuPortalFetchResult
import com.semester.app.notifications.ScheduleAlertManager
import com.semester.app.sync.SyncScheduler
import com.semester.app.widget.SemesterGlanceWidget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import uniffi.semester_core.BunkGuard
import uniffi.semester_core.SemesterWorkspace
import uniffi.semester_core.TimetableSlot
import uniffi.semester_core.coreCalculateMedicalBunkGuard
import uniffi.semester_core.coreCalculatePercentage
import uniffi.semester_core.coreCalculateRequiredSgpa
import uniffi.semester_core.coreExportTimetableQr
import uniffi.semester_core.coreImportTimetableQr
import uniffi.semester_core.coreIpuSaltedPasswordHash
import uniffi.semester_core.coreMergeSyncSnapshots
import uniffi.semester_core.coreParseIpuPortalResponse
import uniffi.semester_core.coreSimulateFutureAttendance
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

data class SyncSnapshotBundle(
    val hash: String,
    val deviceId: String,
    val payloadJson: String,
)

/**
 * Unified v2 Workspace Repository backed directly by the native Rust `SemesterWorkspace`
 * SQLite engine (100% schema, math, credit-matcher, and 2-way CRDT sync parity with Desktop).
 */
class WorkspaceRepository private constructor(private val appContext: Context) {

    private val dbPath: String = File(appContext.filesDir, "semester_workspace_v2.db").absolutePath
    private val aiPrefs = appContext.getSharedPreferences("semester_ai_prefs", Context.MODE_PRIVATE)
    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val workspace: SemesterWorkspace by lazy {
        SemesterWorkspace.open(dbPath)
    }

    private val _dataVersion = MutableStateFlow(0L)
    val dataVersion: StateFlow<Long> = _dataVersion.asStateFlow()

    private val _dirtyEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val dirtyEvents: SharedFlow<Unit> = _dirtyEvents.asSharedFlow()

    @Volatile
    private var onDebouncedSync: (suspend () -> Unit)? = null
    private var debounceJob: Job? = null
    private var sideEffectJob: Job? = null

    fun registerAutoSyncCallback(callback: suspend () -> Unit) {
        onDebouncedSync = callback
    }

    private fun notifyMutation(triggerCloudSync: Boolean = true) {
        _dataVersion.value = _dataVersion.value + 1L
        // Coalesce widget redraws & alarm reschedules (350ms) so rapid taps finish in <1ms with zero contention
        sideEffectJob?.cancel()
        sideEffectJob = ioScope.launch {
            delay(350L)
            SemesterGlanceWidget.refreshAll(appContext)
            runCatching { ScheduleAlertManager.rescheduleToday(appContext) }
        }
        if (triggerCloudSync) {
            _dirtyEvents.tryEmit(Unit)
            // Enqueue swipe-close-safe 5s background fallback push (cancelled if foreground sync finishes first)
            SyncScheduler.scheduleImmediatePush(appContext)
            debounceJob?.cancel()
            debounceJob = ioScope.launch {
                // Coalesce rapid taps into 1 clean upload
                delay(3_000L)
                runCatching { onDebouncedSync?.invoke() }
                    .onFailure { Log.w(TAG, "Debounced background sync skipped: ${it.message}") }
            }
        }
    }

    suspend fun checkpointWal() = withContext(Dispatchers.IO) {
        runCatching { workspace.checkpointWal() }
    }

    suspend fun pruneOldTombstones(maxAgeDays: Int = 45): Long = withContext(Dispatchers.IO) {
        runCatching { workspace.pruneOldTombstones(maxAgeDays.toLong()).toLong() }.getOrDefault(0L)
    }

    fun getDeviceId(): String = runCatching {
        workspace.getMeta("device_id") ?: "android-${UUID.randomUUID()}"
    }.getOrElse { "android-default" }

    // ─── Profile ─────────────────────────────────────────────────────────────

    suspend fun getProfile(): WorkspaceProfile = withContext(Dispatchers.IO) {
        WorkspaceJsonParser.parseProfile(workspace.getProfileJson())
    }

    suspend fun updateProfile(
        name: String? = null,
        email: String? = null,
        picture: String? = null,
        college: String? = null,
        course: String? = null,
        branch: String? = null,
        batch: String? = null,
        enrollmentNumber: String? = null,
        currentSemester: Int? = null,
        attendanceThreshold: Int? = null,
        warningThreshold: Int? = null,
        themeMode: String? = null,
    ): WorkspaceProfile = withContext(Dispatchers.IO) {
        val patch = JSONObject().apply {
            name?.let { put("name", it) }
            email?.let { put("email", it) }
            picture?.let { put("picture", it) }
            college?.let { put("college", it) }
            course?.let { put("course", it) }
            branch?.let { put("branch", it) }
            batch?.let { put("batch", it) }
            enrollmentNumber?.let { put("enrollment_number", it) }
            currentSemester?.let { put("current_semester", it.coerceIn(1, 8)) }
            attendanceThreshold?.let { put("attendance_threshold", it.coerceIn(50, 95)) }
            warningThreshold?.let { put("warning_threshold", it.coerceIn(50, 98)) }
            themeMode?.let { put("preferences", JSONObject().put("theme", it)) }
        }
        val raw = workspace.updateProfileJson(patch.toString())
        notifyMutation()
        WorkspaceJsonParser.parseProfile(raw)
    }

    // ─── Dashboard & Subjects ────────────────────────────────────────────────

    suspend fun getDashboard(semester: Int): DashboardSnapshot = withContext(Dispatchers.IO) {
        WorkspaceJsonParser.parseDashboard(workspace.getDashboardJson(semester.toLong()), semester)
    }

    suspend fun getSubjects(semester: Int? = null): List<WorkspaceSubject> = withContext(Dispatchers.IO) {
        WorkspaceJsonParser.parseSubjectsList(workspace.getSubjectsJson(semester?.toLong()))
    }

    suspend fun addSubject(
        name: String,
        code: String = "",
        professor: String = "",
        classroom: String = "",
        semester: Int = 3,
        subjectType: String = "theory",
        categories: List<String>? = null,
        credits: Int = 3,
        target: Int = 75,
    ): WorkspaceSubject = withContext(Dispatchers.IO) {
        val finalCats = categories?.filter { it.isNotBlank() }?.takeIf { it.isNotEmpty() }
            ?: listOf(if (subjectType.equals("practical", true)) "Practical" else "Theory")
        val derivedType = if (finalCats.any { it.equals("Practical", true) } && !finalCats.any { it.equals("Theory", true) }) {
            "practical"
        } else {
            "theory"
        }
        val payload = JSONObject().apply {
            put("name", name.trim())
            put("code", code.trim())
            put("professor", professor.trim())
            put("classroom", classroom.trim())
            put("semester", semester.coerceIn(1, 8))
            put("type", derivedType)
            put("categories", JSONArray(finalCats))
            put("credits", credits.coerceIn(0, 12))
            put("target", target.coerceIn(50, 100))
        }
        val raw = workspace.addSubjectJson(payload.toString())
        notifyMutation()
        WorkspaceJsonParser.parseSubject(JSONObject(raw))
    }

    suspend fun updateSubject(
        subjectId: String,
        name: String? = null,
        code: String? = null,
        professor: String? = null,
        classroom: String? = null,
        semester: Int? = null,
        credits: Int? = null,
        target: Int? = null,
        attended: Int? = null,
        total: Int? = null,
        isPractical: Boolean? = null,
        syllabus: String? = null,
        practicalCompleted: Int? = null,
        practicalTotal: Int? = null,
        practicalHardcopy: Boolean? = null,
        assignmentCompleted: Int? = null,
        assignmentTotal: Int? = null,
        assignmentHardcopy: Boolean? = null,
        categories: List<String>? = null,
    ): WorkspaceSubject = withContext(Dispatchers.IO) {
        val patch = JSONObject().apply {
            name?.let { put("name", it.trim()) }
            code?.let { put("code", it.trim()) }
            professor?.let { put("professor", it.trim()) }
            classroom?.let { put("classroom", it.trim()) }
            semester?.let { put("semester", it.coerceIn(1, 8)) }
            credits?.let { put("credits", it.coerceIn(0, 12)) }
            target?.let { put("target", it.coerceIn(50, 100)) }
            attended?.let { put("attended", it.coerceAtLeast(0)) }
            total?.let { put("total", it.coerceAtLeast(0)) }
            when {
                categories != null -> put("categories", JSONArray(categories))
                isPractical != null -> put("categories", JSONArray().put(if (isPractical) "Practical" else "Theory"))
            }
            syllabus?.let { put("syllabus", it) }
            if (practicalCompleted != null || practicalTotal != null || practicalHardcopy != null) {
                put(
                    "practicals",
                    JSONObject().apply {
                        practicalCompleted?.let { put("completed", it.coerceAtLeast(0)) }
                        practicalTotal?.let { put("total", it.coerceAtLeast(0)) }
                        practicalHardcopy?.let { put("hardcopy", it) }
                    },
                )
            }
            if (assignmentCompleted != null || assignmentTotal != null || assignmentHardcopy != null) {
                put(
                    "assignments",
                    JSONObject().apply {
                        assignmentCompleted?.let { put("completed", it.coerceAtLeast(0)) }
                        assignmentTotal?.let { put("total", it.coerceAtLeast(0)) }
                        assignmentHardcopy?.let { put("hardcopy", it) }
                    },
                )
            }
        }
        val raw = workspace.updateSubjectJson(subjectId, patch.toString())
        notifyMutation()
        WorkspaceJsonParser.parseSubject(JSONObject(raw))
    }

    suspend fun deleteSubject(subjectId: String): Boolean = withContext(Dispatchers.IO) {
        val ok = workspace.deleteSubject(subjectId)
        if (ok) notifyMutation()
        ok
    }

    // ─── Attendance & Calendar ───────────────────────────────────────────────

    suspend fun markAttendance(
        subjectId: String,
        status: String,
        date: String = todayIsoDate(),
        notes: String = "",
        substitutedBy: String = "",
        semester: Int? = null,
        logType: String = "Lecture",
    ): Boolean = withContext(Dispatchers.IO) {
        workspace.markAttendanceJson(
            subjectId = subjectId,
            status = status,
            date = date,
            notes = notes,
            substitutedBy = substitutedBy,
            semester = semester?.toLong(),
            logType = logType,
        )
        notifyMutation()
        true
    }

    suspend fun editAttendance(
        logId: String,
        status: String,
        notes: String? = null,
        date: String? = null,
        substitutedBy: String? = null,
    ) = withContext(Dispatchers.IO) {
        workspace.editAttendanceFullJson(logId, status, notes, date, substitutedBy)
        notifyMutation()
    }

    suspend fun markAttendanceBatch(
        items: List<Pair<String, String>>,
        status: String,
        date: String = todayIsoDate(),
        notes: String = "",
        semester: Int? = null,
    ): Int = withContext(Dispatchers.IO) {
        val arr = JSONArray()
        items.forEach { (sid, logType) ->
            arr.put(JSONObject().put("subject_id", sid).put("type", logType))
        }
        val raw = workspace.markAttendanceBatchJson(
            itemsJson = arr.toString(),
            status = status,
            date = date,
            notes = notes,
            semester = semester?.toLong(),
        )
        notifyMutation()
        runCatching { JSONObject(raw).optInt("marked_count", 0) }.getOrDefault(0)
    }

    suspend fun deleteAttendanceBatch(logIds: List<String>): Int = withContext(Dispatchers.IO) {
        if (logIds.isEmpty()) return@withContext 0
        val arr = JSONArray()
        logIds.forEach { arr.put(it) }
        val raw = workspace.deleteAttendanceBatchJson(arr.toString())
        notifyMutation()
        runCatching { JSONObject(raw).optInt("deleted_count", 0) }.getOrDefault(0)
    }

    suspend fun getSubjectLogs(subjectId: String, limit: Int = 30): List<AttendanceLogEntry> =
        withContext(Dispatchers.IO) {
            WorkspaceJsonParser.parseAttendanceLogsList(
                workspace.getSubjectLogsJson(subjectId, limit.toLong()),
            )
        }

    suspend fun getClassesForDate(date: String, semester: Int): List<TodayClassItem> =
        withContext(Dispatchers.IO) {
            WorkspaceJsonParser.parseTodayClassesList(
                workspace.getClassesForDateJson(date, semester.toLong()),
            )
        }

    suspend fun deleteAttendance(logId: String): Boolean = withContext(Dispatchers.IO) {
        val ok = workspace.deleteAttendance(logId)
        if (ok) notifyMutation()
        ok
    }

    suspend fun getCalendarForMonth(
        year: Int,
        month: Int,
        semester: Int? = null,
    ): Map<String, CalendarDaySummary> = withContext(Dispatchers.IO) {
        val raw = workspace.getCalendarJson(year, month.toUInt(), semester?.toLong())
        WorkspaceJsonParser.parseCalendarByDate(raw)
    }

    suspend fun getLogsForDate(date: String, semester: Int? = null): List<AttendanceLogEntry> =
        withContext(Dispatchers.IO) {
            WorkspaceJsonParser.parseAttendanceLogsList(
                workspace.getLogsForDateJson(date, semester?.toLong()),
            )
        }

    // ─── Timetable ───────────────────────────────────────────────────────────

    suspend fun getTimetable(semester: Int): TimetableData = withContext(Dispatchers.IO) {
        WorkspaceJsonParser.parseTimetable(workspace.getTimetableJson(semester.toLong()), semester)
    }

    suspend fun saveTimetableSlot(
        semester: Int,
        day: String,
        startTime: String,
        endTime: String,
        subjectId: String,
        subjectName: String,
        room: String = "",
        slotType: String = "class",
        label: String = "",
        id: String? = null,
    ) = withContext(Dispatchers.IO) {
        val obj = JSONObject().apply {
            if (!id.isNullOrBlank()) put("id", id)
            put("day", day)
            put("start_time", startTime)
            put("end_time", endTime)
            put("subject_id", subjectId)
            put("subject_name", subjectName)
            put("classroom", room)
            put("label", label)
            put("type", slotType)
        }
        workspace.saveTimetableSlotJson(semester.toLong(), obj.toString())
        notifyMutation()
    }

    suspend fun deleteTimetableSlot(
        slotId: String,
        semester: Int,
        day: String? = null,
        startTime: String? = null,
    ): Boolean = withContext(Dispatchers.IO) {
        val ok = workspace.deleteTimetableSlot(slotId, semester.toLong(), day, startTime)
        if (ok) notifyMutation()
        ok
    }

    suspend fun exportTimetableQrV2(semester: Int): String = withContext(Dispatchers.IO) {
        workspace.exportTimetableQrV2(semester.toLong())
    }

    suspend fun importTimetableQrV2(semester: Int, payload: String): QrImportSummary = withContext(Dispatchers.IO) {
        val raw = workspace.importTimetableQrV2Json(semester.toLong(), payload)
        notifyMutation()
        WorkspaceJsonParser.parseQrImportSummary(raw)
    }

    fun exportTimetableQrPayload(slots: List<TimetableDaySlot>): String {
        val legacySlots = slots.map {
            TimetableSlot(
                id = it.id,
                day = it.day,
                periodNumber = it.periodNumber.toUInt(),
                startTime = it.startTime,
                endTime = it.endTime,
                subjectId = it.subjectId,
                subjectName = it.subjectName,
                room = it.room,
                slotType = it.slotType,
            )
        }
        return coreExportTimetableQr(legacySlots)
    }

    suspend fun importTimetableQrPayload(semester: Int, payload: String): Int {
        return importTimetableQrV2(semester, payload).slotsImported
    }

    // ─── Live IPU Portal & Results Analytics ─────────────────────────────────

    fun createIpuClient(): IpuPortalClient = IpuPortalClient(
        hashSaltedPassword = { pw, cap -> coreIpuSaltedPasswordHash(pw, cap) },
        parseEnvelope = { text, sem -> coreParseIpuPortalResponse(text, sem) },
    )

    suspend fun fetchAndSaveIpuResults(
        client: IpuPortalClient,
        challenge: IpuCaptchaChallenge,
        enrollment: String,
        password: String,
        captcha: String,
    ): Pair<IpuPortalFetchResult, ResultsAnalytics> = withContext(Dispatchers.IO) {
        val fetched = client.loginAndFetchResults(challenge, enrollment, password, captcha)
        val analyticsJson = workspace.saveSemesterResultsBatchJson(
            enrollmentNumber = enrollment.trim(),
            studentInfoJson = fetched.studentInfoJson,
            semestersJson = fetched.semestersJson,
            source = "ipu_portal",
        )
        // Auto-hydrate student enrollment / name / college on profile if blank
        runCatching {
            val info = JSONObject(fetched.studentInfoJson)
            val profile = getProfile()
            updateProfile(
                name = if (profile.name == "Student") info.optString("name").ifBlank { null } else null,
                college = if (profile.college.isBlank()) info.optString("institution").ifBlank { null } else null,
                batch = if (profile.batch.isBlank()) info.optString("batch").ifBlank { null } else null,
                enrollmentNumber = enrollment.trim(),
            )
        }
        notifyMutation()
        fetched to WorkspaceJsonParser.parseResultsAnalytics(analyticsJson)
    }

    suspend fun getResultsAnalytics(): ResultsAnalytics = withContext(Dispatchers.IO) {
        WorkspaceJsonParser.parseResultsAnalytics(workspace.getResultsAnalyticsJson())
    }

    suspend fun updateResultSubjectCredit(
        semester: Int,
        code: String,
        name: String,
        credits: Int,
    ): ResultsAnalytics = withContext(Dispatchers.IO) {
        val raw = workspace.updateResultSubjectCreditJson(
            semester = semester.toLong(),
            code = code,
            name = name,
            credits = credits.toLong(),
        )
        notifyMutation()
        WorkspaceJsonParser.parseResultsAnalytics(raw)
    }

    // ─── Notes & Todos ───────────────────────────────────────────────────────

    suspend fun getNotes(): List<WorkspaceNote> = withContext(Dispatchers.IO) {
        WorkspaceJsonParser.parseNotes(workspace.getNotesJson())
    }

    suspend fun saveNote(note: WorkspaceNote): WorkspaceNote = withContext(Dispatchers.IO) {
        val todosArr = JSONArray()
        for (t in note.todos) {
            todosArr.put(
                JSONObject()
                    .put("id", t.id.ifBlank { UUID.randomUUID().toString() })
                    .put("text", t.text)
                    .put("completed", t.completed)
                    .apply {
                        if (t.subject.isNotBlank()) put("subject", t.subject.trim())
                        if (t.examDate.isNotBlank()) put("exam_date", t.examDate.trim())
                    },
            )
        }
        val payload = JSONObject().apply {
            if (note.id.isNotBlank()) put("id", note.id)
            put("title", note.title.ifBlank { "Untitled Note" })
            put("content", note.content)
            put("is_todo", note.isTodo)
            put("todos", todosArr)
            put("is_pinned", note.isPinned)
            put("is_archived", note.isArchived)
            put("color", note.color)
            put("category", note.category)
        }
        val raw = workspace.saveNoteJson(payload.toString())
        notifyMutation()
        WorkspaceJsonParser.parseNotes("[$raw]").firstOrNull() ?: note
    }

    suspend fun deleteNote(noteId: String): Boolean = withContext(Dispatchers.IO) {
        val ok = workspace.deleteNote(noteId)
        if (ok) notifyMutation()
        ok
    }

    // ─── Online / Manual Courses (Desktop Courses.tsx Parity) ────────────────

    suspend fun getManualCourses(): List<ManualCourseEntry> = withContext(Dispatchers.IO) {
        WorkspaceJsonParser.parseManualCourses(workspace.getManualCoursesJson())
    }

    suspend fun saveManualCourse(course: ManualCourseEntry): ManualCourseEntry = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            if (course.id.isNotBlank()) put("id", course.id)
            put("title", course.title.trim())
            put("platform", course.platform)
            put("url", course.url.trim())
            put("progress", course.progress.coerceIn(0, 100))
            put("enrolledDate", course.enrolledDate.ifBlank { todayIsoDate() })
            put("targetCompletionDate", course.targetCompletionDate)
            put("instructor", course.instructor.trim())
            put("notes", course.notes.trim())
        }
        val raw = workspace.saveManualCourseJson(payload.toString())
        notifyMutation()
        WorkspaceJsonParser.parseManualCourses("[$raw]").firstOrNull() ?: course
    }

    suspend fun deleteManualCourse(courseId: String): Boolean = withContext(Dispatchers.IO) {
        val ok = workspace.deleteManualCourse(courseId)
        if (ok) notifyMutation()
        ok
    }

    // ─── System Activity Audit Logs (Desktop Settings -> Activity Parity) ────

    suspend fun getSystemLogs(limit: Int = 80): List<SystemLogEntry> = withContext(Dispatchers.IO) {
        WorkspaceJsonParser.parseSystemLogs(workspace.getSystemLogsJson(limit.toLong()))
    }

    // ─── Timetable Structure Editor (Desktop StructureModal Parity) ──────────

    suspend fun saveTimetablePeriods(semester: Int, periods: List<TimetablePeriodDef>) = withContext(Dispatchers.IO) {
        val arr = JSONArray()
        periods.forEachIndexed { idx, p ->
            arr.put(
                JSONObject()
                    .put("id", p.id.ifBlank { "p${idx + 1}" })
                    .put("name", p.name.ifBlank { "Period ${idx + 1}" })
                    .put("startTime", p.startTime)
                    .put("endTime", p.endTime),
            )
        }
        workspace.saveTimetableStructureJson(semester.toLong(), arr.toString())
        notifyMutation()
    }

    // ─── Offline Rust AI + Optional BYOK Cloud AI ────────────────────────────

    fun getSelectedAiProvider(): AiProvider {
        val id = aiPrefs.getString("ai_provider", AiProvider.LOCAL_RUST.id)
        return AiProvider.entries.firstOrNull { it.id == id } ?: AiProvider.LOCAL_RUST
    }

    fun setSelectedAiProvider(provider: AiProvider) {
        aiPrefs.edit().putString("ai_provider", provider.id).apply()
    }

    fun getByokApiKey(provider: AiProvider): String =
        aiPrefs.getString("byok_key_${provider.id}", "").orEmpty()

    fun saveByokApiKey(provider: AiProvider, key: String) {
        aiPrefs.edit().putString("byok_key_${provider.id}", key.trim()).apply()
    }

    suspend fun askAssistant(question: String, semester: Int): LocalAssistantReply = withContext(Dispatchers.IO) {
        val provider = getSelectedAiProvider()
        val key = getByokApiKey(provider)
        if (provider != AiProvider.LOCAL_RUST && key.isNotBlank()) {
            val ctx = buildCompactAcademicContext(semester)
            val cloudText = runCatching { ByokAiClient.askCloud(provider, key, question, ctx) }
            if (cloudText.isSuccess) {
                return@withContext LocalAssistantReply(
                    reply = cloudText.getOrThrow(),
                    intent = "byok_cloud",
                    source = provider.label,
                )
            }
        }
        val raw = workspace.queryLocalAssistantJson(question, semester.toLong())
        WorkspaceJsonParser.parseAssistantReply(raw)
    }

    private suspend fun buildCompactAcademicContext(semester: Int): String {
        val dash = getDashboard(semester)
        val res = getResultsAnalytics()
        return buildString {
            appendLine("Student: ${dash.profile.name} | Semester $semester | Target: ${dash.profile.attendanceThreshold}%")
            appendLine("Overall Attendance: ${String.format(Locale.US, "%.1f", dash.summary.overallPercentage)}% (${dash.summary.totalAttended}/${dash.summary.totalClasses}, medical=${dash.summary.totalMedical})")
            appendLine("Subjects:")
            dash.subjects.forEach { s ->
                appendLine("- ${s.code} ${s.name}: ${String.format(Locale.US, "%.1f", s.percentage)}% (${s.physicalAttended}/${s.eligibleTotal}), ${s.statusMessage}, ${s.credits} cr")
            }
            if (res.hasData) {
                appendLine("IPU CGPA: ${String.format(Locale.US, "%.2f", res.cgpa)} | Credits: ${res.totalCredits} | Marks: ${res.totalScoredMarks.toInt()}/${res.totalMaxMarks.toInt()}")
                res.semesters.forEach { sem ->
                    appendLine("  Sem ${sem.semester}: SGPA ${String.format(Locale.US, "%.2f", sem.sgpa)} (${sem.totalCredits} cr)")
                }
            }
        }
    }

    // ─── Lossless 2-Way Sync & Offline Backup ────────────────────────────────

    suspend fun exportSyncSnapshot(): SyncSnapshotBundle = withContext(Dispatchers.IO) {
        val raw = workspace.exportSyncSnapshotJson()
        val obj = JSONObject(raw)
        SyncSnapshotBundle(
            hash = obj.optString("hash"),
            deviceId = obj.optString("device_id", "android-default"),
            payloadJson = obj.optJSONObject("payload")?.toString() ?: raw,
        )
    }

    /**
     * Atomically saves a timestamped local safety snapshot (`filesDir/safety_backups/`)
     * before any destructive import or reset so local data can never be lost unexpectedly.
     */
    suspend fun writeLocalSafetyBackup(reason: String = "auto"): File? = withContext(Dispatchers.IO) {
        runCatching {
            val bundle = exportSyncSnapshot()
            val dir = File(appContext.filesDir, "safety_backups").apply { mkdirs() }
            val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val tmp = File(dir, "safety_${reason}_$stamp.json.tmp")
            val dest = File(dir, "safety_${reason}_$stamp.json")
            tmp.writeText(bundle.payloadJson, Charsets.UTF_8)
            if (!tmp.renameTo(dest)) {
                tmp.copyTo(dest, overwrite = true)
                tmp.delete()
            }
            // Keep latest 5 local safety snapshots
            dir.listFiles { f -> f.isFile && f.name.endsWith(".json") }
                ?.sortedByDescending { it.lastModified() }
                ?.drop(5)
                ?.forEach { runCatching { it.delete() } }
            dest
        }.getOrNull()
    }

    suspend fun importBackupJson(rawJson: String): String = withContext(Dispatchers.IO) {
        val trimmed = rawJson.trim()
        require(trimmed.startsWith("{")) { "Invalid backup file: expected a Semester JSON snapshot." }
        runCatching { JSONObject(trimmed) }.getOrElse {
            throw IllegalArgumentException("Corrupted or unreadable JSON backup file.")
        }
        writeLocalSafetyBackup("pre_import")
        val result = workspace.importBackupJson(trimmed)
        runCatching { workspace.checkpointWal() }
        notifyMutation()
        result
    }

    suspend fun mergeRemoteSnapshotJson(remoteJson: String): String = withContext(Dispatchers.IO) {
        val trimmed = remoteJson.trim()
        require(trimmed.startsWith("{")) { "Invalid remote sync snapshot." }
        val result = workspace.mergeRemoteSnapshotJson(trimmed)
        notifyMutation(triggerCloudSync = false)
        result
    }

    suspend fun getMeta(key: String): String? = withContext(Dispatchers.IO) {
        workspace.getMeta(key)
    }

    suspend fun setMeta(key: String, value: String) = withContext(Dispatchers.IO) {
        workspace.setMeta(key, value)
    }

    suspend fun wipeAllData(): String = withContext(Dispatchers.IO) {
        writeLocalSafetyBackup("pre_wipe")
        val res = workspace.wipeAllData()
        runCatching { workspace.checkpointWal() }
        // Never trigger outbound cloud push right after local wipe so user can safely re-pull from Drive!
        notifyMutation(triggerCloudSync = false)
        res
    }

    // ─── Pure Rust Core Math Helpers ─────────────────────────────────────────

    fun calculatePercentage(attended: Int, total: Int): Double =
        coreCalculatePercentage(attended.coerceAtLeast(0).toUInt(), total.coerceAtLeast(0).toUInt())

    fun calculateMedicalBunkGuard(attended: Int, total: Int, medical: Int, target: Int): BunkGuard =
        coreCalculateMedicalBunkGuard(
            attended.coerceAtLeast(0).toUInt(),
            total.coerceAtLeast(0).toUInt(),
            medical.coerceAtLeast(0).toUInt(),
            target.coerceIn(1, 100).toUInt(),
        )

    fun simulateFutureAttendance(attended: Int, total: Int, futureClasses: Int, futureAttended: Int): Double =
        coreSimulateFutureAttendance(
            attended.coerceAtLeast(0).toUInt(),
            total.coerceAtLeast(0).toUInt(),
            futureClasses.coerceAtLeast(0).toUInt(),
            futureAttended.coerceAtLeast(0).toUInt(),
        )

    fun calculateRequiredSgpa(
        earnedCredits: Int,
        earnedGradePoints: Double,
        nextSemCredits: Int,
        targetCgpa: Double,
    ): Double = coreCalculateRequiredSgpa(
        earnedCredits.coerceAtLeast(0).toUInt(),
        earnedGradePoints,
        nextSemCredits.coerceAtLeast(1).toUInt(),
        targetCgpa,
    )

    fun mergeSnapshotsPure(localJson: String, remoteJson: String): String =
        coreMergeSyncSnapshots(localJson, remoteJson)

    companion object {
        private const val TAG = "WorkspaceRepository"

        @Volatile
        private var INSTANCE: WorkspaceRepository? = null

        fun getInstance(context: Context): WorkspaceRepository =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: WorkspaceRepository(context.applicationContext).also { INSTANCE = it }
            }

        fun todayIsoDate(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }
}
