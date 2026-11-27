package com.semester.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Science
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.DashboardSnapshot
import com.semester.app.core.DriveSyncState
import com.semester.app.core.ResultsAnalytics
import com.semester.app.core.TodayClassItem
import com.semester.app.core.WorkspaceRepository
import com.semester.app.core.WorkspaceSubject
import com.semester.app.core.parseFlexibleTimeMinutes
import com.semester.app.core.smartSubjectShortName
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.CollapsibleHorizontalSubjectsShelf
import com.semester.app.ui.components.DangerPillButton
import com.semester.app.ui.components.GlassIconButton
import com.semester.app.ui.components.GlassSecondaryButton
import com.semester.app.ui.components.GradientButton
import com.semester.app.ui.components.GradientText
import com.semester.app.ui.components.LiquidFillGauge
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.ScrollForwardHint
import com.semester.app.ui.components.SemesterBrandMark
import com.semester.app.ui.components.SemesterPickerBadge
import com.semester.app.ui.components.SemesterSectionHeader
import com.semester.app.ui.components.StudioPillChip
import com.semester.app.ui.components.SubjectDetailSheet
import com.semester.app.ui.components.UserAvatarView
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.liquidHeroBanner
import com.semester.app.ui.components.pressable
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
fun DashboardScreen(
    snapshot: DashboardSnapshot,
    resultsSummary: ResultsAnalytics,
    selectedSemester: Int,
    driveState: DriveSyncState,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onOpenSemesterPicker: () -> Unit,
    onToggleTheme: () -> Unit,
    onRefresh: () -> Unit,
    onAddSubjectClick: () -> Unit,
    onOpenAiClick: () -> Unit,
    onOpenSettingsClick: () -> Unit,
    onJumpToDestination: (String) -> Unit,
    onSelectAccent: (Color) -> Unit,
) {
    val isDark = LocalIsDarkTheme.current
    val coroutineScope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current

    var selectedSubjectId by remember { mutableStateOf<String?>(null) }
    var inspectingSubject by remember { mutableStateOf<WorkspaceSubject?>(null) }
    var advMarkingClass by remember { mutableStateOf<TodayClassItem?>(null) }

    // Live minute ticker (30s) so Today's Classes red/green/blue status dot & date stay accurate automatically
    var nowMinutes by remember {
        mutableIntStateOf(
            Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) },
        )
    }
    var todayDayDate by remember {
        mutableStateOf(SimpleDateFormat("EEEE, dd MMM", Locale.ENGLISH).format(Date()))
    }
    LaunchedEffect(Unit) {
        while (true) {
            val cal = Calendar.getInstance()
            nowMinutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
            todayDayDate = SimpleDateFormat("EEEE, dd MMM", Locale.ENGLISH).format(cal.time)
            delay(30_000L)
        }
    }

    val orderedTodayClasses = remember(snapshot.todayClasses) {
        snapshot.todayClasses.sortedBy { parseFlexibleTimeMinutes(it.startTime) ?: Int.MAX_VALUE }
    }

    val subjects = snapshot.subjects
    val summary = snapshot.summary
    val hasData = summary.totalClasses > 0
    val healthColor = SemesterColors.healthColor(
        summary.overallPercentage,
        summary.targetThreshold.toDouble(),
        hasData = hasData,
    )
    val targetDelta = summary.overallPercentage - summary.targetThreshold.toDouble()
    val totalNeeded = remember(subjects) { subjects.sumOf { it.classesNeeded } }
    val labTotal = remember(subjects) { subjects.sumOf { it.practicalTotal + it.assignmentTotal } }
    val labDone = remember(subjects) { subjects.sumOf { it.practicalCompleted + it.assignmentCompleted } }
    val labPct = if (labTotal > 0) ((labDone * 100.0) / labTotal).roundToInt() else 0
    val filesSubmitted = remember(subjects) { subjects.count { it.practicalHardcopy } + subjects.count { it.assignmentHardcopy } }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        AmbientTopGlow(
            color = healthColor,
            peakAlpha = 0.22f,
            height = 320.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
            contentPadding = PaddingValues(bottom = 136.dp),
        ) {
            // Clean Editorial Header: Brand/Avatar + SEM X dropdown + Dashboard + 3 Uniform 40dp Orbs
            item(key = "header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        if (snapshot.profile.picture.isNotBlank()) {
                            UserAvatarView(
                                picture = snapshot.profile.picture,
                                name = snapshot.profile.name,
                                size = 40.dp,
                                cornerRadius = 12.dp,
                                modifier = Modifier.pressable(
                                    onClick = {
                                        haptics.crownTick()
                                        onOpenSettingsClick()
                                    },
                                    pressedScale = 0.92f,
                                ),
                            )
                        } else {
                            SemesterBrandMark(size = 40.dp)
                        }
                        Column {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                SemesterPickerBadge(
                                    semester = selectedSemester,
                                    onClick = {
                                        haptics.crownTick()
                                        onOpenSemesterPicker()
                                    },
                                )
                                if (snapshot.profile.name.isNotBlank() && snapshot.profile.name != "Student") {
                                    Text(
                                        text = snapshot.profile.name.uppercase(),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        letterSpacing = 0.7.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            Text(
                                text = "Dashboard",
                                style = MaterialTheme.typography.headlineLarge,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = todayDayDate,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GlassIconButton(
                            icon = if (isDark) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                            contentDescription = "Toggle Theme",
                            onClick = { onToggleTheme() },
                            size = 40.dp,
                        )
                        GlassIconButton(
                            icon = Icons.Rounded.Forum,
                            contentDescription = "AI Assistant",
                            onClick = {
                                haptics.crownTick()
                                onOpenAiClick()
                            },
                            size = 40.dp,
                            accentTint = SemesterColors.BrandCobalt,
                        )
                        GlassIconButton(
                            icon = if (driveState.connected) Icons.Rounded.CloudDone else Icons.Rounded.Settings,
                            contentDescription = "Settings & Sync",
                            onClick = {
                                haptics.crownTick()
                                onOpenSettingsClick()
                            },
                            size = 40.dp,
                            tint = if (driveState.connected) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.onSurface,
                            accentTint = if (driveState.connected) SemesterColors.SafeEmerald else null,
                        )
                    }
                }
            }

            // Luminous Hero Attendance Banner (Desktop Command Deck + Theme-Adaptive Crystal Gauge)
            item(key = "hero") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 6.dp)
                        .liquidHeroBanner(shape = RoundedCornerShape(28.dp), accentTint = healthColor)
                        .padding(18.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(18.dp),
                        ) {
                            LiquidFillGauge(
                                percentage = summary.overallPercentage,
                                size = 128.dp,
                                targetThreshold = summary.targetThreshold.toDouble(),
                                hasData = hasData,
                                sublabel = if (summary.totalMedical > 0) "MED-ADJ" else "OVERALL",
                                haptics = haptics,
                                onClick = { onSelectAccent(healthColor) },
                            )

                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(7.dp),
                            ) {
                                // Desktop-exact Goal & Delta Pill Row
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Box(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.20f else 0.12f))
                                            .padding(horizontal = 8.dp, vertical = 3.dp),
                                    ) {
                                        Text(
                                            text = "Goal ${summary.targetThreshold}%",
                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.primary,
                                        )
                                    }
                                    val deltaColor = when {
                                        !hasData -> MaterialTheme.colorScheme.onSurfaceVariant
                                        targetDelta >= 0 -> SemesterColors.SafeEmerald
                                        else -> SemesterColors.CriticalCrimson
                                    }
                                    Box(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(deltaColor.copy(alpha = if (isDark) 0.16f else 0.10f))
                                            .padding(horizontal = 8.dp, vertical = 3.dp),
                                    ) {
                                        Text(
                                            text = when {
                                                !hasData -> "Ready"
                                                targetDelta >= 0 -> "+${String.format(Locale.US, "%.1f", targetDelta)}%"
                                                else -> "-${String.format(Locale.US, "%.1f", abs(targetDelta))}%"
                                            },
                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                            fontWeight = FontWeight.Bold,
                                            color = deltaColor,
                                        )
                                    }
                                }

                                GradientText(
                                    text = when {
                                        subjects.isEmpty() -> "Ready to Track"
                                        !hasData -> "Classes Ready"
                                        summary.overallPercentage >= summary.targetThreshold -> "Cruising Safe"
                                        summary.overallPercentage >= (summary.targetThreshold - 10) -> "Watch Buffer"
                                        else -> "Recovery Mode"
                                    },
                                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
                                )

                                HeroStatRow(
                                    label = "Attended",
                                    value = "${summary.totalAttended} / ${summary.totalClasses}",
                                    tint = MaterialTheme.colorScheme.onSurface,
                                )
                                HeroStatRow(
                                    label = if (summary.totalMedical > 0) "No-Med Raw" else "Enrollment",
                                    value = if (summary.totalMedical > 0) {
                                        "${String.format(Locale.US, "%.1f", summary.withoutMedicalPercentage)}% (${summary.totalMedical}m)"
                                    } else {
                                        snapshot.profile.enrollmentNumber.ifBlank { "Set in Settings" }
                                    },
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            // Full Desktop Dashboard Metrics Bento (4 live high-signal KPI tiles)
            item(key = "metrics_bento") {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MetricPulseTile(
                            label = "STANDING",
                            value = "${summary.safeCount}/${subjects.size}",
                            detail = if (summary.atRiskCount > 0) "${summary.atRiskCount} at risk" else "All on target",
                            accent = if (summary.atRiskCount > 0) SemesterColors.CriticalCrimson else SemesterColors.SafeEmerald,
                            icon = Icons.Rounded.Shield,
                            onClick = {
                                haptics.crownTick()
                                onJumpToDestination("whatif")
                            },
                            modifier = Modifier.weight(1f),
                        )
                        MetricPulseTile(
                            label = if (totalNeeded > 0) "RECOVERY" else "BUNK BUFFER",
                            value = if (totalNeeded > 0) "Need $totalNeeded" else "+${summary.totalSafeBunks}",
                            detail = if (totalNeeded > 0) "Classes to hit ${summary.targetThreshold}%" else "Safe skips available",
                            accent = if (totalNeeded > 0) SemesterColors.WarningAmber else SemesterColors.BrandCyan,
                            icon = Icons.AutoMirrored.Rounded.TrendingUp,
                            onClick = {
                                haptics.crownTick()
                                onJumpToDestination("whatif")
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MetricPulseTile(
                            label = "LABS & FILES",
                            value = if (subjects.isNotEmpty()) "$labPct%" else "—",
                            detail = if (subjects.isNotEmpty()) "$labDone/$labTotal • $filesSubmitted hardcopy" else "Track practicals",
                            accent = SemesterColors.BrandCobaltSoft,
                            icon = Icons.Rounded.Science,
                            onClick = {
                                haptics.crownTick()
                                onJumpToDestination("practicals")
                            },
                            modifier = Modifier.weight(1f),
                        )
                        MetricPulseTile(
                            label = "IPU CGPA",
                            value = if (resultsSummary.hasData) String.format(Locale.US, "%.2f", resultsSummary.cgpa) else "Sync",
                            detail = if (resultsSummary.hasData) "${resultsSummary.totalCredits} cr • ${resultsSummary.academicStrength.roundToInt()}% agg" else "Connect ExamWeb",
                            accent = SemesterColors.BrandVioletSoft,
                            icon = Icons.Rounded.School,
                            onClick = {
                                haptics.crownTick()
                                onJumpToDestination("results")
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Today's Scheduled Classes Quick Strip (slot-ordered, Red/Green/Blue live dot, Advanced Mark Sheet)
            if (orderedTodayClasses.isNotEmpty()) {
                item(key = "today_strip") {
                    val todayListState = rememberLazyListState()
                    val canScrollToday by remember { derivedStateOf { todayListState.canScrollForward } }
                    Column(modifier = Modifier.fillMaxWidth()) {
                        SemesterSectionHeader(
                            title = "Today's Classes",
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                        LazyRow(
                            state = todayListState,
                            contentPadding = PaddingValues(horizontal = 20.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(orderedTodayClasses, key = { "today_${it.id}_${it.startTime}" }) { cls ->
                                val startMins = parseFlexibleTimeMinutes(cls.startTime)
                                val endMins = parseFlexibleTimeMinutes(cls.endTime)
                                val isOngoing = startMins != null && endMins != null && nowMinutes in startMins until endMins
                                val isDone = endMins != null && nowMinutes >= endMins
                                val periodDotColor = when {
                                    isOngoing -> SemesterColors.SafeEmerald // Green = going on now
                                    isDone -> SemesterColors.CriticalCrimson // Red = period done
                                    else -> SemesterColors.BrandCobalt // Blue = left / upcoming
                                }
                                val statusTint = when (cls.markedStatus) {
                                    "present", "late", "duty" -> SemesterColors.SafeEmerald
                                    "absent" -> SemesterColors.CriticalCrimson
                                    "approved_medical", "medical" -> SemesterColors.BrandSky
                                    "substituted" -> SemesterColors.WarningAmber
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                }
                                Box(
                                    modifier = Modifier
                                        .width(232.dp)
                                        .liquidGlass(
                                            shape = RoundedCornerShape(20.dp),
                                            accentTint = when {
                                                isOngoing -> SemesterColors.SafeEmerald
                                                cls.marked -> statusTint
                                                else -> null
                                            },
                                        )
                                        .clickable {
                                            if (cls.subjectId.isNotBlank()) {
                                                haptics.crownTick()
                                                advMarkingClass = cls
                                            }
                                        }
                                        .padding(13.dp),
                                ) {
                                    // Extreme top-left live period dot (Red = done, Green = active, Blue = left)
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopStart)
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(periodDotColor)
                                            .then(
                                                if (isOngoing) Modifier.border(1.5.dp, Color.White.copy(alpha = 0.75f), CircleShape)
                                                else Modifier,
                                            ),
                                    )

                                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Text(
                                            text = "${cls.startTime} • ${cls.classroom.ifBlank { "Class" }}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.padding(start = 14.dp),
                                        )
                                        Text(
                                            text = cls.subjectName,
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Text(
                                                text = cls.markedStatus?.replace("approved_", "")?.replace("_", " ")?.replaceFirstChar { it.uppercase() } ?: "Unmarked",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = statusTint,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f),
                                            )
                                            if (cls.subjectId.isNotBlank()) {
                                                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                                    Box(
                                                        modifier = Modifier
                                                            .size(30.dp)
                                                            .pressable(
                                                                onClick = {
                                                                    haptics.attendanceSuccess()
                                                                    coroutineScope.launch {
                                                                        repo.markAttendance(
                                                                            subjectId = cls.subjectId,
                                                                            status = "present",
                                                                            date = WorkspaceRepository.todayIsoDate(),
                                                                            semester = selectedSemester,
                                                                            logType = cls.attendanceType,
                                                                        )
                                                                        onRefresh()
                                                                    }
                                                                },
                                                                pressedScale = 0.88f,
                                                            )
                                                            .clip(CircleShape)
                                                            .background(SemesterColors.SafeEmerald.copy(alpha = if (cls.markedStatus == "present") 0.34f else 0.16f))
                                                            .border(1.dp, SemesterColors.SafeEmerald.copy(alpha = 0.55f), CircleShape),
                                                        contentAlignment = Alignment.Center,
                                                    ) {
                                                        Icon(Icons.Rounded.Check, contentDescription = "Present", tint = SemesterColors.SafeEmerald, modifier = Modifier.size(16.dp))
                                                    }
                                                    Box(
                                                        modifier = Modifier
                                                            .size(30.dp)
                                                            .pressable(
                                                                onClick = {
                                                                    haptics.softDismiss()
                                                                    coroutineScope.launch {
                                                                        repo.markAttendance(
                                                                            subjectId = cls.subjectId,
                                                                            status = "absent",
                                                                            date = WorkspaceRepository.todayIsoDate(),
                                                                            semester = selectedSemester,
                                                                            logType = cls.attendanceType,
                                                                        )
                                                                        onRefresh()
                                                                    }
                                                                },
                                                                pressedScale = 0.88f,
                                                            )
                                                            .clip(CircleShape)
                                                            .background(SemesterColors.CriticalCrimson.copy(alpha = if (cls.markedStatus == "absent") 0.34f else 0.16f))
                                                            .border(1.dp, SemesterColors.CriticalCrimson.copy(alpha = 0.55f), CircleShape),
                                                        contentAlignment = Alignment.Center,
                                                    ) {
                                                        Icon(Icons.Rounded.Close, contentDescription = "Absent", tint = SemesterColors.CriticalCrimson, modifier = Modifier.size(16.dp))
                                                    }
                                                    Box(
                                                        modifier = Modifier
                                                            .size(30.dp)
                                                            .pressable(
                                                                onClick = {
                                                                    haptics.crownTick()
                                                                    advMarkingClass = cls
                                                                },
                                                                pressedScale = 0.88f,
                                                            )
                                                            .clip(CircleShape)
                                                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                                                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f), CircleShape),
                                                        contentAlignment = Alignment.Center,
                                                    ) {
                                                        Icon(Icons.Rounded.MoreHoriz, contentDescription = "Advanced Mark", tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        ScrollForwardHint(visible = canScrollToday)
                    }
                }
            }

            // Enrolled Subjects Liquid Accordion Gallery / Table (with inline + Add button)
            if (subjects.isEmpty()) {
                item(key = "empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 10.dp)
                            .liquidGlass(shape = RoundedCornerShape(26.dp))
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(56.dp)
                                    .clip(CircleShape)
                                    .background(SemesterColors.BrandCobalt.copy(alpha = 0.16f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.School,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(26.dp),
                                )
                            }
                            Text(
                                text = "No courses in Semester $selectedSemester",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = "Add your subjects, connect Google Drive, or import your backup JSON from Settings.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(2.dp))
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                GradientButton(
                                    text = "Add Course",
                                    icon = Icons.Rounded.Add,
                                    onClick = {
                                        haptics.focusSnap()
                                        onAddSubjectClick()
                                    },
                                )
                                GlassSecondaryButton(
                                    text = "Import / Sync",
                                    onClick = {
                                        haptics.crownTick()
                                        onOpenSettingsClick()
                                    },
                                )
                            }
                        }
                    }
                }
            } else {
                item(key = "desktop_liquid_accordion") {
                    CollapsibleHorizontalSubjectsShelf(
                        subjects = subjects,
                        selectedSubjectId = selectedSubjectId,
                        onSelectSubject = { sub ->
                            selectedSubjectId = sub.id
                            onSelectAccent(SemesterColors.healthColor(sub.percentage, sub.target.toDouble(), hasData = sub.eligibleTotal > 0))
                        },
                        onInspectSubject = { sub -> inspectingSubject = sub },
                        onAddSubjectClick = onAddSubjectClick,
                        haptics = haptics,
                    )
                }
            }
        }
    }

    inspectingSubject?.let { sub ->
        val freshSub = subjects.firstOrNull { it.id == sub.id } ?: sub
        SubjectDetailSheet(
            subject = freshSub,
            allSubjects = subjects,
            repo = repo,
            haptics = haptics,
            onDismiss = { inspectingSubject = null },
            onChanged = onRefresh,
        )
    }

    advMarkingClass?.let { cls ->
        TodayClassAdvancedMarkSheet(
            cls = cls,
            subjects = subjects,
            haptics = haptics,
            onDismiss = { advMarkingClass = null },
            onSave = { status, notes, subBy ->
                coroutineScope.launch {
                    val today = WorkspaceRepository.todayIsoDate()
                    if (!cls.logId.isNullOrBlank()) {
                        repo.editAttendance(
                            logId = cls.logId,
                            status = status,
                            notes = notes,
                            date = today,
                            substitutedBy = subBy,
                        )
                    } else {
                        repo.markAttendance(
                            subjectId = cls.subjectId,
                            status = status,
                            date = today,
                            notes = notes,
                            substitutedBy = subBy,
                            semester = selectedSemester,
                            logType = cls.attendanceType,
                        )
                    }
                    haptics.attendanceSuccess()
                    advMarkingClass = null
                    onRefresh()
                }
            },
            onClear = cls.logId?.takeIf { it.isNotBlank() }?.let { logId ->
                {
                    coroutineScope.launch {
                        repo.deleteAttendance(logId)
                        haptics.softDismiss()
                        advMarkingClass = null
                        onRefresh()
                    }
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun TodayClassAdvancedMarkSheet(
    cls: TodayClassItem,
    subjects: List<WorkspaceSubject>,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onSave: (status: String, notes: String, substitutedBy: String) -> Unit,
    onClear: (() -> Unit)?,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var status by remember(cls.id, cls.markedStatus) {
        mutableStateOf(
            when (cls.markedStatus) {
                "medical" -> "approved_medical"
                null, "" -> "present"
                else -> cls.markedStatus
            },
        )
    }
    var notes by remember(cls.id) { mutableStateOf("") }
    val peers = remember(subjects, cls.subjectId) { subjects.filter { it.id != cls.subjectId } }
    var subBy by remember(cls.id) { mutableStateOf(peers.firstOrNull()?.name.orEmpty()) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .padding(bottom = 26.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column {
                Text(
                    text = "${cls.startTime} – ${cls.endTime}" + (if (cls.classroom.isNotBlank()) " • ${cls.classroom}" else ""),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = cls.subjectName.ifBlank { "Today's Class" },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    Triple("present", "Present", SemesterColors.SafeEmerald),
                    Triple("absent", "Absent", SemesterColors.CriticalCrimson),
                    Triple("approved_medical", "Medical Leave", SemesterColors.ElectricBlue),
                    Triple("substituted", "Substituted", SemesterColors.WarningAmber),
                    Triple("cancelled", "Cancelled", Color(0xFF94A3B8)),
                ).forEach { (key, label, tint) ->
                    val active = status == key
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(tint.copy(alpha = if (active) 0.28f else 0.12f))
                            .border(if (active) 1.5.dp else 1.dp, tint.copy(alpha = if (active) 0.90f else 0.42f), CircleShape)
                            .clickable {
                                haptics.crownTick()
                                status = key
                            }
                            .padding(horizontal = 13.dp, vertical = 8.dp),
                    ) {
                        Text(label, style = MaterialTheme.typography.labelMedium, color = tint, fontWeight = FontWeight.Bold)
                    }
                }
            }

            if (status == "substituted") {
                Text(
                    text = "Substituted By (Enrolled Course)",
                    style = MaterialTheme.typography.labelSmall,
                    color = SemesterColors.WarningAmber,
                    fontWeight = FontWeight.Bold,
                )
                if (peers.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(peers, key = { "tsub_${it.id}" }) { peer ->
                            StudioPillChip(
                                label = smartSubjectShortName(peer.name, peer.code),
                                selected = subBy == peer.name,
                                onClick = {
                                    haptics.crownTick()
                                    subBy = peer.name
                                },
                            )
                        }
                    }
                } else {
                    Text(
                        text = "Add another subject on Dashboard to select a substitute.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Notes (optional)") },
                placeholder = { Text("Reason, lab viva, or topic details") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onClear != null) {
                    DangerPillButton(
                        text = "Clear",
                        icon = Icons.Rounded.DeleteOutline,
                        onClick = onClear,
                        modifier = Modifier.weight(0.9f),
                    )
                }
                GradientButton(
                    text = "Save Attendance",
                    enabled = status != "substituted" || peers.isEmpty() || subBy.isNotBlank(),
                    onClick = {
                        onSave(
                            status,
                            notes.trim(),
                            if (status == "substituted") subBy else "",
                        )
                    },
                    modifier = Modifier.weight(1.3f),
                )
            }
        }
    }
}

@Composable
private fun MetricPulseTile(
    label: String,
    value: String,
    detail: String,
    accent: Color,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .pressable(onClick = onClick, pressedScale = 0.96f)
            .liquidGlass(shape = RoundedCornerShape(20.dp), accentTint = accent)
            .padding(horizontal = 13.dp, vertical = 12.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    letterSpacing = 0.7.sp,
                )
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(14.dp),
                )
            }
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = detail,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun HeroStatRow(
    label: String,
    value: String,
    tint: Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = tint,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
