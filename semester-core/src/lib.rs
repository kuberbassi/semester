pub mod models;
pub mod calculations;
pub mod db;
pub mod sync;
pub mod results;
pub mod workspace;

use std::sync::Arc;
use models::SemesterCoreError;

// Scaffolding for UniFFI bindings generation (Kotlin on Android, Swift on iOS, etc.)
uniffi::setup_scaffolding!();

#[derive(uniffi::Object)]
pub struct SemesterDb {
    inner: db::Database,
}

#[uniffi::export]
impl SemesterDb {
    #[uniffi::constructor]
    pub fn open(path: String) -> Result<Arc<Self>, SemesterCoreError> {
        let inner = db::Database::open(&path)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })?;
        Ok(Arc::new(Self { inner }))
    }

    pub fn get_subjects(&self, semester: Option<u32>) -> Result<Vec<models::Subject>, SemesterCoreError> {
        self.inner.get_subjects(semester)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn add_subject(&self, subject: models::Subject) -> Result<(), SemesterCoreError> {
        self.inner.add_subject(&subject)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn delete_subject(&self, id: String) -> Result<bool, SemesterCoreError> {
        self.inner.delete_subject(&id)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn mark_attendance(
        &self,
        id: String,
        subject_id: String,
        date: String,
        status: models::AttendanceStatus,
        notes: Option<String>,
        log_type: String,
    ) -> Result<models::AttendanceLog, SemesterCoreError> {
        self.inner.mark_attendance(&id, &subject_id, &date, status, notes, &log_type)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn unmark_attendance(&self, log_id: String) -> Result<bool, SemesterCoreError> {
        self.inner.unmark_attendance(&log_id)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn get_attendance_logs(&self, subject_id: Option<String>, limit: u32) -> Result<Vec<models::AttendanceLog>, SemesterCoreError> {
        self.inner.get_attendance_logs(subject_id.as_deref(), limit)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn save_timetable_slot(&self, slot: models::TimetableSlot) -> Result<(), SemesterCoreError> {
        self.inner.save_timetable_slot(&slot)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn get_timetable_for_day(&self, day: String) -> Result<Vec<models::TimetableSlot>, SemesterCoreError> {
        self.inner.get_timetable_for_day(&day)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn save_semester_result(&self, result: models::SemesterResultData) -> Result<(), SemesterCoreError> {
        self.inner.save_semester_result(&result)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn get_semester_results(&self) -> Result<Vec<models::SemesterResultData>, SemesterCoreError> {
        self.inner.get_semester_results()
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn delete_semester_result(&self, semester: u32) -> Result<bool, SemesterCoreError> {
        self.inner.delete_semester_result(semester)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn save_note(&self, note: models::Note) -> Result<(), SemesterCoreError> {
        self.inner.save_note(&note)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn get_notes(&self, subject_id: Option<String>) -> Result<Vec<models::Note>, SemesterCoreError> {
        self.inner.get_notes(subject_id.as_deref())
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn delete_note(&self, id: String) -> Result<bool, SemesterCoreError> {
        self.inner.delete_note(&id)
            .map_err(|e| SemesterCoreError::DatabaseError { reason: e.to_string() })
    }

    pub fn export_backup_json(&self) -> Result<String, SemesterCoreError> {
        sync::export_backup_json(&self.inner)
            .map_err(|e| SemesterCoreError::SyncError { reason: e })
    }

    pub fn import_backup_json(&self, json_str: String) -> Result<models::SyncStats, SemesterCoreError> {
        sync::import_backup_json(&self.inner, &json_str)
            .map_err(|e| SemesterCoreError::SyncError { reason: e })
    }
}

/// Full v2 Unified Workspace Engine (100% schema & 2-way CRDT sync parity with Desktop SQLite).
#[derive(uniffi::Object)]
pub struct SemesterWorkspace {
    inner: workspace::WorkspaceDb,
}

fn db_err(e: String) -> SemesterCoreError {
    SemesterCoreError::DatabaseError { reason: e }
}

fn to_json_str(v: &serde_json::Value) -> Result<String, SemesterCoreError> {
    serde_json::to_string(v).map_err(|e| SemesterCoreError::ParseError { reason: e.to_string() })
}

fn parse_json(raw: &str) -> Result<serde_json::Value, SemesterCoreError> {
    serde_json::from_str(raw).map_err(|e| SemesterCoreError::ParseError { reason: e.to_string() })
}

#[uniffi::export]
impl SemesterWorkspace {
    #[uniffi::constructor]
    pub fn open(path: String) -> Result<Arc<Self>, SemesterCoreError> {
        let inner = workspace::WorkspaceDb::open(&path).map_err(db_err)?;
        Ok(Arc::new(Self { inner }))
    }

    pub fn get_profile_json(&self) -> Result<String, SemesterCoreError> {
        to_json_str(&self.inner.get_profile().map_err(db_err)?)
    }

    pub fn update_profile_json(&self, patch_json: String) -> Result<String, SemesterCoreError> {
        let patch = parse_json(&patch_json)?;
        to_json_str(&self.inner.update_profile(&patch).map_err(db_err)?)
    }

    pub fn get_dashboard_json(&self, semester: i64) -> Result<String, SemesterCoreError> {
        to_json_str(&self.inner.get_dashboard_data(semester).map_err(db_err)?)
    }

    pub fn get_subjects_json(&self, semester: Option<i64>) -> Result<String, SemesterCoreError> {
        let list = self.inner.get_subjects(semester).map_err(db_err)?;
        to_json_str(&serde_json::Value::Array(list))
    }

    pub fn add_subject_json(&self, payload_json: String) -> Result<String, SemesterCoreError> {
        let payload = parse_json(&payload_json)?;
        to_json_str(&self.inner.add_subject(&payload).map_err(db_err)?)
    }

    pub fn update_subject_json(&self, subject_id: String, patch_json: String) -> Result<String, SemesterCoreError> {
        let patch = parse_json(&patch_json)?;
        to_json_str(&self.inner.update_subject(&subject_id, &patch).map_err(db_err)?)
    }

    pub fn delete_subject(&self, subject_id: String) -> Result<bool, SemesterCoreError> {
        self.inner.delete_subject(&subject_id).map_err(db_err)
    }

    pub fn mark_attendance_json(
        &self,
        subject_id: String,
        status: String,
        date: String,
        notes: String,
        substituted_by: String,
        semester: Option<i64>,
        log_type: String,
    ) -> Result<String, SemesterCoreError> {
        let res = self
            .inner
            .mark_attendance(&subject_id, &status, &date, &notes, &substituted_by, semester, &log_type)
            .map_err(db_err)?;
        to_json_str(&res)
    }

    pub fn edit_attendance_json(
        &self,
        log_id: String,
        status: String,
        notes: Option<String>,
        date: Option<String>,
    ) -> Result<String, SemesterCoreError> {
        let res = self
            .inner
            .edit_attendance(&log_id, &status, notes.as_deref(), date.as_deref())
            .map_err(db_err)?;
        to_json_str(&res)
    }

    pub fn edit_attendance_full_json(
        &self,
        log_id: String,
        status: String,
        notes: Option<String>,
        date: Option<String>,
        substituted_by: Option<String>,
    ) -> Result<String, SemesterCoreError> {
        let res = self
            .inner
            .edit_attendance_full(
                &log_id,
                &status,
                notes.as_deref(),
                date.as_deref(),
                substituted_by.as_deref(),
            )
            .map_err(db_err)?;
        to_json_str(&res)
    }

    pub fn mark_attendance_batch_json(
        &self,
        items_json: String,
        status: String,
        date: String,
        notes: String,
        semester: Option<i64>,
    ) -> Result<String, SemesterCoreError> {
        let parsed = parse_json(&items_json)?;
        let items = parsed.as_array().cloned().unwrap_or_default();
        let res = self
            .inner
            .mark_attendance_batch(&items, &status, &date, &notes, semester)
            .map_err(db_err)?;
        to_json_str(&res)
    }

    pub fn delete_attendance_batch_json(&self, log_ids_json: String) -> Result<String, SemesterCoreError> {
        let parsed = parse_json(&log_ids_json)?;
        let ids: Vec<String> = parsed
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        let res = self.inner.delete_attendance_batch(&ids).map_err(db_err)?;
        to_json_str(&res)
    }

    pub fn get_subject_logs_json(&self, subject_id: String, limit: i64) -> Result<String, SemesterCoreError> {
        let list = self.inner.get_subject_logs(&subject_id, limit).map_err(db_err)?;
        to_json_str(&serde_json::Value::Array(list))
    }

    pub fn delete_attendance(&self, log_id: String) -> Result<bool, SemesterCoreError> {
        self.inner.delete_attendance(&log_id).map_err(db_err)
    }

    pub fn get_calendar_json(&self, year: i32, month: u32, semester: Option<i64>) -> Result<String, SemesterCoreError> {
        let list = self.inner.get_calendar_data(year, month, semester).map_err(db_err)?;
        to_json_str(&serde_json::Value::Array(list))
    }

    pub fn get_logs_for_date_json(&self, date: String, semester: Option<i64>) -> Result<String, SemesterCoreError> {
        let list = self.inner.get_logs_for_date(&date, semester).map_err(db_err)?;
        to_json_str(&serde_json::Value::Array(list))
    }

    pub fn get_classes_for_date_json(&self, date: String, semester: i64) -> Result<String, SemesterCoreError> {
        let list = self.inner.get_classes_for_date(&date, semester).map_err(db_err)?;
        to_json_str(&serde_json::Value::Array(list))
    }

    pub fn get_timetable_json(&self, semester: i64) -> Result<String, SemesterCoreError> {
        to_json_str(&self.inner.get_timetable(semester).map_err(db_err)?)
    }

    pub fn save_timetable_structure_json(&self, semester: i64, periods_json: String) -> Result<(), SemesterCoreError> {
        let periods = parse_json(&periods_json)?;
        self.inner.save_timetable_structure(semester, &periods).map_err(db_err)
    }

    pub fn save_timetable_slot_json(&self, semester: i64, slot_json: String) -> Result<String, SemesterCoreError> {
        let slot = parse_json(&slot_json)?;
        to_json_str(&self.inner.save_timetable_slot(semester, &slot).map_err(db_err)?)
    }

    pub fn delete_timetable_slot(
        &self,
        slot_id: String,
        semester: i64,
        fallback_day: Option<String>,
        fallback_start: Option<String>,
    ) -> Result<bool, SemesterCoreError> {
        self.inner
            .delete_timetable_slot(&slot_id, semester, fallback_day.as_deref(), fallback_start.as_deref())
            .map_err(db_err)
    }

    pub fn export_timetable_qr_v2(&self, semester: i64) -> Result<String, SemesterCoreError> {
        self.inner.export_timetable_qr_v2(semester).map_err(db_err)
    }

    pub fn import_timetable_qr_v2_json(&self, semester: i64, payload: String) -> Result<String, SemesterCoreError> {
        let res = self.inner.import_timetable_qr_v2(semester, &payload).map_err(db_err)?;
        to_json_str(&res)
    }

    pub fn get_results_analytics_json(&self) -> Result<String, SemesterCoreError> {
        to_json_str(&self.inner.get_results_analytics().map_err(db_err)?)
    }

    pub fn save_semester_results_batch_json(
        &self,
        enrollment_number: String,
        student_info_json: String,
        semesters_json: String,
        source: String,
    ) -> Result<String, SemesterCoreError> {
        let info = parse_json(&student_info_json)?;
        let sems_val = parse_json(&semesters_json)?;
        let sems = sems_val.as_array().cloned().unwrap_or_default();
        let res = self
            .inner
            .save_semester_results_batch(&enrollment_number, &info, &sems, &source)
            .map_err(db_err)?;
        to_json_str(&res)
    }

    pub fn update_result_subject_credit_json(
        &self,
        semester: i64,
        code: String,
        name: String,
        credits: i64,
    ) -> Result<String, SemesterCoreError> {
        let res = self
            .inner
            .update_result_subject_credit(semester, &code, &name, credits)
            .map_err(db_err)?;
        to_json_str(&res)
    }

    pub fn get_notes_json(&self) -> Result<String, SemesterCoreError> {
        let list = self.inner.get_notes().map_err(db_err)?;
        to_json_str(&serde_json::Value::Array(list))
    }

    pub fn save_note_json(&self, note_json: String) -> Result<String, SemesterCoreError> {
        let note = parse_json(&note_json)?;
        to_json_str(&self.inner.save_note(&note).map_err(db_err)?)
    }

    pub fn delete_note(&self, note_id: String) -> Result<bool, SemesterCoreError> {
        self.inner.delete_note(&note_id).map_err(db_err)
    }

    pub fn get_manual_courses_json(&self) -> Result<String, SemesterCoreError> {
        let list = self.inner.get_manual_courses().map_err(db_err)?;
        to_json_str(&serde_json::Value::Array(list))
    }

    pub fn save_manual_course_json(&self, course_json: String) -> Result<String, SemesterCoreError> {
        let course = parse_json(&course_json)?;
        to_json_str(&self.inner.save_manual_course(&course).map_err(db_err)?)
    }

    pub fn delete_manual_course(&self, course_id: String) -> Result<bool, SemesterCoreError> {
        self.inner.delete_manual_course(&course_id).map_err(db_err)
    }

    pub fn get_system_logs_json(&self, limit: i64) -> Result<String, SemesterCoreError> {
        let list = self.inner.get_system_logs(limit).map_err(db_err)?;
        to_json_str(&serde_json::Value::Array(list))
    }

    pub fn query_local_assistant_json(&self, message: String, semester: i64) -> Result<String, SemesterCoreError> {
        to_json_str(&self.inner.query_local_assistant(&message, semester).map_err(db_err)?)
    }

    pub fn export_sync_snapshot_json(&self) -> Result<String, SemesterCoreError> {
        let (hash, device_id, payload) = self.inner.export_sync_snapshot().map_err(db_err)?;
        to_json_str(&serde_json::json!({
            "hash": hash,
            "device_id": device_id,
            "payload": payload
        }))
    }

    pub fn import_backup_json(&self, raw_json: String) -> Result<String, SemesterCoreError> {
        let payload = parse_json(&raw_json)?;
        to_json_str(&self.inner.import_backup_json(&payload).map_err(db_err)?)
    }

    pub fn merge_remote_snapshot_json(&self, remote_json: String) -> Result<String, SemesterCoreError> {
        let remote = parse_json(&remote_json)?;
        to_json_str(&self.inner.merge_remote_snapshot(&remote).map_err(|e| SemesterCoreError::SyncError { reason: e })?)
    }

    pub fn get_meta(&self, key: String) -> Result<Option<String>, SemesterCoreError> {
        self.inner.get_meta(&key).map_err(db_err)
    }

    pub fn set_meta(&self, key: String, value: String) -> Result<(), SemesterCoreError> {
        self.inner.set_meta(&key, &value).map_err(db_err)
    }

    pub fn delete_meta(&self, key: String) -> Result<(), SemesterCoreError> {
        self.inner.delete_meta(&key).map_err(db_err)
    }

    pub fn checkpoint_wal(&self) -> Result<(), SemesterCoreError> {
        self.inner.checkpoint_wal().map_err(db_err)
    }

    pub fn prune_old_tombstones(&self, max_age_days: i64) -> Result<u64, SemesterCoreError> {
        self.inner.prune_old_tombstones(max_age_days).map(|n| n as u64).map_err(db_err)
    }

    pub fn wipe_all_data(&self) -> Result<String, SemesterCoreError> {
        to_json_str(&self.inner.wipe_all_data().map_err(db_err)?)
    }
}

// High-level top-level functions exported via UniFFI
#[uniffi::export]
pub fn core_calculate_percentage(attended: u32, total: u32) -> f64 {
    calculations::calculate_percentage(attended, total)
}

#[uniffi::export]
pub fn core_calculate_bunk_guard(attended: u32, total: u32, target: u32) -> models::BunkGuard {
    calculations::calculate_bunk_guard(attended, total, target)
}

#[uniffi::export]
pub fn core_calculate_medical_adjusted(attended: u32, total: u32, medical_count: u32) -> f64 {
    calculations::calculate_medical_adjusted(attended, total, medical_count)
}

#[uniffi::export]
pub fn core_calculate_medical_bunk_guard(
    attended: u32,
    total: u32,
    medical_count: u32,
    target: u32,
) -> models::BunkGuard {
    calculations::calculate_medical_adjusted_bunk_guard(attended, total, medical_count, target)
}

#[uniffi::export]
pub fn core_calculate_required_sgpa(
    earned_credits: u32,
    earned_grade_points: f64,
    next_sem_credits: u32,
    target_cgpa: f64,
) -> f64 {
    calculations::calculate_required_sgpa(earned_credits, earned_grade_points, next_sem_credits, target_cgpa)
}

#[uniffi::export]
pub fn core_simulate_future_attendance(
    current_attended: u32,
    current_total: u32,
    future_classes: u32,
    future_attended: u32,
) -> f64 {
    calculations::simulate_future_attendance(current_attended, current_total, future_classes, future_attended)
}

#[uniffi::export]
pub fn core_export_timetable_qr(slots: Vec<models::TimetableSlot>) -> Result<String, SemesterCoreError> {
    sync::export_timetable_qr_string(slots).map_err(|e| SemesterCoreError::SyncError { reason: e })
}

#[uniffi::export]
pub fn core_import_timetable_qr(payload: String) -> Result<Vec<models::TimetableSlot>, SemesterCoreError> {
    sync::import_timetable_qr_string(&payload).map_err(|e| SemesterCoreError::SyncError { reason: e })
}

#[uniffi::export]
pub fn core_parse_ipu_results_json(json_str: String, default_semester: u32) -> Result<models::SemesterResultData, SemesterCoreError> {
    results::parse_ipu_raw_json(&json_str, default_semester).map_err(|e| SemesterCoreError::ParseError { reason: e })
}

#[uniffi::export]
pub fn core_ipu_salted_password_hash(password: String, captcha: String) -> String {
    results::compute_ipu_salted_password_hash(&password, &captcha)
}

#[uniffi::export]
pub fn core_parse_ipu_portal_response(
    response_text: String,
    fallback_semester: Option<u32>,
) -> Result<String, SemesterCoreError> {
    results::parse_ipu_portal_envelope(&response_text, fallback_semester)
        .map_err(|e| SemesterCoreError::ParseError { reason: e })
}

/// Lossless 2-way CRDT/LWW + Tombstone snapshot merge shared by Android (Kotlin) and Desktop (Tauri).
#[uniffi::export]
pub fn core_merge_sync_snapshots(local_json: String, remote_json: String) -> Result<String, SemesterCoreError> {
    sync::merge_workspace_snapshots_json(&local_json, &remote_json)
        .map_err(|e| SemesterCoreError::SyncError { reason: e })
}
