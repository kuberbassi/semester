use std::sync::Mutex;
use rusqlite::{params, Connection, Result};
use crate::models::{AttendanceLog, AttendanceStatus, Note, SemesterResultData, Subject, SubjectResult, TimetableSlot};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS subjects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL DEFAULT '',
                professor TEXT NOT NULL DEFAULT '',
                classroom TEXT NOT NULL DEFAULT '',
                semester INTEGER NOT NULL DEFAULT 1,
                subject_type TEXT NOT NULL DEFAULT 'theory',
                credits INTEGER,
                attended INTEGER NOT NULL DEFAULT 0,
                total INTEGER NOT NULL DEFAULT 0,
                target INTEGER NOT NULL DEFAULT 75,
                syllabus TEXT
            );

            CREATE TABLE IF NOT EXISTS attendance_logs (
                id TEXT PRIMARY KEY,
                subject_id TEXT NOT NULL,
                subject_name TEXT NOT NULL,
                date TEXT NOT NULL,
                status TEXT NOT NULL,
                log_type TEXT NOT NULL DEFAULT 'Lecture',
                notes TEXT,
                semester INTEGER,
                substituted_by TEXT,
                timestamp TEXT NOT NULL,
                FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS timetable_slots (
                id TEXT PRIMARY KEY,
                day TEXT NOT NULL,
                period_number INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                subject_id TEXT NOT NULL,
                subject_name TEXT NOT NULL,
                room TEXT NOT NULL DEFAULT '',
                slot_type TEXT NOT NULL DEFAULT 'class'
            );

            CREATE TABLE IF NOT EXISTS semester_results (
                semester INTEGER PRIMARY KEY,
                sgpa REAL NOT NULL,
                total_credits INTEGER NOT NULL,
                subjects_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                subject_id TEXT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_logs_subject_date ON attendance_logs(subject_id, date);
            CREATE INDEX IF NOT EXISTS idx_timetable_day ON timetable_slots(day);
            CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject_id);
            "#,
        )?;
        Ok(())
    }

    pub fn add_subject(&self, subject: &Subject) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO subjects (id, name, code, professor, classroom, semester, subject_type, credits, attended, total, target, syllabus)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
            params![
                subject.id,
                subject.name,
                subject.code,
                subject.professor,
                subject.classroom,
                subject.semester,
                subject.subject_type,
                subject.credits,
                subject.attended,
                subject.total,
                subject.target,
                subject.syllabus
            ],
        )?;
        Ok(())
    }

    pub fn get_subjects(&self, semester: Option<u32>) -> Result<Vec<Subject>> {
        let conn = self.conn.lock().unwrap();
        let query = if let Some(sem) = semester {
            let mut stmt = conn.prepare("SELECT id, name, code, professor, classroom, semester, subject_type, credits, attended, total, target, syllabus FROM subjects WHERE semester = ?1 ORDER BY name ASC")?;
            let rows = stmt.query_map(params![sem], Self::row_to_subject)?;
            rows.collect::<Result<Vec<_>>>()
        } else {
            let mut stmt = conn.prepare("SELECT id, name, code, professor, classroom, semester, subject_type, credits, attended, total, target, syllabus FROM subjects ORDER BY name ASC")?;
            let rows = stmt.query_map([], Self::row_to_subject)?;
            rows.collect::<Result<Vec<_>>>()
        };
        query
    }

    pub fn delete_subject(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM subjects WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    pub fn mark_attendance(
        &self,
        id: &str,
        subject_id: &str,
        date: &str,
        status: AttendanceStatus,
        notes: Option<String>,
        log_type: &str,
    ) -> Result<AttendanceLog> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // Get subject name
        let subject_name: String = tx.query_row(
            "SELECT name FROM subjects WHERE id = ?1",
            params![subject_id],
            |row| row.get(0),
        )?;

        // Increment total & attended counters based on status
        let (add_attended, add_total) = match status {
            AttendanceStatus::Present | AttendanceStatus::Late => (1, 1),
            AttendanceStatus::Absent => (0, 1),
            AttendanceStatus::Duty | AttendanceStatus::Substituted => (1, 1),
            AttendanceStatus::Medical | AttendanceStatus::ApprovedMedical => (0, 0),
            AttendanceStatus::Cancelled => (0, 0),
        };

        if add_total > 0 || add_attended > 0 {
            tx.execute(
                "UPDATE subjects SET attended = attended + ?1, total = total + ?2 WHERE id = ?3",
                params![add_attended, add_total, subject_id],
            )?;
        }

        let now_str = chrono_stub_iso8601();
        tx.execute(
            r#"
            INSERT INTO attendance_logs (id, subject_id, subject_name, date, status, log_type, notes, timestamp)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                id,
                subject_id,
                subject_name,
                date,
                status.as_str(),
                log_type,
                notes,
                now_str
            ],
        )?;

        tx.commit()?;

        Ok(AttendanceLog {
            id: id.to_string(),
            subject_id: subject_id.to_string(),
            subject_name,
            date: date.to_string(),
            status,
            log_type: log_type.to_string(),
            notes,
            semester: None,
            substituted_by: None,
            timestamp: now_str,
        })
    }

    pub fn unmark_attendance(&self, log_id: &str) -> Result<bool> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let log_data: Result<(String, String)> = tx.query_row(
            "SELECT subject_id, status FROM attendance_logs WHERE id = ?1",
            params![log_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );

        if let Ok((subject_id, status_str)) = log_data {
            let status = AttendanceStatus::from_str_custom(&status_str);
            let (sub_attended, sub_total) = match status {
                AttendanceStatus::Present | AttendanceStatus::Late => (1, 1),
                AttendanceStatus::Absent => (0, 1),
                AttendanceStatus::Duty | AttendanceStatus::Substituted => (1, 1),
                _ => (0, 0),
            };

            if sub_total > 0 || sub_attended > 0 {
                tx.execute(
                    "UPDATE subjects SET attended = MAX(0, attended - ?1), total = MAX(0, total - ?2) WHERE id = ?3",
                    params![sub_attended, sub_total, subject_id],
                )?;
            }

            tx.execute("DELETE FROM attendance_logs WHERE id = ?1", params![log_id])?;
            tx.commit()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn get_attendance_logs(&self, subject_id: Option<&str>, limit: u32) -> Result<Vec<AttendanceLog>> {
        let conn = self.conn.lock().unwrap();
        if let Some(sid) = subject_id {
            let mut stmt = conn.prepare("SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs WHERE subject_id = ?1 ORDER BY date DESC, timestamp DESC LIMIT ?2")?;
            let rows = stmt.query_map(params![sid, limit], Self::row_to_log)?;
            rows.collect::<Result<Vec<_>>>()
        } else {
            let mut stmt = conn.prepare("SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs ORDER BY date DESC, timestamp DESC LIMIT ?1")?;
            let rows = stmt.query_map(params![limit], Self::row_to_log)?;
            rows.collect::<Result<Vec<_>>>()
        }
    }

    pub fn save_timetable_slot(&self, slot: &TimetableSlot) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT OR REPLACE INTO timetable_slots (id, day, period_number, start_time, end_time, subject_id, subject_name, room, slot_type)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                slot.id,
                slot.day,
                slot.period_number,
                slot.start_time,
                slot.end_time,
                slot.subject_id,
                slot.subject_name,
                slot.room,
                slot.slot_type
            ],
        )?;
        Ok(())
    }

    pub fn get_timetable_for_day(&self, day: &str) -> Result<Vec<TimetableSlot>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, day, period_number, start_time, end_time, subject_id, subject_name, room, slot_type FROM timetable_slots WHERE LOWER(day) = LOWER(?1) ORDER BY period_number ASC, start_time ASC")?;
        let rows = stmt.query_map(params![day], |row| {
            Ok(TimetableSlot {
                id: row.get(0)?,
                day: row.get(1)?,
                period_number: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                subject_id: row.get(5)?,
                subject_name: row.get(6)?,
                room: row.get(7)?,
                slot_type: row.get(8)?,
            })
        })?;
        rows.collect::<Result<Vec<_>>>()
    }

    pub fn save_semester_result(&self, result: &SemesterResultData) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let subjects_json = serde_json::to_string(&result.subjects)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let now_str = chrono_stub_iso8601();
        conn.execute(
            r#"
            INSERT OR REPLACE INTO semester_results (semester, sgpa, total_credits, subjects_json, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![
                result.semester,
                result.sgpa,
                result.total_credits,
                subjects_json,
                now_str
            ],
        )?;
        Ok(())
    }

    pub fn get_semester_results(&self) -> Result<Vec<SemesterResultData>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT semester, sgpa, total_credits, subjects_json FROM semester_results ORDER BY semester ASC")?;
        let rows = stmt.query_map([], |row| {
            let semester: u32 = row.get(0)?;
            let sgpa: f64 = row.get(1)?;
            let total_credits: u32 = row.get(2)?;
            let subjects_json: String = row.get(3)?;
            let subjects: Vec<SubjectResult> = serde_json::from_str(&subjects_json).unwrap_or_default();
            Ok(SemesterResultData {
                semester,
                sgpa,
                total_credits,
                subjects,
            })
        })?;
        rows.collect::<Result<Vec<_>>>()
    }

    pub fn delete_semester_result(&self, semester: u32) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM semester_results WHERE semester = ?1", params![semester])?;
        Ok(rows > 0)
    }

    pub fn save_note(&self, note: &Note) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT OR REPLACE INTO notes (id, subject_id, title, content, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                note.id,
                note.subject_id,
                note.title,
                note.content,
                note.created_at,
                note.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_notes(&self, subject_id: Option<&str>) -> Result<Vec<Note>> {
        let conn = self.conn.lock().unwrap();
        if let Some(sid) = subject_id {
            let mut stmt = conn.prepare("SELECT id, subject_id, title, content, created_at, updated_at FROM notes WHERE subject_id = ?1 ORDER BY updated_at DESC")?;
            let rows = stmt.query_map(params![sid], Self::row_to_note)?;
            rows.collect::<Result<Vec<_>>>()
        } else {
            let mut stmt = conn.prepare("SELECT id, subject_id, title, content, created_at, updated_at FROM notes ORDER BY updated_at DESC")?;
            let rows = stmt.query_map([], Self::row_to_note)?;
            rows.collect::<Result<Vec<_>>>()
        }
    }

    pub fn delete_note(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    fn row_to_note(row: &rusqlite::Row) -> rusqlite::Result<Note> {
        Ok(Note {
            id: row.get(0)?,
            subject_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }

    fn row_to_subject(row: &rusqlite::Row) -> rusqlite::Result<Subject> {
        Ok(Subject {
            id: row.get(0)?,
            name: row.get(1)?,
            code: row.get(2)?,
            professor: row.get(3)?,
            classroom: row.get(4)?,
            semester: row.get(5)?,
            subject_type: row.get(6)?,
            credits: row.get(7)?,
            attended: row.get(8)?,
            total: row.get(9)?,
            target: row.get(10)?,
            syllabus: row.get(11)?,
        })
    }

    fn row_to_log(row: &rusqlite::Row) -> rusqlite::Result<AttendanceLog> {
        let status_str: String = row.get(4)?;
        Ok(AttendanceLog {
            id: row.get(0)?,
            subject_id: row.get(1)?,
            subject_name: row.get(2)?,
            date: row.get(3)?,
            status: AttendanceStatus::from_str_custom(&status_str),
            log_type: row.get(5)?,
            notes: row.get(6)?,
            semester: row.get(7)?,
            substituted_by: row.get(8)?,
            timestamp: row.get(9)?,
        })
    }
}

fn chrono_stub_iso8601() -> String {
    // Generate ISO timestamp format
    "2026-11-20T00:00:00Z".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_lifecycle() {
        let db = Database::open_in_memory().unwrap();

        // 1. Add Subject
        let sub = Subject {
            id: "sub-1".to_string(),
            name: "Data Structures".to_string(),
            code: "CIC-209".to_string(),
            professor: "Ms. Ritu".to_string(),
            classroom: "102".to_string(),
            semester: 3,
            subject_type: "Theory".to_string(),
            credits: Some(4),
            attended: 0,
            total: 0,
            target: 75,
            syllabus: Some("Unit 1: Trees and Graphs".to_string()),
        };
        db.add_subject(&sub).unwrap();

        let list = db.get_subjects(Some(3)).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Data Structures");

        // 2. Mark Attendance Present
        let log = db.mark_attendance("log-1", "sub-1", "2026-11-20", AttendanceStatus::Present, None, "Lecture").unwrap();
        assert_eq!(log.status, AttendanceStatus::Present);

        let updated_list = db.get_subjects(Some(3)).unwrap();
        assert_eq!(updated_list[0].attended, 1);
        assert_eq!(updated_list[0].total, 1);

        // 3. Unmark Attendance
        let removed = db.unmark_attendance("log-1").unwrap();
        assert!(removed);

        let restored_list = db.get_subjects(Some(3)).unwrap();
        assert_eq!(restored_list[0].attended, 0);
        assert_eq!(restored_list[0].total, 0);

        // 4. Save & Query Semester Results
        let sem_res = SemesterResultData {
            semester: 3,
            sgpa: 9.25,
            total_credits: 24,
            subjects: vec![SubjectResult {
                subject_code: "CIC-209".to_string(),
                subject_name: "Data Structures".to_string(),
                credits: 4,
                internal_marks: 23.0,
                external_marks: 68.0,
                total_marks: 91.0,
                grade: "O".to_string(),
                grade_point: 10,
            }],
        };
        db.save_semester_result(&sem_res).unwrap();
        let fetched_results = db.get_semester_results().unwrap();
        assert_eq!(fetched_results.len(), 1);
        assert_eq!(fetched_results[0].semester, 3);
        assert_eq!(fetched_results[0].sgpa, 9.25);
        assert_eq!(fetched_results[0].subjects.len(), 1);

        // 5. Save & Query Notes
        let note = Note {
            id: "note-1".to_string(),
            subject_id: Some("sub-1".to_string()),
            title: "Binary Trees".to_string(),
            content: "Inorder traversal of BST gives sorted keys.".to_string(),
            created_at: "2026-11-20T00:00:00Z".to_string(),
            updated_at: "2026-11-20T00:00:00Z".to_string(),
        };
        db.save_note(&note).unwrap();
        let fetched_notes = db.get_notes(Some("sub-1")).unwrap();
        assert_eq!(fetched_notes.len(), 1);
        assert_eq!(fetched_notes[0].title, "Binary Trees");
    }
}
