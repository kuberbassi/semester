package com.semester.app.ui.components

import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.SpringSpec
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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.semester.app.haptics.HapticCrownEngine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sqrt

val CHROME_TAB_HEIGHT = 64.dp
private val MINI_ROW = 54.dp
private val ORB_GAP = 10.dp
private val DOCK_INSET = 6.dp
private val LENS_SHAPE = RoundedCornerShape(26.dp)

data class SemesterChromeTab(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon,
)

/**
 * OpenTune's ChromeScrollConnection: tucks the floating dock down into a compact
 * glass orb while scrolling down and springs it back open when scrolling up.
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
fun rememberChromeScroll(threshold: Dp = 44.dp): ChromeScrollConnection {
    val px = with(LocalDensity.current) { threshold.toPx() }
    return remember(px) { ChromeScrollConnection(px) }
}

private fun lerpDp(a: Dp, b: Dp, t: Float): Dp = a + (b - a) * t

private fun Modifier.placed(
    progress: () -> Float,
    x: (Float) -> Dp,
    bottom: (Float) -> Dp,
    w: (Float) -> Dp,
    h: (Float) -> Dp,
): Modifier = this.layout { measurable, constraints ->
    val t = progress()
    val pw = w(t).roundToPx().coerceAtLeast(0)
    val ph = h(t).roundToPx().coerceAtLeast(0)
    val placeable = measurable.measure(Constraints.fixed(pw, ph))
    layout(constraints.maxWidth, constraints.maxHeight) {
        placeable.place(x(t).roundToPx(), constraints.maxHeight - bottom(t).roundToPx() - ph)
    }
}

/**
 * OpenTune-inspired floating Liquid Glass bottom chrome for Semester:
 * - Stretching-lens glass pill with long-press finger scrub + haptic detents
 * - Smooth spring fold-to-orb on scroll down (iOS 26 / OpenTune Minimize motion)
 * - Companion right-hand slot for Semester's Digital Crown Radial Orb
 */
@Composable
fun SemesterBottomChrome(
    inline: Boolean,
    tabs: List<SemesterChromeTab>,
    selectedIndex: Int,
    haptics: HapticCrownEngine,
    onSelect: (Int) -> Unit,
    onExpand: () -> Unit,
    trailingOrb: @Composable (Modifier) -> Unit,
    modifier: Modifier = Modifier,
) {
    val foldProgress = animateFloatAsState(
        targetValue = if (inline) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.9f, stiffness = 300f, visibilityThreshold = 0.001f),
        label = "dockFold",
    )

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp),
    ) {
        val width = maxWidth
        val fullDock = width - CHROME_TAB_HEIGHT - ORB_GAP
        val rowHeight = { t: Float -> lerpDp(CHROME_TAB_HEIGHT, MINI_ROW, t) }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .layout { measurable, constraints ->
                    val h = rowHeight(foldProgress.value).roundToPx().coerceAtLeast(0)
                    val placeable = measurable.measure(constraints.copy(minHeight = h, maxHeight = h))
                    layout(placeable.width, h) { placeable.place(0, 0) }
                },
        ) {
            SemesterDockPill(
                tabs = tabs,
                selectedIndex = selectedIndex,
                fullWidth = fullDock,
                folded = inline,
                fold = { foldProgress.value },
                anchor = MINI_ROW / 2,
                haptics = haptics,
                onSelect = onSelect,
                onExpand = onExpand,
                modifier = Modifier.placed(
                    progress = { foldProgress.value },
                    x = { 0.dp },
                    bottom = { 0.dp },
                    w = { t -> lerpDp(fullDock, MINI_ROW, t) },
                    h = rowHeight,
                ),
            )

            trailingOrb(
                Modifier.placed(
                    progress = { foldProgress.value },
                    x = { t -> width - rowHeight(t) },
                    bottom = { 0.dp },
                    w = rowHeight,
                    h = rowHeight,
                ),
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
    fold: () -> Float,
    anchor: Dp,
    haptics: HapticCrownEngine,
    onSelect: (Int) -> Unit,
    onExpand: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val pill = CircleShape
    val slot = (fullWidth - DOCK_INSET * 2) / tabs.size.coerceAtLeast(1)
    val accent = MaterialTheme.colorScheme.primary

    var resting by remember { mutableIntStateOf(selectedIndex.coerceIn(0, (tabs.size - 1).coerceAtLeast(0))) }
    if (selectedIndex in tabs.indices) resting = selectedIndex

    var dragTarget by remember { mutableStateOf<Int?>(null) }
    var suppressTap by remember { mutableStateOf(false) }
    var fingerDown by remember { mutableStateOf(false) }
    var dragCentre by remember { mutableStateOf<Dp?>(null) }

    val currentSelected by rememberUpdatedState(selectedIndex)
    val currentOnSelect by rememberUpdatedState(onSelect)

    Box(
        modifier = modifier
            .liquidGlass(
                shape = pill,
                tint = Color(0xFF121216).copy(alpha = 0.82f),
                accentTint = accent,
                elevation = 20.dp,
                touchResponse = !folded,
                swell = false,
            )
            .pointerInput(tabs.size, folded, slot) {
                if (!folded && tabs.isNotEmpty()) {
                    val slotPx = slot.toPx()
                    val insetPx = DOCK_INSET.toPx()
                    val strayPx = 48.dp.toPx()

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
                            val engaged = withTimeoutOrNull(160L) {
                                var alive = true
                                while (alive) {
                                    val e = awaitPointerEvent(PointerEventPass.Initial)
                                    val ch = e.changes.firstOrNull { it.id == down.id }
                                    if (ch == null || !ch.pressed) {
                                        alive = false
                                    } else {
                                        lastX = ch.position.x
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
    ) {
        val (left, right) = rememberStretchingLens(
            index = dragTarget ?: resting,
            slot = slot,
            dragCentre = dragCentre,
        )

        val lensScale by animateFloatAsState(
            targetValue = if (fingerDown) 1.10f else 1f,
            animationSpec = spring(dampingRatio = 0.45f, stiffness = 400f),
            label = "lensScale",
        )

        Box(
            modifier = Modifier.layout { measurable, constraints ->
                val inset = DOCK_INSET.roundToPx()
                val w = (fullWidth - DOCK_INSET * 2).roundToPx().coerceAtLeast(0)
                val h = (constraints.maxHeight - inset * 2).coerceAtLeast(0)
                val placeable = measurable.measure(Constraints.fixed(w, h))
                val slide = (anchor - DOCK_INSET - slot * (resting + 0.5f)).toPx() * fold()
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.place(inset + slide.roundToInt(), inset)
                }
            },
        ) {
            // Physics-integrated stretching liquid lens behind the active tab
            Box(
                modifier = Modifier
                    .offset { IntOffset(left().roundToPx(), 0) }
                    .layout { measurable, constraints ->
                        val w = (right() - left()).roundToPx().coerceAtLeast(0)
                        val placeable = measurable.measure(constraints.copy(minWidth = w, maxWidth = w))
                        layout(placeable.width, placeable.height) { placeable.place(0, 0) }
                    }
                    .fillMaxHeight()
                    .graphicsLayer {
                        alpha = (1f - fold()).coerceIn(0f, 1f)
                        scaleX = lensScale
                        scaleY = lensScale
                    }
                    .clip(LENS_SHAPE)
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                accent.copy(alpha = 0.28f),
                                accent.copy(alpha = 0.14f),
                            ),
                        ),
                    )
                    .border(
                        width = 1.dp,
                        brush = Brush.verticalGradient(
                            listOf(
                                accent.copy(alpha = 0.52f),
                                accent.copy(alpha = 0.08f),
                            ),
                        ),
                        shape = LENS_SHAPE,
                    ),
            )

            Row(modifier = Modifier.fillMaxSize()) {
                tabs.forEachIndexed { i, tab ->
                    SemesterDockItem(
                        tab = tab,
                        selected = i == selectedIndex,
                        collapse = fold,
                        modifier = Modifier
                            .width(slot)
                            .fillMaxHeight()
                            .graphicsLayer {
                                if (i != resting) alpha = (1f - fold() * 1.6f).coerceIn(0f, 1f)
                            },
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

        if (folded) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clickable(onClickLabel = "Expand navigation") {
                        haptics.crownTick()
                        onExpand()
                    }
                    .semantics { role = Role.Button },
            )
        }
    }
}

@Composable
private fun SemesterDockItem(
    tab: SemesterChromeTab,
    selected: Boolean,
    collapse: () -> Float,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = when {
            pressed -> 0.90f
            selected -> 1.06f
            else -> 1f
        },
        animationSpec = spring(dampingRatio = 0.85f, stiffness = 320f),
        label = "dockItemScale",
    )
    val accent = MaterialTheme.colorScheme.primary
    val fg by animateColorAsState(
        targetValue = if (selected) accent else Color.White.copy(alpha = 0.72f),
        animationSpec = tween(280, easing = FastOutSlowInEasing),
        label = "dockItemFg",
    )

    Column(
        modifier = modifier
            .clip(LENS_SHAPE)
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
        Crossfade(
            targetState = selected,
            animationSpec = tween(240, easing = FastOutSlowInEasing),
            label = "dockIconCrossfade",
        ) { isSelected ->
            Icon(
                imageVector = if (isSelected) tab.selectedIcon else tab.icon,
                contentDescription = tab.label,
                tint = fg,
                modifier = Modifier
                    .size(24.dp)
                    .graphicsLayer {
                        val c = collapse()
                        val s = scale * (1f + 0.06f * c)
                        scaleX = s
                        scaleY = s
                        translationY = 8.dp.toPx() * c
                    },
            )
        }
        Text(
            text = tab.label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = fg,
            maxLines = 1,
            modifier = Modifier
                .padding(top = 2.dp)
                .graphicsLayer {
                    val c = collapse()
                    alpha = (1f - c * 2.5f).coerceIn(0f, 1f)
                    translationY = 5.dp.toPx() * c
                },
        )
    }
}

/**
 * Ported directly from OpenTune's `rememberStretchingLens`:
 * Integrates the leading & trailing edges of the lens on a frame-clock physics loop
 * with substeps. The leading edge shoots ahead while the trailing edge follows,
 * creating a fluid liquid stretch when tapping or scrubbing across tabs.
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

    val trackSpring = spring<Float>(dampingRatio = 1f, stiffness = 2800f)
    val rubberLead = spring<Float>(dampingRatio = 0.55f, stiffness = 380f)
    val rubberTrail = spring<Float>(dampingRatio = 0.45f, stiffness = 240f)
    val stretchTrack = spring<Float>(dampingRatio = 0.5f, stiffness = 520f)
    val stretchReturn = spring<Float>(dampingRatio = 0.4f, stiffness = 300f)
    val tapLead = spring<Float>(dampingRatio = 0.82f, stiffness = 520f)
    val tapTrail = spring<Float>(dampingRatio = 0.88f, stiffness = 190f)

    LaunchedEffect(Unit) {
        var lastFrame = 0L
        var prevCentreFrame: Float? = null
        var asleep = false

        while (true) {
            if (asleep) {
                val at = Triple(currentIndex, currentSlot, currentCentre)
                snapshotFlow { Triple(currentIndex, currentSlot, currentCentre) }.first { it != at }
                asleep = false
                lastFrame = 0L
            }
            withFrameNanos { frame ->
                val dt = if (lastFrame == 0L) 0.016f else ((frame - lastFrame) / 1e9f).coerceIn(0f, 0.032f)
                lastFrame = frame

                val slotV = currentSlot.value
                val centre = currentCentre

                val stretchTarget: Float
                val stretchSpring: SpringSpec<Float>
                if (centre != null) {
                    dragged = true
                    val speed = abs(centre.value - (prevCentreFrame ?: centre.value))
                    prevCentreFrame = centre.value
                    stretchTarget = (1f + speed / slotV.coerceAtLeast(1f) * 0.9f).coerceAtMost(1.45f)
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

                val steps = (dt / 0.0075f).toInt().coerceIn(1, 6)
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
                    abs(toLeft - leftPos) < 0.01f &&
                    abs(toRight - rightPos) < 0.01f &&
                    abs(leftVel) < 0.05f &&
                    abs(rightVel) < 0.05f
                ) {
                    leftPos = toLeft
                    rightPos = toRight
                    leftVel = 0f
                    rightVel = 0f
                    dragged = false
                    if (abs(stretchValue - 1f) < 0.001f && abs(stretchVel) < 0.01f) {
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
