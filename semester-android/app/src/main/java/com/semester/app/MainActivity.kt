package com.semester.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.semester.app.core.CoreRepository
import com.semester.app.haptics.HapticCrownEngine
import com.semester.app.ui.components.RadialBubbleMenu
import com.semester.app.ui.screens.DashboardScreen
import com.semester.app.ui.screens.IpuResultsScreen
import com.semester.app.ui.screens.WhatIfSimulatorScreen
import uniffi.semester_core.Subject

class MainActivity : ComponentActivity() {

    private lateinit var haptics: HapticCrownEngine
    private lateinit var repo: CoreRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        haptics = HapticCrownEngine(this)
        repo = CoreRepository.getInstance(this)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    var currentScreen by remember { mutableStateOf("dashboard") }
                    var subjects by remember { mutableStateOf<List<Subject>>(emptyList()) }

                    LaunchedEffect(Unit) {
                        subjects = repo.getSubjects()
                    }

                    Box(modifier = Modifier.fillMaxSize()) {
                        when (currentScreen) {
                            "dashboard" -> DashboardScreen(repo, haptics)
                            "whatif" -> WhatIfSimulatorScreen(subjects, repo, haptics)
                            "results" -> IpuResultsScreen(repo, haptics)
                            else -> DashboardScreen(repo, haptics)
                        }

                        // Floating Digital Crown Radial Bubble Menu
                        RadialBubbleMenu(
                            haptics = haptics,
                            onItemSelected = { selectedId ->
                                currentScreen = selectedId
                            }
                        )
                    }
                }
            }
        }
    }
}
