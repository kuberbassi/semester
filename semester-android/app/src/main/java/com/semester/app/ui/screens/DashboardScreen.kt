package com.semester.app.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.School
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.CollapsibleHorizontalSubjectsShelf
import com.semester.app.ui.components.GlassIconButton
import com.semester.app.ui.components.LiquidFillGauge
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.SemesterSectionHeader
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.pressable
import com.semester.app.ui.theme.SemesterColors
import kotlinx.coroutines.launch
import uniffi.semester_core.AttendanceStatus
import uniffi.semester_core.Subject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

private enum class CourseFilter(val label: String) {
    ALL("All"),
    SAFE("Safe"),
    AT_RISK("At Risk"),
}

@Composable
fun DashboardScreen(
    subjects: List<Subject>,
    repo: CoreRepository,
    haptics: HapticCrownEngine,
    onRefresh: () -> Unit,
    onAddSubjectClick: () -> Unit,
    onSelectAccent: (Color) -> Unit,
) {
    val coroutineScope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current

    var stripCollapsed by remember { mutableStateOf(false) }
    var selectedSubjectId by remember { mutableStateOf<String?>(null) }
    var filter by remember { mutableStateOf(CourseFilter.ALL) }

    val totalAttended = subjects.sumOf { it.attended.toInt() }
    val totalClasses = subjects.sumOf { it.total.toInt() }
    val overallPercentage = if (totalClasses > 0) (totalAttended.toDouble() / totalClasses) * 100.0 else 0.0
    val healthColor = SemesterColors.healthColor(overallPercentage, 75.0)

    val filteredSubjects = remember(subjects, filter) {
        when (filter) {
            CourseFilter.ALL -> subjects
            CourseFilter.SAFE -> subjects.filter {
                repo.calculatePercentage(it.attended, it.total) >= it.target.toDouble()
            }
            CourseFilter.AT_RISK -> subjects.filter {
                repo.calculatePercentage(it.attended, it.total) < it.target.toDouble()
            }
        }
    }

    fun markQuick(subject: Subject, status: AttendanceStatus) {
        if (status == AttendanceStatus.PRESENT) haptics.attendanceSuccess() else haptics.focusSnap()
        coroutineScope.launch {
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            repo.markAttendance(subject.id, status, today)
            onRefresh()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        // OpenTune-style bandless ambient glow seeded by overall attendance health
        AmbientTopGlow(
            color = healthColor,
            peakAlpha = 0.24f,
            height = 320.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
            contentPadding = PaddingValues(bottom = 126.dp),
        ) {
            // Top Bar (OpenTune editorial style)
            item(key = "header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "SEMESTER • RUST CORE",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            letterSpacing = 1.2.sp,
                        )
                        Text(
                            text = "Dashboard",
                            style = MaterialTheme.typography.displaySmall,
                            color = Color.White,
                        )
                    }

                    GlassIconButton(
                        icon = Icons.Rounded.Add,
                        contentDescription = "Add Subject",
                        onClick = {
                            haptics.crownTick()
                            onAddSubjectClick()
                        },
                        accentTint = healthColor,
                    )
                }
            }

            // Hero Liquid Health Card
            item(key = "hero") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 8.dp)
                        .liquidGlass(
                            shape = RoundedCornerShape(28.dp),
                            tint = Color(0xFF131317).copy(alpha = 0.86f),
                            accentTint = healthColor,
                            elevation = 16.dp,
                            touchResponse = true,
                            swell = false,
                        )
                        .padding(18.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        LiquidFillGauge(
                            percentage = overallPercentage,
                            size = 132.dp,
                            targetThreshold = 75.0,
                            sublabel = "OVERALL",
                            haptics = haptics,
                            onClick = { onSelectAccent(healthColor) },
                        )

                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            val safeCount = subjects.count {
                                repo.calculatePercentage(it.attended, it.total) >= it.target.toDouble()
                            }
                            Text(
                                text = when {
                                    subjects.isEmpty() -> "Ready to Track"
                                    overallPercentage >= 75.0 -> "Cruising Safe"
                                    overallPercentage >= 65.0 -> "Watch Buffer"
                                    else -> "Recovery Mode"
                                },
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                            )

                            HeroStatRow(
                                label = "Attended",
                                value = "$totalAttended / $totalClasses",
                                tint = Color.White,
                            )
                            HeroStatRow(
                                label = "Safe Courses",
                                value = "$safeCount / ${subjects.size}",
                                tint = SemesterColors.SafeEmeraldSoft,
                            )
                            HeroStatRow(
                                label = "Target",
                                value = "75% Min",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            if (subjects.isEmpty()) {
                item(key = "empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 28.dp)
                            .liquidGlass(
                                shape = RoundedCornerShape(26.dp),
                                tint = Color(0xFF131317).copy(alpha = 0.84f),
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
                                    .size(64.dp)
                                    .clip(CircleShape)
                                    .background(SemesterColors.SafeEmerald.copy(alpha = 0.16f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.School,
                                    contentDescription = null,
                                    tint = SemesterColors.SafeEmeraldSoft,
                                    modifier = Modifier.size(30.dp),
                                )
                            }
                            Text(
                                text = "No courses tracked yet",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                            )
                            Text(
                                text = "Load sample Semester 3 courses or tap + to add your own.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(4.dp))
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        repo.addSubject("Data Structures", "CIC-209", "Ms. Ritu", "102", 3u, "theory", 4u, 75u)
                                        repo.addSubject("Computational Methods", "ES-201", "Dr. Sharma", "204", 3u, "theory", 4u, 75u)
                                        repo.addSubject("Operating Systems", "CIC-205", "Mr. Gupta", "301", 3u, "theory", 4u, 75u)
                                        repo.addSubject("Computer Networks", "CIC-211", "Dr. Verma", "208", 3u, "theory", 4u, 75u)
                                        onRefresh()
                                        haptics.attendanceSuccess()
                                    }
                                },
                                shape = CircleShape,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = SemesterColors.SafeEmerald,
                                    contentColor = Color.Black,
                                ),
                            ) {
                                Icon(Icons.Rounded.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Load Sample Semester 3", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            } else {
                // Signature Collapsible Horizontal Liquid Subjects Strip
                item(key = "horizontal_liquid_strip") {
                    CollapsibleHorizontalSubjectsShelf(
                        subjects = subjects,
                        collapsed = stripCollapsed,
                        onToggleCollapse = { stripCollapsed = !stripCollapsed },
                        selectedSubjectId = selectedSubjectId,
                        onSelectSubject = { sub ->
                            selectedSubjectId = if (selectedSubjectId == sub.id) null else sub.id
                            val pct = repo.calculatePercentage(sub.attended, sub.total)
                            onSelectAccent(SemesterColors.healthColor(pct, sub.target.toDouble()))
                        },
                        repo = repo,
                        haptics = haptics,
                        onQuickMark = ::markQuick,
                    )
                }

                // Detailed Courses Section Header + Filter Pills
                item(key = "courses_header") {
                    SemesterSectionHeader(
                        title = "All Courses",
                        subtitle = "Tactile attendance controls",
                        modifier = Modifier.padding(horizontal = 20.dp),
                        action = {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                CourseFilter.entries.forEach { option ->
                                    val active = filter == option
                                    val bg by animateColorAsState(
                                        targetValue = if (active) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                                        else Color.White.copy(alpha = 0.06f),
                                        animationSpec = tween(220),
                                        label = "filterBg",
                                    )
                                    val fg by animateColorAsState(
                                        targetValue = if (active) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurfaceVariant,
                                        animationSpec = tween(220),
                                        label = "filterFg",
                                    )
                                    Box(
                                        modifier = Modifier
                                            .pressable(
                                                onClick = {
                                                    haptics.crownTick()
                                                    filter = option
                                                },
                                                pressedScale = 0.92f,
                                            )
                                            .clip(CircleShape)
                                            .background(bg)
                                            .border(
                                                width = 1.dp,
                                                color = if (active) MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)
                                                else Color.White.copy(alpha = 0.08f),
                                                shape = CircleShape,
                                            )
                                            .padding(horizontal = 10.dp, vertical = 5.dp),
                                    ) {
                                        Text(
                                            text = option.label,
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.SemiBold,
                                            color = fg,
                                        )
                                    }
                                }
                            }
                        },
                    )
                }

                items(filteredSubjects, key = { it.id }) { subject ->
                    val percentage = repo.calculatePercentage(subject.attended, subject.total)
                    val bunkGuard = repo.calculateBunkGuard(subject.attended, subject.total, subject.target)
                    DetailedCourseCard(
                        subject = subject,
                        percentage = percentage,
                        statusMessage = bunkGuard.statusMessage,
                        canBunk = bunkGuard.canBunk,
                        highlighted = subject.id == selectedSubjectId,
                        onClick = {
                            haptics.crownTick()
                            selectedSubjectId = if (selectedSubjectId == subject.id) null else subject.id
                            onSelectAccent(SemesterColors.healthColor(percentage, subject.target.toDouble()))
                        },
                        onMark = { status -> markQuick(subject, status) },
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun HeroStatRow(label: String, value: String, tint: Color) {
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
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = tint,
        )
    }
}

@Composable
private fun DetailedCourseCard(
    subject: Subject,
    percentage: Double,
    statusMessage: String,
    canBunk: Boolean,
    highlighted: Boolean,
    onClick: () -> Unit,
    onMark: (AttendanceStatus) -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent by animateColorAsState(
        targetValue = SemesterColors.healthColor(percentage, subject.target.toDouble()),
        animationSpec = tween(450),
        label = "courseAccent",
    )
    val progress by animateFloatAsState(
        targetValue = (percentage / 100.0).toFloat().coerceIn(0f, 1f),
        animationSpec = spring(dampingRatio = 0.78f, stiffness = 220f),
        label = "courseBarProgress",
    )
    val shape = RoundedCornerShape(22.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .pressable(onClick = onClick, pressedScale = 0.98f)
            .liquidGlass(
                shape = shape,
                tint = Color(0xFF141418).copy(alpha = 0.90f),
                accentTint = if (highlighted) accent else null,
                elevation = if (highlighted) 14.dp else 6.dp,
                touchResponse = true,
                swell = false,
            )
            .then(
                if (highlighted) Modifier.border(1.2.dp, accent.copy(alpha = 0.6f), shape)
                else Modifier,
            )
            .padding(16.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = subject.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = buildString {
                            append(subject.code.ifBlank { "COURSE" })
                            if (subject.classroom.isNotBlank()) append(" • Room ${subject.classroom}")
                            if (subject.professor.isNotBlank()) append(" • ${subject.professor}")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Spacer(Modifier.width(10.dp))

                Text(
                    text = "${percentage.roundToInt()}%",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.ExtraBold,
                    color = accent,
                    letterSpacing = (-0.5).sp,
                )
            }

            Spacer(Modifier.height(10.dp))

            // Smooth animated progress bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.08f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(progress)
                        .clip(CircleShape)
                        .background(
                            Brush.horizontalGradient(
                                listOf(accent.copy(alpha = 0.7f), accent),
                            ),
                        ),
                )
            }

            Spacer(Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Surface(
                        color = accent.copy(alpha = 0.14f),
                        shape = CircleShape,
                    ) {
                        Text(
                            text = statusMessage,
                            style = MaterialTheme.typography.labelSmall,
                            color = if (canBunk) SemesterColors.SafeEmeraldSoft else SemesterColors.CriticalCrimsonSoft,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "${subject.attended}/${subject.total} classes attended",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(
                        onClick = { onMark(AttendanceStatus.PRESENT) },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = SemesterColors.SafeEmeraldContainer,
                            contentColor = SemesterColors.SafeEmeraldSoft,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Icon(Icons.Rounded.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Present", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }

                    FilledTonalButton(
                        onClick = { onMark(AttendanceStatus.ABSENT) },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = SemesterColors.CriticalCrimsonContainer,
                            contentColor = SemesterColors.CriticalCrimsonSoft,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Icon(Icons.Rounded.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Skip", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
