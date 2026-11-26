package com.semester.app.ui.theme

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.R

/**
 * Semantic palette tokens inspired by OpenTune's Pure Black OLED aesthetic
 * combined with Semester's attendance-health color coding.
 */
object SemesterColors {
    val SafeEmerald = Color(0xFF10B981)
    val SafeEmeraldSoft = Color(0xFF34D399)
    val SafeEmeraldContainer = Color(0xFF064E3B)

    val WarningAmber = Color(0xFFF59E0B)
    val WarningAmberSoft = Color(0xFFFBBF24)
    val WarningAmberContainer = Color(0xFF451A03)

    val CriticalCrimson = Color(0xFFEF4444)
    val CriticalCrimsonSoft = Color(0xFFF87171)
    val CriticalCrimsonContainer = Color(0xFF450A0A)

    val ElectricViolet = Color(0xFF8B5CF6)
    val ElectricBlue = Color(0xFF3B82F6)
    val ElectricPink = Color(0xFFEC4899)

    // OpenTune's pure-black OLED surface hierarchy (neutral grays so accent & liquid colors pop)
    val PureBlack = Color.Black
    val SurfaceLowest = Color(0xFF050506)
    val SurfaceLow = Color(0xFF0E0E0F)
    val SurfaceContainer = Color(0xFF17171A)
    val SurfaceHigh = Color(0xFF212124)
    val SurfaceHighest = Color(0xFF2C2C30)
    val TextPrimary = Color(0xFFF2F2F3)
    val TextSecondary = Color(0xFF9A9AA0)
    val TextMuted = Color(0xFF6B6B72)
    val Outline = Color(0xFF4A4A4F)
    val OutlineVariant = Color(0xFF2A2A2E)

    fun healthColor(percentage: Double, target: Double = 75.0): Color = when {
        percentage >= target -> SafeEmerald
        percentage >= (target - 10.0).coerceAtLeast(50.0) -> WarningAmber
        else -> CriticalCrimson
    }
}

/** Current dynamic ambient accent (e.g. from overall attendance health or selected subject). */
val LocalAmbientAccent = compositionLocalOf { SemesterColors.SafeEmerald }

/**
 * Outfit geometric sans variable font (SIL Open Font License),
 * matching OpenTune's crisp, round, high-contrast typography.
 */
@OptIn(ExperimentalTextApi::class)
val OutfitFontFamily = FontFamily(
    listOf(300, 400, 500, 600, 700, 800).map { weight ->
        Font(
            resId = R.font.outfit_variable,
            weight = FontWeight(weight),
            variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
        )
    },
)

private val BaseTypography = Typography()

private fun TextStyle.outfit(weight: FontWeight? = null, spacingSp: Float? = null): TextStyle =
    copy(
        fontFamily = OutfitFontFamily,
        fontWeight = weight ?: fontWeight,
        letterSpacing = spacingSp?.sp ?: letterSpacing,
    )

val SemesterTypography = Typography(
    displayLarge = BaseTypography.displayLarge.outfit(FontWeight.Bold, -1.2f),
    displayMedium = BaseTypography.displayMedium.outfit(FontWeight.Bold, -1.0f),
    displaySmall = BaseTypography.displaySmall.outfit(FontWeight.Bold, -0.6f),
    headlineLarge = BaseTypography.headlineLarge.outfit(FontWeight.Bold, -0.4f),
    headlineMedium = BaseTypography.headlineMedium.outfit(FontWeight.SemiBold, -0.3f),
    headlineSmall = BaseTypography.headlineSmall.outfit(FontWeight.SemiBold, -0.2f),
    titleLarge = BaseTypography.titleLarge.outfit(FontWeight.SemiBold, -0.1f),
    titleMedium = BaseTypography.titleMedium.outfit(FontWeight.Medium),
    titleSmall = BaseTypography.titleSmall.outfit(FontWeight.Medium),
    bodyLarge = BaseTypography.bodyLarge.outfit(),
    bodyMedium = BaseTypography.bodyMedium.outfit(),
    bodySmall = BaseTypography.bodySmall.outfit(),
    labelLarge = BaseTypography.labelLarge.outfit(FontWeight.SemiBold),
    labelMedium = BaseTypography.labelMedium.outfit(FontWeight.Medium),
    labelSmall = BaseTypography.labelSmall.outfit(FontWeight.Medium),
)

/** OpenTune's rounded shape scale. */
val SemesterShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

private fun buildSemesterScheme(accent: Color): ColorScheme = darkColorScheme(
    primary = accent,
    onPrimary = Color.Black,
    primaryContainer = accent.copy(alpha = 0.18f),
    onPrimaryContainer = accent,
    secondary = SemesterColors.ElectricBlue,
    onSecondary = Color.White,
    secondaryContainer = SemesterColors.SurfaceHigh,
    onSecondaryContainer = SemesterColors.TextPrimary,
    tertiary = SemesterColors.ElectricViolet,
    onTertiary = Color.White,
    tertiaryContainer = SemesterColors.ElectricViolet.copy(alpha = 0.18f),
    onTertiaryContainer = SemesterColors.ElectricViolet,
    background = SemesterColors.PureBlack,
    onBackground = SemesterColors.TextPrimary,
    surface = SemesterColors.PureBlack,
    onSurface = SemesterColors.TextPrimary,
    surfaceVariant = SemesterColors.SurfaceHigh,
    onSurfaceVariant = SemesterColors.TextSecondary,
    surfaceContainerLowest = SemesterColors.SurfaceLowest,
    surfaceContainerLow = SemesterColors.SurfaceLow,
    surfaceContainer = SemesterColors.SurfaceContainer,
    surfaceContainerHigh = SemesterColors.SurfaceHigh,
    surfaceContainerHighest = SemesterColors.SurfaceHighest,
    outline = SemesterColors.Outline,
    outlineVariant = SemesterColors.OutlineVariant,
    error = SemesterColors.CriticalCrimson,
    onError = Color.White,
    errorContainer = SemesterColors.CriticalCrimsonContainer,
    onErrorContainer = SemesterColors.CriticalCrimsonSoft,
)

/**
 * Smoothly animates key color tokens (600ms) whenever the dynamic accent changes,
 * mirroring OpenTune's artwork-seeded theme transitions.
 */
@Composable
private fun ColorScheme.animated(): ColorScheme {
    val spec = tween<Color>(durationMillis = 600)
    @Composable
    fun Color.a(): Color = animateColorAsState(this, spec, label = "schemeColor").value

    return copy(
        primary = primary.a(),
        primaryContainer = primaryContainer.a(),
        onPrimaryContainer = onPrimaryContainer.a(),
        secondary = secondary.a(),
        tertiary = tertiary.a(),
        background = background.a(),
        surface = surface.a(),
        surfaceContainer = surfaceContainer.a(),
        surfaceContainerHigh = surfaceContainerHigh.a(),
    )
}

@Composable
fun SemesterTheme(
    ambientAccent: Color = SemesterColors.SafeEmerald,
    content: @Composable () -> Unit,
) {
    val animatedAccent by animateColorAsState(
        targetValue = ambientAccent,
        animationSpec = tween(durationMillis = 600),
        label = "ambientAccent",
    )
    val scheme = buildSemesterScheme(animatedAccent).animated()

    CompositionLocalProvider(LocalAmbientAccent provides animatedAccent) {
        MaterialTheme(
            colorScheme = scheme,
            typography = SemesterTypography,
            shapes = SemesterShapes,
            content = content,
        )
    }
}
