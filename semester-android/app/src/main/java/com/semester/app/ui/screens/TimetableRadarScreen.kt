package com.semester.app.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color as AndroidColor
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ChevronLeft
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.ImageSearch
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.ViewAgenda
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeWriter
import com.semester.app.core.AttendanceLogEntry
import com.semester.app.core.CalendarDaySummary
import com.semester.app.core.TimetableData
import com.semester.app.core.TimetableDaySlot
import com.semester.app.core.TimetablePeriodDef
import com.semester.app.core.TodayClassItem
import com.semester.app.core.WorkspaceRepository
import com.semester.app.core.WorkspaceSubject
import com.semester.app.core.parseFlexibleTimeMinutes
import com.semester.app.core.smartSubjectShortName
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.DangerPillButton
import com.semester.app.ui.components.GlassIconButton
import com.semester.app.ui.components.GlassSecondaryButton
import com.semester.app.ui.components.GradientButton
import com.semester.app.ui.components.GradientText
import com.semester.app.ui.components.LivePeriodRadarCard
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.PeriodState
import com.semester.app.ui.components.QrCameraScannerDialog
import com.semester.app.ui.components.RubberSegment
import com.semester.app.ui.components.ScrollForwardHint
import com.semester.app.ui.components.SegmentOption
import com.semester.app.ui.components.SemesterPageMotion
import com.semester.app.ui.components.SemesterPickerBadge
import com.semester.app.ui.components.StudioPillChip
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.liquidHeroBanner
import com.semester.app.ui.components.pressable
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormatSymbols
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

private val WEEK_DAYS = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
private val BOARD_DAYS = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
private val CAL_DAY_HEADERS = listOf("M", "T", "W", "T", "F", "S", "S")

@Composable
fun TimetableRadarScreen(
    semester: Int,
    initialMode: String = "radar",
    subjects: List<WorkspaceSubject>,
    dataVersion: Long,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onOpenSemesterPicker: () -> Unit = {},
    onAddSubjectClick: () -> Unit = {},
    onAttendanceMarked: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current
    val isDark = LocalIsDarkTheme.current

    var mode by remember(initialMode) { mutableStateOf(initialMode) } // "radar" | "calendar"
    var timetableView by remember { mutableStateOf("timeline") } // "timeline" | "board"
    var statusBanner by remember { mutableStateOf<String?>(null) }

    // Slot Add/Edit dialog state
    var showSlotDialog by remember { mutableStateOf(false) }
    var editingSlot by remember { mutableStateOf<TimetableDaySlot?>(null) }
    var slotPrefillDay by remember { mutableStateOf("Monday") }
    var slotPrefillStart by remember { mutableStateOf("09:00 AM") }
    var slotPrefillEnd by remember { mutableStateOf("10:00 AM") }

    // Structure (Edit Periods), Unified QR Hub (Share + Scan/Import), Calendar Day Sheet & Log dialogs
    var showStructureSheet by remember { mutableStateOf(false) }
    var showQrHubSheet by remember { mutableStateOf(false) }
    var showLiveQrCamera by remember { mutableStateOf(false) }
    var qrHubInitialTab by remember { mutableStateOf("share") }
    var showDayAttendanceSheet by remember { mutableStateOf(false) }
    var showLogDateDialog by remember { mutableStateOf(false) }
    var editingLog by remember { mutableStateOf<AttendanceLogEntry?>(null) }

    val todayName = remember {
        val day = SimpleDateFormat("EEEE", Locale.ENGLISH).format(Date())
        if (day in WEEK_DAYS) day else "Monday"
    }
    var selectedDay by remember { mutableStateOf(todayName) }
    var timetable by remember { mutableStateOf(TimetableData(semester = semester)) }

    // Calendar state
    val nowCal = remember { Calendar.getInstance() }
    var calYear by remember { mutableIntStateOf(nowCal.get(Calendar.YEAR)) }
    var calMonth by remember { mutableIntStateOf(nowCal.get(Calendar.MONTH) + 1) } // 1..12
    var selectedDate by remember { mutableStateOf(WorkspaceRepository.todayIsoDate()) }
    var calendarMap by remember { mutableStateOf<Map<String, CalendarDaySummary>>(emptyMap()) }
    var dayLogs by remember { mutableStateOf<List<AttendanceLogEntry>>(emptyList()) }
    var scheduledForDate by remember { mutableStateOf<List<TodayClassItem>>(emptyList()) }
    var todayClasses by remember { mutableStateOf<List<TodayClassItem>>(emptyList()) }

    fun refreshAll() {
        scope.launch {
            timetable = repo.getTimetable(semester)
            calendarMap = repo.getCalendarForMonth(calYear, calMonth, semester)
            dayLogs = repo.getLogsForDate(selectedDate, semester)
            scheduledForDate = repo.getClassesForDate(selectedDate, semester)
            todayClasses = repo.getClassesForDate(WorkspaceRepository.todayIsoDate(), semester)
        }
    }

    LaunchedEffect(semester, dataVersion, calYear, calMonth, selectedDate) {
        refreshAll()
    }

    fun handleQrPayloadImport(rawPayload: String) {
        scope.launch {
            runCatching { repo.importTimetableQrV2(semester, rawPayload) }
                .onSuccess { res ->
                    val detail = buildString {
                        append("Imported ${res.slotsImported} slot(s)")
                        if (res.subjectsLinked > 0) append(" • ${res.subjectsLinked} linked")
                        if (res.subjectsCreated > 0) append(" • ${res.subjectsCreated} course(s) created")
                    }
                    statusBanner = detail
                    haptics.attendanceSuccess()
                    showQrHubSheet = false
                    onAttendanceMarked()
                    refreshAll()
                }
                .onFailure {
                    statusBanner = "QR import failed: ${it.message ?: "Unrecognized timetable code"}"
                }
        }
    }

    // Gallery QR image picker (100% offline ZXing fallback for WhatsApp/Desktop QR screenshots!)
    val qrGalleryPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val decoded = withContext(Dispatchers.IO) { decodeQrFromUri(context, uri) }
            if (!decoded.isNullOrBlank()) {
                handleQrPayloadImport(decoded)
            } else {
                statusBanner = "No QR code detected in that image. Try cropping closer or pasting the code."
            }
        }
    }

    val slots = timetable.slotsForDay(selectedDay)
    val nowMinutes = remember(dataVersion) {
        val cal = Calendar.getInstance()
        cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    }

    // Month Pulse KPI stats (Desktop Calendar.tsx parity)
    val monthStats = remember(calendarMap) {
        var present = 0
        var absent = 0
        var other = 0
        calendarMap.values.forEach { day ->
            day.logs.forEach { log ->
                when (log.status) {
                    "present", "late", "duty" -> present++
                    "absent" -> absent++
                    else -> other++
                }
            }
        }
        val denom = present + absent
        val rate = if (denom > 0) ((present * 100.0) / denom).roundToInt() else 0
        Triple(rate, present, absent)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        AmbientTopGlow(
            color = if (mode == "radar") SemesterColors.BrandCobalt else SemesterColors.BrandCyan,
            peakAlpha = if (isDark) 0.22f else 0.12f,
            height = 290.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        Column(modifier = Modifier.fillMaxSize()) {
            // Fixed Top Header + Mode Switcher (smoothly animates Timetable <-> Attendance Calendar below)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        SemesterPickerBadge(
                            semester = semester,
                            onClick = {
                                haptics.crownTick()
                                onOpenSemesterPicker()
                            },
                        )
                        Text(
                            text = "SCHEDULE & LOGS",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            letterSpacing = 1.sp,
                        )
                    }
                    Text(
                        text = if (mode == "radar") "Timetable" else "Calendar Logs",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (mode == "radar") {
                        GlassIconButton(
                            icon = Icons.Rounded.Tune,
                            contentDescription = "Edit Periods",
                            size = 38.dp,
                            onClick = {
                                haptics.crownTick()
                                showStructureSheet = true
                            },
                        )
                        // Unified QR Hub (Share + Scan/Import) ALWAYS accessible!
                        GlassIconButton(
                            icon = Icons.Rounded.QrCode2,
                            contentDescription = "QR Share & Scan",
                            size = 38.dp,
                            accentTint = SemesterColors.BrandCyan,
                            onClick = {
                                haptics.focusSnap()
                                qrHubInitialTab = if (timetable.allSlots.isNotEmpty()) "share" else "import"
                                showQrHubSheet = true
                            },
                        )
                    } else {
                        // Clear labeled "Today" pill button — jumps to Today & opens Today's Attendance Popup
                        Surface(
                            color = SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.22f else 0.13f),
                            shape = CircleShape,
                            modifier = Modifier
                                .border(1.dp, SemesterColors.BrandCobalt.copy(alpha = 0.42f), CircleShape)
                                .clip(CircleShape)
                                .clickable {
                                    haptics.focusSnap()
                                    val today = Calendar.getInstance()
                                    calYear = today.get(Calendar.YEAR)
                                    calMonth = today.get(Calendar.MONTH) + 1
                                    selectedDate = WorkspaceRepository.todayIsoDate()
                                    showDayAttendanceSheet = true
                                },
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 11.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Today,
                                    contentDescription = "Jump to Today",
                                    tint = SemesterColors.BrandCobalt,
                                    modifier = Modifier.size(15.dp),
                                )
                                Text(
                                    text = "Today",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = SemesterColors.BrandCobalt,
                                )
                            }
                        }
                    }
                    GlassIconButton(
                        icon = Icons.Rounded.Add,
                        contentDescription = if (mode == "radar") "Add Period Slot" else "Mark Attendance",
                        size = 38.dp,
                        accentTint = SemesterColors.BrandCyan,
                        onClick = {
                            haptics.crownTick()
                            if (mode == "radar") {
                                editingSlot = null
                                slotPrefillDay = selectedDay
                                val firstP = timetable.periods.firstOrNull()
                                slotPrefillStart = firstP?.startTime ?: "09:00 AM"
                                slotPrefillEnd = firstP?.endTime ?: "10:00 AM"
                                showSlotDialog = true
                            } else if (subjects.isNotEmpty()) {
                                showLogDateDialog = true
                            } else {
                                showDayAttendanceSheet = true
                            }
                        },
                    )
                }
            }

            // Desktop RubberSegment switcher: Timetable | Attendance Calendar
            Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp)) {
                RubberSegment(
                    options = listOf(
                        SegmentOption("radar", "Timetable"),
                        SegmentOption("calendar", "Attendance Calendar"),
                    ),
                    selected = mode,
                    onSelect = {
                        haptics.crownTick()
                        mode = it
                    },
                    fillWidth = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            statusBanner?.let { msg ->
                Surface(
                    color = SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.18f else 0.11f),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 4.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = msg,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = { statusBanner = null }, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Rounded.Close, contentDescription = "Dismiss", modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }

            // Directional Animated Transition between Timetable <-> Attendance Calendar
            AnimatedContent(
                targetState = mode,
                transitionSpec = { SemesterPageMotion.modeTransition(forward = targetState == "calendar") },
                modifier = Modifier.weight(1f),
                label = "ScheduleModeTransition",
            ) { currentMode ->
                if (currentMode == "radar") {
                    Column(modifier = Modifier.fillMaxSize()) {
                        // Sub-view switcher: Timeline vs Weekly Board
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RubberSegment(
                                options = listOf(
                                    SegmentOption("timeline", "Timeline", icon = Icons.Rounded.ViewAgenda),
                                    SegmentOption("board", "Board", icon = Icons.Rounded.GridView),
                                ),
                                selected = timetableView,
                                onSelect = {
                                    haptics.crownTick()
                                    timetableView = it
                                },
                            )
                            Text(
                                text = "${timetable.periods.size} periods • ${timetable.allSlots.size} slots",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        AnimatedContent(
                            targetState = timetableView,
                            transitionSpec = { SemesterPageMotion.modeTransition(forward = targetState == "board") },
                            modifier = Modifier.weight(1f),
                            label = "TimetableSubViewTransition",
                        ) { subView ->
                            LazyColumn(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
                                contentPadding = PaddingValues(bottom = 132.dp),
                            ) {
                                if (subView == "board") {
                                    item(key = "weekly_board") {
                                        val boardDays = if (timetable.slotsForDay("Saturday").isNotEmpty()) WEEK_DAYS else BOARD_DAYS
                                        WeeklyTimetableBoard(
                                            periods = timetable.periods,
                                            days = boardDays,
                                            todayName = todayName,
                                            timetable = timetable,
                                            haptics = haptics,
                                            onTapEmpty = { day, period ->
                                                editingSlot = null
                                                slotPrefillDay = day
                                                slotPrefillStart = period.startTime
                                                slotPrefillEnd = period.endTime
                                                showSlotDialog = true
                                            },
                                            onTapSlot = { slot ->
                                                editingSlot = slot
                                                slotPrefillDay = slot.day
                                                slotPrefillStart = slot.startTime
                                                slotPrefillEnd = slot.endTime
                                                showSlotDialog = true
                                            },
                                        )
                                    }
                                } else {
                                    item(key = "day_pills") {
                                        val dayRowState = rememberLazyListState()
                                        val canScrollDays by remember { derivedStateOf { dayRowState.canScrollForward } }
                                        Column {
                                            LazyRow(
                                                state = dayRowState,
                                                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                            ) {
                                                items(WEEK_DAYS) { day ->
                                                    val active = day == selectedDay
                                                    val count = timetable.slotsForDay(day).size
                                                    StudioPillChip(
                                                        label = day.take(3),
                                                        badge = if (count > 0) "$count" else null,
                                                        selected = active,
                                                        onClick = {
                                                            haptics.crownTick()
                                                            selectedDay = day
                                                        },
                                                    )
                                                }
                                            }
                                            ScrollForwardHint(visible = canScrollDays)
                                        }
                                    }

                                    if (slots.isEmpty()) {
                                        item(key = "radar_empty") {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(horizontal = 20.dp, vertical = 14.dp)
                                                    .liquidGlass(shape = RoundedCornerShape(26.dp))
                                                    .padding(26.dp),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                Column(
                                                    horizontalAlignment = Alignment.CenterHorizontally,
                                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                                ) {
                                                    Box(
                                                        modifier = Modifier
                                                            .size(56.dp)
                                                            .clip(CircleShape)
                                                            .background(SemesterColors.BrandCobalt.copy(alpha = 0.16f)),
                                                        contentAlignment = Alignment.Center,
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Rounded.Schedule,
                                                            contentDescription = null,
                                                            tint = SemesterColors.BrandCobalt,
                                                            modifier = Modifier.size(26.dp),
                                                        )
                                                    }
                                                    Text(
                                                        text = "No periods on $selectedDay",
                                                        style = MaterialTheme.typography.titleMedium,
                                                        fontWeight = FontWeight.Bold,
                                                        color = MaterialTheme.colorScheme.onSurface,
                                                    )
                                                    Text(
                                                        text = "Add a slot, scan or share a timetable QR, or sync with Desktop.",
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    )
                                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                        GradientButton(
                                                            text = "Add Slot",
                                                            icon = Icons.Rounded.Add,
                                                            onClick = {
                                                                haptics.crownTick()
                                                                editingSlot = null
                                                                slotPrefillDay = selectedDay
                                                                val firstP = timetable.periods.firstOrNull()
                                                                slotPrefillStart = firstP?.startTime ?: "09:00 AM"
                                                                slotPrefillEnd = firstP?.endTime ?: "10:00 AM"
                                                                showSlotDialog = true
                                                            },
                                                        )
                                                        GlassSecondaryButton(
                                                            text = "QR Hub",
                                                            icon = Icons.Rounded.QrCode2,
                                                            onClick = {
                                                                haptics.crownTick()
                                                                qrHubInitialTab = if (timetable.allSlots.isNotEmpty()) "share" else "import"
                                                                showQrHubSheet = true
                                                            },
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        itemsIndexed(slots, key = { _, slot -> slot.id }) { _, slot ->
                                            val startMins = parseFlexibleTimeMinutes(slot.startTime)
                                            val endMins = parseFlexibleTimeMinutes(slot.endTime)
                                            val (state, remaining) = when {
                                                selectedDay != todayName -> PeriodState.UPCOMING to null
                                                startMins != null && endMins != null && nowMinutes in startMins until endMins ->
                                                    PeriodState.ACTIVE to (endMins - nowMinutes)
                                                endMins != null && nowMinutes >= endMins ->
                                                    PeriodState.PAST to null
                                                else -> PeriodState.UPCOMING to null
                                            }
                                            val matchedTodayStatus = if (selectedDay == todayName && slot.subjectId.isNotBlank()) {
                                                todayClasses.firstOrNull {
                                                    it.subjectId == slot.subjectId &&
                                                        (it.startTime.equals(slot.startTime, true) || it.attendanceType.endsWith(slot.startTime, true))
                                                }?.markedStatus
                                            } else null

                                            LivePeriodRadarCard(
                                                slot = slot,
                                                state = state,
                                                remainingMinutes = remaining,
                                                showMarkActions = false,
                                                markedStatus = matchedTodayStatus,
                                                haptics = haptics,
                                                onEdit = {
                                                    editingSlot = slot
                                                    slotPrefillDay = slot.day
                                                    slotPrefillStart = slot.startTime
                                                    slotPrefillEnd = slot.endTime
                                                    showSlotDialog = true
                                                },
                                                onMark = { status ->
                                                    scope.launch {
                                                        val attType = if (slot.startTime.isNotBlank()) "class::${slot.startTime}" else "Lecture"
                                                        repo.markAttendance(
                                                            subjectId = slot.subjectId,
                                                            status = status,
                                                            date = WorkspaceRepository.todayIsoDate(),
                                                            semester = semester,
                                                            logType = attType,
                                                        )
                                                        onAttendanceMarked()
                                                        refreshAll()
                                                    }
                                                },
                                                onDelete = {
                                                    scope.launch {
                                                        repo.deleteTimetableSlot(slot.id, semester, slot.day, slot.startTime)
                                                        refreshAll()
                                                    }
                                                },
                                                modifier = Modifier.padding(horizontal = 20.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // ─── Desktop-Exact Calendar Mode (Month Pulse + Interactive Date Grid -> Day Attendance Modal) ───
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
                        contentPadding = PaddingValues(bottom = 132.dp),
                    ) {
                        item(key = "month_pulse") {
                            val (rate, pCount, aCount) = monthStats
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp, vertical = 6.dp)
                                    .liquidHeroBanner(shape = RoundedCornerShape(24.dp), accentTint = SemesterColors.BrandCyan)
                                    .padding(16.dp),
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Column {
                                            Text("MONTH PULSE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, letterSpacing = 0.9.sp)
                                            Text(
                                                text = "$pCount Present • $aCount Absent • Tap any day to mark",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                        GradientText(
                                            text = "$rate%",
                                            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold),
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(7.dp)
                                            .clip(CircleShape)
                                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)),
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxHeight()
                                                .fillMaxWidth((rate / 100f).coerceIn(0f, 1f))
                                                .clip(CircleShape)
                                                .background(SemesterGradients.brandButton),
                                        )
                                    }
                                }
                            }
                        }

                        item(key = "calendar_grid") {
                            MonthlyCalendarCard(
                                year = calYear,
                                month = calMonth,
                                selectedDate = selectedDate,
                                calendarMap = calendarMap,
                                haptics = haptics,
                                onPrevMonth = {
                                    if (calMonth == 1) {
                                        calMonth = 12
                                        calYear -= 1
                                    } else {
                                        calMonth -= 1
                                    }
                                },
                                onNextMonth = {
                                    if (calMonth == 12) {
                                        calMonth = 1
                                        calYear += 1
                                    } else {
                                        calMonth += 1
                                    }
                                },
                                onSelectDate = { dateStr ->
                                    selectedDate = dateStr
                                    showDayAttendanceSheet = true
                                },
                            )
                        }

                        item(key = "selected_date_header") {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 20.dp, end = 20.dp, top = 10.dp, bottom = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "${formatPrettyIsoDate(selectedDate)} • ${dayLogs.size} logged",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Surface(
                                    color = SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.18f else 0.12f),
                                    shape = CircleShape,
                                    modifier = Modifier.clickable {
                                        haptics.crownTick()
                                        showDayAttendanceSheet = true
                                    },
                                ) {
                                    Text(
                                        text = if (subjects.isNotEmpty()) "Mark Day" else "Add Course",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = SemesterColors.BrandCobalt,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 11.dp, vertical = 5.dp),
                                    )
                                }
                            }
                        }

                        if (dayLogs.isEmpty()) {
                            item(key = "no_logs_day") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 20.dp, vertical = 6.dp)
                                        .liquidGlass(shape = RoundedCornerShape(20.dp))
                                        .clickable {
                                            haptics.crownTick()
                                            showDayAttendanceSheet = true
                                        }
                                        .padding(18.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = if (subjects.isEmpty()) {
                                            "No courses in Sem $semester yet. Tap here or any calendar date to add your first course."
                                        } else {
                                            "No attendance recorded on $selectedDate. Tap any date cell to open the attendance popup."
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        } else {
                            items(dayLogs, key = { it.id }) { log ->
                                val tint = when (log.status) {
                                    "present", "late", "duty" -> SemesterColors.SafeEmerald
                                    "absent" -> SemesterColors.CriticalCrimson
                                    "approved_medical", "medical" -> SemesterColors.ElectricBlue
                                    "substituted" -> SemesterColors.WarningAmber
                                    else -> Color(0xFF94A3B8)
                                }
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 20.dp, vertical = 4.dp)
                                        .liquidGlass(
                                            shape = RoundedCornerShape(18.dp),
                                            accentTint = tint,
                                        )
                                        .clickable {
                                            haptics.crownTick()
                                            editingLog = log
                                        }
                                        .padding(14.dp),
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                            Text(
                                                text = log.subjectName.ifBlank { "Course" },
                                                style = MaterialTheme.typography.titleSmall,
                                                color = MaterialTheme.colorScheme.onSurface,
                                                fontWeight = FontWeight.Bold,
                                            )
                                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                                Surface(color = tint.copy(alpha = 0.18f), shape = CircleShape) {
                                                    Text(
                                                        text = log.status.replace("approved_", "").replace("_", " ").replaceFirstChar { it.uppercase() },
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = tint,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                                    )
                                                }
                                                if (log.substitutedBy.isNotBlank()) {
                                                    Text(
                                                        text = "by ${log.substitutedBy}",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = SemesterColors.WarningAmber,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                } else if (log.notes.isNotBlank()) {
                                                    Text(
                                                        text = log.notes,
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                }
                                            }
                                        }
                                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                            TextButton(
                                                onClick = {
                                                    haptics.crownTick()
                                                    editingLog = log
                                                },
                                            ) {
                                                Text("Edit", style = MaterialTheme.typography.labelMedium, color = SemesterColors.BrandCobalt)
                                            }
                                            IconButton(
                                                onClick = {
                                                    haptics.focusSnap()
                                                    scope.launch {
                                                        repo.deleteAttendance(log.id)
                                                        onAttendanceMarked()
                                                        refreshAll()
                                                    }
                                                },
                                            ) {
                                                Icon(Icons.Rounded.DeleteOutline, contentDescription = "Undo Log", tint = SemesterColors.CriticalCrimson)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ─── Dialogs & Sheets ────────────────────────────────────────────────────

    if (showSlotDialog) {
        TimetableSlotDialog(
            initialSlot = editingSlot,
            defaultDay = slotPrefillDay,
            defaultStart = slotPrefillStart,
            defaultEnd = slotPrefillEnd,
            periods = timetable.periods,
            subjects = subjects,
            haptics = haptics,
            onAddCourseClick = {
                showSlotDialog = false
                onAddSubjectClick()
            },
            onDismiss = { showSlotDialog = false },
            onSave = { day, slotType, sub, label, start, end, room ->
                scope.launch {
                    val isClass = slotType == "class"
                    repo.saveTimetableSlot(
                        semester = semester,
                        day = day,
                        startTime = start.trim(),
                        endTime = end.trim(),
                        subjectId = if (isClass) sub?.id.orEmpty() else "",
                        subjectName = if (isClass) (sub?.name ?: "Class") else "",
                        // For Class slots, always keep room blank so SQLite LEFT JOIN subjects
                        // stays live-linked to the Dashboard course's classroom!
                        room = if (isClass) "" else room.trim(),
                        slotType = slotType,
                        label = if (isClass) "" else label.trim().ifBlank { slotType.replaceFirstChar { it.uppercase() } },
                        id = editingSlot?.id,
                    )
                    haptics.attendanceSuccess()
                    showSlotDialog = false
                    refreshAll()
                }
            },
            onDelete = editingSlot?.let { target ->
                {
                    scope.launch {
                        repo.deleteTimetableSlot(target.id, semester, target.day, target.startTime)
                        haptics.softDismiss()
                        showSlotDialog = false
                        refreshAll()
                    }
                }
            },
        )
    }

    if (showStructureSheet) {
        TimetableStructureSheet(
            semester = semester,
            currentPeriods = timetable.periods,
            haptics = haptics,
            onDismiss = { showStructureSheet = false },
            onSave = { updated ->
                scope.launch {
                    repo.saveTimetablePeriods(semester, updated)
                    haptics.attendanceSuccess()
                    statusBanner = "Saved ${updated.size} period timings for Sem $semester."
                    showStructureSheet = false
                    refreshAll()
                }
            },
        )
    }

    if (showQrHubSheet) {
        TimetableQrHubSheet(
            semester = semester,
            initialTab = qrHubInitialTab,
            timetable = timetable,
            repo = repo,
            haptics = haptics,
            onDismiss = { showQrHubSheet = false },
            onAddFirstSlot = {
                showQrHubSheet = false
                editingSlot = null
                slotPrefillDay = selectedDay
                val firstP = timetable.periods.firstOrNull()
                slotPrefillStart = firstP?.startTime ?: "09:00 AM"
                slotPrefillEnd = firstP?.endTime ?: "10:00 AM"
                showSlotDialog = true
            },
            onCopyCode = { payload ->
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                cm?.setPrimaryClip(ClipData.newPlainText("Semester Timetable", payload))
                haptics.attendanceSuccess()
                statusBanner = "Timetable share code copied to clipboard."
            },
            onShareCode = { payload ->
                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, "Semester $semester Timetable Code")
                    putExtra(Intent.EXTRA_TEXT, payload)
                }
                context.startActivity(Intent.createChooser(sendIntent, "Share Timetable Code"))
            },
            onScanCamera = {
                showLiveQrCamera = true
            },
            onScanGallery = { qrGalleryPicker.launch("image/*") },
            onImportCode = { raw -> handleQrPayloadImport(raw) },
        )
    }

    if (showLiveQrCamera) {
        QrCameraScannerDialog(
            onScanned = { raw ->
                showLiveQrCamera = false
                handleQrPayloadImport(raw)
            },
            onDismiss = { showLiveQrCamera = false },
        )
    }

    if (showDayAttendanceSheet) {
        CalendarDayAttendanceSheet(
            date = selectedDate,
            semester = semester,
            subjects = subjects,
            scheduledClasses = scheduledForDate,
            dayLogs = dayLogs,
            haptics = haptics,
            onDismiss = { showDayAttendanceSheet = false },
            onStepDay = { delta ->
                val nextDate = shiftIsoDate(selectedDate, delta)
                selectedDate = nextDate
                nextDate.split("-").takeIf { it.size == 3 }?.let { parts ->
                    parts[0].toIntOrNull()?.let { calYear = it }
                    parts[1].toIntOrNull()?.let { calMonth = it }
                }
            },
            onJumpDate = { nextDate ->
                selectedDate = nextDate
                nextDate.split("-").takeIf { it.size == 3 }?.let { parts ->
                    parts[0].toIntOrNull()?.let { calYear = it }
                    parts[1].toIntOrNull()?.let { calMonth = it }
                }
            },
            onAddCourseClick = {
                showDayAttendanceSheet = false
                onAddSubjectClick()
            },
            onMarkScheduled = { cls, status, notes, subBy ->
                scope.launch {
                    if (!cls.logId.isNullOrBlank()) {
                        repo.editAttendance(cls.logId, status, notes = notes, date = selectedDate, substitutedBy = subBy)
                    } else {
                        repo.markAttendance(
                            subjectId = cls.subjectId,
                            status = status,
                            date = selectedDate,
                            notes = notes,
                            substitutedBy = subBy,
                            semester = semester,
                            logType = cls.attendanceType,
                        )
                    }
                    if (status == "present") haptics.attendanceSuccess() else haptics.softDismiss()
                    onAttendanceMarked()
                    refreshAll()
                }
            },
            onBulkAction = { status, notes ->
                scope.launch {
                    val targets = if (scheduledForDate.isNotEmpty()) {
                        scheduledForDate.filter { it.subjectId.isNotBlank() }.map { it.subjectId to it.attendanceType }
                    } else {
                        subjects.map { it.id to "Lecture" }
                    }
                    val count = repo.markAttendanceBatch(targets, status, date = selectedDate, notes = notes, semester = semester)
                    if (status == "present") haptics.attendanceSuccess() else haptics.softDismiss()
                    statusBanner = "Updated $count class(es) on $selectedDate."
                    onAttendanceMarked()
                    refreshAll()
                }
            },
            onClearDay = {
                scope.launch {
                    val count = repo.deleteAttendanceBatch(dayLogs.map { it.id })
                    haptics.selectionConfirm()
                    statusBanner = "Cleared $count record(s) on $selectedDate."
                    onAttendanceMarked()
                    refreshAll()
                }
            },
            onOpenLogExtra = {
                showDayAttendanceSheet = false
                showLogDateDialog = true
            },
            onEditLog = { log ->
                editingLog = log
            },
            onDeleteLog = { log ->
                scope.launch {
                    repo.deleteAttendance(log.id)
                    haptics.softDismiss()
                    onAttendanceMarked()
                    refreshAll()
                }
            },
        )
    }

    if (showLogDateDialog && subjects.isNotEmpty()) {
        QuickCalendarLogDialog(
            date = selectedDate,
            subjects = subjects,
            haptics = haptics,
            onDismiss = { showLogDateDialog = false },
            onConfirm = { sub, status, note, subBy ->
                scope.launch {
                    repo.markAttendance(
                        subjectId = sub.id,
                        status = status,
                        date = selectedDate,
                        notes = note.trim(),
                        substitutedBy = subBy.trim(),
                        semester = semester,
                    )
                    if (status == "present") haptics.attendanceSuccess() else haptics.focusSnap()
                    showLogDateDialog = false
                    onAttendanceMarked()
                    refreshAll()
                }
            },
        )
    }

    editingLog?.let { log ->
        EditAttendanceLogDialog(
            log = log,
            subjects = subjects,
            haptics = haptics,
            onDismiss = { editingLog = null },
            onSave = { nextStatus, nextNote, nextSubBy ->
                scope.launch {
                    repo.editAttendance(
                        logId = log.id,
                        status = nextStatus,
                        notes = nextNote.trim(),
                        date = log.date,
                        substitutedBy = nextSubBy.trim(),
                    )
                    haptics.attendanceSuccess()
                    editingLog = null
                    onAttendanceMarked()
                    refreshAll()
                }
            },
            onDelete = {
                scope.launch {
                    repo.deleteAttendance(log.id)
                    haptics.softDismiss()
                    editingLog = null
                    onAttendanceMarked()
                    refreshAll()
                }
            },
        )
    }
}

// ─── Weekly Board Grid (Desktop TimeTable Board View Parity) ─────────────────

@Composable
private fun WeeklyTimetableBoard(
    periods: List<TimetablePeriodDef>,
    days: List<String>,
    todayName: String,
    timetable: TimetableData,
    haptics: HapticCrownEngine,
    onTapEmpty: (String, TimetablePeriodDef) -> Unit,
    onTapSlot: (TimetableDaySlot) -> Unit,
) {
    val isDark = LocalIsDarkTheme.current
    val hScroll = rememberScrollState()
    val paletteAccents = remember {
        listOf(
            SemesterColors.BrandCobalt,
            SemesterColors.BrandCyan,
            SemesterColors.BrandVioletSoft,
            SemesterColors.WarningAmber,
            SemesterColors.SafeEmerald,
            SemesterColors.CriticalPink,
        )
    }

    Column(modifier = Modifier.padding(top = 6.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .liquidGlass(shape = RoundedCornerShape(24.dp))
                .horizontalScroll(hScroll)
                .padding(12.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                // Header row
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.width(74.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("TIME", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                    }
                    days.forEach { day ->
                        val isToday = day == todayName
                        Box(
                            modifier = Modifier
                                .width(110.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (isToday) SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.24f else 0.14f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f))
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = day.take(3).uppercase(),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }

                periods.forEach { period ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(
                            modifier = Modifier
                                .width(74.dp)
                                .padding(vertical = 4.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(period.name, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(period.startTime, style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.5.sp), color = MaterialTheme.colorScheme.primary, maxLines = 1)
                        }

                        days.forEach { day ->
                            val match = timetable.slotsForDay(day).firstOrNull {
                                it.startTime.trim().equals(period.startTime.trim(), ignoreCase = true)
                            }
                            if (match != null) {
                                val title = if (match.isNonClass) {
                                    match.label.ifBlank { match.slotType.replaceFirstChar { it.uppercase() } }
                                } else {
                                    match.subjectName.ifBlank { match.label.ifBlank { "Class" } }
                                }
                                val accent = if (match.isNonClass) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    paletteAccents[kotlin.math.abs(title.hashCode()) % paletteAccents.size]
                                }
                                Column(
                                    modifier = Modifier
                                        .width(110.dp)
                                        .height(66.dp)
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(accent.copy(alpha = if (match.isNonClass) 0.08f else if (isDark) 0.18f else 0.12f))
                                        .border(1.dp, accent.copy(alpha = if (match.isNonClass) 0.22f else 0.40f), RoundedCornerShape(14.dp))
                                        .clickable {
                                            haptics.crownTick()
                                            onTapSlot(match)
                                        }
                                        .padding(8.dp),
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    Text(
                                        text = title,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (match.room.isNotBlank()) {
                                        Text(
                                            text = match.room,
                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.5.sp),
                                            color = accent,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            } else {
                                Box(
                                    modifier = Modifier
                                        .width(110.dp)
                                        .height(66.dp)
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.025f))
                                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                                        .clickable {
                                            haptics.crownTick()
                                            onTapEmpty(day, period)
                                        },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(Icons.Rounded.Add, contentDescription = "Add", tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f), modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
        ScrollForwardHint(visible = hScroll.canScrollForward)
    }
}

// ─── Monthly Calendar Grid ───────────────────────────────────────────────────

@Composable
private fun MonthlyCalendarCard(
    year: Int,
    month: Int,
    selectedDate: String,
    calendarMap: Map<String, CalendarDaySummary>,
    haptics: HapticCrownEngine,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onSelectDate: (String) -> Unit,
) {
    val isDark = LocalIsDarkTheme.current
    val todayIso = remember { WorkspaceRepository.todayIsoDate() }
    val monthName = remember(month) { DateFormatSymbols(Locale.ENGLISH).months[(month - 1).coerceIn(0, 11)] }
    // Monday-first week offset: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    val firstDayOfWeek = remember(year, month) {
        (Calendar.getInstance().apply { set(year, month - 1, 1) }.get(Calendar.DAY_OF_WEEK) + 5) % 7
    }
    val daysInMonth = remember(year, month) {
        Calendar.getInstance().apply { set(year, month - 1, 1) }.getActualMaximum(Calendar.DAY_OF_MONTH)
    }
    val cells = remember(firstDayOfWeek, daysInMonth) {
        val list = MutableList<Int?>(firstDayOfWeek) { null }
        for (d in 1..daysInMonth) list.add(d)
        while (list.size % 7 != 0) list.add(null)
        list.chunked(7)
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp)
            .liquidGlass(shape = RoundedCornerShape(24.dp))
            .padding(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { haptics.crownTick(); onPrevMonth() }) {
                    Icon(Icons.Rounded.ChevronLeft, contentDescription = "Previous Month", tint = MaterialTheme.colorScheme.onSurface)
                }
                Text(
                    text = "$monthName $year",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                IconButton(onClick = { haptics.crownTick(); onNextMonth() }) {
                    Icon(Icons.Rounded.ChevronRight, contentDescription = "Next Month", tint = MaterialTheme.colorScheme.onSurface)
                }
            }

            Row(modifier = Modifier.fillMaxWidth()) {
                CAL_DAY_HEADERS.forEach { d ->
                    Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        Text(d, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            cells.forEach { week ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    week.forEach { dayNum ->
                        if (dayNum == null) {
                            Spacer(modifier = Modifier.weight(1f).aspectRatio(1f))
                        } else {
                            val dateStr = String.format(Locale.US, "%04d-%02d-%02d", year, month, dayNum)
                            val summary = calendarMap[dateStr]
                            val isSelected = dateStr == selectedDate
                            val isToday = dateStr == todayIso
                            val cellBg by animateColorAsState(
                                targetValue = when {
                                    isSelected -> SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.30f else 0.18f)
                                    isToday -> SemesterColors.BrandCyan.copy(alpha = if (isDark) 0.14f else 0.10f)
                                    isDark -> Color.White.copy(alpha = 0.03f)
                                    else -> Color(0xFF0F172A).copy(alpha = 0.03f)
                                },
                                animationSpec = tween(180),
                                label = "calCellBg",
                            )
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .aspectRatio(1f)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(cellBg)
                                    .border(
                                        width = if (isSelected || isToday) 1.2.dp else 0.dp,
                                        color = when {
                                            isSelected -> SemesterColors.BrandCobalt
                                            isToday -> SemesterColors.BrandCyan.copy(alpha = 0.55f)
                                            else -> Color.Transparent
                                        },
                                        shape = RoundedCornerShape(12.dp),
                                    )
                                    .clickable {
                                        haptics.crownTick()
                                        onSelectDate(dateStr)
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        text = "$dayNum",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = if (isSelected || isToday) FontWeight.ExtraBold else FontWeight.Medium,
                                        color = if (isSelected) SemesterColors.BrandCobalt else MaterialTheme.colorScheme.onSurface,
                                    )
                                    if (summary != null && summary.total > 0) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                            if (summary.present > 0) Box(Modifier.size(4.dp).clip(CircleShape).background(SemesterColors.SafeEmerald))
                                            if (summary.absent > 0) Box(Modifier.size(4.dp).clip(CircleShape).background(SemesterColors.CriticalCrimson))
                                            if (summary.medical > 0) Box(Modifier.size(4.dp).clip(CircleShape).background(SemesterColors.ElectricBlue))
                                            if (summary.substituted > 0) Box(Modifier.size(4.dp).clip(CircleShape).background(SemesterColors.WarningAmber))
                                            if (summary.cancelled > 0) Box(Modifier.size(4.dp).clip(CircleShape).background(Color(0xFF94A3B8)))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Desktop Calendar Status Legend
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                LegendDot("Present", SemesterColors.SafeEmerald)
                LegendDot("Absent", SemesterColors.CriticalCrimson)
                LegendDot("Med", SemesterColors.ElectricBlue)
                LegendDot("Sub", SemesterColors.WarningAmber)
                LegendDot("Off", Color(0xFF94A3B8))
            }
        }
    }
}

@Composable
private fun LegendDot(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(color))
        Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ─── Add / Edit Timetable Slot Dialog (Full Desktop SlotModal Parity) ────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimetableSlotDialog(
    initialSlot: TimetableDaySlot?,
    defaultDay: String,
    defaultStart: String,
    defaultEnd: String,
    periods: List<TimetablePeriodDef>,
    subjects: List<WorkspaceSubject>,
    haptics: HapticCrownEngine,
    onAddCourseClick: () -> Unit,
    onDismiss: () -> Unit,
    onSave: (day: String, slotType: String, sub: WorkspaceSubject?, label: String, start: String, end: String, room: String) -> Unit,
    onDelete: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val isDark = LocalIsDarkTheme.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var chosenDay by remember(initialSlot?.id, defaultDay) { mutableStateOf(initialSlot?.day ?: defaultDay) }
    var slotType by remember(initialSlot?.id) { mutableStateOf(initialSlot?.slotType?.lowercase()?.ifBlank { "class" } ?: "class") }
    var selectedSub by remember(initialSlot?.id, subjects) {
        mutableStateOf(
            if (initialSlot != null && initialSlot.subjectId.isNotBlank()) {
                subjects.firstOrNull { it.id == initialSlot.subjectId } ?: subjects.firstOrNull()
            } else {
                subjects.firstOrNull()
            },
        )
    }
    var label by remember(initialSlot?.id) { mutableStateOf(initialSlot?.label.orEmpty()) }
    var startTime by remember(initialSlot?.id) { mutableStateOf(initialSlot?.startTime ?: defaultStart) }
    var endTime by remember(initialSlot?.id) { mutableStateOf(initialSlot?.endTime ?: defaultEnd) }
    var customRoom by remember(initialSlot?.id) {
        mutableStateOf(if (initialSlot?.slotType.equals("custom", true)) initialSlot?.room.orEmpty() else "")
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
            Text(
                text = if (initialSlot == null) "Add Class Slot" else "Edit Class Slot",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.ExtraBold,
            )

            // Weekday selector strip
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(WEEK_DAYS) { d ->
                    StudioPillChip(
                        label = d.take(3),
                        selected = chosenDay == d,
                        onClick = {
                            haptics.crownTick()
                            chosenDay = d
                        },
                    )
                }
            }

            RubberSegment(
                options = listOf(
                    SegmentOption("class", "Class"),
                    SegmentOption("break", "Break"),
                    SegmentOption("free", "Free"),
                    SegmentOption("custom", "Custom"),
                ),
                selected = slotType,
                onSelect = {
                    haptics.crownTick()
                    slotType = it
                },
                fillWidth = true,
                modifier = Modifier.fillMaxWidth(),
            )

            if (slotType == "class") {
                if (subjects.isNotEmpty()) {
                    Text("Subject", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(subjects, key = { it.id }) { sub ->
                            val active = selectedSub?.id == sub.id
                            StudioPillChip(
                                label = smartSubjectShortName(sub.name, sub.code),
                                selected = active,
                                onClick = {
                                    haptics.crownTick()
                                    selectedSub = sub
                                },
                            )
                        }
                    }

                    // Live-linked Course Classroom badge (automatically synced with Home Courses)
                    selectedSub?.let { sub ->
                        Surface(
                            color = SemesterColors.BrandCobalt.copy(alpha = if (isDark) 0.14f else 0.08f),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, SemesterColors.BrandCobalt.copy(alpha = 0.28f), RoundedCornerShape(14.dp)),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.LocationOn,
                                    contentDescription = null,
                                    tint = SemesterColors.BrandCyan,
                                    modifier = Modifier.size(18.dp),
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = sub.name,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = if (sub.classroom.isNotBlank()) "Room ${sub.classroom} • Linked from Course" else "No room set • Edit on Home Course",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "Add subjects on Home first so classes and rooms stay linked automatically, or pick Break / Custom.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        GlassSecondaryButton(
                            text = "Add Subject Now",
                            icon = Icons.Rounded.Add,
                            accentTint = SemesterColors.BrandCobalt,
                            onClick = onAddCourseClick,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            } else {
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text("Label (e.g. Lunch Break, Library)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (periods.isNotEmpty()) {
                Text("Period", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(periods, key = { it.id }) { p ->
                        val matches = p.startTime.equals(startTime.trim(), true)
                        StudioPillChip(
                            label = "${p.name} (${p.startTime})",
                            selected = matches,
                            onClick = {
                                haptics.crownTick()
                                startTime = p.startTime
                                endTime = p.endTime
                            },
                        )
                    }
                }
            }

            // Native Android Time Picker Chips (1-tap clock dial — no typing AM/PM!)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                TimePickerFieldChip(
                    label = "Start Time",
                    value = startTime,
                    onClick = {
                        haptics.crownTick()
                        openNativeTimePicker(context, startTime) { startTime = it }
                    },
                    modifier = Modifier.weight(1f),
                )
                TimePickerFieldChip(
                    label = "End Time",
                    value = endTime,
                    onClick = {
                        haptics.crownTick()
                        openNativeTimePicker(context, endTime) { endTime = it }
                    },
                    modifier = Modifier.weight(1f),
                )
            }

            if (slotType == "custom") {
                OutlinedTextField(
                    value = customRoom,
                    onValueChange = { customRoom = it },
                    label = { Text("Location (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (onDelete != null) {
                    DangerPillButton(text = "Delete", onClick = onDelete, modifier = Modifier.weight(0.9f))
                } else {
                    TextButton(onClick = onDismiss, modifier = Modifier.weight(0.7f)) { Text("Cancel") }
                }
                val canSave = startTime.isNotBlank() && endTime.isNotBlank() && (slotType != "class" || selectedSub != null)
                GradientButton(
                    text = "Save Slot",
                    enabled = canSave,
                    onClick = { onSave(chosenDay, slotType, selectedSub, label, startTime, endTime, customRoom) },
                    modifier = Modifier.weight(1.3f),
                )
            }
        }
    }
}

// ─── Timetable Structure Editor Sheet (Desktop StructureModal.tsx Parity) ────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimetableStructureSheet(
    semester: Int,
    currentPeriods: List<TimetablePeriodDef>,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onSave: (List<TimetablePeriodDef>) -> Unit,
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val draft = remember(currentPeriods) {
        mutableStateListOf<TimetablePeriodDef>().apply {
            if (currentPeriods.isNotEmpty()) {
                addAll(currentPeriods)
            } else {
                add(TimetablePeriodDef("p1", "Period 1", "09:00 AM", "10:00 AM"))
            }
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
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Timetable Structure", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
                    Text("${draft.size} period${if (draft.size == 1) "" else "s"} • Sem $semester", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                GlassSecondaryButton(
                    text = "Add Period",
                    icon = Icons.Rounded.Add,
                    accentTint = SemesterColors.BrandCobalt,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 7.dp),
                    onClick = {
                        haptics.crownTick()
                        val idx = draft.size + 1
                        val prevEnd = draft.lastOrNull()?.endTime ?: "09:00 AM"
                        val nextMins = ((parseFlexibleTimeMinutes(prevEnd) ?: 540) + 60).coerceAtMost(22 * 60)
                        draft.add(
                            TimetablePeriodDef(
                                id = "p$idx",
                                name = "Period $idx",
                                startTime = prevEnd,
                                endTime = formatMinutes12h(nextMins),
                            ),
                        )
                    },
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 380.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                draft.forEachIndexed { idx, period ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .liquidGlass(shape = RoundedCornerShape(18.dp))
                            .padding(12.dp),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(30.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(SemesterColors.BrandCobalt.copy(alpha = 0.16f)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("${idx + 1}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.ExtraBold, color = SemesterColors.BrandCobalt)
                                }
                                OutlinedTextField(
                                    value = period.name,
                                    onValueChange = { draft[idx] = period.copy(name = it) },
                                    label = { Text("Slot Name") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                IconButton(
                                    onClick = {
                                        if (draft.size > 1) {
                                            haptics.softDismiss()
                                            draft.removeAt(idx)
                                        }
                                    },
                                ) {
                                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Remove", tint = SemesterColors.CriticalCrimson)
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                TimePickerFieldChip(
                                    label = "Start",
                                    value = period.startTime,
                                    onClick = {
                                        haptics.crownTick()
                                        openNativeTimePicker(context, period.startTime) { picked ->
                                            draft[idx] = period.copy(startTime = picked)
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                )
                                TimePickerFieldChip(
                                    label = "End",
                                    value = period.endTime,
                                    onClick = {
                                        haptics.crownTick()
                                        openNativeTimePicker(context, period.endTime) { picked ->
                                            draft[idx] = period.copy(endTime = picked)
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }
            }

            GradientButton(
                text = "Save Structure",
                onClick = { onSave(draft.toList()) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun TimePickerFieldChip(
    label: String,
    value: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.65f), RoundedCornerShape(14.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        Icon(Icons.Rounded.AccessTime, contentDescription = label, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
    }
}

private fun openNativeTimePicker(context: Context, current12h: String, onPicked: (String) -> Unit) {
    val totalMins = parseFlexibleTimeMinutes(current12h) ?: (9 * 60)
    val initHour = (totalMins / 60).coerceIn(0, 23)
    val initMin = (totalMins % 60).coerceIn(0, 59)
    TimePickerDialog(
        context,
        { _, hourOfDay, minute ->
            onPicked(formatMinutes12h(hourOfDay * 60 + minute))
        },
        initHour,
        initMin,
        false,
    ).show()
}

private fun openNativeDatePicker(context: Context, currentIsoDate: String, onPicked: (String) -> Unit) {
    val cal = Calendar.getInstance()
    currentIsoDate.split("-").takeIf { it.size == 3 }?.let { parts ->
        val y = parts[0].toIntOrNull()
        val m = parts[1].toIntOrNull()
        val d = parts[2].toIntOrNull()
        if (y != null && m != null && d != null) cal.set(y, m - 1, d)
    }
    DatePickerDialog(
        context,
        { _, year, month, dayOfMonth ->
            onPicked(String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, dayOfMonth))
        },
        cal.get(Calendar.YEAR),
        cal.get(Calendar.MONTH),
        cal.get(Calendar.DAY_OF_MONTH),
    ).show()
}

// ─── Unified 2-Tab QR Hub Sheet (Share Timetable + Offline Scan/Import) ─────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimetableQrHubSheet(
    semester: Int,
    initialTab: String,
    timetable: TimetableData,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onAddFirstSlot: () -> Unit,
    onCopyCode: (String) -> Unit,
    onShareCode: (String) -> Unit,
    onScanCamera: () -> Unit,
    onScanGallery: () -> Unit,
    onImportCode: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var activeTab by remember(initialTab) { mutableStateOf(initialTab) } // "share" | "import"
    var pastedCode by remember { mutableStateOf("") }
    var qrPayload by remember(timetable) { mutableStateOf("") }
    var qrImage by remember(timetable) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }

    LaunchedEffect(timetable, activeTab) {
        if (activeTab == "share" && timetable.allSlots.isNotEmpty() && qrPayload.isBlank()) {
            val payload = runCatching { repo.exportTimetableQrV2(semester) }.getOrDefault("")
            qrPayload = payload
            if (payload.isNotBlank()) {
                qrImage = withContext(Dispatchers.Default) {
                    runCatching {
                        val matrix = QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 680, 680)
                        val bmp = Bitmap.createBitmap(680, 680, Bitmap.Config.ARGB_8888)
                        for (x in 0 until 680) {
                            for (y in 0 until 680) {
                                bmp.setPixel(x, y, if (matrix[x, y]) AndroidColor.BLACK else AndroidColor.WHITE)
                            }
                        }
                        bmp.asImageBitmap()
                    }.getOrNull()
                }
            }
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
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column {
                Text("SEMESTER $semester • OFFLINE QR TRANSFER", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Text("Timetable QR Hub", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
            }

            RubberSegment(
                options = listOf(
                    SegmentOption("share", "Share Timetable", icon = Icons.Rounded.QrCode2),
                    SegmentOption("import", "Scan & Import", icon = Icons.Rounded.QrCodeScanner),
                ),
                selected = activeTab,
                onSelect = {
                    haptics.crownTick()
                    activeTab = it
                },
                fillWidth = true,
                modifier = Modifier.fillMaxWidth(),
            )

            AnimatedContent(
                targetState = activeTab,
                transitionSpec = { SemesterPageMotion.modeTransition(forward = targetState == "import") },
                label = "QrHubTabTransition",
            ) { tab ->
                if (tab == "share") {
                    if (timetable.allSlots.isEmpty()) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .liquidGlass(shape = RoundedCornerShape(22.dp))
                                .padding(22.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.QrCode2,
                                contentDescription = null,
                                tint = SemesterColors.BrandCyan,
                                modifier = Modifier.size(36.dp),
                            )
                            Text(
                                text = "Add at least 1 timetable slot first",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = "Once you add classes to Sem $semester, your complete schedule & courses pack into one offline QR code anyone can scan — even with a completely separate local database.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            GradientButton(
                                text = "Add First Slot",
                                icon = Icons.Rounded.Add,
                                onClick = onAddFirstSlot,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    } else {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(22.dp))
                                    .background(Color.White)
                                    .padding(14.dp),
                            ) {
                                val bmp = qrImage
                                if (bmp != null) {
                                    Image(
                                        bitmap = bmp,
                                        contentDescription = "Semester $semester Timetable QR",
                                        modifier = Modifier.size(220.dp),
                                    )
                                } else {
                                    Box(modifier = Modifier.size(220.dp), contentAlignment = Alignment.Center) {
                                        Text("Generating QR…", color = Color(0xFF0B1020), style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                            Text(
                                text = "${timetable.allSlots.size} slots • ${timetable.periods.size} periods • Auto-creates & links courses on any phone or desktop",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                GradientButton(
                                    text = "Copy Code",
                                    icon = Icons.Rounded.ContentCopy,
                                    enabled = qrPayload.isNotBlank(),
                                    onClick = { onCopyCode(qrPayload) },
                                    modifier = Modifier.weight(1f),
                                )
                                GlassSecondaryButton(
                                    text = "Share",
                                    icon = Icons.Rounded.Share,
                                    accentTint = SemesterColors.BrandCyan,
                                    onClick = { if (qrPayload.isNotBlank()) onShareCode(qrPayload) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "Scan a friend's phone or your Desktop QR — works 100% offline. Matching courses link automatically and missing ones are added to Sem $semester.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            GradientButton(
                                text = "Live Camera",
                                icon = Icons.Rounded.CameraAlt,
                                onClick = {
                                    haptics.focusSnap()
                                    onScanCamera()
                                },
                                modifier = Modifier.weight(1f),
                            )
                            GlassSecondaryButton(
                                text = "From Gallery",
                                icon = Icons.Rounded.ImageSearch,
                                accentTint = SemesterColors.BrandCyan,
                                onClick = {
                                    haptics.crownTick()
                                    onScanGallery()
                                },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
                        Text("Or paste a shared timetable code", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedTextField(
                            value = pastedCode,
                            onValueChange = { pastedCode = it },
                            label = { Text("SEMQR2:... code") },
                            minLines = 2,
                            maxLines = 4,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        GradientButton(
                            text = "Import into Sem $semester",
                            enabled = pastedCode.isNotBlank(),
                            onClick = { onImportCode(pastedCode) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}

// ─── Interactive Day Attendance Popup Sheet (Desktop AttendanceModal Parity) ─

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun CalendarDayAttendanceSheet(
    date: String,
    semester: Int,
    subjects: List<WorkspaceSubject>,
    scheduledClasses: List<TodayClassItem>,
    dayLogs: List<AttendanceLogEntry>,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onStepDay: (Int) -> Unit,
    onJumpDate: (String) -> Unit,
    onAddCourseClick: () -> Unit,
    onMarkScheduled: (TodayClassItem, status: String, notes: String, subBy: String) -> Unit,
    onBulkAction: (status: String, notes: String) -> Unit,
    onClearDay: () -> Unit,
    onOpenLogExtra: () -> Unit,
    onEditLog: (AttendanceLogEntry) -> Unit,
    onDeleteLog: (AttendanceLogEntry) -> Unit,
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val isToday = remember(date) { date == WorkspaceRepository.todayIsoDate() }
    val prettyDate = remember(date) { formatPrettyIsoDate(date) }
    var expandedKey by remember(date) { mutableStateOf<String?>(null) }
    var detailStatus by remember(date) { mutableStateOf("approved_medical") }
    var detailNotes by remember(date) { mutableStateOf("") }
    var detailSubBy by remember(date) { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 600.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .padding(bottom = 26.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Day Navigation Header (< Prev | Tappable Date Picker | Next >)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GlassIconButton(
                    icon = Icons.Rounded.ChevronLeft,
                    contentDescription = "Previous Day",
                    size = 36.dp,
                    onClick = {
                        haptics.crownTick()
                        onStepDay(-1)
                    },
                )
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .clip(RoundedCornerShape(14.dp))
                        .clickable {
                            haptics.crownTick()
                            openNativeDatePicker(context, date, onJumpDate)
                        }
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = prettyDate,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        if (isToday) {
                            Surface(
                                color = SemesterColors.BrandCyan.copy(alpha = 0.20f),
                                shape = CircleShape,
                            ) {
                                Text(
                                    text = "Today",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                    color = SemesterColors.BrandCyan,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                    Text(
                        text = "${scheduledClasses.size} scheduled • ${dayLogs.size} logged • Tap date to jump",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                GlassIconButton(
                    icon = Icons.Rounded.ChevronRight,
                    contentDescription = "Next Day",
                    size = 36.dp,
                    onClick = {
                        haptics.crownTick()
                        onStepDay(1)
                    },
                )
            }

            if (subjects.isEmpty()) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .liquidGlass(shape = RoundedCornerShape(22.dp))
                        .padding(22.dp),
                ) {
                    Text(
                        text = "No courses in Semester $semester yet",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = "Add your courses first to mark daily Present, Absent, Medical, or Substituted attendance.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    GradientButton(
                        text = "Add First Course",
                        icon = Icons.Rounded.Add,
                        onClick = onAddCourseClick,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            } else {
                // Quick Bulk Row (uniform pill geometry — no Holiday clutter)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                ) {
                    GlassSecondaryButton(
                        text = "All Present",
                        icon = Icons.Rounded.DoneAll,
                        accentTint = SemesterColors.SafeEmerald,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        onClick = { onBulkAction("present", "") },
                    )
                    GlassSecondaryButton(
                        text = "All Absent",
                        icon = Icons.Rounded.Close,
                        accentTint = SemesterColors.CriticalCrimson,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        onClick = { onBulkAction("absent", "") },
                    )
                    if (dayLogs.isNotEmpty()) {
                        DangerPillButton(
                            text = "Clear (${dayLogs.size})",
                            icon = Icons.Rounded.DeleteSweep,
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                            onClick = onClearDay,
                        )
                    }
                }

                // Scheduled Classes for Date — exact Desktop AttendanceModal parity (✓ / ✕ / ••• More Status!)
                if (scheduledClasses.isNotEmpty()) {
                    Text(
                        text = "SCHEDULED CLASSES",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 0.9.sp,
                    )
                    scheduledClasses.forEach { cls ->
                        val rowKey = "${cls.id}_${cls.startTime}"
                        val isExpanded = expandedKey == rowKey
                        val tint = when (cls.markedStatus) {
                            "present", "late", "duty" -> SemesterColors.SafeEmerald
                            "absent" -> SemesterColors.CriticalCrimson
                            "approved_medical", "medical" -> SemesterColors.ElectricBlue
                            "substituted" -> SemesterColors.WarningAmber
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        }
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .liquidGlass(shape = RoundedCornerShape(16.dp), accentTint = if (cls.marked) tint else null)
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = cls.subjectName.ifBlank { "Class" },
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = "${cls.startTime} – ${cls.endTime}" + (cls.markedStatus?.let { " • ${it.replace("approved_", "").replaceFirstChar { c -> c.uppercase() }}" } ?: ""),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = if (cls.marked) tint else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (cls.subjectId.isNotBlank()) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Box(
                                            modifier = Modifier
                                                .size(34.dp)
                                                .clip(CircleShape)
                                                .background(SemesterColors.SafeEmerald.copy(alpha = if (cls.markedStatus == "present") 0.36f else 0.14f))
                                                .border(1.dp, SemesterColors.SafeEmerald.copy(alpha = 0.6f), CircleShape)
                                                .clickable {
                                                    expandedKey = null
                                                    onMarkScheduled(cls, "present", "", "")
                                                },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(Icons.Rounded.Check, contentDescription = "Present", tint = SemesterColors.SafeEmerald, modifier = Modifier.size(17.dp))
                                        }
                                        Box(
                                            modifier = Modifier
                                                .size(34.dp)
                                                .clip(CircleShape)
                                                .background(SemesterColors.CriticalCrimson.copy(alpha = if (cls.markedStatus == "absent") 0.36f else 0.14f))
                                                .border(1.dp, SemesterColors.CriticalCrimson.copy(alpha = 0.6f), CircleShape)
                                                .clickable {
                                                    expandedKey = null
                                                    onMarkScheduled(cls, "absent", "", "")
                                                },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(Icons.Rounded.Close, contentDescription = "Absent", tint = SemesterColors.CriticalCrimson, modifier = Modifier.size(17.dp))
                                        }
                                        Box(
                                            modifier = Modifier
                                                .size(34.dp)
                                                .clip(CircleShape)
                                                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = if (isExpanded) 0.18f else 0.07f))
                                                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f), CircleShape)
                                                .clickable {
                                                    haptics.crownTick()
                                                    if (isExpanded) {
                                                        expandedKey = null
                                                    } else {
                                                        expandedKey = rowKey
                                                        detailStatus = cls.markedStatus?.takeIf { it !in listOf("present", "absent") } ?: "approved_medical"
                                                        detailNotes = ""
                                                        detailSubBy = ""
                                                    }
                                                },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(Icons.Rounded.MoreHoriz, contentDescription = "Medical / Substituted / Cancelled", tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(17.dp))
                                        }
                                    }
                                }
                            }

                            // Inline Detailed Status Drawer (Medical / Substituted + Picker / Cancelled + Notes — Desktop AttendanceModal parity!)
                            if (isExpanded) {
                                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    listOf(
                                        Triple("approved_medical", "Medical Leave", SemesterColors.ElectricBlue),
                                        Triple("substituted", "Substituted", SemesterColors.WarningAmber),
                                        Triple("cancelled", "Cancelled", Color(0xFF94A3B8)),
                                    ).forEach { (key, lbl, colorTint) ->
                                        val active = detailStatus == key
                                        Box(
                                            modifier = Modifier
                                                .clip(CircleShape)
                                                .background(colorTint.copy(alpha = if (active) 0.30f else 0.12f))
                                                .border(if (active) 1.5.dp else 1.dp, colorTint.copy(alpha = if (active) 0.9f else 0.45f), CircleShape)
                                                .clickable {
                                                    haptics.crownTick()
                                                    detailStatus = key
                                                }
                                                .padding(horizontal = 11.dp, vertical = 6.dp),
                                        ) {
                                            Text(lbl, style = MaterialTheme.typography.labelSmall, color = colorTint, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                                if (detailStatus == "substituted") {
                                    val peers = subjects.filter { it.id != cls.subjectId }
                                    Text(
                                        text = "Substituted By (Select Enrolled Course)",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = SemesterColors.WarningAmber,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    if (peers.isNotEmpty()) {
                                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            items(peers, key = { "csub_${it.id}" }) { peer ->
                                                StudioPillChip(
                                                    label = smartSubjectShortName(peer.name, peer.code),
                                                    selected = detailSubBy == peer.name,
                                                    onClick = { haptics.crownTick(); detailSubBy = peer.name },
                                                )
                                            }
                                        }
                                    } else {
                                        Text(
                                            text = "Add another course on Dashboard to link a substitute.",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                OutlinedTextField(
                                    value = detailNotes,
                                    onValueChange = { detailNotes = it },
                                    label = { Text("Note (optional)") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                GradientButton(
                                    text = "Save Status",
                                    onClick = {
                                        onMarkScheduled(
                                            cls,
                                            detailStatus,
                                            detailNotes.trim(),
                                            if (detailStatus == "substituted") detailSubBy.trim() else "",
                                        )
                                        expandedKey = null
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }

                // Recorded Logs on Date
                if (dayLogs.isNotEmpty()) {
                    Text(
                        text = "RECORDED ATTENDANCE",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 0.9.sp,
                    )
                    dayLogs.forEach { log ->
                        val tint = when (log.status) {
                            "present", "late", "duty" -> SemesterColors.SafeEmerald
                            "absent" -> SemesterColors.CriticalCrimson
                            "approved_medical", "medical" -> SemesterColors.ElectricBlue
                            "substituted" -> SemesterColors.WarningAmber
                            else -> Color(0xFF94A3B8)
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .liquidGlass(shape = RoundedCornerShape(16.dp), accentTint = tint)
                                .clickable { onEditLog(log) }
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = log.subjectName.ifBlank { "Course" },
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Text(
                                    text = buildString {
                                        append(log.status.replace("approved_", "").replace("_", " ").replaceFirstChar { it.uppercase() })
                                        if (log.substitutedBy.isNotBlank()) append(" • by ${log.substitutedBy}")
                                        else if (log.notes.isNotBlank()) append(" • ${log.notes}")
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tint,
                                )
                            }
                            IconButton(onClick = { onDeleteLog(log) }, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete", tint = SemesterColors.CriticalCrimson, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }

                GradientButton(
                    text = "Log Extra / Medical / Substituted",
                    icon = Icons.Rounded.Add,
                    onClick = onOpenLogExtra,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

private fun shiftIsoDate(isoDate: String, deltaDays: Int): String = runCatching {
    val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val parsed = fmt.parse(isoDate) ?: Date()
    val cal = Calendar.getInstance().apply {
        time = parsed
        add(Calendar.DAY_OF_YEAR, deltaDays)
    }
    fmt.format(cal.time)
}.getOrDefault(isoDate)

private fun formatPrettyIsoDate(isoDate: String): String = runCatching {
    val inFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val outFmt = SimpleDateFormat("EEE, dd MMM yyyy", Locale.ENGLISH)
    outFmt.format(inFmt.parse(isoDate) ?: return isoDate)
}.getOrDefault(isoDate)

// ─── Quick Calendar Extra Log Dialog (with Substituted By picker) ────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuickCalendarLogDialog(
    date: String,
    subjects: List<WorkspaceSubject>,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onConfirm: (WorkspaceSubject, String, String, String) -> Unit,
) {
    var selectedSub by remember { mutableStateOf(subjects.first()) }
    var selectedStatus by remember { mutableStateOf("present") }
    var note by remember { mutableStateOf("") }
    var substitutedBy by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Log for $date", color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Course", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(subjects, key = { it.id }) { sub ->
                        StudioPillChip(
                            label = smartSubjectShortName(sub.name, sub.code),
                            selected = selectedSub.id == sub.id,
                            onClick = {
                                haptics.crownTick()
                                selectedSub = sub
                            },
                        )
                    }
                }
                Text("Status", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(
                        Triple("present", "Present", SemesterColors.SafeEmerald),
                        Triple("absent", "Absent", SemesterColors.CriticalCrimson),
                        Triple("approved_medical", "Medical", SemesterColors.ElectricBlue),
                        Triple("substituted", "Substituted", SemesterColors.WarningAmber),
                        Triple("cancelled", "Cancelled", Color(0xFF94A3B8)),
                    ).forEach { (statusKey, label, tint) ->
                        val active = selectedStatus == statusKey
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(tint.copy(alpha = if (active) 0.30f else 0.12f))
                                .border(if (active) 1.5.dp else 1.dp, tint.copy(alpha = if (active) 0.9f else 0.45f), CircleShape)
                                .clickable {
                                    haptics.crownTick()
                                    selectedStatus = statusKey
                                }
                                .padding(horizontal = 12.dp, vertical = 7.dp),
                        ) {
                            Text(label, style = MaterialTheme.typography.labelSmall, color = tint, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                if (selectedStatus == "substituted") {
                    Text("Substituted By (Select Enrolled Course)", style = MaterialTheme.typography.labelSmall, color = SemesterColors.WarningAmber, fontWeight = FontWeight.SemiBold)
                    val others = subjects.filter { it.id != selectedSub.id }
                    if (others.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(others, key = { "sub_${it.id}" }) { sub ->
                                StudioPillChip(
                                    label = smartSubjectShortName(sub.name, sub.code),
                                    selected = substitutedBy == sub.name,
                                    onClick = {
                                        haptics.crownTick()
                                        substitutedBy = sub.name
                                    },
                                )
                            }
                        }
                    } else {
                        Text(
                            text = "Add another course on Dashboard to link a substitute.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Optional Note (e.g. Lab Viva)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            GradientButton(
                text = "Record",
                onClick = { onConfirm(selectedSub, selectedStatus, note, if (selectedStatus == "substituted") substitutedBy else "") },
            )
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(24.dp),
    )
}

// ─── Full Edit Attendance Log Dialog ─────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EditAttendanceLogDialog(
    log: AttendanceLogEntry,
    subjects: List<WorkspaceSubject>,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onSave: (status: String, note: String, subBy: String) -> Unit,
    onDelete: () -> Unit,
) {
    var status by remember(log.id) { mutableStateOf(log.status) }
    var note by remember(log.id) { mutableStateOf(log.notes) }
    var subBy by remember(log.id) { mutableStateOf(log.substitutedBy) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(log.subjectName.ifBlank { "Attendance Record" }, fontWeight = FontWeight.Bold)
                Text(log.date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(
                        Triple("present", "Present", SemesterColors.SafeEmerald),
                        Triple("absent", "Absent", SemesterColors.CriticalCrimson),
                        Triple("approved_medical", "Medical", SemesterColors.ElectricBlue),
                        Triple("substituted", "Substituted", SemesterColors.WarningAmber),
                        Triple("cancelled", "Cancelled", Color(0xFF94A3B8)),
                    ).forEach { (key, label, tint) ->
                        val active = status == key || (key == "approved_medical" && status == "medical")
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(tint.copy(alpha = if (active) 0.30f else 0.12f))
                                .border(if (active) 1.5.dp else 1.dp, tint.copy(alpha = if (active) 0.9f else 0.45f), CircleShape)
                                .clickable {
                                    haptics.crownTick()
                                    status = key
                                }
                                .padding(horizontal = 12.dp, vertical = 7.dp),
                        ) {
                            Text(label, style = MaterialTheme.typography.labelSmall, color = tint, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (status == "substituted") {
                    Text("Substituted By (Select Enrolled Course)", style = MaterialTheme.typography.labelSmall, color = SemesterColors.WarningAmber, fontWeight = FontWeight.SemiBold)
                    val others = subjects.filter { it.id != log.subjectId }
                    if (others.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(others, key = { "esub_${it.id}" }) { s ->
                                StudioPillChip(
                                    label = smartSubjectShortName(s.name, s.code),
                                    selected = subBy == s.name,
                                    onClick = { haptics.crownTick(); subBy = s.name },
                                )
                            }
                        }
                    } else {
                        Text(
                            text = "Add another course on Dashboard to link a substitute.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Notes") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            GradientButton(
                text = "Update",
                onClick = { onSave(status, note, if (status == "substituted") subBy else "") },
            )
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                DangerPillButton(text = "Delete", onClick = onDelete)
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(24.dp),
    )
}

private fun formatMinutes12h(totalMinutes: Int): String {
    val h24 = (totalMinutes / 60).coerceIn(0, 23)
    val m = (totalMinutes % 60).coerceIn(0, 59)
    val ampm = if (h24 >= 12) "PM" else "AM"
    val h12 = when {
        h24 == 0 -> 12
        h24 > 12 -> h24 - 12
        else -> h24
    }
    return String.format(Locale.US, "%02d:%02d %s", h12, m, ampm)
}

private fun decodeQrFromUri(context: Context, uri: Uri): String? = runCatching {
    val opts = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    val bmp = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        ?: return@runCatching null
    val maxSide = 1280
    val scaled = if (bmp.width > maxSide || bmp.height > maxSide) {
        val ratio = maxSide.toFloat() / maxOf(bmp.width, bmp.height).toFloat()
        Bitmap.createScaledBitmap(bmp, (bmp.width * ratio).roundToInt(), (bmp.height * ratio).roundToInt(), true)
    } else bmp
    val pixels = IntArray(scaled.width * scaled.height)
    scaled.getPixels(pixels, 0, scaled.width, 0, 0, scaled.width, scaled.height)
    val source = RGBLuminanceSource(scaled.width, scaled.height, pixels)
    val binary = BinaryBitmap(HybridBinarizer(source))
    MultiFormatReader().decode(binary).text
}.getOrNull()
