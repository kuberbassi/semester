use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum SemesterCoreError {
    #[error("Database error: {reason}")]
    DatabaseError { reason: String },
    #[error("Parse error: {reason}")]
    ParseError { reason: String },
    #[error("Sync error: {reason}")]
    SyncError { reason: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
pub enum AttendanceStatus {
    Present,
    Absent,
    Late,
    Medical,
    ApprovedMedical,
    Duty,
    Substituted,
    Cancelled,
}

impl AttendanceStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Present => "present",
            Self::Absent => "absent",
            Self::Late => "late",
            Self::Medical => "medical",
            Self::ApprovedMedical => "approved_medical",
            Self::Duty => "duty",
            Self::Substituted => "substituted",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn from_str_custom(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "present" => Self::Present,
            "absent" => Self::Absent,
            "late" => Self::Late,
            "medical" => Self::Medical,
            "approved_medical" => Self::ApprovedMedical,
            "duty" => Self::Duty,
            "substituted" => Self::Substituted,
            "cancelled" => Self::Cancelled,
            _ => Self::Present,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct Subject {
    pub id: String,
    pub name: String,
    pub code: String,
    pub professor: String,
    pub classroom: String,
    pub semester: u32,
    pub subject_type: String,
    pub credits: Option<u32>,
    pub attended: u32,
    pub total: u32,
    pub target: u32,
    pub syllabus: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct AttendanceLog {
    pub id: String,
    pub subject_id: String,
    pub subject_name: String,
    pub date: String,
    pub status: AttendanceStatus,
    pub log_type: String,
    pub notes: Option<String>,
    pub semester: Option<u32>,
    pub substituted_by: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct TimetableSlot {
    pub id: String,
    pub day: String,
    pub period_number: u32,
    pub start_time: String,
    pub end_time: String,
    pub subject_id: String,
    pub subject_name: String,
    pub room: String,
    pub slot_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct BunkGuard {
    pub percentage: f64,
    pub can_bunk: bool,
    pub count: u32,
    pub status_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct AttendanceSummary {
    pub overall_percentage: f64,
    pub total_attended: u32,
    pub total_classes: u32,
    pub subject_count: u32,
    pub risk_level: String,
    pub safe_bunks_remaining: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct SubjectResult {
    pub subject_code: String,
    pub subject_name: String,
    pub credits: u32,
    pub internal_marks: f64,
    pub external_marks: f64,
    pub total_marks: f64,
    pub grade: String,
    pub grade_point: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct SGPAResult {
    pub sgpa: f64,
    pub total_credits: u32,
    pub earned_credits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct SemesterResultData {
    pub semester: u32,
    pub sgpa: f64,
    pub total_credits: u32,
    pub subjects: Vec<SubjectResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct SyncStats {
    pub subjects_imported: u32,
    pub logs_imported: u32,
    pub slots_imported: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct Note {
    pub id: String,
    pub subject_id: Option<String>,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}
