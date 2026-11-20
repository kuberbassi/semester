package com.semester.app.core

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uniffi.semester_core.*
import java.io.File
import java.util.UUID

/**
 * Singleton repository wrapping the embedded Rust Core SQLite engine
 */
class CoreRepository private constructor(context: Context) {

    private val dbPath: String = File(context.filesDir, "semester_native.db").absolutePath
    val db: SemesterDb by lazy {
        SemesterDb.open(dbPath)
    }

    suspend fun getSubjects(semester: UInt? = null): List<Subject> = withContext(Dispatchers.IO) {
        db.getSubjects(semester)
    }

    suspend fun addSubject(
        name: String,
        code: String = "",
        professor: String = "",
        classroom: String = "",
        semester: UInt = 1u,
        subjectType: String = "theory",
        credits: UInt? = 4u,
        target: UInt = 75u,
        syllabus: String? = null
    ): Subject = withContext(Dispatchers.IO) {
        val subject = Subject(
            id = UUID.randomUUID().toString(),
            name = name,
            code = code,
            professor = professor,
            classroom = classroom,
            semester = semester,
            subjectType = subjectType,
            credits = credits,
            attended = 0u,
            total = 0u,
            target = target,
            syllabus = syllabus
        )
        db.addSubject(subject)
        subject
    }

    suspend fun markAttendance(
        subjectId: String,
        status: AttendanceStatus,
        date: String,
        notes: String? = null,
        logType: String = "Lecture"
    ): AttendanceLog = withContext(Dispatchers.IO) {
        val logId = UUID.randomUUID().toString()
        db.markAttendance(logId, subjectId, date, status, notes, logType)
    }

    suspend fun unmarkAttendance(logId: String): Boolean = withContext(Dispatchers.IO) {
        db.unmarkAttendance(logId)
    }

    suspend fun getAttendanceLogs(subjectId: String? = null, limit: UInt = 100u): List<AttendanceLog> = withContext(Dispatchers.IO) {
        db.getAttendanceLogs(subjectId, limit)
    }

    suspend fun getTimetableForDay(day: String): List<TimetableSlot> = withContext(Dispatchers.IO) {
        db.getTimetableForDay(day)
    }

    suspend fun saveTimetableSlot(slot: TimetableSlot) = withContext(Dispatchers.IO) {
        db.saveTimetableSlot(slot)
    }

    suspend fun getSemesterResults(): List<SemesterResultData> = withContext(Dispatchers.IO) {
        db.getSemesterResults()
    }

    suspend fun saveSemesterResult(result: SemesterResultData) = withContext(Dispatchers.IO) {
        db.saveSemesterResult(result)
    }

    suspend fun parseAndStoreIpuJson(jsonStr: String, semester: UInt): SemesterResultData = withContext(Dispatchers.IO) {
        val parsed = coreParseIpuResultsJson(jsonStr, semester)
        db.saveSemesterResult(parsed)
        parsed
    }

    suspend fun exportBackupJson(): String = withContext(Dispatchers.IO) {
        db.exportBackupJson()
    }

    suspend fun importBackupJson(jsonStr: String): SyncStats = withContext(Dispatchers.IO) {
        db.importBackupJson(jsonStr)
    }

    // Direct Rust Core Attendance Mathematics
    fun calculatePercentage(attended: UInt, total: UInt): Double {
        return coreCalculatePercentage(attended, total)
    }

    fun calculateBunkGuard(attended: UInt, total: UInt, target: UInt): BunkGuard {
        return coreCalculateBunkGuard(attended, total, target)
    }

    fun simulateFutureAttendance(attended: UInt, total: UInt, futureClasses: UInt, futureAttended: UInt): Double {
        return coreSimulateFutureAttendance(attended, total, futureClasses, futureAttended)
    }

    fun exportTimetableQr(slots: List<TimetableSlot>): String {
        return coreExportTimetableQr(slots)
    }

    fun importTimetableQr(payload: String): List<TimetableSlot> {
        return coreImportTimetableQr(payload)
    }

    companion object {
        @Volatile
        private var INSTANCE: CoreRepository? = null

        fun getInstance(context: Context): CoreRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: CoreRepository(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}
