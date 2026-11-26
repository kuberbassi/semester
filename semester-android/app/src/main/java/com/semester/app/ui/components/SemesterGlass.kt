package com.semester.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.pow

/**
 * Tracks where a finger touches a Liquid Glass surface without consuming clicks,
 * mirroring OpenTune's LiquidTouch interaction.
 */
@Stable
class LiquidTouch {
    var down by mutableStateOf(false)
    var at by mutableStateOf(Offset.Unspecified)
}

/**
 * OpenTune-inspired Liquid Glass modifier:
 * - Translucent frosted film tinted subtly with surface/accent
 * - Top curved sheen + lower edge light catch
 * - Diagonal specular bevel rim (brightest at top-left & bottom-right)
 * - Tactile liquid swell toward the touch point on a bouncy spring + radial pool of light
 */
@Composable
fun Modifier.liquidGlass(
    shape: Shape,
    tint: Color = Color(0xFF141418).copy(alpha = 0.78f),
    accentTint: Color? = null,
    elevation: Dp = 14.dp,
    touchResponse: Boolean = true,
    swell: Boolean = true,
): Modifier {
    val touch = remember { LiquidTouch() }
    val press by animateFloatAsState(
        targetValue = if (touchResponse && touch.down) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.5f, stiffness = 320f),
        label = "liquidGlassPress",
    )

    val filmColor = if (accentTint != null) {
        lerp(tint, accentTint.copy(alpha = tint.alpha), 0.14f)
    } else {
        tint
    }

    val tracked = if (touchResponse) {
        this.liquidTouch(touch, swell) { press }
    } else {
        this
    }

    return tracked
        .then(
            if (elevation > 0.dp) {
                Modifier.shadow(
                    elevation = elevation,
                    shape = shape,
                    clip = false,
                    ambientColor = Color.Black.copy(alpha = 0.45f),
                    spotColor = Color.Black.copy(alpha = 0.55f),
                )
            } else {
                Modifier
            },
        )
        .clip(shape)
        .background(filmColor)
        .drawWithContent {
            drawContent()
            // Top curved sheen: makes the glass read as a thick, curved lens
            drawRect(
                Brush.verticalGradient(
                    0f to Color.White.copy(alpha = 0.11f),
                    0.48f to Color.Transparent,
                ),
            )
            // Subtle light gathering along the bottom rim
            drawRect(
                Brush.verticalGradient(
                    0.72f to Color.Transparent,
                    1f to Color.White.copy(alpha = 0.06f),
                ),
            )
            // Dynamic radial pool of light under the user's finger
            touchLight(touch, press)
        }
        .border(
            width = 1.dp,
            brush = Brush.linearGradient(
                0f to Color.White.copy(alpha = 0.38f),
                0.45f to Color.White.copy(alpha = 0.09f),
                1f to Color.White.copy(alpha = 0.24f),
            ),
            shape = shape,
        )
}

/**
 * Watches pointer events on the initial pass so child buttons still receive taps,
 * while swelling the glass slightly toward the finger on a spring.
 */
private fun Modifier.liquidTouch(
    touch: LiquidTouch,
    swell: Boolean,
    press: () -> Float,
): Modifier {
    val tracked = this.pointerInput(touch) {
        awaitEachGesture {
            val first = awaitPointerEvent(PointerEventPass.Initial)
                .changes
                .firstOrNull { it.pressed } ?: return@awaitEachGesture
            touch.at = first.position
            touch.down = true
            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val still = event.changes.firstOrNull { it.pressed } ?: break
                touch.at = still.position
            }
            touch.down = false
        }
    }
    if (!swell) return tracked
    return tracked.graphicsLayer {
        val p = press()
        if (p <= 0.001f || size.width <= 0f || size.height <= 0f) return@graphicsLayer
        scaleX = 1f + minOf(0.045f, 7.dp.toPx() / size.width) * p
        scaleY = 1f + minOf(0.045f, 4.dp.toPx() / size.height) * p
        val at = touch.at
        if (at.isSpecified) {
            transformOrigin = TransformOrigin(
                (at.x / size.width).coerceIn(0f, 1f),
                (at.y / size.height).coerceIn(0f, 1f),
            )
        }
    }
}

private fun DrawScope.touchLight(touch: LiquidTouch, press: Float) {
    val at = touch.at
    val strength = press.coerceIn(0f, 1f)
    if (strength < 0.01f || at.isUnspecified) return
    drawRect(
        Brush.radialGradient(
            0f to Color.White.copy(alpha = 0.26f * strength),
            1f to Color.Transparent,
            center = at,
            radius = maxOf(size.width, size.height) * 0.62f,
        ),
    )
}

/**
 * OpenTune's SoftGlow: radial glow stops fading as (1 - t^shape)^2 so no hard rim
 * ever appears where the glow ends. Fades in its own hue rather than transparent black.
 */
fun softGlowStops(
    inner: Color,
    peak: Float,
    outer: Color = inner,
    shape: Float = 2f,
): Array<Pair<Float, Color>> = Array(11) { i ->
    val t = i / 10f
    val fall = (1f - t.pow(shape)).let { it * it }
    t to lerp(inner, outer, (t * 2f).coerceAtMost(1f)).copy(alpha = (peak * fall).coerceIn(0f, 1f))
}

/**
 * Ambient radial glow backdrop pinned to the top of a screen, subtly tinting
 * the pure black OLED canvas with the current attendance health or screen accent.
 */
@Composable
fun AmbientTopGlow(
    color: Color,
    modifier: Modifier = Modifier,
    peakAlpha: Float = 0.24f,
    height: Dp = 300.dp,
) {
    val stops = remember(color, peakAlpha) {
        softGlowStops(inner = color, peak = peakAlpha, shape = 1.85f)
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .drawBehind {
                drawRect(
                    brush = Brush.radialGradient(
                        colorStops = stops,
                        center = Offset(size.width * 0.5f, -size.height * 0.12f),
                        radius = maxOf(size.width * 0.85f, size.height * 1.15f),
                    ),
                )
            },
    )
}

/**
 * OpenTune's TopEdgeFrost: a soft gradient strip under the status bar so scrolling
 * lists fade gracefully instead of clipping harshly against system icons.
 */
@Composable
fun TopEdgeFrost(modifier: Modifier = Modifier) {
    val page = MaterialTheme.colorScheme.background
    val height = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 26.dp
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .background(
                Brush.verticalGradient(
                    0f to page.copy(alpha = 0.82f),
                    0.55f to page.copy(alpha = 0.35f),
                    1f to Color.Transparent,
                ),
            ),
    )
}

/**
 * A round Liquid Glass icon button (used for top-bar actions, add subject, sync, etc.).
 */
@Composable
fun GlassIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 46.dp,
    tint: Color = MaterialTheme.colorScheme.onSurface,
    accentTint: Color? = null,
) {
    Box(
        modifier = modifier
            .size(size)
            .pressable(onClick = onClick, pressedScale = 0.90f)
            .liquidGlass(
                shape = CircleShape,
                accentTint = accentTint,
                elevation = 10.dp,
                touchResponse = true,
                swell = false,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(size * 0.46f),
        )
    }
}
