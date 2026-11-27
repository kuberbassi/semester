package com.semester.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Science
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.ManualCourseEntry
import com.semester.app.core.WorkspaceRepository
import com.semester.app.core.WorkspaceSubject
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.GlassIconButton
import com.semester.app.ui.components.GradientButton
import com.semester.app.ui.components.GradientText
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.RubberSegment
import com.semester.app.ui.components.SegmentOption
import com.semester.app.ui.components.SemesterPageMotion
import com.semester.app.ui.components.SemesterPickerBadge
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.liquidHeroBanner
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

enum class WorkspaceHubSection(val label: String) {
    NOTES("Notes"),
    PRACTICALS("Practicals"),
    COURSES("Courses"),
}

/**
 * Unified Desktop Productivity Hub on Android — ZERO stripped features:
 * - Notes & Interactive Todo Checklists (`NotesScreen`)
 * - Practicals & Assignments Tracker (`Practicals.tsx` parity: momentum hero, -/+ counters, hardcopy toggles)
 * - Online Courses Tracker (`Courses.tsx` parity: Coursera/Udemy/YouTube/Codédex/LinkedIn/College, progress sliders, external URLs)
 */
@Composable
fun WorkspaceHubScreen(
    semester: Int = 1,
    initialSection: WorkspaceHubSection,
    subjects: List<WorkspaceSubject>,
    dataVersion: Long,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onOpenSemesterPicker: () -> Unit = {},
    onWorkspaceUpdated: () -> Unit,
) {
    var section by remember(initialSection) { mutableStateOf(initialSection) }
    val sectionGlowColor by animateColorAsState(
        targetValue = when (section) {
            WorkspaceHubSection.NOTES -> SemesterColors.WarningAmber
            WorkspaceHubSection.PRACTICALS -> SemesterColors.BrandCyan
            WorkspaceHubSection.COURSES -> SemesterColors.BrandVioletSoft
        },
        animationSpec = tween(220),
        label = "studioTopGlow",
    )

    // Single unified surface + AmbientTopGlow spanning cleanly behind status bar, header & content (zero black band!)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        AmbientTopGlow(
            color = sectionGlowColor,
            peakAlpha = 0.20f,
            height = 300.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        Column(modifier = Modifier.fillMaxSize()) {
            // Refined transparent Studio Editorial Header with synced SEM X dropdown + clean switcher
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            SemesterPickerBadge(
                                semester = semester,
                                onClick = {
                                    haptics.crownTick()
                                    onOpenSemesterPicker()
                                },
                            )
                            Text(
                                text = "ACADEMIC STUDIO",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                letterSpacing = 1.sp,
                            )
                        }
                        Text(
                            text = when (section) {
                                WorkspaceHubSection.NOTES -> "Notes & Checklists"
                                WorkspaceHubSection.PRACTICALS -> "Practicals & Labs"
                                WorkspaceHubSection.COURSES -> "Online Courses"
                            },
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }

                RubberSegment(
                    options = listOf(
                        SegmentOption(WorkspaceHubSection.NOTES, "Notes", icon = Icons.Rounded.Checklist),
                        SegmentOption(WorkspaceHubSection.PRACTICALS, "Practicals", icon = Icons.Rounded.Science),
                        SegmentOption(WorkspaceHubSection.COURSES, "Courses", icon = Icons.AutoMirrored.Rounded.MenuBook),
                    ),
                    selected = section,
                    onSelect = {
                        haptics.focusSnap()
                        section = it
                    },
                    fillWidth = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            AnimatedContent(
                targetState = section,
                transitionSpec = {
                    SemesterPageMotion.modeTransition(forward = targetState.ordinal >= initialState.ordinal)
                },
                label = "StudioSectionTransition",
                modifier = Modifier.weight(1f),
            ) { currentSection ->
                when (currentSection) {
                    WorkspaceHubSection.NOTES -> NotesScreen(
                        dataVersion = dataVersion,
                        repo = repo,
                        haptics = haptics,
                        subjects = subjects,
                        embeddedInHub = true,
                    )
                    WorkspaceHubSection.PRACTICALS -> PracticalsPanel(
                        subjects = subjects,
                        repo = repo,
                        haptics = haptics,
                        onUpdated = onWorkspaceUpdated,
                    )
                    WorkspaceHubSection.COURSES -> OnlineCoursesPanel(
                        dataVersion = dataVersion,
                        repo = repo,
                        haptics = haptics,
                    )
                }
            }
        }
    }
}

@Composable
private fun PracticalsPanel(
    subjects: List<WorkspaceSubject>,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onUpdated: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current
    var catFilter by remember { mutableStateOf("All") }

    val courseworkSubjects = remember(subjects) {
        subjects.filter { sub ->
            sub.categories.any { it.equals("Practical", true) || it.equals("Assignment", true) }
        }
    }
    val filtered = remember(courseworkSubjects, catFilter) {
        when (catFilter) {
            "Practical" -> courseworkSubjects.filter { sub -> sub.categories.any { it.equals("Practical", true) } }
            "Assignment" -> courseworkSubjects.filter { sub -> sub.categories.any { it.equals("Assignment", true) } }
            else -> courseworkSubjects
        }
    }

    val totalItems = filtered.sumOf { sub ->
        val p = if (sub.categories.any { it.equals("Practical", true) } && catFilter != "Assignment") sub.practicalTotal else 0
        val a = if (sub.categories.any { it.equals("Assignment", true) } && catFilter != "Practical") sub.assignmentTotal else 0
        p + a
    }
    val doneItems = filtered.sumOf { sub ->
        val p = if (sub.categories.any { it.equals("Practical", true) } && catFilter != "Assignment") sub.practicalCompleted else 0
        val a = if (sub.categories.any { it.equals("Assignment", true) } && catFilter != "Practical") sub.assignmentCompleted else 0
        p + a
    }
    val submittedFiles = filtered.sumOf { sub ->
        val p = if (sub.categories.any { it.equals("Practical", true) } && catFilter != "Assignment" && sub.practicalHardcopy) 1 else 0
        val a = if (sub.categories.any { it.equals("Assignment", true) } && catFilter != "Practical" && sub.assignmentHardcopy) 1 else 0
        p + a
    }
    val overallPct = if (totalItems > 0) ((doneItems * 100.0) / totalItems).roundToInt() else 0

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
            contentPadding = PaddingValues(bottom = 136.dp),
        ) {
            item(key = "prac_header") {
                Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    RubberSegment(
                        options = listOf(
                            SegmentOption("All", "All", count = courseworkSubjects.size),
                            SegmentOption("Practical", "Practicals"),
                            SegmentOption("Assignment", "Assignments"),
                        ),
                        selected = catFilter,
                        onSelect = { haptics.crownTick(); catFilter = it },
                        fillWidth = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            // Desktop-exact Lab & Submission Momentum Hero Banner
            item(key = "prac_hero") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 6.dp)
                        .liquidHeroBanner(shape = RoundedCornerShape(24.dp), accentTint = SemesterColors.BrandCyan)
                        .padding(18.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text("LAB & SUBMISSION MOMENTUM", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    GradientText(
                                        text = "$overallPct%",
                                        style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.ExtraBold),
                                    )
                                    Text(
                                        text = "$doneItems / $totalItems items",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(bottom = 4.dp),
                                    )
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                MiniStatTile("FILES", "$submittedFiles", SemesterColors.BrandCobaltSoft)
                                MiniStatTile("COURSES", "${filtered.size}", MaterialTheme.colorScheme.onSurface)
                            }
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)),
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .fillMaxWidth((overallPct / 100f).coerceIn(0f, 1f))
                                    .clip(CircleShape)
                                    .background(SemesterGradients.brandButton),
                            )
                        }
                    }
                }
            }

            if (filtered.isEmpty()) {
                item(key = "prac_empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp)
                            .liquidGlass(shape = RoundedCornerShape(22.dp), touchResponse = false)
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Enable Practical or Assignment categories on a subject in Home to track lab records and submission files here.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            } else {
                items(filtered, key = { "prac_${it.id}" }) { sub ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 6.dp)
                            .liquidGlass(shape = RoundedCornerShape(22.dp), elevation = 8.dp, touchResponse = false)
                            .padding(16.dp),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = sub.code.ifBlank { "SUBJECT" },
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        text = sub.name,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }

                            val hasPractical = sub.categories.any { it.equals("Practical", true) }
                            val hasAssignment = sub.categories.any { it.equals("Assignment", true) }

                            if (hasPractical && catFilter != "Assignment") {
                                TrackerControlCard(
                                    label = "Practicals",
                                    done = sub.practicalCompleted,
                                    total = sub.practicalTotal,
                                    hardcopy = sub.practicalHardcopy,
                                    accent = SemesterColors.BrandCyan,
                                    onDelta = { delta ->
                                        haptics.crownTick()
                                        val next = (sub.practicalCompleted + delta).coerceIn(0, sub.practicalTotal.coerceAtLeast(1))
                                        scope.launch {
                                            repo.updateSubject(sub.id, practicalCompleted = next)
                                            onUpdated()
                                        }
                                    },
                                    onTotalDelta = { delta ->
                                        haptics.crownTick()
                                        val nextTot = (sub.practicalTotal + delta).coerceIn(1, 50)
                                        val clampedDone = sub.practicalCompleted.coerceAtMost(nextTot)
                                        scope.launch {
                                            repo.updateSubject(sub.id, practicalCompleted = clampedDone, practicalTotal = nextTot)
                                            onUpdated()
                                        }
                                    },
                                    onToggleHardcopy = {
                                        haptics.attendanceSuccess()
                                        scope.launch {
                                            repo.updateSubject(sub.id, practicalHardcopy = !sub.practicalHardcopy)
                                            onUpdated()
                                        }
                                    },
                                )
                            }

                            if (hasAssignment && catFilter != "Practical") {
                                TrackerControlCard(
                                    label = "Assignments",
                                    done = sub.assignmentCompleted,
                                    total = sub.assignmentTotal,
                                    hardcopy = sub.assignmentHardcopy,
                                    accent = SemesterColors.WarningAmber,
                                    onDelta = { delta ->
                                        haptics.crownTick()
                                        val next = (sub.assignmentCompleted + delta).coerceIn(0, sub.assignmentTotal.coerceAtLeast(1))
                                        scope.launch {
                                            repo.updateSubject(sub.id, assignmentCompleted = next)
                                            onUpdated()
                                        }
                                    },
                                    onTotalDelta = { delta ->
                                        haptics.crownTick()
                                        val nextTot = (sub.assignmentTotal + delta).coerceIn(1, 50)
                                        val clampedDone = sub.assignmentCompleted.coerceAtMost(nextTot)
                                        scope.launch {
                                            repo.updateSubject(sub.id, assignmentCompleted = clampedDone, assignmentTotal = nextTot)
                                            onUpdated()
                                        }
                                    },
                                    onToggleHardcopy = {
                                        haptics.attendanceSuccess()
                                        scope.launch {
                                            repo.updateSubject(sub.id, assignmentHardcopy = !sub.assignmentHardcopy)
                                            onUpdated()
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TrackerControlCard(
    label: String,
    done: Int,
    total: Int,
    hardcopy: Boolean,
    accent: Color,
    onDelta: (Int) -> Unit,
    onTotalDelta: (Int) -> Unit,
    onToggleHardcopy: () -> Unit,
) {
    val pct = if (total > 0) (done.toFloat() / total.toFloat()).coerceIn(0f, 1f) else 0f
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.045f))
            .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f), RoundedCornerShape(16.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("$done / $total done", style = MaterialTheme.typography.labelSmall, color = accent, fontWeight = FontWeight.SemiBold)
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f))
                            .clickable { onTotalDelta(-1) }
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    ) { Text("−tot", style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.5.sp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f))
                            .clickable { onTotalDelta(1) }
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    ) { Text("+tot", style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.5.sp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(if (hardcopy) SemesterColors.SafeEmerald.copy(alpha = 0.20f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
                        .border(1.dp, if (hardcopy) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f), CircleShape)
                        .clickable { onToggleHardcopy() }
                        .padding(horizontal = 9.dp, vertical = 5.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = if (hardcopy) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(13.dp))
                        Text(
                            text = if (hardcopy) "Hardcopy ✓" else "Hardcopy",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (hardcopy) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                IconButton(onClick = { onDelta(-1) }, modifier = Modifier.size(30.dp)) {
                    Icon(Icons.Rounded.Remove, contentDescription = "Decrease", tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
                }
                IconButton(onClick = { onDelta(1) }, modifier = Modifier.size(30.dp)) {
                    Icon(Icons.Rounded.Add, contentDescription = "Increase", tint = accent, modifier = Modifier.size(16.dp))
                }
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(5.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(pct)
                    .clip(CircleShape)
                    .background(accent),
            )
        }
    }
}

@Composable
private fun OnlineCoursesPanel(
    dataVersion: Long,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current

    var courses by remember { mutableStateOf<List<ManualCourseEntry>>(emptyList()) }
    var filter by remember { mutableStateOf("all") }
    var editingCourse by remember { mutableStateOf<ManualCourseEntry?>(null) }

    fun load() {
        scope.launch { courses = repo.getManualCourses() }
    }

    LaunchedEffect(dataVersion) { load() }

    val activeCount = courses.count { it.progress < 100 }
    val doneCount = courses.count { it.progress == 100 }
    val avgProgress = if (courses.isNotEmpty()) courses.map { it.progress }.average().roundToInt() else 0
    val shown = remember(courses, filter) {
        when (filter) {
            "active" -> courses.filter { it.progress < 100 }
            "done" -> courses.filter { it.progress == 100 }
            else -> courses
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
            contentPadding = PaddingValues(bottom = 136.dp),
        ) {
            item(key = "courses_hdr") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "SELF-PACED LEARNING • ${courses.size} TRACKED",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 1.sp,
                    )
                    GlassIconButton(
                        icon = Icons.Rounded.Add,
                        contentDescription = "Add Online Course",
                        size = 38.dp,
                        accentTint = SemesterColors.BrandVioletSoft,
                        onClick = {
                            haptics.focusSnap()
                            editingCourse = ManualCourseEntry(title = "", platform = "coursera", progress = 0)
                        },
                    )
                }
            }

            item(key = "courses_hero") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 6.dp)
                        .liquidHeroBanner(shape = RoundedCornerShape(24.dp), accentTint = SemesterColors.BrandVioletSoft)
                        .padding(18.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text("AVERAGE PROGRESS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            GradientText(
                                text = "$avgProgress%",
                                style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.ExtraBold),
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MiniStatTile("ACTIVE", "$activeCount", SemesterColors.WarningAmber)
                            MiniStatTile("DONE", "$doneCount", SemesterColors.SafeEmerald)
                        }
                    }
                }
            }

            item(key = "courses_filter") {
                Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    RubberSegment(
                        options = listOf(
                            SegmentOption("all", "All", count = courses.size),
                            SegmentOption("active", "Active", count = activeCount),
                            SegmentOption("done", "Done", count = doneCount),
                        ),
                        selected = filter,
                        onSelect = { haptics.crownTick(); filter = it },
                        fillWidth = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            if (shown.isEmpty()) {
                item(key = "courses_empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp)
                            .liquidGlass(shape = RoundedCornerShape(22.dp), touchResponse = false)
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("Track Coursera, Udemy, YouTube & Certification courses", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            GradientButton(
                                text = "Add Course",
                                icon = Icons.Rounded.Add,
                                onClick = { editingCourse = ManualCourseEntry(title = "", platform = "coursera") },
                            )
                        }
                    }
                }
            } else {
                items(shown, key = { it.id }) { course ->
                    val platformColors = when (course.platform.lowercase()) {
                        "coursera" -> SemesterColors.BrandCobalt to SemesterColors.BrandCyan
                        "udemy" -> SemesterColors.BrandViolet to SemesterColors.CriticalPink
                        "youtube" -> SemesterColors.CriticalCrimson to SemesterColors.WarningOrange
                        "codedex" -> SemesterColors.WarningAmber to SemesterColors.WarningOrange
                        "college" -> SemesterColors.SafeEmerald to SemesterColors.BrandCyan
                        else -> SemesterColors.BrandIndigo to SemesterColors.BrandViolet
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 6.dp)
                            .liquidGlass(
                                shape = RoundedCornerShape(22.dp),
                                accentTint = platformColors.first,
                                elevation = 8.dp,
                                touchResponse = false,
                            )
                            .clickable {
                                haptics.crownTick()
                                editingCourse = course
                            }
                            .padding(16.dp),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(Brush.horizontalGradient(listOf(platformColors.first, platformColors.second)))
                                        .padding(horizontal = 10.dp, vertical = 4.dp),
                                ) {
                                    Text(
                                        text = course.platform.replaceFirstChar { it.uppercase() },
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    if (course.url.startsWith("http://") || course.url.startsWith("https://")) {
                                        IconButton(
                                            onClick = {
                                                runCatching {
                                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(course.url)))
                                                }
                                            },
                                            modifier = Modifier.size(30.dp),
                                        ) {
                                            Icon(Icons.AutoMirrored.Rounded.OpenInNew, contentDescription = "Open URL", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                                        }
                                    }
                                    Text(
                                        text = "${course.progress}%",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = if (course.progress == 100) SemesterColors.SafeEmerald else platformColors.second,
                                    )
                                }
                            }

                            Text(
                                text = course.title,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (course.instructor.isNotBlank()) {
                                Text("Instructor: ${course.instructor}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }

                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxHeight()
                                        .fillMaxWidth((course.progress / 100f).coerceIn(0f, 1f))
                                        .clip(CircleShape)
                                        .background(Brush.horizontalGradient(listOf(platformColors.first, platformColors.second))),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    editingCourse?.let { draft ->
        ManualCourseEditorDialog(
            initial = draft,
            onDismiss = { editingCourse = null },
            onSave = { updated ->
                scope.launch {
                    repo.saveManualCourse(updated)
                    haptics.attendanceSuccess()
                    editingCourse = null
                    load()
                }
            },
            onDelete = { id ->
                scope.launch {
                    repo.deleteManualCourse(id)
                    haptics.selectionConfirm()
                    editingCourse = null
                    load()
                }
            },
        )
    }
}

@Composable
private fun ManualCourseEditorDialog(
    initial: ManualCourseEntry,
    onDismiss: () -> Unit,
    onSave: (ManualCourseEntry) -> Unit,
    onDelete: (String) -> Unit,
) {
    var title by remember(initial.id) { mutableStateOf(initial.title) }
    var platform by remember(initial.id) { mutableStateOf(initial.platform.ifBlank { "coursera" }) }
    var url by remember(initial.id) { mutableStateOf(initial.url) }
    var instructor by remember(initial.id) { mutableStateOf(initial.instructor) }
    var targetDate by remember(initial.id) { mutableStateOf(initial.targetCompletionDate) }
    var notes by remember(initial.id) { mutableStateOf(initial.notes) }
    var progress by remember(initial.id) { mutableFloatStateOf(initial.progress.toFloat()) }
    val platforms = listOf("coursera", "udemy", "youtube", "codedex", "linkedin", "college", "custom")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id.isBlank()) "Add Online Course" else "Edit Course", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Course Title") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(platforms) { p ->
                        val active = p == platform
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (active) SemesterColors.BrandCobalt else MaterialTheme.colorScheme.surfaceContainerHigh)
                                .clickable { platform = p }
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                        ) {
                            Text(p.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall, color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("Course URL (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = instructor, onValueChange = { instructor = it }, label = { Text("Instructor") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = targetDate, onValueChange = { targetDate = it }, label = { Text("Target Date") }, placeholder = { Text("YYYY-MM-DD") }, singleLine = true, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notes (optional)") }, maxLines = 3, modifier = Modifier.fillMaxWidth())
                Text("Progress: ${progress.roundToInt()}%", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Slider(
                    value = progress,
                    onValueChange = { progress = it },
                    valueRange = 0f..100f,
                    colors = SliderDefaults.colors(thumbColor = SemesterColors.BrandCyan, activeTrackColor = SemesterColors.BrandCobalt),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (title.isNotBlank()) {
                        onSave(
                            initial.copy(
                                title = title.trim(),
                                platform = platform,
                                url = url.trim(),
                                instructor = instructor.trim(),
                                targetCompletionDate = targetDate.trim(),
                                notes = notes.trim(),
                                progress = progress.roundToInt(),
                            ),
                        )
                    }
                },
                enabled = title.isNotBlank(),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = SemesterColors.BrandIndigo),
            ) { Text("Save", color = Color.White, fontWeight = FontWeight.Bold) }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (initial.id.isNotBlank()) {
                    OutlinedButton(
                        onClick = { onDelete(initial.id) },
                        shape = CircleShape,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = SemesterColors.CriticalCrimsonSoft),
                    ) {
                        Icon(Icons.Rounded.DeleteOutline, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
        shape = RoundedCornerShape(24.dp),
    )
}

@Composable
private fun MiniStatTile(label: String, value: String, tint: Color) {
    Column(
        modifier = Modifier
            .width(78.dp)
            .height(58.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
            .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f), RoundedCornerShape(16.dp))
            .padding(horizontal = 6.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.ExtraBold,
            color = tint,
            maxLines = 1,
        )
    }
}
