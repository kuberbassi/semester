package com.semester.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CloudSync
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import com.semester.app.core.DashboardSnapshot
import com.semester.app.core.ResultsAnalytics
import com.semester.app.core.WorkspaceRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.notifications.ScheduleAlertManager
import com.semester.app.sync.GoogleDriveSyncEngine
import com.semester.app.sync.SyncScheduler
import com.semester.app.ui.components.AiAssistantSheet
import com.semester.app.ui.components.BubbleHoldActionOrb
import com.semester.app.ui.components.BubbleHoldOverlay
import com.semester.app.ui.components.GradientButton
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.RubberSegment
import com.semester.app.ui.components.SegmentOption
import com.semester.app.ui.components.SemesterBottomChrome
import com.semester.app.ui.components.SemesterChromeTab
import com.semester.app.ui.components.SemesterLiquidSplash
import com.semester.app.ui.components.SemesterPageMotion
import com.semester.app.ui.components.SemesterPickerSheet
import com.semester.app.ui.components.SemesterSplashState
import com.semester.app.ui.components.ThemeLiquidTransitionOverlay
import com.semester.app.ui.components.TopEdgeFrost
import com.semester.app.ui.components.rememberBubbleMenuController
import com.semester.app.ui.components.rememberChromeScroll
import com.semester.app.ui.components.rememberThemeTransitionController
import com.semester.app.ui.screens.DashboardScreen
import com.semester.app.ui.screens.IpuResultsScreen
import com.semester.app.ui.screens.SettingsScreen
import com.semester.app.ui.screens.SettingsTab
import com.semester.app.ui.screens.TimetableRadarScreen
import com.semester.app.ui.screens.WhatIfSimulatorScreen
import com.semester.app.ui.screens.WorkspaceHubScreen
import com.semester.app.ui.screens.WorkspaceHubSection
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import com.semester.app.ui.theme.SemesterTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var haptics: HapticCrownEngine
    private lateinit var repo: WorkspaceRepository
    private lateinit var driveEngine: GoogleDriveSyncEngine
    private var lastResumePullMs: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        applyEdgeToEdge(isDark = true)
        super.onCreate(savedInstanceState)
        haptics = HapticCrownEngine(this)
        repo = WorkspaceRepository.getInstance(this)
        driveEngine = GoogleDriveSyncEngine.getInstance(this)

        repo.registerAutoSyncCallback {
            if (driveEngine.isConnected() && driveEngine.state.value.autoSyncEnabled) {
                val res = driveEngine.syncTwoWay(forcePush = false)
                if (res.isSuccess) {
                    SyncScheduler.cancelImmediatePush(this@MainActivity)
                }
            }
        }

        handleOAuthIntent(intent)

        setContent {
            SemesterAppRoot(
                repo = repo,
                driveEngine = driveEngine,
                haptics = haptics,
                onThemeChanged = ::applyEdgeToEdge,
            )
        }
    }

    private fun applyEdgeToEdge(isDark: Boolean) {
        val style = if (isDark) {
            SystemBarStyle.dark(AndroidColor.TRANSPARENT)
        } else {
            SystemBarStyle.light(AndroidColor.TRANSPARENT, AndroidColor.TRANSPARENT)
        }
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleOAuthIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            driveEngine.completePendingOAuthIfAny()
            val now = System.currentTimeMillis()
            if (driveEngine.isConnected() && driveEngine.state.value.autoSyncEnabled && (now - lastResumePullMs > 15_000L)) {
                lastResumePullMs = now
                driveEngine.syncTwoWay(forcePush = false)
            }
        }
    }

    override fun onStop() {
        super.onStop()
        lifecycleScope.launch {
            repo.checkpointWal()
        }
    }

    private fun handleOAuthIntent(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "com.semester.app" && uri.path == "/oauth2redirect") {
            lifecycleScope.launch {
                driveEngine.handleOAuthRedirect(uri)
            }
        }
    }
}

@Composable
private fun SemesterAppRoot(
    repo: WorkspaceRepository,
    driveEngine: GoogleDriveSyncEngine,
    haptics: HapticCrownEngine,
    onThemeChanged: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val dataVersion by repo.dataVersion.collectAsState()
    val driveState by driveEngine.state.collectAsState()

    val onboardingPrefs = remember(context) {
        context.getSharedPreferences("semester_onboarding_prefs", Context.MODE_PRIVATE)
    }
    var drivePromptSeen by remember {
        mutableStateOf(onboardingPrefs.getBoolean("drive_prompt_seen", false))
    }
    var notifPromptAsked by remember {
        mutableStateOf(onboardingPrefs.getBoolean("notif_perm_asked", false))
    }
    var showDriveOnboardingDialog by remember { mutableStateOf(false) }

    val startupNotifPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        notifPromptAsked = true
        onboardingPrefs.edit().putBoolean("notif_perm_asked", true).apply()
        if (granted) {
            ScheduleAlertManager.setEnabled(context, true)
        }
    }

    val tabs = remember {
        listOf(
            SemesterChromeTab("dashboard", "Home", Icons.Outlined.Dashboard, Icons.Rounded.Dashboard),
            SemesterChromeTab("radar", "Schedule", Icons.Outlined.Schedule, Icons.Rounded.Schedule),
            SemesterChromeTab("workspace", "Studio", Icons.Outlined.Layers, Icons.Rounded.Layers),
            SemesterChromeTab("whatif", "What-If", Icons.AutoMirrored.Outlined.TrendingUp, Icons.AutoMirrored.Rounded.TrendingUp),
            SemesterChromeTab("results", "Results", Icons.Outlined.School, Icons.Rounded.School),
        )
    }

    var selectedTab by remember { mutableIntStateOf(0) }
    val navBackStack = remember { mutableStateListOf<Int>() }
    var selectedSemester by remember { mutableIntStateOf(1) }
    var initializedProfile by remember { mutableStateOf(false) }
    var isDarkTheme by remember { mutableStateOf(true) }
    var snapshot by remember { mutableStateOf(DashboardSnapshot()) }
    var resultsSummary by remember { mutableStateOf(ResultsAnalytics()) }

    var workspaceSubSection by remember { mutableStateOf(WorkspaceHubSection.NOTES) }
    var radarInitialMode by remember { mutableStateOf("radar") }

    var showAddDialog by remember { mutableStateOf(false) }
    var showAiSheet by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var settingsInitialTab by remember { mutableStateOf(SettingsTab.PROFILE) }
    var showSemesterPicker by remember { mutableStateOf(false) }
    var showSplash by remember { mutableStateOf(!SemesterSplashState.played) }
    var customAccent by remember { mutableStateOf<Color?>(null) }

    fun markDrivePromptSeen() {
        drivePromptSeen = true
        showDriveOnboardingDialog = false
        onboardingPrefs.edit().putBoolean("drive_prompt_seen", true).apply()
    }

    LaunchedEffect(showSplash, initializedProfile, notifPromptAsked) {
        if (!showSplash && initializedProfile && !notifPromptAsked) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                !ScheduleAlertManager.hasNotificationPermission(context)
            ) {
                startupNotifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                notifPromptAsked = true
                onboardingPrefs.edit().putBoolean("notif_perm_asked", true).apply()
            }
        }
    }

    LaunchedEffect(showSplash, initializedProfile, driveState.connected, drivePromptSeen, notifPromptAsked) {
        if (!showSplash && initializedProfile && notifPromptAsked && !driveState.connected && !drivePromptSeen) {
            showDriveOnboardingDialog = true
        }
    }

    val themeTransition = rememberThemeTransitionController(scope, haptics)

    fun refreshDashboard(semOverride: Int? = null) {
        scope.launch {
            val targetSem = if (!initializedProfile && semOverride == null) {
                val prof = repo.getProfile()
                initializedProfile = true
                selectedSemester = prof.currentSemester
                isDarkTheme = prof.themeMode != "light"
                onThemeChanged(isDarkTheme)
                prof.currentSemester
            } else {
                semOverride ?: selectedSemester
            }
            snapshot = repo.getDashboard(targetSem)
            resultsSummary = runCatching { repo.getResultsAnalytics() }.getOrDefault(ResultsAnalytics())
        }
    }

    fun selectSemester(sem: Int) {
        if (sem == selectedSemester) return
        haptics.focusSnap()
        selectedSemester = sem
        scope.launch {
            repo.updateProfile(currentSemester = sem)
            snapshot = repo.getDashboard(sem)
        }
    }

    fun requestThemeChange(wantDark: Boolean) {
        themeTransition.trigger(
            wantDark = wantDark,
            currentDark = isDarkTheme,
            onCommitTheme = { committedDark ->
                isDarkTheme = committedDark
                onThemeChanged(committedDark)
                scope.launch {
                    repo.updateProfile(themeMode = if (committedDark) "dark" else "light")
                }
            },
        )
    }

    fun toggleTheme() = requestThemeChange(!isDarkTheme)

    LaunchedEffect(selectedSemester, dataVersion) {
        refreshDashboard()
    }

    val defaultAccent = SemesterColors.healthColor(
        snapshot.summary.overallPercentage,
        snapshot.summary.targetThreshold.toDouble(),
        hasData = snapshot.summary.totalClasses > 0,
    )
    val activeAccent = customAccent ?: defaultAccent
    val chromeScroll = rememberChromeScroll()
    val bubbleController = rememberBubbleMenuController()

    fun navigateTo(index: Int, pushHistory: Boolean = true) {
        if (index in tabs.indices) {
            if (pushHistory && index != selectedTab) {
                // Keep clean history (capped at 12 entries, no consecutive dupes)
                if (navBackStack.lastOrNull() != selectedTab) {
                    navBackStack.add(selectedTab)
                    if (navBackStack.size > 12) navBackStack.removeAt(0)
                }
            }
            selectedTab = index
            chromeScroll.expand()
        }
    }

    fun jumpToDestination(dest: String) {
        when (dest) {
            "practicals" -> {
                workspaceSubSection = WorkspaceHubSection.PRACTICALS
                navigateTo(2)
            }
            "courses" -> {
                workspaceSubSection = WorkspaceHubSection.COURSES
                navigateTo(2)
            }
            "notes" -> {
                workspaceSubSection = WorkspaceHubSection.NOTES
                navigateTo(2)
            }
            "calendar" -> {
                radarInitialMode = "calendar"
                navigateTo(1)
            }
            "radar" -> {
                radarInitialMode = "radar"
                navigateTo(1)
            }
            "whatif" -> navigateTo(3)
            "results" -> navigateTo(4)
            "add" -> showAddDialog = true
            "ai" -> showAiSheet = true
            "settings" -> {
                settingsInitialTab = SettingsTab.PROFILE
                showSettings = true
            }
        }
    }

    // Native Android Predictive Back Navigation:
    // Closes Settings -> pops previous page stack -> returns to Home -> exits only when already at root Home.
    BackHandler(enabled = showSettings || navBackStack.isNotEmpty() || selectedTab != 0) {
        haptics.softDismiss()
        when {
            showSettings -> showSettings = false
            navBackStack.isNotEmpty() -> {
                val prev = navBackStack.removeAt(navBackStack.lastIndex)
                navigateTo(prev, pushHistory = false)
            }
            selectedTab != 0 -> navigateTo(0, pushHistory = false)
        }
    }

    SemesterTheme(darkTheme = isDarkTheme, ambientAccent = activeAccent) {
        CompositionLocalProvider(LocalChromeScroll provides chromeScroll) {
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background,
            ) {
                Box(modifier = Modifier.fillMaxSize()) {
                    AnimatedContent(
                        targetState = selectedTab,
                        transitionSpec = { SemesterPageMotion.tabTransition(forward = targetState >= initialState) },
                        label = "SemesterTabHost",
                    ) { tabIndex ->
                        when (tabs[tabIndex].id) {
                            "dashboard" -> DashboardScreen(
                                snapshot = snapshot,
                                resultsSummary = resultsSummary,
                                selectedSemester = selectedSemester,
                                driveState = driveState,
                                repo = repo,
                                haptics = haptics,
                                onOpenSemesterPicker = { showSemesterPicker = true },
                                onToggleTheme = ::toggleTheme,
                                onRefresh = { refreshDashboard() },
                                onAddSubjectClick = { showAddDialog = true },
                                onOpenAiClick = { showAiSheet = true },
                                onOpenSettingsClick = {
                                    settingsInitialTab = SettingsTab.PROFILE
                                    showSettings = true
                                },
                                onJumpToDestination = ::jumpToDestination,
                                onSelectAccent = { customAccent = it },
                            )
                            "radar" -> TimetableRadarScreen(
                                semester = selectedSemester,
                                initialMode = radarInitialMode,
                                subjects = snapshot.subjects,
                                dataVersion = dataVersion,
                                repo = repo,
                                haptics = haptics,
                                onOpenSemesterPicker = { showSemesterPicker = true },
                                onAddSubjectClick = { showAddDialog = true },
                                onAttendanceMarked = { refreshDashboard() },
                            )
                            "workspace" -> WorkspaceHubScreen(
                                semester = selectedSemester,
                                initialSection = workspaceSubSection,
                                subjects = snapshot.subjects,
                                dataVersion = dataVersion,
                                repo = repo,
                                haptics = haptics,
                                onOpenSemesterPicker = { showSemesterPicker = true },
                                onWorkspaceUpdated = { refreshDashboard() },
                            )
                            "whatif" -> WhatIfSimulatorScreen(
                                semester = selectedSemester,
                                subjects = snapshot.subjects,
                                repo = repo,
                                haptics = haptics,
                                onOpenSemesterPicker = { showSemesterPicker = true },
                            )
                            "results" -> IpuResultsScreen(
                                semester = selectedSemester,
                                defaultEnrollment = snapshot.profile.enrollmentNumber,
                                dataVersion = dataVersion,
                                repo = repo,
                                haptics = haptics,
                                onOpenSemesterPicker = { showSemesterPicker = true },
                                onDataChanged = { refreshDashboard() },
                            )
                        }
                    }

                    TopEdgeFrost(modifier = Modifier.align(Alignment.TopCenter))

                    // Unclipped full-screen Bubble Hold Scrim + Tether + 5-Bubble Fan + Thumb-Clear HUD
                    BubbleHoldOverlay(controller = bubbleController)

                    // OpenTune Dynamic Floating Liquid Dock + 1-Tap Notes / Hold Bubble Wheel Orb
                    SemesterBottomChrome(
                        inline = chromeScroll.inline,
                        tabs = tabs,
                        selectedIndex = selectedTab,
                        dimForBubbleMenu = bubbleController.active,
                        haptics = haptics,
                        onSelect = { idx -> navigateTo(idx, pushHistory = true) },
                        onExpand = { chromeScroll.expand() },
                        trailingOrb = { orbModifier ->
                            BubbleHoldActionOrb(
                                controller = bubbleController,
                                haptics = haptics,
                                quickIcon = Icons.Rounded.CalendarMonth,
                                quickLabel = "Attendance Calendar",
                                onQuickTap = { jumpToDestination("calendar") },
                                onItemSelected = ::jumpToDestination,
                                modifier = orbModifier,
                            )
                        },
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .windowInsetsPadding(WindowInsets.navigationBars)
                            .padding(bottom = 12.dp),
                    )

                    AnimatedVisibility(
                        visible = showSettings,
                        enter = slideInVertically { it / 8 } + fadeIn(),
                        exit = slideOutVertically { it / 8 } + fadeOut(),
                    ) {
                        SettingsScreen(
                            profile = snapshot.profile,
                            summary = snapshot.summary,
                            selectedSemester = selectedSemester,
                            driveState = driveState,
                            repo = repo,
                            driveEngine = driveEngine,
                            haptics = haptics,
                            initialTab = settingsInitialTab,
                            onSetTheme = ::requestThemeChange,
                            onClose = {
                                haptics.softDismiss()
                                showSettings = false
                            },
                            onWorkspaceUpdated = { refreshDashboard() },
                        )
                    }

                    // Spam-protected Liquid Fill & Flush Theme Transition Overlay (above all tabs & Settings)
                    ThemeLiquidTransitionOverlay(controller = themeTransition)

                    // Cold-launch Animated Liquid Fill & Flush Loading Reveal (~760ms total)
                    if (showSplash) {
                        SemesterLiquidSplash(
                            isDark = isDarkTheme,
                            haptics = haptics,
                            onDone = { showSplash = false },
                        )
                    }
                }
            }
        }

        if (showSemesterPicker) {
            SemesterPickerSheet(
                selectedSemester = selectedSemester,
                onSelect = ::selectSemester,
                onDismiss = { showSemesterPicker = false },
            )
        }

        if (showAiSheet) {
            AiAssistantSheet(
                semester = selectedSemester,
                repo = repo,
                haptics = haptics,
                onDismiss = { showAiSheet = false },
            )
        }

        if (showDriveOnboardingDialog) {
            AlertDialog(
                onDismissRequest = ::markDrivePromptSeen,
                title = {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(52.dp)
                                .clip(CircleShape)
                                .background(SemesterColors.BrandCobalt.copy(alpha = 0.16f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CloudSync,
                                contentDescription = null,
                                tint = SemesterColors.BrandCobalt,
                                modifier = Modifier.size(26.dp),
                            )
                        }
                        Text(
                            text = "Set Up Google Drive Sync",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.ExtraBold,
                            textAlign = TextAlign.Center,
                        )
                    }
                },
                text = {
                    Text(
                        text = "Back up your attendance, timetable, and exam dates automatically — and sync smoothly with your Desktop app.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                },
                confirmButton = {
                    GradientButton(
                        text = "Open Sync Settings",
                        icon = Icons.Rounded.CloudSync,
                        onClick = {
                            haptics.focusSnap()
                            markDrivePromptSeen()
                            settingsInitialTab = SettingsTab.DATA
                            showSettings = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                },
                dismissButton = {
                    TextButton(
                        onClick = {
                            haptics.softDismiss()
                            markDrivePromptSeen()
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Maybe Later", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                containerColor = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(28.dp),
            )
        }

        if (showAddDialog) {
            AddSubjectDialog(
                semester = selectedSemester,
                defaultTarget = snapshot.profile.attendanceThreshold,
                haptics = haptics,
                onDismiss = { showAddDialog = false },
                onConfirm = { name, code, room, professor, targetSem, credits, categories ->
                    scope.launch {
                        repo.addSubject(
                            name = name.trim(),
                            code = code.trim(),
                            professor = professor.trim(),
                            classroom = room.trim(),
                            semester = targetSem,
                            categories = categories,
                            credits = credits,
                            target = snapshot.profile.attendanceThreshold,
                        )
                        if (targetSem != selectedSemester) {
                            selectSemester(targetSem)
                        } else {
                            refreshDashboard()
                        }
                        haptics.attendanceSuccess()
                        showAddDialog = false
                    }
                },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddSubjectDialog(
    semester: Int,
    defaultTarget: Int,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onConfirm: (name: String, code: String, room: String, professor: String, targetSem: Int, credits: Int, categories: List<String>) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var room by remember { mutableStateOf("") }
    var professor by remember { mutableStateOf("") }
    var chosenSem by remember(semester) { mutableIntStateOf(semester) }
    var creditsStr by remember { mutableStateOf("3") }
    var selectedCategories by remember { mutableStateOf(setOf("Theory")) }

    fun toggleCategory(cat: String) {
        haptics.crownTick()
        val next = if (cat in selectedCategories) {
            (selectedCategories - cat).ifEmpty { setOf(cat) }
        } else {
            selectedCategories + cat
        }
        selectedCategories = next
        // Desktop-identical smart credits auto-assignment
        val hasT = "Theory" in next
        val hasP = "Practical" in next
        creditsStr = when {
            hasT && !hasP -> "3"
            hasP && !hasT -> "1"
            hasT && hasP -> "4"
            else -> creditsStr
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .padding(bottom = 26.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column {
                Text(
                    text = "Add Subject",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "Create a course to track attendance, practicals & credits (Goal $defaultTarget%)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Subject Name") },
                placeholder = { Text("e.g. Data Structures") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            // Multi-select Categories (100% Desktop AddSubjectModal parity: Theory, Practical, Assignment)
            Text("Categories", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                listOf("Theory", "Practical", "Assignment").forEach { cat ->
                    val active = cat in selectedCategories
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(CircleShape)
                            .then(
                                if (active) Modifier.background(SemesterGradients.brandButton)
                                else Modifier
                                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f), CircleShape),
                            )
                            .clickable { toggleCategory(cat) }
                            .padding(vertical = 9.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = cat,
                            style = MaterialTheme.typography.labelMedium,
                            color = if (active) Color.White else MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            // Semester & Credits row (Desktop parity)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1.3f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Semester", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        (1..8).forEach { s ->
                            val active = chosenSem == s
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(9.dp))
                                    .then(
                                        if (active) Modifier.background(SemesterGradients.brandButton)
                                        else Modifier
                                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.45f), RoundedCornerShape(9.dp)),
                                    )
                                    .clickable {
                                        haptics.crownTick()
                                        chosenSem = s
                                    }
                                    .padding(vertical = 7.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "$s",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (active) Color.White else MaterialTheme.colorScheme.onSurface,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }
                OutlinedTextField(
                    value = creditsStr,
                    onValueChange = { creditsStr = it.filter(Char::isDigit).take(2) },
                    label = { Text("Credits") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.weight(0.7f),
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    label = { Text("Code") },
                    placeholder = { Text("CIC-209") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = room,
                    onValueChange = { room = it },
                    label = { Text("Room / Lab") },
                    placeholder = { Text("304") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }

            OutlinedTextField(
                value = professor,
                onValueChange = { professor = it },
                label = { Text("Professor (optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(0.7f),
                ) {
                    Text("Cancel")
                }
                GradientButton(
                    text = "Create Subject",
                    enabled = name.isNotBlank(),
                    onClick = {
                        if (name.isNotBlank()) {
                            onConfirm(
                                name,
                                code,
                                room,
                                professor,
                                chosenSem,
                                (creditsStr.toIntOrNull() ?: 3).coerceIn(0, 10),
                                selectedCategories.toList(),
                            )
                        }
                    },
                    modifier = Modifier.weight(1.3f),
                )
            }
        }
    }
}
