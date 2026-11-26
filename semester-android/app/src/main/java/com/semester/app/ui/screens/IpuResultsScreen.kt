package com.semester.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.AmbientTopGlow
import com.semester.app.ui.components.GlassIconButton
import com.semester.app.ui.components.LocalChromeScroll
import com.semester.app.ui.components.liquidGlass
import com.semester.app.ui.theme.SemesterColors
import kotlinx.coroutines.launch
import uniffi.semester_core.SemesterResultData

@Composable
fun IpuResultsScreen(
    repo: CoreRepository,
    haptics: HapticCrownEngine,
) {
    val coroutineScope = rememberCoroutineScope()
    val chromeScroll = LocalChromeScroll.current
    var savedResults by remember { mutableStateOf<List<SemesterResultData>>(emptyList()) }
    var showFetchDialog by remember { mutableStateOf(false) }
    var rollNo by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var captcha by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        savedResults = repo.getSemesterResults()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        AmbientTopGlow(
            color = SemesterColors.ElectricBlue,
            peakAlpha = 0.22f,
            height = 290.dp,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .then(if (chromeScroll != null) Modifier.nestedScroll(chromeScroll) else Modifier),
            contentPadding = PaddingValues(bottom = 128.dp),
        ) {
            item(key = "results_header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.statusBars)
                        .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "GGSIPU ARCHIVE",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            letterSpacing = 1.2.sp,
                        )
                        Text(
                            text = "IPU Results",
                            style = MaterialTheme.typography.displaySmall,
                            color = Color.White,
                        )
                    }

                    GlassIconButton(
                        icon = Icons.Rounded.CloudDownload,
                        contentDescription = "Fetch Results",
                        onClick = {
                            haptics.focusSnap()
                            showFetchDialog = true
                        },
                        accentTint = SemesterColors.ElectricBlue,
                    )
                }
            }

            if (savedResults.isEmpty()) {
                item(key = "results_empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 24.dp)
                            .liquidGlass(
                                shape = RoundedCornerShape(26.dp),
                                tint = Color(0xFF141418).copy(alpha = 0.88f),
                                elevation = 10.dp,
                            )
                            .padding(28.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(64.dp)
                                    .clip(CircleShape)
                                    .background(SemesterColors.ElectricBlue.copy(alpha = 0.16f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    Icons.Rounded.School,
                                    contentDescription = null,
                                    tint = SemesterColors.ElectricBlue,
                                    modifier = Modifier.size(32.dp),
                                )
                            }
                            Text(
                                text = "No archived results yet",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                            )
                            Text(
                                text = "Fetch your official GGSIPU scorecard and store it permanently offline.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(4.dp))
                            Button(
                                onClick = {
                                    haptics.crownTick()
                                    showFetchDialog = true
                                },
                                shape = CircleShape,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = SemesterColors.ElectricBlue,
                                    contentColor = Color.White,
                                ),
                            ) {
                                Text("Fetch from IPU Portal", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            } else {
                items(savedResults, key = { "sem_${it.semester}" }) { result ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 8.dp)
                            .liquidGlass(
                                shape = RoundedCornerShape(24.dp),
                                tint = Color(0xFF141418).copy(alpha = 0.90f),
                                accentTint = SemesterColors.SafeEmerald,
                                elevation = 12.dp,
                                touchResponse = true,
                                swell = false,
                            )
                            .padding(18.dp),
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "Semester ${result.semester}",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                )
                                Surface(
                                    color = SemesterColors.SafeEmerald.copy(alpha = 0.18f),
                                    shape = CircleShape,
                                ) {
                                    Text(
                                        text = "SGPA ${String.format("%.2f", result.sgpa)}",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = SemesterColors.SafeEmeraldSoft,
                                        fontWeight = FontWeight.ExtraBold,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                                    )
                                }
                            }

                            Spacer(Modifier.height(14.dp))

                            result.subjects.forEachIndexed { idx, sub ->
                                if (idx > 0) {
                                    HorizontalDivider(
                                        color = Color.White.copy(alpha = 0.06f),
                                        modifier = Modifier.padding(vertical = 8.dp),
                                    )
                                }
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = sub.subjectName,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = Color.White,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Text(
                                            text = "${sub.subjectCode} • ${sub.credits} Credits",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = "${sub.totalMarks.toInt()}/100",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(end = 10.dp),
                                        )
                                        val isFail = sub.grade == "F"
                                        Surface(
                                            color = if (isFail) SemesterColors.CriticalCrimson.copy(alpha = 0.2f)
                                            else SemesterColors.ElectricBlue.copy(alpha = 0.2f),
                                            shape = RoundedCornerShape(8.dp),
                                        ) {
                                            Text(
                                                text = sub.grade,
                                                style = MaterialTheme.typography.labelMedium,
                                                color = if (isFail) SemesterColors.CriticalCrimsonSoft
                                                else Color(0xFF93C5FD),
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                            )
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

    if (showFetchDialog) {
        AlertDialog(
            onDismissRequest = { showFetchDialog = false },
            title = {
                Text(
                    "IPU Portal Credentials",
                    style = MaterialTheme.typography.titleLarge,
                    color = Color.White,
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Enter credentials for examweb.ggsipu.ac.in. Results are archived permanently in local SQLite.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = rollNo,
                        onValueChange = { rollNo = it },
                        label = { Text("Enrollment Number") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = captcha,
                        onValueChange = { captcha = it },
                        label = { Text("Captcha (from Portal)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        isLoading = true
                        haptics.selectionConfirm()
                        coroutineScope.launch {
                            val mockIpuPayload = """[
                                {
                                    "euno": 3,
                                    "papercode": "ES-201",
                                    "papername": "Computational Methods",
                                    "minorprint": "22",
                                    "majorprint": "68",
                                    "moderatedprint": "90",
                                    "statuscode": "Pass",
                                    "eugpa": 8.75
                                },
                                {
                                    "euno": 3,
                                    "papercode": "CIC-209",
                                    "papername": "Data Structures",
                                    "minorprint": "19",
                                    "majorprint": "56",
                                    "moderatedprint": "75",
                                    "statuscode": "Pass",
                                    "eugpa": 8.75
                                }
                            ]"""
                            repo.parseAndStoreIpuJson(mockIpuPayload, 3u)
                            savedResults = repo.getSemesterResults()
                            isLoading = false
                            showFetchDialog = false
                            haptics.attendanceSuccess()
                        }
                    },
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = SemesterColors.SafeEmerald,
                        contentColor = Color.Black,
                    ),
                ) {
                    Text(if (isLoading) "Syncing..." else "Sync Result", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showFetchDialog = false }) {
                    Text("Cancel", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            containerColor = Color(0xFF141418),
            shape = RoundedCornerShape(24.dp),
        )
    }
}
