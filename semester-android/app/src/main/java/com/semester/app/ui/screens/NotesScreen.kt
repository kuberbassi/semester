package com.semester.app.ui.screens

import android.app.DatePickerDialog
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.EventNote
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.NoteTodoItem
import com.semester.app.core.WorkspaceNote
import com.semester.app.core.WorkspaceRepository
import com.semester.app.core.WorkspaceSubject
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.DangerPillButton
import com.semester.app.ui.components.GlassIconButton
import com.semester.app.ui.components.GlassSecondaryButton
import com.semester.app.ui.components.GradientButton
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.RubberSegment
import com.semester.app.ui.components.ScrollForwardHint
import com.semester.app.ui.components.SegmentOption
import com.semester.app.ui.components.StudioPillChip
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.components.pressable
import com.semester.app.ui.theme.SemesterColors
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

private enum class NoteFilter(val label: String) {
    ALL("All"),
    NOTES("Notes"),
    TODOS("Checklists"),
    EXAMS("Exam Dates"),
    ARCHIVED("Archived"),
}

@Composable
fun NotesScreen(
    dataVersion: Long,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    subjects: List<WorkspaceSubject> = emptyList(),
    embeddedInHub: Boolean = false,
) {
    val scope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current

    var notes by remember { mutableStateOf<List<WorkspaceNote>>(emptyList()) }
    var search by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(NoteFilter.ALL) }
    var editingNote by remember { mutableStateOf<WorkspaceNote?>(null) }

    fun loadNotes() {
        scope.launch { notes = repo.getNotes() }
    }

    LaunchedEffect(dataVersion) { loadNotes() }

    val filtered = remember(notes, search, filter) {
        val q = search.trim().lowercase()
        notes.filter { n ->
            val matchFilter = when (filter) {
                NoteFilter.ALL -> !n.isArchived
                NoteFilter.NOTES -> !n.isArchived && !n.isTodo
                NoteFilter.TODOS -> !n.isArchived && n.isTodo
                NoteFilter.EXAMS -> !n.isArchived && n.isTodo && (n.isExamMode || n.todos.any { it.examDate.isNotBlank() })
                NoteFilter.ARCHIVED -> n.isArchived
            }
            val matchQuery = q.isEmpty() ||
                n.title.lowercase().contains(q) ||
                n.content.lowercase().contains(q) ||
                n.todos.any {
                    it.text.lowercase().contains(q) ||
                        it.subject.lowercase().contains(q) ||
                        it.examDate.lowercase().contains(q)
                }
            matchFilter && matchQuery
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .then(
                if (embeddedInHub) Modifier
                else Modifier.background(MaterialTheme.colorScheme.background),
            ),
    ) {
        if (!embeddedInHub) {
            AmbientTopGlow(
                color = SemesterColors.WarningAmber,
                peakAlpha = 0.20f,
                height = 280.dp,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
            contentPadding = PaddingValues(bottom = 132.dp),
        ) {
            if (!embeddedInHub) {
                item(key = "notes_header") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .windowInsetsPadding(WindowInsets.statusBars)
                            .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "SYNCED WORKSPACE",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                letterSpacing = 1.1.sp,
                            )
                            Text(
                                text = "Notes & Checklists",
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            GlassIconButton(
                                icon = Icons.Rounded.Checklist,
                                contentDescription = "New Checklist",
                                size = 40.dp,
                                accentTint = SemesterColors.ElectricBlue,
                                onClick = {
                                    haptics.crownTick()
                                    editingNote = WorkspaceNote(id = "", title = "", isTodo = true, todos = emptyList())
                                },
                            )
                            GlassIconButton(
                                icon = Icons.Rounded.Add,
                                contentDescription = "New Note",
                                size = 40.dp,
                                accentTint = SemesterColors.WarningAmber,
                                onClick = {
                                    haptics.crownTick()
                                    editingNote = WorkspaceNote(id = "", title = "", isTodo = false)
                                },
                            )
                        }
                    }
                }
            }

            item(key = "notes_search") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = search,
                        onValueChange = { search = it },
                        placeholder = { Text("Search notes & exam dates...") },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                        singleLine = true,
                        shape = CircleShape,
                        modifier = Modifier.weight(1f),
                    )
                    if (embeddedInHub) {
                        GlassIconButton(
                            icon = Icons.Rounded.Checklist,
                            contentDescription = "New Checklist or Exam Datesheet",
                            size = 40.dp,
                            accentTint = SemesterColors.ElectricBlue,
                            onClick = {
                                haptics.focusSnap()
                                editingNote = WorkspaceNote(id = "", title = "", isTodo = true, todos = emptyList())
                            },
                        )
                        GlassIconButton(
                            icon = Icons.Rounded.Add,
                            contentDescription = "New Note",
                            size = 40.dp,
                            accentTint = SemesterColors.WarningAmber,
                            onClick = {
                                haptics.focusSnap()
                                editingNote = WorkspaceNote(id = "", title = "", isTodo = false)
                            },
                        )
                    }
                }
            }

            item(key = "notes_filters") {
                val filterRowState = rememberLazyListState()
                val canScrollFilters by remember { derivedStateOf { filterRowState.canScrollForward } }
                Column(modifier = Modifier.padding(top = 6.dp, bottom = 4.dp)) {
                    LazyRow(
                        state = filterRowState,
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(NoteFilter.entries, key = { it.name }) { opt ->
                            StudioPillChip(
                                label = opt.label,
                                selected = filter == opt,
                                onClick = {
                                    haptics.crownTick()
                                    filter = opt
                                },
                            )
                        }
                    }
                    ScrollForwardHint(visible = canScrollFilters)
                }
            }

            if (filtered.isEmpty()) {
                item(key = "notes_empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 16.dp)
                            .liquidGlass(shape = RoundedCornerShape(24.dp))
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = when (filter) {
                                    NoteFilter.EXAMS -> "No exam or practical datesheets yet. Create a checklist with Exam Mode enabled to get Google-Calendar-style exam reminders."
                                    else -> "Create a quick note, task checklist, or exam datesheet."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                GradientButton(
                                    text = "Exam Datesheet",
                                    icon = Icons.Rounded.EventNote,
                                    onClick = {
                                        haptics.focusSnap()
                                        editingNote = WorkspaceNote(
                                            id = "",
                                            title = "Exam Datesheet",
                                            isTodo = true,
                                            category = "exam",
                                            color = "blue",
                                            todos = emptyList(),
                                        )
                                    },
                                )
                                GlassSecondaryButton(
                                    text = "New Note",
                                    icon = Icons.Rounded.Add,
                                    onClick = {
                                        haptics.crownTick()
                                        editingNote = WorkspaceNote(id = "", title = "", isTodo = false)
                                    },
                                )
                            }
                        }
                    }
                }
            } else {
                items(filtered, key = { it.id }) { note ->
                    NoteGlassCard(
                        note = note,
                        onClick = {
                            haptics.crownTick()
                            editingNote = note
                        },
                        onToggleTodo = { todoId ->
                            haptics.crownTick()
                            val updatedTodos = note.todos.map {
                                if (it.id == todoId) it.copy(completed = !it.completed) else it
                            }
                            scope.launch {
                                repo.saveNote(note.copy(todos = updatedTodos))
                                loadNotes()
                            }
                        },
                        onTogglePin = {
                            haptics.crownTick()
                            scope.launch {
                                repo.saveNote(note.copy(isPinned = !note.isPinned))
                                loadNotes()
                            }
                        },
                    )
                }
            }
        }
    }

    editingNote?.let { draft ->
        NoteEditorSheet(
            initial = draft,
            subjects = subjects,
            haptics = haptics,
            onDismiss = { editingNote = null },
            onSave = { updated ->
                scope.launch {
                    repo.saveNote(updated)
                    haptics.attendanceSuccess()
                    editingNote = null
                    loadNotes()
                }
            },
            onDelete = { id ->
                scope.launch {
                    repo.deleteNote(id)
                    haptics.selectionConfirm()
                    editingNote = null
                    loadNotes()
                }
            },
        )
    }
}

@Composable
private fun NoteGlassCard(
    note: WorkspaceNote,
    onClick: () -> Unit,
    onToggleTodo: (String) -> Unit,
    onTogglePin: () -> Unit,
) {
    val isExam = note.isExamMode || note.todos.any { it.examDate.isNotBlank() }
    val accent = when (note.color.lowercase()) {
        "emerald", "green" -> SemesterColors.SafeEmerald
        "blue", "sky" -> SemesterColors.ElectricBlue
        "violet", "purple" -> SemesterColors.ElectricViolet
        "rose", "red" -> SemesterColors.CriticalCrimson
        "amber", "yellow" -> SemesterColors.WarningAmber
        else -> when {
            isExam -> SemesterColors.BrandCyanSoft
            note.isPinned -> SemesterColors.WarningAmber
            else -> null
        }
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp)
            .pressable(onClick = onClick, pressedScale = 0.98f)
            .liquidGlass(shape = RoundedCornerShape(22.dp), accentTint = accent)
            .padding(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = note.title.ifBlank { if (isExam) "Exam Datesheet" else "Untitled Note" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (isExam) {
                        Surface(
                            color = SemesterColors.BrandCyan.copy(alpha = 0.18f),
                            shape = CircleShape,
                        ) {
                            Text(
                                text = "EXAM MODE",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.5.sp),
                                fontWeight = FontWeight.ExtraBold,
                                color = SemesterColors.BrandCyanSoft,
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                            )
                        }
                    }
                }
                IconButton(onClick = onTogglePin, modifier = Modifier.size(30.dp)) {
                    Icon(
                        imageVector = Icons.Rounded.PushPin,
                        contentDescription = "Pin",
                        tint = if (note.isPinned) SemesterColors.WarningAmber else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            if (note.isTodo && note.todos.isNotEmpty()) {
                val sortedTodos = remember(note.todos, isExam) {
                    if (isExam) note.todos.sortedWith(compareBy<NoteTodoItem> { it.completed }.thenBy { it.examDate.ifBlank { "9999-99-99" } })
                    else note.todos
                }
                sortedTodos.take(6).forEach { item ->
                    val badge = examCountdownBadge(item.examDate, item.completed)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { onToggleTodo(item.id) }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = if (item.completed) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                            contentDescription = null,
                            tint = if (item.completed) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp),
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            val titleText = if (item.subject.isNotBlank()) {
                                if (item.text.isNotBlank() && !item.text.equals(item.subject, true)) {
                                    "${item.subject} • ${item.text}"
                                } else item.subject
                            } else {
                                item.text.ifBlank { "(untitled item)" }
                            }
                            Text(
                                text = titleText,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = if (item.subject.isNotBlank()) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (item.completed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                                textDecoration = if (item.completed) TextDecoration.LineThrough else TextDecoration.None,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (item.examDate.isNotBlank()) {
                                Text(
                                    text = formatPrettyDate(item.examDate),
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (badge != null) {
                            Surface(color = badge.second.copy(alpha = 0.16f), shape = CircleShape) {
                                Text(
                                    text = badge.first,
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                    fontWeight = FontWeight.Bold,
                                    color = badge.second,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                }
            } else if (note.content.isNotBlank()) {
                Text(
                    text = note.content,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NoteEditorSheet(
    initial: WorkspaceNote,
    subjects: List<WorkspaceSubject>,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
    onSave: (WorkspaceNote) -> Unit,
    onDelete: (String) -> Unit,
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var title by remember(initial.id) { mutableStateOf(initial.title) }
    var content by remember(initial.id) { mutableStateOf(initial.content) }
    var isTodo by remember(initial.id) { mutableStateOf(initial.isTodo) }
    var examMode by remember(initial.id) {
        mutableStateOf(initial.isExamMode || initial.todos.any { it.examDate.isNotBlank() })
    }
    var isPinned by remember(initial.id) { mutableStateOf(initial.isPinned) }
    var isArchived by remember(initial.id) { mutableStateOf(initial.isArchived) }
    var color by remember(initial.id) { mutableStateOf(initial.color) }
    var todos by remember(initial.id) {
        mutableStateOf(initial.todos.filter { it.text.isNotBlank() || it.subject.isNotBlank() || it.examDate.isNotBlank() })
    }

    // Normal checklist input
    var newTodoText by remember { mutableStateOf("") }

    // Exam Mode inputs (Subject + Date + optional Exam Type)
    var examSubject by remember { mutableStateOf("") }
    var examDateIso by remember { mutableStateOf(WorkspaceRepository.todayIsoDate()) }
    var examLabel by remember { mutableStateOf("End-Sem") }

    val colorOptions = listOf(
        "" to MaterialTheme.colorScheme.outline,
        "amber" to SemesterColors.WarningAmber,
        "blue" to SemesterColors.ElectricBlue,
        "emerald" to SemesterColors.SafeEmerald,
        "violet" to SemesterColors.ElectricViolet,
        "rose" to SemesterColors.CriticalCrimson,
    )

    fun openExamDatePicker() {
        val cal = Calendar.getInstance()
        runCatching {
            val parsed = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(examDateIso)
            if (parsed != null) cal.time = parsed
        }
        DatePickerDialog(
            context,
            { _, y, m, d ->
                examDateIso = String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d)
                haptics.crownTick()
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH),
        ).show()
    }

    fun addNormalTodo() {
        val clean = newTodoText.trim()
        if (clean.isEmpty()) return
        todos = todos + NoteTodoItem(id = UUID.randomUUID().toString(), text = clean, completed = false)
        newTodoText = ""
        haptics.crownTick()
    }

    fun addExamItem() {
        val subj = examSubject.trim()
        if (subj.isEmpty()) return
        val lbl = examLabel.trim().ifBlank { "Exam" }
        val next = todos + NoteTodoItem(
            id = UUID.randomUUID().toString(),
            text = lbl,
            completed = false,
            subject = subj,
            examDate = examDateIso.trim(),
        )
        todos = next.sortedBy { it.examDate.ifBlank { "9999-99-99" } }
        examSubject = ""
        haptics.attendanceSuccess()
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = when {
                        initial.id.isBlank() && isTodo && examMode -> "New Exam Datesheet"
                        initial.id.isBlank() && isTodo -> "New Checklist"
                        initial.id.isBlank() -> "New Note"
                        else -> "Edit Entry"
                    },
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Bold,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    IconButton(onClick = { haptics.crownTick(); isPinned = !isPinned }) {
                        Icon(Icons.Rounded.PushPin, contentDescription = "Pin", tint = if (isPinned) SemesterColors.WarningAmber else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { haptics.crownTick(); isArchived = !isArchived }) {
                        Icon(Icons.Rounded.Archive, contentDescription = "Archive", tint = if (isArchived) SemesterColors.BrandCobalt else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            RubberSegment(
                options = listOf(
                    SegmentOption(false, "Note"),
                    SegmentOption(true, "Checklist"),
                ),
                selected = isTodo,
                onSelect = { wantTodo ->
                    haptics.crownTick()
                    isTodo = wantTodo
                },
                fillWidth = true,
                modifier = Modifier.fillMaxWidth(),
            )

            // Exam Mode Toggle Card (when in Checklist mode)
            if (isTodo) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(
                            if (examMode) SemesterColors.BrandCyan.copy(alpha = 0.14f)
                            else MaterialTheme.colorScheme.surfaceContainer,
                        )
                        .border(
                            1.dp,
                            if (examMode) SemesterColors.BrandCyan.copy(alpha = 0.45f)
                            else MaterialTheme.colorScheme.outline.copy(alpha = 0.6f),
                            RoundedCornerShape(18.dp),
                        )
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.EventNote,
                            contentDescription = null,
                            tint = if (examMode) SemesterColors.BrandCyanSoft else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                        Column {
                            Text(
                                text = "Exam / Practical Mode",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = "Add subject dates • Auto alerts 1 day before & morning of exam",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Switch(
                        checked = examMode,
                        onCheckedChange = { want ->
                            haptics.focusSnap()
                            examMode = want
                            if (want && title.isBlank()) title = "Exam Datesheet"
                        },
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Tag", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                colorOptions.forEach { (key, swatch) ->
                    val active = color.equals(key, ignoreCase = true)
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(if (key.isEmpty()) MaterialTheme.colorScheme.surfaceContainerHigh else swatch.copy(alpha = 0.85f))
                            .border(
                                width = if (active) 2.2.dp else 1.dp,
                                color = if (active) MaterialTheme.colorScheme.onSurface else swatch.copy(alpha = 0.5f),
                                shape = CircleShape,
                            )
                            .clickable {
                                haptics.crownTick()
                                color = key
                            },
                    )
                }
            }

            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text(if (isTodo && examMode) "Datesheet Title (e.g. End-Sem / Practicals)" else "Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            if (isTodo) {
                if (examMode) {
                    // Clean Exam Entry Composer (Quick Course Chips + Subject + Date Picker + Type)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(18.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f), RoundedCornerShape(18.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text("Add Exam / Practical Date", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)

                        if (subjects.isNotEmpty()) {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(subjects, key = { "exsub_${it.id}" }) { sub ->
                                    StudioPillChip(
                                        label = sub.code.ifBlank { sub.name.take(14) },
                                        selected = examSubject.equals(sub.name, true),
                                        onClick = {
                                            haptics.crownTick()
                                            examSubject = sub.name
                                        },
                                    )
                                }
                            }
                        }

                        OutlinedTextField(
                            value = examSubject,
                            onValueChange = { examSubject = it },
                            label = { Text("Subject Name") },
                            placeholder = { Text("e.g. Data Structures / Physics Viva") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { addExamItem() }),
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            GlassSecondaryButton(
                                text = formatPrettyDate(examDateIso),
                                icon = Icons.Rounded.CalendarMonth,
                                accentTint = SemesterColors.BrandCyan,
                                onClick = { openExamDatePicker() },
                                modifier = Modifier.weight(1.1f),
                            )
                            OutlinedTextField(
                                value = examLabel,
                                onValueChange = { examLabel = it },
                                label = { Text("Type") },
                                placeholder = { Text("Mid-Sem / Viva") },
                                singleLine = true,
                                modifier = Modifier.weight(0.9f),
                            )
                        }

                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(listOf("End-Sem", "Mid-Sem", "Practical Viva", "Lab File")) { preset ->
                                StudioPillChip(
                                    label = preset,
                                    selected = examLabel.equals(preset, true),
                                    onClick = { haptics.crownTick(); examLabel = preset },
                                )
                            }
                        }

                        GradientButton(
                            text = "Add to Datesheet",
                            icon = Icons.Rounded.Add,
                            enabled = examSubject.isNotBlank(),
                            onClick = { addExamItem() },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                } else {
                    // Clean Normal Checklist Composer (working Add button + keyboard Enter!)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = newTodoText,
                            onValueChange = { newTodoText = it },
                            label = { Text("New checklist item") },
                            placeholder = { Text("Type task and tap Add") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { addNormalTodo() }),
                            modifier = Modifier.weight(1f),
                        )
                        GradientButton(
                            text = "Add",
                            enabled = newTodoText.isNotBlank(),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                            onClick = { addNormalTodo() },
                        )
                    }
                }

                // Existing items list (only real items — ZERO confusing ghost rows!)
                if (todos.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = if (examMode) "Scheduled Dates (${todos.size})" else "Items (${todos.size})",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Bold,
                        )
                        todos.forEach { item ->
                            val badge = examCountdownBadge(item.examDate, item.completed)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(MaterialTheme.colorScheme.surfaceContainer)
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                IconButton(
                                    onClick = {
                                        haptics.crownTick()
                                        todos = todos.map { if (it.id == item.id) it.copy(completed = !it.completed) else it }
                                    },
                                    modifier = Modifier.size(28.dp),
                                ) {
                                    Icon(
                                        imageVector = if (item.completed) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                        contentDescription = "Mark Done",
                                        tint = if (item.completed) SemesterColors.SafeEmerald else MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(20.dp),
                                    )
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = if (item.subject.isNotBlank()) item.subject else item.text,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = if (item.completed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                                        textDecoration = if (item.completed) TextDecoration.LineThrough else TextDecoration.None,
                                    )
                                    if (item.examDate.isNotBlank() || (item.subject.isNotBlank() && item.text.isNotBlank())) {
                                        Text(
                                            text = buildString {
                                                if (item.examDate.isNotBlank()) append(formatPrettyDate(item.examDate))
                                                if (item.subject.isNotBlank() && item.text.isNotBlank()) {
                                                    if (isNotEmpty()) append(" • ")
                                                    append(item.text)
                                                }
                                            },
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                if (badge != null) {
                                    Surface(color = badge.second.copy(alpha = 0.16f), shape = CircleShape) {
                                        Text(
                                            text = badge.first,
                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                            fontWeight = FontWeight.Bold,
                                            color = badge.second,
                                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                        )
                                    }
                                }
                                IconButton(
                                    onClick = {
                                        haptics.softDismiss()
                                        todos = todos.filterNot { it.id == item.id }
                                    },
                                    modifier = Modifier.size(26.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Close,
                                        contentDescription = "Remove Item",
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            } else {
                OutlinedTextField(
                    value = content,
                    onValueChange = { content = it },
                    label = { Text("Note Content") },
                    minLines = 4,
                    maxLines = 10,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                if (initial.id.isNotBlank()) {
                    DangerPillButton(
                        text = "Delete",
                        icon = Icons.Rounded.DeleteOutline,
                        onClick = { onDelete(initial.id) },
                        modifier = Modifier.weight(1f),
                    )
                }
                GradientButton(
                    text = if (isTodo && examMode) "Save Datesheet" else "Save",
                    onClick = {
                        // Auto-include any pending typed text/exam before saving so zero input is ever lost!
                        var finalTodos = todos
                        if (isTodo && !examMode && newTodoText.isNotBlank()) {
                            finalTodos = finalTodos + NoteTodoItem(UUID.randomUUID().toString(), newTodoText.trim(), false)
                        } else if (isTodo && examMode && examSubject.isNotBlank()) {
                            finalTodos = (finalTodos + NoteTodoItem(
                                id = UUID.randomUUID().toString(),
                                text = examLabel.trim().ifBlank { "Exam" },
                                completed = false,
                                subject = examSubject.trim(),
                                examDate = examDateIso.trim(),
                            )).sortedBy { it.examDate.ifBlank { "9999-99-99" } }
                        }
                        onSave(
                            initial.copy(
                                title = title.trim().ifBlank { if (isTodo && examMode) "Exam Datesheet" else if (isTodo) "Checklist" else "Untitled Note" },
                                content = content,
                                isTodo = isTodo,
                                todos = finalTodos,
                                isPinned = isPinned,
                                isArchived = isArchived,
                                color = color,
                                category = if (isTodo && examMode) "exam" else "",
                            ),
                        )
                    },
                    modifier = Modifier.weight(1.4f),
                )
            }
        }
    }
}

private fun formatPrettyDate(iso: String): String {
    if (iso.isBlank()) return "Pick Date"
    return runCatching {
        val parsed = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(iso.trim())
        if (parsed != null) SimpleDateFormat("EEE, dd MMM", Locale.ENGLISH).format(parsed) else iso
    }.getOrDefault(iso)
}

private fun examCountdownBadge(examDateIso: String, completed: Boolean): Pair<String, Color>? {
    if (examDateIso.isBlank()) return null
    if (completed) return "Done" to SemesterColors.SafeEmerald
    val parsed = runCatching { SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(examDateIso.trim()) }.getOrNull() ?: return null
    val todayCal = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
    val targetCal = Calendar.getInstance().apply {
        time = parsed
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
    val diffDays = TimeUnit.MILLISECONDS.toDays(targetCal.timeInMillis - todayCal.timeInMillis)
    return when {
        diffDays < 0 -> "Past" to Color(0xFF94A3B8)
        diffDays == 0L -> "Today!" to SemesterColors.CriticalCrimsonSoft
        diffDays == 1L -> "Tomorrow" to SemesterColors.WarningAmber
        diffDays <= 7L -> "In ${diffDays}d" to SemesterColors.BrandCyanSoft
        else -> "In ${diffDays}d" to SemesterColors.BrandCobaltSoft
    }
}
