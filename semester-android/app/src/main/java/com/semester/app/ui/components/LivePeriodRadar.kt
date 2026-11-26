package com.semester.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.semester.app.ui.theme.SemesterColors
import uniffi.semester_core.AttendanceStatus
import uniffi.semester_core.TimetableSlot

enum class PeriodState {
    PAST, ACTIVE, UPCOMING
}

/**
 * Upgraded OpenTune-styled Liquid Glass LivePeriodRadarCard with pulsing
 * radar beacon, Outfit typography, and tactile haptic 1-tap attendance controls.
 */
@Composable
fun LivePeriodRadarCard(
    slot: TimetableSlot,
    state: PeriodState,
    remainingMinutes: Int?,
    haptics: HapticCrownEngine,
    onMark: (AttendanceStatus) -> Unit,
    modifier: Modifier = Modifier,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "RadarBeacon")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 2.6f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "PulseScale",
    )
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.72f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "PulseAlpha",
    )

    val cardAlpha = if (state == PeriodState.PAST) 0.55f else 1f
    val accentColor = when (state) {
        PeriodState.ACTIVE -> SemesterColors.SafeEmerald
        PeriodState.UPCOMING -> SemesterColors.ElectricBlue
        PeriodState.PAST -> SemesterColors.TextMuted
    }
    val shape = RoundedCornerShape(22.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .alpha(cardAlpha)
            .liquidGlass(
                shape = shape,
                tint = Color(0xFF141418).copy(alpha = 0.88f),
                accentTint = if (state == PeriodState.ACTIVE) accentColor else null,
                elevation = if (state == PeriodState.ACTIVE) 16.dp else 6.dp,
                touchResponse = state != PeriodState.PAST,
                swell = false,
            )
            .then(
                if (state == PeriodState.ACTIVE) {
                    Modifier.border(1.4.dp, accentColor.copy(alpha = 0.65f), shape)
                } else {
                    Modifier
                },
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Pulsing Beacon Dot
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(26.dp)) {
                    if (state == PeriodState.ACTIVE) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .scale(pulseScale)
                                .alpha(pulseAlpha)
                                .clip(CircleShape)
                                .background(accentColor),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(accentColor),
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = slot.subjectName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                    Text(
                        text = "Period ${slot.periodNumber} • ${slot.startTime} – ${slot.endTime} • Room ${slot.room}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (state == PeriodState.ACTIVE && remainingMinutes != null) {
                    Surface(
                        color = SemesterColors.SafeEmerald.copy(alpha = 0.16f),
                        shape = CircleShape,
                    ) {
                        Text(
                            text = "${remainingMinutes}m left",
                            style = MaterialTheme.typography.labelSmall,
                            color = SemesterColors.SafeEmeraldSoft,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        )
                    }
                }
            }

            if (state == PeriodState.ACTIVE || state == PeriodState.UPCOMING) {
                Spacer(modifier = Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    FilledTonalButton(
                        onClick = {
                            haptics.attendanceSuccess()
                            onMark(AttendanceStatus.PRESENT)
                        },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = SemesterColors.SafeEmeraldContainer,
                            contentColor = SemesterColors.SafeEmeraldSoft,
                        ),
                        shape = RoundedCornerShape(14.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                    ) {
                        Icon(Icons.Rounded.Check, contentDescription = null, modifier = Modifier.size(16.dp))
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
                            containerColor = SemesterColors.CriticalCrimsonContainer,
                            contentColor = SemesterColors.CriticalCrimsonSoft,
                        ),
                        shape = RoundedCornerShape(14.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                    ) {
                        Icon(Icons.Rounded.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Skip", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
