package com.semester.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.theme.SemesterColors
import uniffi.semester_core.AttendanceStatus
import uniffi.semester_core.Subject
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Semester's signature Collapsible Horizontal Subjects Shelf, upgraded with
 * OpenTune's Liquid Glass material, pressable spring sink, and live animated
 * liquid wave fills inside every card & collapsed pill.
 */
@Composable
fun CollapsibleHorizontalSubjectsShelf(
    subjects: List<Subject>,
    collapsed: Boolean,
    onToggleCollapse: () -> Unit,
    selectedSubjectId: String?,
    onSelectSubject: (Subject) -> Unit,
    repo: CoreRepository,
    haptics: HapticCrownEngine,
    onQuickMark: (Subject, AttendanceStatus) -> Unit,
    modifier: Modifier = Modifier,
) {
    val chevronRotation by animateFloatAsState(
        targetValue = if (collapsed) 0f else 180f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 420f),
        label = "collapseChevron",
    )

    // Single shared wave clock for all visible horizontal liquid cards (battery-friendly)
    val infinite = rememberInfiniteTransition(label = "shelfLiquidClock")
    val wavePhase by infinite.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 3200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shelfWavePhase",
    )

    Column(modifier = modifier.fillMaxWidth()) {
        SemesterSectionHeader(
            title = "Liquid Courses",
            subtitle = if (collapsed) "Compact strip • Tap to expand" else "Live fluid attendance cards",
            modifier = Modifier.padding(horizontal = 20.dp),
            action = {
                Row(
                    modifier = Modifier
                        .pressable(
                            onClick = {
                                haptics.crownTick()
                                onToggleCollapse()
                            },
                            pressedScale = 0.92f,
                        )
                        .liquidGlass(
                            shape = CircleShape,
                            tint = Color(0xFF17171B).copy(alpha = 0.85f),
                            elevation = 6.dp,
                            touchResponse = false,
                        )
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (collapsed) "Expand" else "Collapse",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.width(4.dp))
                    Icon(
                        imageVector = Icons.Rounded.KeyboardArrowDown,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .size(18.dp)
                            .graphicsLayer { rotationZ = chevronRotation },
                    )
                }
            },
        )

        AnimatedContent(
            targetState = collapsed,
            transitionSpec = {
                (fadeIn(tween(220)) togetherWith fadeOut(tween(150)))
                    .using(SizeTransform(clip = false) { _, _ -> spring(dampingRatio = 0.82f, stiffness = 340f) })
            },
            label = "horizontalSubjectsCollapse",
        ) { isCollapsed ->
            if (isCollapsed) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(subjects, key = { "pill_${it.id}" }) { subject ->
                        val pct = repo.calculatePercentage(subject.attended, subject.total)
                        CompactLiquidSubjectPill(
                            subject = subject,
                            percentage = pct,
                            isSelected = subject.id == selectedSubjectId,
                            wavePhase = wavePhase,
                            onClick = {
                                haptics.crownTick()
                                onSelectSubject(subject)
                            },
                        )
                    }
                }
            } else {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(subjects, key = { "card_${it.id}" }) { subject ->
                        val pct = repo.calculatePercentage(subject.attended, subject.total)
                        val bunkGuard = repo.calculateBunkGuard(subject.attended, subject.total, subject.target)
                        ExpandedLiquidSubjectCard(
                            subject = subject,
                            percentage = pct,
                            statusMessage = bunkGuard.statusMessage,
                            canBunk = bunkGuard.canBunk,
                            isSelected = subject.id == selectedSubjectId,
                            wavePhase = wavePhase,
                            onClick = {
                                haptics.crownTick()
                                onSelectSubject(subject)
                            },
                            onMark = { status -> onQuickMark(subject, status) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CompactLiquidSubjectPill(
    subject: Subject,
    percentage: Double,
    isSelected: Boolean,
    wavePhase: Float,
    onClick: () -> Unit,
) {
    val healthColor by animateColorAsState(
        targetValue = SemesterColors.healthColor(percentage, subject.target.toDouble()),
        animationSpec = tween(450),
        label = "pillHealthColor",
    )
    val animatedFill by animateFloatAsState(
        targetValue = (percentage / 100.0).toFloat().coerceIn(0f, 1f),
        animationSpec = spring(dampingRatio = 0.78f, stiffness = 200f),
        label = "pillFill",
    )
    val shape = RoundedCornerShape(18.dp)

    Box(
        modifier = Modifier
            .height(48.dp)
            .pressable(onClick = onClick, pressedScale = 0.94f)
            .liquidGlass(
                shape = shape,
                tint = Color(0xFF141418).copy(alpha = 0.88f),
                accentTint = if (isSelected) healthColor else null,
                elevation = if (isSelected) 12.dp else 4.dp,
                touchResponse = true,
                swell = false,
            )
            .then(
                if (isSelected) Modifier.border(1.2.dp, healthColor.copy(alpha = 0.75f), shape)
                else Modifier,
            ),
    ) {
        // Subtle animated liquid fill along the bottom of the pill
        Canvas(modifier = Modifier.matchParentSize()) {
            val fillWidth = size.width * animatedFill
            val h = size.height
            val baseY = h * 0.76f
            val path = Path().apply {
                moveTo(0f, h)
                lineTo(0f, baseY)
                var x = 0f
                while (x <= fillWidth + 8f) {
                    val clampedX = x.coerceAtMost(fillWidth)
                    val y = baseY + sin(wavePhase + clampedX * 0.045f) * 3.5f
                    lineTo(clampedX, y)
                    x += 8f
                }
                lineTo(fillWidth, h)
                close()
            }
            drawPath(
                path = path,
                brush = Brush.horizontalGradient(
                    colors = listOf(healthColor.copy(alpha = 0.34f), healthColor.copy(alpha = 0.16f)),
                    endX = fillWidth.coerceAtLeast(1f),
                ),
            )
        }

        Row(
            modifier = Modifier
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(healthColor),
            )
            Text(
                text = subject.code.ifBlank { subject.name.take(10) },
                style = MaterialTheme.typography.labelLarge,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${percentage.roundToInt()}%",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.ExtraBold,
                color = healthColor,
            )
        }
    }
}

@Composable
private fun ExpandedLiquidSubjectCard(
    subject: Subject,
    percentage: Double,
    statusMessage: String,
    canBunk: Boolean,
    isSelected: Boolean,
    wavePhase: Float,
    onClick: () -> Unit,
    onMark: (AttendanceStatus) -> Unit,
) {
    val healthColor by animateColorAsState(
        targetValue = SemesterColors.healthColor(percentage, subject.target.toDouble()),
        animationSpec = tween(500),
        label = "cardHealthColor",
    )
    val animatedFill by animateFloatAsState(
        targetValue = (percentage / 100.0).toFloat().coerceIn(0.06f, 1f),
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 180f),
        label = "cardLiquidFill",
    )
    val shape = RoundedCornerShape(24.dp)

    Box(
        modifier = Modifier
            .width(184.dp)
            .height(198.dp)
            .pressable(onClick = onClick, pressedScale = 0.96f)
            .liquidGlass(
                shape = shape,
                tint = Color(0xFF131317).copy(alpha = 0.90f),
                accentTint = healthColor,
                elevation = if (isSelected) 18.dp else 10.dp,
                touchResponse = true,
                swell = true,
            )
            .then(
                if (isSelected) Modifier.border(1.4.dp, healthColor.copy(alpha = 0.7f), shape)
                else Modifier,
            ),
    ) {
        // Live animated liquid wave rising inside the subject card
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            // Keep liquid visually between 25% and 82% of card height so text stays super readable
            val waterY = h * (1f - (0.18f + animatedFill * 0.56f))
            val path = Path().apply {
                moveTo(0f, h)
                lineTo(0f, waterY)
                var x = 0f
                while (x <= w + 12f) {
                    val y = waterY + sin(wavePhase + (x / w) * 4.4f) * 6.5f
                    lineTo(x, y)
                    x += 12f
                }
                lineTo(w, h)
                close()
            }
            drawPath(
                path = path,
                brush = Brush.verticalGradient(
                    colors = listOf(
                        healthColor.copy(alpha = 0.28f),
                        healthColor.copy(alpha = 0.08f),
                    ),
                    startY = waterY - 12f,
                    endY = h,
                ),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = subject.code.ifBlank { "COURSE" },
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.65f),
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.White.copy(alpha = 0.08f))
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                )
                Text(
                    text = "${percentage.roundToInt()}%",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = healthColor,
                    letterSpacing = (-0.5).sp,
                )
            }

            Column {
                Text(
                    text = subject.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = statusMessage,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (canBunk) SemesterColors.SafeEmeraldSoft else SemesterColors.CriticalCrimsonSoft,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "${subject.attended}/${subject.total}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White.copy(alpha = 0.72f),
                )

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .pressable(onClick = { onMark(AttendanceStatus.PRESENT) }, pressedScale = 0.88f)
                            .clip(CircleShape)
                            .background(SemesterColors.SafeEmeraldContainer.copy(alpha = 0.9f))
                            .border(1.dp, SemesterColors.SafeEmerald.copy(alpha = 0.55f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = "Mark Present",
                            tint = SemesterColors.SafeEmeraldSoft,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .pressable(onClick = { onMark(AttendanceStatus.ABSENT) }, pressedScale = 0.88f)
                            .clip(CircleShape)
                            .background(SemesterColors.CriticalCrimsonContainer.copy(alpha = 0.9f))
                            .border(1.dp, SemesterColors.CriticalCrimson.copy(alpha = 0.55f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = "Mark Absent",
                            tint = SemesterColors.CriticalCrimsonSoft,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}
