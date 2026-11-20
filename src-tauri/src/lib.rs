use semester_core::models::{BunkGuard, SemesterResultData, TimetableSlot};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      core_calculate_percentage,
      core_calculate_bunk_guard,
      core_simulate_future_attendance,
      core_export_timetable_qr,
      core_import_timetable_qr,
      core_parse_ipu_results,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
