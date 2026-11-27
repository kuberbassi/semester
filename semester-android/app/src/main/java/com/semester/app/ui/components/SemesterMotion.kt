package com.semester.app.ui.components

import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

private val FluidOutQuint = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

/**
 * Lightweight 120Hz GPU tactile press sink: pure graphicsLayer scale with crisp spring return.
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
        animationSpec = spring(dampingRatio = 0.65f, stiffness = 750f),
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
 * Silky 120Hz directional page & Studio-mode transitions (subtle 6% horizontal glide + cubic fade).
 * Pure GPU layer translation + alpha so lists stay locked at 120fps with zero jank.
 */
object SemesterPageMotion {
    fun tabTransition(forward: Boolean = true): ContentTransform {
        val dir = if (forward) 1 else -1
        return (fadeIn(tween(210, easing = FluidOutQuint)) +
            slideInHorizontally(tween(230, easing = FluidOutQuint)) { fullWidth -> (fullWidth * 0.06f * dir).toInt() }) togetherWith
            (fadeOut(tween(130, easing = FluidOutQuint)) +
                slideOutHorizontally(tween(170, easing = FluidOutQuint)) { fullWidth -> (-fullWidth * 0.04f * dir).toInt() })
    }

    fun modeTransition(forward: Boolean = true): ContentTransform {
        val dir = if (forward) 1 else -1
        return (fadeIn(tween(190, easing = FluidOutQuint)) +
            slideInHorizontally(tween(210, easing = FluidOutQuint)) { fullWidth -> (fullWidth * 0.08f * dir).toInt() }) togetherWith
            (fadeOut(tween(115, easing = FluidOutQuint)) +
                slideOutHorizontally(tween(150, easing = FluidOutQuint)) { fullWidth -> (-fullWidth * 0.05f * dir).toInt() })
    }
}

/**
 * Crisp Desktop-matched SectionHeader: uppercase tracked subtitle above Bricolage/Outfit title.
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
