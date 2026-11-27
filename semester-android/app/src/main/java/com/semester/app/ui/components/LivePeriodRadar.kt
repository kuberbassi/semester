package com.semester.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
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
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.MedicalServices
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.TimetableDaySlot
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors

enum class PeriodState {
    PAST, ACTIVE, UPCOMING
}

/**
 * Desktop-matched Liquid Glass LivePeriodRadarCard with AM/PM schedule display,
 * Break/Free/Custom styling, pulsing active beacon, live marked status pill,
 * tap-to-edit slot support, and 1-tap Present / Skip / Medical buttons.
 */
@Composable
fun LivePeriodRadarCard(
    slot: TimetableDaySlot,
    state: PeriodState,
    remainingMinutes: Int?,
    haptics: HapticCrownEngine,
    onMark: (String) -> Unit,
    showMarkActions: Boolean = true,
    markedStatus: String? = null,
    onEdit: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val isDark = LocalIsDarkTheme.current
    val isNonClass = slot.isNonClass || slot.slotType.equals("custom", true)

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

    val cardAlpha = when {
        isNonClass && state != PeriodState.ACTIVE -> 0.78f
        state == PeriodState.PAST -> 0.68f
        else -> 1f
    }
    val accentColor = when {
        isNonClass -> MaterialTheme.colorScheme.onSurfaceVariant
        state == PeriodState.ACTIVE -> SemesterColors.SafeEmerald
        state == PeriodState.UPCOMING -> SemesterColors.BrandCobalt
        else -> SemesterColors.CriticalCrimson
    }
    val markedTint = when (markedStatus) {
        "present", "late", "duty" -> SemesterColors.SafeEmerald
        "absent" -> SemesterColors.CriticalCrimson
        "approved_medical", "medical" -> SemesterColors.ElectricBlue
        "substituted" -> SemesterColors.WarningAmber
        "cancelled", "canceled" -> Color(0xFF94A3B8)
        else -> null
    }
    val shape = RoundedCornerShape(22.dp)
    val displayTitle = when {
        slot.isNonClass -> slot.label.ifBlank {
            slot.slotType.replaceFirstChar { it.uppercase() }
        }
        slot.slotType.equals("custom", true) -> slot.label.ifBlank { slot.subjectName.ifBlank { "Custom Slot" } }
        else -> slot.subjectName.ifBlank { slot.label.ifBlank { "Scheduled Class" } }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
            .alpha(cardAlpha)
            .liquidGlass(
                shape = shape,
                accentTint = when {
                    state == PeriodState.ACTIVE && !isNonClass -> accentColor
                    markedTint != null -> markedTint
                    else -> null
                },
                elevation = if (state == PeriodState.ACTIVE && !isNonClass) 16.dp else 0.dp,
            )
            .then(
                if (state == PeriodState.ACTIVE && !isNonClass) {
                    Modifier.border(1.4.dp, accentColor.copy(alpha = 0.65f), shape)
                } else {
                    Modifier
                },
            )
            .then(
                if (onEdit != null) {
                    Modifier.clickable {
                        haptics.crownTick()
                        onEdit()
                    }
                } else {
                    Modifier
                },
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(15.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(24.dp)) {
                    if (state == PeriodState.ACTIVE && !isNonClass) {
                        Box(
                            modifier = Modifier
                                .size(11.dp)
                                .scale(pulseScale)
                                .alpha(pulseAlpha)
                                .clip(CircleShape)
                                .background(accentColor),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(9.dp)
                            .clip(CircleShape)
                            .background(accentColor),
                    )
                }

                Spacer(modifier = Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = displayTitle,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (isNonClass) {
                            Surface(
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f),
                                shape = CircleShape,
                            ) {
                                Text(
                                    text = slot.slotType.replaceFirstChar { it.uppercase() },
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                )
                            }
                        } else if (markedTint != null && !markedStatus.isNullOrBlank()) {
                            Surface(
                                color = markedTint.copy(alpha = 0.16f),
                                shape = CircleShape,
                            ) {
                                Text(
                                    text = markedStatus.replace("approved_", "").replaceFirstChar { it.uppercase() },
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                    color = markedTint,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                    Text(
                        text = buildString {
                            append("P${slot.periodNumber} • ${slot.startTime} – ${slot.endTime}")
                            if (slot.room.isNotBlank()) append(" • ${slot.room}")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                if (state == PeriodState.ACTIVE && remainingMinutes != null && !isNonClass) {
                    Surface(
                        color = SemesterColors.SafeEmerald.copy(alpha = 0.16f),
                        shape = CircleShape,
                    ) {
                        Text(
                            text = "${remainingMinutes}m left",
                            style = MaterialTheme.typography.labelSmall,
                            color = SemesterColors.SafeEmerald,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                        )
                    }
                } else if (onEdit != null) {
                    IconButton(
                        onClick = {
                            haptics.crownTick()
                            onEdit()
                        },
                        modifier = Modifier.size(30.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Edit,
                            contentDescription = "Edit Slot",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }

            if (showMarkActions && !isNonClass && slot.subjectId.isNotBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FilledTonalButton(
                        onClick = {
                            haptics.crownTick()
                            onMark("approved_medical")
                        },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = SemesterColors.ElectricBlue.copy(alpha = if (isDark) 0.18f else 0.12f),
                            contentColor = SemesterColors.ElectricBlue,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Icon(Icons.Rounded.MedicalServices, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Med", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }

                    FilledTonalButton(
                        onClick = {
                            haptics.attendanceSuccess()
                            onMark("present")
                        },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = SemesterColors.SafeEmerald.copy(alpha = if (isDark) 0.18f else 0.13f),
                            contentColor = SemesterColors.SafeEmerald,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Icon(Icons.Rounded.Check, contentDescription = null, modifier = Modifier.size(15.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Present", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }

                    FilledTonalButton(
                        onClick = {
                            haptics.focusSnap()
                            onMark("absent")
                        },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = SemesterColors.CriticalCrimson.copy(alpha = if (isDark) 0.18f else 0.12f),
                            contentColor = SemesterColors.CriticalCrimson,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Icon(Icons.Rounded.Close, contentDescription = null, modifier = Modifier.size(15.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Skip", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
