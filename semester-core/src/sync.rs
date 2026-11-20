use serde::{Deserialize, Serialize};
use crate::models::{AttendanceLog, Note, SemesterResultData, Subject, SyncStats, TimetableSlot};
use crate::db::Database;

#[derive(Serialize, Deserialize)]
pub struct BackupPayload {
    pub version: u32,
    pub exported_at: String,
    pub subjects: Vec<Subject>,
    pub attendance_logs: Vec<AttendanceLog>,
    pub timetable_slots: Vec<TimetableSlot>,
    #[serde(default)]
    pub semester_results: Vec<SemesterResultData>,
    #[serde(default)]
    pub notes: Vec<Note>,
}

#[derive(Serialize, Deserialize)]
pub struct QrTimetablePayload {
    pub v: u32,
    pub slots: Vec<TimetableSlot>,
}

/// Export full SQLite database state to a JSON string for Google Drive AppData backup
pub fn export_backup_json(db: &Database) -> Result<String, String> {
    let subjects = db.get_subjects(None).map_err(|e| e.to_string())?;
    let logs = db.get_attendance_logs(None, 5000).map_err(|e| e.to_string())?;
    
    // Collect slots for all days
    let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let mut slots = Vec::new();
    for d in days {
        if let Ok(day_slots) = db.get_timetable_for_day(d) {
            slots.extend(day_slots);
        }
    }

    let payload = BackupPayload {
        version: 1,
        exported_at: "2026-11-20T00:00:00Z".to_string(),
        subjects,
        attendance_logs: logs,
        timetable_slots: slots,
        semester_results: db.get_semester_results().unwrap_or_default(),
        notes: db.get_notes(None).unwrap_or_default(),
    };

    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

/// Import and restore full database from Google Drive AppData JSON snapshot
pub fn import_backup_json(db: &Database, json_str: &str) -> Result<SyncStats, String> {
    let payload: BackupPayload = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
    
    let mut sub_count = 0;
    for s in &payload.subjects {
        if db.add_subject(s).is_ok() {
            sub_count += 1;
        }
    }

    let mut slot_count = 0;
    for slot in &payload.timetable_slots {
        if db.save_timetable_slot(slot).is_ok() {
            slot_count += 1;
        }
    }

    let mut log_count = 0;
    for l in &payload.attendance_logs {
        if db.mark_attendance(&l.id, &l.subject_id, &l.date, l.status, l.notes.clone(), &l.log_type).is_ok() {
            log_count += 1;
        }
    }

    for res in &payload.semester_results {
        let _ = db.save_semester_result(res);
    }

    for note in &payload.notes {
        let _ = db.save_note(note);
    }

    Ok(SyncStats {
        subjects_imported: sub_count,
        logs_imported: log_count,
        slots_imported: slot_count,
    })
}

/// Encode weekly timetable into a portable JSON string for QR Code sharing
pub fn export_timetable_qr_string(slots: Vec<TimetableSlot>) -> Result<String, String> {
    let payload = QrTimetablePayload {
        v: 1,
        slots,
    };
    serde_json::to_string(&payload).map_err(|e| e.to_string())
}

/// Decode scanned QR Code JSON into timetable slots
pub fn import_timetable_qr_string(payload_str: &str) -> Result<Vec<TimetableSlot>, String> {
    let payload: QrTimetablePayload = serde_json::from_str(payload_str).map_err(|e| e.to_string())?;
    Ok(payload.slots)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qr_encode_decode() {
        let slot = TimetableSlot {
            id: "s1".to_string(),
            day: "Friday".to_string(),
            period_number: 1,
            start_time: "08:30 AM".to_string(),
            end_time: "09:30 AM".to_string(),
            subject_id: "sub-1".to_string(),
            subject_name: "OOP using C++".to_string(),
            room: "102".to_string(),
            slot_type: "class".to_string(),
        };

        let encoded = export_timetable_qr_string(vec![slot]).unwrap();
        assert!(!encoded.is_empty());

        let decoded = import_timetable_qr_string(&encoded).unwrap();
        assert_eq!(decoded.len(), 1);
        assert_eq!(decoded[0].subject_name, "OOP using C++");
    }
}
