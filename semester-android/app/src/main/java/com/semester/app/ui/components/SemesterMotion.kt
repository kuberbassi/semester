package com.semester.app.ui.components

import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.exp
import kotlin.math.ln

/**
 * OpenTune's iOS-inspired tactile press sink: scales down softly under the finger
 * and springs back with crisp responsiveness.
 */
@Composable
fun Modifier.pressable(
    onClick: () -> Unit,
    pressedScale: Float = 0.96f,
): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 600f),
        label = "pressableScale",
    )
    return this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .clickable(
            interactionSource = interaction,
            indication = null,
            onClick = onClick,
        )
}

/**
 * OpenTune-inspired PageMotion spring transitions between primary tabs.
 * Uses directional glide when moving left/right across the bottom dock,
 * combined with subtle depth scaling.
 */
object SemesterPageMotion {
    private val glide = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = 500f,
        visibilityThreshold = IntOffset.VisibilityThreshold,
    )

    fun tabTransition(forward: Boolean): ContentTransform {
        val dir = if (forward) 1 else -1
        val enter = slideInHorizontally(glide) { fullWidth -> (fullWidth * 0.14f * dir).toInt() } +
            fadeIn(tween(220, easing = FastOutSlowInEasing)) +
            scaleIn(tween(260, easing = FastOutSlowInEasing), initialScale = 0.97f)
        val exit = slideOutHorizontally(glide) { fullWidth -> (-fullWidth * 0.10f * dir).toInt() } +
            fadeOut(tween(150, easing = FastOutSlowInEasing)) +
            scaleOut(tween(200, easing = FastOutSlowInEasing), targetScale = 0.98f)
        return enter togetherWith exit
    }
}

/**
 * OpenTune-style SectionHeader: uppercase tracked micro-subtitle above a crisp Outfit title,
 * with an optional trailing action slot (e.g. Collapse/Expand liquid toggle).
 */
@Composable
fun SemesterSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 18.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        action?.invoke()
    }
}

/** Plays once per app process launch. */
object SemesterOpeningState {
    var played = false
}

/**
 * OpenTune-inspired OpeningReveal: a clean luminous ring settles with a glint sweep,
 * then opens like a portal window rushing toward you to reveal the Semester dashboard.
 */
@Composable
fun SemesterOpeningReveal(
    accent: Color,
    onDive: (Float) -> Unit,
    onDone: () -> Unit,
) {
    val settle = remember { Animatable(0f) }
    val dive = remember { Animatable(0f) }
    val done by rememberUpdatedState(onDone)
    val report by rememberUpdatedState(onDive)

    LaunchedEffect(Unit) {
        settle.animateTo(1f, tween(480, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)))
        delay(80L)
        dive.animateTo(1f, tween(680, easing = CubicBezierEasing(0.6f, 0f, 0.85f, 0.35f))) {
            report(value)
        }
        report(1f)
        done()
    }

    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen },
    ) {
        val d = dive.value
        val st = settle.value
        val breathe = 1f + 0.06f * kotlin.math.sin(Math.PI.toFloat() * st)
        val baseRadius = 44.dp.toPx() * breathe
        val zoomRadius = baseRadius * exp(ln(28f) * d * d)

        val window = smoothstep(0.05f, 0.30f, d)
        val fade = 1f - smoothstep(0.75f, 1f, d)

        // Pure black veil
        drawRect(Color.Black, alpha = fade)

        // Luminous solid emblem that glints, then punches a portal through the veil
        if (window < 1f) {
            drawCircle(
                brush = Brush.linearGradient(
                    colors = listOf(Color.White, accent),
                    start = Offset(center.x - baseRadius, center.y - baseRadius),
                    end = Offset(center.x + baseRadius, center.y + baseRadius),
                ),
                radius = zoomRadius,
                center = center,
                alpha = (1f - window) * fade,
            )
        }

        // Portal cutout revealing the live app beneath
        if (window > 0f) {
            drawCircle(
                color = Color.Black,
                radius = zoomRadius,
                center = center,
                alpha = window,
                blendMode = BlendMode.DstOut,
            )
        }

        // Crisp glowing ring around the expanding portal
        if (fade > 0f) {
            drawCircle(
                brush = Brush.linearGradient(
                    colors = listOf(Color.White.copy(alpha = fade), accent.copy(alpha = fade)),
                ),
                radius = zoomRadius,
                center = center,
                style = Stroke(width = 2.5.dp.toPx()),
            )
        }
    }
}

private fun smoothstep(from: Float, to: Float, x: Float): Float {
    val t = ((x - from) / (to - from)).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}
