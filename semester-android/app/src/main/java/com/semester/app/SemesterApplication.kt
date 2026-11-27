package com.semester.app

import android.app.Application
import android.os.Build
import android.util.Log
import com.semester.app.core.WorkspaceRepository
import com.semester.app.notifications.ScheduleAlertManager
import com.semester.app.sync.GoogleDriveSyncEngine
import com.semester.app.sync.SyncScheduler
import com.semester.app.widget.SemesterGlanceWidget
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SemesterApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        installOfflineCrashRecorder()

        // Pre-warm unified local workspace & cloud sync coordinator
        WorkspaceRepository.getInstance(this)
        GoogleDriveSyncEngine.getInstance(this)

        // Lightweight 30-min battery-aware background sync protection
        SyncScheduler.ensurePeriodicSync(this)

        // Clean schedule-only class alerts + home screen widget hydration
        ScheduleAlertManager.ensureChannel(this)
        ScheduleAlertManager.rescheduleAsync(this)
        SemesterGlanceWidget.refreshAsync(this)
    }

    /**
     * Persists any uncaught crash stack trace to `files/last_crash.txt` and logs under
     * `SemesterCrash` so `scripts/android-dev.ps1 crash` can pull it even if the phone
     * was unplugged when the crash happened.
     */
    private fun installOfflineCrashRecorder() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching {
                val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
                val sw = StringWriter()
                throwable.printStackTrace(PrintWriter(sw))
                val report = buildString {
                    appendLine("Timestamp: $stamp")
                    appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL} (Android ${Build.VERSION.RELEASE}, SDK ${Build.VERSION.SDK_INT})")
                    appendLine("ABIs: ${Build.SUPPORTED_ABIS.joinToString()}")
                    appendLine("Thread: ${thread.name}")
                    appendLine(sw.toString())
                }
                File(filesDir, "last_crash.txt").writeText(report)
                Log.e("SemesterCrash", report)
            }
            previous?.uncaughtException(thread, throwable)
        }
    }
}
