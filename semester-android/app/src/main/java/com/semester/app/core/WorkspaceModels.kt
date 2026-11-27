package com.semester.app.core

import androidx.compose.runtime.Immutable
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.floor

@Immutable
data class WorkspaceProfile(
    val id: String = "local-owner",
    val name: String = "Student",
    val email: String = "",
    val picture: String = "",
    val college: String = "",
    val course: String = "B.Tech",
    val branch: String = "",
    val batch: String = "",
    val enrollmentNumber: String = "",
    val admissionYear: String = "",
    val currentSemester: Int = 3,
    val attendanceThreshold: Int = 75,
    val warningThreshold: Int = 76,
    val themeMode: String = "dark",
    val dashboardView: String = "liquid",
)

@Immutable
data class ManualCourseEntry(
    val id: String = "",
    val title: String,
    val platform: String = "coursera",
    val url: String = "",
    val progress: Int = 0,
    val enrolledDate: String = "",
    val targetCompletionDate: String = "",
    val instructor: String = "",
    val notes: String = "",
    val updatedAt: String = "",
)

@Immutable
data class SystemLogEntry(
    val id: String,
    val action: String,
    val description: String,
    val timestamp: String,
)

@Immutable
data class WorkspaceSubject(
    val id: String,
    val name: String,
    val code: String = "",
    val professor: String = "",
    val classroom: String = "",
    val semester: Int = 1,
    val subjectType: String = "theory",
    val categories: List<String> = listOf("Theory"),
    val credits: Int = 4,
    val attended: Int = 0, // raw attended including medical (Desktop parity)
    val total: Int = 0,    // raw total including medical (Desktop parity)
    val medicalCount: Int = 0,
    val target: Int = 75,
    val percentage: Double = 0.0,     // medical-adjusted: (attended - med) / (total - med)
    val rawPercentage: Double = 0.0,  // physical without medical: (attended - med) / total
    val safeToBunk: Int = 0,
    val classesNeeded: Int = 0,
    val isSafe: Boolean = true,
    val statusMessage: String = "No Classes Yet",
    val practicalTotal: Int = 10,
    val practicalCompleted: Int = 0,
    val practicalHardcopy: Boolean = false,
    val assignmentTotal: Int = 4,
    val assignmentCompleted: Int = 0,
    val assignmentHardcopy: Boolean = false,
    val syllabus: String = "",
) {
    val physicalAttended: Int get() = (attended - medicalCount).coerceAtLeast(0)
    val eligibleTotal: Int get() = (total - medicalCount).coerceAtLeast(0)
    val isPractical: Boolean
        get() = subjectType.equals("practical", true) ||
            categories.any { it.equals("Practical", true) }
}

@Immutable
data class DashboardSummary(
    val overallPercentage: Double = 0.0,
    val withoutMedicalPercentage: Double = 0.0,
    val totalAttended: Int = 0,
    val totalClasses: Int = 0,
    val totalMedical: Int = 0,
    val safeCount: Int = 0,
    val atRiskCount: Int = 0,
    val totalSafeBunks: Int = 0,
    val targetThreshold: Int = 75,
    val riskLevel: String = "No Data",
)

@Immutable
data class TodayClassItem(
    val id: String,
    val subjectId: String,
    val subjectName: String,
    val startTime: String,
    val endTime: String,
    val classroom: String,
    val slotType: String,
    val attendanceType: String,
    val marked: Boolean,
    val markedStatus: String?,
    val logId: String?,
)

@Immutable
data class DashboardSnapshot(
    val profile: WorkspaceProfile = WorkspaceProfile(),
    val semester: Int = 3,
    val subjects: List<WorkspaceSubject> = emptyList(),
    val todayClasses: List<TodayClassItem> = emptyList(),
    val summary: DashboardSummary = DashboardSummary(),
)

@Immutable
data class AttendanceLogEntry(
    val id: String,
    val subjectId: String,
    val subjectName: String = "",
    val date: String,
    val status: String,
    val notes: String = "",
    val substitutedBy: String = "",
    val semester: Int = 1,
    val logType: String = "Lecture",
    val timestamp: String = "",
)

@Immutable
data class CalendarDaySummary(
    val date: String,
    val logs: List<AttendanceLogEntry>,
) {
    val total: Int get() = logs.size
    val present: Int get() = logs.count { it.status in listOf("present", "late", "duty") }
    val absent: Int get() = logs.count { it.status == "absent" }
    val medical: Int get() = logs.count { it.status in listOf("medical", "approved_medical") }
    val cancelled: Int get() = logs.count { it.status in listOf("cancelled", "canceled", "excused") }
    val substituted: Int get() = logs.count { it.status == "substituted" }
}

@Immutable
data class TimetablePeriodDef(
    val id: String,
    val name: String,
    val startTime: String,
    val endTime: String,
)

@Immutable
data class TimetableDaySlot(
    val id: String,
    val semester: Int,
    val day: String,
    val periodNumber: Int,
    val startTime: String,
    val endTime: String,
    val subjectId: String,
    val subjectName: String,
    val room: String = "",
    val label: String = "",
    val slotType: String = "class",
) {
    val isNonClass: Boolean
        get() = slotType.equals("break", true) ||
            slotType.equals("free", true) ||
            slotType.equals("lunch", true) ||
            slotType.equals("gap", true)
}

@Immutable
data class TimetableData(
    val semester: Int = 3,
    val periods: List<TimetablePeriodDef> = emptyList(),
    val schedule: Map<String, List<TimetableDaySlot>> = emptyMap(),
) {
    fun slotsForDay(day: String): List<TimetableDaySlot> = schedule[day].orEmpty()
    fun classSlotsForDay(day: String): List<TimetableDaySlot> = slotsForDay(day).filter { !it.isNonClass }
    val allSlots: List<TimetableDaySlot> get() = schedule.values.flatten()
}

@Immutable
data class QrImportSummary(
    val slotsImported: Int = 0,
    val subjectsCreated: Int = 0,
    val subjectsLinked: Int = 0,
    val periodsImported: Int = 0,
)

@Immutable
data class ResultSubjectEntry(
    val code: String,
    val name: String,
    val credits: Int,
    val creditSource: String = "default",
    val matchedSubjectId: String? = null,
    val internalStr: String = "-",
    val externalStr: String = "-",
    val internalVal: Double = 0.0,
    val externalVal: Double = 0.0,
    val total: Double = 0.0,
    val maxMarks: Double = 100.0,
    val percentage: Double = 0.0,
    val grade: String = "-",
    val gradePoint: Int = 0,
    val creditPoints: Int = 0,
    val isPending: Boolean = false,
    val isBacklog: Boolean = false,
    val isAudit: Boolean = false,
)

@Immutable
data class SemesterResultRecord(
    val semester: Int,
    val semesterLabel: String,
    val sgpa: Double,
    val cumulativeCgpa: Double,
    val totalMarks: Double,
    val maxMarks: Double,
    val percentage: Double,
    val totalCredits: Int,
    val totalGradePoints: Double,
    val backlogs: Int,
    val distinctions: Int,
    val subjects: List<ResultSubjectEntry> = emptyList(),
)

@Immutable
data class ResultsAnalytics(
    val hasData: Boolean = false,
    val cgpa: Double = 0.0,
    val academicStrength: Double = 0.0,
    val totalScoredMarks: Double = 0.0,
    val totalMaxMarks: Double = 0.0,
    val totalCredits: Int = 0,
    val totalGradePoints: Double = 0.0,
    val totalSubjects: Int = 0,
    val creditsSyncedCount: Int = 0,
    val passRate: Double = 100.0,
    val distinctions: Int = 0,
    val backlogs: Int = 0,
    val enrollmentNumber: String = "",
    val studentName: String = "",
    val institute: String = "",
    val program: String = "",
    val batch: String = "",
    val admissionYear: String = "",
    val gradeDistribution: Map<String, Int> = emptyMap(),
    val semesters: List<SemesterResultRecord> = emptyList(),
)

@Immutable
data class NoteTodoItem(
    val id: String,
    val text: String,
    val completed: Boolean = false,
    val subject: String = "",
    val examDate: String = "", // YYYY-MM-DD for Exam Mode reminders
)

@Immutable
data class WorkspaceNote(
    val id: String,
    val title: String,
    val content: String = "",
    val isTodo: Boolean = false,
    val todos: List<NoteTodoItem> = emptyList(),
    val isPinned: Boolean = false,
    val isArchived: Boolean = false,
    val color: String = "",
    val category: String = "",
    val createdAt: String = "",
    val updatedAt: String = "",
) {
    val isExamMode: Boolean get() = category.equals("exam", ignoreCase = true)
}

@Immutable
data class LocalAssistantReply(
    val reply: String,
    val intent: String = "general",
    val source: String = "local_rust",
)

@Immutable
data class CloudBackupItem(
    val fileId: String,
    val name: String,
    val modifiedTime: String,
    val sizeBytes: Long = 0L,
)

@Immutable
data class DriveSyncState(
    val connected: Boolean = false,
    val accountEmail: String = "",
    val autoSyncEnabled: Boolean = true,
    val isSyncing: Boolean = false,
    val lastSyncTime: String = "",
    val lastSyncSummary: String = "Not synced yet",
    val lastError: String? = null,
    val deviceId: String = "",
    val customClientId: String = "",
)

object WorkspaceJsonParser {

    private fun JSONObject.optDoubleLoose(vararg keys: String, fallback: Double = 0.0): Double {
        for (k in keys) {
            if (!has(k) || isNull(k)) continue
            val v = opt(k)
            when (v) {
                is Number -> return v.toDouble()
                is String -> v.trim().toDoubleOrNull()?.let { return it }
            }
        }
        return fallback
    }

    private fun JSONObject.optIntLoose(vararg keys: String, fallback: Int = 0): Int =
        optDoubleLoose(*keys, fallback = fallback.toDouble()).toInt()

    fun parseProfile(raw: String): WorkspaceProfile {
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return WorkspaceProfile()
        return parseProfileObj(o)
    }

    fun parseProfileObj(o: JSONObject): WorkspaceProfile {
        val prefs = o.optJSONObject("preferences")
        return WorkspaceProfile(
            id = o.optString("id", o.optString("user_id", "local-owner")),
            name = o.optString("name", "Student"),
            email = o.optString("email", ""),
            picture = o.optString("picture", ""),
            college = o.optString("college", ""),
            course = o.optString("course", "B.Tech"),
            branch = o.optString("branch", ""),
            batch = o.optString("batch", ""),
            enrollmentNumber = o.optString("enrollment_number", ""),
            admissionYear = o.optString("admission_year", ""),
            currentSemester = o.optIntLoose("current_semester", "semester", fallback = 3).coerceIn(1, 8),
            attendanceThreshold = o.optIntLoose("attendance_threshold", fallback = 75).coerceIn(50, 95),
            warningThreshold = o.optIntLoose("warning_threshold", fallback = 76).coerceIn(50, 98),
            themeMode = prefs?.optString("theme", "dark").orEmpty().ifBlank { "dark" },
            dashboardView = prefs?.optString("compact_mode", "liquid").orEmpty().ifBlank { "liquid" },
        )
    }

    fun parseManualCourses(raw: String): List<ManualCourseEntry> {
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                add(
                    ManualCourseEntry(
                        id = o.optString("id", o.optString("_id", "")),
                        title = o.optString("title", "Untitled Course"),
                        platform = o.optString("platform", "custom"),
                        url = o.optString("url", ""),
                        progress = o.optIntLoose("progress", fallback = 0).coerceIn(0, 100),
                        enrolledDate = o.optString("enrolledDate", ""),
                        targetCompletionDate = o.optString("targetCompletionDate", ""),
                        instructor = o.optString("instructor", ""),
                        notes = o.optString("notes", ""),
                        updatedAt = o.optString("updated_at", ""),
                    ),
                )
            }
        }
    }

    fun parseSystemLogs(raw: String): List<SystemLogEntry> {
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                add(
                    SystemLogEntry(
                        id = o.optString("id", "$i"),
                        action = o.optString("action", "Event"),
                        description = o.optString("description", ""),
                        timestamp = o.optString("timestamp", ""),
                    ),
                )
            }
        }
    }

    fun parseSubject(o: JSONObject): WorkspaceSubject {
        val attended = o.optIntLoose("attended", fallback = 0)
        val total = o.optIntLoose("total", fallback = 0)
        val med = o.optIntLoose("medical_leave_count", "medicalCount", fallback = 0)
        val target = o.optIntLoose("target", fallback = 75).coerceIn(50, 99)

        val physAtt = (attended - med).coerceAtLeast(0)
        val eligTot = (total - med).coerceAtLeast(0)
        val effPct = if (o.has("attendance_percentage")) {
            o.optDoubleLoose("attendance_percentage", fallback = 0.0)
        } else if (eligTot > 0) {
            (physAtt * 100.0) / eligTot
        } else {
            0.0
        }
        val rawPct = if (total > 0) (physAtt * 100.0) / total else 0.0

        val targetFrac = target / 100.0
        val isSafe = eligTot == 0 || effPct >= target.toDouble()
        val safeBunk = if (eligTot > 0 && isSafe && targetFrac > 0.0) {
            floor((physAtt / targetFrac) - eligTot).toInt().coerceAtLeast(0)
        } else {
            0
        }
        val needed = if (eligTot > 0 && !isSafe && targetFrac < 1.0) {
            ceil(((targetFrac * eligTot) - physAtt) / (1.0 - targetFrac)).toInt().coerceAtLeast(1)
        } else {
            0
        }
        val statusMsg = when {
            eligTot == 0 -> "No classes recorded"
            isSafe && safeBunk > 0 -> "Safe to skip $safeBunk"
            isSafe -> "On target ($target%)"
            else -> "Attend next $needed"
        }

        val catsArr = o.optJSONArray("categories")
        val cats = buildList {
            if (catsArr != null) {
                for (i in 0 until catsArr.length()) {
                    val s = catsArr.optString(i)
                    if (s.isNotBlank()) add(s)
                }
            }
        }.ifEmpty { listOf("Theory") }

        val prac = o.optJSONObject("practicals")
        val asgn = o.optJSONObject("assignments")

        return WorkspaceSubject(
            id = o.optString("id", o.optString("_id", "")),
            name = o.optString("name", "Untitled"),
            code = o.optString("code", ""),
            professor = o.optString("professor", ""),
            classroom = o.optString("classroom", ""),
            semester = o.optIntLoose("semester", fallback = 1).coerceIn(1, 8),
            subjectType = o.optString("type", o.optString("subject_type", "theory")),
            categories = cats,
            credits = o.optIntLoose("credits", fallback = 3),
            attended = attended,
            total = total,
            medicalCount = med,
            target = target,
            percentage = effPct,
            rawPercentage = rawPct,
            safeToBunk = safeBunk,
            classesNeeded = needed,
            isSafe = isSafe,
            statusMessage = statusMsg,
            practicalTotal = prac?.optIntLoose("total", fallback = 10) ?: 10,
            practicalCompleted = prac?.optIntLoose("completed", fallback = 0) ?: 0,
            practicalHardcopy = prac?.optBoolean("hardcopy", false) ?: false,
            assignmentTotal = asgn?.optIntLoose("total", fallback = 4) ?: 4,
            assignmentCompleted = asgn?.optIntLoose("completed", fallback = 0) ?: 0,
            assignmentHardcopy = asgn?.optBoolean("hardcopy", false) ?: false,
            syllabus = o.optString("syllabus", ""),
        )
    }

    fun parseSubjectsList(raw: String): List<WorkspaceSubject> {
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                arr.optJSONObject(i)?.let { add(parseSubject(it)) }
            }
        }
    }

    fun parseDashboard(raw: String, fallbackSem: Int): DashboardSnapshot {
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return DashboardSnapshot(semester = fallbackSem)
        val profile = o.optJSONObject("user")?.let(::parseProfileObj) ?: WorkspaceProfile(currentSemester = fallbackSem)
        val subjectsArr = o.optJSONArray("subjects") ?: JSONArray()
        val subjects = buildList {
            for (i in 0 until subjectsArr.length()) {
                subjectsArr.optJSONObject(i)?.let { add(parseSubject(it)) }
            }
        }
        val todayArr = o.optJSONArray("today_classes") ?: JSONArray()
        val todayClasses = buildList {
            for (i in 0 until todayArr.length()) {
                val c = todayArr.optJSONObject(i) ?: continue
                add(
                    TodayClassItem(
                        id = c.optString("id", ""),
                        subjectId = c.optString("subject_id", ""),
                        subjectName = c.optString("subject_name", c.optString("name", "")),
                        startTime = c.optString("start_time", ""),
                        endTime = c.optString("end_time", ""),
                        classroom = c.optString("classroom", ""),
                        slotType = c.optString("type", "class"),
                        attendanceType = c.optString("attendance_type", "Lecture"),
                        marked = c.optBoolean("marked", false),
                        markedStatus = if (c.isNull("marked_status")) null else c.optString("marked_status"),
                        logId = if (c.isNull("log_id")) null else c.optString("log_id"),
                    ),
                )
            }
        }
        val sumObj = o.optJSONObject("summary")
        val summary = DashboardSummary(
            overallPercentage = sumObj?.optDoubleLoose("overall_percentage", fallback = o.optDoubleLoose("overall_attendance"))
                ?: o.optDoubleLoose("overall_attendance"),
            withoutMedicalPercentage = o.optDoubleLoose("attendance_without_medical"),
            totalAttended = sumObj?.optIntLoose("total_attended", fallback = subjects.sumOf { it.physicalAttended })
                ?: subjects.sumOf { it.physicalAttended },
            totalClasses = sumObj?.optIntLoose("total_classes", fallback = subjects.sumOf { it.eligibleTotal })
                ?: subjects.sumOf { it.eligibleTotal },
            totalMedical = o.optIntLoose("medical_leave_count", fallback = subjects.sumOf { it.medicalCount }),
            safeCount = subjects.count { it.isSafe },
            atRiskCount = subjects.count { !it.isSafe },
            totalSafeBunks = sumObj?.optIntLoose("safe_bunks_remaining", fallback = subjects.sumOf { it.safeToBunk })
                ?: subjects.sumOf { it.safeToBunk },
            targetThreshold = profile.attendanceThreshold,
            riskLevel = sumObj?.optString("risk_level", "No Data") ?: "No Data",
        )
        return DashboardSnapshot(
            profile = profile,
            semester = o.optIntLoose("semester", fallback = fallbackSem),
            subjects = subjects,
            todayClasses = todayClasses,
            summary = summary,
        )
    }

    fun parseAttendanceLog(o: JSONObject): AttendanceLogEntry = AttendanceLogEntry(
        id = o.optString("id", ""),
        subjectId = o.optString("subject_id", ""),
        subjectName = o.optString("subject_name", ""),
        date = o.optString("date", ""),
        status = o.optString("status", "present"),
        notes = o.optString("notes", ""),
        substitutedBy = o.optString("substituted_by", ""),
        semester = o.optIntLoose("semester", fallback = 1),
        logType = o.optString("type", o.optString("log_type", "Lecture")),
        timestamp = o.optString("timestamp", ""),
    )

    fun parseAttendanceLogsList(raw: String): List<AttendanceLogEntry> {
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                arr.optJSONObject(i)?.let { add(parseAttendanceLog(it)) }
            }
        }
    }

    fun parseTodayClassesList(raw: String): List<TodayClassItem> {
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val c = arr.optJSONObject(i) ?: continue
                add(
                    TodayClassItem(
                        id = c.optString("id", ""),
                        subjectId = c.optString("subject_id", ""),
                        subjectName = c.optString("subject_name", c.optString("name", "")),
                        startTime = c.optString("start_time", ""),
                        endTime = c.optString("end_time", ""),
                        classroom = c.optString("classroom", ""),
                        slotType = c.optString("type", "class"),
                        attendanceType = c.optString("attendance_type", "Lecture"),
                        marked = c.optBoolean("marked", false),
                        markedStatus = if (c.isNull("marked_status")) null else c.optString("marked_status"),
                        logId = if (c.isNull("log_id")) null else c.optString("log_id"),
                    ),
                )
            }
        }
    }

    fun parseQrImportSummary(raw: String): QrImportSummary {
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return QrImportSummary()
        return QrImportSummary(
            slotsImported = o.optIntLoose("slots_imported", fallback = 0),
            subjectsCreated = o.optIntLoose("subjects_created", fallback = 0),
            subjectsLinked = o.optIntLoose("subjects_linked", fallback = 0),
            periodsImported = o.optIntLoose("periods_imported", fallback = 0),
        )
    }

    fun parseCalendarByDate(raw: String): Map<String, CalendarDaySummary> {
        val logs = parseAttendanceLogsList(raw)
        return logs.groupBy { it.date.take(10) }
            .mapValues { (date, dayLogs) -> CalendarDaySummary(date = date, logs = dayLogs) }
    }

    fun parseTimetable(raw: String, fallbackSem: Int): TimetableData {
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return TimetableData(semester = fallbackSem)
        val periodsArr = o.optJSONArray("periods") ?: JSONArray()
        val periods = buildList {
            for (i in 0 until periodsArr.length()) {
                val p = periodsArr.optJSONObject(i) ?: continue
                add(
                    TimetablePeriodDef(
                        id = p.optString("id", "p_${i + 1}"),
                        name = p.optString("name", "Period ${i + 1}"),
                        startTime = p.optString("startTime", p.optString("start_time", "09:00 AM")),
                        endTime = p.optString("endTime", p.optString("end_time", "10:00 AM")),
                    ),
                )
            }
        }
        val scheduleMap = linkedMapOf<String, List<TimetableDaySlot>>()
        val schedObj = o.optJSONObject("schedule")
        if (schedObj != null) {
            val keys = schedObj.keys()
            while (keys.hasNext()) {
                val day = keys.next()
                val arr = schedObj.optJSONArray(day) ?: continue
                val dayList = buildList {
                    for (i in 0 until arr.length()) {
                        val s = arr.optJSONObject(i) ?: continue
                        val stype = s.optString("type", "class").ifBlank { "class" }
                        add(
                            TimetableDaySlot(
                                id = s.optString("id", s.optString("_id", "${day}_$i")),
                                semester = s.optIntLoose("semester", fallback = fallbackSem),
                                day = day,
                                periodNumber = i + 1,
                                startTime = s.optString("start_time", s.optString("startTime", "09:00 AM")),
                                endTime = s.optString("end_time", s.optString("endTime", "10:00 AM")),
                                subjectId = s.optString("subject_id", ""),
                                subjectName = s.optString("subject_name", s.optString("label", "")),
                                room = s.optString("classroom", s.optString("room", "")),
                                label = s.optString("label", ""),
                                slotType = stype,
                            ),
                        )
                    }
                }
                scheduleMap[day] = dayList
            }
        }
        return TimetableData(
            semester = o.optIntLoose("semester", fallback = fallbackSem),
            periods = periods,
            schedule = scheduleMap,
        )
    }

    fun parseResultsAnalytics(raw: String): ResultsAnalytics {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || trimmed == "null") return ResultsAnalytics(hasData = false)
        val o = runCatching { JSONObject(trimmed) }.getOrNull() ?: return ResultsAnalytics(hasData = false)
        val info = o.optJSONObject("student_info") ?: JSONObject()
        val semsArr = o.optJSONArray("semesters") ?: JSONArray()
        if (semsArr.length() == 0) return ResultsAnalytics(hasData = false)

        val semesters = buildList {
            for (i in 0 until semsArr.length()) {
                val semObj = semsArr.optJSONObject(i) ?: continue
                val subArr = semObj.optJSONArray("subjects") ?: JSONArray()
                val subjects = buildList {
                    for (j in 0 until subArr.length()) {
                        val sub = subArr.optJSONObject(j) ?: continue
                        val isPending = sub.optBoolean("is_pending", false)
                        val internalStr = sub.optString("internal", "-")
                        val externalStr = sub.optString("external", "-")
                        val total = sub.optDoubleLoose("total_marks", "total", fallback = 0.0)
                        val maxM = sub.optDoubleLoose("max_marks", fallback = 100.0).coerceAtLeast(1.0)
                        val pct = sub.optDoubleLoose("percentage", fallback = (total / maxM) * 100.0)
                        val grade = sub.optString("grade", "-")
                        val credits = sub.optIntLoose("credits", fallback = 0)
                        val gp = sub.optIntLoose("grade_point", fallback = 0)
                        add(
                            ResultSubjectEntry(
                                code = sub.optString("code", ""),
                                name = sub.optString("name", "Paper"),
                                credits = credits,
                                creditSource = sub.optString("credit_source", "default"),
                                matchedSubjectId = if (sub.isNull("matched_subject_id")) null else sub.optString("matched_subject_id"),
                                internalStr = internalStr,
                                externalStr = externalStr,
                                internalVal = internalStr.toDoubleOrNull() ?: 0.0,
                                externalVal = externalStr.toDoubleOrNull() ?: 0.0,
                                total = total,
                                maxMarks = maxM,
                                percentage = pct,
                                grade = grade,
                                gradePoint = gp,
                                creditPoints = sub.optIntLoose("credit_points", fallback = credits * gp),
                                isPending = isPending,
                                isBacklog = !isPending && grade.equals("F", true),
                                isAudit = credits == 0,
                            ),
                        )
                    }
                }
                val totalMarks = semObj.optDoubleLoose("total_marks", fallback = subjects.filter { !it.isPending }.sumOf { it.total })
                val maxMarks = semObj.optDoubleLoose("max_marks", fallback = subjects.filter { !it.isPending }.sumOf { it.maxMarks })
                val pct = if (maxMarks > 0.0) (totalMarks / maxMarks) * 100.0 else 0.0
                val semNum = semObj.optIntLoose("semester", "semester_num", fallback = i + 1)
                add(
                    SemesterResultRecord(
                        semester = semNum,
                        semesterLabel = semObj.optString("semester_label", "Semester $semNum"),
                        sgpa = semObj.optDoubleLoose("sgpa", fallback = 0.0),
                        cumulativeCgpa = semObj.optDoubleLoose("cumulative_cgpa", fallback = 0.0),
                        totalMarks = totalMarks,
                        maxMarks = maxMarks,
                        percentage = pct,
                        totalCredits = semObj.optIntLoose("total_credits", fallback = subjects.sumOf { it.credits }),
                        totalGradePoints = semObj.optDoubleLoose("total_grade_points", fallback = subjects.sumOf { it.creditPoints }.toDouble()),
                        backlogs = subjects.count { it.isBacklog },
                        distinctions = subjects.count { !it.isPending && it.percentage >= 75.0 },
                        subjects = subjects,
                    ),
                )
            }
        }

        val allSubjects = semesters.flatMap { it.subjects }.filter { !it.isPending }
        val backlogs = allSubjects.count { it.isBacklog }
        val distinctions = allSubjects.count { it.percentage >= 75.0 }
        val passRate = if (allSubjects.isNotEmpty()) ((allSubjects.size - backlogs) * 100.0) / allSubjects.size else 100.0
        val gradeDistObj = o.optJSONObject("gradeDistribution")
        val gradeDist = linkedMapOf<String, Int>()
        if (gradeDistObj != null) {
            val keys = gradeDistObj.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                gradeDist[k] = gradeDistObj.optInt(k, 0)
            }
        }

        return ResultsAnalytics(
            hasData = true,
            cgpa = o.optDoubleLoose("cgpa", fallback = 0.0),
            academicStrength = o.optDoubleLoose("academicStrength", fallback = 0.0),
            totalScoredMarks = semesters.sumOf { it.totalMarks },
            totalMaxMarks = semesters.sumOf { it.maxMarks },
            totalCredits = o.optIntLoose("totalCredits", fallback = semesters.sumOf { it.totalCredits }),
            totalGradePoints = o.optDoubleLoose("totalGradePoints", fallback = semesters.sumOf { it.totalGradePoints }),
            totalSubjects = o.optIntLoose("totalSubjects", fallback = allSubjects.size),
            creditsSyncedCount = o.optIntLoose("creditsSyncedCount", fallback = 0),
            passRate = passRate,
            distinctions = distinctions,
            backlogs = backlogs,
            enrollmentNumber = o.optString("enrollment_number", info.optString("roll_no", "")),
            studentName = info.optString("name", ""),
            institute = info.optString("institution", info.optString("institute", "")),
            program = info.optString("programme", info.optString("program", "")),
            batch = info.optString("batch", ""),
            admissionYear = info.optString("admission_year", ""),
            gradeDistribution = gradeDist,
            semesters = semesters.sortedBy { it.semester },
        )
    }

    fun parseNotes(raw: String): List<WorkspaceNote> {
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val todosArr = o.optJSONArray("todos") ?: JSONArray()
                val todos = buildList {
                    for (j in 0 until todosArr.length()) {
                        val t = todosArr.optJSONObject(j) ?: continue
                        add(
                            NoteTodoItem(
                                id = t.optString("id", "t_$j"),
                                text = t.optString("text", ""),
                                completed = t.optBoolean("completed", false),
                                subject = t.optString("subject", ""),
                                examDate = t.optString("exam_date", t.optString("examDate", "")),
                            ),
                        )
                    }
                }
                add(
                    WorkspaceNote(
                        id = o.optString("id", ""),
                        title = o.optString("title", "Untitled Note"),
                        content = o.optString("content", ""),
                        isTodo = o.optBoolean("is_todo", false),
                        todos = todos,
                        isPinned = o.optBoolean("is_pinned", false),
                        isArchived = o.optBoolean("is_archived", false),
                        color = o.optString("color", ""),
                        category = o.optString("category", ""),
                        createdAt = o.optString("created_at", ""),
                        updatedAt = o.optString("updated_at", ""),
                    ),
                )
            }
        }
    }

    fun parseAssistantReply(raw: String): LocalAssistantReply {
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return LocalAssistantReply(raw)
        return LocalAssistantReply(
            reply = o.optString("reply", o.optString("response", raw)),
            intent = o.optString("intent", "general"),
            source = o.optString("source", "local_rust"),
        )
    }
}

/**
 * AM/PM and 24-hour time parser matching Desktop & Rust workspace.rs (`"08:30 AM"`, `"03:05 PM"`, `"14:15"`).
 */
fun parseFlexibleTimeMinutes(raw: String): Int? {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return null
    val tokens = trimmed.split(Regex("\\s+"))
    val timePart = tokens.firstOrNull() ?: return null
    val modifier = tokens.getOrNull(1)?.uppercase().orEmpty()
    val hm = timePart.split(":")
    if (hm.size != 2) return null
    var h = hm[0].toIntOrNull() ?: return null
    val m = hm[1].toIntOrNull() ?: return null
    if (modifier == "PM" && h < 12) h += 12
    if (modifier == "AM" && h == 12) h = 0
    return h * 60 + m
}

/**
 * Smart, human-readable condensed subject name for tight UI chips (Timetable Slot Picker,
 * Substitution Selector, etc.). Keeps short names intact; intelligently abbreviates long
 * names while preserving Roman numerals (I, II, III) and Lab/Practical suffixes.
 */
fun smartSubjectShortName(name: String, code: String = "", maxLen: Int = 18): String {
    val clean = name.trim().replace(Regex("\\s+"), " ")
    if (clean.isEmpty()) return code.trim().ifBlank { "Course" }
    if (clean.length <= maxLen) return clean

    val lower = clean.lowercase()
    val hasLab = lower.contains("lab") || lower.contains("practical")
    val romanMatch = Regex("""(?:^|[\s\-–])(III|II|IV|I)(?:$|[\s\-–])""", RegexOption.IGNORE_CASE).find(clean)
    val roman = romanMatch?.groupValues?.getOrNull(1)?.uppercase().orEmpty()

    // Common well-known engineering/college subject abbreviations
    val knownBase = when {
        lower.contains("engineering graphics") || lower.contains("engineering drawing") -> "Eng. Graphics"
        lower.contains("human values") || lower.contains("hvpe") -> "HVPE"
        lower.contains("environmental") -> "EVS"
        lower.contains("communication skills") -> "Comm. Skills"
        lower.contains("applied mathematics") -> "Applied Math"
        lower.contains("applied physics") -> "Applied Physics"
        lower.contains("applied chemistry") -> "Applied Chem"
        lower.contains("data structures") -> "DSA"
        lower.contains("operating system") -> "OS"
        lower.contains("database management") -> "DBMS"
        lower.contains("computer network") -> "CN"
        lower.contains("computer organization") -> "COA"
        lower.contains("object oriented") -> "OOPS"
        lower.contains("programming in c") -> "Prog. in C"
        lower.contains("software engineering") -> "SE"
        lower.contains("manufacturing process") -> "Mfg. Process"
        lower.contains("electrical science") -> "Elec. Science"
        lower.contains("engineering mechanics") -> "Eng. Mech."
        lower.contains("discrete math") -> "Discrete Math"
        lower.contains("theory of computation") -> "TOC"
        lower.contains("compiler design") -> "Compiler"
        lower.contains("artificial intelligence") -> "AI"
        lower.contains("machine learning") -> "ML"
        lower.contains("indian constitution") -> "Constitution"
        else -> null
    }
    if (knownBase != null) {
        return buildString {
            append(knownBase)
            if (roman.isNotEmpty() && !knownBase.endsWith(roman)) append(" $roman")
            if (hasLab && !knownBase.lowercase().contains("lab")) append(" Lab")
        }.take(maxLen)
    }

    // Build smart acronym from significant words (skipping filler words, roman numerals & "lab")
    val stopWords = setOf("and", "of", "in", "for", "to", "the", "a", "an", "with", "using", "&", "-", "–", "lab", "practical", "laboratory", "i", "ii", "iii", "iv")
    val words = clean.split(Regex("[\\s\\-–/&()]+")).filter { it.isNotBlank() }
    val sig = words.filter { it.lowercase() !in stopWords }
    if (sig.size >= 2) {
        val acro = sig.joinToString("") { it.first().uppercase() }
        val built = buildString {
            append(acro)
            if (roman.isNotEmpty()) append(" $roman")
            if (hasLab) append(" Lab")
        }
        if (built.length in 2..maxLen) return built
    }
    return clean.take(maxLen - 1).trimEnd() + "…"
}
