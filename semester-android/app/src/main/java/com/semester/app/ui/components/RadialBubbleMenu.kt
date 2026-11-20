package com.semester.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.semester.app.haptics.HapticCrownEngine
import kotlin.math.*

data class BubbleItem(
    val id: String,
    val title: String,
    val icon: ImageVector,
    val color: Color
)

@Composable
fun RadialBubbleMenu(
    haptics: HapticCrownEngine,
    onItemSelected: (String) -> Unit
) {
    var isDragging by remember { mutableStateOf(false) }
    var lastTickAngle by remember { mutableFloatStateOf(0f) }
    var selectedItemIndex by remember { mutableStateOf<Int?>(null) }

    val offsetX = remember { Animatable(0f) }
    val offsetY = remember { Animatable(0f) }

    val items = listOf(
        BubbleItem("dashboard", "Dashboard", Icons.Default.Dashboard, Color(0xFF10B981)),
        BubbleItem("radar", "Timetable Radar", Icons.Default.Schedule, Color(0xFF3B82F6)),
        BubbleItem("whatif", "What-If Simulator", Icons.Default.AutoGraph, Color(0xFF8B5CF6)),
        BubbleItem("results", "IPU Results", Icons.Default.School, Color(0xFFF59E0B)),
        BubbleItem("qr", "Share QR", Icons.Default.QrCode, Color(0xFFEC4899))
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(bottom = 32.dp),
        contentAlignment = Alignment.BottomCenter
    ) {
        // Satellite Options (rendered when dragging)
        if (isDragging) {
            val angleStep = (2 * PI) / items.size
            items.forEachIndexed { index, item ->
                val angle = (index * angleStep) - (PI / 2)
                val radius = 130.dp
                val isFocused = selectedItemIndex == index

                val itemX = (cos(angle) * radius.value).dp
                val itemY = (sin(angle) * radius.value).dp

                Box(
                    modifier = Modifier
                        .offset(x = itemX, y = itemY)
                        .scale(if (isFocused) 1.25f else 1.0f)
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(if (isFocused) item.color else item.color.copy(alpha = 0.6f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = item.title,
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
        }

        // Center Drag Bubble (Digital Crown emulated controller)
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), offsetY.value.roundToInt()) }
                .size(68.dp)
                .clip(CircleShape)
                .background(Color(0xFF18181B))
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = {
                            isDragging = true
                            haptics.focusSnap()
                        },
                        onDragEnd = {
                            isDragging = false
                            if (selectedItemIndex != null) {
                                haptics.selectionConfirm()
                                onItemSelected(items[selectedItemIndex!!].id)
                            }
                            selectedItemIndex = null
                            // Spring back smoothly
                            offsetX.animateTo(0f, spring())
                            offsetY.animateTo(0f, spring())
                        },
                        onDragCancel = {
                            isDragging = false
                            selectedItemIndex = null
                            offsetX.animateTo(0f, spring())
                            offsetY.animateTo(0f, spring())
                        },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            val newX = offsetX.value + dragAmount.x
                            val newY = offsetY.value + dragAmount.y

                            // Crown rotary feedback calculation: 7.2 degrees = 0.1256 radians
                            val currentAngle = (atan2(newY, newX) * 180 / PI).toFloat()
                            if (abs(currentAngle - lastTickAngle) >= 7.2f) {
                                haptics.crownTick()
                                lastTickAngle = currentAngle
                            }

                            // Determine if snapping into an item sector
                            val dist = sqrt(newX * newX + newY * newY)
                            if (dist > 70f) {
                                var normAngle = (atan2(newY, newX) + PI / 2)
                                if (normAngle < 0) normAngle += 2 * PI
                                val sector = ((normAngle / (2 * PI)) * items.size).toInt() % items.size
                                if (sector != selectedItemIndex) {
                                    selectedItemIndex = sector
                                    haptics.focusSnap()
                                }
                            } else {
                                selectedItemIndex = null
                            }

                            // Keep inside bounds
                            offsetX.snapTo(newX.coerceIn(-180f, 180f))
                            offsetY.snapTo(newY.coerceIn(-180f, 180f))
                        }
                    )
                },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Apps,
                contentDescription = "Menu Launcher",
                tint = Color.White,
                modifier = Modifier.size(28.dp)
            )
        }
    }
}
