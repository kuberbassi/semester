package com.semester.app.ui.screens

import android.Manifest
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.CloudSync
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.Upload
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.CloudBackupItem
import com.semester.app.core.DashboardSummary
import com.semester.app.core.DriveSyncState
import com.semester.app.core.SystemLogEntry
import com.semester.app.core.WorkspaceProfile
import com.semester.app.core.WorkspaceRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.network.AiProvider
import com.semester.app.notifications.ScheduleAlertManager
import com.semester.app.sync.GoogleDriveSyncEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.DangerPillButton
import com.semester.app.ui.components.GlassIconButton
import com.semester.app.ui.components.GlassSecondaryButton
import com.semester.app.ui.components.GradientButton
import com.semester.app.ui.components.RubberSegment
import com.semester.app.ui.components.SegmentOption
import com.semester.app.ui.components.UserAvatarView
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.liquidHeroBanner
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.min
import kotlin.math.roundToInt

enum class SettingsTab(val label: String) {
    PROFILE("Profile"),
    DATA("Sync"),
    AI("AI Keys"),
    ACTIVITY("Activity"),
}

@Composable
fun SettingsScreen(
    profile: WorkspaceProfile,
    summary: DashboardSummary,
    selectedSemester: Int,
    driveState: DriveSyncState,
    repo: WorkspaceRepository,
    driveEngine: GoogleDriveSyncEngine,
    haptics: HapticCrownEngine,
    initialTab: SettingsTab = SettingsTab.PROFILE,
    onSetTheme: (Boolean) -> Unit,
    onClose: () -> Unit,
    onWorkspaceUpdated: () -> Unit,
) {
    val context = LocalContext.current
    val isDark = LocalIsDarkTheme.current
    val scope = rememberCoroutineScope()

    var activeTab by remember(initialTab) { mutableStateOf(initialTab) }

    var name by remember(profile.id, profile.name) { mutableStateOf(profile.name) }
    var enrollment by remember(profile.id, profile.enrollmentNumber) { mutableStateOf(profile.enrollmentNumber) }
    var college by remember(profile.id, profile.college) { mutableStateOf(profile.college) }
    var course by remember(profile.id, profile.course) { mutableStateOf(profile.course) }
    var branch by remember(profile.id, profile.branch) { mutableStateOf(profile.branch) }
    var batch by remember(profile.id, profile.batch) { mutableStateOf(profile.batch) }
    var picture by remember(profile.id, profile.picture) { mutableStateOf(profile.picture) }
    var threshold by remember(profile.id, profile.attendanceThreshold) { mutableFloatStateOf(profile.attendanceThreshold.toFloat()) }
    var warningThreshold by remember(profile.id, profile.warningThreshold) { mutableFloatStateOf(profile.warningThreshold.toFloat()) }
    var lastThresholdTick by remember { mutableIntStateOf(profile.attendanceThreshold) }

    var aiProvider by remember { mutableStateOf(repo.getSelectedAiProvider()) }
    var apiKeyDraft by remember(aiProvider) { mutableStateOf(repo.getByokApiKey(aiProvider)) }

    var cloudBackups by remember { mutableStateOf<List<CloudBackupItem>>(emptyList()) }
    var systemLogs by remember { mutableStateOf<List<SystemLogEntry>>(emptyList()) }
    var pendingImportJson by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var showWipeConfirm by remember { mutableStateOf(false) }

    var scheduleAlertsEnabled by remember { mutableStateOf(ScheduleAlertManager.isEnabled(context)) }
    var scheduleLeadMinutes by remember { mutableIntStateOf(ScheduleAlertManager.getLeadMinutes(context)) }

    val notifPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            scheduleAlertsEnabled = true
            ScheduleAlertManager.setEnabled(context, true)
            statusMessage = "Class & exam alerts enabled."
            haptics.attendanceSuccess()
        } else {
            statusMessage = "Notification permission denied — enable it in Android settings for schedule & exam alerts."
        }
    }

    // Profile Photo (PFP) Picker — center-crops & resizes to crisp 256x256 JPEG data URL synced across devices
    val pfpPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val decoded = context.contentResolver.openInputStream(uri)?.use { stream ->
                        BitmapFactory.decodeStream(stream)
                    } ?: error("Could not read image")
                    val side = min(decoded.width, decoded.height)
                    val cropX = (decoded.width - side) / 2
                    val cropY = (decoded.height - side) / 2
                    val square = Bitmap.createBitmap(decoded, cropX, cropY, side, side)
                    val scaled = Bitmap.createScaledBitmap(square, 256, 256, true)
                    val baos = ByteArrayOutputStream()
                    scaled.compress(Bitmap.CompressFormat.JPEG, 82, baos)
                    "data:image/jpeg;base64,${Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)}"
                }
            }.onSuccess { dataUrl ->
                picture = dataUrl
                repo.updateProfile(picture = dataUrl)
                haptics.attendanceSuccess()
                statusMessage = "Profile photo updated and synced."
                onWorkspaceUpdated()
            }.onFailure {
                statusMessage = "Could not update photo: ${it.message}"
            }
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                val bundle = repo.exportSyncSnapshot()
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(uri)?.use { out ->
                        out.write(bundle.payloadJson.toByteArray(Charsets.UTF_8))
                    }
                }
            }.onSuccess {
                statusMessage = "Full workspace backup exported cleanly."
                haptics.attendanceSuccess()
            }.onFailure {
                statusMessage = "Export failed: ${it.message}"
            }
        }
    }

    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }.orEmpty()
                }
            }.onSuccess { raw ->
                if (raw.isNotBlank()) pendingImportJson = raw
                else statusMessage = "Selected file is empty."
            }.onFailure {
                statusMessage = "Could not read file: ${it.message}"
            }
        }
    }

    LaunchedEffect(driveState.connected, activeTab) {
        if (driveState.connected && activeTab == SettingsTab.DATA) {
            driveEngine.listCloudBackups().onSuccess { cloudBackups = it }
        }
        if (activeTab == SettingsTab.ACTIVITY) {
            systemLogs = repo.getSystemLogs(80)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        AmbientTopGlow(
            color = SemesterColors.BrandCobalt,
            peakAlpha = 0.20f,
            height = 280.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 84.dp),
        ) {
            // Top Bar (single clean Back orb + title — no duplicate theme button in header!)
            item(key = "settings_header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    GlassIconButton(
                        icon = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        size = 40.dp,
                        onClick = { onClose() },
                    )
                    Column {
                        Text("PREFERENCES & SYNC", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.1.sp)
                        Text("Settings", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }

            // Desktop-exact Profile Hero Card with Synced PFP Photo Picker & Live Attendance Summary
            item(key = "profile_hero") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 4.dp)
                        .liquidHeroBanner(shape = RoundedCornerShape(24.dp))
                        .padding(16.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Box(
                            modifier = Modifier
                                .size(62.dp)
                                .clickable {
                                    haptics.crownTick()
                                    pfpPicker.launch("image/*")
                                },
                        ) {
                            UserAvatarView(
                                picture = picture,
                                name = name.ifBlank { profile.name },
                                size = 60.dp,
                                cornerRadius = 18.dp,
                            )
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .size(22.dp)
                                    .clip(CircleShape)
                                    .background(SemesterGradients.brandButton)
                                    .border(1.5.dp, MaterialTheme.colorScheme.surface, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.CameraAlt,
                                    contentDescription = "Change Profile Photo",
                                    tint = Color.White,
                                    modifier = Modifier.size(12.dp),
                                )
                            }
                        }

                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = profile.name,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = buildString {
                                    append("Semester $selectedSemester")
                                    if (profile.enrollmentNumber.isNotBlank()) append(" • ${profile.enrollmentNumber}")
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = buildString {
                                    append("${String.format(Locale.US, "%.1f", summary.overallPercentage)}% attendance")
                                    if (driveState.connected) append(" • Cloud Synced")
                                    else append(" • Tap photo to update")
                                },
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }

            // Signature 4-Tab RubberSegment Bar (matches Desktop 1:1 with zero obsolete Sessions tab)
            item(key = "settings_tabs") {
                Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp)) {
                    RubberSegment(
                        options = SettingsTab.entries.map { SegmentOption(it, it.label) },
                        selected = activeTab,
                        onSelect = { haptics.focusSnap(); activeTab = it },
                        fillWidth = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            statusMessage?.let { msg ->
                item(key = "settings_status") {
                    Surface(
                        color = SemesterColors.SafeEmerald.copy(alpha = 0.16f),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 6.dp),
                    ) {
                        Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(14.dp))
                    }
                }
            }

            when (activeTab) {
                SettingsTab.PROFILE -> {
                    item(key = "tab_profile") {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 6.dp)
                                .liquidGlass(shape = RoundedCornerShape(24.dp))
                                .padding(18.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("Appearance", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                                RubberSegment(
                                    options = listOf(
                                        SegmentOption(true, "Obsidian Dark", icon = Icons.Rounded.DarkMode),
                                        SegmentOption(false, "Studio Light", icon = Icons.Rounded.LightMode),
                                    ),
                                    selected = isDark,
                                    onSelect = { wantDark ->
                                        if (wantDark != isDark) {
                                            onSetTheme(wantDark)
                                        }
                                    },
                                    fillWidth = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )

                                // Clean Schedule-Only Period Alerts (strictly timetable classes, zero attendance nagging)
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Row(
                                        modifier = Modifier.weight(1f),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.NotificationsActive,
                                            contentDescription = null,
                                            tint = if (scheduleAlertsEnabled) SemesterColors.BrandCobalt else MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(20.dp),
                                        )
                                        Column {
                                            Text(
                                                text = "Class Schedule Alerts",
                                                style = MaterialTheme.typography.titleSmall,
                                                color = MaterialTheme.colorScheme.onSurface,
                                                fontWeight = FontWeight.Bold,
                                            )
                                            Text(
                                                text = "Clean alerts before scheduled periods & labs",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                    Switch(
                                        checked = scheduleAlertsEnabled,
                                        onCheckedChange = { wantEnable ->
                                            haptics.focusSnap()
                                            if (wantEnable && !ScheduleAlertManager.hasNotificationPermission(context) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                                notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                            } else {
                                                scheduleAlertsEnabled = wantEnable
                                                ScheduleAlertManager.setEnabled(context, wantEnable)
                                                statusMessage = if (wantEnable) "Class & exam alerts enabled." else "Class schedule alerts paused."
                                            }
                                        },
                                    )
                                }

                                if (scheduleAlertsEnabled) {
                                    RubberSegment(
                                        options = listOf(
                                            SegmentOption(5, "5 min before"),
                                            SegmentOption(10, "10 min before"),
                                            SegmentOption(15, "15 min before"),
                                        ),
                                        selected = when {
                                            scheduleLeadMinutes >= 15 -> 15
                                            scheduleLeadMinutes >= 10 -> 10
                                            else -> 5
                                        },
                                        onSelect = { mins ->
                                            haptics.crownTick()
                                            scheduleLeadMinutes = mins
                                            ScheduleAlertManager.setLeadMinutes(context, mins)
                                            statusMessage = "Class reminders set to $mins min before period."
                                        },
                                        fillWidth = true,
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }

                                Text("Academic Profile", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Full Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                OutlinedTextField(value = enrollment, onValueChange = { enrollment = it }, label = { Text("IPU Enrollment Number") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                OutlinedTextField(value = college, onValueChange = { college = it }, label = { Text("College / Institute") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(value = course, onValueChange = { course = it }, label = { Text("Course") }, singleLine = true, modifier = Modifier.weight(1f))
                                    OutlinedTextField(value = branch, onValueChange = { branch = it }, label = { Text("Branch") }, singleLine = true, modifier = Modifier.weight(1f))
                                }
                                OutlinedTextField(value = batch, onValueChange = { batch = it }, label = { Text("Batch (e.g. 2025-29)") }, singleLine = true, modifier = Modifier.fillMaxWidth())

                                if (picture.isNotBlank()) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        GlassSecondaryButton(
                                            text = "Change Photo",
                                            icon = Icons.Rounded.CameraAlt,
                                            onClick = {
                                                haptics.crownTick()
                                                pfpPicker.launch("image/*")
                                            },
                                            modifier = Modifier.weight(1f),
                                        )
                                        DangerPillButton(
                                            text = "Remove Photo",
                                            onClick = {
                                                scope.launch {
                                                    picture = ""
                                                    repo.updateProfile(picture = "")
                                                    haptics.softDismiss()
                                                    statusMessage = "Profile photo removed."
                                                    onWorkspaceUpdated()
                                                }
                                            },
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }

                                Text("Attendance Target: ${threshold.roundToInt()}%", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                                Slider(
                                    value = threshold,
                                    onValueChange = {
                                        val r = it.roundToInt()
                                        if (r != lastThresholdTick) {
                                            haptics.crownTick()
                                            lastThresholdTick = r
                                        }
                                        threshold = it
                                        if (warningThreshold < it) warningThreshold = (it + 1f).coerceAtMost(98f)
                                    },
                                    valueRange = 50f..95f,
                                    steps = 8,
                                    colors = SliderDefaults.colors(thumbColor = SemesterColors.BrandCyan, activeTrackColor = SemesterColors.BrandCobalt),
                                )
                                Text("Warning Buffer: ${warningThreshold.roundToInt()}%", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Slider(
                                    value = warningThreshold,
                                    onValueChange = { warningThreshold = it },
                                    valueRange = 50f..98f,
                                    colors = SliderDefaults.colors(thumbColor = SemesterColors.WarningAmber, activeTrackColor = SemesterColors.WarningAmber),
                                )

                                GradientButton(
                                    text = "Save Profile & Targets",
                                    onClick = {
                                        scope.launch {
                                            repo.updateProfile(
                                                name = name.trim().ifBlank { "Student" },
                                                enrollmentNumber = enrollment.trim(),
                                                college = college.trim(),
                                                course = course.trim(),
                                                branch = branch.trim(),
                                                batch = batch.trim(),
                                                currentSemester = selectedSemester,
                                                attendanceThreshold = threshold.roundToInt(),
                                                warningThreshold = warningThreshold.roundToInt(),
                                            )
                                            haptics.attendanceSuccess()
                                            statusMessage = "Profile & attendance targets saved."
                                            onWorkspaceUpdated()
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }

                SettingsTab.DATA -> {
                    item(key = "drive_card") {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 6.dp)
                                .liquidGlass(
                                    shape = RoundedCornerShape(24.dp),
                                    accentTint = if (driveState.connected) SemesterColors.SafeEmerald else SemesterColors.BrandCobalt,
                                )
                                .padding(18.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Icon(
                                            imageVector = if (driveState.connected) Icons.Rounded.CloudDone else Icons.Rounded.CloudSync,
                                            contentDescription = null,
                                            tint = if (driveState.connected) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(26.dp),
                                        )
                                        Column {
                                            Text("Google Drive Auto-Sync", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                                            Text(
                                                text = if (driveState.connected) driveState.accountEmail.ifBlank { "Connected • Syncing automatically" } else "Keep phone & laptop identical privately",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                    Box(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(if (driveState.connected) SemesterColors.SafeEmerald.copy(alpha = 0.16f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                                            .padding(horizontal = 10.dp, vertical = 4.dp),
                                    ) {
                                        Text(
                                            text = if (driveState.isSyncing) "Syncing" else if (driveState.connected) "Synced" else "Offline",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (driveState.connected) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }

                                Text(driveState.lastSyncSummary, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                driveState.lastError?.let { err -> Text(err, style = MaterialTheme.typography.labelSmall, color = SemesterColors.CriticalCrimson) }

                                if (driveState.connected) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Column {
                                            Text("Automatic 2-Way Sync", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                                            Text("Fast background sync every 30 min & after edits", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        Switch(checked = driveState.autoSyncEnabled, onCheckedChange = { haptics.focusSnap(); driveEngine.setAutoSyncEnabled(it) })
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                        GradientButton(
                                            text = if (driveState.isSyncing) "Syncing..." else "Sync Now",
                                            enabled = !driveState.isSyncing,
                                            onClick = {
                                                scope.launch {
                                                    haptics.focusSnap()
                                                    driveEngine.syncTwoWay(forcePush = true)
                                                        .onSuccess { msg ->
                                                            statusMessage = msg
                                                            onWorkspaceUpdated()
                                                            haptics.attendanceSuccess()
                                                            driveEngine.listCloudBackups().onSuccess { cloudBackups = it }
                                                        }
                                                        .onFailure { statusMessage = it.message }
                                                }
                                            },
                                            modifier = Modifier.weight(1.2f),
                                        )
                                        GlassSecondaryButton(
                                            text = "Disconnect",
                                            onClick = {
                                                haptics.softDismiss()
                                                driveEngine.disconnect()
                                                cloudBackups = emptyList()
                                                statusMessage = "Disconnected Google Drive."
                                            },
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                } else {
                                    // 1-Click Desktop-identical Google Sign-In (ZERO manual Client ID box!)
                                    Text(
                                        text = "Sign in with your Google account to back up attendance, profile photo, timetable, notes, and results privately into your Drive AppData folder.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    GradientButton(
                                        text = if (driveState.isSyncing) "Waiting for Google Sign-In..." else "Connect Google Drive",
                                        icon = Icons.Rounded.CloudSync,
                                        enabled = !driveState.isSyncing,
                                        onClick = {
                                            haptics.selectionConfirm()
                                            driveEngine.launchOneClickSignIn(
                                                activityContext = context,
                                                onConnected = { connectedEmail ->
                                                    haptics.attendanceSuccess()
                                                    statusMessage = "Connected $connectedEmail — changes now sync automatically."
                                                    onWorkspaceUpdated()
                                                    scope.launch {
                                                        driveEngine.listCloudBackups().onSuccess { cloudBackups = it }
                                                    }
                                                },
                                                onError = { err ->
                                                    statusMessage = err
                                                },
                                            )
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }
                            }
                        }
                    }

                    if (cloudBackups.isNotEmpty()) {
                        items(cloudBackups.take(5), key = { it.fileId }) { item ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp, vertical = 4.dp)
                                    .liquidGlass(shape = RoundedCornerShape(16.dp))
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(item.modifiedTime.take(19).replace("T", " "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                GlassSecondaryButton(
                                    text = "Restore",
                                    icon = Icons.Rounded.Restore,
                                    accentTint = SemesterColors.BrandCobalt,
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 7.dp),
                                    onClick = {
                                        scope.launch {
                                            driveEngine.restoreCloudBackup(item.fileId, replaceAll = false)
                                                .onSuccess {
                                                    statusMessage = "Smart-merged ${item.name} cleanly."
                                                    haptics.attendanceSuccess()
                                                    onWorkspaceUpdated()
                                                }
                                                .onFailure { statusMessage = it.message }
                                        }
                                    },
                                )
                            }
                        }
                    }

                    item(key = "offline_backup") {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 8.dp)
                                .liquidGlass(shape = RoundedCornerShape(24.dp))
                                .padding(18.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Local Backup & Device Transfer", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                                Text(
                                    text = "Export or import complete workspace JSON backups directly between Android and Windows Desktop.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    GlassSecondaryButton(
                                        text = "Export JSON",
                                        icon = Icons.Rounded.Upload,
                                        onClick = {
                                            haptics.crownTick()
                                            val stamp = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                                            exportLauncher.launch("semester_backup_$stamp.json")
                                        },
                                        modifier = Modifier.weight(1f),
                                    )
                                    GradientButton(
                                        text = "Import JSON",
                                        icon = Icons.Rounded.Download,
                                        onClick = {
                                            haptics.crownTick()
                                            importLauncher.launch(arrayOf("application/json", "*/*"))
                                        },
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }
                    }

                    item(key = "danger") {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 8.dp)
                                .clip(RoundedCornerShape(22.dp))
                                .background(SemesterColors.CriticalCrimson.copy(alpha = 0.12f))
                                .border(1.dp, SemesterColors.CriticalCrimson.copy(alpha = 0.35f), RoundedCornerShape(22.dp))
                                .padding(16.dp),
                        ) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Reset Local Workspace", style = MaterialTheme.typography.titleSmall, color = SemesterColors.CriticalCrimson, fontWeight = FontWeight.Bold)
                                    Text("Clears subjects, attendance logs, results, courses & notes.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Spacer(Modifier.width(8.dp))
                                DangerPillButton(
                                    text = "Reset",
                                    icon = Icons.Rounded.DeleteForever,
                                    onClick = {
                                        haptics.selectionConfirm()
                                        showWipeConfirm = true
                                    },
                                )
                            }
                        }
                    }
                }

                SettingsTab.AI -> {
                    item(key = "ai_byok_card") {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 6.dp)
                                .liquidGlass(shape = RoundedCornerShape(24.dp))
                                .padding(18.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("Academic Assistant", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                                Text(
                                    text = "Works instantly on-device with zero internet required. Optionally connect your own Gemini or Groq API key — keys stay private on your phone.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                RubberSegment(
                                    options = listOf(
                                        SegmentOption(AiProvider.LOCAL_RUST, "On-Device"),
                                        SegmentOption(AiProvider.GEMINI, "Gemini"),
                                        SegmentOption(AiProvider.GROQ, "Groq"),
                                    ),
                                    selected = aiProvider,
                                    onSelect = { p ->
                                        haptics.focusSnap()
                                        aiProvider = p
                                        repo.setSelectedAiProvider(p)
                                        apiKeyDraft = repo.getByokApiKey(p)
                                        statusMessage = "Assistant set to ${p.label}"
                                    },
                                    fillWidth = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                if (aiProvider != AiProvider.LOCAL_RUST) {
                                    OutlinedTextField(
                                        value = apiKeyDraft,
                                        onValueChange = {
                                            apiKeyDraft = it
                                            repo.saveByokApiKey(aiProvider, it)
                                        },
                                        label = { Text("${aiProvider.label} API Key") },
                                        visualTransformation = PasswordVisualTransformation(),
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }
                            }
                        }
                    }
                }

                SettingsTab.ACTIVITY -> {
                    if (systemLogs.isEmpty()) {
                        item(key = "no_activity") {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(20.dp)
                                    .liquidGlass(shape = RoundedCornerShape(22.dp))
                                    .padding(24.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("No activity logs recorded yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    } else {
                        items(systemLogs, key = { it.id }) { log ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp, vertical = 4.dp)
                                    .liquidGlass(shape = RoundedCornerShape(16.dp))
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(Icons.Rounded.History, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(log.action, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                                    Text(log.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                                Text(log.timestamp.take(16).replace("T", "\n"), style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }

    pendingImportJson?.let { raw ->
        AlertDialog(
            onDismissRequest = { pendingImportJson = null },
            title = { Text("Import Workspace Backup", fontWeight = FontWeight.Bold) },
            text = { Text("Choose Smart Merge to combine changes from Laptop & Phone with zero data loss, or Full Replace to overwrite local data.") },
            confirmButton = {
                GradientButton(
                    text = "Smart Merge",
                    onClick = {
                        scope.launch {
                            runCatching { repo.mergeRemoteSnapshotJson(raw) }
                                .onSuccess {
                                    statusMessage = "Smart merge completed cleanly."
                                    haptics.attendanceSuccess()
                                    onWorkspaceUpdated()
                                }
                                .onFailure { statusMessage = "Merge failed: ${it.message}" }
                            pendingImportJson = null
                        }
                    },
                )
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            runCatching { repo.importBackupJson(raw) }
                                .onSuccess {
                                    statusMessage = "Full backup restored."
                                    haptics.attendanceSuccess()
                                    onWorkspaceUpdated()
                                }
                                .onFailure { statusMessage = "Restore failed: ${it.message}" }
                            pendingImportJson = null
                        }
                    },
                ) { Text("Full Replace") }
            },
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(24.dp),
        )
    }

    if (showWipeConfirm) {
        AlertDialog(
            onDismissRequest = { showWipeConfirm = false },
            title = { Text("Reset local workspace?", fontWeight = FontWeight.Bold) },
            text = { Text("This clears all subjects, attendance logs, results, courses, and notes unless you have a Google Drive or JSON backup.") },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            repo.wipeAllData()
                            haptics.selectionConfirm()
                            showWipeConfirm = false
                            statusMessage = "All local workspace data cleared."
                            onWorkspaceUpdated()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SemesterColors.CriticalCrimson),
                    shape = CircleShape,
                ) { Text("Reset Everything", color = Color.White, fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { showWipeConfirm = false }) { Text("Cancel") } },
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(24.dp),
        )
    }
}
