package com.semester.app.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.WorkspaceRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.network.AiProvider
import com.semester.app.ui.theme.LocalIsDarkTheme
import com.semester.app.ui.theme.SemesterColors
import com.semester.app.ui.theme.SemesterGradients
import kotlinx.coroutines.launch

private data class ChatBubble(
    val isUser: Boolean,
    val text: String,
    val badge: String = "",
)

/**
 * Polished Academic Assistant Studio:
 * - Instant On-Device intelligence by default + optional Gemini / Groq BYOK support
 * - Brand-matched gradient user bubbles, frosted assistant cards, copy action & prompt rail
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiAssistantSheet(
    semester: Int,
    repo: WorkspaceRepository,
    haptics: HapticCrownEngine,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val isDark = LocalIsDarkTheme.current
    val chatListState = rememberLazyListState()
    val promptListState = rememberLazyListState()
    val canScrollPrompts by remember { derivedStateOf { promptListState.canScrollForward } }

    var provider by remember { mutableStateOf(repo.getSelectedAiProvider()) }
    var showKeyConfig by remember { mutableStateOf(false) }
    var keyDraft by remember(provider) { mutableStateOf(repo.getByokApiKey(provider)) }
    var input by remember { mutableStateOf("") }
    var isThinking by remember { mutableStateOf(false) }
    var copiedNotice by remember { mutableStateOf(false) }

    fun welcomeBubble() = ChatBubble(
        isUser = false,
        text = "Ask me about your Semester $semester attendance, safe bunks, today's classes, or IPU CGPA.",
        badge = "On-Device",
    )

    val messages = remember { mutableStateListOf(welcomeBubble()) }

    val quickPrompts = remember {
        listOf(
            "Today's schedule",
            "Low attendance subjects",
            "Can I bunk safely?",
            "My IPU CGPA & results",
            "Overall summary",
        )
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            runCatching { chatListState.animateScrollToItem(messages.lastIndex) }
        }
    }

    fun formatBadge(rawSource: String): String = when {
        rawSource.contains("gemini", true) -> "Gemini"
        rawSource.contains("groq", true) -> "Groq"
        else -> "On-Device"
    }

    fun sendQuery(prompt: String) {
        val clean = prompt.trim()
        if (clean.isEmpty() || isThinking) return
        messages.add(ChatBubble(isUser = true, text = clean))
        input = ""
        isThinking = true
        haptics.focusSnap()
        scope.launch {
            val reply = runCatching { repo.askAssistant(clean, semester) }
                .getOrElse {
                    com.semester.app.core.LocalAssistantReply(
                        reply = "Could not complete request: ${it.message}",
                        source = "on_device",
                    )
                }
            messages.add(ChatBubble(isUser = false, text = reply.reply, badge = formatBadge(reply.source)))
            isThinking = false
            haptics.crownTick()
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
                .padding(horizontal = 18.dp)
                .navigationBarsPadding()
                .padding(bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SemesterBrandMark(size = 38.dp)
                    Column {
                        Text(
                            text = "Academic Assistant",
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(SemesterColors.SafeEmerald),
                            )
                            Text(
                                text = "${provider.label} • Sem $semester",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    GlassIconButton(
                        icon = Icons.Rounded.Refresh,
                        contentDescription = "New Chat",
                        size = 36.dp,
                        onClick = {
                            haptics.softDismiss()
                            messages.clear()
                            messages.add(welcomeBubble())
                        },
                    )
                    GlassIconButton(
                        icon = Icons.Rounded.Key,
                        contentDescription = "Assistant Engine",
                        size = 36.dp,
                        accentTint = if (showKeyConfig) SemesterColors.BrandCobalt else null,
                        onClick = {
                            haptics.crownTick()
                            showKeyConfig = !showKeyConfig
                        },
                    )
                }
            }

            // Collapsible Engine & BYOK Key Drawer
            AnimatedVisibility(
                visible = showKeyConfig,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .liquidGlass(shape = RoundedCornerShape(20.dp))
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "Assistant Engine",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                    )
                    RubberSegment(
                        options = listOf(
                            SegmentOption(AiProvider.LOCAL_RUST, "On-Device"),
                            SegmentOption(AiProvider.GEMINI, "Gemini"),
                            SegmentOption(AiProvider.GROQ, "Groq"),
                        ),
                        selected = provider,
                        onSelect = { p ->
                            haptics.focusSnap()
                            provider = p
                            repo.setSelectedAiProvider(p)
                            keyDraft = repo.getByokApiKey(p)
                        },
                        fillWidth = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (provider != AiProvider.LOCAL_RUST) {
                        OutlinedTextField(
                            value = keyDraft,
                            onValueChange = {
                                keyDraft = it
                                repo.saveByokApiKey(provider, it)
                            },
                            label = { Text("${provider.label} API Key (stored privately)") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            // Quick Prompt Rail + minimal -> scroll cue
            Column {
                LazyRow(
                    state = promptListState,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(quickPrompts) { prompt ->
                        StudioPillChip(
                            label = prompt,
                            selected = false,
                            onClick = { sendQuery(prompt) },
                        )
                    }
                }
                ScrollForwardHint(visible = canScrollPrompts, modifier = Modifier.padding(end = 0.dp))
            }

            // Chat Thread
            LazyColumn(
                state = chatListState,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 210.dp, max = 360.dp),
                contentPadding = PaddingValues(vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(messages) { msg ->
                    Box(
                        modifier = Modifier.fillMaxWidth(),
                        contentAlignment = if (msg.isUser) Alignment.CenterEnd else Alignment.CenterStart,
                    ) {
                        if (msg.isUser) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(0.84f)
                                    .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 20.dp, bottomEnd = 6.dp))
                                    .background(SemesterGradients.brandButton)
                                    .padding(horizontal = 14.dp, vertical = 11.dp),
                            ) {
                                Text(
                                    text = msg.text,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                        } else {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth(0.90f)
                                    .liquidGlass(shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomEnd = 20.dp, bottomStart = 6.dp))
                                    .padding(horizontal = 14.dp, vertical = 11.dp),
                                verticalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = msg.badge.ifBlank { "Assistant" },
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                        color = SemesterColors.BrandCyan,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 0.4.sp,
                                    )
                                    IconButton(
                                        onClick = {
                                            haptics.crownTick()
                                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                                            cm?.setPrimaryClip(ClipData.newPlainText("Semester Assistant", msg.text))
                                            copiedNotice = true
                                        },
                                        modifier = Modifier.size(22.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.ContentCopy,
                                            contentDescription = "Copy response",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(13.dp),
                                        )
                                    }
                                }
                                Text(
                                    text = msg.text,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    lineHeight = 19.sp,
                                )
                            }
                        }
                    }
                }
                if (isThinking) {
                    item(key = "thinking") {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            Text(
                                text = "Analyzing semester data...",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }

            if (copiedNotice) {
                Text(
                    text = "Copied response to clipboard",
                    style = MaterialTheme.typography.labelSmall,
                    color = SemesterColors.SafeEmerald,
                )
            }

            // Elevated Pill Composer
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(CircleShape)
                    .background(if (isDark) Color(0xFF141824) else Color(0xFFF1F4FC))
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.65f), CircleShape)
                    .padding(start = 6.dp, end = 6.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text("Ask about attendance, bunks, CGPA...") },
                    singleLine = true,
                    shape = CircleShape,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .pressable(
                            onClick = { if (!isThinking && input.isNotBlank()) sendQuery(input) },
                            pressedScale = 0.90f,
                        )
                        .clip(CircleShape)
                        .background(SemesterGradients.brandButton),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = "Send", tint = Color.White, modifier = Modifier.size(19.dp))
                }
            }
        }
    }
}
