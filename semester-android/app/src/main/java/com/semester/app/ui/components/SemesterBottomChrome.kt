package com.semester.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.abs
import kotlin.math.sqrt

val CHROME_TAB_HEIGHT = 64.dp
private val MINI_ROW = 52.dp
private val ORB_GAP = 10.dp
private val DOCK_INSET = 5.dp
private val LENS_CORNER = 26.dp

@Immutable
data class SemesterChromeTab(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon,
)

/**
 * OpenTune's ChromeScrollConnection: dynamically tucks the floating dock into a sleek
 * compact active-tab pill while scrolling down, and springs open on scroll up.
 */
class ChromeScrollConnection(private val thresholdPx: Float) : NestedScrollConnection {
    var inline by mutableStateOf(false)
        private set
    private var accumulated = 0f

    fun expand() {
        inline = false
        accumulated = 0f
    }

    override fun onPostScroll(
        consumed: Offset,
        available: Offset,
        source: NestedScrollSource,
    ): Offset {
        val dy = consumed.y
        if (dy == 0f) return Offset.Zero
        if ((accumulated > 0f && dy < 0f) || (accumulated < 0f && dy > 0f)) accumulated = 0f
        accumulated += dy
        if (accumulated <= -thresholdPx && !inline) {
            inline = true
            accumulated = 0f
        } else if (accumulated >= thresholdPx && inline) {
            inline = false
            accumulated = 0f
        }
        return Offset.Zero
    }
}

val LocalChromeScroll = staticCompositionLocalOf<ChromeScrollConnection?> { null }

@Composable
fun rememberChromeScroll(threshold: Dp = 52.dp): ChromeScrollConnection {
    val px = with(LocalDensity.current) { threshold.toPx() }
    return remember(px) { ChromeScrollConnection(px) }
}

/**
 * OpenTune-level Dynamic Floating Bottom Bar (Zero-Layout-Thrash 120Hz Edition):
 * - Draw-phase GPU stretching liquid lens (ZERO per-frame re-measurement during scrub/tap)
 * - Dynamic scroll-collapse into compact active-tab pill (shows active icon + label + expand cue)
 * - Long-press & horizontal scrub across tabs with crisp crown haptic detents
 * - Seamlessly pairs with the modded Bubble Hold Haptic Action Orb on the right
 */
@Composable
fun SemesterBottomChrome(
    inline: Boolean,
    tabs: List<SemesterChromeTab>,
    selectedIndex: Int,
    dimForBubbleMenu: Boolean,
    haptics: HapticCrownEngine,
    onSelect: (Int) -> Unit,
    onExpand: () -> Unit,
    trailingOrb: @Composable (Modifier) -> Unit,
    modifier: Modifier = Modifier,
) {
    val rowHeight by animateDpAsState(
        targetValue = if (inline) MINI_ROW else CHROME_TAB_HEIGHT,
        animationSpec = spring(dampingRatio = 0.86f, stiffness = 480f),
        label = "dockHeight",
    )
    val dockDimAlpha by animateFloatAsState(
        targetValue = if (dimForBubbleMenu) 0.28f else 1f,
        animationSpec = tween(160),
        label = "dockDimAlpha",
    )
    val dockDimScale by animateFloatAsState(
        targetValue = if (dimForBubbleMenu) 0.95f else 1f,
        animationSpec = spring(dampingRatio = 0.78f, stiffness = 520f),
        label = "dockDimScale",
    )

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp),
    ) {
        val totalWidth = maxWidth
        val fullDockWidth = totalWidth - CHROME_TAB_HEIGHT - ORB_GAP
        val compactPillWidth = 148.dp.coerceAtMost(fullDockWidth)

        val dockWidth by animateDpAsState(
            targetValue = if (inline) compactPillWidth else fullDockWidth,
            animationSpec = spring(dampingRatio = 0.84f, stiffness = 460f),
            label = "dockWidth",
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(CHROME_TAB_HEIGHT),
        ) {
            // Left: Dynamic OpenTune Liquid Dock (full 5-tab bar <-> compact active pill)
            SemesterDockPill(
                tabs = tabs,
                selectedIndex = selectedIndex,
                fullWidth = fullDockWidth,
                folded = inline,
                haptics = haptics,
                onSelect = onSelect,
                onExpand = onExpand,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .width(dockWidth)
                    .height(rowHeight)
                    .graphicsLayer {
                        alpha = dockDimAlpha
                        scaleX = dockDimScale
                        scaleY = dockDimScale
                    },
            )

            // Right: Context-Aware Bubble Hold Haptic Action Orb
            trailingOrb(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size(rowHeight),
            )
        }
    }
}

@Composable
private fun SemesterDockPill(
    tabs: List<SemesterChromeTab>,
    selectedIndex: Int,
    fullWidth: Dp,
    folded: Boolean,
    haptics: HapticCrownEngine,
    onSelect: (Int) -> Unit,
    onExpand: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val slot = (fullWidth - DOCK_INSET * 2) / tabs.size.coerceAtLeast(1)
    val isDark = LocalIsDarkTheme.current
    val pillBg = if (isDark) Color(0xEE131621) else Color(0xF5FFFFFF)
    val pillBorder = remember(isDark) {
        if (isDark) {
            Brush.linearGradient(
                listOf(
                    Color.White.copy(alpha = 0.22f),
                    Color.White.copy(alpha = 0.07f),
                    SemesterColors.BrandCyanSoft.copy(alpha = 0.22f),
                ),
            )
        } else {
            Brush.linearGradient(
                listOf(
                    SemesterColors.BrandIndigo.copy(alpha = 0.20f),
                    SemesterColors.LightOutline,
                    SemesterColors.BrandCyan.copy(alpha = 0.22f),
                ),
            )
        }
    }

    var resting by remember { mutableIntStateOf(selectedIndex.coerceIn(0, (tabs.size - 1).coerceAtLeast(0))) }
    if (selectedIndex in tabs.indices) resting = selectedIndex

    var dragTarget by remember { mutableStateOf<Int?>(null) }
    var suppressTap by remember { mutableStateOf(false) }
    var fingerDown by remember { mutableStateOf(false) }
    var dragCentre by remember { mutableStateOf<Dp?>(null) }

    val currentSelected by rememberUpdatedState(selectedIndex)
    val currentOnSelect by rememberUpdatedState(onSelect)

    val (leftDp, rightDp) = rememberStretchingLens(
        index = dragTarget ?: resting,
        slot = slot,
        dragCentre = dragCentre,
    )

    val lensBoost by animateFloatAsState(
        targetValue = if (fingerDown) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 460f),
        label = "lensBoost",
    )

    val lensFillBrush = remember(isDark) {
        Brush.horizontalGradient(
            listOf(
                SemesterColors.BrandIndigo.copy(alpha = if (isDark) 0.36f else 0.22f),
                SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.30f else 0.18f),
                SemesterColors.BrandCyan.copy(alpha = if (isDark) 0.26f else 0.16f),
            ),
        )
    }
    val lensRimBrush = remember(isDark) {
        Brush.horizontalGradient(
            listOf(
                SemesterColors.BrandCobaltSoft.copy(alpha = if (isDark) 0.65f else 0.48f),
                SemesterColors.BrandCyanSoft.copy(alpha = if (isDark) 0.55f else 0.42f),
            ),
        )
    }

    Box(
        modifier = modifier
            .shadow(
                elevation = if (isDark) 14.dp else 10.dp,
                shape = CircleShape,
                ambientColor = if (isDark) Color.Black.copy(alpha = 0.72f) else SemesterColors.BrandIndigo.copy(alpha = 0.16f),
                spotColor = if (isDark) SemesterColors.BrandIndigo.copy(alpha = 0.25f) else SemesterColors.BrandIndigo.copy(alpha = 0.20f),
            )
            .clip(CircleShape)
            .background(pillBg)
            .border(1.dp, pillBorder, CircleShape)
            .pointerInput(tabs.size, folded, slot) {
                if (!folded && tabs.isNotEmpty()) {
                    val slotPx = slot.toPx()
                    val insetPx = DOCK_INSET.toPx()
                    val strayPx = 52.dp.toPx()

                    fun slotAt(x: Float): Int =
                        ((x - insetPx) / slotPx).toInt().coerceIn(0, tabs.size - 1)

                    fun centreAt(x: Float): Dp {
                        val half = slotPx / 2f
                        return (x - insetPx).coerceIn(half, slotPx * tabs.size - half).toDp()
                    }

                    awaitEachGesture {
                        val down = awaitFirstDown(
                            requireUnconsumed = false,
                            pass = PointerEventPass.Initial,
                        )
                        suppressTap = false
                        try {
                            var lastX = down.position.x
                            val engaged = withTimeoutOrNull(145L) {
                                var alive = true
                                while (alive) {
                                    val e = awaitPointerEvent(PointerEventPass.Initial)
                                    val ch = e.changes.firstOrNull { it.id == down.id }
                                    if (ch == null || !ch.pressed) {
                                        alive = false
                                    } else {
                                        lastX = ch.position.x
                                        if (abs(lastX - down.position.x) > 16.dp.toPx()) {
                                            return@withTimeoutOrNull true
                                        }
                                    }
                                }
                                false
                            } ?: true

                            if (engaged) {
                                fingerDown = true
                                dragTarget = slotAt(lastX)
                                dragCentre = centreAt(lastX)
                                haptics.crownTick()
                                while (true) {
                                    val event = awaitPointerEvent(PointerEventPass.Initial)
                                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                                    if (!change.pressed) {
                                        change.consume()
                                        suppressTap = true
                                        val target = dragTarget
                                        val strayed = abs(change.position.y - down.position.y) > strayPx
                                        if (target != null && !strayed && target != currentSelected) {
                                            haptics.focusSnap()
                                            currentOnSelect(target)
                                        }
                                        break
                                    }
                                    change.consume()
                                    dragCentre = centreAt(change.position.x)
                                    val s = slotAt(change.position.x)
                                    if (s != dragTarget) {
                                        dragTarget = s
                                        haptics.crownTick()
                                    }
                                }
                            }
                        } finally {
                            dragTarget = null
                            fingerDown = false
                            dragCentre = null
                        }
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        if (folded) {
            // Compact OpenTune Dynamic Pill: Active Tab Icon + Label + Expand Cue
            val activeTab = tabs.getOrNull(resting) ?: tabs.first()
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .clickable(onClickLabel = "Expand navigation") {
                        haptics.crownTick()
                        onExpand()
                    }
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(30.dp)
                            .clip(CircleShape)
                            .background(SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.24f else 0.14f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = activeTab.selectedIcon,
                            contentDescription = activeTab.label,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Text(
                        text = activeTab.label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                    )
                }
                Icon(
                    imageVector = Icons.Rounded.UnfoldMore,
                    contentDescription = "Expand",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
            }
        } else {
            // Full 5-Tab Bar with 100% Draw-Phase Stretching Liquid Lens (ZERO layout re-measures!)
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(DOCK_INSET)
                    .drawBehind {
                        val lPx = leftDp().toPx()
                        val rPx = rightDp().toPx()
                        val wPx = (rPx - lPx).coerceAtLeast(0f)
                        val padY = if (lensBoost > 0.01f) -1.5.dp.toPx() * lensBoost else 0f
                        val hPx = (size.height - padY * 2f).coerceAtLeast(0f)
                        val cr = CornerRadius(LENS_CORNER.toPx(), LENS_CORNER.toPx())
                        if (wPx > 1f && hPx > 1f) {
                            drawRoundRect(
                                brush = lensFillBrush,
                                topLeft = Offset(lPx, padY),
                                size = Size(wPx, hPx),
                                cornerRadius = cr,
                            )
                            drawRoundRect(
                                brush = lensRimBrush,
                                topLeft = Offset(lPx, padY),
                                size = Size(wPx, hPx),
                                cornerRadius = cr,
                                style = Stroke(width = 1.dp.toPx()),
                            )
                        }
                    },
            ) {
                tabs.forEachIndexed { i, tab ->
                    val highlighted = (dragTarget ?: selectedIndex) == i
                    SemesterDockItem(
                        tab = tab,
                        selected = highlighted,
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                    ) {
                        if (suppressTap) {
                            suppressTap = false
                        } else {
                            if (i != selectedIndex) haptics.crownTick()
                            onSelect(i)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SemesterDockItem(
    tab: SemesterChromeTab,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = when {
            pressed -> 0.90f
            selected -> 1.05f
            else -> 1f
        },
        animationSpec = spring(dampingRatio = 0.75f, stiffness = 560f),
        label = "dockItemScale",
    )
    val accent = MaterialTheme.colorScheme.primary
    val inactiveFg = MaterialTheme.colorScheme.onSurfaceVariant
    val fg by animateColorAsState(
        targetValue = if (selected) accent else inactiveFg,
        animationSpec = tween(160, easing = FastOutSlowInEasing),
        label = "dockItemFg",
    )

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(LENS_CORNER))
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .semantics {
                role = Role.Tab
                this.selected = selected
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = if (selected) tab.selectedIcon else tab.icon,
            contentDescription = tab.label,
            tint = fg,
            modifier = Modifier
                .size(22.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                },
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = tab.label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = fg,
            maxLines = 1,
        )
    }
}

/**
 * Draw-Phase Physics Stretching Lens (inspired by OpenTune):
 * Sleeps completely at zero CPU when stationary; integrates substeps at 120Hz ONLY while sliding.
 */
@Composable
private fun rememberStretchingLens(
    index: Int,
    slot: Dp,
    dragCentre: Dp? = null,
): Pair<() -> Dp, () -> Dp> {
    val currentIndex by rememberUpdatedState(index)
    val currentSlot by rememberUpdatedState(slot)
    val currentCentre by rememberUpdatedState(dragCentre)

    var leftPos by remember { mutableFloatStateOf(slot.value * index) }
    var rightPos by remember { mutableFloatStateOf(slot.value * (index + 1)) }
    var leftVel by remember { mutableFloatStateOf(0f) }
    var rightVel by remember { mutableFloatStateOf(0f) }

    var dragged by remember { mutableStateOf(false) }
    var stretchValue by remember { mutableFloatStateOf(1f) }
    var stretchVel by remember { mutableFloatStateOf(0f) }

    val trackSpring = remember { spring<Float>(dampingRatio = 1f, stiffness = 2800f) }
    val rubberLead = remember { spring<Float>(dampingRatio = 0.62f, stiffness = 520f) }
    val rubberTrail = remember { spring<Float>(dampingRatio = 0.56f, stiffness = 320f) }
    val stretchTrack = remember { spring<Float>(dampingRatio = 0.55f, stiffness = 540f) }
    val stretchReturn = remember { spring<Float>(dampingRatio = 0.55f, stiffness = 420f) }
    val tapLead = remember { spring<Float>(dampingRatio = 0.84f, stiffness = 680f) }
    val tapTrail = remember { spring<Float>(dampingRatio = 0.88f, stiffness = 280f) }

    LaunchedEffect(Unit) {
        var lastFrame = 0L
        var prevCentreFrame: Float? = null
        var asleep = true

        // Snap cleanly to initial slot on first layout
        leftPos = currentSlot.value * currentIndex
        rightPos = currentSlot.value * (currentIndex + 1)

        while (true) {
            if (asleep) {
                val at = Triple(currentIndex, currentSlot, currentCentre)
                snapshotFlow { Triple(currentIndex, currentSlot, currentCentre) }.first { it != at }
                asleep = false
                lastFrame = 0L
            }
            withFrameNanos { frame ->
                val dt = if (lastFrame == 0L) 0.008f else ((frame - lastFrame) / 1e9f).coerceIn(0f, 0.032f)
                lastFrame = frame

                val slotV = currentSlot.value
                val centre = currentCentre

                val stretchTarget: Float
                val stretchSpring: SpringSpec<Float>
                if (centre != null) {
                    dragged = true
                    val speed = abs(centre.value - (prevCentreFrame ?: centre.value))
                    prevCentreFrame = centre.value
                    stretchTarget = (1f + speed / slotV.coerceAtLeast(1f) * 0.85f).coerceAtMost(1.38f)
                    stretchSpring = stretchTrack
                } else {
                    prevCentreFrame = null
                    stretchTarget = 1f
                    stretchSpring = stretchReturn
                }

                val toLeft: Float
                val toRight: Float
                val lead: SpringSpec<Float>
                val follow: SpringSpec<Float>
                if (centre != null) {
                    val half = slotV / 2f * stretchValue
                    toLeft = centre.value - half
                    toRight = centre.value + half
                    lead = trackSpring
                    follow = trackSpring
                } else {
                    toLeft = slotV * currentIndex
                    toRight = slotV * (currentIndex + 1)
                    lead = if (dragged) rubberLead else tapLead
                    follow = if (dragged) rubberTrail else tapTrail
                }

                val movingRight = toLeft > leftPos
                val lSpec = if (movingRight) follow else lead
                val rSpec = if (movingRight) lead else follow

                val steps = (dt / 0.0075f).toInt().coerceIn(1, 5)
                val h = dt / steps
                repeat(steps) {
                    val sAccel = stretchSpring.stiffness * (stretchTarget - stretchValue) -
                        2f * stretchSpring.dampingRatio * sqrt(stretchSpring.stiffness) * stretchVel
                    stretchVel += sAccel * h
                    stretchValue += stretchVel * h

                    val lAccel = lSpec.stiffness * (toLeft - leftPos) -
                        2f * lSpec.dampingRatio * sqrt(lSpec.stiffness) * leftVel
                    leftVel += lAccel * h
                    leftPos += leftVel * h

                    val rAccel = rSpec.stiffness * (toRight - rightPos) -
                        2f * rSpec.dampingRatio * sqrt(rSpec.stiffness) * rightVel
                    rightVel += rAccel * h
                    rightPos += rightVel * h
                }

                if (!leftPos.isFinite() || !rightPos.isFinite() || abs(leftPos) > 10000f || abs(rightPos) > 10000f) {
                    leftPos = toLeft
                    rightPos = toRight
                    leftVel = 0f
                    rightVel = 0f
                }

                if (centre == null &&
                    abs(toLeft - leftPos) < 0.05f &&
                    abs(toRight - rightPos) < 0.05f &&
                    abs(leftVel) < 0.2f &&
                    abs(rightVel) < 0.2f
                ) {
                    leftPos = toLeft
                    rightPos = toRight
                    leftVel = 0f
                    rightVel = 0f
                    dragged = false
                    if (abs(stretchValue - 1f) < 0.005f && abs(stretchVel) < 0.05f) {
                        stretchValue = 1f
                        stretchVel = 0f
                        asleep = true
                    }
                }
            }
        }
    }

    return ({ leftPos.dp } to { rightPos.dp })
}
