package com.semester.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.theme.SemesterColors
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Native Jetpack Compose LiquidFillGauge combining Semester's dual-wave
 * interactive sloshing reservoir with OpenTune's specular glass rim & Outfit typography.
 */
@Composable
fun LiquidFillGauge(
    percentage: Double,
    modifier: Modifier = Modifier,
    size: Dp = 148.dp,
    targetThreshold: Double = 75.0,
    sublabel: String = "HEALTH",
    haptics: HapticCrownEngine? = null,
    onClick: () -> Unit = {},
) {
    val clampedPct = percentage.coerceIn(0.0, 100.0).toFloat()
    var isSloshing by remember { mutableStateOf(false) }

    LaunchedEffect(isSloshing) {
        if (isSloshing) {
            delay(900L)
            isSloshing = false
        }
    }

    val animatedFill by animateFloatAsState(
        targetValue = clampedPct / 100f,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 170f),
        label = "liquidFillLevel",
    )

    val waveAmplitude by animateFloatAsState(
        targetValue = if (isSloshing) 13f else 6f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 240f),
        label = "liquidAmplitude",
    )

    val bounceScale by animateFloatAsState(
        targetValue = if (isSloshing) 1.05f else 1f,
        animationSpec = spring(dampingRatio = 0.42f, stiffness = 420f),
        label = "liquidBounce",
    )

    val targetColor = SemesterColors.healthColor(percentage, targetThreshold)
    val primaryColor by animateColorAsState(
        targetValue = targetColor,
        animationSpec = tween(550),
        label = "liquidPrimaryColor",
    )
    val deepColor by animateColorAsState(
        targetValue = when {
            percentage >= targetThreshold -> Color(0xFF047857)
            percentage >= 65.0 -> Color(0xFFB45309)
            else -> Color(0xFFB91C1C)
        },
        animationSpec = tween(550),
        label = "liquidDeepColor",
    )

    val infinite = rememberInfiniteTransition(label = "liquidWaves")
    val phase by infinite.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wavePhase",
    )

    val interaction = remember { MutableInteractionSource() }

    Box(
        modifier = modifier
            .size(size)
            .graphicsLayer {
                scaleX = bounceScale
                scaleY = bounceScale
            }
            .shadow(
                elevation = 20.dp,
                shape = CircleShape,
                ambientColor = primaryColor.copy(alpha = 0.45f),
                spotColor = primaryColor.copy(alpha = 0.55f),
            )
            .clip(CircleShape)
            .border(
                width = 1.4.dp,
                brush = Brush.linearGradient(
                    0f to Color.White.copy(alpha = 0.42f),
                    0.45f to primaryColor.copy(alpha = 0.28f),
                    1f to Color.White.copy(alpha = 0.22f),
                ),
                shape = CircleShape,
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
            ) {
                haptics?.crownTick()
                isSloshing = true
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = this.size.width
            val h = this.size.height
            val baseWaterY = h * (1f - animatedFill)

            // Dark OLED glass reservoir background
            drawCircle(color = Color(0xFF101014))

            // Back parallax wave
            val backPath = Path().apply {
                moveTo(0f, h)
                lineTo(0f, baseWaterY)
                val step = 12f
                var x = 0f
                while (x <= w + step) {
                    val y = baseWaterY + cos(phase * 0.85f + (x / w) * 4.5f) * (waveAmplitude * 0.75f)
                    lineTo(x, y)
                    x += step
                }
                lineTo(w, h)
                close()
            }
            drawPath(
                path = backPath,
                brush = Brush.verticalGradient(
                    colors = listOf(primaryColor.copy(alpha = 0.36f), deepColor.copy(alpha = 0.52f)),
                    startY = (baseWaterY - 24f).coerceAtLeast(0f),
                    endY = h,
                ),
            )

            // Front primary wave
            val frontPath = Path().apply {
                moveTo(0f, h)
                lineTo(0f, baseWaterY)
                val step = 10f
                var x = 0f
                while (x <= w + step) {
                    val y = baseWaterY + sin(phase + (x / w) * 5.2f) * waveAmplitude
                    lineTo(x, y)
                    x += step
                }
                lineTo(w, h)
                close()
            }
            drawPath(
                path = frontPath,
                brush = Brush.verticalGradient(
                    colors = listOf(primaryColor.copy(alpha = 0.86f), deepColor.copy(alpha = 0.96f)),
                    startY = (baseWaterY - 24f).coerceAtLeast(0f),
                    endY = h,
                ),
            )

            // Specular curved glass highlight (top-left)
            rotate(degrees = -26f, pivot = Offset(w * 0.34f, h * 0.22f)) {
                drawOval(
                    color = Color.White.copy(alpha = 0.14f),
                    topLeft = Offset(w * 0.15f, h * 0.14f),
                    size = Size(w * 0.38f, h * 0.16f),
                )
            }
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "${String.format("%.1f", clampedPct)}%",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.ExtraBold,
                color = Color.White,
                letterSpacing = (-0.8).sp,
            )
            Text(
                text = sublabel,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White.copy(alpha = 0.76f),
                letterSpacing = 1.2.sp,
            )
        }
    }
}
