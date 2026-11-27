package com.semester.app.sync

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.semester.app.core.WorkspaceRepository
import com.semester.app.notifications.ScheduleAlertManager
import com.semester.app.widget.SemesterGlanceWidget
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Super-light, battery-respectful background sync scheduler:
 * - Periodic 30-minute safety sync when connected & battery not low
 * - 5-second debounced immediate push so edits made right before closing the app
 *   or from the Home Screen Widget still upload reliably with zero data loss.
 */
object SyncScheduler {

    private const val PERIODIC_WORK_NAME = "SemesterGoogleDriveTwoWaySync"
    private const val IMMEDIATE_PUSH_WORK_NAME = "SemesterImmediatePushSync"

    fun ensurePeriodicSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val periodic = PeriodicWorkRequestBuilder<GoogleDriveBackupWorker>(30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            periodic,
        )
    }

    fun scheduleImmediatePush(context: Context) {
        val appCtx = context.applicationContext
        val engine = GoogleDriveSyncEngine.getInstance(appCtx)
        if (!engine.isConnected() || !engine.state.value.autoSyncEnabled) return

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val pushWork = OneTimeWorkRequestBuilder<GoogleDriveBackupWorker>()
            .setInitialDelay(5, TimeUnit.SECONDS)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(appCtx).enqueueUniqueWork(
            IMMEDIATE_PUSH_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            pushWork,
        )
    }

    fun cancelImmediatePush(context: Context) {
        WorkManager.getInstance(context.applicationContext)
            .cancelUniqueWork(IMMEDIATE_PUSH_WORK_NAME)
    }
}

/**
 * Lightweight background worker that maintains an incremental local backup snapshot,
 * runs conflict-free 2-way Google Drive sync when connected, and keeps the Home Screen
 * Widget and daily class schedule notifications fresh.
 */
class GoogleDriveBackupWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (runAttemptCount >= 3) {
            return@withContext Result.failure()
        }

        try {
            val repo = WorkspaceRepository.getInstance(applicationContext)
            val engine = GoogleDriveSyncEngine.getInstance(applicationContext)
            val shouldCloudSync = engine.isConnected() && engine.state.value.autoSyncEnabled

            // Fast path: only write local backup cache when workspace hash actually changed
            val bundle = repo.exportSyncSnapshot()
            val cachePrefs = applicationContext.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE)
            val lastCachedHash = cachePrefs.getString(KEY_LAST_CACHE_HASH, "").orEmpty()
            if (bundle.hash.isBlank() || bundle.hash != lastCachedHash) {
                val backupFile = File(applicationContext.filesDir, "semester_backup_cache.json")
                backupFile.writeText(bundle.payloadJson)
                cachePrefs.edit().putString(KEY_LAST_CACHE_HASH, bundle.hash).apply()
            }

            if (shouldCloudSync) {
                val res = engine.syncTwoWay(forcePush = false)
                if (res.isSuccess) {
                    Log.i(TAG, "Background sync complete: ${res.getOrNull()}")
                } else {
                    Log.w(TAG, "Background sync deferred: ${res.exceptionOrNull()?.message}")
                }
            }

            // Keep Home Screen Widget & today's class schedule alerts in sync with latest state
            SemesterGlanceWidget.refreshAll(applicationContext)
            ScheduleAlertManager.rescheduleToday(applicationContext)

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Background worker failed: ${e.message}", e)
            if (runAttemptCount < 2) Result.retry() else Result.failure()
        }
    }

    companion object {
        private const val TAG = "SemesterBgSync"
        private const val CACHE_PREFS = "semester_bg_cache_prefs"
        private const val KEY_LAST_CACHE_HASH = "last_local_cache_hash"
    }
}
