package com.semester.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Science
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.ViewColumn
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.WorkspaceSubject
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin

private enum class ShelfCategory(val label: String) {
    ALL("All"),
    THEORY("Theory"),
    PRACTICAL("Practical"),
}

private enum class SubjectViewStyle(val label: String) {
    LIQUID("Liquid"),
    LIST("Table"),
}

/**
 * Exact Desktop `SubjectAccordionGallery` + Table View natively crafted for Android:
 * - Signature Desktop vertical liquid capsules side-by-side (dot, code, rotated name, rising fill, %)
 * - Tap ANY vertical capsule to spring it open into the full Expanded Liquid Wave Hero Card
 * - Seamless RubberSegment switcher between `Liquid` Accordion and `Table` list + `All / Theory / Practical` filters
 */
@Composable
fun CollapsibleHorizontalSubjectsShelf(
    subjects: List<WorkspaceSubject>,
    selectedSubjectId: String?,
    onSelectSubject: (WorkspaceSubject) -> Unit,
    onInspectSubject: (WorkspaceSubject) -> Unit,
    onAddSubjectClick: () -> Unit = {},
    haptics: HapticCrownEngine,
    modifier: Modifier = Modifier,
) {
    val isDark = LocalIsDarkTheme.current
    val scope = rememberCoroutineScope()
    val railState = rememberLazyListState()

    var viewStyle by remember { mutableStateOf(SubjectViewStyle.LIQUID) }
    var category by remember { mutableStateOf(ShelfCategory.ALL) }

    val shownSubjects = remember(subjects, category) {
        when (category) {
            ShelfCategory.ALL -> subjects
            ShelfCategory.THEORY -> subjects.filter { !it.isPractical }
            ShelfCategory.PRACTICAL -> subjects.filter { it.isPractical }
        }
    }

    val activeId = remember(shownSubjects, selectedSubjectId) {
        shownSubjects.firstOrNull { it.id == selectedSubjectId }?.id ?: shownSubjects.firstOrNull()?.id
    }

    LaunchedEffect(activeId, shownSubjects) {
        val idx = shownSubjects.indexOfFirst { it.id == activeId }
        if (idx >= 0 && viewStyle == SubjectViewStyle.LIQUID) {
            runCatching { railState.animateScrollToItem(idx) }
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        // Clean Subjects Header — zero squished badge, crisp spacing for Liquid | Table & + Add
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Subjects",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RubberSegment(
                    options = listOf(
                        SegmentOption(SubjectViewStyle.LIQUID, "Liquid", icon = Icons.Rounded.ViewColumn),
                        SegmentOption(SubjectViewStyle.LIST, "Table", icon = Icons.AutoMirrored.Rounded.ViewList),
                    ),
                    selected = viewStyle,
                    onSelect = {
                        haptics.crownTick()
                        viewStyle = it
                    },
                )
                GlassIconButton(
                    icon = Icons.Rounded.Add,
                    contentDescription = "Add Course",
                    size = 36.dp,
                    accentTint = SemesterColors.BrandCyan,
                    onClick = {
                        haptics.focusSnap()
                        onAddSubjectClick()
                    },
                )
            }
        }

        // All / Theory / Practical filter RubberSegment
        val theoryCount = subjects.count { !it.isPractical }
        val pracCount = subjects.count { it.isPractical }
        Box(modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 12.dp)) {
            RubberSegment(
                options = listOf(
                    SegmentOption(ShelfCategory.ALL, "All", count = subjects.size),
                    SegmentOption(ShelfCategory.THEORY, "Theory", count = theoryCount),
                    SegmentOption(ShelfCategory.PRACTICAL, "Practical", count = pracCount),
                ),
                selected = category,
                onSelect = {
                    haptics.crownTick()
                    category = it
                },
                fillWidth = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        AnimatedContent(
            targetState = viewStyle,
            transitionSpec = { SemesterPageMotion.modeTransition(forward = targetState == SubjectViewStyle.LIST) },
            label = "SubjectViewModeTransition",
        ) { currentView ->
            if (currentView == SubjectViewStyle.LIQUID) {
                val canScrollRail by remember { derivedStateOf { railState.canScrollForward } }
                Column {
                    LazyRow(
                        state = railState,
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(shownSubjects, key = { "acc_${it.id}" }) { subject ->
                            val isActive = subject.id == activeId
                            DesktopLiquidAccordionCard(
                                subject = subject,
                                isActive = isActive,
                                onActivate = {
                                    haptics.focusSnap()
                                    onSelectSubject(subject)
                                },
                                onInspect = {
                                    haptics.crownTick()
                                    onInspectSubject(subject)
                                },
                            )
                        }
                    }
                    ScrollForwardHint(visible = canScrollRail)
                }
            } else {
                // Clean Desktop Table Rows (view status, progress & tap to inspect/edit — no mixed mark buttons!)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .liquidGlass(
                            shape = RoundedCornerShape(24.dp),
                            elevation = 0.dp,
                        )
                        .padding(vertical = 6.dp),
                ) {
                    shownSubjects.forEachIndexed { idx, sub ->
                        if (idx > 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(1.dp)
                                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f)),
                            )
                        }
                        DesktopSubjectTableRow(
                            subject = sub,
                            isDark = isDark,
                            onInspect = {
                                haptics.crownTick()
                                onInspectSubject(sub)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DesktopLiquidAccordionCard(
    subject: WorkspaceSubject,
    isActive: Boolean,
    onActivate: () -> Unit,
    onInspect: () -> Unit,
) {
    val isDark = LocalIsDarkTheme.current
    val (stopA, stopB) = SemesterColors.healthPair(subject.percentage, subject.target.toDouble(), hasData = subject.eligibleTotal > 0)
    val isCritical = subject.eligibleTotal > 0 && !subject.isSafe
    // Silky zero-overshoot curtain reveal: fixed-width inner content eliminates text reflow stutter at 120Hz
    val animatedWidth by animateDpAsState(
        targetValue = if (isActive) 292.dp else 58.dp,
        animationSpec = tween(durationMillis = 220, easing = FastOutSlowInEasing),
        label = "accordionWidth",
    )
    val contentAlpha by animateFloatAsState(
        targetValue = if (isActive) 1f else 0f,
        animationSpec = tween(durationMillis = 160, easing = FastOutSlowInEasing),
        label = "accordionContentAlpha",
    )
    val fillFracState = animateFloatAsState(
        targetValue = (subject.percentage / 100.0).toFloat().coerceIn(0.12f, 0.90f),
        animationSpec = tween(durationMillis = 260, easing = FastOutSlowInEasing),
        label = "accordionFill",
    )
    val shape = RoundedCornerShape(26.dp)

    Box(
        modifier = Modifier
            .width(animatedWidth)
            .height(294.dp)
            .liquidGlass(
                shape = shape,
                accentTint = if (isActive) stopA else null,
                elevation = if (isActive) 12.dp else 0.dp,
            )
            .then(
                if (isActive) Modifier.border(1.4.dp, stopA.copy(alpha = 0.55f), shape)
                else Modifier,
            )
            .clickable {
                if (!isActive) onActivate() else onInspect()
            },
    ) {
        if (isActive) {
            // Isolated draw-phase wave ONLY on the single active card — ZERO recompositions on other capsules!
            ActiveAccordionWaveBackdrop(
                fillProvider = { fillFracState.value },
                stopA = stopA,
                stopB = stopB,
            )
        } else {
            // Static cached rising gradient fill for vertical capsules — ZERO per-frame allocations!
            val fillFrac = fillFracState.value
            val staticBrush = remember(stopA, stopB) {
                Brush.verticalGradient(
                    colors = listOf(
                        stopA.copy(alpha = 0.22f),
                        stopB.copy(alpha = 0.12f),
                        stopA.copy(alpha = 0.04f),
                    ),
                )
            }
            Canvas(modifier = Modifier.fillMaxSize()) {
                val waterY = size.height * (1f - fillFrac)
                drawRect(
                    brush = staticBrush,
                    topLeft = androidx.compose.ui.geometry.Offset(0f, waterY),
                    size = androidx.compose.ui.geometry.Size(size.width, size.height - waterY),
                )
            }
        }

        if (isActive) {
            Column(
                modifier = Modifier
                    .requiredWidth(292.dp)
                    .fillMaxHeight()
                    .graphicsLayer { alpha = contentAlpha }
                    .padding(16.dp),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                // Top Meta Row: Code badge + Theory/Practical icon + Credits badge + Edit icon
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(if (isDark) Color(0xFF141722) else Color.White.copy(alpha = 0.9f))
                                    .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f), CircleShape)
                                    .padding(horizontal = 9.dp, vertical = 4.dp),
                            ) {
                                Text(
                                    text = subject.code.ifBlank { "SUB" },
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f))
                                    .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f), CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = if (subject.isPractical) Icons.Rounded.Science else Icons.AutoMirrored.Rounded.MenuBook,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(13.dp),
                                )
                            }
                            if (subject.credits > 0) {
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f))
                                        .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f), CircleShape)
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                ) {
                                    Text(
                                        text = "${subject.credits} Cr",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }

                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                                .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f), CircleShape)
                                .clickable { onInspect() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Edit,
                                contentDescription = "Details & Edit",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(14.dp),
                            )
                        }
                    }

                    Spacer(Modifier.height(10.dp))

                    Text(
                        text = subject.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (subject.professor.isNotBlank()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(top = 2.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Person,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.8f),
                                modifier = Modifier.size(13.dp),
                            )
                            Text(
                                text = subject.professor,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                // Desktop's exact Recessed Stat Container (`56.4%  31/55   [Need 5]`)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (isDark) Color(0xFF141722).copy(alpha = 0.92f) else Color.White.copy(alpha = 0.92f))
                        .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.09f), RoundedCornerShape(18.dp))
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.Bottom,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                text = "${String.format(Locale.US, "%.1f", subject.percentage)}%",
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = "${subject.physicalAttended}/${subject.eligibleTotal}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(bottom = 3.dp),
                            )
                        }

                        Row(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(stopA.copy(alpha = 0.16f))
                                .border(1.dp, stopA.copy(alpha = 0.35f), CircleShape)
                                .padding(horizontal = 9.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = if (isCritical) Icons.Rounded.WarningAmber else Icons.Rounded.Shield,
                                contentDescription = null,
                                tint = stopA,
                                modifier = Modifier.size(12.dp),
                            )
                            Text(
                                text = if (isCritical) "Need ${subject.classesNeeded}" else "+${subject.safeToBunk} Safe",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = stopA,
                            )
                        }
                    }

                    if (subject.medicalCount > 0) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "+${subject.medicalCount} approved medical leave excluded",
                            style = MaterialTheme.typography.labelSmall,
                            color = SemesterColors.BrandSky,
                        )
                    }
                }

                // Bottom Row: Linked Room pin + clean Details / Edit pill (attendance marked via Timetable & Calendar)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        if (subject.classroom.isNotBlank()) {
                            Icon(
                                imageVector = Icons.Rounded.LocationOn,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = subject.classroom,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        } else {
                            Text(
                                text = "Target ${subject.target}%",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .pressable(onClick = onInspect, pressedScale = 0.92f)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                            .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.14f), CircleShape)
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Text(
                            text = "Details",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        } else {
            // Desktop's Iconic Vertical Collapsed Capsule (Dot + Code + Rotated Name + Bottom %)
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(vertical = 12.dp, horizontal = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(
                        modifier = Modifier
                            .size(9.dp)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(listOf(stopA, stopB))),
                    )
                    Text(
                        text = subject.code.ifBlank { "SUB" }.take(6),
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }

                // Vertically rotated course name (reads cleanly bottom-to-top just like Desktop!)
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = subject.name,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .layout { measurable, constraints ->
                                val placeable = measurable.measure(
                                    constraints.copy(
                                        minWidth = 0,
                                        maxWidth = constraints.maxHeight,
                                        minHeight = 0,
                                        maxHeight = constraints.maxWidth,
                                    ),
                                )
                                layout(placeable.height, placeable.width) {
                                    placeable.place(
                                        x = -(placeable.width / 2 - placeable.height / 2),
                                        y = -(placeable.height / 2 - placeable.width / 2),
                                    )
                                }
                            }
                            .rotate(-90f),
                    )
                }

                Text(
                    text = "${subject.percentage.roundToInt()}%",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = stopB,
                )
            }
        }
    }
}

@Composable
private fun ActiveAccordionWaveBackdrop(
    fillProvider: () -> Float,
    stopA: Color,
    stopB: Color,
) {
    val infinite = rememberInfiniteTransition(label = "activeCardWave")
    val phaseState = infinite.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 3600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "activeCardPhase",
    )
    val path = remember { Path() }
    val waveBrush = remember(stopA, stopB) {
        Brush.verticalGradient(
            colors = listOf(
                stopA.copy(alpha = 0.28f),
                stopB.copy(alpha = 0.15f),
                stopA.copy(alpha = 0.04f),
            ),
        )
    }
    Canvas(modifier = Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        val waterY = h * (1f - fillProvider())
        val phase = phaseState.value
        val segments = 8
        val segW = w / segments

        path.reset()
        var prevX = 0f
        var prevY = waterY + sin(phase) * 6.5f
        path.moveTo(0f, h)
        path.lineTo(prevX, prevY)
        for (i in 1..segments) {
            val currX = i * segW
            val currY = waterY + sin(phase + (i.toFloat() / segments) * 4.8f) * 6.5f
            path.quadraticTo(prevX, prevY, (prevX + currX) * 0.5f, (prevY + currY) * 0.5f)
            prevX = currX
            prevY = currY
        }
        path.lineTo(w, prevY)
        path.lineTo(w, h)
        path.close()
        drawPath(path = path, brush = waveBrush)
    }
}

@Composable
private fun DesktopSubjectTableRow(
    subject: WorkspaceSubject,
    isDark: Boolean,
    onInspect: () -> Unit,
) {
    val isCritical = subject.eligibleTotal > 0 && !subject.isSafe
    val (stopA, stopB) = SemesterColors.healthPair(subject.percentage, subject.target.toDouble(), hasData = subject.eligibleTotal > 0)
    val pctFrac = (subject.percentage / 100.0).toFloat().coerceIn(0f, 1f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onInspect() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = subject.code.ifBlank { "SUB" },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                        .padding(horizontal = 7.dp, vertical = 2.dp),
                )
                if (subject.credits > 0) {
                    Text(
                        text = "${subject.credits} Cr",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (subject.classroom.isNotBlank()) {
                    Text(
                        text = "• ${subject.classroom}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.height(3.dp))
            Text(
                text = subject.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(5.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier
                        .width(74.dp)
                        .height(5.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = if (isDark) 0.10f else 0.12f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth(pctFrac)
                            .clip(CircleShape)
                            .background(SemesterGradients.progressFill(isCritical)),
                    )
                }
                Text(
                    text = "${subject.percentage.roundToInt()}% (${subject.physicalAttended}/${subject.eligibleTotal})",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (isCritical) SemesterColors.CriticalCrimsonSoft else stopB,
                )
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(stopA.copy(alpha = 0.16f))
                    .border(1.dp, stopA.copy(alpha = 0.34f), CircleShape)
                    .padding(horizontal = 9.dp, vertical = 4.dp),
            ) {
                Text(
                    text = when {
                        subject.eligibleTotal == 0 -> "Ready"
                        isCritical -> "Need ${subject.classesNeeded}"
                        else -> "+${subject.safeToBunk} Safe"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = stopA,
                )
            }
            Icon(
                imageVector = Icons.Rounded.ChevronRight,
                contentDescription = "Details",
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                modifier = Modifier.size(18.dp),
            )
        }
    }
}
