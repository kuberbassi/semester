package com.semester.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Brush
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
 * Exact Desktop Semester Studio Palette (`frontend/src/index.css`):
 * - Dark Mode: True Obsidian Graphite (#08090D) + Elevated Charcoal Glass (#12141B) + Jewel Cobalt/Cyan/Rose
 * - Light Mode: Luminous Alabaster-Iris (#F2F4FC) + Pure Studio Cards (#FFFFFF) + Deep Indigo/Cyan
 */
object SemesterColors {
    // Brand Core Jewel Palette (exact Desktop hexes)
    val BrandIndigo = Color(0xFF4F46E5)
    val BrandCobalt = Color(0xFF6366F1)
    val BrandCobaltSoft = Color(0xFF818CF8)
    val BrandViolet = Color(0xFF7C3AED)
    val BrandVioletSoft = Color(0xFFA78BFA)
    val BrandCyan = Color(0xFF06B6D4)
    val BrandCyanSoft = Color(0xFF22D3EE)
    val BrandSky = Color(0xFF38BDF8)

    // Semantic Status Palette (exact Desktop SubjectAccordionGallery & ResultsDashboard tones)
    val SafeEmerald = Color(0xFF10B981)
    val SafeEmeraldSoft = Color(0xFF34D399)
    val SafeEmeraldContainer = Color(0xFF064E3B)

    val WarningAmber = Color(0xFFF59E0B)
    val WarningAmberSoft = Color(0xFFFBBF24)
    val WarningOrange = Color(0xFFF97316)
    val WarningAmberContainer = Color(0xFF451A03)

    val CriticalCrimson = Color(0xFFF43F5E)
    val CriticalCrimsonSoft = Color(0xFFFB7185)
    val CriticalPink = Color(0xFFEC4899)
    val CriticalCrimsonContainer = Color(0xFF3F121C)

    val ElectricViolet = BrandVioletSoft
    val ElectricBlue = BrandSky
    val ElectricPink = CriticalPink

    // Upgraded High-Contrast Obsidian OLED Dark surfaces (distinct depth & luminous jewel clarity)
    val PureBlack = Color(0xFF05070D)
    val SurfaceLowest = Color(0xFF05070D)
    val SurfaceLow = Color(0xFF0A0E19)
    val SurfaceContainer = Color(0xFF101524)
    val SurfaceCardTop = Color(0xFF161D31)
    val SurfaceCardBottom = Color(0xFF0D1220)
    val SurfaceHigh = Color(0xFF1C243B)
    val SurfaceHighest = Color(0xFF26314E)
    val TextPrimary = Color(0xFFF8FAFF)
    val TextSecondary = Color(0xFFB3C0D8)
    val TextMuted = Color(0xFF7B8AA8)
    val Outline = Color(0xFF2C3754)
    val OutlineVariant = Color(0xFF1E263D)

    // Light Alabaster-Iris Studio surfaces (exact index.css :root tokens)
    val LightCanvas = Color(0xFFF2F4FC)
    val LightSurface = Color(0xFFFFFFFF)
    val LightSurfaceLow = Color(0xFFF8F9FE)
    val LightSurfaceContainer = Color(0xFFEBEFFA)
    val LightSurfaceHigh = Color(0xFFE2E7F7)
    val LightInk = Color(0xFF0F1226)
    val LightInkMuted = Color(0xFF4C5373)
    val LightOutline = Color(0xFFD5DAF0)

    fun healthColor(percentage: Double, target: Double = 75.0, hasData: Boolean = true): Color = when {
        !hasData -> BrandCobaltSoft
        percentage >= target -> BrandCyanSoft
        percentage >= (target - 10.0).coerceAtLeast(50.0) -> WarningAmber
        else -> CriticalCrimson
    }

    fun healthPair(percentage: Double, target: Double = 75.0, hasData: Boolean = true): Pair<Color, Color> = when {
        !hasData -> BrandCobalt to BrandCyan
        percentage >= target -> BrandCobalt to BrandCyan
        percentage >= (target - 10.0).coerceAtLeast(50.0) -> WarningAmber to WarningOrange
        else -> CriticalCrimson to CriticalPink
    }

    fun gradeColor(grade: String): Color = when (grade.uppercase()) {
        "O" -> SafeEmerald
        "A+" -> BrandCobalt
        "A" -> BrandCobaltSoft
        "B+" -> BrandSky
        "B" -> WarningAmber
        "C" -> Color(0xFFFB923C)
        "P" -> WarningOrange
        "F" -> CriticalCrimson
        else -> TextMuted
    }
}

object SemesterGradients {
    val brandButton = Brush.linearGradient(
        listOf(SemesterColors.BrandIndigo, SemesterColors.BrandCobalt, SemesterColors.BrandCyan),
    )

    val brandLogo = Brush.linearGradient(
        listOf(SemesterColors.BrandIndigo, SemesterColors.BrandViolet, SemesterColors.BrandCyan),
    )

    fun brandText(isDark: Boolean): Brush = if (isDark) {
        Brush.linearGradient(
            listOf(Color(0xFFE0E7FF), SemesterColors.BrandCobaltSoft, SemesterColors.BrandCyanSoft, SemesterColors.CriticalCrimsonSoft),
        )
    } else {
        Brush.linearGradient(
            listOf(SemesterColors.BrandIndigo, SemesterColors.BrandViolet, Color(0xFF0891B2), Color(0xFFE11D48)),
        )
    }

    fun progressFill(isCritical: Boolean): Brush = if (isCritical) {
        Brush.horizontalGradient(listOf(SemesterColors.CriticalCrimson, SemesterColors.CriticalPink))
    } else {
        Brush.horizontalGradient(listOf(SemesterColors.BrandCobalt, SemesterColors.BrandCyanSoft))
    }
}

val LocalAmbientAccent = compositionLocalOf { SemesterColors.BrandCobaltSoft }
val LocalIsDarkTheme = compositionLocalOf { true }

/**
 * Desktop's exact display font (`Bricolage Grotesque` variable TTF) for headlines, CGPA, and big KPIs.
 */
@OptIn(ExperimentalTextApi::class)
val BricolageFontFamily = FontFamily(
    listOf(400, 500, 600, 700, 800).map { weight ->
        Font(
            resId = R.font.bricolage_variable,
            weight = FontWeight(weight),
            variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
        )
    },
)

/**
 * Desktop's exact UI body/label font (`Outfit` variable TTF).
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

private fun TextStyle.display(weight: FontWeight = FontWeight.ExtraBold, spacingSp: Float = -0.6f): TextStyle =
    copy(fontFamily = BricolageFontFamily, fontWeight = weight, letterSpacing = spacingSp.sp)

private fun TextStyle.outfit(weight: FontWeight? = null, spacingSp: Float? = null): TextStyle =
    copy(
        fontFamily = OutfitFontFamily,
        fontWeight = weight ?: fontWeight,
        letterSpacing = spacingSp?.sp ?: letterSpacing,
    )

val SemesterTypography = Typography(
    displayLarge = BaseTypography.displayLarge.display(FontWeight.ExtraBold, -1.2f),
    displayMedium = BaseTypography.displayMedium.display(FontWeight.ExtraBold, -0.9f),
    displaySmall = BaseTypography.displaySmall.display(FontWeight.ExtraBold, -0.5f),
    headlineLarge = BaseTypography.headlineLarge.display(FontWeight.ExtraBold, -0.4f),
    headlineMedium = BaseTypography.headlineMedium.display(FontWeight.Bold, -0.3f),
    headlineSmall = BaseTypography.headlineSmall.display(FontWeight.Bold, -0.2f),
    titleLarge = BaseTypography.titleLarge.display(FontWeight.Bold, -0.15f),
    titleMedium = BaseTypography.titleMedium.outfit(FontWeight.SemiBold),
    titleSmall = BaseTypography.titleSmall.outfit(FontWeight.SemiBold),
    bodyLarge = BaseTypography.bodyLarge.outfit(),
    bodyMedium = BaseTypography.bodyMedium.outfit(),
    bodySmall = BaseTypography.bodySmall.outfit(),
    labelLarge = BaseTypography.labelLarge.outfit(FontWeight.Bold),
    labelMedium = BaseTypography.labelMedium.outfit(FontWeight.SemiBold),
    labelSmall = BaseTypography.labelSmall.outfit(FontWeight.Medium),
)

val SemesterShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(30.dp),
)

private fun buildDarkScheme(accent: Color): ColorScheme = darkColorScheme(
    primary = accent,
    onPrimary = SemesterColors.PureBlack,
    primaryContainer = Color(0xFF1E213A),
    onPrimaryContainer = Color(0xFFE0E7FF),
    secondary = SemesterColors.BrandCyanSoft,
    onSecondary = Color(0xFF06131A),
    secondaryContainer = Color(0xFF132530),
    onSecondaryContainer = Color(0xFFCFFAFE),
    tertiary = SemesterColors.BrandVioletSoft,
    onTertiary = Color(0xFF0E0A1A),
    tertiaryContainer = Color(0xFF221C36),
    onTertiaryContainer = Color(0xFFEDE9FE),
    background = SemesterColors.PureBlack,
    onBackground = SemesterColors.TextPrimary,
    surface = SemesterColors.SurfaceContainer,
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
    error = SemesterColors.CriticalCrimsonSoft,
    onError = Color(0xFF18060B),
    errorContainer = SemesterColors.CriticalCrimsonContainer,
    onErrorContainer = Color(0xFFFECDD3),
)

private fun buildLightScheme(accent: Color): ColorScheme = lightColorScheme(
    primary = SemesterColors.BrandIndigo,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE0E7FF),
    onPrimaryContainer = Color(0xFF312E81),
    secondary = Color(0xFF0891B2),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE6F4F8),
    onSecondaryContainer = Color(0xFF164E63),
    tertiary = SemesterColors.BrandViolet,
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFEDE9FE),
    onTertiaryContainer = Color(0xFF4C1D95),
    background = SemesterColors.LightCanvas,
    onBackground = SemesterColors.LightInk,
    surface = SemesterColors.LightSurface,
    onSurface = SemesterColors.LightInk,
    surfaceVariant = SemesterColors.LightSurfaceHigh,
    onSurfaceVariant = SemesterColors.LightInkMuted,
    surfaceContainerLowest = SemesterColors.LightSurface,
    surfaceContainerLow = SemesterColors.LightSurfaceLow,
    surfaceContainer = SemesterColors.LightSurfaceContainer,
    surfaceContainerHigh = SemesterColors.LightSurfaceHigh,
    surfaceContainerHighest = Color(0xFFD5DCF2),
    outline = SemesterColors.LightOutline,
    outlineVariant = Color(0xFFC3CAE8),
    error = Color(0xFFE11D48),
    onError = Color.White,
    errorContainer = Color(0xFFFFE4E6),
    onErrorContainer = Color(0xFF881337),
)

@Composable
fun SemesterTheme(
    darkTheme: Boolean = true,
    ambientAccent: Color = SemesterColors.BrandCobaltSoft,
    content: @Composable () -> Unit,
) {
    // Instant atomic colorScheme swap — visual transition is handled cleanly at 120Hz by
    // ThemeLiquidTransitionOverlay while the screen is 100% covered at the wave crest.
    val scheme = remember(darkTheme, ambientAccent) {
        if (darkTheme) buildDarkScheme(ambientAccent) else buildLightScheme(ambientAccent)
    }

    CompositionLocalProvider(
        LocalAmbientAccent provides ambientAccent,
        LocalIsDarkTheme provides darkTheme,
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = SemesterTypography,
            shapes = SemesterShapes,
            content = content,
        )
    }
}
