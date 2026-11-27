package com.semester.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.ResultSubjectEntry
import com.semester.app.core.SemesterResultRecord
import com.semester.app.ui.theme.SemesterColors
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Native 120Hz Compose Charts matching Desktop `ResultsDashboard.tsx` 1:1:
 * 1. Score Breakdown Bar Chart (Ranked vs Paper Order toggle — scales cleanly to 20+ papers!)
 * 2. Component Distribution Chart (Internal vs External stacked bars + split KPI)
 * 3. SGPA & Cumulative CGPA Trajectory Curve (Canvas line + glowing area fill)
 * 4. Official GGSIPU Grade Distribution Bars (`O`, `A+`, `A`, `B+`, `B`, `C`, `P`, `F`)
 */
@Composable
fun ScoreBreakdownChartCard(
    subjects: List<ResultSubjectEntry>,
    modifier: Modifier = Modifier,
) {
    var sortMode by remember { mutableStateOf("ranked") }
    val graded = remember(subjects, sortMode) {
        val list = subjects.filter { !it.isPending && it.total > 0 }
        if (sortMode == "ranked") list.sortedByDescending { it.percentage } else list
    }
    if (graded.isEmpty()) return

    Box(
        modifier = modifier
            .fillMaxWidth()
            .liquidGlass(shape = RoundedCornerShape(24.dp), elevation = 8.dp, touchResponse = false)
            .padding(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Score Breakdown", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    Text("Percentage per paper (${graded.size} graded)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                RubberSegment(
                    options = listOf(
                        SegmentOption("ranked", "Ranked"),
                        SegmentOption("order", "Order"),
                    ),
                    selected = sortMode,
                    onSelect = { sortMode = it },
                )
            }

            graded.forEach { sub ->
                val pct = sub.percentage.coerceIn(0.0, 100.0)
                val barColor = SemesterColors.gradeColor(sub.grade)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "${sub.code.ifBlank { "PAPER" }} · ${sub.name}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "${pct.roundToInt()}% (${sub.grade})",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.ExtraBold,
                            color = barColor,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth((pct / 100.0).toFloat())
                                .clip(CircleShape)
                                .background(Brush.horizontalGradient(listOf(barColor.copy(alpha = 0.72f), barColor))),
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ComponentDistributionCard(
    subjects: List<ResultSubjectEntry>,
    modifier: Modifier = Modifier,
) {
    val graded = remember(subjects) { subjects.filter { !it.isPending && (it.internalVal + it.externalVal) > 0 } }
    if (graded.isEmpty()) return

    val sumInt = graded.sumOf { it.internalVal }
    val sumExt = graded.sumOf { it.externalVal }
    val grand = (sumInt + sumExt).coerceAtLeast(1.0)
    val intPct = ((sumInt / grand) * 100.0).roundToInt()
    val extPct = 100 - intPct

    Box(
        modifier = modifier
            .fillMaxWidth()
            .liquidGlass(shape = RoundedCornerShape(24.dp), elevation = 8.dp, touchResponse = false)
            .padding(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Component Distribution", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    Text("Internal vs External marks share", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LegendDot("Int $intPct%", SemesterColors.BrandCobaltSoft)
                    LegendDot("Ext $extPct%", SemesterColors.BrandCyanSoft)
                }
            }

            graded.take(14).forEach { sub ->
                val tot = (sub.internalVal + sub.externalVal).coerceAtLeast(1.0)
                val iFrac = (sub.internalVal / tot).toFloat().coerceIn(0f, 1f)
                val eFrac = (sub.externalVal / tot).toFloat().coerceIn(0f, 1f)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = sub.code.ifBlank { sub.name.take(6) },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.width(52.dp),
                        maxLines = 1,
                    )
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .height(9.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)),
                    ) {
                        if (iFrac > 0f) {
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .weight(iFrac.coerceAtLeast(0.01f))
                                    .background(SemesterColors.BrandCobaltSoft),
                            )
                        }
                        if (eFrac > 0f) {
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .weight(eFrac.coerceAtLeast(0.01f))
                                    .background(SemesterColors.BrandCyanSoft),
                            )
                        }
                    }
                    Text(
                        text = "${sub.internalVal.roundToInt()}+${sub.externalVal.roundToInt()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.width(46.dp),
                    )
                }
            }
        }
    }
}

@Composable
fun SgpaTrajectoryCard(
    semesters: List<SemesterResultRecord>,
    modifier: Modifier = Modifier,
) {
    if (semesters.size < 2) return
    val delta = semesters.last().sgpa - semesters[semesters.size - 2].sgpa
    val deltaText = if (delta >= 0) "+${String.format(Locale.US, "%.2f", delta)}" else String.format(Locale.US, "%.2f", delta)
    val deltaColor = if (delta >= 0) SemesterColors.SafeEmerald else SemesterColors.CriticalCrimsonSoft

    Box(
        modifier = modifier
            .fillMaxWidth()
            .liquidGlass(shape = RoundedCornerShape(24.dp), elevation = 8.dp, touchResponse = false)
            .padding(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("SGPA & CGPA Trajectory", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    Text("Semester-over-semester performance curve", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(deltaColor.copy(alpha = 0.16f))
                        .border(1.dp, deltaColor.copy(alpha = 0.35f), CircleShape)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text(deltaText, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.ExtraBold, color = deltaColor)
                }
            }

            val gridLineColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(140.dp),
            ) {
                val padX = 18.dp.toPx()
                val padY = 16.dp.toPx()
                val plotW = (size.width - padX * 2).coerceAtLeast(1f)
                val plotH = (size.height - padY * 2).coerceAtLeast(1f)
                val minY = 5.0f
                val maxY = 10.0f

                // Subtle horizontal reference grid lines (6, 8, 10)
                listOf(6f, 8f, 10f).forEach { v ->
                    val y = padY + plotH * (1f - ((v - minY) / (maxY - minY)))
                    drawLine(gridLineColor, Offset(padX, y), Offset(size.width - padX, y), strokeWidth = 1.dp.toPx())
                }

                val pts = semesters.mapIndexed { idx, s ->
                    val x = padX + (idx.toFloat() / (semesters.size - 1).coerceAtLeast(1)) * plotW
                    val norm = ((s.sgpa.toFloat().coerceIn(minY, maxY) - minY) / (maxY - minY))
                    val y = padY + plotH * (1f - norm)
                    Offset(x, y)
                }

                // Glowing area gradient under SGPA curve
                val area = Path().apply {
                    moveTo(pts.first().x, size.height - padY)
                    pts.forEach { lineTo(it.x, it.y) }
                    lineTo(pts.last().x, size.height - padY)
                    close()
                }
                drawPath(
                    path = area,
                    brush = Brush.verticalGradient(
                        listOf(SemesterColors.BrandCobalt.copy(alpha = 0.30f), Color.Transparent),
                        startY = padY,
                        endY = size.height - padY,
                    ),
                )

                val line = Path().apply {
                    moveTo(pts.first().x, pts.first().y)
                    pts.drop(1).forEach { lineTo(it.x, it.y) }
                }
                drawPath(
                    path = line,
                    brush = Brush.horizontalGradient(listOf(SemesterColors.BrandCobaltSoft, SemesterColors.BrandCyanSoft)),
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
                )

                pts.forEach { pt ->
                    drawCircle(SemesterColors.BrandCyanSoft, radius = 5.5.dp.toPx(), center = pt)
                    drawCircle(Color.White, radius = 2.5.dp.toPx(), center = pt)
                }
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                semesters.forEach { s ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("S${s.semester}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(String.format(Locale.US, "%.2f", s.sgpa), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }
    }
}

@Composable
fun GradeDistributionCard(
    gradeDistribution: Map<String, Int>,
    modifier: Modifier = Modifier,
) {
    val ordered = listOf("O", "A+", "A", "B+", "B", "C", "P", "F")
        .mapNotNull { g -> gradeDistribution[g]?.takeIf { it > 0 }?.let { g to it } }
    if (ordered.isEmpty()) return
    val maxCount = ordered.maxOf { it.second }.coerceAtLeast(1)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .liquidGlass(shape = RoundedCornerShape(24.dp), elevation = 8.dp, touchResponse = false)
            .padding(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Grade Distribution", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                ordered.forEach { (grade, count) ->
                    val color = SemesterColors.gradeColor(grade)
                    val frac = (count.toFloat() / maxCount.toFloat()).coerceIn(0.18f, 1f)
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text("$count", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = color)
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height((72 * frac).dp)
                                .clip(RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp, bottomStart = 4.dp, bottomEnd = 4.dp))
                                .background(Brush.verticalGradient(listOf(color, color.copy(alpha = 0.45f)))),
                        )
                        Text(grade, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }
    }
}

@Composable
private fun LegendDot(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
    }
}
