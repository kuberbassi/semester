use serde::{Deserialize, Serialize};
use crate::calculations::{calculate_sgpa, ipu_grade_to_points};
use crate::models::{SemesterResultData, SubjectResult};

/// Exact JSON schema returned by IPU's official portal:
/// `https://examweb.ggsipu.ac.in/web/StudentSearchProcess?flag=2&euno={semester}`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpuRawSubjectRecord {
    pub nrollno: Option<String>,
    pub stname: Option<String>,
    pub father: Option<String>,
    pub prgname: Option<String>,
    pub iname: Option<String>,
    pub byoa: Option<u32>,
    pub euno: Option<u32>,
    pub papercode: Option<String>,
    pub papername: Option<String>,
    pub minorprint: Option<String>,     // Internal marks (or "-")
    pub majorprint: Option<String>,     // External marks (or "-")
    pub moderatedprint: Option<String>, // Total marks (or "-")
    pub statuscode: Option<String>,    // Pass / Fail / Detained
    pub eugpa: Option<f64>,            // Official Semester SGPA
}

/// Parse the raw JSON string directly returned by `examweb.ggsipu.ac.in/web/StudentSearchProcess`
pub fn parse_ipu_raw_json(json_str: &str, default_semester: u32) -> Result<SemesterResultData, String> {
    let records: Vec<IpuRawSubjectRecord> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse IPU JSON payload: {}", e))?;

    if records.is_empty() {
        return Err("No subject records found in IPU response.".to_string());
    }

    let semester = records[0].euno.unwrap_or(default_semester);
    let official_sgpa = records[0].eugpa;

    let mut subjects = Vec::new();

    for r in &records {
        let code = r.papercode.clone().unwrap_or_else(|| "UNKNOWN".to_string());
        let name = r.papername.clone().unwrap_or_else(|| "Unknown Subject".to_string());

        let internal: f64 = r.minorprint
            .as_deref()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0.0);

        let external: f64 = r.majorprint
            .as_deref()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0.0);

        let total: f64 = r.moderatedprint
            .as_deref()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(internal + external);

        // Standard IPU credits: default to 4 for Theory, 1-2 for Labs
        let credits = if name.to_lowercase().contains("lab") || name.to_lowercase().contains("practical") {
            1
        } else {
            4
        };

        // Determine grade from percentage / total (out of 100)
        let grade = if total >= 90.0 {
            "O".to_string()
        } else if total >= 75.0 {
            "A+".to_string()
        } else if total >= 65.0 {
            "A".to_string()
        } else if total >= 55.0 {
            "B+".to_string()
        } else if total >= 50.0 {
            "B".to_string()
        } else if total >= 45.0 {
            "C+".to_string()
        } else if total >= 40.0 {
            "C".to_string()
        } else {
            "F".to_string()
        };

        let grade_point = ipu_grade_to_points(&grade);

        subjects.push(SubjectResult {
            subject_code: code,
            subject_name: name,
            credits,
            internal_marks: internal,
            external_marks: external,
            total_marks: total,
            grade,
            grade_point,
        });
    }

    // Use official SGPA if reported by IPU, otherwise compute from credits
    let sgpa = if let Some(reported) = official_sgpa {
        if reported > 0.0 {
            reported
        } else {
            calculate_sgpa(&subjects).sgpa
        }
    } else {
        calculate_sgpa(&subjects).sgpa
    };

    let total_credits: u32 = subjects.iter().map(|s| s.credits).sum();

    Ok(SemesterResultData {
        semester,
        sgpa,
        total_credits,
        subjects,
    })
}

/// Fallback parser for manually entered or PDF-scraped tabular rows
pub fn parse_ipu_marks_rows(
    semester: u32,
    rows: Vec<(String, String, u32, f64, f64, String)>,
) -> SemesterResultData {
    let mut subjects = Vec::new();

    for (code, name, credits, internal, external, grade) in rows {
        let total = internal + external;
        let grade_point = ipu_grade_to_points(&grade);

        subjects.push(SubjectResult {
            subject_code: code,
            subject_name: name,
            credits,
            internal_marks: internal,
            external_marks: external,
            total_marks: total,
            grade,
            grade_point,
        });
    }

    let sgpa_res = calculate_sgpa(&subjects);

    SemesterResultData {
        semester,
        sgpa: sgpa_res.sgpa,
        total_credits: sgpa_res.total_credits,
        subjects,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_official_ipu_json() {
        let mock_json = r#"[
            {
                "nrollno": "00113302725",
                "stname": "Kuber Bassi",
                "father": "Mr. Bassi",
                "prgname": "B.Tech (CSE)",
                "iname": "HMRITM",
                "byoa": 2025,
                "euno": 3,
                "papercode": "ES-201",
                "papername": "Computational Methods",
                "minorprint": "22",
                "majorprint": "68",
                "moderatedprint": "90",
                "statuscode": "Pass",
                "eugpa": 8.75
            },
            {
                "nrollno": "00113302725",
                "stname": "Kuber Bassi",
                "father": "Mr. Bassi",
                "prgname": "B.Tech (CSE)",
                "iname": "HMRITM",
                "byoa": 2025,
                "euno": 3,
                "papercode": "CIC-209",
                "papername": "Data Structures",
                "minorprint": "19",
                "majorprint": "56",
                "moderatedprint": "75",
                "statuscode": "Pass",
                "eugpa": 8.75
            }
        ]"#;

        let res = parse_ipu_raw_json(mock_json, 3).unwrap();
        assert_eq!(res.semester, 3);
        assert_eq!(res.sgpa, 8.75);
        assert_eq!(res.subjects.len(), 2);
        assert_eq!(res.subjects[0].subject_code, "ES-201");
        assert_eq!(res.subjects[0].grade, "O");
        assert_eq!(res.subjects[1].subject_code, "CIC-209");
        assert_eq!(res.subjects[1].grade, "A+");
    }

    #[test]
    fn test_parse_ipu_rows() {
        let rows = vec![
            ("ES-201".to_string(), "Computational Methods".to_string(), 4, 21.0, 68.0, "O".to_string()),
            ("CIC-209".to_string(), "Data Structures".to_string(), 4, 18.0, 52.0, "A".to_string()),
        ];
        let result = parse_ipu_marks_rows(3, rows);
        assert_eq!(result.semester, 3);
        assert_eq!(result.total_credits, 8);
        assert_eq!(result.sgpa, 9.0);
    }
}
