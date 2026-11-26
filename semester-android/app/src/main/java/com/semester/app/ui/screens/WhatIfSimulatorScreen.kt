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
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.LiquidFillGauge
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.SemesterSectionHeader
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.pressable
import com.semester.app.ui.theme.SemesterColors
import uniffi.semester_core.Subject
import kotlin.math.roundToInt

@Composable
fun WhatIfSimulatorScreen(
    subjects: List<Subject>,
    repo: CoreRepository,
    haptics: HapticCrownEngine,
) {
    val chromeScroll = LocalChromeScroll.current
    var selectedSubject by remember(subjects) { mutableStateOf(subjects.firstOrNull()) }
    var futureClasses by remember { mutableFloatStateOf(10f) }
    var willAttend by remember { mutableFloatStateOf(8f) }
    var lastStep by remember { mutableIntStateOf(8) }

    val currentSubject = selectedSubject ?: subjects.firstOrNull()
    val projectedPct = if (currentSubject != null) {
        repo.simulateFutureAttendance(
            currentSubject.attended,
            currentSubject.total,
            futureClasses.toUInt(),
            willAttend.toUInt(),
        )
    } else {
        0.0
    }

    val statusColor by animateColorAsState(
        targetValue = if (currentSubject != null) {
            SemesterColors.healthColor(projectedPct, currentSubject.target.toDouble())
        } else {
            SemesterColors.ElectricViolet
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
            peakAlpha = 0.24f,
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
                Text(
                    text = "PREDICTIVE SANDBOX",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    letterSpacing = 1.2.sp,
                )
                Text(
                    text = "What-If Simulator",
                    style = MaterialTheme.typography.displaySmall,
                    color = Color.White,
                )
                Text(
                    text = "Forecast attendance trajectories before taking leaves.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(16.dp))

            if (currentSubject != null) {
                // Horizontal Liquid Course Selector
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(subjects, key = { it.id }) { sub ->
                        val active = sub.id == currentSubject.id
                        Box(
                            modifier = Modifier
                                .pressable(
                                    onClick = {
                                        haptics.crownTick()
                                        selectedSubject = sub
                                    },
                                    pressedScale = 0.94f,
                                )
                                .clip(CircleShape)
                                .background(
                                    if (active) statusColor.copy(alpha = 0.22f) else Color(0xFF16161A),
                                )
                                .border(
                                    width = 1.dp,
                                    color = if (active) statusColor.copy(alpha = 0.7f) else Color.White.copy(alpha = 0.08f),
                                    shape = CircleShape,
                                )
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            Text(
                                text = sub.code.ifBlank { sub.name.take(12) },
                                style = MaterialTheme.typography.labelLarge,
                                color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(18.dp))

                val currentPct = repo.calculatePercentage(currentSubject.attended, currentSubject.total)
                val delta = projectedPct - currentPct
                val deltaText = if (delta >= 0) "+${String.format("%.1f", delta)}%" else "${String.format("%.1f", delta)}%"

                // Liquid Glass Projection Hero Card
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .liquidGlass(
                            shape = RoundedCornerShape(28.dp),
                            tint = Color(0xFF141418).copy(alpha = 0.88f),
                            accentTint = statusColor,
                            elevation = 16.dp,
                            touchResponse = true,
                            swell = false,
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
                            color = Color.White,
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
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Surface(
                                color = Color.White.copy(alpha = 0.08f),
                                shape = CircleShape,
                            ) {
                                Text(
                                    text = "Now ${currentPct.roundToInt()}%",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                            Surface(
                                color = statusColor.copy(alpha = 0.16f),
                                shape = CircleShape,
                            ) {
                                Text(
                                    text = "Net $deltaText",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = statusColor,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(18.dp))

                // Sliders inside a Liquid Glass Control Panel
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .liquidGlass(
                            shape = RoundedCornerShape(24.dp),
                            tint = Color(0xFF141418).copy(alpha = 0.88f),
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
                            color = Color.White,
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
                                thumbColor = Color.White,
                                activeTrackColor = SemesterColors.ElectricViolet,
                                inactiveTrackColor = Color.White.copy(alpha = 0.12f),
                            ),
                        )

                        Spacer(Modifier.height(12.dp))

                        Text(
                            text = "Will Attend: ${willAttend.toInt()}  •  Bunking: ${(futureClasses - willAttend).toInt()}",
                            style = MaterialTheme.typography.titleSmall,
                            color = Color.White,
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
                                inactiveTrackColor = Color.White.copy(alpha = 0.12f),
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
