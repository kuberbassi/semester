package com.semester.app.notifications

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.semester.app.MainActivity
import com.semester.app.R
import com.semester.app.core.WorkspaceRepository
import com.semester.app.core.parseFlexibleTimeMinutes
import com.semester.app.widget.SemesterGlanceWidget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Clean, lightweight Schedule-Only Period & Exam Date Notification System:
 * - Pre-class alerts based strictly on your active Semester timetable (zero attendance nagging).
 * - Google-Calendar-style upcoming Exam / Practical / Datesheet alerts (day-before 8:00 AM & morning 7:30 AM)
 *   driven directly from your Exam Mode checklists.
 */
object ScheduleAlertManager {

    private const val CHANNEL_ID = "semester_class_schedule"
    private const val CHANNEL_NAME = "Class Schedule"
    private const val CHANNEL_DESC = "Clean reminders before scheduled classes and labs"

    private const val EXAM_CHANNEL_ID = "semester_exam_dates"
    private const val EXAM_CHANNEL_NAME = "Exam & Practical Dates"
    private const val EXAM_CHANNEL_DESC = "Upcoming exam, practical viva, and datesheet reminders"

    private const val PREFS = "semester_schedule_alert_prefs"
    private const val KEY_ENABLED = "alerts_enabled"
    private const val KEY_LEAD_MINS = "alert_lead_minutes"
    private const val KEY_ACTIVE_IDS = "scheduled_request_codes"
    private const val KEY_EXAM_IDS = "scheduled_exam_codes"

    private const val ACTION_PERIOD_ALERT = "com.semester.app.ACTION_PERIOD_ALERT"
    private const val ACTION_EXAM_ALERT = "com.semester.app.ACTION_EXAM_ALERT"
    private const val ACTION_DAILY_REFRESH = "com.semester.app.ACTION_DAILY_SCHEDULE_REFRESH"
    private const val EXTRA_SUBJECT = "extra_subject"
    private const val EXTRA_TIME_RANGE = "extra_time_range"
    private const val EXTRA_ROOM = "extra_room"
    private const val EXTRA_LEAD = "extra_lead"
    private const val EXTRA_NOTIF_ID = "extra_notif_id"
    private const val EXTRA_EXAM_TITLE = "extra_exam_title"
    private const val EXTRA_EXAM_BODY = "extra_exam_body"
    private const val DAILY_REFRESH_REQ_CODE = 90_999

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT).apply {
                        description = CHANNEL_DESC
                        enableVibration(true)
                        setShowBadge(false)
                    },
                )
            }
            if (nm.getNotificationChannel(EXAM_CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(EXAM_CHANNEL_ID, EXAM_CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                        description = EXAM_CHANNEL_DESC
                        enableVibration(true)
                        setShowBadge(true)
                    },
                )
            }
        }
    }

    fun isEnabled(context: Context): Boolean =
        hasNotificationPermission(context) &&
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, true)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ENABLED, enabled)
            .apply()
        if (enabled) {
            rescheduleAsync(context)
        } else {
            cancelAll(context)
        }
    }

    fun getLeadMinutes(context: Context): Int =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_LEAD_MINS, 5).coerceIn(0, 30)

    fun setLeadMinutes(context: Context, minutes: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(KEY_LEAD_MINS, minutes.coerceIn(0, 30))
            .apply()
        if (isEnabled(context)) rescheduleAsync(context)
    }

    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    fun rescheduleAsync(context: Context) {
        val appCtx = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            runCatching { rescheduleToday(appCtx) }
        }
    }

    /**
     * Cancels stale alarms and arms:
     * 1. Clean pre-class alerts for today's remaining timetable classes.
     * 2. Google-Calendar-style Exam / Practical Date alerts (1 day before at 8:00 AM + exam morning at 7:30 AM)
     *    for all active Exam Mode checklist dates within the next 30 days.
     * 3. Daily 6:30 AM refresh alarm so tomorrow's classes and exams arm automatically.
     */
    suspend fun rescheduleToday(context: Context) {
        ensureChannel(context)
        cancelAll(context)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val repo = WorkspaceRepository.getInstance(context)
        val nowMs = System.currentTimeMillis()
        val scheduledCodes = mutableSetOf<String>()
        val scheduledExamCodes = mutableSetOf<String>()

        // 1. Class Schedule Alerts (when enabled)
        if (isEnabled(context)) {
            val profile = runCatching { repo.getProfile() }.getOrNull()
            val sem = profile?.currentSemester ?: 1
            val timetable = runCatching { repo.getTimetable(sem) }.getOrNull()
            val todayName = SimpleDateFormat("EEEE", Locale.ENGLISH).format(Date())
            val slots = timetable?.classSlotsForDay(todayName)
                .orEmpty()
                .sortedBy { parseFlexibleTimeMinutes(it.startTime) ?: Int.MAX_VALUE }
            val leadMinutes = getLeadMinutes(context)

            slots.forEachIndexed { index, slot ->
                val startMins = parseFlexibleTimeMinutes(slot.startTime) ?: return@forEachIndexed
                val triggerCal = Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, startMins / 60)
                    set(Calendar.MINUTE, startMins % 60)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                    add(Calendar.MINUTE, -leadMinutes)
                }
                val triggerMs = triggerCal.timeInMillis
                if (triggerMs <= nowMs + 5_000L) return@forEachIndexed

                val reqCode = 91_000 + index
                val intent = Intent(context, ScheduleAlertReceiver::class.java).apply {
                    action = ACTION_PERIOD_ALERT
                    putExtra(EXTRA_SUBJECT, slot.subjectName.ifBlank { slot.label.ifBlank { "Scheduled Class" } })
                    putExtra(EXTRA_TIME_RANGE, "${slot.startTime} – ${slot.endTime}")
                    putExtra(EXTRA_ROOM, slot.room)
                    putExtra(EXTRA_LEAD, leadMinutes)
                    putExtra(EXTRA_NOTIF_ID, reqCode)
                }
                val pi = PendingIntent.getBroadcast(
                    context,
                    reqCode,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, pi)
                scheduledCodes.add(reqCode.toString())
            }
        }

        // 2. Exam Mode Date Alerts (Google Calendar birthday-style upcoming exam alerts)
        val notes = runCatching { repo.getNotes() }.getOrDefault(emptyList())
        val isoFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val prettyFmt = SimpleDateFormat("EEE, dd MMM", Locale.ENGLISH)
        var examCode = 95_000
        val maxWindowMs = nowMs + 30L * 24L * 60L * 60L * 1000L

        for (note in notes) {
            if (note.isArchived || !note.isTodo) continue
            for (item in note.todos) {
                if (item.completed || item.examDate.isBlank()) continue
                val parsed = runCatching { isoFmt.parse(item.examDate.trim()) }.getOrNull() ?: continue
                val prettyDate = prettyFmt.format(parsed)
                val subjectName = item.subject.ifBlank { item.text.ifBlank { note.title } }
                val labelDetail = item.text.takeIf { it.isNotBlank() && !it.equals(subjectName, true) }
                    ?: note.title.ifBlank { "Scheduled Exam" }

                // (a0) 3-Day Heads-Up Reminder: 3 days before at 8:00 AM
                val headsUpCal = Calendar.getInstance().apply {
                    time = parsed
                    add(Calendar.DAY_OF_YEAR, -3)
                    set(Calendar.HOUR_OF_DAY, 8)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }
                if (headsUpCal.timeInMillis in (nowMs + 5_000L)..maxWindowMs && examCode < 95_200) {
                    val code = examCode++
                    scheduleExamAlarm(
                        context = context,
                        alarmManager = alarmManager,
                        reqCode = code,
                        triggerMs = headsUpCal.timeInMillis,
                        title = "In 3 Days: $subjectName",
                        body = "$labelDetail • $prettyDate",
                    )
                    scheduledExamCodes.add(code.toString())
                }

                // (a) Eve Reminder: 1 day before at 8:00 AM
                val eveCal = Calendar.getInstance().apply {
                    time = parsed
                    add(Calendar.DAY_OF_YEAR, -1)
                    set(Calendar.HOUR_OF_DAY, 8)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }
                if (eveCal.timeInMillis in (nowMs + 5_000L)..maxWindowMs && examCode < 95_200) {
                    val code = examCode++
                    scheduleExamAlarm(
                        context = context,
                        alarmManager = alarmManager,
                        reqCode = code,
                        triggerMs = eveCal.timeInMillis,
                        title = "Tomorrow: $subjectName",
                        body = "$labelDetail • $prettyDate",
                    )
                    scheduledExamCodes.add(code.toString())
                }

                // (b) Morning Reminder: Exam Day at 7:30 AM
                val dayCal = Calendar.getInstance().apply {
                    time = parsed
                    set(Calendar.HOUR_OF_DAY, 7)
                    set(Calendar.MINUTE, 30)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }
                if (dayCal.timeInMillis in (nowMs + 5_000L)..maxWindowMs && examCode < 95_200) {
                    val code = examCode++
                    scheduleExamAlarm(
                        context = context,
                        alarmManager = alarmManager,
                        reqCode = code,
                        triggerMs = dayCal.timeInMillis,
                        title = "Exam Today: $subjectName",
                        body = "$labelDetail • $prettyDate • Good luck!",
                    )
                    scheduledExamCodes.add(code.toString())
                }
            }
        }

        // 3. Next-morning 6:30 AM daily re-arm alarm
        val nextMorning = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, 6)
            set(Calendar.MINUTE, 30)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val dailyIntent = Intent(context, ScheduleAlertReceiver::class.java).apply {
            action = ACTION_DAILY_REFRESH
        }
        val dailyPi = PendingIntent.getBroadcast(
            context,
            DAILY_REFRESH_REQ_CODE,
            dailyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextMorning.timeInMillis, dailyPi)

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(KEY_ACTIVE_IDS, scheduledCodes)
            .putStringSet(KEY_EXAM_IDS, scheduledExamCodes)
            .apply()
    }

    private fun scheduleExamAlarm(
        context: Context,
        alarmManager: AlarmManager,
        reqCode: Int,
        triggerMs: Long,
        title: String,
        body: String,
    ) {
        val intent = Intent(context, ScheduleAlertReceiver::class.java).apply {
            action = ACTION_EXAM_ALERT
            putExtra(EXTRA_EXAM_TITLE, title)
            putExtra(EXTRA_EXAM_BODY, body)
            putExtra(EXTRA_NOTIF_ID, reqCode)
        }
        val pi = PendingIntent.getBroadcast(
            context,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, pi)
    }

    fun cancelAll(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getStringSet(KEY_ACTIVE_IDS, emptySet()).orEmpty().forEach { codeStr ->
            val code = codeStr.toIntOrNull() ?: return@forEach
            val pi = PendingIntent.getBroadcast(
                context,
                code,
                Intent(context, ScheduleAlertReceiver::class.java).apply { action = ACTION_PERIOD_ALERT },
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            if (pi != null) {
                alarmManager.cancel(pi)
                pi.cancel()
            }
        }
        prefs.getStringSet(KEY_EXAM_IDS, emptySet()).orEmpty().forEach { codeStr ->
            val code = codeStr.toIntOrNull() ?: return@forEach
            val pi = PendingIntent.getBroadcast(
                context,
                code,
                Intent(context, ScheduleAlertReceiver::class.java).apply { action = ACTION_EXAM_ALERT },
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            if (pi != null) {
                alarmManager.cancel(pi)
                pi.cancel()
            }
        }
        prefs.edit().remove(KEY_ACTIVE_IDS).remove(KEY_EXAM_IDS).apply()
    }

    internal fun postClassNotification(
        context: Context,
        notifId: Int,
        subject: String,
        timeRange: String,
        room: String,
        leadMinutes: Int,
    ) {
        if (!hasNotificationPermission(context)) return
        ensureChannel(context)
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPi = PendingIntent.getActivity(
            context,
            notifId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val title = if (leadMinutes > 0) "$subject • in $leadMinutes min" else "$subject • Starting now"
        val body = buildString {
            append(timeRange)
            if (room.isNotBlank()) append(" • $room")
        }
        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_schedule)
            .setColor(0xFF6366F1.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .setContentIntent(contentPi)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(notifId, notif) }
    }

    internal fun postExamNotification(
        context: Context,
        notifId: Int,
        title: String,
        body: String,
    ) {
        if (!hasNotificationPermission(context)) return
        ensureChannel(context)
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPi = PendingIntent.getActivity(
            context,
            notifId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notif = NotificationCompat.Builder(context, EXAM_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_schedule)
            .setColor(0xFF06B6D4.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(contentPi)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(notifId, notif) }
    }

    internal const val ACTION_PERIOD = ACTION_PERIOD_ALERT
    internal const val ACTION_EXAM = ACTION_EXAM_ALERT
    internal const val ACTION_DAILY = ACTION_DAILY_REFRESH
    internal const val KEY_SUBJECT = EXTRA_SUBJECT
    internal const val KEY_TIME_RANGE = EXTRA_TIME_RANGE
    internal const val KEY_ROOM = EXTRA_ROOM
    internal const val KEY_LEAD = EXTRA_LEAD
    internal const val KEY_NOTIF_ID = EXTRA_NOTIF_ID
    internal const val KEY_EXAM_TITLE = EXTRA_EXAM_TITLE
    internal const val KEY_EXAM_BODY = EXTRA_EXAM_BODY
}

/**
 * Lightweight broadcast receiver handling scheduled class period alerts, exam date alerts, and post-boot re-arming.
 */
class ScheduleAlertReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ScheduleAlertManager.ACTION_PERIOD -> {
                if (!ScheduleAlertManager.isEnabled(context)) return
                val subject = intent.getStringExtra(ScheduleAlertManager.KEY_SUBJECT).orEmpty().ifBlank { "Scheduled Class" }
                val timeRange = intent.getStringExtra(ScheduleAlertManager.KEY_TIME_RANGE).orEmpty()
                val room = intent.getStringExtra(ScheduleAlertManager.KEY_ROOM).orEmpty()
                val lead = intent.getIntExtra(ScheduleAlertManager.KEY_LEAD, 5)
                val id = intent.getIntExtra(ScheduleAlertManager.KEY_NOTIF_ID, 91_000)
                ScheduleAlertManager.postClassNotification(context, id, subject, timeRange, room, lead)
                SemesterGlanceWidget.refreshAsync(context.applicationContext)
            }
            ScheduleAlertManager.ACTION_EXAM -> {
                val title = intent.getStringExtra(ScheduleAlertManager.KEY_EXAM_TITLE).orEmpty().ifBlank { "Upcoming Exam" }
                val body = intent.getStringExtra(ScheduleAlertManager.KEY_EXAM_BODY).orEmpty()
                val id = intent.getIntExtra(ScheduleAlertManager.KEY_NOTIF_ID, 95_000)
                ScheduleAlertManager.postExamNotification(context, id, title, body)
            }
            ScheduleAlertManager.ACTION_DAILY,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            -> {
                val pending = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        ScheduleAlertManager.rescheduleToday(context.applicationContext)
                        SemesterGlanceWidget.refreshAll(context.applicationContext)
                    } finally {
                        pending.finish()
                    }
                }
            }
        }
    }
}
