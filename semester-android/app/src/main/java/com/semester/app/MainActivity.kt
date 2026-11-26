package com.semester.app

import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoGraph
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.rounded.AutoGraph
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.RadialBubbleMenu
import com.semester.app.ui.components.SemesterBottomChrome
import com.semester.app.ui.components.SemesterChromeTab
import com.semester.app.ui.components.SemesterOpeningReveal
import com.semester.app.ui.components.SemesterOpeningState
import com.semester.app.ui.components.SemesterPageMotion
import com.semester.app.ui.components.TopEdgeFrost
import com.semester.app.ui.components.rememberChromeScroll
import com.semester.app.ui.screens.DashboardScreen
import com.semester.app.ui.screens.IpuResultsScreen
import com.semester.app.ui.screens.TimetableRadarScreen
import com.semester.app.ui.screens.WhatIfSimulatorScreen
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterTheme
import kotlinx.coroutines.launch
import uniffi.semester_core.Subject

class MainActivity : ComponentActivity() {

    private lateinit var haptics: HapticCrownEngine
    private lateinit var repo: CoreRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        haptics = HapticCrownEngine(this)
        repo = CoreRepository.getInstance(this)

        setContent {
            SemesterAppRoot(repo = repo, haptics = haptics)
        }
    }
}

@Composable
private fun SemesterAppRoot(
    repo: CoreRepository,
    haptics: HapticCrownEngine,
) {
    val scope = rememberCoroutineScope()
    val tabs = remember {
        listOf(
            SemesterChromeTab("dashboard", "Home", Icons.Outlined.Dashboard, Icons.Rounded.Dashboard),
            SemesterChromeTab("radar", "Radar", Icons.Outlined.Schedule, Icons.Rounded.Schedule),
            SemesterChromeTab("whatif", "What-If", Icons.Outlined.AutoGraph, Icons.Rounded.AutoGraph),
            SemesterChromeTab("results", "Results", Icons.Outlined.School, Icons.Rounded.School),
        )
    }

    var selectedTab by remember { mutableIntStateOf(0) }
    var previousTab by remember { mutableIntStateOf(0) }
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }
    var showAddDialog by remember { mutableStateOf(false) }
    var customAccent by remember { mutableStateOf<Color?>(null) }

    var showOpening by remember { mutableStateOf(!SemesterOpeningState.played) }
    var revealProgress by remember { mutableFloatStateOf(if (showOpening) 0f else 1f) }

    fun refreshSubjects() {
        scope.launch {
            subjects = repo.getSubjects()
        }
    }

    LaunchedEffect(Unit) {
        refreshSubjects()
    }

    val totalAttended = subjects.sumOf { it.attended.toInt() }
    val totalClasses = subjects.sumOf { it.total.toInt() }
    val overallPct = if (totalClasses > 0) (totalAttended.toDouble() / totalClasses) * 100.0 else 75.0
    val defaultAccent = SemesterColors.healthColor(overallPct, 75.0)
    val activeAccent = customAccent ?: defaultAccent

    val chromeScroll = rememberChromeScroll()

    fun navigateTo(index: Int) {
        if (index in tabs.indices) {
            previousTab = selectedTab
            selectedTab = index
            chromeScroll.expand()
        }
    }

    SemesterTheme(ambientAccent = activeAccent) {
        CompositionLocalProvider(LocalChromeScroll provides chromeScroll) {
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background,
            ) {
                Box(modifier = Modifier.fillMaxSize()) {
                    // Main app shell subtly zooms into place during the OpeningReveal dive
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                val s = 0.94f + 0.06f * revealProgress
                                scaleX = s
                                scaleY = s
                            },
                    ) {
                        AnimatedContent(
                            targetState = selectedTab,
                            transitionSpec = {
                                SemesterPageMotion.tabTransition(forward = targetState >= previousTab)
                            },
                            label = "SemesterTabHost",
                        ) { tabIndex ->
                            when (tabs[tabIndex].id) {
                                "dashboard" -> DashboardScreen(
                                    subjects = subjects,
                                    repo = repo,
                                    haptics = haptics,
                                    onRefresh = ::refreshSubjects,
                                    onAddSubjectClick = { showAddDialog = true },
                                    onSelectAccent = { customAccent = it },
                                )
                                "radar" -> TimetableRadarScreen(
                                    subjects = subjects,
                                    repo = repo,
                                    haptics = haptics,
                                    onAttendanceMarked = ::refreshSubjects,
                                )
                                "whatif" -> WhatIfSimulatorScreen(
                                    subjects = subjects,
                                    repo = repo,
                                    haptics = haptics,
                                )
                                "results" -> IpuResultsScreen(
                                    repo = repo,
                                    haptics = haptics,
                                )
                            }
                        }

                        // OpenTune's frosted status-bar edge fade
                        TopEdgeFrost(modifier = Modifier.align(Alignment.TopCenter))

                        // OpenTune's stretching-lens floating glass dock + Semester's Digital Crown Orb
                        SemesterBottomChrome(
                            inline = chromeScroll.inline,
                            tabs = tabs,
                            selectedIndex = selectedTab,
                            haptics = haptics,
                            onSelect = ::navigateTo,
                            onExpand = { chromeScroll.expand() },
                            trailingOrb = { orbModifier ->
                                RadialBubbleMenu(
                                    haptics = haptics,
                                    onQuickTap = { showAddDialog = true },
                                    onItemSelected = { selectedId ->
                                        if (selectedId == "add") {
                                            showAddDialog = true
                                        } else {
                                            val idx = tabs.indexOfFirst { it.id == selectedId }
                                            if (idx >= 0) navigateTo(idx)
                                        }
                                    },
                                    modifier = orbModifier,
                                )
                            },
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .windowInsetsPadding(WindowInsets.navigationBars)
                                .padding(bottom = 12.dp),
                        )
                    }

                    if (showOpening) {
                        SemesterOpeningReveal(
                            accent = activeAccent,
                            onDive = { revealProgress = it },
                            onDone = {
                                SemesterOpeningState.played = true
                                showOpening = false
                            },
                        )
                    }
                }
            }
        }

        if (showAddDialog) {
            AddSubjectDialog(
                onDismiss = { showAddDialog = false },
                onConfirm = { name, code, room ->
                    scope.launch {
                        repo.addSubject(
                            name = name.trim(),
                            code = code.trim(),
                            classroom = room.trim(),
                            semester = 3u,
                            subjectType = "theory",
                            credits = 4u,
                            target = 75u,
                        )
                        refreshSubjects()
                        haptics.attendanceSuccess()
                        showAddDialog = false
                    }
                },
            )
        }
    }
}

@Composable
private fun AddSubjectDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, code: String, room: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var room by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Add New Course",
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Course Name") },
                    placeholder = { Text("e.g. Operating Systems") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    label = { Text("Course Code") },
                    placeholder = { Text("e.g. CIC-205") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = room,
                    onValueChange = { room = it },
                    label = { Text("Room / Lab (optional)") },
                    placeholder = { Text("e.g. 301") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { if (name.isNotBlank()) onConfirm(name, code, room) },
                enabled = name.isNotBlank(),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = SemesterColors.SafeEmerald,
                    contentColor = Color.Black,
                ),
            ) {
                Text("Add Course", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        containerColor = Color(0xFF141418),
        shape = RoundedCornerShape(24.dp),
    )
}
