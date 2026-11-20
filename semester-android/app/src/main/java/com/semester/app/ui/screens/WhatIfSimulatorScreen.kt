package com.semester.app.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import uniffi.semester_core.Subject
import kotlin.math.roundToInt

@Composable
fun WhatIfSimulatorScreen(
    subjects: List<Subject>,
    repo: CoreRepository,
    haptics: HapticCrownEngine
) {
    var selectedSubject by remember { mutableStateOf(subjects.firstOrNull()) }
    var futureClasses by remember { mutableFloatStateOf(10f) }
    var willAttend by remember { mutableFloatStateOf(8f) }
    var lastStep by remember { mutableIntStateOf(8) }

    val currentSubject = selectedSubject ?: subjects.firstOrNull()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF09090B))
            .padding(20.dp)
    ) {
        Text(
            text = "🔮 What-If Attendance Simulator",
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )
        Text(
            text = "Simulate future classes before taking college leaves or trips.",
            fontSize = 13.sp,
            color = Color(0xFFA1A1AA)
        )

        Spacer(modifier = Modifier.height(20.dp))

        if (currentSubject != null) {
            val currentPct = repo.calculatePercentage(currentSubject.attended, currentSubject.total)
            val projectedPct = repo.simulateFutureAttendance(
                currentSubject.attended,
                currentSubject.total,
                futureClasses.toUInt(),
                willAttend.toUInt()
            )

            val statusColor by animateColorAsState(
                targetValue = when {
                    projectedPct >= 75.0 -> Color(0xFF10B981) // Emerald Safe
                    projectedPct >= 65.0 -> Color(0xFFF59E0B) // Amber Warning
                    else -> Color(0xFFEF4444)                 // Crimson Critical
                },
                label = "StatusColor"
            )

            // Projection Card
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B)),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, statusColor.copy(alpha = 0.4f), RoundedCornerShape(20.dp))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = currentSubject.name,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color.White
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = "${currentPct.roundToInt()}%",
                            fontSize = 24.sp,
                            color = Color(0xFFA1A1AA)
                        )
                        Text(
                            text = "  ➔  ",
                            fontSize = 22.sp,
                            color = Color.White
                        )
                        Text(
                            text = String.format("%.1f%%", projectedPct),
                            fontSize = 38.sp,
                            fontWeight = FontWeight.Black,
                            color = statusColor
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    val delta = projectedPct - currentPct
                    val deltaText = if (delta >= 0) "+${String.format("%.1f", delta)}%" else "${String.format("%.1f", delta)}%"
                    Text(
                        text = "Net Trajectory: $deltaText",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = statusColor
                    )
                }
            }

            Spacer(modifier = Modifier.height(28.dp))

            // Slider 1: Total Upcoming Classes
            Text(
                text = "Total Upcoming Classes: ${futureClasses.toInt()}",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
            Slider(
                value = futureClasses,
                onValueChange = {
                    futureClasses = it
                    if (willAttend > it) willAttend = it
                },
                valueRange = 1f..30f,
                steps = 28,
                colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color(0xFF8B5CF6))
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Slider 2: Classes You Will Attend
            Text(
                text = "Classes You Will Attend: ${willAttend.toInt()}  (Bunking: ${(futureClasses - willAttend).toInt()})",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
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
                steps = futureClasses.toInt() - 1,
                colors = SliderDefaults.colors(thumbColor = statusColor, activeTrackColor = statusColor)
            )
        } else {
            Text("No subjects found. Please add subjects to start simulation.", color = Color.Gray)
        }
    }
}
