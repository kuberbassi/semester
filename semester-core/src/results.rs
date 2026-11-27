use std::collections::HashMap;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::calculations::{calculate_sgpa, ipu_grade_to_points, score_to_ipu_grade};
use crate::models::{SemesterResultData, SubjectResult};

/// Exact match for `examweb.ggsipu.ac.in/web/js/crypt.js`:
/// `btoa(SHA-256(password + captcha))` (raw 32-byte digest Base64-encoded).
pub fn compute_ipu_salted_password_hash(password: &str, captcha: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}{}", password, captcha).as_bytes());
    let digest = hasher.finalize();
    base64::engine::general_purpose::STANDARD.encode(digest)
}

fn jval_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}

/// Parses live Spring Boot `examweb.ggsipu.ac.in/web/student/search?flag=2&euno=...` responses
/// (including double-encoded `{"status":"OK","message":"{\"stprofile\":...,\"header\":...,\"stresult\":...}"}`
/// envelopes AND legacy array JSON) into canonical `{ "student_info": {...}, "semesters": [...] }` JSON.
pub fn parse_ipu_portal_envelope(response_text: &str, fallback_sem: Option<u32>) -> Result<String, String> {
    let parsed: Value = serde_json::from_str(response_text.trim())
        .map_err(|e| format!("Invalid IPU portal JSON response: {}", e))?;

    // Unwrap Spring Boot double-encoded `{"status":"OK","message":"{...}"}` envelope
    let inner: Value = if let Some(obj) = parsed.as_object() {
        if let Some(msg_str) = obj.get("message").and_then(|v| v.as_str()) {
            let trimmed = msg_str.trim();
            if trimmed.starts_with('{') || trimmed.starts_with('[') {
                serde_json::from_str(trimmed).unwrap_or_else(|_| parsed.clone())
            } else {
                return Err(format!("IPU Portal message: {}", trimmed));
            }
        } else {
            parsed.clone()
        }
    } else {
        parsed.clone()
    };

    let mut student_info = serde_json::Map::new();
    let mut grouped: HashMap<u32, Vec<Value>> = HashMap::new();

    if let Some(obj) = inner.as_object() {
        if let Some(stprof) = obj.get("stprofile").or_else(|| obj.get("student")).and_then(|v| v.as_object()) {
            let map_field = |dst: &mut serde_json::Map<String, Value>, key: &str, aliases: &[&str]| {
                for a in aliases {
                    if let Some(v) = stprof.get(*a) {
                        let s = jval_str(v);
                        if !s.is_empty() && s != "---" {
                            dst.insert(key.to_string(), json!(s));
                            return;
                        }
                    }
                }
            };
            map_field(&mut student_info, "name", &["stname", "name", "studentName"]);
            map_field(&mut student_info, "roll_no", &["nrollno", "roll_no", "enrollment_number"]);
            map_field(&mut student_info, "institution", &["iname", "institution", "institute"]);
            map_field(&mut student_info, "programme", &["prgname", "programme", "program"]);
            map_field(&mut student_info, "batch", &["byoa", "batch"]);
            map_field(&mut student_info, "admission_year", &["yoa", "admission_year"]);
            map_field(&mut student_info, "father", &["father", "fname"]);
            map_field(&mut student_info, "mother", &["mother", "mname"]);
            map_field(&mut student_info, "email", &["email", "stemail"]);
            map_field(&mut student_info, "phone", &["mobno", "phone"]);
        }

        if let Some(rows) = obj.get("stresult").and_then(|v| v.as_array()) {
            let mut col_sem: Option<usize> = None;
            let mut col_code: usize = 1;
            let mut col_name: usize = 2;
            let mut col_int: usize = 3;
            let mut col_ext: usize = 4;
            let mut col_tot: usize = 5;
            let mut col_status: usize = 6;
            let mut col_exam: usize = 7;
            let mut col_declared: usize = 8;
            let mut col_grade: Option<usize> = None;
            let mut col_credits: Option<usize> = None;

            if let Some(headers) = obj.get("header").and_then(|v| v.as_array()) {
                for (idx, hv) in headers.iter().enumerate() {
                    let h = jval_str(hv).to_lowercase();
                    if h.contains("sem") || h.contains("annual") || h.contains("euno") {
                        col_sem = Some(idx);
                    } else if ((h.contains("paper") || h.contains("subject") || h.contains("course")) && h.contains("code")) || h == "code" {
                        col_code = idx;
                    } else if h.contains("paper") || h.contains("subject") || h.contains("title") || h.contains("name") {
                        col_name = idx;
                    } else if h.contains("internal") || h.contains("minor") {
                        col_int = idx;
                    } else if h.contains("external") || h.contains("major") {
                        col_ext = idx;
                    } else if h.contains("total") || h.contains("moderated") || h == "marks" {
                        col_tot = idx;
                    } else if h.contains("status") {
                        col_status = idx;
                    } else if h.contains("exam") || h.contains("session") {
                        col_exam = idx;
                    } else if h.contains("declared") || h.contains("date") {
                        col_declared = idx;
                    } else if h.contains("grade") {
                        col_grade = Some(idx);
                    } else if h.contains("credit") {
                        col_credits = Some(idx);
                    }
                }
            }

            for row in rows {
                let Some(arr) = row.as_array() else { continue };
                if arr.len() < 4 {
                    continue;
                }
                let get_s = |i: usize| -> String { arr.get(i).map(jval_str).unwrap_or_default() };
                let code = get_s(col_code);
                let name = get_s(col_name);
                if code.is_empty() && name.is_empty() {
                    continue;
                }
                let internal = get_s(col_int);
                let external = get_s(col_ext);
                let total_raw = get_s(col_tot);
                let status = get_s(col_status);
                let exam_session = get_s(col_exam);
                let declared_date = get_s(col_declared);
                let grade = col_grade.map(&get_s).unwrap_or_default();
                let credits_opt = col_credits.map(&get_s).and_then(|s| s.parse::<u32>().ok()).filter(|&c| c > 0);

                let row_sem = fallback_sem
                    .filter(|&n| n > 0 && n < 20)
                    .or_else(|| {
                        col_sem.and_then(|si| {
                            get_s(si)
                                .chars()
                                .filter(|c| c.is_ascii_digit())
                                .collect::<String>()
                                .parse::<u32>()
                                .ok()
                                .filter(|&n| n > 0 && n < 20)
                        })
                    })
                    .or_else(|| {
                        arr.first()
                            .map(jval_str)
                            .and_then(|s| s.parse::<u32>().ok())
                            .filter(|&n| n > 0 && n <= 12)
                    })
                    .unwrap_or(1);

                let total_marks = total_raw.parse::<f64>().ok();
                let is_pending = total_marks.is_none();
                let resolved_grade = if is_pending {
                    "-".to_string()
                } else if !grade.is_empty() && grade != "-" {
                    grade
                } else {
                    score_to_ipu_grade(total_marks.unwrap_or(0.0)).to_string()
                };

                let mut sub = json!({
                    "code": code,
                    "name": if name.is_empty() { "Unknown Subject".to_string() } else { name },
                    "internal": if internal.is_empty() { "-".to_string() } else { internal },
                    "external": if external.is_empty() { "-".to_string() } else { external },
                    "total_marks": total_marks,
                    "max_marks": 100.0,
                    "grade": resolved_grade,
                    "status": status,
                    "is_pending": is_pending,
                    "exam_session": if exam_session.is_empty() { Value::Null } else { json!(exam_session) },
                    "declared_date": if declared_date.is_empty() { Value::Null } else { json!(declared_date) }
                });
                if let Some(cr) = credits_opt {
                    sub["credits"] = json!(cr);
                }
                grouped.entry(row_sem).or_default().push(sub);
            }
        }
    } else if let Some(arr) = inner.as_array() {
        // Legacy flat array fallback
        let legacy = parse_ipu_raw_json(&inner.to_string(), fallback_sem.unwrap_or(1))?;
        let subs: Vec<Value> = legacy
            .subjects
            .into_iter()
            .map(|s| {
                json!({
                    "code": s.subject_code,
                    "name": s.subject_name,
                    "internal": format!("{:.0}", s.internal_marks),
                    "external": format!("{:.0}", s.external_marks),
                    "total_marks": s.total_marks,
                    "max_marks": 100.0,
                    "grade": s.grade,
                    "credits": s.credits,
                    "is_pending": false
                })
            })
            .collect();
        grouped.insert(legacy.semester, subs);
        if let Some(first) = arr.first().and_then(|v| v.as_object()) {
            for (dst_k, src_k) in [
                ("name", "stname"),
                ("roll_no", "nrollno"),
                ("institution", "iname"),
                ("programme", "prgname"),
                ("batch", "byoa"),
            ] {
                if let Some(v) = first.get(src_k) {
                    let s = jval_str(v);
                    if !s.is_empty() {
                        student_info.insert(dst_k.to_string(), json!(s));
                    }
                }
            }
        }
    }

    if grouped.is_empty() {
        return Err("No published semester results found in IPU response.".to_string());
    }

    let mut semesters: Vec<Value> = grouped
        .into_iter()
        .map(|(sem_num, subjects)| {
            json!({
                "semester": sem_num,
                "semester_num": sem_num,
                "semester_label": format!("Semester {}", sem_num),
                "subjects": subjects
            })
        })
        .collect();
    semesters.sort_by_key(|s| s.get("semester").and_then(|v| v.as_i64()).unwrap_or(99));

    serde_json::to_string(&json!({
        "student_info": Value::Object(student_info),
        "semesters": semesters
    }))
    .map_err(|e| e.to_string())
}

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

        // Smart IPU credit fallback when portal omits credits:
        // Labs / Practicals / Engineering Graphics / Workshop = 1, NUES / HVPE = 2, Theory = 3
        let upper_name = name.to_uppercase();
        let credits = if upper_name.contains("LAB")
            || upper_name.contains("PRACTICAL")
            || upper_name.contains("GRAPHICS")
            || upper_name.contains("DRAWING")
            || upper_name.contains("WORKSHOP")
            || upper_name.contains("CAD")
        {
            1
        } else if upper_name.contains("NUES")
            || upper_name.contains("HVPE")
            || upper_name.contains("HV&E")
            || upper_name.contains("HUMAN VALUES")
            || upper_name.contains("ETHICS")
            || upper_name.contains("CONSTITUTION")
            || upper_name.contains("UHV")
        {
            2
        } else {
            3
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
