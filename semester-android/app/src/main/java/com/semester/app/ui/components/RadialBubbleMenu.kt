package com.semester.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Science
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

@Immutable
data class BubbleItem(
    val id: String,
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val color: Color,
)

/**
 * 5 spacious, zero-overlap quick-jump satellites for the Bubble Hold Haptic Wheel.
 * Single-tap on the Action Orb jumps straight to Attendance Calendar; hold & glide opens these 5 destinations.
 */
val DEFAULT_BUBBLE_ITEMS = listOf(
    BubbleItem("notes", "Notes & Exams", "Checklists & exam dates", Icons.Rounded.Checklist, SemesterColors.WarningAmber),
    BubbleItem("practicals", "Practicals", "Lab files & hardcopy tracker", Icons.Rounded.Science, SemesterColors.BrandCyan),
    BubbleItem("courses", "Courses", "Online courses & progress", Icons.AutoMirrored.Rounded.MenuBook, SemesterColors.SafeEmerald),
    BubbleItem("ai", "AI Helper", "Instant academic assistant", Icons.Rounded.Forum, SemesterColors.BrandVioletSoft),
    BubbleItem("settings", "Settings", "Profile, cloud sync & theme", Icons.Rounded.Settings, SemesterColors.CriticalCrimsonSoft),
)

@Stable
class BubbleMenuController(
    val items: List<BubbleItem> = DEFAULT_BUBBLE_ITEMS,
) {
    var active by mutableStateOf(false)
    var orbCenterInRoot by mutableStateOf(Offset.Zero)
    var dragDelta by mutableStateOf(Offset.Zero)
    var focusedIndex by mutableStateOf<Int?>(null)
    var orbPressed by mutableStateOf(false)
}

@Composable
fun rememberBubbleMenuController(): BubbleMenuController = remember { BubbleMenuController() }

/**
 * Companion Liquid Glass Action Orb beside the OpenTune dynamic bottom bar:
 * - Single Tap: Quickly opens Notes & Checklists
 * - Press & Hold (145ms) OR Drag: Fans out the 5-bubble Haptic Hold Wheel with magnetic detents
 */
@Composable
fun BubbleHoldActionOrb(
    controller: BubbleMenuController,
    haptics: HapticCrownEngine,
    quickIcon: ImageVector = Icons.Rounded.CalendarMonth,
    quickLabel: String = "Attendance Calendar",
    onQuickTap: () -> Unit,
    onItemSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isDark = LocalIsDarkTheme.current
    val currentQuickTap by rememberUpdatedState(onQuickTap)
    val currentOnItemSelected by rememberUpdatedState(onItemSelected)
    val density = LocalDensity.current

    var lastTickAngle by remember { mutableFloatStateOf(0f) }

    val orbScale by animateFloatAsState(
        targetValue = when {
            controller.active -> 1.12f
            controller.orbPressed -> 0.91f
            else -> 1f
        },
        animationSpec = spring(dampingRatio = 0.62f, stiffness = 560f),
        label = "orbScale",
    )

    val orbBg = remember(isDark) {
        if (isDark) Color(0xEE141722) else Color(0xF6FFFFFF)
    }

    Box(
        modifier = modifier
            .onGloballyPositioned { coords ->
                val pos = coords.positionInRoot()
                controller.orbCenterInRoot = Offset(
                    pos.x + coords.size.width / 2f,
                    pos.y + coords.size.height / 2f,
                )
            }
            .graphicsLayer {
                scaleX = orbScale
                scaleY = orbScale
            }
            .shadow(
                elevation = if (controller.active) 18.dp else 10.dp,
                shape = CircleShape,
                ambientColor = SemesterColors.BrandIndigo.copy(alpha = if (controller.active) 0.65f else 0.30f),
                spotColor = SemesterColors.BrandCyan.copy(alpha = if (controller.active) 0.55f else 0.24f),
            )
            .clip(CircleShape)
            .then(
                if (controller.active) Modifier.background(SemesterGradients.brandButton)
                else Modifier.background(orbBg),
            )
            .border(
                width = if (controller.active) 1.5.dp else 1.2.dp,
                brush = SemesterGradients.brandButton,
                shape = CircleShape,
            )
            .pointerInput(controller) {
                val dragTriggerPx = with(density) { 14.dp.toPx() }
                val deadzonePx = with(density) { 32.dp.toPx() }
                val itemCount = controller.items.size

                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    controller.orbPressed = true
                    controller.dragDelta = Offset.Zero
                    controller.focusedIndex = null
                    var lastPos = down.position

                    try {
                        val enteredHold = withTimeoutOrNull(145L) {
                            while (true) {
                                val event = awaitPointerEvent()
                                val ch = event.changes.firstOrNull { it.id == down.id }
                                if (ch == null || !ch.pressed) {
                                    return@withTimeoutOrNull false
                                }
                                lastPos = ch.position
                                val d = lastPos - down.position
                                if (hypot(d.x, d.y) >= dragTriggerPx) {
                                    ch.consume()
                                    return@withTimeoutOrNull true
                                }
                            }
                            @Suppress("UNREACHABLE_CODE")
                            false
                        } ?: true

                        if (!enteredHold) {
                            // Crisp single tap -> quickly open Notes!
                            haptics.focusSnap()
                            currentQuickTap()
                        } else {
                            // Engaged Bubble Hold Haptic Wheel
                            controller.active = true
                            haptics.focusSnap()
                            lastTickAngle = -130f

                            while (true) {
                                val event = awaitPointerEvent()
                                val ch = event.changes.firstOrNull { it.id == down.id } ?: break
                                val delta = ch.position - down.position
                                controller.dragDelta = delta

                                val dist = hypot(delta.x, delta.y)
                                val angleDeg = (atan2(delta.y, delta.x) * 180.0 / PI).toFloat()

                                if (dist >= deadzonePx) {
                                    if (abs(angleDeg - lastTickAngle) >= 10f) {
                                        haptics.crownTick()
                                        lastTickAngle = angleDeg
                                    }
                                    val clamped = when {
                                        angleDeg in -180f..-60f -> angleDeg.coerceIn(-174f, -86f)
                                        angleDeg > 140f -> -174f
                                        else -> -86f
                                    }
                                    val norm = ((clamped + 174f) / 88f).coerceIn(0f, 0.999f)
                                    val sector = (norm * itemCount).toInt().coerceIn(0, itemCount - 1)
                                    if (sector != controller.focusedIndex) {
                                        controller.focusedIndex = sector
                                        haptics.focusSnap()
                                    }
                                } else {
                                    controller.focusedIndex = null
                                }

                                if (!ch.pressed) {
                                    ch.consume()
                                    val picked = controller.focusedIndex
                                    if (picked != null && picked in controller.items.indices) {
                                        haptics.selectionConfirm()
                                        currentOnItemSelected(controller.items[picked].id)
                                    } else {
                                        haptics.softDismiss()
                                    }
                                    break
                                } else {
                                    ch.consume()
                                }
                            }
                        }
                    } finally {
                        controller.active = false
                        controller.orbPressed = false
                        controller.focusedIndex = null
                        controller.dragDelta = Offset.Zero
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = if (controller.active) Icons.Rounded.Close else quickIcon,
                contentDescription = "$quickLabel (Hold for Quick Wheel)",
                tint = if (controller.active) Color.White else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(23.dp),
            )
            if (!controller.active) {
                Box(
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .size(width = 14.dp, height = 2.5.dp)
                        .clip(CircleShape)
                        .background(SemesterGradients.brandButton),
                )
            }
        }
    }
}

/**
 * Unclipped full-screen Bubble Hold Wheel overlay:
 * - Spacious 172dp arc with 5 zero-overlap 50dp Liquid Glass Bubbles
 * - Magnetic glowing radial tether beam
 * - Thumb-clear floating HUD pill well above the arc
 */
@Composable
fun BubbleHoldOverlay(
    controller: BubbleMenuController,
    modifier: Modifier = Modifier,
) {
    val isDark = LocalIsDarkTheme.current
    val density = LocalDensity.current
    val radiusPx = with(density) { 172.dp.toPx() }
    val bubbleSizeDp = 50.dp
    val bubbleHalfPx = with(density) { (bubbleSizeDp / 2).toPx() }

    val expandProgress by animateFloatAsState(
        targetValue = if (controller.active) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.70f, stiffness = 480f),
        label = "bubbleExpand",
    )

    AnimatedVisibility(
        visible = controller.active || expandProgress > 0.02f,
        enter = fadeIn(tween(100)),
        exit = fadeOut(tween(120)),
        modifier = modifier.fillMaxSize(),
    ) {
        val origin = controller.orbCenterInRoot
        val focusedIdx = controller.focusedIndex
        val focusedItem = focusedIdx?.let { controller.items.getOrNull(it) }

        Box(modifier = Modifier.fillMaxSize()) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawRect(
                    color = if (isDark) Color(0xFF05060A).copy(alpha = 0.66f * expandProgress)
                    else Color(0xFF0F1226).copy(alpha = 0.40f * expandProgress),
                )

                if (origin != Offset.Zero && expandProgress > 0.05f) {
                    val thumbEnd = if (focusedIdx != null) {
                        val frac = focusedIdx.toFloat() / (controller.items.size - 1).coerceAtLeast(1)
                        val rad = Math.toRadians(-174.0 + frac * 88.0)
                        Offset(
                            origin.x + (cos(rad) * radiusPx * expandProgress).toFloat(),
                            origin.y + (sin(rad) * radiusPx * expandProgress).toFloat(),
                        )
                    } else {
                        val clampedLen = hypot(controller.dragDelta.x, controller.dragDelta.y).coerceAtMost(radiusPx * 0.8f)
                        val ang = atan2(controller.dragDelta.y, controller.dragDelta.x)
                        Offset(
                            origin.x + cos(ang) * clampedLen,
                            origin.y + sin(ang) * clampedLen,
                        )
                    }

                    val beamColor = focusedItem?.color ?: SemesterColors.BrandCyanSoft
                    if (hypot(thumbEnd.x - origin.x, thumbEnd.y - origin.y) > 12f) {
                        drawLine(
                            brush = Brush.linearGradient(
                                colors = listOf(SemesterColors.BrandCobalt.copy(alpha = 0.25f), beamColor.copy(alpha = 0.85f)),
                                start = origin,
                                end = thumbEnd,
                            ),
                            start = origin,
                            end = thumbEnd,
                            strokeWidth = if (focusedItem != null) 3.5.dp.toPx() else 2.dp.toPx(),
                            cap = StrokeCap.Round,
                        )
                    }
                }
            }

            // Thumb-clear Floating HUD Pill cleanly above the arc
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(bottom = 290.dp),
            ) {
                Row(
                    modifier = Modifier
                        .graphicsLayer {
                            alpha = expandProgress
                            val s = 0.92f + 0.08f * expandProgress
                            scaleX = s
                            scaleY = s
                        }
                        .clip(CircleShape)
                        .background(if (isDark) Color(0xF2161A26) else Color(0xF8FFFFFF))
                        .border(
                            width = 1.2.dp,
                            color = (focusedItem?.color ?: SemesterColors.BrandCobalt).copy(alpha = 0.55f),
                            shape = CircleShape,
                        )
                        .padding(horizontal = 18.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (focusedItem != null) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(focusedItem.color.copy(alpha = 0.20f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = focusedItem.icon,
                                contentDescription = null,
                                tint = focusedItem.color,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                        Column {
                            Text(
                                text = focusedItem.title,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = focusedItem.subtitle,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        Text(
                            text = "Glide thumb to choose • Release to open",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            letterSpacing = 0.2.sp,
                        )
                    }
                }
            }

            // 5 Zero-Overlap Liquid Glass Bubbles (focused pops cleanly on top)
            if (origin != Offset.Zero) {
                val drawOrder = controller.items.indices.sortedBy { if (it == focusedIdx) 1 else 0 }
                drawOrder.forEach { index ->
                    val item = controller.items[index]
                    val frac = index.toFloat() / (controller.items.size - 1).coerceAtLeast(1)
                    val angleRad = Math.toRadians(-174.0 + frac * 88.0)
                    val isFocused = focusedIdx == index

                    val itemScale by animateFloatAsState(
                        targetValue = if (isFocused) 1.25f else 1f,
                        animationSpec = spring(dampingRatio = 0.58f, stiffness = 560f),
                        label = "bubbleFocus_$index",
                    )

                    val bx = origin.x + (cos(angleRad) * radiusPx * expandProgress).toFloat() - bubbleHalfPx
                    val by = origin.y + (sin(angleRad) * radiusPx * expandProgress).toFloat() - bubbleHalfPx

                    Box(
                        modifier = Modifier
                            .graphicsLayer {
                                translationX = bx
                                translationY = by
                                val s = (0.45f + 0.55f * expandProgress) * itemScale
                                scaleX = s
                                scaleY = s
                                alpha = expandProgress
                            }
                            .size(bubbleSizeDp)
                            .shadow(
                                elevation = if (isFocused) 16.dp else 6.dp,
                                shape = CircleShape,
                                ambientColor = item.color.copy(alpha = 0.55f),
                                spotColor = item.color.copy(alpha = 0.65f),
                            )
                            .clip(CircleShape)
                            .background(
                                if (isFocused) item.color
                                else if (isDark) Color(0xF2171B26) else Color(0xF8FFFFFF),
                            )
                            .border(
                                width = if (isFocused) 1.8.dp else 1.2.dp,
                                color = if (isFocused) Color.White.copy(alpha = 0.85f) else item.color.copy(alpha = 0.55f),
                                shape = CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = item.icon,
                            contentDescription = item.title,
                            tint = if (isFocused) Color.White else item.color,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }
        }
    }
}
