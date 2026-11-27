package com.semester.app.widget

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.semester.app.MainActivity
import com.semester.app.R
import com.semester.app.core.WorkspaceRepository
import com.semester.app.core.parseFlexibleTimeMinutes
import com.semester.app.sync.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

class SemesterGlanceReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SemesterGlanceWidget()
}

/**
 * Custom Semester Studio Home Screen Widget (Jetpack Glance):
 * - Automatically adapts to your Obsidian Dark or Studio Light preference
 * - Shows Live / Next Scheduled Class (time, room, remaining periods) + overall attendance badge
 * - 1-tap Present / Skip right from the home screen, or tap anywhere to launch Semester
 */
class SemesterGlanceWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = WorkspaceRepository.getInstance(context)
        val profile = runCatching { repo.getProfile() }.getOrNull()
        val sem = profile?.currentSemester ?: 1
        val isDark = (profile?.themeMode ?: "dark") != "light"
        val snapshot = runCatching { repo.getDashboard(sem) }.getOrNull()
        val timetable = runCatching { repo.getTimetable(sem) }.getOrNull()

        val todayDay = SimpleDateFormat("EEEE", Locale.ENGLISH).format(Date())
        val todayShortDate = SimpleDateFormat("EEE, dd MMM", Locale.ENGLISH).format(Date())
        val slots = timetable?.classSlotsForDay(todayDay)
            .orEmpty()
            .sortedBy { parseFlexibleTimeMinutes(it.startTime) ?: Int.MAX_VALUE }
        val nowMins = Calendar.getInstance().let {
            it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE)
        }

        val activeSlot = slots.firstOrNull { slot ->
            val s = parseFlexibleTimeMinutes(slot.startTime)
            val e = parseFlexibleTimeMinutes(slot.endTime)
            s != null && e != null && nowMins in s until e
        }
        val upcomingSlots = slots.filter { slot ->
            val s = parseFlexibleTimeMinutes(slot.startTime)
            s != null && s >= nowMins
        }
        val featuredSlot = activeSlot ?: upcomingSlots.firstOrNull()
        val isLiveNow = activeSlot != null
        val remainingCount = if (isLiveNow) upcomingSlots.size else (upcomingSlots.size - 1).coerceAtLeast(0)

        val summary = snapshot?.summary
        val hasClasses = (summary?.totalClasses ?: 0) > 0
        val overallPct = summary?.overallPercentage ?: 0.0
        val target = summary?.targetThreshold ?: 75
        val safeBunks = summary?.totalSafeBunks ?: 0

        val bgRes = if (isDark) R.drawable.widget_bg_obsidian else R.drawable.widget_bg_light
        val titleColor = ColorProvider(if (isDark) Color(0xFFF8FAFC) else Color(0xFF0F1226))
        val mutedColor = ColorProvider(if (isDark) Color(0xFF9CA7BC) else Color(0xFF4C5373))
        val accentColor = ColorProvider(if (isDark) Color(0xFF818CF8) else Color(0xFF4F46E5))
        val liveColor = ColorProvider(if (isDark) Color(0xFF34D399) else Color(0xFF059669))
        val statusPillBg = when {
            isLiveNow -> Color(0x2810B981)
            featuredSlot != null -> Color(0x286366F1)
            else -> if (isDark) Color(0x1FFFFFFF) else Color(0x140F172A)
        }
        val pctColor = when {
            !hasClasses -> accentColor
            overallPct >= target -> liveColor
            overallPct >= (target - 10) -> ColorProvider(Color(0xFFF59E0B))
            else -> ColorProvider(Color(0xFFF43F5E))
        }

        provideContent {
            Column(
                modifier = GlanceModifier
                    .fillMaxSize()
                    .background(ImageProvider(bgRes))
                    .clickable(actionStartActivity<MainActivity>())
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Top Header Row: SEM badge + Live/Next Pill + Overall Attendance %
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = GlanceModifier
                            .background(statusPillBg)
                            .cornerRadius(12.dp)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Text(
                            text = when {
                                isLiveNow -> "LIVE • $todayShortDate"
                                featuredSlot != null -> "NEXT • $todayShortDate"
                                else -> "SEM $sem • $todayShortDate"
                            },
                            style = TextStyle(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isLiveNow) liveColor else accentColor,
                            ),
                        )
                    }

                    Spacer(modifier = GlanceModifier.defaultWeight())

                    Text(
                        text = if (hasClasses) "${String.format(Locale.US, "%.1f", overallPct)}%" else "Semester",
                        style = TextStyle(
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = pctColor,
                        ),
                    )
                }

                Spacer(modifier = GlanceModifier.height(8.dp))

                if (featuredSlot != null) {
                    Text(
                        text = featuredSlot.subjectName.ifBlank { featuredSlot.label.ifBlank { "Scheduled Class" } },
                        maxLines = 1,
                        style = TextStyle(
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = titleColor,
                        ),
                    )
                    Spacer(modifier = GlanceModifier.height(2.dp))
                    Text(
                        text = buildString {
                            append("${featuredSlot.startTime} – ${featuredSlot.endTime}")
                            if (featuredSlot.room.isNotBlank()) append(" • ${featuredSlot.room}")
                            if (remainingCount > 0) append("  (+$remainingCount more)")
                        },
                        maxLines = 1,
                        style = TextStyle(
                            fontSize = 11.sp,
                            color = mutedColor,
                        ),
                    )

                    if (featuredSlot.subjectId.isNotBlank()) {
                        Spacer(modifier = GlanceModifier.height(10.dp))
                        Row(
                            modifier = GlanceModifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = GlanceModifier
                                    .defaultWeight()
                                    .background(Color(0x2A10B981))
                                    .cornerRadius(16.dp)
                                    .clickable(
                                        actionRunCallback<MarkAttendanceAction>(
                                            actionParametersOf(
                                                SubjectIdKey to featuredSlot.subjectId,
                                                StatusKey to "present",
                                                SemesterKey to sem,
                                                StartTimeKey to featuredSlot.startTime,
                                            ),
                                        ),
                                    )
                                    .padding(vertical = 7.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = "Present",
                                    style = TextStyle(
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = liveColor,
                                    ),
                                )
                            }

                            Spacer(modifier = GlanceModifier.width(8.dp))

                            Box(
                                modifier = GlanceModifier
                                    .defaultWeight()
                                    .background(Color(0x28F43F5E))
                                    .cornerRadius(16.dp)
                                    .clickable(
                                        actionRunCallback<MarkAttendanceAction>(
                                            actionParametersOf(
                                                SubjectIdKey to featuredSlot.subjectId,
                                                StatusKey to "absent",
                                                SemesterKey to sem,
                                                StartTimeKey to featuredSlot.startTime,
                                            ),
                                        ),
                                    )
                                    .padding(vertical = 7.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = "Skip",
                                    style = TextStyle(
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = ColorProvider(Color(0xFFF43F5E)),
                                    ),
                                )
                            }
                        }
                    }
                } else {
                    Text(
                        text = if (slots.isEmpty()) "No classes on $todayDay" else "Done for $todayDay",
                        maxLines = 1,
                        style = TextStyle(
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = titleColor,
                        ),
                    )
                    Spacer(modifier = GlanceModifier.height(3.dp))
                    Text(
                        text = if (hasClasses) {
                            "${summary?.safeCount ?: 0}/${snapshot?.subjects?.size ?: 0} courses safe • +$safeBunks bunk buffer"
                        } else {
                            "Tap to open dashboard & timetable"
                        },
                        maxLines = 1,
                        style = TextStyle(
                            fontSize = 11.sp,
                            color = mutedColor,
                        ),
                    )
                }
            }
        }
    }

    companion object {
        val SubjectIdKey = ActionParameters.Key<String>("subject_id")
        val StatusKey = ActionParameters.Key<String>("status")
        val SemesterKey = ActionParameters.Key<Int>("semester")
        val StartTimeKey = ActionParameters.Key<String>("start_time")

        fun refreshAsync(context: Context) {
            val appCtx = context.applicationContext
            CoroutineScope(Dispatchers.IO).launch {
                refreshAll(appCtx)
            }
        }

        suspend fun refreshAll(context: Context) {
            runCatching {
                val manager = GlanceAppWidgetManager(context)
                val ids = manager.getGlanceIds(SemesterGlanceWidget::class.java)
                val widget = SemesterGlanceWidget()
                ids.forEach { glanceId -> widget.update(context, glanceId) }
            }
        }
    }
}

class MarkAttendanceAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters,
    ) {
        val subjectId = parameters[SemesterGlanceWidget.SubjectIdKey] ?: return
        val statusStr = parameters[SemesterGlanceWidget.StatusKey] ?: "present"
        val semester = parameters[SemesterGlanceWidget.SemesterKey] ?: 1
        val startTime = parameters[SemesterGlanceWidget.StartTimeKey].orEmpty()

        val repo = WorkspaceRepository.getInstance(context)
        runCatching {
            repo.markAttendance(
                subjectId = subjectId,
                status = statusStr,
                date = WorkspaceRepository.todayIsoDate(),
                notes = "Marked via Home Screen Widget",
                semester = semester,
                logType = if (startTime.isNotBlank()) "class::$startTime" else "Lecture",
            )
            SemesterGlanceWidget().update(context, glanceId)
            SyncScheduler.scheduleImmediatePush(context)
        }
    }
}
