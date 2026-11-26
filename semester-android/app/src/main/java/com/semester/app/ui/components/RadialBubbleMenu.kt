package com.semester.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoGraph
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.School
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.theme.SemesterColors
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

data class BubbleItem(
    val id: String,
    val title: String,
    val icon: ImageVector,
    val color: Color,
)

/**
 * Upgraded Liquid Glass Digital Crown Orb:
 * - Lives harmoniously beside the OpenTune-style stretching-lens dock (like SearchOrb)
 * - Tap for quick action (Add Subject)
 * - Press & drag upward/left to fan out the haptic radial satellite arc (7.2° rotary detents)
 */
@Composable
fun RadialBubbleMenu(
    haptics: HapticCrownEngine,
    onItemSelected: (String) -> Unit,
    onQuickTap: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var isDragging by remember { mutableStateOf(false) }
    var lastTickAngle by remember { mutableFloatStateOf(0f) }
    var selectedItemIndex by remember { mutableStateOf<Int?>(null) }

    val offsetX = remember { Animatable(0f) }
    val offsetY = remember { Animatable(0f) }

    val items = remember {
        listOf(
            BubbleItem("add", "Add Course", Icons.Rounded.Add, SemesterColors.SafeEmerald),
            BubbleItem("dashboard", "Home", Icons.Rounded.Dashboard, SemesterColors.ElectricBlue),
            BubbleItem("radar", "Radar", Icons.Rounded.Schedule, SemesterColors.ElectricViolet),
            BubbleItem("whatif", "What-If", Icons.Rounded.AutoGraph, SemesterColors.WarningAmber),
            BubbleItem("results", "Results", Icons.Rounded.School, SemesterColors.ElectricPink),
        )
    }

    val orbScale by animateFloatAsState(
        targetValue = if (isDragging) 1.12f else 1f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 420f),
        label = "crownOrbScale",
    )

    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        // Fan out Liquid Glass satellite bubbles along an upper-left quarter-arc
        // so they never clip off the right or bottom edge of the screen.
        items.forEachIndexed { index, item ->
            val fraction = index.toFloat() / (items.size - 1).coerceAtLeast(1)
            // Arc from -170 deg (left) to -90 deg (straight up)
            val angleRad = Math.toRadians((-175.0 + fraction * 90.0))
            val radiusDp = 128.dp
            val isFocused = selectedItemIndex == index

            val itemScale by animateFloatAsState(
                targetValue = if (isFocused) 1.24f else 1f,
                animationSpec = spring(dampingRatio = 0.5f, stiffness = 500f),
                label = "satScale_$index",
            )

            AnimatedVisibility(
                visible = isDragging,
                enter = fadeIn() + scaleIn(spring(dampingRatio = 0.6f, stiffness = 420f), initialScale = 0.4f),
                exit = fadeOut() + scaleOut(targetScale = 0.4f),
            ) {
                val itemX = (cos(angleRad) * radiusDp.value).dp
                val itemY = (sin(angleRad) * radiusDp.value).dp

                Column(
                    modifier = Modifier.offset(x = itemX, y = itemY),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        modifier = Modifier
                            .scale(itemScale)
                            .size(50.dp)
                            .liquidGlass(
                                shape = CircleShape,
                                tint = if (isFocused) item.color.copy(alpha = 0.85f) else Color(0xFF141418).copy(alpha = 0.88f),
                                accentTint = item.color,
                                elevation = if (isFocused) 18.dp else 10.dp,
                                touchResponse = false,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = item.icon,
                            contentDescription = item.title,
                            tint = Color.White,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    if (isFocused) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = item.title,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier
                                .background(Color.Black.copy(alpha = 0.72f), RoundedCornerShape(8.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
            }
        }

        // Main Liquid Glass Crown Orb
        val accent = MaterialTheme.colorScheme.primary
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), offsetY.value.roundToInt()) }
                .scale(orbScale)
                .size(CHROME_TAB_HEIGHT)
                .liquidGlass(
                    shape = CircleShape,
                    tint = Color(0xFF121216).copy(alpha = 0.85f),
                    accentTint = accent,
                    elevation = 20.dp,
                    touchResponse = true,
                    swell = false,
                )
                .clickable {
                    haptics.crownTick()
                    onQuickTap()
                }
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = {
                            isDragging = true
                            haptics.focusSnap()
                        },
                        onDragEnd = {
                            isDragging = false
                            selectedItemIndex?.let { idx ->
                                haptics.selectionConfirm()
                                onItemSelected(items[idx].id)
                            }
                            selectedItemIndex = null
                            scope.launch {
                                launch { offsetX.animateTo(0f, spring(dampingRatio = 0.65f, stiffness = 420f)) }
                                launch { offsetY.animateTo(0f, spring(dampingRatio = 0.65f, stiffness = 420f)) }
                            }
                        },
                        onDragCancel = {
                            isDragging = false
                            selectedItemIndex = null
                            scope.launch {
                                launch { offsetX.animateTo(0f, spring(dampingRatio = 0.65f, stiffness = 420f)) }
                                launch { offsetY.animateTo(0f, spring(dampingRatio = 0.65f, stiffness = 420f)) }
                            }
                        },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            val newX = (offsetX.value + dragAmount.x).coerceIn(-120f, 36f)
                            val newY = (offsetY.value + dragAmount.y).coerceIn(-140f, 36f)

                            // Digital Crown rotary detent every 7.2°
                            val currentAngle = (atan2(newY, newX) * 180.0 / PI).toFloat()
                            if (abs(currentAngle - lastTickAngle) >= 7.2f) {
                                haptics.crownTick()
                                lastTickAngle = currentAngle
                            }

                            val dist = sqrt(newX * newX + newY * newY)
                            if (dist > 34f) {
                                // Map drag angle in [-180°, -80°] onto the 5 satellites
                                val deg = currentAngle.coerceIn(-180f, -80f)
                                val norm = ((deg + 180f) / 100f).coerceIn(0f, 0.999f)
                                val sector = (norm * items.size).toInt().coerceIn(0, items.lastIndex)
                                if (sector != selectedItemIndex) {
                                    selectedItemIndex = sector
                                    haptics.focusSnap()
                                }
                            } else {
                                selectedItemIndex = null
                            }

                            scope.launch {
                                offsetX.snapTo(newX)
                                offsetY.snapTo(newY)
                            }
                        },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = "Quick Add or Drag for Radial Menu",
                tint = if (isDragging) accent else Color.White,
                modifier = Modifier.size(26.dp),
            )
        }
    }
}
