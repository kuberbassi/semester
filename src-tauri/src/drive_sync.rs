use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::Engine as _;
use chrono::Utc;
use rand::RngCore;
use reqwest::Client;
use semester_core::sync::merge_workspace_snapshots;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::{Mutex, Notify};

use crate::db::DesktopDb;
use crate::external;

const DRIVE_BACKUP_QUERY: &str = "name contains 'semester_backup_' or name contains 'zenith_backup_'";
const DRIVE_DEVICE_QUERY: &str = "name contains 'semester_device_'";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v3/userinfo";
pub const OAUTH_FIXED_PORT: u16 = 43819;
const MAX_DRIVE_BACKUP_BYTES: usize = 25 * 1024 * 1024;
const DEBOUNCE_QUIET_SECS: u64 = 3;
const DEBOUNCE_MAX_SECS: u64 = 15;
const BACKGROUND_PULL_INTERVAL_SECS: u64 = 60;
const ROLLING_SNAPSHOT_INTERVAL_SECS: i64 = 1800; // 30 minutes
const BUNDLED_DESKTOP_CLIENT_ID: Option<&str> = option_env!("GOOGLE_DESKTOP_CLIENT_ID");
const BUNDLED_DESKTOP_CLIENT_SECRET: Option<&str> = option_env!("GOOGLE_DESKTOP_CLIENT_SECRET");

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub fn validate_drive_file_id(file_id: &str) -> Result<&str, String> {
    let trimmed = file_id.trim();
    if trimmed.len() < 8
        || trimmed.len() > 128
        || !trimmed
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid Google Drive file identifier.".to_string());
    }
    Ok(trimmed)
}

pub fn sanitize_device_id(raw: &str) -> String {
    let clean: String = raw
        .trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(64)
        .collect();
    if clean.is_empty() {
        "desktop-default".to_string()
    } else {
        clean
    }
}

pub fn device_state_filename(device_id: &str) -> String {
    format!("semester_device_{}.json", sanitize_device_id(device_id))
}

fn bundled_desktop_client_id() -> Option<&'static str> {
    BUNDLED_DESKTOP_CLIENT_ID.map(str::trim).filter(|s| !s.is_empty())
}

fn bundled_desktop_client_secret() -> Option<&'static str> {
    BUNDLED_DESKTOP_CLIENT_SECRET.map(str::trim).filter(|s| !s.is_empty())
}

/// Lossless 2-Way Google Drive Sync Coordinator (Per-Device Files + CRDT/LWW + Tombstones):
/// - Each device ONLY writes its own `semester_device_<device_id>.json` file (in-place PATCH),
///   making concurrent cross-device file overwrites mathematically impossible.
/// - Pulls changed peer files (checked by lightweight `modifiedTime` metadata), merges via
///   the shared `semester-core` CRDT/LWW + Tombstone engine, and atomically updates local SQLite.
/// - Smart debounced push (3s quiet window, 15s max latency) coalesces rapid edits into 1 upload.
/// - Rolling `semester_backup_*.json` snapshots (latest 5 kept) remain available for manual restore.
pub struct DriveSyncManager {
    db: Arc<DesktopDb>,
    http: Client,
    dirty: AtomicBool,
    syncing: AtomicBool,
    notify: Notify,
    last_error: Mutex<Option<String>>,
}

impl DriveSyncManager {
    pub fn new(db: Arc<DesktopDb>) -> Arc<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(25))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to construct Drive HTTP client");

        let mgr = Arc::new(Self {
            db,
            http,
            dirty: AtomicBool::new(false),
            syncing: AtomicBool::new(false),
            notify: Notify::new(),
            last_error: Mutex::new(None),
        });

        let bg = Arc::clone(&mgr);
        tauri::async_runtime::spawn(async move {
            bg.background_loop().await;
        });

        mgr
    }

    /// Marks local state as modified and wakes the debounced background 2-way sync worker.
    pub fn mark_dirty(&self) {
        self.dirty.store(true, Ordering::SeqCst);
        self.notify.notify_one();
    }

    fn is_auto_sync_ready(&self) -> bool {
        let enabled = self
            .db
            .get_meta("auto_sync_enabled")
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(true);
        let linked = self
            .db
            .get_meta("google_refresh_token")
            .ok()
            .flatten()
            .map(|v| !v.is_empty())
            .unwrap_or(false);
        enabled && linked
    }

    async fn background_loop(self: Arc<Self>) {
        // Gentle startup pull (3s after app launch) to merge any mobile edits immediately
        tokio::time::sleep(Duration::from_secs(3)).await;
        if self.is_auto_sync_ready() {
            if let Err(err) = self.sync_two_way(false).await {
                *self.last_error.lock().await = Some(err);
            } else {
                *self.last_error.lock().await = None;
            }
        }

        loop {
            let woken_by_edit = tokio::select! {
                _ = self.notify.notified() => true,
                _ = tokio::time::sleep(Duration::from_secs(BACKGROUND_PULL_INTERVAL_SECS)) => false,
            };

            if woken_by_edit {
                // Smart coalescing debounce: wait until 3s of quiet, or max 15s elapsed
                let start = Instant::now();
                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_secs(DEBOUNCE_QUIET_SECS)) => {
                            break;
                        }
                        _ = self.notify.notified() => {
                            if start.elapsed() >= Duration::from_secs(DEBOUNCE_MAX_SECS) {
                                break;
                            }
                        }
                    }
                }
                if !self.dirty.swap(false, Ordering::SeqCst) {
                    continue;
                }
            }

            if !self.is_auto_sync_ready() {
                continue;
            }

            if let Err(err) = self.sync_two_way(false).await {
                *self.last_error.lock().await = Some(err);
                if woken_by_edit {
                    // Re-mark dirty so a future edit or reconnect retries cleanly
                    self.dirty.store(true, Ordering::SeqCst);
                }
            } else {
                *self.last_error.lock().await = None;
            }
        }
    }

    /// Native Desktop Google OAuth2 (PKCE S256 + Fixed Local Loopback Callback):
    /// Uses the app's private build-time Desktop OAuth client (never exposed in the UI or user DB).
    /// Each user signs into their own Google Account in their default browser, and tokens are
    /// encrypted locally via Windows DPAPI to access only that user's private Drive `appDataFolder`.
    pub async fn start_google_oauth(&self, fallback_client_id: Option<&str>) -> Result<Value, String> {
        let cid_owned = bundled_desktop_client_id()
            .map(str::to_string)
            .or_else(|| {
                fallback_client_id
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && *s != "missing-client-id" && *s != "your_google_client_id_here")
                    .map(str::to_string)
            })
            .ok_or_else(|| {
                "Google Drive OAuth is not configured in this build. Please contact the app publisher.".to_string()
            })?;
        let cid = cid_owned.as_str();
        let resolved_secret = bundled_desktop_client_secret().map(str::to_string);

        let listener = match TcpListener::bind(("127.0.0.1", OAUTH_FIXED_PORT)).await {
            Ok(l) => l,
            Err(_) => match TcpListener::bind(("127.0.0.1", OAUTH_FIXED_PORT + 1)).await {
                Ok(l) => l,
                Err(_) => TcpListener::bind("127.0.0.1:0")
                    .await
                    .map_err(|e| format!("Failed to bind local OAuth callback listener: {}", e))?,
            },
        };
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let redirect_uri = format!("http://127.0.0.1:{}/oauth/callback", port);

        // PKCE S256 verifier + challenge + state
        let mut verifier_bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut verifier_bytes);
        let code_verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(verifier_bytes);

        let mut sha = Sha256::new();
        sha.update(code_verifier.as_bytes());
        let code_challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sha.finalize());

        let mut state_bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut state_bytes);
        let state = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(state_bytes);

        let scopes = "openid email profile https://www.googleapis.com/auth/drive.appdata";
        let auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256&state={}",
            urlencoding::encode(cid),
            urlencoding::encode(&redirect_uri),
            urlencoding::encode(scopes),
            urlencoding::encode(&code_challenge),
            urlencoding::encode(&state)
        );

        external::open_url(&auth_url)?;

        let deadline = Instant::now() + Duration::from_secs(180);
        let mut code: Option<String> = None;
        let mut returned_state: Option<String> = None;
        let mut oauth_error: Option<String> = None;

        for _attempt in 0..12 {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err("Google sign-in timed out. Please try again.".to_string());
            }
            let (mut stream, _) = tokio::time::timeout(remaining, listener.accept())
                .await
                .map_err(|_| "Google sign-in timed out. Please try again.".to_string())?
                .map_err(|e| format!("Failed receiving OAuth callback: {}", e))?;

            let mut buf = vec![0u8; 8192];
            let n = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf))
                .await
                .ok()
                .and_then(|r| r.ok())
                .unwrap_or(0);
            let req_str = String::from_utf8_lossy(&buf[..n]);
            let first_line = req_str.lines().next().unwrap_or("");
            let mut line_parts = first_line.split_whitespace();
            let method = line_parts.next().unwrap_or("");
            let path_part = line_parts.next().unwrap_or("");
            let route = path_part.split('?').next().unwrap_or("");

            if method != "GET" || route != "/oauth/callback" {
                let not_found = "HTTP/1.1 404 Not Found\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(not_found.as_bytes()).await;
                let _ = stream.shutdown().await;
                continue;
            }

            let query = path_part.split('?').nth(1).unwrap_or("");
            for pair in query.split('&') {
                let mut it = pair.splitn(2, '=');
                let k = it.next().unwrap_or("");
                let v = urlencoding::decode(it.next().unwrap_or("")).unwrap_or_default().into_owned();
                match k {
                    "code" => code = Some(v),
                    "state" => returned_state = Some(v),
                    "error" => oauth_error = Some(v),
                    _ => {}
                }
            }

            let state_ok = returned_state
                .as_deref()
                .map(|rs| constant_time_eq(rs.as_bytes(), state.as_bytes()))
                .unwrap_or(false);

            let html_response = if oauth_error.is_none() && code.is_some() && state_ok {
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nConnection: close\r\n\r\n<!doctype html><html><body style='font-family:system-ui,sans-serif;background:#08090d;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center;padding:36px 44px;border-radius:24px;background:#12141b;border:1px solid rgba(255,255,255,0.12)'><h2 style='margin:0 0 8px;color:#818cf8'>Semester Connected</h2><p style='margin:0;color:#9ca7bc;font-size:14px'>Google Account &amp; 2-Way Drive Sync linked. You can close this tab and return to Semester.</p></div></body></html>"
            } else {
                "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nConnection: close\r\n\r\n<!doctype html><html><body style='font-family:system-ui,sans-serif;background:#08090d;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center;padding:36px 44px;border-radius:24px;background:#12141b;border:1px solid rgba(255,255,255,0.12)'><h2 style='margin:0 0 8px;color:#fb7185'>Authorization Cancelled</h2><p style='margin:0;color:#9ca7bc;font-size:14px'>You can close this tab and retry in Semester.</p></div></body></html>"
            };
            let _ = stream.write_all(html_response.as_bytes()).await;
            let _ = stream.shutdown().await;
            break;
        }

        if let Some(err) = oauth_error {
            return Err(format!("Google sign-in denied: {}", err));
        }
        let state_valid = returned_state
            .as_deref()
            .map(|rs| constant_time_eq(rs.as_bytes(), state.as_bytes()))
            .unwrap_or(false);
        if !state_valid {
            return Err("OAuth state mismatch. Please retry sign-in.".to_string());
        }
        let auth_code = code.ok_or_else(|| "No authorization code received from Google.".to_string())?;

        let mut token_params = vec![
            ("client_id", cid.to_string()),
            ("code", auth_code),
            ("code_verifier", code_verifier),
            ("grant_type", "authorization_code".to_string()),
            ("redirect_uri", redirect_uri.clone()),
        ];
        if let Some(ref sec) = resolved_secret {
            token_params.push(("client_secret", sec.clone()));
        }

        let token_resp = self
            .http
            .post(GOOGLE_TOKEN_URL)
            .form(&token_params)
            .send()
            .await
            .map_err(|e| format!("Failed exchanging OAuth code: {}", e))?;

        let token_json: Value = token_resp
            .json()
            .await
            .map_err(|e| format!("Invalid token response from Google: {}", e))?;

        if let Some(err) = token_json.get("error").and_then(|v| v.as_str()) {
            let desc = token_json.get("error_description").and_then(|v| v.as_str()).unwrap_or(err);
            return Err(format!("Google sign-in could not be completed: {}", desc));
        }

        let access_token = token_json
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or("Google did not return an access token")?
            .to_string();
        let refresh_token = token_json
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let expires_in = token_json.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3500);
        let expires_at = Utc::now().timestamp() + expires_in - 60;

        let _ = self.db.delete_meta("google_client_secret");
        let _ = self.db.delete_meta("google_client_id");
        self.db.set_secret("google_access_token", &access_token)?;
        self.db.set_meta("google_token_expires_at", &expires_at.to_string())?;
        if let Some(rt) = refresh_token {
            self.db.set_secret("google_refresh_token", &rt)?;
        }
        self.db.set_meta("auto_sync_enabled", "true")?;

        if let Ok(ui_resp) = self
            .http
            .get(GOOGLE_USERINFO_URL)
            .bearer_auth(&access_token)
            .send()
            .await
        {
            if let Ok(ui) = ui_resp.json::<Value>().await {
                let patch = json!({
                    "name": ui.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                    "email": ui.get("email").and_then(|v| v.as_str()).unwrap_or(""),
                    "picture": ui.get("picture").and_then(|v| v.as_str()).unwrap_or("")
                });
                let _ = self.db.update_profile(&patch);
            }
        }

        // Perform an immediate lossless 2-way merge with any existing cloud device files or backups!
        let _ = self.sync_two_way(false).await;

        self.db.get_profile()
    }

    async fn get_valid_access_token(&self) -> Result<String, String> {
        let now = Utc::now().timestamp();
        let exp = self
            .db
            .get_meta("google_token_expires_at")?
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);

        if exp > now {
            if let Some(tok) = self.db.get_secret("google_access_token")? {
                if !tok.is_empty() {
                    return Ok(tok);
                }
            }
        }

        let refresh_token = self
            .db
            .get_secret("google_refresh_token")?
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Google Drive is not connected yet.".to_string())?;
        let client_id = bundled_desktop_client_id()
            .map(str::to_string)
            .or_else(|| self.db.get_meta("google_client_id").ok().flatten().filter(|s| !s.is_empty()))
            .ok_or_else(|| "Google Drive OAuth is not configured in this build.".to_string())?;
        let client_secret = bundled_desktop_client_secret()
            .map(str::to_string)
            .unwrap_or_default();

        let mut form = vec![
            ("client_id", client_id),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token".to_string()),
        ];
        if !client_secret.is_empty() {
            form.push(("client_secret", client_secret));
        }

        let resp = self
            .http
            .post(GOOGLE_TOKEN_URL)
            .form(&form)
            .send()
            .await
            .map_err(|e| format!("Token refresh failed (offline?): {}", e))?;
        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        let access_token = body
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Google authorization expired. Please reconnect Google Drive.".to_string())?
            .to_string();
        let expires_in = body.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3500);
        self.db.set_secret("google_access_token", &access_token)?;
        self.db
            .set_meta("google_token_expires_at", &(Utc::now().timestamp() + expires_in - 60).to_string())?;
        Ok(access_token)
    }

    pub async fn get_status(&self) -> Result<Value, String> {
        let linked = self
            .db
            .get_meta("google_refresh_token")?
            .map(|v| !v.is_empty())
            .unwrap_or(false)
            || self
                .db
                .get_meta("google_access_token")?
                .map(|v| !v.is_empty())
                .unwrap_or(false);
        let auto_sync = self
            .db
            .get_meta("auto_sync_enabled")?
            .map(|v| v == "true")
            .unwrap_or(true);
        let last_backup = self.db.get_meta("last_synced_at")?;
        let device_id = self.db.get_meta("device_id")?.unwrap_or_default();
        let profile = self.db.get_profile().ok();
        let account_email = profile
            .as_ref()
            .and_then(|p| p.get("email"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let account_name = profile
            .as_ref()
            .and_then(|p| p.get("name"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let last_err = self.last_error.lock().await.clone();

        Ok(json!({
            "google_drive_linked": linked,
            "google_drive_backup_frequency": if auto_sync { "smart_auto" } else { "manual" },
            "auto_sync_enabled": auto_sync,
            "sync_mode": "two_way_crdt",
            "device_id": device_id,
            "account_email": account_email,
            "account_name": account_name,
            "google_drive_last_backup": last_backup,
            "is_syncing": self.syncing.load(Ordering::SeqCst),
            "has_pending_changes": self.dirty.load(Ordering::SeqCst),
            "last_error": last_err
        }))
    }

    pub async fn set_auto_sync(&self, enabled: bool) -> Result<(), String> {
        self.db
            .set_meta("auto_sync_enabled", if enabled { "true" } else { "false" })?;
        if enabled {
            self.mark_dirty();
        }
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<(), String> {
        for key in [
            "google_access_token",
            "google_refresh_token",
            "google_token_expires_at",
            "last_synced_hash",
            "drive_device_file_id",
            "last_snapshot_at",
        ] {
            let _ = self.db.delete_meta(key);
        }
        *self.last_error.lock().await = None;
        Ok(())
    }

    /// Lightweight focus/visibility wakeup check: pulls peer device changes if linked & enabled.
    pub async fn pull_peer_changes(&self) -> Result<Value, String> {
        if !self.is_auto_sync_ready() {
            return Ok(json!({ "merged": false, "skipped": true }));
        }
        self.sync_two_way(false).await
    }

    /// Full Lossless 2-Way Sync:
    /// 1. Pulls all changed peer `semester_device_*.json` files from Google Drive `appDataFolder`.
    /// 2. Merges each peer losslessly through `semester_core::sync::merge_workspace_snapshots`.
    /// 3. Applies any merged updates atomically into local SQLite.
    /// 4. Upserts this device's own `semester_device_<device_id>.json` in-place via PATCH if changed.
    /// 5. Creates a rolling point-in-time `semester_backup_*.json` snapshot on manual sync or every 30 min.
    pub async fn sync_two_way(&self, force_backup: bool) -> Result<Value, String> {
        if self.syncing.swap(true, Ordering::SeqCst) {
            return Ok(json!({ "message": "Sync already in progress", "skipped": true, "merged": false }));
        }
        let result = self.sync_two_way_inner(force_backup).await;
        self.syncing.store(false, Ordering::SeqCst);
        match &result {
            Ok(_) => {
                *self.last_error.lock().await = None;
            }
            Err(err) => {
                *self.last_error.lock().await = Some(err.clone());
            }
        }
        result
    }

    async fn list_device_files(&self, access_token: &str) -> Result<Vec<Value>, String> {
        let resp = self
            .http
            .get("https://www.googleapis.com/drive/v3/files")
            .bearer_auth(access_token)
            .query(&[
                ("spaces", "appDataFolder"),
                ("q", DRIVE_DEVICE_QUERY),
                ("orderBy", "modifiedTime desc"),
                ("fields", "files(id, name, modifiedTime, size)"),
                ("pageSize", "30"),
            ])
            .send()
            .await
            .map_err(|e| format!("Failed listing Drive sync devices: {}", e))?;
        let status = resp.status();
        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(format!("Google Drive returned HTTP {} while checking peer devices.", status.as_u16()));
        }
        Ok(body
            .get("files")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default())
    }

    async fn download_json_with_token(&self, access_token: &str, file_id: &str) -> Result<Value, String> {
        let safe_id = validate_drive_file_id(file_id)?;
        let resp = self
            .http
            .get(format!("https://www.googleapis.com/drive/v3/files/{}", safe_id))
            .bearer_auth(access_token)
            .query(&[("alt", "media")])
            .send()
            .await
            .map_err(|e| format!("Failed downloading Drive file: {}", e))?;
        let status = resp.status();
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Failed reading Drive file: {}", e))?;
        if !status.is_success() {
            return Err(format!(
                "Google Drive returned HTTP {} while downloading sync state.",
                status.as_u16()
            ));
        }
        if bytes.len() > MAX_DRIVE_BACKUP_BYTES {
            return Err("Downloaded Drive sync payload exceeds maximum safe size (25 MB).".to_string());
        }
        serde_json::from_slice::<Value>(&bytes).map_err(|e| format!("Invalid sync JSON: {}", e))
    }

    async fn upload_multipart_file(&self, access_token: &str, filename: &str, content: &str) -> Result<String, String> {
        let metadata = json!({
            "name": filename,
            "parents": ["appDataFolder"]
        });
        let boundary = "-------semester_sync_boundary_9821";
        let body = format!(
            "\r\n--{b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n--{b}\r\nContent-Type: application/json\r\n\r\n{data}\r\n--{b}--",
            b = boundary,
            meta = metadata,
            data = content
        );
        let resp = self
            .http
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
            .bearer_auth(access_token)
            .header("Content-Type", format!("multipart/related; boundary={}", boundary))
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Drive upload failed: {}", e))?;
        let res_json: Value = resp.json().await.map_err(|e| e.to_string())?;
        res_json
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Google Drive upload error: {}", res_json))
            .map(str::to_string)
    }

    async fn patch_media_file(&self, access_token: &str, file_id: &str, content: &str) -> Result<bool, String> {
        let safe_id = validate_drive_file_id(file_id)?;
        let resp = self
            .http
            .patch(format!(
                "https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media",
                safe_id
            ))
            .bearer_auth(access_token)
            .header("Content-Type", "application/json; charset=UTF-8")
            .body(content.to_string())
            .send()
            .await
            .map_err(|e| format!("Drive PATCH failed: {}", e))?;
        if resp.status().as_u16() == 404 {
            return Ok(false);
        }
        if !resp.status().is_success() {
            return Err(format!(
                "Google Drive returned HTTP {} while updating device state.",
                resp.status().as_u16()
            ));
        }
        Ok(true)
    }

    async fn sync_two_way_inner(&self, force_backup: bool) -> Result<Value, String> {
        let access_token = self.get_valid_access_token().await?;

        // Prune tombstones older than 45 days locally before exporting
        {
            let db_prune = Arc::clone(&self.db);
            let _ = tokio::task::spawn_blocking(move || db_prune.prune_old_tombstones(45)).await;
        }

        let device_id = self.db.get_meta("device_id")?.unwrap_or_default();
        let my_filename = device_state_filename(&device_id);
        let device_files = self.list_device_files(&access_token).await?;

        let mut my_file_id = self
            .db
            .get_meta("drive_device_file_id")?
            .filter(|s| validate_drive_file_id(s).is_ok());

        // Discover our own existing device file on Drive if not cached locally
        for f in &device_files {
            if f.get("name").and_then(|v| v.as_str()) == Some(my_filename.as_str()) {
                if let Some(fid) = f.get("id").and_then(|v| v.as_str()) {
                    if validate_drive_file_id(fid).is_ok() {
                        my_file_id = Some(fid.to_string());
                        let _ = self.db.set_meta("drive_device_file_id", fid);
                        break;
                    }
                }
            }
        }

        // ── Phase 1: Pull & Losslessly Merge Changed Peer Device Files ───────
        let mut peers_checked = 0usize;
        let mut merged_any = false;

        let db_local = Arc::clone(&self.db);
        let (mut local_hash, mut local_payload) =
            tokio::task::spawn_blocking(move || db_local.compute_content_hash())
                .await
                .map_err(|e| e.to_string())??;

        let peer_files: Vec<&Value> = device_files
            .iter()
            .filter(|f| f.get("name").and_then(|v| v.as_str()) != Some(my_filename.as_str()))
            .collect();

        for peer in &peer_files {
            let Some(peer_fid) = peer.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            if validate_drive_file_id(peer_fid).is_err() {
                continue;
            }
            let peer_mod = peer.get("modifiedTime").and_then(|v| v.as_str()).unwrap_or("");
            let mod_key = format!("peer_mod_{}", peer_fid);
            let cached_mod = self.db.get_meta(&mod_key)?.unwrap_or_default();
            peers_checked += 1;

            // Zero-bandwidth skip when peer file hasn't changed since our last merge
            if !force_backup && !peer_mod.is_empty() && cached_mod == peer_mod {
                continue;
            }

            let peer_payload = self.download_json_with_token(&access_token, peer_fid).await?;
            let local_clone = local_payload.clone();
            let merge_res = tokio::task::spawn_blocking(move || {
                merge_workspace_snapshots(&local_clone, &peer_payload)
            })
            .await
            .map_err(|e| e.to_string())??;

            if merge_res.changed_from_local {
                let db_apply = Arc::clone(&self.db);
                let merged_snap = merge_res.snapshot;
                let (new_hash, new_payload) =
                    tokio::task::spawn_blocking(move || -> Result<(String, Value), String> {
                        db_apply.apply_merged_snapshot(&merged_snap)?;
                        db_apply.compute_content_hash()
                    })
                    .await
                    .map_err(|e| e.to_string())??;
                local_hash = new_hash;
                local_payload = new_payload;
                merged_any = true;
            }

            if !peer_mod.is_empty() {
                let _ = self.db.set_meta(&mod_key, peer_mod);
            }
        }

        // Legacy fallback: if NO peer device files exist AND local DB has 0 subjects,
        // merge/restore the latest `semester_backup_*.json` automatically on fresh installs.
        if peer_files.is_empty() {
            let local_subs_empty = local_payload
                .get("subjects")
                .and_then(|v| v.as_array())
                .map(|a| a.is_empty())
                .unwrap_or(true);
            if local_subs_empty {
                if let Ok(backups) = self.list_backups().await {
                    if let Some(latest_id) = backups.first().and_then(|b| b.get("id")).and_then(|v| v.as_str()) {
                        if let Ok(backup_payload) = self.download_json_with_token(&access_token, latest_id).await {
                            let local_clone = local_payload.clone();
                            if let Ok(Ok(merge_res)) = tokio::task::spawn_blocking(move || {
                                merge_workspace_snapshots(&local_clone, &backup_payload)
                            })
                            .await
                            {
                                if merge_res.changed_from_local {
                                    let db_apply = Arc::clone(&self.db);
                                    let merged_snap = merge_res.snapshot;
                                    if let Ok(Ok((new_hash, new_payload))) =
                                        tokio::task::spawn_blocking(move || -> Result<(String, Value), String> {
                                            db_apply.apply_merged_snapshot(&merged_snap)?;
                                            db_apply.compute_content_hash()
                                        })
                                        .await
                                    {
                                        local_hash = new_hash;
                                        local_payload = new_payload;
                                        merged_any = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Phase 2: Push Our Own Per-Device State File (In-Place PATCH) ─────
        // Safety Guard: NEVER upload a completely empty workspace shell over Google Drive!
        // This prevents fresh installs or empty devices from polluting Drive or creating empty backups.
        let local_is_empty = is_workspace_snapshot_empty(&local_payload);
        let prev_hash = self.db.get_meta("last_synced_hash")?.unwrap_or_default();
        let needs_upload = !local_is_empty && (force_backup || merged_any || prev_hash != local_hash || my_file_id.is_none());

        let mut uploaded = false;
        let mut active_file_id = my_file_id.clone().unwrap_or_default();

        if needs_upload {
            let content = serde_json::to_string(&local_payload).map_err(|e| e.to_string())?;
            let patched = if let Some(ref fid) = my_file_id {
                self.patch_media_file(&access_token, fid, &content).await?
            } else {
                false
            };

            if !patched {
                let created_id = self
                    .upload_multipart_file(&access_token, &my_filename, &content)
                    .await?;
                self.db.set_meta("drive_device_file_id", &created_id)?;
                active_file_id = created_id;
            }
            uploaded = true;

            let now = Utc::now();
            let now_str = now.to_rfc3339();
            self.db.set_meta("last_synced_hash", &local_hash)?;
            self.db.set_meta("last_synced_at", &now_str)?;

            // ── Phase 3: Rolling Point-in-Time Snapshot (`semester_backup_*.json`) ─
            let last_snap_ts = self
                .db
                .get_meta("last_snapshot_at")?
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            if force_backup || (now.timestamp() - last_snap_ts >= ROLLING_SNAPSHOT_INTERVAL_SECS) {
                let snap_name = format!("semester_backup_{}.json", now.format("%Y-%m-%dT%H-%M-%SZ"));
                if let Ok(snap_id) = self
                    .upload_multipart_file(&access_token, &snap_name, &content)
                    .await
                {
                    let _ = self.db.set_meta("last_snapshot_at", &now.timestamp().to_string());
                    let _ = self.prune_old_backups(&access_token).await;
                    if force_backup {
                        active_file_id = snap_id;
                    }
                }
            }
        }

        Ok(json!({
            "message": if merged_any {
                "Merged changes from other devices and synced cleanly"
            } else if uploaded {
                "Synced cleanly to Google Drive"
            } else {
                "Already up to date"
            },
            "file_id": active_file_id,
            "merged": merged_any,
            "uploaded": uploaded,
            "peers_checked": peers_checked,
            "synced_at": self.db.get_meta("last_synced_at")?.unwrap_or_default()
        }))
    }

    async fn prune_old_backups(&self, access_token: &str) -> Result<(), String> {
        let resp = self
            .http
            .get("https://www.googleapis.com/drive/v3/files")
            .bearer_auth(access_token)
            .query(&[
                ("spaces", "appDataFolder"),
                ("q", DRIVE_BACKUP_QUERY),
                ("orderBy", "createdTime desc"),
                ("fields", "files(id)"),
                ("pageSize", "20"),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(files) = body.get("files").and_then(|v| v.as_array()) {
            for f in files.iter().skip(5) {
                if let Some(raw_fid) = f.get("id").and_then(|v| v.as_str()) {
                    if let Ok(fid) = validate_drive_file_id(raw_fid) {
                        let _ = self
                            .http
                            .delete(format!("https://www.googleapis.com/drive/v3/files/{}", fid))
                            .bearer_auth(access_token)
                            .send()
                            .await;
                    }
                }
            }
        }
        Ok(())
    }

    pub async fn list_backups(&self) -> Result<Vec<Value>, String> {
        let access_token = self.get_valid_access_token().await?;
        let resp = self
            .http
            .get("https://www.googleapis.com/drive/v3/files")
            .bearer_auth(&access_token)
            .query(&[
                ("spaces", "appDataFolder"),
                ("q", DRIVE_BACKUP_QUERY),
                ("orderBy", "createdTime desc"),
                ("fields", "files(id, name, createdTime, size)"),
                ("pageSize", "20"),
            ])
            .send()
            .await
            .map_err(|e| format!("Failed listing Drive backups: {}", e))?;

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        let files = body
            .get("files")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        Ok(files
            .into_iter()
            .map(|f| {
                let size_num = f
                    .get("size")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);
                json!({
                    "id": f.get("id").cloned().unwrap_or(json!("")),
                    "name": f.get("name").cloned().unwrap_or(json!("backup.json")),
                    "created_at": f.get("createdTime").cloned().unwrap_or(json!("")),
                    "size": size_num
                })
            })
            .collect())
    }

    pub async fn download_backup(&self, file_id: &str) -> Result<Value, String> {
        let access_token = self.get_valid_access_token().await?;
        self.download_json_with_token(&access_token, file_id).await
    }

    pub async fn restore_backup(&self, file_id: &str) -> Result<Value, String> {
        let payload = self.download_backup(file_id).await?;
        let db = Arc::clone(&self.db);
        let (res, new_hash) = tokio::task::spawn_blocking(move || -> Result<(Value, String), String> {
            let imported = db.import_backup_json(&payload)?;
            let (hash, _) = db.compute_content_hash()?;
            Ok((imported, hash))
        })
        .await
        .map_err(|e| e.to_string())??;

        self.dirty.store(false, Ordering::SeqCst);
        let _ = self.db.set_meta("last_synced_hash", &new_hash);
        let _ = self.db.set_meta("last_synced_at", &Utc::now().to_rfc3339());
        *self.last_error.lock().await = None;
        Ok(res)
    }
}

/// Returns `true` when a workspace snapshot has zero academic data (no subjects, logs, notes,
/// courses, results, or timetable slots). Used to ensure empty fresh devices never push an
/// empty shell over Google Drive or write empty rolling backups.
fn is_workspace_snapshot_empty(payload: &Value) -> bool {
    let arr_len = |key: &str| {
        payload
            .get(key)
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0)
    };
    let tt_has_slots = payload
        .get("timetables")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter().any(|t| {
                t.get("schedule")
                    .and_then(|s| s.as_object())
                    .map(|m| {
                        m.values()
                            .any(|day| day.as_array().map(|a| !a.is_empty()).unwrap_or(false))
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);
    arr_len("subjects") == 0
        && arr_len("attendance_logs") == 0
        && arr_len("notes") == 0
        && arr_len("manual_courses") == 0
        && arr_len("semester_results") == 0
        && !tt_has_slots
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_workspace_guard() {
        assert!(is_workspace_snapshot_empty(&json!({
            "subjects": [],
            "attendance_logs": [],
            "notes": [],
            "manual_courses": [],
            "semester_results": [],
            "timetables": []
        })));
        assert!(!is_workspace_snapshot_empty(&json!({
            "subjects": [{ "id": "s1", "name": "DSA" }],
            "attendance_logs": []
        })));
    }

    #[test]
    fn test_drive_security_validators() {
        assert!(validate_drive_file_id("1AbCdEfGhIjKlMnOpQrStUvWxYz_09-").is_ok());
        assert!(validate_drive_file_id("../etc/passwd").is_err());
        assert!(validate_drive_file_id("abc?alt=media&foo=1").is_err());
        assert!(validate_drive_file_id("short").is_err());
        assert!(constant_time_eq(b"state_abc123", b"state_abc123"));
        assert!(!constant_time_eq(b"state_abc123", b"state_abc124"));
        assert!(!constant_time_eq(b"short", b"longer"));
        assert_eq!(
            device_state_filename("550e8400-e29b/../../evil"),
            "semester_device_550e8400-e29bevil.json"
        );
        assert_eq!(device_state_filename("   "), "semester_device_desktop-default.json");
    }
}
