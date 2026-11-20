package com.semester.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import kotlinx.coroutines.launch
import uniffi.semester_core.SemesterResultData

@Composable
fun IpuResultsScreen(
    repo: CoreRepository,
    haptics: HapticCrownEngine
) {
    val coroutineScope = rememberCoroutineScope()
    var savedResults by remember { mutableStateOf<List<SemesterResultData>>(emptyList()) }
    var showFetchDialog by remember { mutableStateOf(false) }
    var rollNo by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var captcha by remember { mutableStateOf("") }
    var selectedSemester by remember { mutableStateOf("3") }
    var isLoading by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        savedResults = repo.getSemesterResults()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF09090B))
            .padding(20.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "🎓 IPU Academic Results",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Text(
                    text = "Official GGSIPU portal records & offline copies",
                    fontSize = 13.sp,
                    color = Color(0xFFA1A1AA)
                )
            }

            IconButton(
                onClick = {
                    haptics.focusSnap()
                    showFetchDialog = true
                },
                modifier = Modifier
                    .background(Color(0xFF27272A), RoundedCornerShape(12.dp))
            ) {
                Icon(Icons.Default.CloudDownload, contentDescription = "Fetch Results", tint = Color.White)
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        if (savedResults.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.School,
                        contentDescription = null,
                        tint = Color(0xFF71717A),
                        modifier = Modifier.size(56.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "No saved semester results yet.",
                        color = Color(0xFFA1A1AA),
                        fontSize = 15.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { showFetchDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                    ) {
                        Text("Fetch from IPU Portal")
                    }
                }
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(savedResults) { result ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Semester ${result.semester}",
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                                Surface(
                                    color = Color(0x2010B981),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(
                                        text = "SGPA: ${String.format("%.2f", result.sgpa)}",
                                        color = Color(0xFF10B981),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            result.subjects.forEach { sub ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(sub.subjectName, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                        Text("${sub.subjectCode} • ${sub.credits} Credits", color = Color(0xFFA1A1AA), fontSize = 11.sp)
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = "${sub.totalMarks.toInt()}/100",
                                            color = Color(0xFFA1A1AA),
                                            fontSize = 12.sp,
                                            modifier = Modifier.padding(end = 8.dp)
                                        )
                                        Surface(
                                            color = if (sub.grade == "F") Color(0x30EF4444) else Color(0x303B82F6),
                                            shape = RoundedCornerShape(6.dp)
                                        ) {
                                            Text(
                                                text = sub.grade,
                                                color = if (sub.grade == "F") Color(0xFFEF4444) else Color(0xFF60A5FA),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
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

    // IPU Portal Captcha Relay Dialog
    if (showFetchDialog) {
        AlertDialog(
            onDismissRequest = { showFetchDialog = false },
            title = { Text("IPU Portal Credentials", color = Color.White) },
            text = {
                Column {
                    Text(
                        "Enter credentials for examweb.ggsipu.ac.in. Result will be archived into local SQLite permanently.",
                        fontSize = 12.sp,
                        color = Color(0xFFA1A1AA)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = rollNo,
                        onValueChange = { rollNo = it },
                        label = { Text("Enrollment Number") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = captcha,
                        onValueChange = { captcha = it },
                        label = { Text("Captcha (from Portal)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        isLoading = true
                        haptics.selectionConfirm()
                        coroutineScope.launch {
                            // Mock IPU fetch and parse for demo; in production OkHttp client hits StudentSearchProcess
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
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                ) {
                    Text(if (isLoading) "Fetching..." else "Sync Result")
                }
            },
            dismissButton = {
                TextButton(onClick = { showFetchDialog = false }) {
                    Text("Cancel", color = Color(0xFFA1A1AA))
                }
            },
            containerColor = Color(0xFF18181B)
        )
    }
}
