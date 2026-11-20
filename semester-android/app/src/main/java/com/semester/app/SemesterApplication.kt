package com.semester.app

import android.app.Application
import androidx.work.*
import com.semester.app.core.CoreRepository
import com.semester.app.sync.GoogleDriveBackupWorker
import java.util.concurrent.TimeUnit

class SemesterApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        // Pre-warm the native Rust SQLite core
        CoreRepository.getInstance(this)

        // Schedule periodic automated Google Drive AppData backups (every 12 hours)
        val backupWork = PeriodicWorkRequestBuilder<GoogleDriveBackupWorker>(12, TimeUnit.HOURS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "SemesterGoogleDriveBackup",
            ExistingPeriodicWorkPolicy.KEEP,
            backupWork
        )
    }
}
