package com.semester.app.ui.screens

import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.ResultSubjectEntry
import com.semester.app.core.ResultsAnalytics
import com.semester.app.core.ResultsPdfExporter
import com.semester.app.core.WorkspaceRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.network.IpuCaptchaChallenge
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.ComponentDistributionCard
import com.semester.app.ui.components.GlassIconButton
import com.semester.app.ui.components.GradeDistributionCard
import com.semester.app.ui.components.GradientButton
import com.semester.app.ui.components.GradientText
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.RubberSegment
import com.semester.app.ui.components.ScoreBreakdownChartCard
import com.semester.app.ui.components.ScrollForwardHint
import com.semester.app.ui.components.SegmentOption
import com.semester.app.ui.components.SemesterPickerBadge
import com.semester.app.ui.components.SemesterSectionHeader
import com.semester.app.ui.components.SgpaTrajectoryCard
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.liquidHeroBanner
import com.semester.app.ui.components.pressable
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun IpuResultsScreen(
    semester: Int = 1,
    defaultEnrollment: String,
    dataVersion: Long,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onOpenSemesterPicker: () -> Unit = {},
    onDataChanged: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current

    var analytics by remember { mutableStateOf(ResultsAnalytics()) }
    var selectedSemTab by remember { mutableIntStateOf(0) } // 0 = Overview
    var paperFilter by remember { mutableStateOf("all") } // all | dist | focus
    var showSyncDialog by remember { mutableStateOf(false) }
    var editingCreditTarget by remember { mutableStateOf<Pair<Int, ResultSubjectEntry>?>(null) }
    var exportNotice by remember { mutableStateOf<String?>(null) }

    var targetCgpa by remember { mutableFloatStateOf(8.8f) }
    var nextSemCredits by remember { mutableFloatStateOf(24f) }

    val pdfLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/pdf"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            ResultsPdfExporter.writeTranscriptPdf(context, uri, analytics)
                .onSuccess {
                    exportNotice = "Clean Academic Transcript PDF saved successfully."
                    haptics.attendanceSuccess()
                }
                .onFailure {
                    exportNotice = "PDF export failed: ${it.message}"
                }
        }
    }

    LaunchedEffect(dataVersion) {
        analytics = repo.getResultsAnalytics()
        if (analytics.hasData && analytics.cgpa > 0.0) {
            targetCgpa = (analytics.cgpa + 0.35).coerceIn(6.5, 9.8).toFloat()
        }
    }

    val scopedPairs = remember(analytics, selectedSemTab) {
        if (selectedSemTab == 0) {
            analytics.semesters.flatMap { sem -> sem.subjects.map { sem.semester to it } }
        } else {
            analytics.semesters.firstOrNull { it.semester == selectedSemTab }
                ?.subjects?.map { selectedSemTab to it }
                .orEmpty()
        }
    }
    val scopedSubjects = remember(scopedPairs) { scopedPairs.map { it.second } }
    val filteredPairs = remember(scopedPairs, paperFilter) {
        when (paperFilter) {
            "dist" -> scopedPairs.filter { !it.second.isPending && it.second.percentage >= 75.0 }
            "focus" -> scopedPairs.filter { !it.second.isPending && it.second.percentage < 65.0 }
            else -> scopedPairs
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        AmbientTopGlow(
            color = SemesterColors.BrandCobalt,
            peakAlpha = 0.22f,
            height = 310.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
            contentPadding = PaddingValues(bottom = 136.dp),
        ) {
            // Desktop-identical Results Header with CGPA pill + Sync IPU Portal + Export PDF
            item(key = "results_header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
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
                                text = "GGSIPU ORDINANCE 11",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                letterSpacing = 1.sp,
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "Results",
                                style = MaterialTheme.typography.headlineLarge,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            if (analytics.hasData) {
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(SemesterColors.BrandCobalt.copy(alpha = 0.16f))
                                        .border(1.dp, SemesterColors.BrandCobalt.copy(alpha = 0.30f), CircleShape)
                                        .padding(horizontal = 9.dp, vertical = 3.dp),
                                ) {
                                    Text(
                                        text = "CGPA ${String.format(Locale.US, "%.2f", analytics.cgpa)}",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            }
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (analytics.hasData) {
                            GlassIconButton(
                                icon = Icons.Rounded.PictureAsPdf,
                                contentDescription = "Export Clean PDF",
                                onClick = {
                                    haptics.crownTick()
                                    val roll = analytics.enrollmentNumber.ifBlank { "transcript" }
                                    pdfLauncher.launch("Semester_Transcript_$roll.pdf")
                                },
                                size = 40.dp,
                                accentTint = SemesterColors.BrandCyan,
                            )
                        }
                        GlassIconButton(
                            icon = Icons.Rounded.CloudDownload,
                            contentDescription = "Sync Live IPU Portal",
                            onClick = {
                                haptics.focusSnap()
                                showSyncDialog = true
                            },
                            size = 40.dp,
                            accentTint = SemesterColors.BrandCobalt,
                        )
                    }
                }
            }

            exportNotice?.let { msg ->
                item(key = "pdf_notice") {
                    Surface(
                        color = SemesterColors.SafeEmerald.copy(alpha = 0.16f),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 4.dp),
                    ) {
                        Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(12.dp))
                    }
                }
            }

            if (!analytics.hasData) {
                item(key = "results_empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 20.dp)
                            .liquidHeroBanner(shape = RoundedCornerShape(26.dp))
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
                                    .background(SemesterColors.BrandCobalt.copy(alpha = 0.18f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Rounded.School, contentDescription = null, tint = SemesterColors.BrandCobaltSoft, modifier = Modifier.size(32.dp))
                            }
                            Text(
                                text = "No archived scorecards yet",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = "Sync directly with examweb.ggsipu.ac.in using live CAPTCHA verification to archive all semesters offline with full charts & PDF export.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(4.dp))
                            GradientButton(
                                text = "Sync Live IPU Portal",
                                icon = Icons.Rounded.CloudDownload,
                                onClick = {
                                    haptics.crownTick()
                                    showSyncDialog = true
                                },
                            )
                        }
                    }
                }
            } else {
                // 1. Desktop-Exact Academic Transcript Hero Banner
                item(key = "transcript_hero") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 6.dp)
                            .liquidHeroBanner(shape = RoundedCornerShape(26.dp), accentTint = SemesterColors.BrandCobalt)
                            .padding(18.dp),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(
                                        text = "ACADEMIC TRANSCRIPT",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                        letterSpacing = 1.sp,
                                    )
                                    Text(
                                        text = analytics.studentName.ifBlank { "GGSIPU Student" }.uppercase(),
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (analytics.program.isNotBlank()) {
                                        Text(
                                            text = analytics.program,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }

                                Spacer(Modifier.width(12.dp))

                                Column(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(20.dp))
                                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.65f))
                                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f), RoundedCornerShape(20.dp))
                                        .padding(horizontal = 16.dp, vertical = 10.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Text("OVERALL CGPA", style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    GradientText(
                                        text = String.format(Locale.US, "%.2f", analytics.cgpa),
                                        style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.ExtraBold),
                                    )
                                    Box(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(SemesterColors.BrandCobalt.copy(alpha = 0.16f))
                                            .padding(horizontal = 8.dp, vertical = 2.dp),
                                    ) {
                                        Text(
                                            text = "${analytics.academicStrength.roundToInt()}% Aggregate",
                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.5.sp),
                                            color = MaterialTheme.colorScheme.primary,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                            }

                            // Desktop's 4 Metadata Chips (Enrollment, Batch, Admission, Institute)
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                TranscriptMetaChip("ENROLLMENT", analytics.enrollmentNumber.ifBlank { "—" }, Modifier.weight(1f))
                                TranscriptMetaChip("BATCH", analytics.batch.ifBlank { "—" }, Modifier.weight(0.75f))
                            }
                            if (analytics.institute.isNotBlank()) {
                                TranscriptMetaChip("INSTITUTION", analytics.institute, Modifier.fillMaxWidth())
                            }
                        }
                    }
                }

                // 2. Desktop Gradient Active Pill Semester Tabs
                item(key = "sem_tabs") {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        item(key = "overview") {
                            SemTabChip("Overview", selectedSemTab == 0) { haptics.crownTick(); selectedSemTab = 0 }
                        }
                        items(analytics.semesters, key = { "semtab_${it.semester}" }) { sem ->
                            SemTabChip("Sem ${sem.semester}", selectedSemTab == sem.semester) {
                                haptics.crownTick()
                                selectedSemTab = sem.semester
                            }
                        }
                    }
                }

                // 3. Desktop's Exact 8-Card Analytics KPI Grid (4 rows x 2 cols on mobile)
                item(key = "kpi_8_grid") {
                    val activeSem = analytics.semesters.firstOrNull { it.semester == selectedSemTab }
                    val scored = (activeSem?.totalMarks ?: analytics.totalScoredMarks).toInt()
                    val maxM = (activeSem?.maxMarks ?: analytics.totalMaxMarks).toInt()
                    val credits = activeSem?.totalCredits ?: analytics.totalCredits
                    val distinctions = activeSem?.distinctions ?: analytics.distinctions
                    val gpaLabel = if (activeSem != null) "SEM ${activeSem.semester} SGPA" else "CGPA"
                    val gpaVal = activeSem?.sgpa ?: analytics.cgpa
                    val perfPct = (activeSem?.percentage ?: analytics.academicStrength).roundToInt()
                    val graded = scopedSubjects.filter { !it.isPending && it.total > 0 }
                    val topSub = graded.maxByOrNull { it.percentage }
                    val focusSub = graded.minByOrNull { it.percentage }
                    val passPct = if (graded.isNotEmpty()) ((graded.count { !it.isBacklog } * 100.0) / graded.size).roundToInt() else 100

                    Column(
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ResultKpiCard("SCORED MARKS", "$scored/$maxM", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
                            ResultKpiCard("PASS RATE", "$passPct%", SemesterColors.SafeEmerald, Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ResultKpiCard(gpaLabel, String.format(Locale.US, "%.2f", gpaVal), SemesterColors.BrandCyanSoft, Modifier.weight(1f))
                            ResultKpiCard("EARNED CREDITS", "$credits", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ResultKpiCard("PERFORMANCE", "$perfPct%", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f), subtitle = "Combined score index")
                            ResultKpiCard(
                                "TOP SUBJECT",
                                topSub?.code?.ifBlank { topSub.name.take(8) } ?: "—",
                                SemesterColors.BrandCobaltSoft,
                                Modifier.weight(1f),
                                subtitle = topSub?.let { "${it.percentage.roundToInt()}% score" },
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ResultKpiCard(
                                "FOCUS AREA",
                                focusSub?.code?.ifBlank { focusSub.name.take(8) } ?: "—",
                                SemesterColors.CriticalCrimsonSoft,
                                Modifier.weight(1f),
                                subtitle = focusSub?.let { "${it.percentage.roundToInt()}% score" },
                            )
                            ResultKpiCard("DISTINCTIONS", "$distinctions", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f), subtitle = "Subjects ≥ 75%")
                        }
                    }
                }

                // 4. ALL 4 REAL NATIVE COMPOSE CHARTS (Desktop ResultsDashboard Parity!)
                item(key = "chart_score_breakdown") {
                    ScoreBreakdownChartCard(
                        subjects = scopedSubjects,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    )
                }

                item(key = "chart_component_dist") {
                    ComponentDistributionCard(
                        subjects = scopedSubjects,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                    )
                }

                if (selectedSemTab == 0 && analytics.semesters.size >= 2) {
                    item(key = "chart_trajectory") {
                        SgpaTrajectoryCard(
                            semesters = analytics.semesters,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                        )
                    }
                }

                item(key = "chart_grades") {
                    val dist = remember(scopedSubjects) {
                        scopedSubjects.filter { !it.isPending && it.grade != "-" }.groupingBy { it.grade }.eachCount()
                    }
                    GradeDistributionCard(
                        gradeDistribution = dist,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                    )
                }

                // 5. Interactive Target CGPA Planner
                if (analytics.totalCredits > 0) {
                    item(key = "cgpa_planner") {
                        val reqSgpa = repo.calculateRequiredSgpa(
                            earnedCredits = analytics.totalCredits,
                            earnedGradePoints = analytics.totalGradePoints,
                            nextSemCredits = nextSemCredits.roundToInt(),
                            targetCgpa = targetCgpa.toDouble(),
                        )
                        val verdictColor = when {
                            reqSgpa <= 8.5 -> SemesterColors.SafeEmerald
                            reqSgpa <= 10.0 -> SemesterColors.WarningAmber
                            else -> SemesterColors.CriticalCrimsonSoft
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 8.dp)
                                .liquidHeroBanner(shape = RoundedCornerShape(24.dp), accentTint = SemesterColors.BrandVioletSoft)
                                .padding(16.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column {
                                        Text("TARGET CGPA PLANNER", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                        Text(
                                            text = "Goal ${String.format(Locale.US, "%.2f", targetCgpa)} (${nextSemCredits.roundToInt()} Cr next sem)",
                                            style = MaterialTheme.typography.titleSmall,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(verdictColor.copy(alpha = 0.16f))
                                            .border(1.dp, verdictColor.copy(alpha = 0.4f), CircleShape)
                                            .padding(horizontal = 10.dp, vertical = 5.dp),
                                    ) {
                                        Text(
                                            text = if (reqSgpa > 10.0) "> 10.0" else "Need ${String.format(Locale.US, "%.2f", reqSgpa)}",
                                            style = MaterialTheme.typography.labelLarge,
                                            color = verdictColor,
                                            fontWeight = FontWeight.ExtraBold,
                                        )
                                    }
                                }
                                Slider(
                                    value = targetCgpa,
                                    onValueChange = { targetCgpa = (it * 20f).roundToInt() / 20f },
                                    valueRange = 6.0f..9.8f,
                                    colors = SliderDefaults.colors(thumbColor = SemesterColors.BrandCyan, activeTrackColor = SemesterColors.BrandCobalt),
                                )
                                Text("Next Semester Credits: ${nextSemCredits.roundToInt()}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Slider(
                                    value = nextSemCredits,
                                    onValueChange = { nextSemCredits = it },
                                    valueRange = 16f..32f,
                                    steps = 15,
                                    colors = SliderDefaults.colors(thumbColor = SemesterColors.BrandVioletSoft, activeTrackColor = SemesterColors.BrandViolet),
                                )
                            }
                        }
                    }
                }

                // 6. Papers Table with Filter + 1-Tap Inline Credit Editor
                item(key = "papers_header") {
                    Column(modifier = Modifier.padding(horizontal = 20.dp)) {
                        SemesterSectionHeader(
                            title = "Papers & Credits (${filteredPairs.size})",
                            subtitle = "Tap any Cr pill to override • Emerald = Dashboard",
                        )
                        RubberSegment(
                            options = listOf(
                                SegmentOption("all", "All", count = scopedPairs.size),
                                SegmentOption("dist", "≥ 75%"),
                                SegmentOption("focus", "< 65%"),
                            ),
                            selected = paperFilter,
                            onSelect = { haptics.crownTick(); paperFilter = it },
                            fillWidth = true,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        )
                    }
                }

                items(filteredPairs, key = { (sem, sub) -> "p_${sem}_${sub.code}_${sub.name}" }) { (semNum, sub) ->
                    val creditDotColor = when (sub.creditSource) {
                        "dashboard" -> SemesterColors.SafeEmerald
                        "manual" -> SemesterColors.CriticalPink
                        "ipu_scheme", "portal" -> SemesterColors.BrandCobaltSoft
                        else -> SemesterColors.WarningAmber
                    }
                    val gradeColor = SemesterColors.gradeColor(sub.grade)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 5.dp)
                            .liquidGlass(shape = RoundedCornerShape(18.dp), elevation = 6.dp, touchResponse = false)
                            .padding(14.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = sub.code.ifBlank { "PAPER" },
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        text = "S$semNum",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                                            .padding(horizontal = 5.dp, vertical = 1.dp),
                                    )
                                    Row(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(creditDotColor.copy(alpha = 0.16f))
                                            .border(1.dp, creditDotColor.copy(alpha = 0.45f), CircleShape)
                                            .clickable {
                                                haptics.crownTick()
                                                editingCreditTarget = semNum to sub
                                            }
                                            .padding(horizontal = 7.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Box(Modifier.size(6.dp).clip(CircleShape).background(creditDotColor))
                                        Text("${sub.credits} Cr", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = sub.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = "Int ${sub.internalStr} • Ext ${sub.externalStr} • Credit Pts ${sub.creditPoints}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }

                            Spacer(Modifier.width(10.dp))

                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text = if (sub.isPending) "Pending" else "${sub.total.toInt()}/100",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontWeight = FontWeight.ExtraBold,
                                )
                                Spacer(Modifier.height(4.dp))
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(gradeColor.copy(alpha = 0.18f))
                                        .border(1.dp, gradeColor.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
                                        .padding(horizontal = 9.dp, vertical = 3.dp),
                                ) {
                                    Text(sub.grade, style = MaterialTheme.typography.labelMedium, color = gradeColor, fontWeight = FontWeight.ExtraBold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    editingCreditTarget?.let { (semNum, sub) ->
        AlertDialog(
            onDismissRequest = { editingCreditTarget = null },
            title = { Text("Edit Credits • ${sub.code}", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "${sub.name}\nSource: ${sub.creditSource.replace("_", " ")}. Recalculates SGPA/CGPA immediately and updates any matching Dashboard subject.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        (0..6).forEach { cr ->
                            val active = sub.credits == cr
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if (active) SemesterColors.BrandIndigo else MaterialTheme.colorScheme.surfaceContainerHigh)
                                    .clickable {
                                        scope.launch {
                                            analytics = repo.updateResultSubjectCredit(semNum, sub.code, sub.name, cr)
                                            haptics.attendanceSuccess()
                                            onDataChanged()
                                            editingCreditTarget = null
                                        }
                                    }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("$cr", style = MaterialTheme.typography.labelLarge, color = if (active) Color.White else MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { editingCreditTarget = null }) { Text("Close") } },
            shape = RoundedCornerShape(24.dp),
        )
    }

    if (showSyncDialog) {
        LiveIpuPortalSyncDialog(
            defaultEnrollment = defaultEnrollment.ifBlank { analytics.enrollmentNumber },
            repo = repo,
            haptics = haptics,
            onDismiss = { showSyncDialog = false },
            onSynced = { updated ->
                analytics = updated
                onDataChanged()
                showSyncDialog = false
            },
        )
    }
}

@Composable
private fun LiveIpuPortalSyncDialog(
    defaultEnrollment: String,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onSynced: (ResultsAnalytics) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val ipuClient = remember { repo.createIpuClient() }

    var enrollment by remember { mutableStateOf(defaultEnrollment) }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var captchaText by remember { mutableStateOf("") }
    var challenge by remember { mutableStateOf<IpuCaptchaChallenge?>(null) }
    var isLoadingCaptcha by remember { mutableStateOf(true) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    fun loadCaptcha() {
        isLoadingCaptcha = true
        errorMsg = null
        captchaText = ""
        scope.launch {
            runCatching { ipuClient.startSession() }
                .onSuccess {
                    challenge = it
                    isLoadingCaptcha = false
                }
                .onFailure {
                    challenge = null
                    errorMsg = it.message ?: "Could not load CAPTCHA from examweb.ggsipu.ac.in"
                    isLoadingCaptcha = false
                }
        }
    }

    LaunchedEffect(Unit) { loadCaptcha() }

    val captchaBitmap = remember(challenge) {
        challenge?.captchaPngBytes?.let { bytes ->
            runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }.getOrNull()
        }
    }

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text("Sync Live IPU Portal", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Connects directly to examweb.ggsipu.ac.in from your phone. Your password is never stored.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(value = enrollment, onValueChange = { enrollment = it }, label = { Text("Enrollment Number") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("ExamWeb Password") },
                    singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, contentDescription = "Toggle password")
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(54.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color.White),
                        contentAlignment = Alignment.Center,
                    ) {
                        when {
                            isLoadingCaptcha -> CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                            captchaBitmap != null -> Image(
                                bitmap = captchaBitmap,
                                contentDescription = "Live IPU CAPTCHA",
                                contentScale = ContentScale.Fit,
                                modifier = Modifier.fillMaxSize().padding(4.dp),
                            )
                            else -> Text("CAPTCHA unavailable", style = MaterialTheme.typography.labelSmall, color = Color.DarkGray)
                        }
                    }
                    IconButton(onClick = { haptics.crownTick(); loadCaptcha() }, enabled = !isLoadingCaptcha && !isSubmitting) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "Refresh CAPTCHA")
                    }
                }
                OutlinedTextField(value = captchaText, onValueChange = { captchaText = it }, label = { Text("Type CAPTCHA (case-sensitive)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                errorMsg?.let { err -> Text(err, style = MaterialTheme.typography.bodySmall, color = SemesterColors.CriticalCrimsonSoft) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val activeChallenge = challenge ?: return@Button
                    isSubmitting = true
                    errorMsg = null
                    haptics.selectionConfirm()
                    scope.launch {
                        runCatching {
                            repo.fetchAndSaveIpuResults(ipuClient, activeChallenge, enrollment, password, captchaText)
                        }.onSuccess { (_, updated) ->
                            isSubmitting = false
                            haptics.attendanceSuccess()
                            onSynced(updated)
                        }.onFailure { err ->
                            isSubmitting = false
                            errorMsg = err.message ?: "Sync failed."
                            loadCaptcha()
                        }
                    }
                },
                enabled = !isSubmitting && !isLoadingCaptcha && challenge != null && enrollment.isNotBlank() && password.isNotBlank() && captchaText.isNotBlank(),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = SemesterColors.BrandIndigo),
            ) {
                Text(if (isSubmitting) "Fetching..." else "Fetch All Semesters", color = Color.White, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text("Cancel") } },
        shape = RoundedCornerShape(24.dp),
    )
}

@Composable
private fun TranscriptMetaChip(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.58f))
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.45f), RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun SemTabChip(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .pressable(onClick = onClick, pressedScale = 0.94f)
            .clip(CircleShape)
            .then(
                if (active) Modifier.background(SemesterGradients.brandButton)
                else Modifier.background(MaterialTheme.colorScheme.surfaceContainer),
            )
            .border(1.dp, if (active) Color.White.copy(alpha = 0.25f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.5f), CircleShape)
            .padding(horizontal = 15.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (active) FontWeight.Bold else FontWeight.SemiBold,
            color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ResultKpiCard(
    title: String,
    value: String,
    accent: Color,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
) {
    Box(
        modifier = modifier
            .liquidGlass(shape = RoundedCornerShape(18.dp), elevation = 6.dp, touchResponse = false)
            .padding(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, color = accent, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
