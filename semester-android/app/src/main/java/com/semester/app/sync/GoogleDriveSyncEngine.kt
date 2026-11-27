package com.semester.app.sync

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.util.Base64
import androidx.browser.customtabs.CustomTabsIntent
import com.semester.app.BuildConfig
import com.semester.app.core.CloudBackupItem
import com.semester.app.core.DriveSyncState
import com.semester.app.core.WorkspaceRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.Dns
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.net.ConnectException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.net.URLDecoder
import java.net.URLEncoder
import java.net.UnknownHostException
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Seamless 1-Click 2-Way Google Drive Sync Engine (exact Desktop wire & OAuth parity):
 * - Uses RFC 8252 localhost loopback OAuth2 PKCE (`http://127.0.0.1:<port>/oauth2/callback`)
 *   with the bundled Google Cloud project so Android & Windows Desktop share the exact same
 *   private Google Drive AppData folder with ZERO manual client-ID setup!
 * - Automatically syncs Google profile photo, name, and email into the local workspace.
 * - Per-device files (`semester_device_<id>.json`) + conflict-free smart merging guarantee zero data loss.
 */
class GoogleDriveSyncEngine private constructor(
    private val appContext: Context,
    private val repo: WorkspaceRepository,
) {
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val syncMutex = Mutex()
    private val oauthExchangeMutex = Mutex()
    private val oauthScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var activeOAuthJob: Job? = null
    private var activeLoopbackSocket: ServerSocket? = null

    private data class PendingOAuthExchange(
        val code: String,
        val verifier: String,
        val redirectUri: String,
        val onConnected: (String) -> Unit,
        val onError: (String) -> Unit,
    )

    private val pendingOAuth = AtomicReference<PendingOAuthExchange?>(null)

    private val resilientDns = object : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
            val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val activeNet = cm?.activeNetwork
            // Prefer Android's active network resolver first (fixes EAI_NODATA on Android 14-16 / OxygenOS dual-SIM/Private DNS)
            if (activeNet != null) {
                val resolved = runCatching { activeNet.getAllByName(hostname).toList() }.getOrNull()
                if (!resolved.isNullOrEmpty()) return resolved
            }
            return Dns.SYSTEM.lookup(hostname)
        }
    }

    private val http = OkHttpClient.Builder()
        .dns(resilientDns)
        .retryOnConnectionFailure(true)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun isNetworkAvailable(): Boolean {
        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /**
     * Executes an HTTP request with active-network verification & exponential DNS/connection retries.
     * Eliminates transient Android 15/16 background->foreground DNS failures ("No address associated with hostname").
     */
    private fun executeWithRetry(request: Request, maxAttempts: Int = 4): Response {
        var lastError: IOException? = null
        val delaysMs = longArrayOf(450L, 1000L, 1800L, 2800L)
        for (attempt in 0 until maxAttempts) {
            if (!isNetworkAvailable() && attempt == maxAttempts - 1) {
                throw IOException("No internet connection. Check Wi-Fi or mobile data and try again.")
            }
            try {
                return http.newCall(request).execute()
            } catch (e: IOException) {
                val isTransient = e is UnknownHostException || e is SocketTimeoutException || e is ConnectException
                lastError = e
                if (!isTransient || attempt == maxAttempts - 1) break
                runCatching { http.connectionPool.evictAll() }
                runCatching { Thread.sleep(delaysMs.getOrElse(attempt) { 1500L }) }
            }
        }
        val err = lastError
        if (err is UnknownHostException) {
            throw IOException(
                "Could not reach Google servers (DNS unavailable). Check your internet, VPN, or Private DNS and retry.",
                err,
            )
        }
        throw err ?: IOException("Network request failed. Please try again.")
    }

    private val _state = MutableStateFlow(loadInitialState())
    val state: StateFlow<DriveSyncState> = _state.asStateFlow()

    private fun bundledClientId(): String = BuildConfig.GOOGLE_OAUTH_CLIENT_ID.trim()
    private fun bundledClientSecret(): String = BuildConfig.GOOGLE_OAUTH_CLIENT_SECRET.trim()

    private fun loadInitialState(): DriveSyncState {
        val refresh = prefs.getString(KEY_REFRESH_TOKEN, "").orEmpty()
        val access = prefs.getString(KEY_ACCESS_TOKEN, "").orEmpty()
        return DriveSyncState(
            connected = refresh.isNotBlank() || access.isNotBlank(),
            accountEmail = prefs.getString(KEY_EMAIL, "").orEmpty(),
            autoSyncEnabled = prefs.getBoolean(KEY_AUTO_SYNC, true),
            isSyncing = false,
            lastSyncTime = prefs.getString(KEY_LAST_SYNC_TIME, "").orEmpty(),
            lastSyncSummary = prefs.getString(KEY_LAST_SYNC_SUMMARY, "Not synced yet").orEmpty(),
            lastError = null,
            deviceId = repo.getDeviceId(),
            customClientId = "",
        )
    }

    fun refreshState() {
        _state.value = loadInitialState().copy(isSyncing = _state.value.isSyncing)
    }

    fun setAutoSyncEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AUTO_SYNC, enabled).apply()
        _state.value = _state.value.copy(autoSyncEnabled = enabled)
    }

    fun disconnect() {
        runCatching { activeLoopbackSocket?.close() }
        activeOAuthJob?.cancel()
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_TOKEN_EXPIRY)
            .remove(KEY_EMAIL)
            .remove(KEY_OWN_FILE_ID)
            .apply()
        _state.value = loadInitialState().copy(lastSyncSummary = "Disconnected")
    }

    /**
     * 1-Click Desktop-identical Google Drive Sign-In via RFC 8252 localhost loopback PKCE.
     * Binds a temporary local loopback socket, opens Chrome Custom Tabs, captures the auth code,
     * exchanges tokens, syncs Google profile photo + email, and triggers immediate 2-way sync.
     */
    fun launchOneClickSignIn(
        activityContext: Context,
        onConnected: (String) -> Unit = {},
        onError: (String) -> Unit = {},
    ): Result<Unit> {
        val cid = bundledClientId()
        if (cid.isBlank()) {
            val msg = "Cloud sync credentials are not configured in this build. Use JSON Backup & Restore below."
            onError(msg)
            return Result.failure(IllegalStateException(msg))
        }

        // Cancel any previous pending sign-in socket
        runCatching { activeLoopbackSocket?.close() }
        activeOAuthJob?.cancel()

        val socket = runCatching {
            ServerSocket(OAUTH_PREFERRED_PORT, 2, InetAddress.getByName("127.0.0.1"))
        }.recoverCatching {
            ServerSocket(0, 2, InetAddress.getByName("127.0.0.1"))
        }.getOrElse { err ->
            val msg = "Could not open local sign-in listener: ${err.message}"
            onError(msg)
            return Result.failure(err)
        }

        activeLoopbackSocket = socket
        val port = socket.localPort
        val redirectUri = "http://127.0.0.1:$port/oauth2/callback"
        val verifier = generatePkceVerifier()
        val challenge = pkceChallenge(verifier)
        val oauthState = generatePkceVerifier().take(24)

        _state.value = _state.value.copy(isSyncing = true, lastError = null)

        // Start loopback listener before opening browser
        activeOAuthJob = oauthScope.launch {
            try {
                socket.soTimeout = 180_000 // 3 minutes max wait
                val client = socket.accept()
                client.use { conn ->
                    val reader = BufferedReader(InputStreamReader(conn.getInputStream()))
                    val requestLine = reader.readLine().orEmpty()
                    val pathWithQuery = requestLine.split(" ").getOrNull(1).orEmpty()
                    val query = pathWithQuery.substringAfter("?", "")
                    val params = parseQueryParams(query)

                    val error = params["error"]
                    val code = params["code"]
                    val returnedState = params["state"].orEmpty()

                    val ok = error.isNullOrBlank() && !code.isNullOrBlank() && returnedState == oauthState
                    val html = buildLoopbackHtml(ok)
                    val response = buildString {
                        append("HTTP/1.1 200 OK\r\n")
                        append("Content-Type: text/html; charset=utf-8\r\n")
                        append("Content-Length: ${html.toByteArray(Charsets.UTF_8).size}\r\n")
                        append("Connection: close\r\n\r\n")
                        append(html)
                    }
                    conn.getOutputStream().write(response.toByteArray(Charsets.UTF_8))
                    conn.getOutputStream().flush()

                    if (!ok) {
                        val reason = if (!error.isNullOrBlank()) "Google Sign-In cancelled ($error)" else "Sign-in verification failed."
                        _state.value = loadInitialState().copy(isSyncing = false, lastError = reason)
                        withContext(Dispatchers.Main) { onError(reason) }
                        return@launch
                    }

                    // Store pending exchange so foreground return (`MainActivity.onResume` / `handleOAuthIntent`)
                    // executes the Google token exchange with full foreground network & DNS permissions.
                    pendingOAuth.set(
                        PendingOAuthExchange(
                            code = code!!,
                            verifier = verifier,
                            redirectUri = redirectUri,
                            onConnected = onConnected,
                            onError = onError,
                        ),
                    )
                    // Fallback if browser doesn't auto-return within 1.4s
                    oauthScope.launch {
                        delay(1_400L)
                        completePendingOAuthIfAny()
                    }
                }
            } catch (err: Exception) {
                val msg = if (err.message?.contains("Socket closed", true) == true) {
                    "Sign-in cancelled."
                } else {
                    err.message ?: "Google Drive sign-in timed out."
                }
                _state.value = loadInitialState().copy(isSyncing = false, lastError = msg)
                withContext(Dispatchers.Main) { onError(msg) }
            } finally {
                runCatching { socket.close() }
                if (activeLoopbackSocket === socket) activeLoopbackSocket = null
            }
        }

        val scope = "https://www.googleapis.com/auth/drive.appdata email profile openid"
        val authUri = Uri.parse(GOOGLE_AUTH_URL).buildUpon()
            .appendQueryParameter("client_id", cid)
            .appendQueryParameter("redirect_uri", redirectUri)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("scope", scope)
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "S256")
            .appendQueryParameter("access_type", "offline")
            .appendQueryParameter("prompt", "consent")
            .appendQueryParameter("state", oauthState)
            .build()

        return runCatching {
            val customTabs = CustomTabsIntent.Builder().setShowTitle(true).build()
            customTabs.launchUrl(activityContext, authUri)
        }.recoverCatching {
            val browserIntent = Intent(Intent.ACTION_VIEW, authUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activityContext.startActivity(browserIntent)
        }
    }

    /** Handles foreground return intent (`com.semester.app:/oauth2redirect`) and finishes pending OAuth exchange. */
    suspend fun handleOAuthRedirect(@Suppress("UNUSED_PARAMETER") uri: Uri): Result<String> = withContext(Dispatchers.IO) {
        completePendingOAuthIfAny()
        Result.success("Returned to Semester")
    }

    /** Executes any captured OAuth code exchange safely once in foreground (guarded by mutex). */
    suspend fun completePendingOAuthIfAny() = oauthExchangeMutex.withLock {
        val pending = pendingOAuth.getAndSet(null) ?: return@withLock
        withContext(Dispatchers.IO) {
            // Brief settle pause so Android finishes foreground network & DNS handoff after Custom Tab closes
            delay(250L)
            runCatching {
                exchangeCodeAndSync(pending.code, pending.verifier, pending.redirectUri)
            }.onSuccess { email ->
                withContext(Dispatchers.Main) { pending.onConnected(email) }
            }.onFailure { err ->
                val msg = err.message ?: "Google Drive sign-in failed. Please try again."
                _state.value = loadInitialState().copy(isSyncing = false, lastError = msg)
                withContext(Dispatchers.Main) { pending.onError(msg) }
            }
        }
    }

    private suspend fun exchangeCodeAndSync(
        code: String,
        verifier: String,
        redirectUri: String,
    ): String {
        val cid = bundledClientId()
        val secret = bundledClientSecret()
        val formBuilder = FormBody.Builder()
            .add("client_id", cid)
            .add("code", code)
            .add("code_verifier", verifier)
            .add("grant_type", "authorization_code")
            .add("redirect_uri", redirectUri)
        if (secret.isNotBlank()) {
            formBuilder.add("client_secret", secret)
        }

        val req = Request.Builder().url(GOOGLE_TOKEN_URL).post(formBuilder.build()).build()
        val tokenJson = executeWithRetry(req).use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw IllegalStateException("Google sign-in failed (${resp.code}). Please try again.")
            JSONObject(raw)
        }

        val accessToken = tokenJson.optString("access_token")
        val refreshToken = tokenJson.optString("refresh_token")
        val expiresIn = tokenJson.optLong("expires_in", 3500L)
        if (accessToken.isBlank()) throw IllegalStateException("Google returned no access token.")

        val userInfo = fetchUserInfo(accessToken)
        val email = userInfo?.optString("email").orEmpty()
        val googleName = userInfo?.optString("name").orEmpty()
        val googlePic = userInfo?.optString("picture").orEmpty()

        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .apply {
                if (refreshToken.isNotBlank()) putString(KEY_REFRESH_TOKEN, refreshToken)
            }
            .putLong(KEY_TOKEN_EXPIRY, System.currentTimeMillis() + (expiresIn - 60) * 1000L)
            .putString(KEY_EMAIL, email)
            .apply()

        refreshState()
        SyncScheduler.ensurePeriodicSync(appContext)
        // CRITICAL: Pull & merge existing Drive profile/thresholds FIRST before backfilling Google account
        // defaults so a fresh device never stamps a newer updated_at with default 75%/76% over Desktop settings!
        syncTwoWay(forcePush = false)

        // Backfill Google account email, name (if still default), and avatar (if still empty) AFTER remote merge
        runCatching {
            val currentProfile = repo.getProfile()
            val updateName = if (currentProfile.name.isBlank() || currentProfile.name == "Student") googleName.ifBlank { null } else null
            val updatePic = if (currentProfile.picture.isBlank() && googlePic.isNotBlank()) {
                downloadAvatarAsDataUrl(googlePic) ?: googlePic
            } else null
            val updateEmail = if (currentProfile.email.isBlank()) email.ifBlank { null } else null
            if (updateName != null || updatePic != null || updateEmail != null) {
                repo.updateProfile(name = updateName, email = updateEmail, picture = updatePic)
            }
        }
        return email.ifBlank { "Google Drive connected" }
    }

    /**
     * Performs a complete lossless 2-way smart sync with Google Drive AppData:
     * Pulls changed peer files (from Windows Desktop / other devices), smart-merges,
     * falls back to legacy backups on empty fresh installs, uploads local edits to
     * this device's dedicated state file, and maintains 5 rolling backups.
     */
    suspend fun syncTwoWay(forcePush: Boolean = false): Result<String> = syncMutex.withLock {
        withContext(Dispatchers.IO) {
            if (!isConnected()) {
                return@withContext Result.failure(IllegalStateException("Google Drive is not connected."))
            }
            _state.value = _state.value.copy(isSyncing = true, lastError = null)
            runCatching {
                // Match Desktop: prune tombstones older than 45 days before exporting
                repo.pruneOldTombstones(45)

                val token = ensureValidAccessToken()
                val snapshotBefore = repo.exportSyncSnapshot()
                val deviceId = sanitizeDeviceId(snapshotBefore.deviceId)
                val ownFilename = "semester_device_$deviceId.json"

                val deviceFiles = listAppDataFiles(token, "name contains 'semester_device_'")
                var ownFileId: String? = prefs.getString(KEY_OWN_FILE_ID, null)?.takeIf { it.isNotBlank() }
                var peersMerged = 0
                val peerFiles = mutableListOf<CloudBackupItem>()

                for (file in deviceFiles) {
                    if (file.name == ownFilename) {
                        ownFileId = file.fileId
                        prefs.edit().putString(KEY_OWN_FILE_ID, file.fileId).apply()
                    } else {
                        peerFiles.add(file)
                    }
                }

                for (file in peerFiles) {
                    val seenKey = "peer_mtime_${file.fileId}"
                    val lastSeenMtime = repo.getMeta(seenKey).orEmpty()
                    if (file.modifiedTime.isNotBlank() && file.modifiedTime == lastSeenMtime && !forcePush) {
                        continue
                    }
                    val remoteJson = downloadFileText(token, file.fileId)
                    if (remoteJson.isNotBlank()) {
                        val mergeRes = repo.mergeRemoteSnapshotJson(remoteJson)
                        repo.setMeta(seenKey, file.modifiedTime)
                        if (runCatching { JSONObject(mergeRes).optBoolean("changed", false) }.getOrDefault(false)) {
                            peersMerged++
                        }
                    }
                }

                // Desktop-parity legacy fallback: if no peer device files exist AND local DB has 0 subjects,
                // seamlessly pull & merge the latest rolling backup on fresh installs.
                if (peerFiles.isEmpty()) {
                    val localSubjectsEmpty = runCatching {
                        val arr = JSONObject(snapshotBefore.payloadJson).optJSONArray("subjects")
                        arr == null || arr.length() == 0
                    }.getOrDefault(true)
                    if (localSubjectsEmpty) {
                        val legacyBackups = runCatching {
                            listAppDataFiles(token, "name contains 'semester_backup_' or name contains 'zenith_backup_'")
                        }.getOrDefault(emptyList())
                        val latest = legacyBackups.firstOrNull()
                        if (latest != null) {
                            val backupJson = runCatching { downloadFileText(token, latest.fileId) }.getOrDefault("")
                            if (backupJson.isNotBlank()) {
                                val mergeRes = runCatching { repo.mergeRemoteSnapshotJson(backupJson) }.getOrDefault("")
                                if (runCatching { JSONObject(mergeRes).optBoolean("changed", false) }.getOrDefault(false)) {
                                    peersMerged++
                                }
                            }
                        }
                    }
                }

                val snapshotAfter = repo.exportSyncSnapshot()
                val localIsEmpty = isWorkspaceEmpty(snapshotAfter.payloadJson)
                val lastUploadedHash = repo.getMeta("last_uploaded_hash").orEmpty()
                // Empty Workspace Safety Guard: NEVER push an empty fresh account over Google Drive
                // or create empty rolling backups. Pulls still run normally so Drive data restores cleanly.
                val needsPush = !localIsEmpty && (forcePush || ownFileId == null || snapshotAfter.hash != lastUploadedHash || peersMerged > 0)

                if (needsPush) {
                    val uploadedId = upsertDeviceFile(token, ownFileId, ownFilename, snapshotAfter.payloadJson)
                    prefs.edit().putString(KEY_OWN_FILE_ID, uploadedId).apply()
                    repo.setMeta("last_uploaded_hash", snapshotAfter.hash)
                    maybeWriteRollingBackup(token, snapshotAfter.payloadJson, force = forcePush)
                }

                repo.checkpointWal()

                val nowStr = isoNow()
                val summary = when {
                    localIsEmpty -> "Connected • Empty device skipped upload (add courses or sync from another device)"
                    peersMerged > 0 && needsPush -> "Synced across devices"
                    peersMerged > 0 -> "Pulled latest updates"
                    needsPush -> "Backed up latest changes"
                    else -> "Everything is up to date"
                }
                prefs.edit()
                    .putString(KEY_LAST_SYNC_TIME, nowStr)
                    .putString(KEY_LAST_SYNC_SUMMARY, summary)
                    .apply()

                _state.value = loadInitialState().copy(isSyncing = false, lastError = null)
                summary
            }.onFailure { err ->
                _state.value = _state.value.copy(isSyncing = false, lastError = err.message)
            }
        }
    }

    suspend fun listCloudBackups(): Result<List<CloudBackupItem>> = withContext(Dispatchers.IO) {
        runCatching {
            val token = ensureValidAccessToken()
            listAppDataFiles(token, "name contains 'semester_backup_' or name contains 'zenith_backup_' or name contains 'semester_device_'")
        }
    }

    suspend fun restoreCloudBackup(fileId: String, replaceAll: Boolean = false): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val token = ensureValidAccessToken()
            val text = downloadFileText(token, fileId)
            if (replaceAll) {
                repo.importBackupJson(text)
            } else {
                repo.mergeRemoteSnapshotJson(text)
            }
            "Cloud snapshot restored seamlessly."
        }
    }

    fun isConnected(): Boolean {
        val refresh = prefs.getString(KEY_REFRESH_TOKEN, "").orEmpty()
        val access = prefs.getString(KEY_ACCESS_TOKEN, "").orEmpty()
        return refresh.isNotBlank() || access.isNotBlank()
    }

    private fun ensureValidAccessToken(): String {
        val access = prefs.getString(KEY_ACCESS_TOKEN, "").orEmpty()
        val expiry = prefs.getLong(KEY_TOKEN_EXPIRY, 0L)
        if (access.isNotBlank() && System.currentTimeMillis() < expiry) {
            return access
        }
        val refresh = prefs.getString(KEY_REFRESH_TOKEN, "").orEmpty()
        val cid = bundledClientId()
        val secret = bundledClientSecret()
        if (refresh.isBlank() || cid.isBlank()) {
            if (access.isNotBlank()) return access
            throw IllegalStateException("Google Drive session expired. Please reconnect in Settings.")
        }
        val formBuilder = FormBody.Builder()
            .add("client_id", cid)
            .add("refresh_token", refresh)
            .add("grant_type", "refresh_token")
        if (secret.isNotBlank()) {
            formBuilder.add("client_secret", secret)
        }
        val req = Request.Builder().url(GOOGLE_TOKEN_URL).post(formBuilder.build()).build()
        val json = executeWithRetry(req).use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw IllegalStateException("Google session refresh failed. Please reconnect in Settings.")
            JSONObject(raw)
        }
        val nextAccess = json.optString("access_token")
        val expiresIn = json.optLong("expires_in", 3500L)
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, nextAccess)
            .putLong(KEY_TOKEN_EXPIRY, System.currentTimeMillis() + (expiresIn - 60) * 1000L)
            .apply()
        return nextAccess
    }

    private fun fetchUserInfo(accessToken: String): JSONObject? {
        val req = Request.Builder()
            .url(GOOGLE_USERINFO_URL)
            .header("Authorization", "Bearer $accessToken")
            .get()
            .build()
        return runCatching {
            executeWithRetry(req, maxAttempts = 2).use { resp ->
                if (!resp.isSuccessful) null else JSONObject(resp.body?.string().orEmpty())
            }
        }.getOrNull()
    }

    private fun downloadAvatarAsDataUrl(url: String): String? = runCatching {
        val req = Request.Builder().url(url).get().build()
        executeWithRetry(req, maxAttempts = 2).use { resp ->
            if (!resp.isSuccessful) return@runCatching null
            val bytes = resp.body?.bytes() ?: return@runCatching null
            if (bytes.isEmpty() || bytes.size > 300_000) return@runCatching null
            val mime = resp.header("Content-Type")?.substringBefore(";")?.ifBlank { "image/jpeg" } ?: "image/jpeg"
            "data:$mime;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
        }
    }.getOrNull()

    private fun listAppDataFiles(token: String, query: String): List<CloudBackupItem> {
        val encodedQ = URLEncoder.encode(query, "UTF-8")
        val url = "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=$encodedQ&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size)&pageSize=30"
        val req = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val json = executeWithRetry(req).use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw IllegalStateException("Drive sync check failed (${resp.code}).")
            JSONObject(raw)
        }
        val files = json.optJSONArray("files") ?: return emptyList()
        return buildList {
            for (i in 0 until files.length()) {
                val f = files.optJSONObject(i) ?: continue
                add(
                    CloudBackupItem(
                        fileId = f.optString("id"),
                        name = f.optString("name"),
                        modifiedTime = f.optString("modifiedTime"),
                        sizeBytes = f.optString("size", "0").toLongOrNull() ?: 0L,
                    ),
                )
            }
        }
    }

    private fun downloadFileText(token: String, fileId: String): String {
        val url = "https://www.googleapis.com/drive/v3/files/$fileId?alt=media"
        val req = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        return executeWithRetry(req).use { resp ->
            if (!resp.isSuccessful) throw IllegalStateException("Drive download failed (${resp.code})")
            resp.body?.string().orEmpty()
        }
    }

    private fun upsertDeviceFile(token: String, existingFileId: String?, filename: String, payloadJson: String): String {
        val jsonMedia = "application/json; charset=utf-8".toMediaType()
        if (!existingFileId.isNullOrBlank()) {
            val patchReq = Request.Builder()
                .url("https://www.googleapis.com/upload/drive/v3/files/$existingFileId?uploadType=media")
                .header("Authorization", "Bearer $token")
                .patch(payloadJson.toRequestBody(jsonMedia))
                .build()
            executeWithRetry(patchReq).use { resp ->
                if (resp.isSuccessful) return existingFileId
            }
        }
        val meta = JSONObject()
            .put("name", filename)
            .put("parents", JSONArray().put("appDataFolder"))
            .toString()
        val multipart = MultipartBody.Builder()
            .setType("multipart/related".toMediaType())
            .addPart(meta.toRequestBody(jsonMedia))
            .addPart(payloadJson.toRequestBody(jsonMedia))
            .build()
        val createReq = Request.Builder()
            .url("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id")
            .header("Authorization", "Bearer $token")
            .post(multipart)
            .build()
        return executeWithRetry(createReq).use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw IllegalStateException("Drive upload failed (${resp.code}).")
            JSONObject(raw).optString("id")
        }
    }

    private fun maybeWriteRollingBackup(token: String, payloadJson: String, force: Boolean = false) {
        val lastRolling = prefs.getLong(KEY_LAST_ROLLING_MS, 0L)
        if (!force && System.currentTimeMillis() - lastRolling < 30 * 60 * 1000L) return
        val stamp = SimpleDateFormat("yyyy-MM-dd'T'HH-mm-ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
        runCatching {
            upsertDeviceFile(token, null, "semester_backup_$stamp.json", payloadJson)
            prefs.edit().putLong(KEY_LAST_ROLLING_MS, System.currentTimeMillis()).apply()
            val backups = listAppDataFiles(token, "name contains 'semester_backup_' or name contains 'zenith_backup_'")
            if (backups.size > 5) {
                for (old in backups.drop(5)) {
                    val delReq = Request.Builder()
                        .url("https://www.googleapis.com/drive/v3/files/${old.fileId}")
                        .header("Authorization", "Bearer $token")
                        .delete()
                        .build()
                    runCatching { http.newCall(delReq).execute().close() }
                }
            }
        }
    }

    companion object {
        private const val OAUTH_PREFERRED_PORT = 43819
        private const val GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
        private const val GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
        private const val GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

        private const val PREFS_NAME = "semester_drive_sync_prefs"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_TOKEN_EXPIRY = "token_expiry_ms"
        private const val KEY_EMAIL = "account_email"
        private const val KEY_AUTO_SYNC = "auto_sync_enabled"
        private const val KEY_OWN_FILE_ID = "own_device_file_id"
        private const val KEY_LAST_SYNC_TIME = "last_sync_time"
        private const val KEY_LAST_SYNC_SUMMARY = "last_sync_summary"
        private const val KEY_LAST_ROLLING_MS = "last_rolling_ms"

        @Volatile
        private var INSTANCE: GoogleDriveSyncEngine? = null

        fun getInstance(context: Context): GoogleDriveSyncEngine =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: GoogleDriveSyncEngine(
                    context.applicationContext,
                    WorkspaceRepository.getInstance(context.applicationContext),
                ).also { INSTANCE = it }
            }

        private fun parseQueryParams(query: String): Map<String, String> {
            if (query.isBlank()) return emptyMap()
            return query.split("&").mapNotNull { pair ->
                val idx = pair.indexOf('=')
                if (idx <= 0) null
                else URLDecoder.decode(pair.substring(0, idx), "UTF-8") to
                    URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
            }.toMap()
        }

        private fun buildLoopbackHtml(success: Boolean): String = if (success) {
            """
            <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <meta http-equiv="refresh" content="0;url=com.semester.app:/oauth2redirect?done=1">
            <script>setTimeout(function(){window.location.replace("com.semester.app:/oauth2redirect?done=1");},60);</script>
            <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08090D;color:#F8FAFC;font-family:system-ui,sans-serif;text-align:center;padding:24px}.card{background:#12141B;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:28px;max-width:340px}h2{margin:0 0 8px;background:linear-gradient(90deg,#818CF8,#22D3EE);-webkit-background-clip:text;color:transparent}p{color:#9CA7BC;font-size:14px}a{display:inline-block;margin-top:16px;padding:10px 22px;border-radius:99px;background:linear-gradient(90deg,#4F46E5,#06B6D4);color:#fff;text-decoration:none;font-weight:700;font-size:14px}</style>
            </head><body><div class="card"><h2>Connected to Semester</h2><p>Finishing Google Drive sync in Semester...</p><a href="com.semester.app:/oauth2redirect?done=1">Return to Semester</a></div></body></html>
            """.trimIndent()
        } else {
            """
            <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08090D;color:#F8FAFC;font-family:system-ui,sans-serif;text-align:center;padding:24px}.card{background:#12141B;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:28px;max-width:340px}p{color:#9CA7BC;font-size:14px}</style>
            </head><body><div class="card"><h2>Sign-In Cancelled</h2><p>You can close this tab and return to Semester.</p></div></body></html>
            """.trimIndent()
        }

        internal fun isWorkspaceEmpty(payloadJson: String): Boolean = runCatching {
            val root = JSONObject(payloadJson)
            fun len(k: String): Int = root.optJSONArray(k)?.length() ?: 0
            val hasSlots = run {
                val tts = root.optJSONArray("timetables") ?: return@run false
                var found = false
                for (i in 0 until tts.length()) {
                    val sched = tts.optJSONObject(i)?.optJSONObject("schedule") ?: continue
                    val keys = sched.keys()
                    while (keys.hasNext()) {
                        val dayArr = sched.optJSONArray(keys.next())
                        if (dayArr != null && dayArr.length() > 0) {
                            found = true
                            break
                        }
                    }
                    if (found) break
                }
                found
            }
            len("subjects") == 0 &&
                len("attendance_logs") == 0 &&
                len("notes") == 0 &&
                len("manual_courses") == 0 &&
                len("semester_results") == 0 &&
                !hasSlots
        }.getOrDefault(false)

        private fun sanitizeDeviceId(raw: String): String {
            val clean = raw.filter { it.isLetterOrDigit() || it == '-' || it == '_' }.take(64)
            return clean.ifBlank { "android-default" }
        }

        private fun generatePkceVerifier(): String {
            val bytes = ByteArray(48)
            SecureRandom().nextBytes(bytes)
            return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        }

        private fun pkceChallenge(verifier: String): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
            return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        }

        private fun isoNow(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
    }
}
