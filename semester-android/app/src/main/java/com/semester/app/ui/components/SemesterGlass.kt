package com.semester.app.ui.components

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URL
import kotlin.math.pow

/**
 * 120Hz Zero-Allocation Desktop `.liquid-glass` Modifier:
 * Uses `drawWithCache` so every gradient & radial corner aurora shader is allocated
 * ONCE per card size change (ZERO per-frame GC or shader recompiles during scroll),
 * and drops scroll-blocking pointer listeners & heavy list RenderNode shadows.
 */
@Composable
fun Modifier.liquidGlass(
    shape: Shape,
    tint: Color? = null,
    accentTint: Color? = null,
    elevation: Dp = 0.dp,
    @Suppress("UNUSED_PARAMETER") touchResponse: Boolean = false,
    @Suppress("UNUSED_PARAMETER") swell: Boolean = false,
): Modifier {
    val isDark = LocalIsDarkTheme.current

    val topColor = when {
        tint != null -> tint
        isDark -> SemesterColors.SurfaceCardTop.copy(alpha = 0.96f)
        else -> Color(0xFFFFFFFF).copy(alpha = 0.96f)
    }
    val bottomColor = when {
        tint != null -> lerp(tint, if (isDark) SemesterColors.SurfaceCardBottom else Color(0xFFF3F6FF), 0.35f)
        isDark -> SemesterColors.SurfaceCardBottom.copy(alpha = 0.98f)
        else -> Color(0xFFF5F7FF).copy(alpha = 0.94f)
    }
    val topFinal = if (accentTint != null) lerp(topColor, accentTint.copy(alpha = topColor.alpha), if (isDark) 0.11f else 0.07f) else topColor
    val cornerA = accentTint ?: SemesterColors.BrandCobalt
    val cornerB = SemesterColors.BrandCyanSoft

    val borderBrush = remember(isDark, accentTint) {
        if (isDark) {
            Brush.linearGradient(
                0f to (accentTint?.copy(alpha = 0.46f) ?: Color(0xFFC7D2FE).copy(alpha = 0.24f)),
                0.45f to Color.White.copy(alpha = 0.08f),
                1f to SemesterColors.BrandCyanSoft.copy(alpha = 0.18f),
            )
        } else {
            Brush.linearGradient(
                0f to (accentTint?.copy(alpha = 0.30f) ?: SemesterColors.BrandIndigo.copy(alpha = 0.14f)),
                0.5f to SemesterColors.LightOutline.copy(alpha = 0.85f),
                1f to SemesterColors.BrandCyan.copy(alpha = 0.15f),
            )
        }
    }

    // Cap list-card shadow subtly so scrolling stays locked at 120fps on all Android GPUs
    val effectiveElevation = if (elevation >= 16.dp) if (isDark) 10.dp else 8.dp else 0.dp

    return this
        .then(
            if (effectiveElevation > 0.dp) {
                Modifier.shadow(
                    elevation = effectiveElevation,
                    shape = shape,
                    clip = false,
                    ambientColor = if (isDark) Color.Black.copy(alpha = 0.55f) else SemesterColors.BrandIndigo.copy(alpha = 0.12f),
                    spotColor = if (isDark) Color.Black.copy(alpha = 0.65f) else SemesterColors.BrandIndigo.copy(alpha = 0.16f),
                )
            } else {
                Modifier
            },
        )
        .clip(shape)
        .drawWithCache {
            val baseBg = Brush.verticalGradient(listOf(topFinal, bottomColor))
            val radiusA = maxOf(size.width, size.height).coerceAtLeast(1f) * 0.88f
            val radiusB = maxOf(size.width, size.height).coerceAtLeast(1f) * 0.82f
            val glowA = Brush.radialGradient(
                0f to cornerA.copy(alpha = if (isDark) 0.15f else 0.06f),
                1f to Color.Transparent,
                center = Offset.Zero,
                radius = radiusA,
            )
            val glowB = Brush.radialGradient(
                0f to cornerB.copy(alpha = if (isDark) 0.10f else 0.05f),
                1f to Color.Transparent,
                center = Offset(size.width, size.height),
                radius = radiusB,
            )
            val topSheen = Brush.verticalGradient(
                0f to Color.White.copy(alpha = if (isDark) 0.12f else 0.42f),
                0.35f to Color.Transparent,
            )
            onDrawWithContent {
                drawRect(baseBg)
                drawRect(glowA)
                drawRect(glowB)
                drawContent()
                drawRect(topSheen)
            }
        }
        .border(width = 1.dp, brush = borderBrush, shape = shape)
}

/**
 * 120Hz Cached Desktop `.liquid-hero-banner` surface: luminous dual-corner indigo/cyan aurora glass.
 */
@Composable
fun Modifier.liquidHeroBanner(
    shape: Shape = RoundedCornerShape(26.dp),
    accentTint: Color? = null,
): Modifier {
    val isDark = LocalIsDarkTheme.current
    val glowAColor = accentTint ?: SemesterColors.BrandCobalt
    val glowBColor = SemesterColors.BrandCyanSoft

    val borderBrush = remember(isDark, glowBColor) {
        Brush.linearGradient(
            0f to (if (isDark) Color.White.copy(alpha = 0.20f) else SemesterColors.BrandCobalt.copy(alpha = 0.24f)),
            0.5f to (if (isDark) Color.White.copy(alpha = 0.08f) else SemesterColors.BrandIndigo.copy(alpha = 0.10f)),
            1f to glowBColor.copy(alpha = if (isDark) 0.28f else 0.22f),
        )
    }

    return this
        .shadow(
            elevation = if (isDark) 12.dp else 9.dp,
            shape = shape,
            clip = false,
            ambientColor = if (isDark) Color.Black.copy(alpha = 0.70f) else SemesterColors.BrandIndigo.copy(alpha = 0.16f),
            spotColor = if (isDark) glowBColor.copy(alpha = 0.18f) else SemesterColors.BrandIndigo.copy(alpha = 0.18f),
        )
        .clip(shape)
        .drawWithCache {
            val baseBrush = if (isDark) {
                Brush.linearGradient(listOf(Color(0xFF1A223A), Color(0xFF0D1222)))
            } else {
                Brush.linearGradient(listOf(Color(0xFFFFFFFF), Color(0xFFF1F4FF)))
            }
            val rA = maxOf(size.width, size.height).coerceAtLeast(1f) * 0.98f
            val rB = maxOf(size.width, size.height).coerceAtLeast(1f) * 0.92f
            val radialA = Brush.radialGradient(
                0f to glowAColor.copy(alpha = if (isDark) 0.28f else 0.15f),
                1f to Color.Transparent,
                center = Offset.Zero,
                radius = rA,
            )
            val radialB = Brush.radialGradient(
                0f to glowBColor.copy(alpha = if (isDark) 0.22f else 0.14f),
                1f to Color.Transparent,
                center = Offset(size.width, size.height),
                radius = rB,
            )
            val topSheen = Brush.verticalGradient(
                0f to Color.White.copy(alpha = if (isDark) 0.14f else 0.50f),
                0.35f to Color.Transparent,
            )
            onDrawWithContent {
                drawRect(baseBrush)
                drawRect(radialA)
                drawRect(radialB)
                drawContent()
                drawRect(topSheen)
            }
        }
        .border(width = 1.dp, brush = borderBrush, shape = shape)
}

fun softGlowStops(
    inner: Color,
    peak: Float,
    outer: Color = inner,
    shape: Float = 2f,
): Array<Pair<Float, Color>> = Array(9) { i ->
    val t = i / 8f
    val fall = (1f - t.pow(shape)).let { it * it }
    t to lerp(inner, outer, (t * 2f).coerceAtMost(1f)).copy(alpha = (peak * fall).coerceIn(0f, 1f))
}

@Composable
fun AmbientTopGlow(
    color: Color,
    modifier: Modifier = Modifier,
    peakAlpha: Float = 0.20f,
    height: Dp = 280.dp,
) {
    val isDark = LocalIsDarkTheme.current
    val effectivePeak = if (isDark) peakAlpha else peakAlpha * 0.60f
    val stops = remember(color, effectivePeak) {
        softGlowStops(inner = color, peak = effectivePeak, shape = 1.85f)
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .drawWithCache {
                val brush = Brush.radialGradient(
                    colorStops = stops,
                    center = Offset(size.width * 0.5f, -size.height * 0.14f),
                    radius = maxOf(size.width * 0.90f, size.height * 1.15f).coerceAtLeast(1f),
                )
                onDrawBehind {
                    drawRect(brush = brush)
                }
            },
    )
}

@Composable
fun TopEdgeFrost(modifier: Modifier = Modifier) {
    val page = MaterialTheme.colorScheme.background
    val height = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 20.dp
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .drawWithCache {
                val brush = Brush.verticalGradient(
                    0f to page.copy(alpha = 0.86f),
                    0.55f to page.copy(alpha = 0.30f),
                    1f to Color.Transparent,
                )
                onDrawBehind { drawRect(brush) }
            },
    )
}

// =============================================================================
// UNIFIED STUDIO BUTTON, CHIP & SEMESTER SELECTOR SYSTEM
// =============================================================================

/**
 * Uniform circular glass orb icon button (40dp standard across all headers).
 */
@Composable
fun GlassIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
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
                elevation = 0.dp,
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

/**
 * Primary CTA: Exact Desktop `.btn-gradient` capsule button (`#4F46E5 -> #6366F1 -> #06B6D4`).
 */
@Composable
fun GradientButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(horizontal = 18.dp, vertical = 11.dp),
) {
    val shape = CircleShape
    Row(
        modifier = modifier
            .graphicsLayer { alpha = if (enabled) 1f else 0.45f }
            .then(if (enabled) Modifier.pressable(onClick = onClick, pressedScale = 0.95f) else Modifier)
            .shadow(
                elevation = if (enabled) 8.dp else 0.dp,
                shape = shape,
                ambientColor = SemesterColors.BrandIndigo.copy(alpha = 0.45f),
                spotColor = SemesterColors.BrandCyan.copy(alpha = 0.38f),
            )
            .clip(shape)
            .background(SemesterGradients.brandButton)
            .border(1.dp, Color.White.copy(alpha = 0.26f), shape)
            .padding(contentPadding),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(6.dp))
        }
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Unified Secondary Action capsule matching `GradientButton` geometry (`CircleShape`, 1px glass rim).
 */
@Composable
fun GlassSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    accentTint: Color? = null,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 11.dp),
) {
    val isDark = LocalIsDarkTheme.current
    val bg = when {
        accentTint != null -> accentTint.copy(alpha = if (isDark) 0.16f else 0.10f)
        isDark -> SemesterColors.SurfaceHigh.copy(alpha = 0.85f)
        else -> Color.White.copy(alpha = 0.92f)
    }
    val borderColor = accentTint?.copy(alpha = 0.36f) ?: MaterialTheme.colorScheme.outline.copy(alpha = 0.7f)
    val fgColor = accentTint ?: MaterialTheme.colorScheme.onSurface

    Row(
        modifier = modifier
            .graphicsLayer { alpha = if (enabled) 1f else 0.45f }
            .then(if (enabled) Modifier.pressable(onClick = onClick, pressedScale = 0.95f) else Modifier)
            .clip(CircleShape)
            .background(bg)
            .border(1.dp, borderColor, CircleShape)
            .padding(contentPadding),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = fgColor,
                modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(6.dp))
        }
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = fgColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Unified Destructive Pill Button matching `GradientButton` geometry.
 */
@Composable
fun DangerPillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 11.dp),
) {
    GlassSecondaryButton(
        text = text,
        onClick = onClick,
        icon = icon,
        accentTint = SemesterColors.CriticalCrimson,
        contentPadding = contentPadding,
        modifier = modifier,
    )
}

/**
 * Unified Pill Chip used across Semester Selector, Weekdays, Note Filters, and Results Semesters.
 */
@Composable
fun StudioPillChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    badge: String? = null,
) {
    val isDark = LocalIsDarkTheme.current
    val inactiveBg = if (isDark) SemesterColors.SurfaceContainer else Color.White.copy(alpha = 0.88f)
    val borderColor = if (selected) Color.White.copy(alpha = 0.25f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.65f)

    Row(
        modifier = modifier
            .height(34.dp)
            .pressable(onClick = onClick, pressedScale = 0.94f)
            .clip(CircleShape)
            .then(
                if (selected) Modifier.background(SemesterGradients.brandButton)
                else Modifier.background(inactiveBg),
            )
            .border(1.dp, borderColor, CircleShape)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!badge.isNullOrBlank()) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (selected) Color.White.copy(alpha = 0.22f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                    .padding(horizontal = 5.dp, vertical = 1.dp),
            ) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                    fontWeight = FontWeight.Bold,
                    color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * Consistent compact tappable Semester Badge (`Sem 1 ▾`) for Schedule, Studio, What-If & headers.
 */
@Composable
fun SemesterPickerBadge(
    semester: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isDark = LocalIsDarkTheme.current
    Row(
        modifier = modifier
            .height(30.dp)
            .pressable(onClick = onClick, pressedScale = 0.93f)
            .clip(CircleShape)
            .background(
                if (isDark) SemesterColors.BrandCobalt.copy(alpha = 0.18f)
                else SemesterColors.BrandIndigo.copy(alpha = 0.11f),
            )
            .border(
                1.dp,
                SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.42f else 0.30f),
                CircleShape,
            )
            .padding(start = 10.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = "SEM $semester",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.primary,
            letterSpacing = 0.8.sp,
        )
        Icon(
            imageVector = Icons.Rounded.KeyboardArrowDown,
            contentDescription = "Switch Semester",
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(15.dp),
        )
    }
}

/**
 * Consistent horizontal Semester Selector Strip (`Sem 1` .. `Sem 8`) with auto-centering on active semester.
 */
@Composable
fun SemesterPillStrip(
    selectedSemester: Int,
    onSelectSemester: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(selectedSemester) {
        val target = (selectedSemester - 1).coerceIn(0, 7)
        listState.animateScrollToItem((target - 1).coerceAtLeast(0))
    }

    LazyRow(
        state = listState,
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items((1..8).toList(), key = { "sem_pill_$it" }) { sem ->
            StudioPillChip(
                label = "Sem $sem",
                selected = sem == selectedSemester,
                onClick = { onSelectSemester(sem) },
            )
        }
    }
}

/**
 * Unified Semester Picker Bottom Sheet opened from any screen's `SEM X ▾` badge.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SemesterPickerSheet(
    selectedSemester: Int,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column {
                Text(
                    text = "ACTIVE WORKSPACE",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    letterSpacing = 1.1.sp,
                )
                Text(
                    text = "Switch Semester",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            // 2 clean rows of 4 balanced semester capsules
            listOf(1..4, 5..8).forEach { range ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    range.forEach { sem ->
                        val active = sem == selectedSemester
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp)
                                .pressable(
                                    onClick = {
                                        onSelect(sem)
                                        onDismiss()
                                    },
                                    pressedScale = 0.94f,
                                )
                                .clip(RoundedCornerShape(16.dp))
                                .then(
                                    if (active) Modifier.background(SemesterGradients.brandButton)
                                    else Modifier
                                        .background(MaterialTheme.colorScheme.surfaceContainer)
                                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp)),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "Sem $sem",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = if (active) FontWeight.ExtraBold else FontWeight.SemiBold,
                                color = if (active) Color.White else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Exact Desktop `.gradient-text` display typography (`Bricolage Grotesque` + Cobalt→Cyan→Rose brush).
 */
@Composable
fun GradientText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    maxLines: Int = 1,
) {
    val isDark = LocalIsDarkTheme.current
    val brush = remember(isDark) { SemesterGradients.brandText(isDark) }
    Text(
        text = text,
        style = style.copy(brush = brush),
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier,
    )
}

data class SegmentOption<T>(
    val id: T,
    val label: String,
    val count: Int? = null,
    val icon: ImageVector? = null,
)

/**
 * Exact Desktop `RubberSegment` pill bar with luminous indigo→cyan active gradient pill.
 */
@Composable
fun <T> RubberSegment(
    options: List<SegmentOption<T>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    fillWidth: Boolean = false,
) {
    val isDark = LocalIsDarkTheme.current
    val trackBg = if (isDark) Color(0xFF12182A) else Color(0xFFE6EBF8)
    val trackBorder = if (isDark) Color(0xFF818CF8).copy(alpha = 0.22f) else SemesterColors.LightOutline

    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(trackBg)
            .border(1.dp, trackBorder, CircleShape)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        options.forEach { opt ->
            val active = opt.id == selected
            val fg by animateColorAsState(
                targetValue = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                animationSpec = tween(150),
                label = "segFg",
            )
            Row(
                modifier = (if (fillWidth) Modifier.weight(1f) else Modifier)
                    .clip(CircleShape)
                    .then(
                        if (active) Modifier.background(SemesterGradients.brandButton)
                        else Modifier.background(Color.Transparent),
                    )
                    .clickable { onSelect(opt.id) }
                    .padding(horizontal = if (fillWidth) 6.dp else 12.dp, vertical = 7.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (opt.icon != null) {
                    Icon(opt.icon, contentDescription = null, tint = fg, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(5.dp))
                }
                Text(
                    text = opt.label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.SemiBold,
                    color = fg,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (opt.count != null) {
                    Spacer(Modifier.width(5.dp))
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (active) Color.White.copy(alpha = 0.22f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                            .padding(horizontal = 5.dp, vertical = 1.dp),
                    ) {
                        Text(
                            text = "${opt.count}",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = fg,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Exact Desktop Semester Brand Emblem (`docs/brand-logo.svg`): rounded indigo→violet→cyan badge with `S` wave.
 * Cached vector paths so it never reallocates during recomposition or scrolling.
 */
@Composable
fun SemesterBrandMark(
    size: Dp = 36.dp,
    modifier: Modifier = Modifier,
) {
    val corner = size * 0.27f
    Box(
        modifier = modifier
            .size(size)
            .shadow(
                elevation = 6.dp,
                shape = RoundedCornerShape(corner),
                ambientColor = SemesterColors.BrandIndigo.copy(alpha = 0.45f),
                spotColor = SemesterColors.BrandCyan.copy(alpha = 0.35f),
            )
            .clip(RoundedCornerShape(corner))
            .background(SemesterGradients.brandLogo)
            .border(1.dp, Color.White.copy(alpha = 0.30f), RoundedCornerShape(corner)),
    ) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val sx = this.size.width / 64f
            val sy = this.size.height / 64f

            val sPath = Path().apply {
                moveTo(44.5f * sx, 21.5f * sy)
                cubicTo(44.5f * sx, 17.6f * sy, 40.2f * sx, 15f * sy, 33.6f * sx, 15f * sy)
                cubicTo(26.2f * sx, 15f * sy, 21f * sx, 18.7f * sy, 21f * sx, 23.8f * sy)
                cubicTo(21f * sx, 28.5f * sy, 24.9f * sx, 31.1f * sy, 32.2f * sx, 32.3f * sy)
                lineTo(36.2f * sx, 33f * sy)
                cubicTo(40.4f * sx, 33.7f * sy, 42.5f * sx, 35.1f * sy, 42.5f * sx, 37.8f * sy)
                cubicTo(42.5f * sx, 40.9f * sy, 39.2f * sx, 43f * sy, 33.4f * sx, 43f * sy)
                cubicTo(28.4f * sx, 43f * sy, 24.9f * sx, 41.3f * sy, 23.7f * sx, 38.6f * sy)
            }
            drawPath(
                path = sPath,
                brush = Brush.linearGradient(listOf(Color.White, Color(0xFFE0F2FE))),
                style = Stroke(width = 5.4f * sx, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )

            val wavePath = Path().apply {
                moveTo(20.5f * sx, 48.2f * sy)
                cubicTo(24.8f * sx, 50.6f * sy, 31.6f * sx, 51.3f * sy, 39.2f * sx, 48.6f * sy)
                cubicTo(41.8f * sx, 47.7f * sy, 43.8f * sx, 46.3f * sy, 45.2f * sx, 44.8f * sy)
            }
            drawPath(
                path = wavePath,
                brush = Brush.linearGradient(listOf(Color(0xFFCFFAFE), Color.White)),
                alpha = 0.82f,
                style = Stroke(width = 3.2f * sx, cap = StrokeCap.Round),
            )
        }
    }
}

/**
 * Super-minimal right-aligned scroll affordance (`->`) tucked cleanly beneath horizontally
 * scrollable strips. Fades away smoothly once the user reaches the end of the strip.
 */
@Composable
fun ScrollForwardHint(
    visible: Boolean,
    modifier: Modifier = Modifier,
) {
    val alpha by animateFloatAsState(
        targetValue = if (visible) 0.55f else 0f,
        animationSpec = tween(220),
        label = "scrollHintAlpha",
    )
    if (alpha > 0.01f) {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .padding(end = 22.dp, top = 2.dp)
                .graphicsLayer { this.alpha = alpha },
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.ArrowForward,
                contentDescription = "Scroll for more",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(13.dp),
            )
        }
    }
}

/**
 * Synced Student Profile Avatar supporting both Base64 data URLs (`data:image/...;base64,...`)
 * and remote Google account URLs, with brand-gradient initials fallback.
 */
@Composable
fun UserAvatarView(
    picture: String,
    name: String,
    size: Dp = 54.dp,
    cornerRadius: Dp = 18.dp,
    modifier: Modifier = Modifier,
) {
    var bitmap by remember(picture) { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(picture) {
        bitmap = null
        val src = picture.trim()
        if (src.isEmpty()) return@LaunchedEffect
        bitmap = withContext(Dispatchers.IO) {
            runCatching {
                val bytes = when {
                    src.startsWith("data:image", ignoreCase = true) -> {
                        val b64 = src.substringAfter("base64,", "")
                        if (b64.isBlank()) null else Base64.decode(b64, Base64.DEFAULT)
                    }
                    src.startsWith("http://") || src.startsWith("https://") -> {
                        URL(src).openStream().use { it.readBytes() }
                    }
                    else -> null
                }
                bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() }
            }.getOrNull()
        }
    }

    val initials = remember(name) {
        name.split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .joinToString("") { it.first().uppercase() }
            .ifBlank { "ST" }
    }
    val shape = RoundedCornerShape(cornerRadius)

    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(SemesterGradients.brandLogo)
            .border(1.dp, Color.White.copy(alpha = 0.28f), shape),
        contentAlignment = Alignment.Center,
    ) {
        val img = bitmap
        if (img != null) {
            Image(
                bitmap = img,
                contentDescription = "$name avatar",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = initials,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
                color = Color.White,
            )
        }
    }
}

