package com.semester.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.haptics.HapticCrownEngine
import uniffi.semester_core.AttendanceStatus
import uniffi.semester_core.TimetableSlot

enum class PeriodState {
    PAST, ACTIVE, UPCOMING
}

@Composable
fun LivePeriodRadarCard(
    slot: TimetableSlot,
    state: PeriodState,
    remainingMinutes: Int?,
    haptics: HapticCrownEngine,
    onMark: (AttendanceStatus) -> Unit
) {
    // Beacon Pulse Animation for Active Class
    val infiniteTransition = rememberInfiniteTransition(label = "RadarBeacon")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 2.4f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "PulseScale"
    )
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.7f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "PulseAlpha"
    )

    val cardAlpha = if (state == PeriodState.PAST) 0.5f else 1f
    val borderColor = if (state == PeriodState.ACTIVE) Color(0xFF10B981) else Color(0xFF27272A)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .alpha(cardAlpha),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .border(
                    width = if (state == PeriodState.ACTIVE) 1.5.dp else 1.dp,
                    color = borderColor,
                    shape = RoundedCornerShape(16.dp)
                )
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Period Status Beacon Dot
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(24.dp)) {
                    if (state == PeriodState.ACTIVE) {
                        // Expanding Radar Ring
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .scale(pulseScale)
                                .alpha(pulseAlpha)
                                .clip(CircleShape)
                                .background(Color(0xFF10B981))
                        )
                    }
                    // Solid Core Dot
                    val dotColor = when (state) {
                        PeriodState.ACTIVE -> Color(0xFF10B981)
                        PeriodState.UPCOMING -> Color(0xFF3B82F6)
                        PeriodState.PAST -> Color(0xFF71717A)
                    }
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(dotColor)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = slot.subjectName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Color.White
                    )
                    Text(
                        text = "Period ${slot.periodNumber} • ${slot.startTime} - ${slot.endTime} • Room ${slot.room}",
                        fontSize = 12.sp,
                        color = Color(0xFFA1A1AA)
                    )
                }

                // Active Timer Chip
                if (state == PeriodState.ACTIVE && remainingMinutes != null) {
                    Surface(
                        color = Color(0x2010B981),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.padding(start = 8.dp)
                    ) {
                        Text(
                            text = "⏱️ ${remainingMinutes}m left",
                            color = Color(0xFF10B981),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            // Tactile 1-Tap Attendance Buttons
            if (state == PeriodState.ACTIVE || state == PeriodState.UPCOMING) {
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    FilledTonalButton(
                        onClick = {
                            haptics.attendanceSuccess()
                            onMark(AttendanceStatus.PRESENT)
                        },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Color(0xFF064E3B),
                            contentColor = Color(0xFF34D399)
                        ),
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Present", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    FilledTonalButton(
                        onClick = {
                            haptics.focusSnap()
                            onMark(AttendanceStatus.ABSENT)
                        },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Color(0xFF450A0A),
                            contentColor = Color(0xFFF87171)
                        ),
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Skip", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
