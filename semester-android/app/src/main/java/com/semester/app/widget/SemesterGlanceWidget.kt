package com.semester.app.widget

import android.content.Context
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.*
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.semester.app.core.CoreRepository
import uniffi.semester_core.AttendanceStatus
import java.text.SimpleDateFormat
import java.util.*

class SemesterGlanceReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SemesterGlanceWidget()
}

class SemesterGlanceWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = CoreRepository.getInstance(context)
        val todayDay = SimpleDateFormat("EEEE", Locale.ENGLISH).format(Date())
        val slots = repo.getTimetableForDay(todayDay)
        val nextSlot = slots.firstOrNull()

        provideContent {
            GlanceTheme {
                Column(
                    modifier = GlanceModifier
                        .fillMaxSize()
                        .background(GlanceTheme.colors.background)
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "UPCOMING CLASS",
                        style = TextStyle(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = GlanceTheme.colors.primary
                        )
                    )
                    Spacer(modifier = GlanceModifier.height(4.dp))

                    Text(
                        text = nextSlot?.subjectName ?: "No more classes today 🎉",
                        style = TextStyle(
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = GlanceTheme.colors.onBackground
                        )
                    )

                    if (nextSlot != null) {
                        Text(
                            text = "${nextSlot.startTime} • Room ${nextSlot.room}",
                            style = TextStyle(
                                fontSize = 12.sp,
                                color = GlanceTheme.colors.onSurfaceVariant
                            )
                        )
                        Spacer(modifier = GlanceModifier.height(8.dp))

                        Row(
                            modifier = GlanceModifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Button(
                                text = "✓ Present",
                                onClick = actionRunCallback<MarkAttendanceAction>(
                                    actionParametersOf(
                                        SubjectIdKey to nextSlot.subjectId,
                                        StatusKey to "present"
                                    )
                                )
                            )
                            Spacer(modifier = GlanceModifier.width(8.dp))
                            Button(
                                text = "✕ Skip",
                                onClick = actionRunCallback<MarkAttendanceAction>(
                                    actionParametersOf(
                                        SubjectIdKey to nextSlot.subjectId,
                                        StatusKey to "absent"
                                    )
                                )
                            )
                        }
                    }
                }
            }
        }
    }

    companion object {
        val SubjectIdKey = ActionParameters.Key<String>("subject_id")
        val StatusKey = ActionParameters.Key<String>("status")
    }
}

class MarkAttendanceAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters
    ) {
        val subjectId = parameters[SemesterGlanceWidget.SubjectIdKey] ?: return
        val statusStr = parameters[SemesterGlanceWidget.StatusKey] ?: "present"
        val status = if (statusStr == "present") AttendanceStatus.PRESENT else AttendanceStatus.ABSENT

        val repo = CoreRepository.getInstance(context)
        val todayDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

        repo.markAttendance(
            subjectId = subjectId,
            status = status,
            date = todayDate,
            notes = "Marked via Glance Home Screen Widget",
            logType = "Lecture"
        )

        // Refresh the widget
        SemesterGlanceWidget().update(context, glanceId)
    }
}
