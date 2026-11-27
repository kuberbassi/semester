package com.semester.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.OpenInFull
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.semester.app.core.AttendanceLogEntry
import com.semester.app.core.WorkspaceRepository
import com.semester.app.core.WorkspaceSubject
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Complete Desktop-Parity Course Inspector & Editor:
 * - Overview Tab: Attendance summary (with medical-adjusted & raw stats), Practicals/Assignments
 *   trackers & hardcopy toggles, Syllabus preview (with full-screen expand), and Recent History.
 * - Edit Tab (100% Desktop `EditSubjectModal.tsx` parity):
 *   Name, Multi-Select Categories (Theory / Practical / Assignment) with smart auto-credits,
 *   Code, Credits (0-10), Professor, Classroom (live-linked to Timetable), Expandable Full-Screen
 *   Syllabus Editor, Amber Manual Attendance Override (with live dual medical-excluded & medical-absent
 *   percentage readout), Target %, and Practical / Assignment Total overrides.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubjectDetailSheet(
    subject: WorkspaceSubject,
    allSubjects: List<WorkspaceSubject> = emptyList(),
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onChanged: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val isDark = LocalIsDarkTheme.current

    var activeSection by remember { mutableStateOf("overview") } // "overview" | "edit"
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var showExpandedSyllabus by remember { mutableStateOf(false) }
    var recentLogs by remember(subject.id) { mutableStateOf<List<AttendanceLogEntry>>(emptyList()) }

    fun reloadLogs() {
        scope.launch {
            recentLogs = repo.getSubjectLogs(subject.id, 12)
        }
    }

    LaunchedEffect(subject.id, subject.total, subject.attended) {
        recentLogs = repo.getSubjectLogs(subject.id, 12)
    }

    // Editable fields (100% Desktop EditSubjectModal parity)
    var name by remember(subject.id) { mutableStateOf(subject.name) }
    var code by remember(subject.id) { mutableStateOf(subject.code) }
    var professor by remember(subject.id) { mutableStateOf(subject.professor) }
    var classroom by remember(subject.id) { mutableStateOf(subject.classroom) }
    var creditsStr by remember(subject.id) { mutableStateOf(subject.credits.toString()) }
    var attendedStr by remember(subject.id, subject.physicalAttended) { mutableStateOf(subject.physicalAttended.toString()) }
    var totalStr by remember(subject.id, subject.total) { mutableStateOf(subject.total.toString()) }
    var selectedCategories by remember(subject.id) {
        mutableStateOf(
            subject.categories.filter { it.isNotBlank() }.toSet().ifEmpty {
                setOf(if (subject.isPractical) "Practical" else "Theory")
            },
        )
    }
    var pracDone by remember(subject.id, subject.practicalCompleted) { mutableIntStateOf(subject.practicalCompleted) }
    var pracTotalStr by remember(subject.id, subject.practicalTotal) { mutableStateOf(subject.practicalTotal.toString()) }
    var pracHardcopy by remember(subject.id, subject.practicalHardcopy) { mutableStateOf(subject.practicalHardcopy) }
    var asgnDone by remember(subject.id, subject.assignmentCompleted) { mutableIntStateOf(subject.assignmentCompleted) }
    var asgnTotalStr by remember(subject.id, subject.assignmentTotal) { mutableStateOf(subject.assignmentTotal.toString()) }
    var asgnHardcopy by remember(subject.id, subject.assignmentHardcopy) { mutableStateOf(subject.assignmentHardcopy) }
    var syllabus by remember(subject.id) { mutableStateOf(subject.syllabus) }

    val healthColor = SemesterColors.healthColor(subject.percentage, subject.target.toDouble(), hasData = subject.eligibleTotal > 0)

    fun toggleCategory(cat: String) {
        haptics.crownTick()
        val next = if (cat in selectedCategories) {
            (selectedCategories - cat).ifEmpty { setOf(cat) }
        } else {
            selectedCategories + cat
        }
        selectedCategories = next
        val hasT = "Theory" in next
        val hasP = "Practical" in next
        creditsStr = when {
            hasT && !hasP -> "3"
            hasP && !hasT -> "1"
            hasT && hasP -> "4"
            else -> creditsStr
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        scrimColor = Color.Black.copy(alpha = 0.58f),
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
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = buildString {
                            if (subject.code.isNotBlank()) append("${subject.code} • ")
                            append("${subject.credits} Cr • Sem ${subject.semester}")
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = subject.name,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = "${subject.percentage.roundToInt()}%",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = healthColor,
                )
            }

            RubberSegment(
                options = listOf(
                    SegmentOption("overview", "Overview"),
                    SegmentOption("edit", "Edit Subject"),
                ),
                selected = activeSection,
                onSelect = {
                    haptics.crownTick()
                    activeSection = it
                },
                fillWidth = true,
                modifier = Modifier.fillMaxWidth(),
            )

            AnimatedContent(
                targetState = activeSection,
                transitionSpec = { SemesterPageMotion.modeTransition(forward = targetState == "edit") },
                label = "SubjectSheetSection",
            ) { section ->
                if (section == "overview") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        // Compact Attendance Summary
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(18.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column {
                                Text("Attended", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("${subject.physicalAttended} / ${subject.eligibleTotal}", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Medical", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("${subject.medicalCount}", style = MaterialTheme.typography.titleMedium, color = SemesterColors.ElectricBlue, fontWeight = FontWeight.Bold)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Standing", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(subject.statusMessage, style = MaterialTheme.typography.labelLarge, color = healthColor, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Practicals & Assignments quick counters + Hardcopy toggles (strictly shown only when selected!)
                        val showPrac = selectedCategories.any { it.equals("Practical", true) }
                        val showAsgn = selectedCategories.any { it.equals("Assignment", true) }
                        if (showPrac || showAsgn) {
                            Text("Coursework", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                            if (showPrac) {
                                val pTot = (pracTotalStr.toIntOrNull() ?: subject.practicalTotal).coerceAtLeast(1)
                                CounterRow(
                                    label = "Practicals",
                                    value = pracDone,
                                    total = pTot,
                                    hardcopy = pracHardcopy,
                                    accent = SemesterColors.BrandCobalt,
                                    onDelta = { delta ->
                                        val next = (pracDone + delta).coerceIn(0, pTot)
                                        pracDone = next
                                        haptics.crownTick()
                                        scope.launch {
                                            repo.updateSubject(subject.id, practicalCompleted = next, practicalTotal = pTot)
                                            onChanged()
                                        }
                                    },
                                    onToggleHardcopy = {
                                        val next = !pracHardcopy
                                        pracHardcopy = next
                                        haptics.attendanceSuccess()
                                        scope.launch {
                                            repo.updateSubject(subject.id, practicalHardcopy = next)
                                            onChanged()
                                        }
                                    },
                                )
                            }
                            if (showAsgn) {
                                val aTot = (asgnTotalStr.toIntOrNull() ?: subject.assignmentTotal).coerceAtLeast(1)
                                CounterRow(
                                    label = "Assignments",
                                    value = asgnDone,
                                    total = aTot,
                                    hardcopy = asgnHardcopy,
                                    accent = SemesterColors.BrandCyan,
                                    onDelta = { delta ->
                                        val next = (asgnDone + delta).coerceIn(0, aTot)
                                        asgnDone = next
                                        haptics.crownTick()
                                        scope.launch {
                                            repo.updateSubject(subject.id, assignmentCompleted = next, assignmentTotal = aTot)
                                            onChanged()
                                        }
                                    },
                                    onToggleHardcopy = {
                                        val next = !asgnHardcopy
                                        asgnHardcopy = next
                                        haptics.attendanceSuccess()
                                        scope.launch {
                                            repo.updateSubject(subject.id, assignmentHardcopy = next)
                                            onChanged()
                                        }
                                    },
                                )
                            }
                        }

                        // Syllabus preview card (opens full-screen editor directly!)
                        SyllabusPreviewCard(
                            syllabus = syllabus,
                            onExpand = {
                                haptics.crownTick()
                                showExpandedSyllabus = true
                            },
                        )

                        // Recent Attendance History with 1-tap Undo
                        if (recentLogs.isNotEmpty()) {
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
                            Text("Recent History (${recentLogs.size})", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                            recentLogs.take(8).forEach { log ->
                                val tint = when (log.status) {
                                    "present", "late", "duty" -> SemesterColors.SafeEmerald
                                    "absent" -> SemesterColors.CriticalCrimson
                                    "approved_medical", "medical" -> SemesterColors.ElectricBlue
                                    "substituted" -> SemesterColors.WarningAmber
                                    else -> Color(0xFF94A3B8)
                                }
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(MaterialTheme.colorScheme.surfaceVariant)
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Text(log.date, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                            Surface(color = tint.copy(alpha = 0.16f), shape = CircleShape) {
                                                Text(
                                                    text = log.status.replace("approved_", "").replaceFirstChar { it.uppercase() },
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = tint,
                                                    fontWeight = FontWeight.Bold,
                                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                                )
                                            }
                                        }
                                        val subtext = buildString {
                                            if (log.substitutedBy.isNotBlank()) append("by ${log.substitutedBy}")
                                            if (log.notes.isNotBlank()) {
                                                if (isNotEmpty()) append(" • ")
                                                append(log.notes)
                                            }
                                        }
                                        if (subtext.isNotBlank()) {
                                            Text(subtext, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                    }
                                    IconButton(
                                        onClick = {
                                            haptics.softDismiss()
                                            scope.launch {
                                                repo.deleteAttendance(log.id)
                                                onChanged()
                                                reloadLogs()
                                            }
                                        },
                                        modifier = Modifier.size(30.dp),
                                    ) {
                                        Icon(Icons.Rounded.DeleteOutline, contentDescription = "Undo", tint = SemesterColors.CriticalCrimson, modifier = Modifier.size(17.dp))
                                    }
                                }
                            }
                        } else {
                            Text(
                                text = "Mark attendance from Today's Classes on Home or Attendance Calendar.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    // ─── Full Desktop EditSubjectModal Parity ────────────────────────
                    val liveAtt = attendedStr.toIntOrNull() ?: 0
                    val liveTot = totalStr.toIntOrNull() ?: 0
                    val liveEligible = (liveTot - subject.medicalCount).coerceAtLeast(0)
                    val pctNoMed = if (liveEligible > 0) (liveAtt * 100.0) / liveEligible else 0.0
                    val pctWithMedAbsent = if (liveTot > 0) (liveAtt * 100.0) / liveTot else 0.0

                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedTextField(
                            value = name,
                            onValueChange = { name = it },
                            label = { Text("Subject Name") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        // Multi-select Categories (Theory / Practical / Assignment)
                        Text("Categories", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            listOf("Theory", "Practical", "Assignment").forEach { cat ->
                                val active = cat in selectedCategories
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(CircleShape)
                                        .then(
                                            if (active) Modifier.background(SemesterGradients.brandButton)
                                            else Modifier
                                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                                .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
                                        )
                                        .clickable { toggleCategory(cat) }
                                        .padding(vertical = 9.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = cat,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = if (active) Color.White else MaterialTheme.colorScheme.onSurface,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = code,
                                onValueChange = { code = it },
                                label = { Text("Subject Code") },
                                singleLine = true,
                                modifier = Modifier.weight(1.2f),
                            )
                            OutlinedTextField(
                                value = creditsStr,
                                onValueChange = { creditsStr = it.filter(Char::isDigit).take(2) },
                                label = { Text("Credits") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(0.8f),
                            )
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = professor,
                                onValueChange = { professor = it },
                                label = { Text("Professor") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = classroom,
                                onValueChange = { classroom = it },
                                label = { Text("Classroom / Lab") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                        }

                        // Expandable Syllabus / Notes Card (Desktop parity!)
                        SyllabusPreviewCard(
                            syllabus = syllabus,
                            onExpand = {
                                haptics.crownTick()
                                showExpandedSyllabus = true
                            },
                        )

                        // Amber-tinted Manual Attendance Override Card (exact Desktop EditSubjectModal design!)
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(20.dp))
                                .background(SemesterColors.WarningAmber.copy(alpha = if (isDark) 0.09f else 0.08f))
                                .border(1.dp, SemesterColors.WarningAmber.copy(alpha = 0.28f), RoundedCornerShape(20.dp))
                                .padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column {
                                Text(
                                    text = "Manual Attendance Override",
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = SemesterColors.WarningAmber,
                                )
                                Text(
                                    text = "Adjust counts directly. Medical leaves (${subject.medicalCount}) are excluded from adjusted total.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }

                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedTextField(
                                    value = attendedStr,
                                    onValueChange = { attendedStr = it.filter(Char::isDigit).take(4) },
                                    label = { Text("Classes Attended") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                OutlinedTextField(
                                    value = totalStr,
                                    onValueChange = { totalStr = it.filter(Char::isDigit).take(4) },
                                    label = { Text("Total Conducted") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                            }

                            // Live Dual Preview (Medical Excluded vs Counted Absent — Desktop parity)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.65f))
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column {
                                    Text("Med excluded • $liveAtt/$liveEligible", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(String.format(Locale.US, "%.1f%%", pctNoMed), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("Med as absent • $liveAtt/$liveTot", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(String.format(Locale.US, "%.1f%%", pctWithMedAbsent), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
                                }
                            }

                            // Practical & Assignment Target Totals Override (Desktop parity!)
                            val showPracTotal = "Practical" in selectedCategories
                            val showAsgnTotal = "Assignment" in selectedCategories
                            if (showPracTotal || showAsgnTotal) {
                                HorizontalDivider(color = SemesterColors.WarningAmber.copy(alpha = 0.22f))
                                Text("Target Totals", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    if (showPracTotal) {
                                        OutlinedTextField(
                                            value = pracTotalStr,
                                            onValueChange = { pracTotalStr = it.filter(Char::isDigit).take(3) },
                                            label = { Text("Practical Total") },
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                            singleLine = true,
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                    if (showAsgnTotal) {
                                        OutlinedTextField(
                                            value = asgnTotalStr,
                                            onValueChange = { asgnTotalStr = it.filter(Char::isDigit).take(3) },
                                            label = { Text("Assignment Total") },
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                            singleLine = true,
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            DangerPillButton(
                                text = "Delete",
                                icon = Icons.Rounded.DeleteOutline,
                                onClick = { showDeleteConfirm = true },
                                modifier = Modifier.weight(1f),
                            )
                            GradientButton(
                                text = "Save Changes",
                                enabled = name.isNotBlank(),
                                onClick = {
                                    scope.launch {
                                        val parsedAtt = attendedStr.toIntOrNull()
                                        val parsedTot = totalStr.toIntOrNull()
                                        val parsedCredits = (creditsStr.toIntOrNull() ?: subject.credits).coerceIn(0, 10)
                                        val parsedPracTotal = (pracTotalStr.toIntOrNull() ?: subject.practicalTotal).coerceAtLeast(1)
                                        val parsedAsgnTotal = (asgnTotalStr.toIntOrNull() ?: subject.assignmentTotal).coerceAtLeast(1)
                                        val countsChanged = parsedAtt != subject.physicalAttended || parsedTot != subject.total
                                        repo.updateSubject(
                                            subjectId = subject.id,
                                            name = name,
                                            code = code,
                                            professor = professor,
                                            classroom = classroom,
                                            credits = parsedCredits,
                                            attended = if (countsChanged) parsedAtt else null,
                                            total = if (countsChanged) parsedTot else null,
                                            categories = selectedCategories.toList(),
                                            practicalTotal = parsedPracTotal,
                                            assignmentTotal = parsedAsgnTotal,
                                            syllabus = syllabus,
                                        )
                                        haptics.attendanceSuccess()
                                        onChanged()
                                        onDismiss()
                                    }
                                },
                                modifier = Modifier.weight(1.4f),
                            )
                        }
                    }
                }
            }
        }
    }

    // Full-screen Expanded Syllabus Editor (exact Desktop `isSyllabusExpanded` dialog parity!)
    if (showExpandedSyllabus) {
        Dialog(
            onDismissRequest = { showExpandedSyllabus = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(26.dp),
                modifier = Modifier
                    .fillMaxWidth(0.94f)
                    .fillMaxHeight(0.76f),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Syllabus & Notes", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
                            Text(name.ifBlank { subject.name }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        IconButton(onClick = { showExpandedSyllabus = false }) {
                            Icon(Icons.Rounded.Close, contentDescription = "Close")
                        }
                    }
                    OutlinedTextField(
                        value = syllabus,
                        onValueChange = { syllabus = it },
                        placeholder = { Text("Unit 1, Unit 2, exam topics, reference books, important lab dates…") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                    )
                    GradientButton(
                        text = "Save Syllabus",
                        onClick = {
                            scope.launch {
                                repo.updateSubject(subject.id, syllabus = syllabus)
                                haptics.attendanceSuccess()
                                onChanged()
                                showExpandedSyllabus = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete ${subject.name}?", color = MaterialTheme.colorScheme.onSurface) },
            text = {
                Text(
                    "This removes the course, its attendance logs, and timetable slots cleanly across all synced devices.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            repo.deleteSubject(subject.id)
                            haptics.selectionConfirm()
                            showDeleteConfirm = false
                            onChanged()
                            onDismiss()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SemesterColors.CriticalCrimson),
                ) {
                    Text("Delete", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") }
            },
            containerColor = MaterialTheme.colorScheme.surface,
        )
    }
}

@Composable
private fun SyllabusPreviewCard(
    syllabus: String,
    onExpand: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f), RoundedCornerShape(18.dp))
            .clickable { onExpand() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.Description,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(18.dp),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = "Syllabus / Notes",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = syllabus.ifBlank { "Tap to add syllabus topics or exam notes…" },
                style = MaterialTheme.typography.bodySmall,
                color = if (syllabus.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f) else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Surface(
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
            shape = CircleShape,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(Icons.Rounded.OpenInFull, contentDescription = "Expand", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(12.dp))
                Text("Expand", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun CounterRow(
    label: String,
    value: Int,
    total: Int,
    hardcopy: Boolean,
    accent: Color,
    onDelta: (Int) -> Unit,
    onToggleHardcopy: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Medium)
            Text("$value / $total completed", style = MaterialTheme.typography.labelSmall, color = accent)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (hardcopy) SemesterColors.SafeEmerald.copy(alpha = 0.20f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
                    .border(1.dp, if (hardcopy) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f), CircleShape)
                    .clickable { onToggleHardcopy() }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = if (hardcopy) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(12.dp))
                    Text(if (hardcopy) "Hardcopy ✓" else "Hardcopy", style = MaterialTheme.typography.labelSmall, color = if (hardcopy) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                }
            }
            IconButton(onClick = { onDelta(-1) }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Rounded.Remove, contentDescription = "Decrease", tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
            }
            Text("$value", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
            IconButton(onClick = { onDelta(1) }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Rounded.Add, contentDescription = "Increase", tint = accent, modifier = Modifier.size(16.dp))
            }
        }
    }
}
