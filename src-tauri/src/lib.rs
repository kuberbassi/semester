mod ai;
mod crypto;
mod db;
mod drive_sync;
mod external;
mod ipu;

use std::collections::HashMap;
use std::sync::Arc;

use ai::{AiManager, ChatTurn, SaveAiConfigInput};
use db::DesktopDb;
use drive_sync::DriveSyncManager;
use ipu::{IpuCaptchaSession, IpuFieldNames, IpuSessionManager};
use semester_core::models::{BunkGuard, SemesterResultData, TimetableSlot};
use serde_json::Value;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Arc<DesktopDb>,
    pub sync: Arc<DriveSyncManager>,
    pub ipu: Arc<IpuSessionManager>,
    pub ai: Arc<AiManager>,
}

// ─── Legacy semester-core pure math commands ─────────────────────────────────

#[tauri::command]
fn core_calculate_percentage(attended: u32, total: u32) -> f64 {
    semester_core::calculations::calculate_percentage(attended, total)
}

#[tauri::command]
fn core_calculate_bunk_guard(attended: u32, total: u32, target: u32) -> BunkGuard {
    semester_core::calculations::calculate_bunk_guard(attended, total, target)
}

#[tauri::command]
fn core_simulate_future_attendance(
    attended: u32,
    total: u32,
    future_classes: u32,
    future_attended: u32,
) -> f64 {
    semester_core::calculations::simulate_future_attendance(attended, total, future_classes, future_attended)
}

#[tauri::command]
fn core_export_timetable_qr(slots: Vec<TimetableSlot>) -> Result<String, String> {
    semester_core::sync::export_timetable_qr_string(slots)
}

#[tauri::command]
fn core_import_timetable_qr(payload: String) -> Result<Vec<TimetableSlot>, String> {
    semester_core::sync::import_timetable_qr_string(&payload)
}

#[tauri::command]
fn core_parse_ipu_results(json_str: String, default_semester: u32) -> Result<SemesterResultData, String> {
    semester_core::results::parse_ipu_raw_json(&json_str, default_semester)
}

// ─── External Browser / Mail Opener ──────────────────────────────────────────

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    external::open_url(&url)
}

// ─── Multi-Core Async SQLite Commands (spawn_blocking prevents UI stalls) ────

#[tauri::command]
async fn db_get_profile(state: State<'_, AppState>) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_profile())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_update_profile(state: State<'_, AppState>, patch: Value) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.update_profile(&patch))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_get_preferences(state: State<'_, AppState>) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_preferences())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_update_preferences(state: State<'_, AppState>, patch: Value) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.update_preferences(&patch))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_get_dashboard(state: State<'_, AppState>, semester: i64) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_dashboard_data(semester))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_get_subjects(state: State<'_, AppState>, semester: Option<i64>) -> Result<Vec<Value>, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_subjects(semester))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_get_subject(state: State<'_, AppState>, subject_id: String) -> Result<Option<Value>, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_subject_by_id(&subject_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_add_subject(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.add_subject(&payload))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_update_subject(state: State<'_, AppState>, subject_id: String, patch: Value) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.update_subject(&subject_id, &patch))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_delete_subject(state: State<'_, AppState>, subject_id: String) -> Result<bool, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.delete_subject(&subject_id))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_mark_attendance(
    state: State<'_, AppState>,
    subject_id: String,
    status: String,
    date: String,
    notes: Option<String>,
    substituted_by: Option<String>,
    semester: Option<i64>,
    log_type: Option<String>,
) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || {
        db.mark_attendance(
            &subject_id,
            &status,
            &date,
            notes.as_deref().unwrap_or(""),
            substituted_by.as_deref().unwrap_or(""),
            semester,
            log_type.as_deref().unwrap_or("Lecture"),
        )
    })
    .await
    .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_edit_attendance(
    state: State<'_, AppState>,
    log_id: String,
    status: String,
    notes: Option<String>,
    date: Option<String>,
) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || {
        db.edit_attendance(&log_id, &status, notes.as_deref(), date.as_deref())
    })
    .await
    .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_delete_attendance(state: State<'_, AppState>, log_id: String) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.delete_attendance(&log_id))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_mark_all_attendance(
    state: State<'_, AppState>,
    classes: Vec<Value>,
    status: String,
    date: String,
    semester: i64,
) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.mark_all_attendance(&classes, &status, &date, semester))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_unmark_attendance_logs(state: State<'_, AppState>, log_ids: Vec<String>) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.unmark_attendance_logs(&log_ids))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_get_calendar_data(
    state: State<'_, AppState>,
    year: i32,
    month: u32,
    semester: Option<i64>,
) -> Result<Vec<Value>, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_calendar_data(year, month, semester))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_get_logs_for_date(
    state: State<'_, AppState>,
    date: String,
    semester: Option<i64>,
) -> Result<Vec<Value>, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_logs_for_date(&date, semester))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_get_classes_for_date(
    state: State<'_, AppState>,
    date: String,
    semester: i64,
) -> Result<Vec<Value>, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_classes_for_date(&date, semester))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_get_timetable(state: State<'_, AppState>, semester: i64) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_timetable(semester))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_save_timetable_structure(
    state: State<'_, AppState>,
    semester: i64,
    periods: Value,
) -> Result<(), String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.save_timetable_structure(semester, &periods))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(())
}

#[tauri::command]
async fn db_save_timetable_slot(
    state: State<'_, AppState>,
    semester: i64,
    slot: Value,
) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.save_timetable_slot(semester, &slot))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_delete_timetable_slot(
    state: State<'_, AppState>,
    slot_id: String,
    semester: i64,
    fallback_day: Option<String>,
    fallback_start: Option<String>,
) -> Result<bool, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || {
        db.delete_timetable_slot(&slot_id, semester, fallback_day.as_deref(), fallback_start.as_deref())
    })
    .await
    .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_get_manual_courses(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_manual_courses())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_upsert_manual_course(
    state: State<'_, AppState>,
    course_id: Option<String>,
    payload: Value,
) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.upsert_manual_course(course_id.as_deref(), &payload))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_delete_manual_course(state: State<'_, AppState>, course_id: String) -> Result<bool, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.delete_manual_course(&course_id))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_get_results(state: State<'_, AppState>) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_results_analytics())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_save_results(
    state: State<'_, AppState>,
    enrollment_number: String,
    student_info: Value,
    semesters: Vec<Value>,
    source: Option<String>,
) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let src = source.unwrap_or_else(|| "manual".to_string());
    let res = tokio::task::spawn_blocking(move || {
        db.save_semester_results_batch(&enrollment_number, &student_info, &semesters, &src)
    })
    .await
    .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_update_result_subject_credit(
    state: State<'_, AppState>,
    semester: i64,
    code: String,
    name: String,
    credits: i64,
) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || {
        db.update_result_subject_credit(semester, &code, &name, credits)
    })
    .await
    .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_get_notes(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_notes())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_save_note(state: State<'_, AppState>, note: Value) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.save_note(&note))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_delete_note(state: State<'_, AppState>, note_id: String) -> Result<bool, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.delete_note(&note_id))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_get_system_logs(state: State<'_, AppState>, limit: i64, offset: i64) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.get_system_logs(limit, offset))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_export_backup(state: State<'_, AppState>) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        let (_, payload) = db.compute_content_hash()?;
        Ok(payload)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_export_backup_to_downloads(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let target_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Could not resolve Downloads directory: {}", e))?;
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.export_backup_to_dir(&target_dir))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_import_backup(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.import_backup_json(&payload))
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_wipe_all_data(state: State<'_, AppState>) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    let res = tokio::task::spawn_blocking(move || db.wipe_all_data())
        .await
        .map_err(|e| e.to_string())??;
    state.sync.mark_dirty();
    Ok(res)
}

#[tauri::command]
async fn db_reset_account_completely(state: State<'_, AppState>) -> Result<Value, String> {
    let _ = state.sync.disconnect().await;
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.reset_account_completely())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ai_local_query(
    state: State<'_, AppState>,
    message: String,
    semester: i64,
) -> Result<Value, String> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || db.query_local_assistant(&message, semester))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ai_get_config(state: State<'_, AppState>) -> Result<Value, String> {
    let ai = Arc::clone(&state.ai);
    tokio::task::spawn_blocking(move || ai.get_config())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ai_save_config(
    state: State<'_, AppState>,
    config: SaveAiConfigInput,
) -> Result<Value, String> {
    let ai = Arc::clone(&state.ai);
    tokio::task::spawn_blocking(move || ai.save_config(&config))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ai_test_connection(
    state: State<'_, AppState>,
    provider: String,
    api_key: Option<String>,
    model: Option<String>,
) -> Result<Value, String> {
    state
        .ai
        .test_connection(&provider, api_key.as_deref(), model.as_deref())
        .await
}

#[tauri::command]
async fn ai_chat(
    state: State<'_, AppState>,
    message: String,
    history: Vec<ChatTurn>,
    semester: i64,
) -> Result<Value, String> {
    state.ai.chat(&message, &history, semester).await
}

#[tauri::command]
async fn ai_process_note(
    state: State<'_, AppState>,
    content: String,
    action: String,
    custom_prompt: Option<String>,
) -> Result<Value, String> {
    state
        .ai
        .process_note(&content, &action, custom_prompt.as_deref())
        .await
}

// ─── IPU ExamWeb Direct Portal Relay (User Solves CAPTCHA Manually) ──────────

#[tauri::command]
async fn ipu_fetch_captcha(state: State<'_, AppState>) -> Result<IpuCaptchaSession, String> {
    state.ipu.fetch_captcha().await
}

#[tauri::command]
async fn ipu_sync_results(
    state: State<'_, AppState>,
    enrollment_number: String,
    password: String,
    captcha: String,
    hidden_fields: HashMap<String, String>,
    field_names: IpuFieldNames,
    login_action: String,
    hash_password: Option<bool>,
) -> Result<Value, String> {
    let (student_info, semesters) = state
        .ipu
        .login_and_fetch_all(
            &enrollment_number,
            &password,
            &captcha,
            &hidden_fields,
            &field_names,
            &login_action,
            hash_password.unwrap_or(true),
        )
        .await?;

    let db = Arc::clone(&state.db);
    let enroll_clone = enrollment_number.trim().to_string();
    let saved = tokio::task::spawn_blocking(move || {
        db.save_semester_results_batch(&enroll_clone, &student_info, &semesters, "ipu_portal")
    })
    .await
    .map_err(|e| e.to_string())??;

    state.sync.mark_dirty();
    Ok(saved)
}

// ─── Google OAuth2 Desktop PKCE + Smart Automatic Drive AppData Sync ─────────

#[tauri::command]
async fn google_oauth_connect(
    state: State<'_, AppState>,
    client_id: Option<String>,
) -> Result<Value, String> {
    state
        .sync
        .start_google_oauth(client_id.as_deref())
        .await
}

#[tauri::command]
async fn drive_get_status(state: State<'_, AppState>) -> Result<Value, String> {
    state.sync.get_status().await
}

#[tauri::command]
async fn drive_set_auto_sync(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    state.sync.set_auto_sync(enabled).await
}

#[tauri::command]
async fn drive_sync_now(state: State<'_, AppState>) -> Result<Value, String> {
    state.sync.sync_two_way(true).await
}

#[tauri::command]
async fn drive_pull_sync(state: State<'_, AppState>) -> Result<Value, String> {
    state.sync.pull_peer_changes().await
}

#[tauri::command]
async fn drive_list_backups(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    state.sync.list_backups().await
}

#[tauri::command]
async fn drive_restore_backup(state: State<'_, AppState>, file_id: String) -> Result<Value, String> {
    state.sync.restore_backup(&file_id).await
}

#[tauri::command]
async fn drive_download_backup(state: State<'_, AppState>, file_id: String) -> Result<Value, String> {
    state.sync.download_backup(&file_id).await
}

#[tauri::command]
async fn drive_download_backup_to_downloads(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    file_id: String,
    created_at: Option<String>,
) -> Result<Value, String> {
    let payload = state.sync.download_backup(&file_id).await?;
    let target_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Could not resolve Downloads directory: {}", e))?;
    let date_tag = created_at
        .as_deref()
        .and_then(|s| s.get(..10))
        .unwrap_or("snapshot")
        .replace(|c: char| !c.is_ascii_alphanumeric() && c != '-', "_");
    let filename = format!("semester_cloud_backup_{}.json", date_tag);
    let pretty = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        let final_path = target_dir.join(&filename);
        std::fs::write(&final_path, pretty.as_bytes()).map_err(|e| e.to_string())?;
        Ok(serde_json::json!({
            "path": final_path.to_string_lossy().to_string(),
            "filename": filename,
            "size_bytes": pretty.len()
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_pdf_to_downloads(
    app: tauri::AppHandle,
    filename: String,
    pdf_base64: String,
) -> Result<Value, String> {
    use base64::Engine as _;
    let clean_name: String = filename
        .trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        .take(120)
        .collect();
    let final_name = if clean_name.to_lowercase().ends_with(".pdf") && clean_name.len() > 4 {
        clean_name
    } else {
        "Semester_Academic_Transcript.pdf".to_string()
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(pdf_base64.trim())
        .map_err(|e| format!("Invalid PDF payload: {}", e))?;
    if bytes.is_empty() || bytes.len() > 20 * 1024 * 1024 {
        return Err("PDF file size is out of safe bounds.".to_string());
    }
    let target_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Could not resolve Downloads directory: {}", e))?;
    let size = bytes.len();
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        let final_path = target_dir.join(&final_name);
        std::fs::write(&final_path, &bytes).map_err(|e| e.to_string())?;
        Ok(serde_json::json!({
            "path": final_path.to_string_lossy().to_string(),
            "filename": final_name,
            "size_bytes": size
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn drive_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    state.sync.disconnect().await
}

// ─── Tauri App Entry ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed resolving app data dir: {}", e))?;
            let db_path = data_dir.join("semester_desktop_v2.db");
            let db = Arc::new(DesktopDb::open(db_path)?);
            let sync = DriveSyncManager::new(Arc::clone(&db));
            let ipu = Arc::new(IpuSessionManager::new());
            let ai = AiManager::new(Arc::clone(&db));

            app.manage(AppState { db, sync, ipu, ai });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            core_calculate_percentage,
            core_calculate_bunk_guard,
            core_simulate_future_attendance,
            core_export_timetable_qr,
            core_import_timetable_qr,
            core_parse_ipu_results,
            open_external_url,
            db_get_profile,
            db_update_profile,
            db_get_preferences,
            db_update_preferences,
            db_get_dashboard,
            db_get_subjects,
            db_get_subject,
            db_add_subject,
            db_update_subject,
            db_delete_subject,
            db_mark_attendance,
            db_edit_attendance,
            db_delete_attendance,
            db_mark_all_attendance,
            db_unmark_attendance_logs,
            db_get_calendar_data,
            db_get_logs_for_date,
            db_get_classes_for_date,
            db_get_timetable,
            db_save_timetable_structure,
            db_save_timetable_slot,
            db_delete_timetable_slot,
            db_get_manual_courses,
            db_upsert_manual_course,
            db_delete_manual_course,
            db_get_results,
            db_save_results,
            db_update_result_subject_credit,
            db_get_notes,
            db_save_note,
            db_delete_note,
            db_get_system_logs,
            db_export_backup,
            db_export_backup_to_downloads,
            db_import_backup,
            db_wipe_all_data,
            db_reset_account_completely,
            ai_local_query,
            ai_get_config,
            ai_save_config,
            ai_test_connection,
            ai_chat,
            ai_process_note,
            ipu_fetch_captcha,
            ipu_sync_results,
            google_oauth_connect,
            drive_get_status,
            drive_set_auto_sync,
            drive_sync_now,
            drive_pull_sync,
            drive_list_backups,
            drive_restore_backup,
            drive_download_backup,
            drive_download_backup_to_downloads,
            save_pdf_to_downloads,
            drive_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
