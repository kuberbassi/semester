pub mod models;
pub mod calculations;
pub mod db;
pub mod sync;
pub mod results;

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
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })?;
        Ok(Arc::new(Self { inner }))
    }

    pub fn get_subjects(&self, semester: Option<u32>) -> Result<Vec<models::Subject>, SemesterCoreError> {
        self.inner.get_subjects(semester)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn add_subject(&self, subject: models::Subject) -> Result<(), SemesterCoreError> {
        self.inner.add_subject(&subject)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn delete_subject(&self, id: String) -> Result<bool, SemesterCoreError> {
        self.inner.delete_subject(&id)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
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
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn unmark_attendance(&self, log_id: String) -> Result<bool, SemesterCoreError> {
        self.inner.unmark_attendance(&log_id)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn get_attendance_logs(&self, subject_id: Option<String>, limit: u32) -> Result<Vec<models::AttendanceLog>, SemesterCoreError> {
        self.inner.get_attendance_logs(subject_id.as_deref(), limit)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn save_timetable_slot(&self, slot: models::TimetableSlot) -> Result<(), SemesterCoreError> {
        self.inner.save_timetable_slot(&slot)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn get_timetable_for_day(&self, day: String) -> Result<Vec<models::TimetableSlot>, SemesterCoreError> {
        self.inner.get_timetable_for_day(&day)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn save_semester_result(&self, result: models::SemesterResultData) -> Result<(), SemesterCoreError> {
        self.inner.save_semester_result(&result)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn get_semester_results(&self) -> Result<Vec<models::SemesterResultData>, SemesterCoreError> {
        self.inner.get_semester_results()
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn delete_semester_result(&self, semester: u32) -> Result<bool, SemesterCoreError> {
        self.inner.delete_semester_result(semester)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn save_note(&self, note: models::Note) -> Result<(), SemesterCoreError> {
        self.inner.save_note(&note)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn get_notes(&self, subject_id: Option<String>) -> Result<Vec<models::Note>, SemesterCoreError> {
        self.inner.get_notes(subject_id.as_deref())
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn delete_note(&self, id: String) -> Result<bool, SemesterCoreError> {
        self.inner.delete_note(&id)
            .map_err(|e| SemesterCoreError::DatabaseError { message: e.to_string() })
    }

    pub fn export_backup_json(&self) -> Result<String, SemesterCoreError> {
        sync::export_backup_json(&self.inner)
            .map_err(|e| SemesterCoreError::SyncError { message: e })
    }

    pub fn import_backup_json(&self, json_str: String) -> Result<models::SyncStats, SemesterCoreError> {
        sync::import_backup_json(&self.inner, &json_str)
            .map_err(|e| SemesterCoreError::SyncError { message: e })
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
    sync::export_timetable_qr_string(slots).map_err(|e| SemesterCoreError::SyncError { message: e })
}

#[uniffi::export]
pub fn core_import_timetable_qr(payload: String) -> Result<Vec<models::TimetableSlot>, SemesterCoreError> {
    sync::import_timetable_qr_string(&payload).map_err(|e| SemesterCoreError::SyncError { message: e })
}

#[uniffi::export]
pub fn core_parse_ipu_results_json(json_str: String, default_semester: u32) -> Result<models::SemesterResultData, SemesterCoreError> {
    results::parse_ipu_raw_json(&json_str, default_semester).map_err(|e| SemesterCoreError::ParseError { message: e })
}
