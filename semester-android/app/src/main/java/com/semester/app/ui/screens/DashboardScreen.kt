package com.semester.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import kotlinx.coroutines.launch
import uniffi.semester_core.AttendanceStatus
import uniffi.semester_core.Subject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.roundToInt

@Composable
fun DashboardScreen(
    repo: CoreRepository,
    haptics: HapticCrownEngine
) {
    val coroutineScope = rememberCoroutineScope()
    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }

    fun refreshSubjects() {
        coroutineScope.launch {
            subjects = repo.getSubjects()
        }
    }

    LaunchedEffect(Unit) {
        refreshSubjects()
    }

    val totalAttended = subjects.sumOf { it.attended.toInt() }
    val totalClasses = subjects.sumOf { it.total.toInt() }
    val overallPercentage = if (totalClasses > 0) (totalAttended.toDouble() / totalClasses) * 100.0 else 0.0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF09090B))
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        // App Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Semester",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White
                )
                Text(
                    text = "Offline Native Suite • Rust Core",
                    fontSize = 12.sp,
                    color = Color(0xFFA1A1AA)
                )
            }

            // Overall Percentage Pill
            Surface(
                color = if (overallPercentage >= 75.0) Color(0x2010B981) else Color(0x20EF4444),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = "${overallPercentage.roundToInt()}% Overall",
                    color = if (overallPercentage >= 75.0) Color(0xFF10B981) else Color(0xFFEF4444),
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        Text(
            text = "COURSES & ATTENDANCE",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF71717A)
        )

        Spacer(modifier = Modifier.height(10.dp))

        if (subjects.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No courses added yet", color = Color(0xFFA1A1AA), fontSize = 15.sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                repo.addSubject("Data Structures", "CIC-209", "Ms. Ritu", "102", 3u, "theory", 4u, 75u)
                                repo.addSubject("Computational Methods", "ES-201", "Dr. Sharma", "204", 3u, "theory", 4u, 75u)
                                repo.addSubject("Operating Systems", "CIC-205", "Mr. Gupta", "301", 3u, "theory", 4u, 75u)
                                refreshSubjects()
                                haptics.attendanceSuccess()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                    ) {
                        Text("Load Sample Semester 3")
                    }
                }
            }
        } else {
            LazyColumn(modifier = Modifier.weight(1f)) {
                items(subjects) { subject ->
                    val percentage = repo.calculatePercentage(subject.attended, subject.total)
                    val bunkGuard = repo.calculateBunkGuard(subject.attended, subject.total, subject.target)

                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B))
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = subject.name,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp,
                                        color = Color.White
                                    )
                                    Text(
                                        text = "${subject.code} • Room ${subject.classroom}",
                                        fontSize = 12.sp,
                                        color = Color(0xFFA1A1AA)
                                    )
                                }

                                Text(
                                    text = "${percentage.roundToInt()}%",
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.Black,
                                    color = if (percentage >= subject.target.toDouble()) Color(0xFF10B981) else Color(0xFFEF4444)
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            // BunkGuard Status Chip
                            Text(
                                text = bunkGuard.statusMessage,
                                fontSize = 12.sp,
                                color = if (bunkGuard.canBunk) Color(0xFF34D399) else Color(0xFFF87171),
                                fontWeight = FontWeight.Medium
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // 1-Tap Attendance Controls
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${subject.attended}/${subject.total} attended",
                                    fontSize = 13.sp,
                                    color = Color(0xFFA1A1AA)
                                )

                                Row {
                                    FilledTonalButton(
                                        onClick = {
                                            haptics.attendanceSuccess()
                                            coroutineScope.launch {
                                                val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
                                                repo.markAttendance(subject.id, AttendanceStatus.PRESENT, today)
                                                refreshSubjects()
                                            }
                                        },
                                        colors = ButtonDefaults.filledTonalButtonColors(
                                            containerColor = Color(0xFF064E3B),
                                            contentColor = Color(0xFF34D399)
                                        ),
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Present", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }

                                    Spacer(modifier = Modifier.width(8.dp))

                                    FilledTonalButton(
                                        onClick = {
                                            haptics.focusSnap()
                                            coroutineScope.launch {
                                                val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
                                                repo.markAttendance(subject.id, AttendanceStatus.ABSENT, today)
                                                refreshSubjects()
                                            }
                                        },
                                        colors = ButtonDefaults.filledTonalButtonColors(
                                            containerColor = Color(0xFF450A0A),
                                            contentColor = Color(0xFFF87171)
                                        ),
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Skip", fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
