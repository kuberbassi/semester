package com.semester.app.ui.screens

import androidx.compose.animation.animateColorAsState
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.WorkspaceRepository
import com.semester.app.core.WorkspaceSubject
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.LiquidFillGauge
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.ScrollForwardHint
import com.semester.app.ui.components.SemesterPickerBadge
import com.semester.app.ui.components.SemesterSectionHeader
import com.semester.app.ui.components.StudioPillChip
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.liquidHeroBanner
import com.semester.app.ui.components.pressable
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun WhatIfSimulatorScreen(
    semester: Int = 1,
    subjects: List<WorkspaceSubject>,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onOpenSemesterPicker: () -> Unit = {},
) {
    val chromeScroll = LocalChromeScroll.current
    val isDark = LocalIsDarkTheme.current
    var selectedSubjectId by remember(subjects) { mutableStateOf(subjects.firstOrNull()?.id) }
    var futureClasses by remember { mutableFloatStateOf(10f) }
    var willAttend by remember { mutableFloatStateOf(8f) }
    var lastStep by remember { mutableIntStateOf(8) }

    val currentSubject = subjects.firstOrNull { it.id == selectedSubjectId } ?: subjects.firstOrNull()
    val projectedPct = if (currentSubject != null) {
        repo.simulateFutureAttendance(
            currentSubject.physicalAttended,
            currentSubject.eligibleTotal,
            futureClasses.toInt(),
            willAttend.toInt(),
        )
    } else {
        0.0
    }
    val projectedGuard = if (currentSubject != null) {
        repo.calculateMedicalBunkGuard(
            attended = currentSubject.attended + willAttend.toInt(),
            total = currentSubject.total + futureClasses.toInt(),
            medical = currentSubject.medicalCount,
            target = currentSubject.target,
        )
    } else {
        null
    }

    val statusColor by animateColorAsState(
        targetValue = if (currentSubject != null) {
            SemesterColors.healthColor(projectedPct, currentSubject.target.toDouble())
        } else {
            SemesterColors.BrandCobalt
        },
        animationSpec = tween(450),
        label = "WhatIfStatusColor",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        AmbientTopGlow(
            color = statusColor,
            peakAlpha = if (isDark) 0.24f else 0.13f,
            height = 310.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier)
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(top = 14.dp, bottom = 128.dp),
        ) {
            Column(modifier = Modifier.padding(horizontal = 20.dp)) {
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
                        text = "ATTENDANCE FORECAST",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 1.sp,
                    )
                }
                Text(
                    text = "What-If Simulator",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "Forecast medical-adjusted attendance before skipping classes.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(14.dp))

            if (currentSubject != null) {
                val subRailState = rememberLazyListState()
                val canScrollSubs by remember { derivedStateOf { subRailState.canScrollForward } }
                LazyRow(
                    state = subRailState,
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(subjects, key = { it.id }) { sub ->
                        StudioPillChip(
                            label = sub.code.ifBlank { sub.name.take(12) },
                            selected = sub.id == currentSubject.id,
                            onClick = {
                                haptics.crownTick()
                                selectedSubjectId = sub.id
                            },
                        )
                    }
                }
                ScrollForwardHint(visible = canScrollSubs)

                Spacer(Modifier.height(18.dp))

                val delta = projectedPct - currentSubject.percentage
                val deltaText = if (delta >= 0) "+${String.format(Locale.US, "%.1f", delta)}%" else "${String.format(Locale.US, "%.1f", delta)}%"

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .liquidHeroBanner(
                            shape = RoundedCornerShape(28.dp),
                            accentTint = statusColor,
                        )
                        .border(1.2.dp, statusColor.copy(alpha = 0.45f), RoundedCornerShape(28.dp))
                        .padding(20.dp),
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = currentSubject.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )

                        Spacer(Modifier.height(16.dp))

                        LiquidFillGauge(
                            percentage = projectedPct,
                            size = 152.dp,
                            targetThreshold = currentSubject.target.toDouble(),
                            sublabel = "PROJECTED",
                            haptics = haptics,
                        )

                        Spacer(Modifier.height(14.dp))

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                shape = CircleShape,
                            ) {
                                Text(
                                    text = "Now ${currentSubject.percentage.roundToInt()}%",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                            Surface(color = statusColor.copy(alpha = 0.16f), shape = CircleShape) {
                                Text(
                                    text = "Net $deltaText",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = statusColor,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                        }

                        if (projectedGuard != null) {
                            Spacer(Modifier.height(10.dp))
                            Text(
                                text = projectedGuard.statusMessage,
                                style = MaterialTheme.typography.labelLarge,
                                color = if (projectedGuard.canBunk) SemesterColors.SafeEmerald else SemesterColors.CriticalCrimson,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(18.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .liquidGlass(
                            shape = RoundedCornerShape(24.dp),
                            elevation = 8.dp,
                            touchResponse = false,
                        )
                        .padding(18.dp),
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        SemesterSectionHeader(
                            title = "Simulation Controls",
                            subtitle = "Haptic crown ticks on every step",
                            modifier = Modifier.padding(top = 0.dp),
                        )

                        Text(
                            text = "Upcoming Classes: ${futureClasses.toInt()}",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Slider(
                            value = futureClasses,
                            onValueChange = {
                                futureClasses = it
                                if (willAttend > it) willAttend = it
                            },
                            valueRange = 1f..30f,
                            steps = 28,
                            colors = SliderDefaults.colors(
                                thumbColor = SemesterColors.BrandCobalt,
                                activeTrackColor = SemesterColors.BrandCobalt,
                                inactiveTrackColor = MaterialTheme.colorScheme.outline,
                            ),
                        )

                        Spacer(Modifier.height(12.dp))

                        Text(
                            text = "Will Attend: ${willAttend.toInt()}  •  Skipping: ${(futureClasses - willAttend).toInt()}",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Slider(
                            value = willAttend,
                            onValueChange = {
                                val rounded = it.roundToInt()
                                if (rounded != lastStep) {
                                    haptics.crownTick()
                                    lastStep = rounded
                                }
                                willAttend = it
                            },
                            valueRange = 0f..futureClasses,
                            steps = (futureClasses.toInt() - 1).coerceAtLeast(0),
                            colors = SliderDefaults.colors(
                                thumbColor = statusColor,
                                activeTrackColor = statusColor,
                                inactiveTrackColor = MaterialTheme.colorScheme.outline,
                            ),
                        )
                    }
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .liquidGlass(shape = RoundedCornerShape(24.dp))
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Add subjects on the Dashboard to unlock What-If simulations.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
