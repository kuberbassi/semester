package com.semester.app.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.LivePeriodRadarCard
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.PeriodState
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.pressable
import com.semester.app.ui.theme.SemesterColors
import kotlinx.coroutines.launch
import uniffi.semester_core.Subject
import uniffi.semester_core.TimetableSlot
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID

private val WEEK_DAYS = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

@Composable
fun TimetableRadarScreen(
    subjects: List<Subject>,
    repo: CoreRepository,
    haptics: HapticCrownEngine,
    onAttendanceMarked: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current

    val todayName = remember {
        val day = SimpleDateFormat("EEEE", Locale.ENGLISH).format(Date())
        if (day in WEEK_DAYS) day else "Monday"
    }
    var selectedDay by remember { mutableStateOf(todayName) }
    var slots by remember { mutableStateOf<List<TimetableSlot>>(emptyList()) }

    fun loadDay(day: String) {
        scope.launch {
            slots = repo.getTimetableForDay(day).sortedBy { it.periodNumber }
        }
    }

    LaunchedEffect(selectedDay) {
        loadDay(selectedDay)
    }

    val nowMinutes = remember {
        val cal = Calendar.getInstance()
        cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        AmbientTopGlow(
            color = SemesterColors.ElectricViolet,
            peakAlpha = 0.22f,
            height = 290.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
            contentPadding = PaddingValues(bottom = 128.dp),
        ) {
            item(key = "radar_header") {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 12.dp),
                ) {
                    Text(
                        text = "LIVE SCHEDULE",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 1.2.sp,
                    )
                    Text(
                        text = "Timetable Radar",
                        style = MaterialTheme.typography.displaySmall,
                        color = Color.White,
                    )
                }
            }

            item(key = "day_pills") {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(WEEK_DAYS) { day ->
                        val active = day == selectedDay
                        val bg by animateColorAsState(
                            targetValue = if (active) SemesterColors.ElectricViolet.copy(alpha = 0.24f)
                            else Color(0xFF151519),
                            animationSpec = tween(220),
                            label = "dayBg",
                        )
                        Box(
                            modifier = Modifier
                                .pressable(
                                    onClick = {
                                        haptics.crownTick()
                                        selectedDay = day
                                    },
                                    pressedScale = 0.94f,
                                )
                                .clip(CircleShape)
                                .background(bg)
                                .border(
                                    width = 1.dp,
                                    color = if (active) SemesterColors.ElectricViolet.copy(alpha = 0.7f)
                                    else Color.White.copy(alpha = 0.08f),
                                    shape = CircleShape,
                                )
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            Text(
                                text = day.take(3),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
            }

            if (slots.isEmpty()) {
                item(key = "radar_empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 18.dp)
                            .liquidGlass(
                                shape = RoundedCornerShape(26.dp),
                                tint = Color(0xFF141418).copy(alpha = 0.88f),
                                elevation = 10.dp,
                            )
                            .padding(28.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(60.dp)
                                    .clip(CircleShape)
                                    .background(SemesterColors.ElectricViolet.copy(alpha = 0.16f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Schedule,
                                    contentDescription = null,
                                    tint = SemesterColors.ElectricViolet,
                                    modifier = Modifier.size(28.dp),
                                )
                            }
                            Text(
                                text = "No periods on $selectedDay",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                            )
                            Text(
                                text = "Seed a sample live timetable for $selectedDay to test the pulsing radar.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Button(
                                onClick = {
                                    scope.launch {
                                        val s1 = subjects.getOrNull(0)
                                        val s2 = subjects.getOrNull(1)
                                        val s3 = subjects.getOrNull(2)
                                        repo.saveTimetableSlot(
                                            TimetableSlot(
                                                id = UUID.randomUUID().toString(),
                                                day = selectedDay,
                                                periodNumber = 1u,
                                                startTime = "09:00",
                                                endTime = "10:00",
                                                subjectId = s1?.id ?: "sample-1",
                                                subjectName = s1?.name ?: "Data Structures",
                                                room = s1?.classroom?.ifBlank { "102" } ?: "102",
                                                slotType = "Lecture",
                                            ),
                                        )
                                        repo.saveTimetableSlot(
                                            TimetableSlot(
                                                id = UUID.randomUUID().toString(),
                                                day = selectedDay,
                                                periodNumber = 2u,
                                                startTime = "10:15",
                                                endTime = "11:15",
                                                subjectId = s2?.id ?: "sample-2",
                                                subjectName = s2?.name ?: "Computational Methods",
                                                room = s2?.classroom?.ifBlank { "204" } ?: "204",
                                                slotType = "Lecture",
                                            ),
                                        )
                                        repo.saveTimetableSlot(
                                            TimetableSlot(
                                                id = UUID.randomUUID().toString(),
                                                day = selectedDay,
                                                periodNumber = 3u,
                                                startTime = "11:30",
                                                endTime = "12:30",
                                                subjectId = s3?.id ?: "sample-3",
                                                subjectName = s3?.name ?: "Operating Systems",
                                                room = s3?.classroom?.ifBlank { "301" } ?: "301",
                                                slotType = "Lab",
                                            ),
                                        )
                                        loadDay(selectedDay)
                                        haptics.attendanceSuccess()
                                    }
                                },
                                shape = CircleShape,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = SemesterColors.ElectricViolet,
                                    contentColor = Color.White,
                                ),
                            ) {
                                Icon(Icons.Rounded.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Load Sample Day", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            } else {
                itemsIndexed(slots, key = { _, slot -> slot.id }) { index, slot ->
                    val startMins = parseTimeMinutes(slot.startTime)
                    val endMins = parseTimeMinutes(slot.endTime)
                    val (state, remaining) = when {
                        selectedDay != todayName -> PeriodState.UPCOMING to null
                        startMins != null && endMins != null && nowMinutes in startMins until endMins ->
                            PeriodState.ACTIVE to (endMins - nowMinutes)
                        endMins != null && nowMinutes >= endMins ->
                            PeriodState.PAST to null
                        // If viewing today outside class hours, highlight first slot as active preview
                        index == 0 && slots.none {
                            val s = parseTimeMinutes(it.startTime)
                            val e = parseTimeMinutes(it.endTime)
                            s != null && e != null && nowMinutes in s until e
                        } -> PeriodState.ACTIVE to 42
                        else -> PeriodState.UPCOMING to null
                    }

                    LivePeriodRadarCard(
                        slot = slot,
                        state = state,
                        remainingMinutes = remaining,
                        haptics = haptics,
                        onMark = { status ->
                            scope.launch {
                                val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
                                repo.markAttendance(slot.subjectId, status, today)
                                onAttendanceMarked()
                            }
                        },
                        modifier = Modifier.padding(horizontal = 20.dp),
                    )
                }
            }
        }
    }
}

private fun parseTimeMinutes(hhmm: String): Int? {
    val parts = hhmm.trim().split(":")
    if (parts.size != 2) return null
    val h = parts[0].toIntOrNull() ?: return null
    val m = parts[1].toIntOrNull() ?: return null
    return h * 60 + m
}
