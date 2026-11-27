use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Mutex;

use chrono::{Datelike, Local, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::calculations::{ipu_grade_to_points, score_to_ipu_grade};
use crate::sync;

/// Cross-platform v2 SQLite workspace engine shared across Android (UniFFI) and Desktop.
/// Implements the exact canonical v2 schema, medical-leave math, 4-tier GGSIPU Ordinance 11
/// credit matcher, tombstone tracking, lossless CRDT 2-way merge, and offline AI queries.
pub struct WorkspaceDb {
    conn: Mutex<Connection>,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn split_programme_and_branch(prog: &str) -> (String, String) {
    let clean = prog.trim();
    if clean.is_empty() {
        return (String::new(), String::new());
    }
    if let (Some(open), Some(close)) = (clean.find('('), clean.rfind(')')) {
        if close > open {
            let course = clean[..open].trim().trim_end_matches('-').trim().to_string();
            let branch = clean[open + 1..close].trim().to_string();
            return (course, branch);
        }
    }
    if let Some((left, right)) = clean.split_once(" - ") {
        return (left.trim().to_string(), right.trim().to_string());
    }
    (clean.to_string(), String::new())
}

fn normalize_batch_from_info(raw_batch: &str, adm_year: &str) -> String {
    let candidate = if !raw_batch.trim().is_empty() { raw_batch.trim() } else { adm_year.trim() };
    if candidate.len() == 4 && candidate.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(yr) = candidate.parse::<i32>() {
            if (2015..=2040).contains(&yr) {
                return format!("{}-{:02}", yr, (yr + 4) % 100);
            }
        }
    }
    candidate.to_string()
}

fn status_deltas(status: &str) -> (i64, i64, i64) {
    match status.trim().to_lowercase().as_str() {
        "present" | "late" | "duty" | "substituted" => (1, 1, 0),
        "absent" => (0, 1, 0),
        "medical" | "approved_medical" => (1, 1, 1),
        "cancelled" | "canceled" | "excused" => (0, 0, 0),
        _ => (0, 0, 0),
    }
}

fn normalize_status(status: &str) -> &'static str {
    match status.trim().to_lowercase().as_str() {
        "present" => "present",
        "absent" => "absent",
        "late" => "late",
        "medical" | "approved_medical" => "approved_medical",
        "duty" => "duty",
        "substituted" => "substituted",
        "cancelled" | "canceled" | "excused" => "cancelled",
        _ => "present",
    }
}

fn calc_pct(attended: i64, total: i64) -> f64 {
    if total <= 0 {
        return 0.0;
    }
    (((attended.max(0) as f64) / (total as f64)) * 10000.0).round() / 100.0
}

fn unwrap_mongo_val(v: &Value) -> Value {
    if let Some(obj) = v.as_object() {
        if let Some(s) = obj.get("$oid") {
            return s.clone();
        }
        if let Some(s) = obj.get("$date") {
            return s.clone();
        }
        if let Some(s) = obj.get("$numberInt").and_then(|x| x.as_str()).and_then(|x| x.parse::<i64>().ok()) {
            return json!(s);
        }
        if let Some(s) = obj.get("$numberLong").and_then(|x| x.as_str()).and_then(|x| x.parse::<i64>().ok()) {
            return json!(s);
        }
        if let Some(s) = obj.get("$numberDouble").and_then(|x| x.as_str()).and_then(|x| x.parse::<f64>().ok()) {
            return json!(s);
        }
    }
    v.clone()
}

fn val_to_string(v: Option<&Value>) -> String {
    match v.map(unwrap_mongo_val) {
        Some(Value::String(s)) => s,
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn val_to_i64(v: Option<&Value>, fallback: i64) -> i64 {
    match v.map(unwrap_mongo_val) {
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f.round() as i64)).unwrap_or(fallback),
        Some(Value::String(s)) => s.trim().parse::<f64>().map(|f| f.round() as i64).unwrap_or(fallback),
        _ => fallback,
    }
}

fn val_to_f64(v: Option<&Value>, fallback: f64) -> f64 {
    match v.map(unwrap_mongo_val) {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(fallback),
        Some(Value::String(s)) => s.trim().parse::<f64>().unwrap_or(fallback),
        _ => fallback,
    }
}

fn parse_time_to_minutes(raw: &str) -> i32 {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return i32::MAX;
    }
    let mut parts = trimmed.split_whitespace();
    let time_part = parts.next().unwrap_or("");
    let modifier = parts.next().unwrap_or("").to_uppercase();
    let mut hm = time_part.split(':');
    let Ok(mut hours) = hm.next().unwrap_or("").parse::<i32>() else {
        return i32::MAX;
    };
    let Ok(minutes) = hm.next().unwrap_or("0").parse::<i32>() else {
        return i32::MAX;
    };
    if modifier == "PM" && hours < 12 {
        hours += 12;
    } else if modifier == "AM" && hours == 12 {
        hours = 0;
    }
    hours * 60 + minutes
}

fn normalize_tracker_json(v: Option<&Value>, default_total: i64) -> Value {
    if let Some(obj) = v.and_then(|x| x.as_object()) {
        json!({
            "total": val_to_i64(obj.get("total"), default_total).max(0),
            "completed": val_to_i64(obj.get("completed"), 0).max(0),
            "hardcopy": obj.get("hardcopy").and_then(|x| x.as_bool()).unwrap_or(false)
        })
    } else {
        json!({ "total": default_total, "completed": 0, "hardcopy": false })
    }
}

fn sanitize_ui_preferences(raw: &Value) -> serde_json::Map<String, Value> {
    const ALLOWED: &[&str] = &[
        "last_semester",
        "timetable_view",
        "attendance_threshold",
        "warning_threshold",
        "theme",
        "accent_color",
        "compact_mode",
        "show_percentages",
    ];
    let mut clean = serde_json::Map::new();
    if let Some(obj) = raw.as_object() {
        for &k in ALLOWED {
            if let Some(v) = obj.get(k) {
                if !v.is_null() {
                    clean.insert(k.to_string(), unwrap_mongo_val(v));
                }
            }
        }
    }
    clean
}

fn default_periods_json() -> String {
    serde_json::to_string(&json!([
        { "id": "p1", "name": "Period 1", "startTime": "09:00 AM", "endTime": "10:00 AM" },
        { "id": "p2", "name": "Period 2", "startTime": "10:00 AM", "endTime": "11:00 AM" },
        { "id": "p3", "name": "Period 3", "startTime": "11:15 AM", "endTime": "12:15 PM" },
        { "id": "p4", "name": "Period 4", "startTime": "12:15 PM", "endTime": "01:15 PM" },
        { "id": "p5", "name": "Period 5", "startTime": "02:00 PM", "endTime": "03:00 PM" }
    ]))
    .unwrap_or_else(|_| "[]".to_string())
}

// ─── 4-Tier GGSIPU Credit Matcher (100% Parity with Desktop) ─────────────────

fn normalize_lookup_key(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

fn canonical_subject_code(raw: &str) -> (String, String) {
    let trimmed = raw.trim().to_uppercase();
    let without_parens = trimmed.split('(').next().unwrap_or(&trimmed);
    let mut alnum: String = without_parens
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    if alnum == "sub" || alnum == "na" || alnum == "none" {
        return (String::new(), String::new());
    }
    if alnum.len() >= 5 {
        let bytes = alnum.as_bytes();
        let last = *bytes.last().unwrap_or(&0);
        let prev = bytes[bytes.len() - 2];
        if matches!(last, b't' | b'p' | b'l') && prev.is_ascii_digit() {
            alnum.pop();
        }
    }
    let digits: String = alnum.chars().filter(|c| c.is_ascii_digit()).collect();
    (alnum, digits)
}

fn is_audit_or_non_credit_name(name: &str) -> bool {
    let upper = name.to_uppercase();
    upper.contains("MENTORING")
        || upper.contains("NSS")
        || upper.contains("NCC")
        || upper.contains("AUDIT")
        || upper.contains("CLUB")
}

fn is_lab_or_practical_text(code_digits: &str, name: &str) -> bool {
    let upper = name.to_uppercase();
    if upper.contains("LAB")
        || upper.contains("PRACTICAL")
        || upper.contains("WORKSHOP")
        || upper.contains("VIVA")
        || upper.contains("GRAPHICS")
        || upper.contains("DRAWING")
        || upper.contains("TRAINING")
        || upper.contains("SEMINAR")
    {
        return true;
    }
    if let Ok(num) = code_digits.parse::<u32>() {
        if (51..=99).contains(&(num % 100)) {
            return true;
        }
    }
    false
}

fn extract_roman_part(name: &str) -> Option<u8> {
    let tokens: Vec<String> = name
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect();
    for t in tokens.iter().rev() {
        match t.as_str() {
            "i" | "1" => return Some(1),
            "ii" | "2" => return Some(2),
            "iii" | "3" => return Some(3),
            "iv" | "4" => return Some(4),
            _ => {}
        }
    }
    None
}

fn tokenize_expanded_name(name: &str) -> Vec<String> {
    let raw_tokens: Vec<String> = name
        .to_lowercase()
        .replace('&', " and ")
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect();
    let mut expanded = Vec::new();
    for t in raw_tokens {
        match t.as_str() {
            "and" | "of" | "in" | "the" | "for" | "to" | "using" | "with" | "a" | "an"
            | "i" | "ii" | "iii" | "iv" | "1" | "2" | "3" | "4" => {}
            "am" => expanded.extend(["applied".into(), "mathematics".into()]),
            "ap" => expanded.extend(["applied".into(), "physics".into()]),
            "ac" => expanded.extend(["applied".into(), "chemistry".into()]),
            "eg" => expanded.extend(["engineering".into(), "graphics".into()]),
            "em" => expanded.extend(["engineering".into(), "mechanics".into()]),
            "es" => expanded.extend(["electrical".into(), "science".into()]),
            "evs" => expanded.extend(["environmental".into(), "studies".into()]),
            "mp" => expanded.extend(["manufacturing".into(), "processes".into()]),
            "hv" | "hve" | "hvpe" => expanded.extend(["human".into(), "values".into(), "ethics".into()]),
            "wt" | "wp" => expanded.extend(["workshop".into(), "practice".into()]),
            "prog" => expanded.push("programming".into()),
            "comm" => expanded.push("communication".into()),
            "eng" | "engg" => expanded.push("engineering".into()),
            "math" | "maths" => expanded.push("mathematics".into()),
            "dlcd" => expanded.extend(["digital".into(), "logic".into(), "computer".into(), "design".into()]),
            "ds" => expanded.extend(["data".into(), "structures".into()]),
            "dsa" => expanded.extend(["data".into(), "structures".into(), "algorithms".into()]),
            "oop" | "oops" => expanded.extend(["object".into(), "oriented".into(), "programming".into()]),
            "os" => expanded.extend(["operating".into(), "systems".into()]),
            "dbms" => expanded.extend(["database".into(), "management".into(), "systems".into()]),
            "cn" => expanded.extend(["computer".into(), "networks".into()]),
            "daa" => expanded.extend(["design".into(), "analysis".into(), "algorithms".into()]),
            "coa" => expanded.extend(["computer".into(), "organization".into(), "architecture".into()]),
            "cm" => expanded.extend(["computational".into(), "methods".into()]),
            "dm" => expanded.extend(["discrete".into(), "mathematics".into()]),
            "prac" | "practicals" => expanded.push("lab".into()),
            other => expanded.push(other.to_string()),
        }
    }
    expanded
}

fn name_acronym(tokens: &[String]) -> String {
    tokens
        .iter()
        .filter(|t| t.as_str() != "lab")
        .filter_map(|t| t.chars().next())
        .collect()
}

fn default_ipu_credits_for_code_and_name(code: &str, name: &str) -> (i64, &'static str) {
    let (ckey, digits) = canonical_subject_code(code);
    let known: Option<i64> = match ckey.as_str() {
        "bs103" | "bs104" | "bs105" | "bs106" | "bs109" | "bs110" => Some(3),
        "bs111" | "bs112" => Some(4),
        "es101" | "es102" | "es107" | "es108" | "es113" | "es114" => Some(3),
        "es119" => Some(4),
        "hs113" | "hs114" => Some(3),
        "hs115" | "hs116" => Some(2),
        // Engineering Graphics, Workshop & Labs are 1-credit practical subjects
        "es157" | "es158" | "es163" | "es164" => Some(1),
        "bs151" | "bs152" | "bs155" | "bs156" | "bs161" | "bs162" | "es153" | "es154"
        | "es155" | "es156" | "es159" | "es160" => Some(1),
        "es201" | "cic205" | "cic209" | "ecc207" | "cic211" | "cic206" | "cic208"
        | "cic210" | "cic212" | "bs202" => Some(4),
        "hs201" | "hs202" | "ms201" | "ms202" | "ict201" => Some(3),
        "cic251" | "cic253" | "cic255" | "ecc257" | "es251" | "cic252" | "cic254"
        | "cic256" | "cic258" => Some(1),
        _ => None,
    };
    if let Some(c) = known {
        return (c, "ipu_scheme");
    }
    if is_audit_or_non_credit_name(name) {
        return (0, "default");
    }
    let upper = name.to_uppercase();
    // Engineering Graphics / Drawing / Workshop / CAD / Labs / Practicals -> 1 credit
    if upper.contains("GRAPHICS")
        || upper.contains("WORKSHOP")
        || upper.contains("DRAWING")
        || upper.contains("CAD")
        || is_lab_or_practical_text(&digits, name)
    {
        return (1, "default");
    }
    // NUES / HVPE / Human Values / Ethics / Indian Constitution / UHV -> 2 credits
    if upper.contains("NUES")
        || upper.contains("HVPE")
        || upper.contains("HV&E")
        || upper.contains("HUMAN VALUES")
        || upper.contains("CONSTITUTION")
        || upper.contains("ETHICS")
        || upper.contains("UNIVERSAL HUMAN")
        || upper.contains("UHV")
        || upper.contains("NSS")
        || upper.contains("NCC")
        || upper.contains("YOGA")
    {
        return (2, "default");
    }
    // Default fallback for Theory subjects when credits are unavailable -> 3 credits
    (3, "default")
}

struct DashCreditRow {
    id: String,
    semester: i64,
    code_key: String,
    code_digits: String,
    name_key: String,
    tokens: Vec<String>,
    acronym: String,
    roman: Option<u8>,
    is_lab: bool,
    credits: i64,
}

fn load_dashboard_credit_rows(conn: &Connection) -> Vec<DashCreditRow> {
    let mut rows = Vec::new();
    let Ok(mut stmt) = conn.prepare("SELECT id, semester, code, name, credits FROM subjects") else {
        return rows;
    };
    let Ok(iter) = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, i64>(4)?,
        ))
    }) else {
        return rows;
    };
    for (id, semester, code, name, credits) in iter.flatten() {
        let (code_key, code_digits) = canonical_subject_code(&code);
        let tokens = tokenize_expanded_name(&name);
        let acronym = name_acronym(&tokens);
        let roman = extract_roman_part(&name);
        let is_lab = is_lab_or_practical_text(&code_digits, &name);
        rows.push(DashCreditRow {
            id,
            semester,
            code_key,
            code_digits,
            name_key: normalize_lookup_key(&name),
            tokens,
            acronym,
            roman,
            is_lab,
            credits: credits.max(0),
        });
    }
    rows
}

fn find_matching_dashboard_subject<'a>(
    rows: &'a [DashCreditRow],
    semester: i64,
    code: &str,
    name: &str,
) -> Option<&'a DashCreditRow> {
    let (ckey, cdigits) = canonical_subject_code(code);
    let nkey = normalize_lookup_key(name);

    if !ckey.is_empty() {
        if let Some(hit) = rows
            .iter()
            .find(|r| r.semester == semester && r.code_key == ckey && r.credits > 0)
            .or_else(|| rows.iter().find(|r| r.semester == semester && r.code_key == ckey))
        {
            return Some(hit);
        }
        if let Some(hit) = rows
            .iter()
            .find(|r| r.code_key == ckey && r.credits > 0)
            .or_else(|| rows.iter().find(|r| r.code_key == ckey))
        {
            return Some(hit);
        }
    }
    if nkey.len() >= 4 {
        if let Some(hit) = rows.iter().find(|r| r.semester == semester && r.name_key == nkey) {
            return Some(hit);
        }
        if let Some(hit) = rows.iter().find(|r| r.name_key == nkey) {
            return Some(hit);
        }
    }

    let target_tokens = tokenize_expanded_name(name);
    let target_set: HashSet<&str> = target_tokens.iter().map(String::as_str).collect();
    let target_acro = name_acronym(&target_tokens);
    let target_roman = extract_roman_part(name);
    let target_is_lab = is_lab_or_practical_text(&cdigits, name);

    let mut best: Option<(&DashCreditRow, f64)> = None;
    for r in rows {
        if r.semester != semester {
            continue;
        }
        if let (Some(tr), Some(rr)) = (target_roman, r.roman) {
            if tr != rr {
                continue;
            }
        }
        let graphics_or_ws = target_set.contains("graphics") || target_set.contains("workshop");
        if !graphics_or_ws && r.is_lab != target_is_lab {
            continue;
        }
        let mut score = 0.0f64;
        if !cdigits.is_empty() && cdigits.len() >= 3 && r.code_digits == cdigits {
            score = score.max(0.92);
        }
        if !r.acronym.is_empty() && r.acronym.len() >= 2 && r.acronym == target_acro {
            score = score.max(0.90);
        }
        if !r.tokens.is_empty() && !target_set.is_empty() {
            let row_set: HashSet<&str> = r.tokens.iter().map(String::as_str).collect();
            let inter = row_set.intersection(&target_set).count() as f64;
            let union = row_set.union(&target_set).count().max(1) as f64;
            let min_sz = row_set.len().min(target_set.len()).max(1) as f64;
            if inter >= 2.0 || (inter >= 1.0 && row_set.len() == 1 && target_set.len() == 1) {
                score = score.max((inter / union).max((inter / min_sz) * 0.88));
            }
        }
        if score >= 0.72 {
            let total_score = score + if r.credits > 0 { 0.02 } else { 0.0 };
            if best.map(|(_, prev)| total_score > prev).unwrap_or(true) {
                best = Some((r, total_score));
            }
        }
    }
    best.map(|(r, _)| r)
}

fn resolve_subject_credits(
    rows: &[DashCreditRow],
    semester: i64,
    code: &str,
    name: &str,
    explicit_stored: Option<i64>,
    stored_source: &str,
) -> (i64, &'static str, Option<String>) {
    let matched = find_matching_dashboard_subject(rows, semester, code, name);
    let matched_id = matched.map(|r| r.id.clone());

    if stored_source == "manual" {
        if let Some(c) = explicit_stored.filter(|&v| v >= 0) {
            return (c, "manual", matched_id);
        }
    }
    if let Some(hit) = matched {
        if hit.credits > 0 || is_audit_or_non_credit_name(name) {
            return (hit.credits, "dashboard", Some(hit.id.clone()));
        }
    }
    if stored_source == "portal" {
        if let Some(c) = explicit_stored.filter(|&v| v > 0) {
            return (c, "portal", matched_id);
        }
    }
    let (scheme_cr, scheme_src) = default_ipu_credits_for_code_and_name(code, name);
    (scheme_cr, scheme_src, matched_id)
}

impl WorkspaceDb {
    pub fn open(path: &str) -> Result<Self, String> {
        if let Some(parent) = Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        let conn = Connection::open(path).map_err(|e| format!("Failed opening SQLite DB: {}", e))?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA secure_delete = ON;
            PRAGMA busy_timeout = 5000;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -8000;
            PRAGMA wal_autocheckpoint = 500;

            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                user_id TEXT NOT NULL DEFAULT 'local-owner',
                name TEXT NOT NULL DEFAULT 'Student',
                email TEXT NOT NULL DEFAULT '',
                picture TEXT NOT NULL DEFAULT '',
                branch TEXT NOT NULL DEFAULT '',
                course TEXT NOT NULL DEFAULT '',
                college TEXT NOT NULL DEFAULT '',
                batch TEXT NOT NULL DEFAULT '',
                enrollment_number TEXT NOT NULL DEFAULT '',
                admission_year TEXT NOT NULL DEFAULT '',
                current_semester INTEGER NOT NULL DEFAULT 1,
                attendance_threshold INTEGER NOT NULL DEFAULT 75,
                warning_threshold INTEGER NOT NULL DEFAULT 76,
                preferences_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS subjects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL DEFAULT '',
                professor TEXT NOT NULL DEFAULT '',
                classroom TEXT NOT NULL DEFAULT '',
                semester INTEGER NOT NULL DEFAULT 1,
                subject_type TEXT NOT NULL DEFAULT 'theory',
                categories_json TEXT NOT NULL DEFAULT '["Theory"]',
                credits INTEGER NOT NULL DEFAULT 3,
                attended INTEGER NOT NULL DEFAULT 0,
                total INTEGER NOT NULL DEFAULT 0,
                medical_leave_count INTEGER NOT NULL DEFAULT 0,
                target INTEGER NOT NULL DEFAULT 75,
                syllabus TEXT NOT NULL DEFAULT '',
                practicals_json TEXT NOT NULL DEFAULT '{"total":10,"completed":0,"hardcopy":false}',
                assignments_json TEXT NOT NULL DEFAULT '{"total":4,"completed":0,"hardcopy":false}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS attendance_logs (
                id TEXT PRIMARY KEY,
                subject_id TEXT NOT NULL,
                subject_name TEXT NOT NULL,
                date TEXT NOT NULL,
                status TEXT NOT NULL,
                log_type TEXT NOT NULL DEFAULT 'Lecture',
                notes TEXT NOT NULL DEFAULT '',
                semester INTEGER NOT NULL DEFAULT 1,
                substituted_by TEXT NOT NULL DEFAULT '',
                timestamp TEXT NOT NULL,
                FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS timetable_periods (
                semester INTEGER PRIMARY KEY,
                periods_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS timetable_slots (
                id TEXT PRIMARY KEY,
                semester INTEGER NOT NULL DEFAULT 1,
                day TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                subject_id TEXT NOT NULL DEFAULT '',
                subject_name TEXT NOT NULL DEFAULT '',
                classroom TEXT NOT NULL DEFAULT '',
                label TEXT NOT NULL DEFAULT '',
                slot_type TEXT NOT NULL DEFAULT 'class',
                updated_at TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS manual_courses (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                platform TEXT NOT NULL DEFAULT 'custom',
                url TEXT NOT NULL DEFAULT '',
                progress INTEGER NOT NULL DEFAULT 0,
                enrolled_date TEXT NOT NULL DEFAULT '',
                target_completion_date TEXT NOT NULL DEFAULT '',
                instructor TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS semester_results (
                semester INTEGER PRIMARY KEY,
                enrollment_number TEXT NOT NULL DEFAULT '',
                semester_label TEXT NOT NULL DEFAULT '',
                sgpa REAL NOT NULL DEFAULT 0,
                total_credits INTEGER NOT NULL DEFAULT 0,
                total_marks TEXT NOT NULL DEFAULT '0',
                max_marks TEXT NOT NULL DEFAULT '0',
                subjects_json TEXT NOT NULL DEFAULT '[]',
                student_info_json TEXT NOT NULL DEFAULT '{}',
                source TEXT NOT NULL DEFAULT 'ipu_portal',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'Untitled Note',
                content TEXT NOT NULL DEFAULT '',
                is_todo INTEGER NOT NULL DEFAULT 0,
                todos_json TEXT NOT NULL DEFAULT '[]',
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                color TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS system_logs (
                id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                description TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_tombstones (
                entity TEXT NOT NULL,
                record_key TEXT NOT NULL,
                deleted_at TEXT NOT NULL,
                PRIMARY KEY (entity, record_key)
            );

            CREATE INDEX IF NOT EXISTS idx_subjects_sem ON subjects(semester);
            CREATE INDEX IF NOT EXISTS idx_logs_date_sem ON attendance_logs(date, semester);
            CREATE INDEX IF NOT EXISTS idx_logs_sub_date ON attendance_logs(subject_id, date);
            CREATE INDEX IF NOT EXISTS idx_tt_sem_day ON timetable_slots(semester, day);
            CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(is_pinned DESC, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_tombstones_deleted ON sync_tombstones(deleted_at);
            "#,
        )
        .map_err(|e| format!("Failed initializing workspace schema: {}", e))?;

        let ts = now_iso();
        conn.execute(
            "INSERT OR IGNORE INTO user_profile (id, user_id, name, email, created_at, updated_at) VALUES (1, 'local-owner', 'Student', '', ?1, ?1)",
            params![ts],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('auto_sync_enabled', 'true')",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('device_id', ?1)",
            params![format!("android-{}", Uuid::new_v4())],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn append_log_tx(tx: &rusqlite::Transaction<'_>, action: &str, description: &str) {
        let _ = tx.execute(
            "INSERT INTO system_logs (id, action, description, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![Uuid::new_v4().to_string(), action, description, now_iso()],
        );
    }

    fn record_tombstone_tx(tx: &rusqlite::Transaction<'_>, entity: &str, key: &str) {
        let clean = key.trim();
        if clean.is_empty() {
            return;
        }
        let _ = tx.execute(
            "INSERT OR REPLACE INTO sync_tombstones (entity, record_key, deleted_at) VALUES (?1, ?2, ?3)",
            params![entity, clean, now_iso()],
        );
    }

    pub fn get_meta(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row("SELECT value FROM sync_meta WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn set_meta(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?1, ?2)", params![key, value])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_meta(&self, key: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM sync_meta WHERE key = ?1", params![key])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Flushes SQLite WAL frames safely into the primary database file (called on app pause/sync).
    pub fn checkpoint_wal(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
        Ok(())
    }

    /// Removes sync tombstones older than `max_age_days` (100% parity with Desktop db.rs).
    pub fn prune_old_tombstones(&self, max_age_days: i64) -> Result<usize, String> {
        let cutoff = (Utc::now() - chrono::Duration::days(max_age_days.max(1))).to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let n = conn
            .execute("DELETE FROM sync_tombstones WHERE deleted_at < ?1", params![cutoff])
            .map_err(|e| e.to_string())?;
        Ok(n)
    }

    pub fn get_profile(&self) -> Result<Value, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            r#"
            SELECT user_id, name, email, picture, branch, course, college, batch,
                   enrollment_number, admission_year, current_semester,
                   attendance_threshold, warning_threshold, preferences_json, created_at, updated_at
            FROM user_profile WHERE id = 1
            "#,
            [],
            |r| {
                let prefs_str: String = r.get(13)?;
                let prefs: Value = serde_json::from_str(&prefs_str).unwrap_or_else(|_| json!({}));
                let sem: i64 = r.get(10)?;
                Ok(json!({
                    "_id": r.get::<_, String>(0)?,
                    "id": r.get::<_, String>(0)?,
                    "user_id": r.get::<_, String>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "email": r.get::<_, String>(2)?,
                    "picture": r.get::<_, String>(3)?,
                    "branch": r.get::<_, String>(4)?,
                    "course": r.get::<_, String>(5)?,
                    "college": r.get::<_, String>(6)?,
                    "batch": r.get::<_, String>(7)?,
                    "enrollment_number": r.get::<_, String>(8)?,
                    "admission_year": r.get::<_, String>(9)?,
                    "current_semester": sem,
                    "semester": sem,
                    "attendance_threshold": r.get::<_, i64>(11)?,
                    "warning_threshold": r.get::<_, i64>(12)?,
                    "preferences": prefs,
                    "created_at": r.get::<_, String>(14)?,
                    "updated_at": r.get::<_, String>(15)?
                }))
            },
        )
        .map_err(|e| e.to_string())
    }

    pub fn update_profile(&self, patch: &Value) -> Result<Value, String> {
        let cur = self.get_profile()?;
        let pick_s = |k: &str| {
            patch
                .get(k)
                .map(|v| val_to_string(Some(v)))
                .unwrap_or_else(|| val_to_string(cur.get(k)))
        };
        let name = pick_s("name");
        let email = pick_s("email");
        let picture = pick_s("picture");
        let branch = pick_s("branch");
        let course = pick_s("course");
        let college = pick_s("college");
        let batch = pick_s("batch");
        let enroll = pick_s("enrollment_number");
        let adm = pick_s("admission_year");
        let sem = patch
            .get("current_semester")
            .or_else(|| patch.get("semester"))
            .map(|v| val_to_i64(Some(v), 1).clamp(1, 8))
            .unwrap_or_else(|| val_to_i64(cur.get("current_semester"), 1));
        let att_t = patch
            .get("attendance_threshold")
            .map(|v| val_to_i64(Some(v), 75).clamp(1, 100))
            .unwrap_or_else(|| val_to_i64(cur.get("attendance_threshold"), 75));
        let warn_t = patch
            .get("warning_threshold")
            .map(|v| val_to_i64(Some(v), 76).clamp(1, 100))
            .unwrap_or_else(|| val_to_i64(cur.get("warning_threshold"), (att_t + 1).min(100)));

        let mut prefs = cur
            .get("preferences")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();
        if let Some(p_patch) = patch.get("preferences") {
            prefs.extend(sanitize_ui_preferences(p_patch));
        }

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        tx.execute(
            r#"
            UPDATE user_profile
            SET name = ?1, email = ?2, picture = ?3, branch = ?4, course = ?5,
                college = ?6, batch = ?7, enrollment_number = ?8, admission_year = ?9,
                current_semester = ?10, attendance_threshold = ?11, warning_threshold = ?12,
                preferences_json = ?13, updated_at = ?14
            WHERE id = 1
            "#,
            params![
                name,
                email,
                picture,
                branch,
                course,
                college,
                batch,
                enroll,
                adm,
                sem,
                att_t,
                warn_t,
                serde_json::to_string(&Value::Object(prefs)).unwrap_or_else(|_| "{}".to_string()),
                now_iso()
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);
        self.get_profile()
    }

    fn map_subject_row(r: &rusqlite::Row<'_>, default_target: i64) -> rusqlite::Result<Value> {
        let id: String = r.get(0)?;
        let name: String = r.get(1)?;
        let code: String = r.get(2)?;
        let professor: String = r.get(3)?;
        let classroom: String = r.get(4)?;
        let semester: i64 = r.get(5)?;
        let subject_type: String = r.get(6)?;
        let cats_str: String = r.get(7)?;
        let credits: i64 = r.get(8)?;
        let attended: i64 = r.get(9)?;
        let total: i64 = r.get(10)?;
        let med: i64 = r.get(11)?;
        let target: i64 = r.get::<_, i64>(12).unwrap_or(default_target);
        let syllabus: String = r.get(13)?;
        let prac_str: String = r.get(14)?;
        let asgn_str: String = r.get(15)?;
        let created_at: String = r.get::<_, String>(16).unwrap_or_default();
        let updated_at: String = r.get::<_, String>(17).unwrap_or_default();

        let categories: Value = serde_json::from_str(&cats_str).unwrap_or_else(|_| json!(["Theory"]));
        let practicals: Value = serde_json::from_str(&prac_str)
            .unwrap_or_else(|_| json!({ "total": 10, "completed": 0, "hardcopy": false }));
        let assignments: Value = serde_json::from_str(&asgn_str)
            .unwrap_or_else(|_| json!({ "total": 4, "completed": 0, "hardcopy": false }));

        let adj_att = (attended - med).max(0);
        let adj_tot = (total - med).max(0);
        let pct = calc_pct(adj_att, adj_tot);
        let status_msg = if adj_tot == 0 {
            "No Classes Yet"
        } else if pct >= target as f64 {
            "On Track"
        } else {
            "Low Attendance"
        };

        Ok(json!({
            "_id": id,
            "id": id,
            "name": name,
            "code": code,
            "professor": professor,
            "classroom": classroom,
            "semester": semester,
            "type": subject_type,
            "categories": categories,
            "credits": credits,
            "attended": attended,
            "total": total,
            "medical_leave_count": med,
            "target": target,
            "attendance_percentage": pct,
            "status_message": status_msg,
            "syllabus": syllabus,
            "practicals": practicals,
            "assignments": assignments,
            "created_at": created_at,
            "updated_at": updated_at
        }))
    }

    pub fn get_subjects(&self, semester: Option<i64>) -> Result<Vec<Value>, String> {
        let profile = self.get_profile()?;
        let default_target = val_to_i64(profile.get("attendance_threshold"), 75);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if let Some(sem) = semester {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, code, professor, classroom, semester, subject_type, categories_json, credits, attended, total, medical_leave_count, target, syllabus, practicals_json, assignments_json, created_at, updated_at FROM subjects WHERE semester = ?1 ORDER BY name ASC",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![sem], |r| Self::map_subject_row(r, default_target))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, code, professor, classroom, semester, subject_type, categories_json, credits, attended, total, medical_leave_count, target, syllabus, practicals_json, assignments_json, created_at, updated_at FROM subjects ORDER BY semester ASC, name ASC",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| Self::map_subject_row(r, default_target))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        }
    }

    pub fn get_subject_by_id(&self, subject_id: &str) -> Result<Option<Value>, String> {
        let profile = self.get_profile()?;
        let default_target = val_to_i64(profile.get("attendance_threshold"), 75);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, name, code, professor, classroom, semester, subject_type, categories_json, credits, attended, total, medical_leave_count, target, syllabus, practicals_json, assignments_json, created_at, updated_at FROM subjects WHERE id = ?1",
            params![subject_id],
            |r| Self::map_subject_row(r, default_target),
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn add_subject(&self, payload: &Value) -> Result<Value, String> {
        let name = val_to_string(payload.get("name")).trim().to_string();
        if name.is_empty() {
            return Err("Subject name is required".to_string());
        }
        let id = {
            let g = val_to_string(payload.get("id").or_else(|| payload.get("_id")));
            if g.is_empty() { Uuid::new_v4().to_string() } else { g }
        };
        let semester = val_to_i64(payload.get("semester"), 1).clamp(1, 8);
        let code = val_to_string(payload.get("code"));
        let professor = val_to_string(payload.get("professor"));
        let classroom = val_to_string(payload.get("classroom"));
        let credits = val_to_i64(payload.get("credits"), 3).clamp(0, 12);
        let categories_val = payload
            .get("categories")
            .filter(|v| v.is_array())
            .cloned()
            .unwrap_or_else(|| json!(["Theory"]));
        let is_prac = categories_val
            .as_array()
            .map(|a| a.iter().any(|x| x.as_str() == Some("Practical")))
            .unwrap_or(false);
        let subject_type = {
            let g = val_to_string(payload.get("type"));
            if g.is_empty() {
                if is_prac { "practical".to_string() } else { "theory".to_string() }
            } else {
                g
            }
        };
        let target = val_to_i64(payload.get("target"), 75).clamp(1, 100);
        let ts = now_iso();

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        tx.execute(
            r#"
            INSERT INTO subjects (
                id, name, code, professor, classroom, semester, subject_type,
                categories_json, credits, attended, total, medical_leave_count,
                target, syllabus, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 0, 0, ?10, '', ?11, ?11)
            "#,
            params![
                id,
                name,
                code,
                professor,
                classroom,
                semester,
                subject_type,
                serde_json::to_string(&categories_val).unwrap_or_else(|_| "[\"Theory\"]".to_string()),
                credits,
                target,
                ts
            ],
        )
        .map_err(|e| e.to_string())?;
        Self::append_log_tx(&tx, "Subject Added", &format!("Created {} (Sem {})", name, semester));
        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);

        self.get_subject_by_id(&id)?
            .ok_or_else(|| "Failed loading created subject".to_string())
    }

    pub fn update_subject(&self, subject_id: &str, patch: &Value) -> Result<Value, String> {
        let existing = self
            .get_subject_by_id(subject_id)?
            .ok_or_else(|| "Subject not found".to_string())?;

        let name = patch
            .get("name")
            .map(|v| val_to_string(Some(v)))
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| val_to_string(existing.get("name")));
        let code = patch.get("code").map(|v| val_to_string(Some(v))).unwrap_or_else(|| val_to_string(existing.get("code")));
        let professor = patch.get("professor").map(|v| val_to_string(Some(v))).unwrap_or_else(|| val_to_string(existing.get("professor")));
        let classroom = patch.get("classroom").map(|v| val_to_string(Some(v))).unwrap_or_else(|| val_to_string(existing.get("classroom")));
        let syllabus = patch.get("syllabus").map(|v| val_to_string(Some(v))).unwrap_or_else(|| val_to_string(existing.get("syllabus")));
        let semester = patch.get("semester").map(|v| val_to_i64(Some(v), 1).clamp(1, 8)).unwrap_or_else(|| val_to_i64(existing.get("semester"), 1));
        let credits = patch.get("credits").map(|v| val_to_i64(Some(v), 3).clamp(0, 12)).unwrap_or_else(|| val_to_i64(existing.get("credits"), 3));
        let target = patch.get("target").map(|v| val_to_i64(Some(v), 75).clamp(1, 100)).unwrap_or_else(|| val_to_i64(existing.get("target"), 75));
        let med_count = val_to_i64(existing.get("medical_leave_count"), 0);
        let raw_total = patch.get("total").map(|v| val_to_i64(Some(v), 0).max(med_count)).unwrap_or_else(|| val_to_i64(existing.get("total"), 0));
        let raw_attended = if let Some(av) = patch.get("attended") {
            let phys = val_to_i64(Some(av), 0).max(0);
            (phys + med_count).min(raw_total)
        } else {
            val_to_i64(existing.get("attended"), 0).min(raw_total)
        };
        let categories_val = patch
            .get("categories")
            .filter(|v| v.is_array())
            .cloned()
            .unwrap_or_else(|| existing.get("categories").cloned().unwrap_or_else(|| json!(["Theory"])));
        let practicals = if patch.get("practicals").is_some() {
            let mut base = existing.get("practicals").cloned().unwrap_or_else(|| json!({ "total": 10, "completed": 0, "hardcopy": false }));
            if let (Some(dst), Some(src)) = (base.as_object_mut(), patch.get("practicals").and_then(|v| v.as_object())) {
                for (k, v) in src { dst.insert(k.clone(), v.clone()); }
            }
            base
        } else {
            existing.get("practicals").cloned().unwrap_or_else(|| json!({ "total": 10, "completed": 0, "hardcopy": false }))
        };
        let assignments = if patch.get("assignments").is_some() {
            let mut base = existing.get("assignments").cloned().unwrap_or_else(|| json!({ "total": 4, "completed": 0, "hardcopy": false }));
            if let (Some(dst), Some(src)) = (base.as_object_mut(), patch.get("assignments").and_then(|v| v.as_object())) {
                for (k, v) in src { dst.insert(k.clone(), v.clone()); }
            }
            base
        } else {
            existing.get("assignments").cloned().unwrap_or_else(|| json!({ "total": 4, "completed": 0, "hardcopy": false }))
        };

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        tx.execute(
            r#"
            UPDATE subjects
            SET name = ?1, code = ?2, professor = ?3, classroom = ?4, semester = ?5,
                categories_json = ?6, credits = ?7, attended = ?8, total = ?9,
                target = ?10, syllabus = ?11, practicals_json = ?12, assignments_json = ?13, updated_at = ?14
            WHERE id = ?15
            "#,
            params![
                name,
                code,
                professor,
                classroom,
                semester,
                serde_json::to_string(&categories_val).unwrap_or_else(|_| "[\"Theory\"]".to_string()),
                credits,
                raw_attended,
                raw_total,
                target,
                syllabus,
                serde_json::to_string(&practicals).unwrap_or_else(|_| "{}".to_string()),
                serde_json::to_string(&assignments).unwrap_or_else(|_| "{}".to_string()),
                now_iso(),
                subject_id
            ],
        )
        .map_err(|e| e.to_string())?;
        let _ = tx.execute("UPDATE timetable_slots SET subject_name = ?1 WHERE subject_id = ?2", params![name, subject_id]);
        let _ = tx.execute("UPDATE timetable_slots SET classroom = '' WHERE subject_id = ?1 AND slot_type = 'class'", params![subject_id]);
        let _ = tx.execute("UPDATE attendance_logs SET subject_name = ?1 WHERE subject_id = ?2", params![name, subject_id]);
        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);

        self.get_subject_by_id(subject_id)?
            .ok_or_else(|| "Subject not found after update".to_string())
    }

    pub fn delete_subject(&self, subject_id: &str) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let deleted = tx.execute("DELETE FROM subjects WHERE id = ?1", params![subject_id]).map_err(|e| e.to_string())?;
        let _ = tx.execute("DELETE FROM timetable_slots WHERE subject_id = ?1", params![subject_id]);
        if deleted > 0 {
            Self::record_tombstone_tx(&tx, "subject", subject_id);
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(deleted > 0)
    }

    pub fn mark_attendance(
        &self,
        subject_id: &str,
        status_raw: &str,
        date: &str,
        notes: &str,
        substituted_by: &str,
        semester_opt: Option<i64>,
        log_type: &str,
    ) -> Result<Value, String> {
        let status = normalize_status(status_raw);
        let clean_date = if date.len() >= 10 { &date[..10] } else { date };
        let clean_type = if log_type.trim().is_empty() { "Lecture" } else { log_type.trim() };

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;

        let (sub_name, sub_sem, cur_att, cur_tot, cur_med): (String, i64, i64, i64, i64) = tx
            .query_row(
                "SELECT name, semester, attended, total, medical_leave_count FROM subjects WHERE id = ?1",
                params![subject_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .map_err(|_| "Subject not found".to_string())?;
        let sem = semester_opt.unwrap_or(sub_sem);

        let existing: Option<(String, String)> = tx
            .query_row(
                "SELECT id, status FROM attendance_logs WHERE subject_id = ?1 AND date = ?2 AND log_type = ?3 LIMIT 1",
                params![subject_id, clean_date, clean_type],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let ts = now_iso();
        let (log_id, new_att, new_tot, new_med) = if let Some((eid, old_status)) = existing {
            let (oa, ot, om) = status_deltas(&old_status);
            let (na, nt, nm) = status_deltas(status);
            let next_att = (cur_att - oa + na).max(0);
            let next_tot = (cur_tot - ot + nt).max(0);
            let next_med = (cur_med - om + nm).max(0);
            tx.execute(
                "UPDATE subjects SET attended = ?1, total = ?2, medical_leave_count = ?3 WHERE id = ?4",
                params![next_att, next_tot, next_med, subject_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE attendance_logs SET status = ?1, notes = ?2, substituted_by = ?3, timestamp = ?4 WHERE id = ?5",
                params![status, notes, substituted_by, ts, eid],
            )
            .map_err(|e| e.to_string())?;
            (eid, next_att, next_tot, next_med)
        } else {
            let new_id = Uuid::new_v4().to_string();
            let (na, nt, nm) = status_deltas(status);
            let next_att = (cur_att + na).max(0);
            let next_tot = (cur_tot + nt).max(0);
            let next_med = (cur_med + nm).max(0);
            tx.execute(
                "UPDATE subjects SET attended = ?1, total = ?2, medical_leave_count = ?3 WHERE id = ?4",
                params![next_att, next_tot, next_med, subject_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO attendance_logs (id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![new_id, subject_id, sub_name, clean_date, status, clean_type, notes, sem, substituted_by, ts],
            )
            .map_err(|e| e.to_string())?;
            (new_id, next_att, next_tot, next_med)
        };

        Self::append_log_tx(&tx, "Attendance Marked", &format!("{} marked {} on {}", sub_name, status, clean_date));
        tx.commit().map_err(|e| e.to_string())?;

        Ok(json!({
            "id": log_id,
            "subject_id": subject_id,
            "subject_name": sub_name,
            "date": clean_date,
            "status": status,
            "type": clean_type,
            "attended": new_att,
            "total": new_tot,
            "medical_leave_count": new_med,
            "percentage": calc_pct((new_att - new_med).max(0), (new_tot - new_med).max(0)),
            "timestamp": ts
        }))
    }

    pub fn edit_attendance(
        &self,
        log_id: &str,
        status_raw: &str,
        notes: Option<&str>,
        date: Option<&str>,
    ) -> Result<Value, String> {
        self.edit_attendance_full(log_id, status_raw, notes, date, None)
    }

    pub fn edit_attendance_full(
        &self,
        log_id: &str,
        status_raw: &str,
        notes: Option<&str>,
        date: Option<&str>,
        substituted_by: Option<&str>,
    ) -> Result<Value, String> {
        let status = normalize_status(status_raw);
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let (sid, sname, old_status, old_date, old_notes, old_sub_by, ltype, sem): (String, String, String, String, String, String, String, i64) = tx
            .query_row(
                "SELECT subject_id, subject_name, status, date, notes, substituted_by, log_type, semester FROM attendance_logs WHERE id = ?1",
                params![log_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
            )
            .map_err(|_| "Attendance log not found".to_string())?;
        let (oa, ot, om) = status_deltas(&old_status);
        let (na, nt, nm) = status_deltas(status);
        let (cur_att, cur_tot, cur_med): (i64, i64, i64) = tx
            .query_row("SELECT attended, total, medical_leave_count FROM subjects WHERE id = ?1", params![sid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap_or((0, 0, 0));
        let next_date = date.map(|d| if d.len() >= 10 { &d[..10] } else { d }).unwrap_or(&old_date);
        let next_notes = notes.unwrap_or(&old_notes);
        let next_sub_by = if status == "substituted" {
            substituted_by.unwrap_or(&old_sub_by)
        } else {
            ""
        };
        tx.execute(
            "UPDATE subjects SET attended = ?1, total = ?2, medical_leave_count = ?3 WHERE id = ?4",
            params![(cur_att - oa + na).max(0), (cur_tot - ot + nt).max(0), (cur_med - om + nm).max(0), sid],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE attendance_logs SET status = ?1, notes = ?2, date = ?3, substituted_by = ?4, timestamp = ?5 WHERE id = ?6",
            params![status, next_notes, next_date, next_sub_by, now_iso(), log_id],
        )
        .map_err(|e| e.to_string())?;
        Self::append_log_tx(&tx, "Attendance Edited", &format!("{} updated to {} on {}", sname, status, next_date));
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({ "id": log_id, "subject_id": sid, "subject_name": sname, "date": next_date, "status": status, "type": ltype, "notes": next_notes, "substituted_by": next_sub_by, "semester": sem }))
    }

    /// Atomic single-transaction batch attendance logger (All Present / All Absent / Holiday / Medical).
    pub fn mark_attendance_batch(
        &self,
        items: &[Value],
        status_raw: &str,
        date: &str,
        notes: &str,
        semester_opt: Option<i64>,
    ) -> Result<Value, String> {
        let status = normalize_status(status_raw);
        let clean_date = if date.len() >= 10 { &date[..10] } else { date };
        let ts = now_iso();
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let mut created_logs = Vec::with_capacity(items.len());

        for item in items {
            let sid = val_to_string(item.get("subject_id").or_else(|| item.get("subjectId")));
            if sid.is_empty() {
                continue;
            }
            let raw_type = val_to_string(item.get("type").or_else(|| item.get("log_type")).or_else(|| item.get("attendance_type")));
            let clean_type = if raw_type.trim().is_empty() { "Lecture".to_string() } else { raw_type.trim().to_string() };

            let sub_row: Option<(String, i64, i64, i64, i64)> = tx
                .query_row(
                    "SELECT name, semester, attended, total, medical_leave_count FROM subjects WHERE id = ?1",
                    params![sid],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let Some((sub_name, sub_sem, cur_att, cur_tot, cur_med)) = sub_row else {
                continue;
            };
            let sem = semester_opt.unwrap_or(sub_sem);

            let existing: Option<(String, String)> = tx
                .query_row(
                    "SELECT id, status FROM attendance_logs WHERE subject_id = ?1 AND date = ?2 AND log_type = ?3 LIMIT 1",
                    params![sid, clean_date, clean_type],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let log_id = if let Some((eid, old_status)) = existing {
                let (oa, ot, om) = status_deltas(&old_status);
                let (na, nt, nm) = status_deltas(status);
                tx.execute(
                    "UPDATE subjects SET attended = ?1, total = ?2, medical_leave_count = ?3 WHERE id = ?4",
                    params![(cur_att - oa + na).max(0), (cur_tot - ot + nt).max(0), (cur_med - om + nm).max(0), sid],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "UPDATE attendance_logs SET status = ?1, notes = ?2, timestamp = ?3 WHERE id = ?4",
                    params![status, notes, ts, eid],
                )
                .map_err(|e| e.to_string())?;
                eid
            } else {
                let new_id = Uuid::new_v4().to_string();
                let (na, nt, nm) = status_deltas(status);
                tx.execute(
                    "UPDATE subjects SET attended = ?1, total = ?2, medical_leave_count = ?3 WHERE id = ?4",
                    params![(cur_att + na).max(0), (cur_tot + nt).max(0), (cur_med + nm).max(0), sid],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "INSERT INTO attendance_logs (id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'',?9)",
                    params![new_id, sid, sub_name, clean_date, status, clean_type, notes, sem, ts],
                )
                .map_err(|e| e.to_string())?;
                new_id
            };

            created_logs.push(json!({
                "id": log_id,
                "subject_id": sid,
                "subject_name": sub_name,
                "date": clean_date,
                "status": status,
                "type": clean_type,
                "notes": notes,
                "semester": sem,
                "timestamp": ts
            }));
        }

        if !created_logs.is_empty() {
            Self::append_log_tx(
                &tx,
                "Bulk Attendance",
                &format!("Marked {} class(es) {} on {}", created_logs.len(), status, clean_date),
            );
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({ "marked_count": created_logs.len(), "logs": created_logs }))
    }

    /// Atomic single-transaction batch attendance deletion ("Unmark All" on a date).
    pub fn delete_attendance_batch(&self, log_ids: &[String]) -> Result<Value, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let mut deleted_count = 0usize;

        for log_id in log_ids {
            let row: Option<(String, String, String, String)> = tx
                .query_row(
                    "SELECT subject_id, status, date, log_type FROM attendance_logs WHERE id = ?1",
                    params![log_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let Some((sid, old_status, date, ltype)) = row else {
                continue;
            };
            let (oa, ot, om) = status_deltas(&old_status);
            tx.execute(
                "UPDATE subjects SET attended = MAX(0, attended - ?1), total = MAX(0, total - ?2), medical_leave_count = MAX(0, medical_leave_count - ?3) WHERE id = ?4",
                params![oa, ot, om, sid],
            )
            .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM attendance_logs WHERE id = ?1", params![log_id]).map_err(|e| e.to_string())?;
            let clean_date = if date.len() >= 10 { &date[..10] } else { &date };
            let clean_type = if ltype.trim().is_empty() { "lecture".to_string() } else { ltype.trim().to_lowercase() };
            Self::record_tombstone_tx(&tx, "attendance_log", log_id);
            Self::record_tombstone_tx(&tx, "attendance_log", &format!("{}|{}|{}", sid, clean_date, clean_type));
            deleted_count += 1;
        }

        if deleted_count > 0 {
            Self::append_log_tx(&tx, "Attendance Cleared", &format!("Cleared {} attendance record(s)", deleted_count));
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({ "deleted_count": deleted_count }))
    }

    pub fn get_subject_logs(&self, subject_id: &str, limit: i64) -> Result<Vec<Value>, String> {
        let lim = limit.clamp(1, 200);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs WHERE subject_id = ?1 ORDER BY date DESC, timestamp DESC LIMIT ?2")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![subject_id, lim], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "subject_id": r.get::<_, String>(1)?,
                    "subject_name": r.get::<_, String>(2)?,
                    "date": r.get::<_, String>(3)?,
                    "status": r.get::<_, String>(4)?,
                    "type": r.get::<_, String>(5)?,
                    "notes": r.get::<_, String>(6)?,
                    "semester": r.get::<_, i64>(7)?,
                    "substituted_by": r.get::<_, String>(8)?,
                    "timestamp": r.get::<_, String>(9)?
                }))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn delete_attendance(&self, log_id: &str) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let row: Option<(String, String, String, String)> = tx
            .query_row(
                "SELECT subject_id, status, date, log_type FROM attendance_logs WHERE id = ?1",
                params![log_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((sid, old_status, date, ltype)) = row else {
            return Ok(false);
        };
        let (oa, ot, om) = status_deltas(&old_status);
        tx.execute(
            "UPDATE subjects SET attended = MAX(0, attended - ?1), total = MAX(0, total - ?2), medical_leave_count = MAX(0, medical_leave_count - ?3) WHERE id = ?4",
            params![oa, ot, om, sid],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM attendance_logs WHERE id = ?1", params![log_id]).map_err(|e| e.to_string())?;
        let clean_date = if date.len() >= 10 { &date[..10] } else { &date };
        let clean_type = if ltype.trim().is_empty() { "lecture".to_string() } else { ltype.trim().to_lowercase() };
        Self::record_tombstone_tx(&tx, "attendance_log", log_id);
        Self::record_tombstone_tx(&tx, "attendance_log", &format!("{}|{}|{}", sid, clean_date, clean_type));
        tx.commit().map_err(|e| e.to_string())?;
        Ok(true)
    }

    pub fn get_calendar_data(&self, year: i32, month: u32, semester: Option<i64>) -> Result<Vec<Value>, String> {
        let prefix = format!("{:04}-{:02}-%", year, month);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let map_row = |r: &rusqlite::Row<'_>| -> rusqlite::Result<Value> {
            let id: String = r.get(0)?;
            Ok(json!({
                "id": id,
                "subject_id": r.get::<_, String>(1)?,
                "subject_name": r.get::<_, String>(2)?,
                "date": r.get::<_, String>(3)?,
                "status": r.get::<_, String>(4)?,
                "type": r.get::<_, String>(5)?,
                "notes": r.get::<_, String>(6)?,
                "semester": r.get::<_, i64>(7)?,
                "substituted_by": r.get::<_, String>(8)?,
                "timestamp": r.get::<_, String>(9)?
            }))
        };
        if let Some(sem) = semester {
            let mut stmt = conn
                .prepare("SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs WHERE date LIKE ?1 AND semester = ?2 ORDER BY date ASC, timestamp ASC")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![prefix, sem], map_row).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        } else {
            let mut stmt = conn
                .prepare("SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs WHERE date LIKE ?1 ORDER BY date ASC, timestamp ASC")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![prefix], map_row).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        }
    }

    pub fn get_logs_for_date(&self, date: &str, semester: Option<i64>) -> Result<Vec<Value>, String> {
        let clean = if date.len() >= 10 { &date[..10] } else { date };
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let map_row = |r: &rusqlite::Row<'_>| -> rusqlite::Result<Value> {
            let id: String = r.get(0)?;
            Ok(json!({
                "id": id,
                "subject_id": r.get::<_, String>(1)?,
                "subject_name": r.get::<_, String>(2)?,
                "date": r.get::<_, String>(3)?,
                "status": r.get::<_, String>(4)?,
                "type": r.get::<_, String>(5)?,
                "notes": r.get::<_, String>(6)?,
                "semester": r.get::<_, i64>(7)?,
                "substituted_by": r.get::<_, String>(8)?,
                "timestamp": r.get::<_, String>(9)?
            }))
        };
        if let Some(sem) = semester {
            let mut stmt = conn
                .prepare("SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs WHERE date = ?1 AND semester = ?2 ORDER BY timestamp ASC")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![clean, sem], map_row).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        } else {
            let mut stmt = conn
                .prepare("SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs WHERE date = ?1 ORDER BY timestamp ASC")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![clean], map_row).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        }
    }

    pub fn get_classes_for_date(&self, date: &str, semester: i64) -> Result<Vec<Value>, String> {
        let clean = if date.len() >= 10 { &date[..10] } else { date };
        let day_name = NaiveDate::parse_from_str(clean, "%Y-%m-%d")
            .map(|d| match d.weekday() {
                chrono::Weekday::Mon => "Monday",
                chrono::Weekday::Tue => "Tuesday",
                chrono::Weekday::Wed => "Wednesday",
                chrono::Weekday::Thu => "Thursday",
                chrono::Weekday::Fri => "Friday",
                chrono::Weekday::Sat => "Saturday",
                chrono::Weekday::Sun => "Sunday",
            })
            .unwrap_or("Monday");
        let tt = self.get_timetable(semester)?;
        let day_slots = tt
            .get("schedule")
            .and_then(|s| s.get(day_name))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let logs = self.get_logs_for_date(clean, Some(semester))?;
        let mut out = Vec::new();
        for slot in day_slots {
            let stype = val_to_string(slot.get("type")).to_lowercase();
            if ["break", "free", "lunch", "gap"].contains(&stype.as_str()) {
                continue;
            }
            let sid = val_to_string(slot.get("subject_id"));
            let sname = val_to_string(slot.get("subject_name"));
            if sid.is_empty() && sname.is_empty() {
                continue;
            }
            let start = val_to_string(slot.get("start_time"));
            let att_type = if start.is_empty() {
                "Lecture".to_string()
            } else {
                format!("class::{}", start)
            };
            let matched_log = logs
                .iter()
                .find(|l| {
                    val_to_string(l.get("subject_id")) == sid
                        && val_to_string(l.get("type")).eq_ignore_ascii_case(&att_type)
                })
                .or_else(|| logs.iter().find(|l| val_to_string(l.get("subject_id")) == sid));

            out.push(json!({
                "id": slot.get("id").cloned().unwrap_or(json!("")),
                "subject_id": sid,
                "name": sname,
                "subject_name": sname,
                "start_time": start,
                "end_time": val_to_string(slot.get("end_time")),
                "classroom": val_to_string(slot.get("classroom")),
                "type": stype,
                "attendance_type": att_type,
                "marked": matched_log.is_some(),
                "marked_status": matched_log.and_then(|l| l.get("status")).cloned().unwrap_or(Value::Null),
                "log_id": matched_log.and_then(|l| l.get("id")).cloned().unwrap_or(Value::Null)
            }));
        }
        out.sort_by_key(|item| parse_time_to_minutes(&val_to_string(item.get("start_time"))));
        Ok(out)
    }

    pub fn get_dashboard_data(&self, semester: i64) -> Result<Value, String> {
        let profile = self.get_profile()?;
        let target = val_to_i64(profile.get("attendance_threshold"), 75);
        let subjects = self.get_subjects(Some(semester))?;
        let today_str = Local::now().format("%Y-%m-%d").to_string();
        let today_classes = self.get_classes_for_date(&today_str, semester)?;

        let mut raw_att = 0i64;
        let mut raw_tot = 0i64;
        let mut total_med = 0i64;
        for s in &subjects {
            raw_att += val_to_i64(s.get("attended"), 0);
            raw_tot += val_to_i64(s.get("total"), 0);
            total_med += val_to_i64(s.get("medical_leave_count"), 0);
        }
        let phys_att = (raw_att - total_med).max(0);
        let eligible_tot = (raw_tot - total_med).max(0);
        let overall_pct = calc_pct(phys_att, eligible_tot);
        let without_med_pct = calc_pct(phys_att, raw_tot);
        let safe_bunks = if eligible_tot > 0 && overall_pct >= target as f64 && target > 0 {
            ((phys_att * 100) - (target * eligible_tot)).max(0) / target
        } else {
            0
        };
        let risk_level = if eligible_tot == 0 {
            "No Data"
        } else if overall_pct >= target as f64 {
            "Safe"
        } else if overall_pct >= (target - 15).max(0) as f64 {
            "Warning"
        } else {
            "Critical"
        };

        Ok(json!({
            "user": profile,
            "semester": semester,
            "subjects": subjects,
            "today_classes": today_classes,
            "overall_attendance": overall_pct,
            "attendance_without_medical": without_med_pct,
            "medical_leave_count": total_med,
            "summary": {
                "overall_percentage": overall_pct,
                "total_attended": phys_att,
                "total_classes": eligible_tot,
                "subject_count": subjects.len(),
                "risk_level": risk_level,
                "safe_bunks_remaining": safe_bunks
            }
        }))
    }

    pub fn get_timetable(&self, semester: i64) -> Result<Value, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let periods_row: Option<(String, String)> = conn
            .query_row("SELECT periods_json, updated_at FROM timetable_periods WHERE semester = ?1", params![semester], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()
            .map_err(|e| e.to_string())?;
        let (periods_str, periods_updated_at) = periods_row.unwrap_or_else(|| (default_periods_json(), String::new()));
        let periods: Value = serde_json::from_str(&periods_str).unwrap_or_else(|_| json!([]));

        let mut stmt = conn
            .prepare(
                r#"
                SELECT ts.id, ts.day, ts.start_time, ts.end_time, ts.subject_id,
                       CASE WHEN ts.subject_name != '' THEN ts.subject_name ELSE COALESCE(s.name, '') END,
                       CASE WHEN ts.classroom != '' THEN ts.classroom ELSE COALESCE(s.classroom, '') END,
                       ts.label, ts.slot_type, ts.updated_at
                FROM timetable_slots ts
                LEFT JOIN subjects s ON s.id = ts.subject_id
                WHERE ts.semester = ?1
                "#,
            )
            .map_err(|e| e.to_string())?;
        let mut schedule = serde_json::Map::new();
        for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] {
            schedule.insert(d.to_string(), json!([]));
        }
        let rows = stmt
            .query_map(params![semester], |r| {
                let id: String = r.get(0)?;
                let day: String = r.get(1)?;
                let start: String = r.get(2)?;
                let end: String = r.get(3)?;
                Ok((
                    day.clone(),
                    json!({
                        "id": id,
                        "_id": id,
                        "day": day,
                        "start_time": start,
                        "startTime": start,
                        "end_time": end,
                        "endTime": end,
                        "subject_id": r.get::<_, String>(4)?,
                        "subject_name": r.get::<_, String>(5)?,
                        "classroom": r.get::<_, String>(6)?,
                        "label": r.get::<_, String>(7)?,
                        "type": r.get::<_, String>(8)?,
                        "semester": semester,
                        "updated_at": r.get::<_, String>(9).unwrap_or_default()
                    }),
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            schedule.entry(row.0).or_insert_with(|| json!([])).as_array_mut().map(|a| a.push(row.1));
        }
        for val in schedule.values_mut() {
            if let Some(arr) = val.as_array_mut() {
                arr.sort_by_key(|slot| parse_time_to_minutes(&val_to_string(slot.get("start_time"))));
            }
        }
        Ok(json!({
            "semester": semester,
            "periods": periods,
            "periods_updated_at": periods_updated_at,
            "schedule": Value::Object(schedule)
        }))
    }

    pub fn save_timetable_structure(&self, semester: i64, periods: &Value) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let p_str = serde_json::to_string(periods).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO timetable_periods (semester, periods_json, updated_at) VALUES (?1, ?2, ?3)",
            params![semester, p_str, now_iso()],
        )
        .map_err(|e| e.to_string())?;
        Self::append_log_tx(&tx, "Timetable Structure", &format!("Updated periods for Sem {}", semester));
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Compact QR v2 Encoder (`SEMQR2:...`):
    /// Compresses a full weekly timetable (35+ slots, custom periods, and subject metadata)
    /// into ~400-700 bytes so QR codes remain crisp, fast-scanning, and cross-device safe.
    pub fn export_timetable_qr_v2(&self, semester: i64) -> Result<String, String> {
        let tt = self.get_timetable(semester)?;
        let subs = self.get_subjects(Some(semester))?;
        let sub_by_id: HashMap<String, &Value> = subs
            .iter()
            .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(|id| (id.to_string(), s)))
            .collect();

        let periods_raw = tt.get("periods").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let periods_compact: Vec<Value> = periods_raw
            .iter()
            .map(|p| {
                json!([
                    val_to_string(p.get("name")),
                    val_to_string(p.get("startTime").or_else(|| p.get("start_time"))),
                    val_to_string(p.get("endTime").or_else(|| p.get("end_time")))
                ])
            })
            .collect();

        // Build deduplicated subject dictionary: [name, code, room, credits, isPractical(0|1)]
        let mut dict: Vec<Value> = Vec::new();
        let mut dict_index: HashMap<String, usize> = HashMap::new();
        let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        let mut slot_tuples: Vec<Value> = Vec::new();

        if let Some(sched) = tt.get("schedule").and_then(|v| v.as_object()) {
            for (day_idx, day_name) in days.iter().enumerate() {
                let Some(slots) = sched.get(*day_name).and_then(|v| v.as_array()) else {
                    continue;
                };
                for slot in slots {
                    let stype = val_to_string(slot.get("type")).to_lowercase();
                    let type_code = match stype.as_str() {
                        "break" => "b",
                        "free" => "f",
                        "custom" => "u",
                        _ => "c",
                    };
                    let start = val_to_string(slot.get("start_time").or_else(|| slot.get("startTime")));
                    let end = val_to_string(slot.get("end_time").or_else(|| slot.get("endTime")));
                    let room = val_to_string(slot.get("classroom"));
                    let label = val_to_string(slot.get("label"));
                    let sid = val_to_string(slot.get("subject_id"));
                    let sname = val_to_string(slot.get("subject_name"));

                    let sub_idx: i64 = if type_code == "c" && (!sid.is_empty() || !sname.is_empty()) {
                        let key = if !sid.is_empty() {
                            format!("id:{}", sid)
                        } else {
                            format!("nm:{}", sname.trim().to_lowercase())
                        };
                        if let Some(&idx) = dict_index.get(&key) {
                            idx as i64
                        } else {
                            let idx = dict.len();
                            let meta = sub_by_id.get(&sid);
                            let final_name = meta
                                .map(|m| val_to_string(m.get("name")))
                                .filter(|s| !s.is_empty())
                                .unwrap_or_else(|| sname.clone());
                            let code = meta.map(|m| val_to_string(m.get("code"))).unwrap_or_default();
                            let sub_room = meta
                                .map(|m| val_to_string(m.get("classroom")))
                                .filter(|s| !s.is_empty())
                                .unwrap_or_else(|| room.clone());
                            let credits = meta.map(|m| val_to_i64(m.get("credits"), 3)).unwrap_or(3);
                            let is_prac = meta
                                .map(|m| val_to_string(m.get("type")).eq_ignore_ascii_case("practical"))
                                .unwrap_or(false);
                            dict.push(json!([final_name, code, sub_room, credits, if is_prac { 1 } else { 0 }]));
                            dict_index.insert(key, idx);
                            idx as i64
                        }
                    } else {
                        -1
                    };

                    // Compact 3-tuple `[dayIdx, periodIdx, subIdx]` if matching period & default class room!
                    let matched_pi = periods_compact.iter().position(|p| {
                        val_to_string(p.get(1)).eq_ignore_ascii_case(&start)
                            && val_to_string(p.get(2)).eq_ignore_ascii_case(&end)
                    });
                    let sub_default_room = if sub_idx >= 0 {
                        val_to_string(dict.get(sub_idx as usize).and_then(|d| d.get(2)))
                    } else {
                        String::new()
                    };
                    if let Some(pi) = matched_pi {
                        if type_code == "c" && sub_idx >= 0 && label.is_empty() && (room.is_empty() || room == sub_default_room) {
                            slot_tuples.push(json!([day_idx, pi, sub_idx]));
                            continue;
                        }
                    }
                    slot_tuples.push(json!([day_idx, start, end, sub_idx, type_code, room, label]));
                }
            }
        }

        let compact = json!({
            "p": periods_compact,
            "s": dict,
            "t": slot_tuples
        });
        let raw = serde_json::to_string(&compact).map_err(|e| e.to_string())?;
        Ok(format!("SEMQR2:{}", raw))
    }

    /// Imports BOTH Compact QR v2 (`SEMQR2:...`) AND legacy v1 (`{"v":1,"slots":[...]}`)
    /// atomically into `semester`, linking matching existing courses or auto-creating missing
    /// courses so every imported slot works immediately for 1-tap attendance & alerts!
    pub fn import_timetable_qr_v2(&self, semester: i64, payload: &str) -> Result<Value, String> {
        let trimmed = payload.trim();
        let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        let ts = now_iso();

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;

        // Load existing subjects for this semester to match by ID, canonical code, or normalized name
        let mut by_id: HashMap<String, (String, String, String)> = HashMap::new();
        let mut by_code: HashMap<String, (String, String, String)> = HashMap::new();
        let mut by_name: HashMap<String, (String, String, String)> = HashMap::new();
        {
            let mut stmt = tx
                .prepare("SELECT id, name, code, classroom FROM subjects WHERE semester = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![semester], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for (id, name, code, room) in rows.flatten() {
                let (ck, _) = canonical_subject_code(&code);
                let nk = normalize_lookup_key(&name);
                by_id.insert(id.clone(), (id.clone(), name.clone(), room.clone()));
                if !ck.is_empty() {
                    by_code.entry(ck).or_insert((id.clone(), name.clone(), room.clone()));
                }
                if !nk.is_empty() {
                    by_name.entry(nk).or_insert((id, name, room));
                }
            }
        }

        let mut subjects_created = 0usize;
        let mut subjects_linked = 0usize;
        let mut slots_imported = 0usize;
        let mut periods_imported = 0usize;

        let mut ensure_subject = |orig_id: &str, name: &str, code: &str, room: &str, credits: i64, is_prac: bool| -> Result<(String, String, String), String> {
            if !orig_id.is_empty() {
                if let Some(hit) = by_id.get(orig_id).cloned() {
                    subjects_linked += 1;
                    return Ok(hit);
                }
            }
            let (ck, _) = canonical_subject_code(code);
            if !ck.is_empty() {
                if let Some(hit) = by_code.get(&ck).cloned() {
                    subjects_linked += 1;
                    return Ok(hit);
                }
            }
            let nk = normalize_lookup_key(name);
            if !nk.is_empty() {
                if let Some(hit) = by_name.get(&nk).cloned() {
                    subjects_linked += 1;
                    return Ok(hit);
                }
            }
            let clean_name = if name.trim().is_empty() { "Imported Course".to_string() } else { name.trim().to_string() };
            let new_id = Uuid::new_v4().to_string();
            let stype = if is_prac { "practical" } else { "theory" };
            let cats = if is_prac { "[\"Practical\"]" } else { "[\"Theory\"]" };
            tx.execute(
                "INSERT INTO subjects (id, name, code, professor, classroom, semester, subject_type, categories_json, credits, attended, total, medical_leave_count, target, syllabus, created_at, updated_at) VALUES (?1,?2,?3,'',?4,?5,?6,?7,?8,0,0,0,75,'',?9,?9)",
                params![new_id, clean_name, code.trim(), room.trim(), semester, stype, cats, credits.clamp(0, 12), ts],
            )
            .map_err(|e| e.to_string())?;
            let entry = (new_id.clone(), clean_name.clone(), room.trim().to_string());
            by_id.insert(new_id, entry.clone());
            if !ck.is_empty() { by_code.insert(ck, entry.clone()); }
            if !nk.is_empty() { by_name.insert(nk, entry.clone()); }
            subjects_created += 1;
            Ok(entry)
        };

        if let Some(json_body) = trimmed.strip_prefix("SEMQR2:") {
            let root: Value = serde_json::from_str(json_body)
                .map_err(|e| format!("Invalid Semester QR v2 payload: {}", e))?;

            let mut period_defs: Vec<(String, String, String)> = Vec::new();
            if let Some(p_arr) = root.get("p").and_then(|v| v.as_array()) {
                let mut full_periods = Vec::with_capacity(p_arr.len());
                for (idx, p) in p_arr.iter().enumerate() {
                    let pname = val_to_string(p.get(0));
                    let pstart = val_to_string(p.get(1));
                    let pend = val_to_string(p.get(2));
                    if pstart.is_empty() || pend.is_empty() { continue; }
                    let final_pname = if pname.is_empty() { format!("Period {}", idx + 1) } else { pname };
                    period_defs.push((final_pname.clone(), pstart.clone(), pend.clone()));
                    full_periods.push(json!({
                        "id": format!("p{}", idx + 1),
                        "name": final_pname,
                        "startTime": pstart,
                        "endTime": pend
                    }));
                }
                if !full_periods.is_empty() {
                    tx.execute(
                        "INSERT OR REPLACE INTO timetable_periods (semester, periods_json, updated_at) VALUES (?1,?2,?3)",
                        params![semester, serde_json::to_string(&full_periods).unwrap_or_else(|_| "[]".to_string()), ts],
                    )
                    .map_err(|e| e.to_string())?;
                    periods_imported = full_periods.len();
                }
            }

            // Pre-resolve subject dictionary once per subject so linked/created counts stay exact
            let mut resolved_subs: Vec<(String, String, String)> = Vec::new();
            if let Some(s_arr) = root.get("s").and_then(|v| v.as_array()) {
                for entry in s_arr {
                    let sname = val_to_string(entry.get(0));
                    let scode = val_to_string(entry.get(1));
                    let sroom = val_to_string(entry.get(2));
                    let scredits = val_to_i64(entry.get(3), 3);
                    let sprac = val_to_i64(entry.get(4), 0) != 0;
                    resolved_subs.push(ensure_subject("", &sname, &scode, &sroom, scredits, sprac)?);
                }
            }

            if let Some(t_arr) = root.get("t").and_then(|v| v.as_array()) {
                for tuple in t_arr {
                    let Some(arr) = tuple.as_array() else { continue };
                    if arr.len() < 3 { continue; }
                    let day_idx = val_to_i64(arr.first(), 0).clamp(0, 5) as usize;
                    let day_name = days[day_idx];

                    let (start, end, sub_idx, stype, room, label) = if arr.len() == 3 && arr[1].is_number() {
                        let pi = val_to_i64(arr.get(1), -1);
                        let Some((_, ps, pe)) = (if pi >= 0 { period_defs.get(pi as usize) } else { None }) else {
                            continue;
                        };
                        (ps.clone(), pe.clone(), val_to_i64(arr.get(2), -1), "class".to_string(), String::new(), String::new())
                    } else {
                        let tc = val_to_string(arr.get(4));
                        let st = match tc.as_str() {
                            "b" => "break",
                            "f" => "free",
                            "u" => "custom",
                            _ => "class",
                        };
                        (
                            val_to_string(arr.get(1)),
                            val_to_string(arr.get(2)),
                            val_to_i64(arr.get(3), -1),
                            st.to_string(),
                            val_to_string(arr.get(5)),
                            val_to_string(arr.get(6)),
                        )
                    };
                    if start.is_empty() || end.is_empty() { continue; }

                    let (sid, sname, final_room) = if stype == "class" && sub_idx >= 0 {
                        if let Some((rid, rname, _rroom)) = resolved_subs.get(sub_idx as usize) {
                            (rid.clone(), rname.clone(), String::new())
                        } else {
                            (String::new(), label.clone(), room)
                        }
                    } else {
                        (String::new(), String::new(), room)
                    };

                    let slot_id = Uuid::new_v4().to_string();
                    tx.execute("DELETE FROM timetable_slots WHERE semester = ?1 AND day = ?2 AND start_time = ?3", params![semester, day_name, start]).map_err(|e| e.to_string())?;
                    tx.execute(
                        "INSERT INTO timetable_slots (id, semester, day, start_time, end_time, subject_id, subject_name, classroom, label, slot_type, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                        params![slot_id, semester, day_name, start, end, sid, sname, final_room, label, stype, ts],
                    )
                    .map_err(|e| e.to_string())?;
                    slots_imported += 1;
                }
            }
        } else {
            // Backward-compatible legacy QR v1 (`{"v":1,"slots":[...]}`)
            let legacy = sync::import_timetable_qr_string(trimmed)?;
            for slot in legacy {
                let stype = if slot.slot_type.trim().is_empty() { "class".to_string() } else { slot.slot_type.trim().to_lowercase() };
                let (sid, sname, room) = if stype == "class" && !slot.subject_name.trim().is_empty() {
                    ensure_subject(&slot.subject_id, &slot.subject_name, "", &slot.room, 3, false)?
                } else {
                    (String::new(), slot.subject_name.clone(), slot.room.clone())
                };
                let slot_id = Uuid::new_v4().to_string();
                tx.execute("DELETE FROM timetable_slots WHERE semester = ?1 AND day = ?2 AND start_time = ?3", params![semester, slot.day, slot.start_time]).map_err(|e| e.to_string())?;
                tx.execute(
                    "INSERT INTO timetable_slots (id, semester, day, start_time, end_time, subject_id, subject_name, classroom, label, slot_type, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'',?9,?10)",
                    params![slot_id, semester, slot.day, slot.start_time, slot.end_time, sid, sname, room, stype, ts],
                )
                .map_err(|e| e.to_string())?;
                slots_imported += 1;
            }
        }

        Self::append_log_tx(
            &tx,
            "Timetable QR Imported",
            &format!("Sem {}: {} slots ({} courses linked, {} new)", semester, slots_imported, subjects_linked, subjects_created),
        );
        tx.commit().map_err(|e| e.to_string())?;

        Ok(json!({
            "slots_imported": slots_imported,
            "subjects_created": subjects_created,
            "subjects_linked": subjects_linked,
            "periods_imported": periods_imported
        }))
    }

    pub fn save_timetable_slot(&self, semester: i64, slot: &Value) -> Result<Value, String> {
        let day = val_to_string(slot.get("day"));
        let start = val_to_string(slot.get("start_time").or_else(|| slot.get("startTime")));
        let end = val_to_string(slot.get("end_time").or_else(|| slot.get("endTime")));
        let sid = val_to_string(slot.get("subject_id").or_else(|| slot.get("subjectId")));
        let stype = {
            let t = val_to_string(slot.get("type")).to_lowercase();
            if t.is_empty() { "class".to_string() } else { t }
        };
        let label = val_to_string(slot.get("label"));
        let mut room = val_to_string(slot.get("classroom"));
        let mut resolved_room = room.clone();
        let mut sname = val_to_string(slot.get("subject_name"));
        if stype == "class" && !sid.is_empty() {
            if let Ok(Some(sub)) = self.get_subject_by_id(&sid) {
                sname = val_to_string(sub.get("name"));
                resolved_room = val_to_string(sub.get("classroom"));
                room = String::new();
            }
        }
        let id = {
            let g = val_to_string(slot.get("id").or_else(|| slot.get("_id")));
            if g.is_empty() { Uuid::new_v4().to_string() } else { g }
        };
        let ts = now_iso();
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM timetable_slots WHERE semester = ?1 AND day = ?2 AND start_time = ?3 AND id != ?4", params![semester, day, start, id]).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO timetable_slots (id, semester, day, start_time, end_time, subject_id, subject_name, classroom, label, slot_type, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![id, semester, day, start, end, sid, sname, room, label, stype, ts],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({ "id": id, "day": day, "start_time": start, "end_time": end, "subject_id": sid, "subject_name": sname, "classroom": resolved_room, "label": label, "type": stype, "updated_at": ts }))
    }

    pub fn delete_timetable_slot(&self, slot_id: &str, semester: i64, fallback_day: Option<&str>, fallback_start: Option<&str>) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let existing: Option<(String, i64, String, String)> = tx
            .query_row("SELECT id, semester, day, start_time FROM timetable_slots WHERE id = ?1", params![slot_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .optional()
            .map_err(|e| e.to_string())?;
        let mut deleted = tx.execute("DELETE FROM timetable_slots WHERE id = ?1", params![slot_id]).map_err(|e| e.to_string())?;
        if deleted == 0 {
            if let (Some(d), Some(s)) = (fallback_day, fallback_start) {
                deleted = tx.execute("DELETE FROM timetable_slots WHERE semester = ?1 AND day = ?2 AND start_time = ?3", params![semester, d, s]).map_err(|e| e.to_string())?;
            }
        }
        if let Some((fid, fsem, fday, fstart)) = existing {
            Self::record_tombstone_tx(&tx, "timetable_slot", &fid);
            Self::record_tombstone_tx(&tx, "timetable_slot", &format!("{}|{}|{}", fsem, fday, fstart.trim().to_lowercase()));
        } else if deleted > 0 {
            Self::record_tombstone_tx(&tx, "timetable_slot", slot_id);
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(deleted > 0)
    }

    pub fn save_semester_results_batch(&self, enrollment_number: &str, student_info: &Value, semesters: &[Value], source: &str) -> Result<Value, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let dashboard_credits = load_dashboard_credit_rows(&tx);
        let mut prior_manual: HashMap<(i64, String), i64> = HashMap::new();
        if let Ok(mut stmt) = tx.prepare("SELECT semester, subjects_json FROM semester_results") {
            if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))) {
                for (snum, sjson) in rows.flatten() {
                    if let Ok(arr) = serde_json::from_str::<Vec<Value>>(&sjson) {
                        for item in arr {
                            if val_to_string(item.get("credit_source")) == "manual" {
                                let (ck, _) = canonical_subject_code(&val_to_string(item.get("code")));
                                let nk = normalize_lookup_key(&val_to_string(item.get("name")));
                                let cr = val_to_i64(item.get("credits"), -1);
                                if cr >= 0 {
                                    if !ck.is_empty() { prior_manual.insert((snum, ck), cr); }
                                    if !nk.is_empty() { prior_manual.insert((snum, nk), cr); }
                                }
                            }
                        }
                    }
                }
            }
        }
        let ts = now_iso();
        let info_str = serde_json::to_string(student_info).unwrap_or_else(|_| "{}".to_string());

        for sem in semesters {
            let sem_num = val_to_i64(sem.get("semester_num").or_else(|| sem.get("semester")), 0);
            if sem_num <= 0 { continue; }
            let sem_label = {
                let s = val_to_string(sem.get("semester_label"));
                if s.is_empty() { format!("Semester {}", sem_num) } else { s }
            };
            let subjects_raw = sem.get("subjects").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let mut normalized_subs = Vec::new();
            let mut total_credits = 0i64;
            let mut weighted_pts = 0.0f64;
            let mut sum_marks = 0.0f64;
            let mut sum_max = 0.0f64;

            for sub in subjects_raw {
                let name = val_to_string(sub.get("name").or_else(|| sub.get("subject_name")));
                let code = val_to_string(sub.get("code").or_else(|| sub.get("paper_code")));
                let (ck, _) = canonical_subject_code(&code);
                let nk = normalize_lookup_key(&name);
                let manual_c = prior_manual.get(&(sem_num, ck)).or_else(|| prior_manual.get(&(sem_num, nk))).copied();
                let explicit_c = manual_c.or_else(|| {
                    sub.get("credits").and_then(|v| {
                        let p = val_to_i64(Some(v), -1);
                        if p >= 0 { Some(p) } else { None }
                    })
                });
                let stored_src = if manual_c.is_some() {
                    "manual"
                } else {
                    let ps = val_to_string(sub.get("credit_source"));
                    if ps == "manual" { "manual" } else { "portal" }
                };
                let (credits, credit_source, matched_subject_id) =
                    resolve_subject_credits(&dashboard_credits, sem_num, &code, &name, explicit_c, stored_src);

                let internal_str = val_to_string(sub.get("internal"));
                let external_str = val_to_string(sub.get("external"));
                let is_pending = sub.get("is_pending").and_then(|v| v.as_bool()).unwrap_or(false);
                let total_marks = if is_pending {
                    None
                } else if let Some(tm) = sub.get("total_marks").and_then(|v| v.as_f64()) {
                    Some(tm)
                } else {
                    Some(internal_str.trim().parse::<f64>().unwrap_or(0.0) + external_str.trim().parse::<f64>().unwrap_or(0.0))
                };
                let max_marks = val_to_f64(sub.get("max_marks"), 100.0);
                let pct = total_marks.map(|t| if max_marks > 0.0 { (t / max_marks) * 100.0 } else { t }).unwrap_or(0.0);
                let grade = if is_pending {
                    "-".to_string()
                } else {
                    score_to_ipu_grade(pct).to_string()
                };
                let gp = if is_pending { 0 } else { ipu_grade_to_points(&grade) };
                if !is_pending {
                    if credits > 0 {
                        total_credits += credits;
                        weighted_pts += (credits as f64) * (gp as f64);
                    }
                    sum_marks += total_marks.unwrap_or(0.0);
                    sum_max += max_marks;
                }
                normalized_subs.push(json!({
                    "name": name,
                    "code": code,
                    "credits": credits,
                    "credit_source": credit_source,
                    "matched_subject_id": matched_subject_id,
                    "internal": if internal_str.is_empty() { "-".to_string() } else { internal_str },
                    "external": if external_str.is_empty() { "-".to_string() } else { external_str },
                    "total_marks": total_marks,
                    "max_marks": max_marks,
                    "percentage": total_marks.map(|_| (pct * 100.0).round() / 100.0),
                    "grade": grade,
                    "grade_point": if is_pending { Value::Null } else { json!(gp) },
                    "credit_points": if is_pending { Value::Null } else { json!(credits * (gp as i64)) },
                    "status": val_to_string(sub.get("status")),
                    "is_pending": is_pending,
                    "declared_date": sub.get("declared_date").cloned().unwrap_or(Value::Null),
                    "exam_session": sub.get("exam_session").cloned().unwrap_or(Value::Null)
                }));
            }
            let sgpa = if total_credits > 0 { ((weighted_pts / total_credits as f64) * 100.0).round() / 100.0 } else { 0.0 };
            tx.execute(
                "INSERT OR REPLACE INTO semester_results (semester, enrollment_number, semester_label, sgpa, total_credits, total_marks, max_marks, subjects_json, student_info_json, source, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![sem_num, enrollment_number, sem_label, sgpa, total_credits, format!("{:.0}", sum_marks), format!("{:.0}", sum_max), serde_json::to_string(&normalized_subs).unwrap_or_else(|_| "[]".to_string()), info_str, source, ts],
            )
            .map_err(|e| e.to_string())?;
        }

        // Sync fetched IPU student profile info cleanly into app user_profile (name, enrollment, college, course, branch, batch)
        if let Some(info) = student_info.as_object() {
            let max_sem = semesters
                .iter()
                .filter_map(|s| {
                    let n = val_to_i64(s.get("semester_num").or_else(|| s.get("semester")), 0);
                    if n > 0 { Some(n) } else { None }
                })
                .max()
                .unwrap_or(0);
            let name = val_to_string(info.get("name").or_else(|| info.get("stname")));
            let inst = val_to_string(info.get("institution").or_else(|| info.get("institute")).or_else(|| info.get("iname")));
            let prog = val_to_string(info.get("programme").or_else(|| info.get("program")).or_else(|| info.get("prgname")));
            let (parsed_course, parsed_branch) = split_programme_and_branch(&prog);
            let raw_batch = val_to_string(info.get("batch").or_else(|| info.get("byoa")));
            let adm = val_to_string(info.get("admission_year").or_else(|| info.get("yoa")));
            let norm_batch = normalize_batch_from_info(&raw_batch, &adm);
            let enroll = if !enrollment_number.is_empty() {
                enrollment_number.to_string()
            } else {
                val_to_string(info.get("roll_no").or_else(|| info.get("enrollment_number")))
            };

            let _ = tx.execute(
                r#"
                UPDATE user_profile
                SET enrollment_number = CASE WHEN ?1 != '' THEN ?1 ELSE enrollment_number END,
                    name = CASE WHEN ?2 != '' AND (name = 'Student' OR name = '') THEN ?2 ELSE name END,
                    college = CASE WHEN ?3 != '' THEN ?3 ELSE college END,
                    course = CASE WHEN ?4 != '' THEN ?4 ELSE course END,
                    branch = CASE WHEN ?5 != '' THEN ?5 ELSE branch END,
                    batch = CASE WHEN ?6 != '' THEN ?6 ELSE batch END,
                    admission_year = CASE WHEN ?7 != '' THEN ?7 ELSE admission_year END,
                    current_semester = CASE WHEN ?8 > current_semester THEN ?8 ELSE current_semester END,
                    updated_at = ?9
                WHERE id = 1
                "#,
                params![enroll, name, inst, parsed_course, parsed_branch, norm_batch, adm, max_sem, ts],
            );
        }

        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);
        self.get_results_analytics()
    }

    pub fn update_result_subject_credit(&self, semester: i64, code: &str, name: &str, credits: i64) -> Result<Value, String> {
        let clamped = credits.clamp(0, 12);
        let (target_ckey, _) = canonical_subject_code(code);
        let target_nkey = normalize_lookup_key(name);
        let ts = now_iso();

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let subs_str: String = tx
            .query_row("SELECT subjects_json FROM semester_results WHERE semester = ?1", params![semester], |r| r.get(0))
            .map_err(|_| format!("Semester {} results not found", semester))?;
        let mut subs: Vec<Value> = serde_json::from_str(&subs_str).unwrap_or_default();
        let mut updated = false;
        for s in &mut subs {
            let (ck, _) = canonical_subject_code(&val_to_string(s.get("code")));
            let nk = normalize_lookup_key(&val_to_string(s.get("name")));
            if (!target_ckey.is_empty() && ck == target_ckey) || (!target_nkey.is_empty() && nk == target_nkey) {
                if let Some(obj) = s.as_object_mut() {
                    obj.insert("credits".to_string(), json!(clamped));
                    obj.insert("credit_source".to_string(), json!("manual"));
                    updated = true;
                }
            }
        }
        if !updated {
            return Err("Could not find matching paper in semester results".to_string());
        }
        let dash_rows = load_dashboard_credit_rows(&tx);
        if let Some(matched) = find_matching_dashboard_subject(&dash_rows, semester, code, name) {
            let _ = tx.execute("UPDATE subjects SET credits = ?1, updated_at = ?2 WHERE id = ?3", params![clamped, ts, matched.id]);
        }
        // Recompute persisted semester SGPA & total_credits so SQL exports stay exact
        let mut sem_credits = 0i64;
        let mut sem_wpts = 0.0f64;
        for s in &subs {
            if s.get("is_pending").and_then(|v| v.as_bool()).unwrap_or(false) {
                continue;
            }
            let c = val_to_i64(s.get("credits"), 0);
            let gp = s.get("grade_point").and_then(|v| v.as_i64()).unwrap_or_else(|| ipu_grade_to_points(&val_to_string(s.get("grade"))) as i64);
            if c > 0 {
                sem_credits += c;
                sem_wpts += (c as f64) * (gp as f64);
            }
        }
        let recomputed_sgpa = if sem_credits > 0 { ((sem_wpts / sem_credits as f64) * 100.0).round() / 100.0 } else { 0.0 };
        tx.execute(
            "UPDATE semester_results SET subjects_json = ?1, sgpa = ?2, total_credits = ?3, updated_at = ?4 WHERE semester = ?5",
            params![serde_json::to_string(&subs).map_err(|e| e.to_string())?, recomputed_sgpa, sem_credits, ts, semester],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);
        self.get_results_analytics()
    }

    pub fn get_results_analytics(&self) -> Result<Value, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let dashboard_credits = load_dashboard_credit_rows(&conn);
        let mut stmt = conn
            .prepare("SELECT semester, enrollment_number, semester_label, sgpa, subjects_json, student_info_json, updated_at FROM semester_results ORDER BY semester ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, f64>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut semesters = Vec::new();
        let mut enrollment = String::new();
        let mut merged_info = serde_json::Map::new();
        let mut last_updated: Option<String> = None;
        let mut grade_dist: HashMap<String, i64> = HashMap::new();
        let mut cum_weighted_pts = 0.0f64;
        let mut cum_credits = 0i64;
        let mut grand_marks = 0.0f64;
        let mut grand_max = 0.0f64;
        let mut total_subjects = 0usize;
        let mut credits_synced_count = 0usize;

        for row in rows {
            let (sem, enroll, label, stored_sgpa, subs_str, info_str, upd) = row.map_err(|e| e.to_string())?;
            if !enroll.is_empty() { enrollment = enroll; }
            if last_updated.as_deref().map(|p| upd.as_str() > p).unwrap_or(true) { last_updated = Some(upd.clone()); }
            if let Ok(Value::Object(io)) = serde_json::from_str::<Value>(&info_str) {
                for (k, v) in io {
                    let s = val_to_string(Some(&v));
                    if !s.is_empty() && s != "---" { merged_info.insert(k, v); }
                }
            }
            let raw_subs: Vec<Value> = serde_json::from_str(&subs_str).unwrap_or_default();
            let mut live_subs = Vec::with_capacity(raw_subs.len());
            let mut sem_credits = 0i64;
            let mut sem_weighted_pts = 0.0f64;
            let mut sem_marks = 0.0f64;
            let mut sem_max = 0.0f64;

            for mut s in raw_subs {
                total_subjects += 1;
                let code = val_to_string(s.get("code"));
                let name = val_to_string(s.get("name"));
                let pending = s.get("is_pending").and_then(|v| v.as_bool()).unwrap_or(false);
                let prev_source = val_to_string(s.get("credit_source"));
                let stored_c = if prev_source == "portal" || prev_source == "manual" {
                    let v = val_to_i64(s.get("credits"), -1);
                    if v >= 0 { Some(v) } else { None }
                } else {
                    None
                };
                let (live_credits, credit_source, matched_subject_id) =
                    resolve_subject_credits(&dashboard_credits, sem, &code, &name, stored_c, &prev_source);
                if credit_source == "dashboard" || credit_source == "manual" { credits_synced_count += 1; }
                let total_m = s.get("total_marks").and_then(|v| v.as_f64());
                let max_m = val_to_f64(s.get("max_marks"), 100.0);
                let pct_100 = total_m.map(|t| if max_m > 0.0 { (t / max_m) * 100.0 } else { t }).unwrap_or(0.0);
                let live_grade = if pending { "-".to_string() } else if total_m.is_some() { score_to_ipu_grade(pct_100).to_string() } else { val_to_string(s.get("grade")) };
                let gp = if pending { 0 } else { ipu_grade_to_points(&live_grade) };
                if !pending {
                    if !live_grade.is_empty() && live_grade != "-" {
                        *grade_dist.entry(live_grade.clone()).or_insert(0) += 1;
                    }
                    sem_marks += total_m.unwrap_or(0.0);
                    sem_max += max_m;
                    grand_marks += total_m.unwrap_or(0.0);
                    grand_max += max_m;
                    if live_credits > 0 {
                        sem_credits += live_credits;
                        sem_weighted_pts += (live_credits as f64) * (gp as f64);
                    }
                }
                if let Some(obj) = s.as_object_mut() {
                    obj.insert("credits".to_string(), json!(live_credits));
                    obj.insert("credit_source".to_string(), json!(credit_source));
                    if let Some(ref mid) = matched_subject_id {
                        obj.insert("matched_subject_id".to_string(), json!(mid));
                    } else {
                        obj.remove("matched_subject_id");
                    }
                    obj.insert("grade".to_string(), json!(live_grade));
                    obj.insert("grade_point".to_string(), if pending { Value::Null } else { json!(gp) });
                    obj.insert("credit_points".to_string(), if pending { Value::Null } else { json!(live_credits * (gp as i64)) });
                    obj.insert("percentage".to_string(), if pending { Value::Null } else { json!((pct_100 * 100.0).round() / 100.0) });
                }
                live_subs.push(s);
            }
            let sem_sgpa = if sem_credits > 0 { ((sem_weighted_pts / sem_credits as f64) * 100.0).round() / 100.0 } else { (stored_sgpa * 100.0).round() / 100.0 };
            cum_weighted_pts += sem_weighted_pts;
            cum_credits += sem_credits;
            let running_cgpa = if cum_credits > 0 { ((cum_weighted_pts / cum_credits as f64) * 100.0).round() / 100.0 } else { sem_sgpa };
            semesters.push(json!({
                "semester": sem,
                "semester_num": sem,
                "enrollment_number": enrollment,
                "semester_label": if label.is_empty() { format!("Semester {}", sem) } else { label },
                "sgpa": format!("{:.2}", sem_sgpa),
                "cumulative_cgpa": format!("{:.2}", running_cgpa),
                "total_credits": sem_credits,
                "total_grade_points": sem_weighted_pts,
                "total_marks": format!("{:.0}", sem_marks),
                "max_marks": format!("{:.0}", sem_max),
                "subjects": live_subs,
                "updated_at": upd
            }));
        }

        if semesters.is_empty() {
            return Ok(Value::Null);
        }
        // Backfill any missing transcript student_info fields from user_profile so Profile & Results stay linked both ways
        if let Ok((p_name, p_enroll, p_college, p_course, p_branch, p_batch, p_adm)) = conn.query_row(
            "SELECT name, enrollment_number, college, course, branch, batch, admission_year FROM user_profile WHERE id = 1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                ))
            },
        ) {
            if enrollment.is_empty() && !p_enroll.is_empty() {
                enrollment = p_enroll.clone();
            }
            let put_if_missing = |map: &mut serde_json::Map<String, Value>, k: &str, v: &str| {
                let exists = map.get(k).map(|x| !val_to_string(Some(x)).is_empty()).unwrap_or(false);
                if !exists && !v.trim().is_empty() && v.trim() != "Student" {
                    map.insert(k.to_string(), json!(v.trim()));
                }
            };
            put_if_missing(&mut merged_info, "name", &p_name);
            put_if_missing(&mut merged_info, "roll_no", &p_enroll);
            put_if_missing(&mut merged_info, "institution", &p_college);
            let combined_prog = if !p_course.is_empty() && !p_branch.is_empty() {
                format!("{} ({})", p_course.trim(), p_branch.trim())
            } else {
                p_course.clone()
            };
            put_if_missing(&mut merged_info, "programme", &combined_prog);
            put_if_missing(&mut merged_info, "batch", &p_batch);
            put_if_missing(&mut merged_info, "admission_year", &p_adm);
        }
        let cgpa = if cum_credits > 0 { ((cum_weighted_pts / cum_credits as f64) * 100.0).round() / 100.0 } else { 0.0 };
        let strength = if grand_max > 0.0 { ((grand_marks / grand_max) * 1000.0).round() / 10.0 } else { 0.0 };
        Ok(json!({
            "enrollment_number": enrollment,
            "student_info": Value::Object(merged_info),
            "semesters": semesters,
            "cgpa": format!("{:.2}", cgpa),
            "academicStrength": strength,
            "totalCredits": cum_credits,
            "totalGradePoints": cum_weighted_pts,
            "totalSubjects": total_subjects,
            "creditsSyncedCount": credits_synced_count,
            "gradeDistribution": grade_dist,
            "last_updated": last_updated
        }))
    }

    pub fn get_notes(&self) -> Result<Vec<Value>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, title, content, is_todo, todos_json, is_pinned, is_archived, color, category, created_at, updated_at FROM notes ORDER BY is_pinned DESC, updated_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let todos: Value = serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or_else(|_| json!([]));
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "title": r.get::<_, String>(1)?,
                    "content": r.get::<_, String>(2)?,
                    "is_todo": r.get::<_, i64>(3)? != 0,
                    "todos": todos,
                    "is_pinned": r.get::<_, i64>(5)? != 0,
                    "is_archived": r.get::<_, i64>(6)? != 0,
                    "color": r.get::<_, String>(7)?,
                    "category": r.get::<_, String>(8)?,
                    "created_at": r.get::<_, String>(9)?,
                    "updated_at": r.get::<_, String>(10)?
                }))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn save_note(&self, note: &Value) -> Result<Value, String> {
        let id = {
            let g = val_to_string(note.get("id"));
            if g.is_empty() || g.starts_with("temp-") { Uuid::new_v4().to_string() } else { g }
        };
        let ts = now_iso();
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let existing: Option<String> = tx
            .query_row("SELECT created_at FROM notes WHERE id = ?1", params![id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        let title = val_to_string(note.get("title"));
        let title = if title.trim().is_empty() { "Untitled Note".to_string() } else { title };
        let content = val_to_string(note.get("content"));
        let is_todo = if note.get("is_todo").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
        let todos = note.get("todos").filter(|v| v.is_array()).cloned().unwrap_or_else(|| json!([]));
        let is_pinned = if note.get("is_pinned").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
        let is_archived = if note.get("is_archived").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
        let color = val_to_string(note.get("color"));
        let category = val_to_string(note.get("category"));
        let created_at = existing.unwrap_or_else(|| {
            let g = val_to_string(note.get("created_at"));
            if g.is_empty() { ts.clone() } else { g }
        });
        tx.execute(
            "INSERT OR REPLACE INTO notes (id, title, content, is_todo, todos_json, is_pinned, is_archived, color, category, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![id, title, content, is_todo, serde_json::to_string(&todos).unwrap_or_else(|_| "[]".to_string()), is_pinned, is_archived, color, category, created_at, ts],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({
            "id": id, "title": title, "content": content, "is_todo": is_todo != 0,
            "todos": todos, "is_pinned": is_pinned != 0, "is_archived": is_archived != 0,
            "color": color, "category": category, "created_at": created_at, "updated_at": ts
        }))
    }

    pub fn delete_note(&self, id: &str) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let n = tx.execute("DELETE FROM notes WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        if n > 0 {
            Self::record_tombstone_tx(&tx, "note", id);
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(n > 0)
    }

    pub fn get_manual_courses(&self) -> Result<Vec<Value>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, title, platform, url, progress, enrolled_date, target_completion_date, instructor, notes, updated_at FROM manual_courses ORDER BY updated_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let id: String = r.get(0)?;
                Ok(json!({
                    "id": id,
                    "_id": id,
                    "title": r.get::<_, String>(1)?,
                    "platform": r.get::<_, String>(2)?,
                    "url": r.get::<_, String>(3)?,
                    "progress": r.get::<_, i64>(4)?,
                    "enrolledDate": r.get::<_, String>(5)?,
                    "targetCompletionDate": r.get::<_, String>(6)?,
                    "instructor": r.get::<_, String>(7)?,
                    "notes": r.get::<_, String>(8)?,
                    "updated_at": r.get::<_, String>(9)?
                }))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn save_manual_course(&self, course: &Value) -> Result<Value, String> {
        let id = {
            let g = val_to_string(course.get("id").or_else(|| course.get("_id")));
            if g.is_empty() { Uuid::new_v4().to_string() } else { g }
        };
        let title = val_to_string(course.get("title").or_else(|| course.get("name"))).trim().to_string();
        if title.is_empty() {
            return Err("Course title is required".to_string());
        }
        let platform = {
            let p = val_to_string(course.get("platform")).trim().to_lowercase();
            if p.is_empty() { "custom".to_string() } else { p }
        };
        let url = val_to_string(course.get("url")).trim().to_string();
        let progress = val_to_i64(course.get("progress"), 0).clamp(0, 100);
        let enrolled = {
            let e = val_to_string(course.get("enrolledDate").or_else(|| course.get("enrolled_date")));
            if e.is_empty() { Local::now().format("%Y-%m-%d").to_string() } else { e }
        };
        let target_date = val_to_string(course.get("targetCompletionDate").or_else(|| course.get("target_completion_date")));
        let instructor = val_to_string(course.get("instructor"));
        let notes = val_to_string(course.get("notes"));
        let ts = now_iso();

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO manual_courses (id, title, platform, url, progress, enrolled_date, target_completion_date, instructor, notes, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![id, title, platform, url, progress, enrolled, target_date, instructor, notes, ts],
        )
        .map_err(|e| e.to_string())?;
        Self::append_log_tx(&tx, "Course Saved", &format!("{} ({}%)", title, progress));
        tx.commit().map_err(|e| e.to_string())?;

        Ok(json!({
            "id": id,
            "_id": id,
            "title": title,
            "platform": platform,
            "url": url,
            "progress": progress,
            "enrolledDate": enrolled,
            "targetCompletionDate": target_date,
            "instructor": instructor,
            "notes": notes,
            "updated_at": ts
        }))
    }

    pub fn delete_manual_course(&self, id: &str) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let n = tx.execute("DELETE FROM manual_courses WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        if n > 0 {
            Self::record_tombstone_tx(&tx, "manual_course", id);
            Self::append_log_tx(&tx, "Course Deleted", &format!("Removed course {}", id));
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(n > 0)
    }

    pub fn get_system_logs(&self, limit: i64) -> Result<Vec<Value>, String> {
        let lim = limit.clamp(1, 200);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, action, description, timestamp FROM system_logs ORDER BY timestamp DESC LIMIT ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![lim], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "action": r.get::<_, String>(1)?,
                    "description": r.get::<_, String>(2)?,
                    "timestamp": r.get::<_, String>(3)?
                }))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn export_sync_snapshot(&self) -> Result<(String, String, Value), String> {
        let profile = self.get_profile()?;
        let subjects = self.get_subjects(None)?;
        let notes = self.get_notes()?;
        let results = self.get_results_analytics()?;

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut l_stmt = conn
            .prepare("SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs ORDER BY date ASC, timestamp ASC")
            .map_err(|e| e.to_string())?;
        let attendance_logs: Vec<Value> = l_stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "subject_id": r.get::<_, String>(1)?,
                    "subject_name": r.get::<_, String>(2)?,
                    "date": r.get::<_, String>(3)?,
                    "status": r.get::<_, String>(4)?,
                    "type": r.get::<_, String>(5)?,
                    "notes": r.get::<_, String>(6)?,
                    "semester": r.get::<_, i64>(7)?,
                    "substituted_by": r.get::<_, String>(8)?,
                    "timestamp": r.get::<_, String>(9)?
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(l_stmt);

        let mut c_stmt = conn
            .prepare("SELECT id, title, platform, url, progress, enrolled_date, target_completion_date, instructor, notes, updated_at FROM manual_courses ORDER BY updated_at DESC")
            .map_err(|e| e.to_string())?;
        let manual_courses: Vec<Value> = c_stmt
            .query_map([], |r| {
                let id: String = r.get(0)?;
                Ok(json!({
                    "id": id, "title": r.get::<_, String>(1)?, "platform": r.get::<_, String>(2)?,
                    "url": r.get::<_, String>(3)?, "progress": r.get::<_, i64>(4)?,
                    "enrolledDate": r.get::<_, String>(5)?, "targetCompletionDate": r.get::<_, String>(6)?,
                    "instructor": r.get::<_, String>(7)?, "notes": r.get::<_, String>(8)?,
                    "updated_at": r.get::<_, String>(9)?
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(c_stmt);

        let mut t_stmt = conn
            .prepare("SELECT entity, record_key, deleted_at FROM sync_tombstones ORDER BY entity ASC, record_key ASC")
            .map_err(|e| e.to_string())?;
        let tombstones: Vec<Value> = t_stmt
            .query_map([], |r| Ok(json!({ "entity": r.get::<_, String>(0)?, "key": r.get::<_, String>(1)?, "deleted_at": r.get::<_, String>(2)? })))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(t_stmt);
        drop(conn);

        let mut timetables = Vec::new();
        for sem in 1..=8 {
            let tt = self.get_timetable(sem)?;
            let has_slots = tt.get("schedule").and_then(|s| s.as_object()).map(|m| m.values().any(|arr| arr.as_array().map(|a| !a.is_empty()).unwrap_or(false))).unwrap_or(false);
            if has_slots || sem == val_to_i64(profile.get("current_semester"), 1) {
                timetables.push(tt);
            }
        }

        let mut data = json!({
            "user_profile": profile,
            "subjects": subjects,
            "attendance_logs": attendance_logs,
            "timetable": timetables,
            "manual_courses": manual_courses,
            "semester_results": results.get("semesters").cloned().unwrap_or_else(|| json!([])),
            "results_meta": results.get("student_info").cloned().unwrap_or_else(|| json!({})),
            "notes": notes,
            "system_logs": [],
            "tombstones": tombstones
        });

        let mut hashable = data.clone();
        if let Some(obj) = hashable.as_object_mut() {
            obj.remove("system_logs");
            if let Some(p) = obj.get_mut("user_profile").and_then(|v| v.as_object_mut()) {
                p.remove("updated_at");
                p.remove("created_at");
            }
            for k in ["semester_results", "notes", "subjects", "manual_courses", "attendance_logs"] {
                if let Some(arr) = obj.get_mut(k).and_then(|v| v.as_array_mut()) {
                    for item in arr {
                        if let Some(m) = item.as_object_mut() {
                            m.remove("updated_at");
                            m.remove("created_at");
                            m.remove("timestamp");
                        }
                    }
                }
            }
            if let Some(tts) = obj.get_mut("timetable").and_then(|v| v.as_array_mut()) {
                for tt in tts {
                    if let Some(m) = tt.as_object_mut() {
                        m.remove("periods_updated_at");
                        m.remove("updated_at");
                        if let Some(sched) = m.get_mut("schedule").and_then(|v| v.as_object_mut()) {
                            for day_arr in sched.values_mut() {
                                if let Some(slots) = day_arr.as_array_mut() {
                                    for slot in slots {
                                        if let Some(sm) = slot.as_object_mut() { sm.remove("updated_at"); }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        let serialized = serde_json::to_string(&hashable).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        let device_id = self.get_meta("device_id")?.unwrap_or_else(|| "android-default".to_string());

        if let Some(obj) = data.as_object_mut() {
            obj.insert("device_id".to_string(), json!(device_id));
            obj.insert("content_hash".to_string(), json!(hash));
            obj.insert("exported_at".to_string(), json!(now_iso()));
            obj.insert("version".to_string(), json!("2.0"));
        }
        Ok((hash, device_id, data))
    }

    pub fn import_backup_json(&self, raw_json: &Value) -> Result<Value, String> {
        let data = raw_json.get("data").unwrap_or(raw_json);
        let Some(obj) = data.as_object() else {
            return Err("Invalid backup file: expected JSON object.".to_string());
        };
        let has_notes = obj.contains_key("notes");
        let has_results = obj.contains_key("semester_results");
        let ts = now_iso();

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        tx.execute_batch(
            "DELETE FROM attendance_logs; DELETE FROM timetable_slots; DELETE FROM timetable_periods; DELETE FROM subjects; DELETE FROM manual_courses; DELETE FROM sync_tombstones;",
        )
        .map_err(|e| e.to_string())?;
        if has_results { tx.execute("DELETE FROM semester_results", []).map_err(|e| e.to_string())?; }
        if has_notes { tx.execute("DELETE FROM notes", []).map_err(|e| e.to_string())?; }

        // 1. Profile & Safe UI Preferences (syncs attendance_threshold, warning_threshold, PFP & all identity fields!)
        let mut clean_prefs = serde_json::Map::new();
        if let Some(up_arr) = data.get("user_preferences").or_else(|| data.get("user_preference")).and_then(|v| v.as_array()) {
            if let Some(first_pref) = up_arr.first() {
                let inner = first_pref.get("preferences").unwrap_or(first_pref);
                clean_prefs.extend(sanitize_ui_preferences(inner));
            }
        } else if let Some(up_obj) = data.get("user_preferences").or_else(|| data.get("user_preference")).filter(|v| v.is_object()) {
            let inner = up_obj.get("preferences").unwrap_or(up_obj);
            clean_prefs.extend(sanitize_ui_preferences(inner));
        }
        let prof_opt = data
            .get("user_profile")
            .or_else(|| data.get("profile"))
            .or_else(|| data.get("user"))
            .and_then(|v| v.as_object());
        if let Some(prof_prefs) = prof_opt.and_then(|p| p.get("preferences")) {
            clean_prefs.extend(sanitize_ui_preferences(prof_prefs));
        }
        if let Some(top_prefs) = data.get("preferences") {
            clean_prefs.extend(sanitize_ui_preferences(top_prefs));
        }

        if let Some(prof) = prof_opt {
            let prof_upd = {
                let g = val_to_string(prof.get("updated_at"));
                if g.is_empty() { ts.clone() } else { g }
            };
            let att_t = val_to_i64(
                prof.get("attendance_threshold")
                    .or_else(|| prof.get("target_attendance"))
                    .or_else(|| clean_prefs.get("attendance_threshold"))
                    .or_else(|| data.get("preferences").and_then(|p| p.get("attendance_threshold"))),
                75,
            )
            .clamp(1, 100);
            let warn_t = val_to_i64(
                prof.get("warning_threshold")
                    .or_else(|| clean_prefs.get("warning_threshold"))
                    .or_else(|| data.get("preferences").and_then(|p| p.get("warning_threshold"))),
                76,
            )
            .clamp(1, 100);
            tx.execute(
                r#"
                UPDATE user_profile
                SET name = CASE WHEN ?1 != '' THEN ?1 ELSE name END,
                    email = CASE WHEN ?2 != '' THEN ?2 ELSE email END,
                    picture = CASE WHEN ?3 != '' THEN ?3 ELSE picture END,
                    branch = ?4, course = ?5, college = ?6, batch = ?7,
                    enrollment_number = ?8, admission_year = ?9,
                    current_semester = ?10, attendance_threshold = ?11, warning_threshold = ?12,
                    preferences_json = ?13, updated_at = ?14
                WHERE id = 1
                "#,
                params![
                    val_to_string(prof.get("name")),
                    val_to_string(prof.get("email")),
                    val_to_string(prof.get("picture")),
                    val_to_string(prof.get("branch")),
                    val_to_string(prof.get("course")),
                    val_to_string(prof.get("college")),
                    val_to_string(prof.get("batch")),
                    val_to_string(prof.get("enrollment_number")),
                    val_to_string(prof.get("admission_year")),
                    val_to_i64(prof.get("current_semester").or_else(|| prof.get("semester")), 1).clamp(1, 8),
                    att_t,
                    warn_t,
                    serde_json::to_string(&Value::Object(clean_prefs)).unwrap_or_else(|_| "{}".to_string()),
                    prof_upd
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        // 2. Subjects
        let mut id_map: HashMap<String, String> = HashMap::new();
        let mut sub_count = 0usize;
        if let Some(subs) = data.get("subjects").and_then(|v| v.as_array()) {
            for s in subs {
                let old_id = val_to_string(s.get("id").or_else(|| s.get("_id")));
                let new_id = if old_id.is_empty() { Uuid::new_v4().to_string() } else { old_id.clone() };
                if !old_id.is_empty() { id_map.insert(old_id, new_id.clone()); }
                let name = val_to_string(s.get("name"));
                if name.trim().is_empty() { continue; }
                let cats = s.get("categories").filter(|v| v.is_array()).cloned().unwrap_or_else(|| json!(["Theory"]));
                let att = val_to_i64(s.get("attended"), 0).max(0);
                let tot = val_to_i64(s.get("total"), 0).max(att);
                let med = val_to_i64(s.get("medical_leave_count"), 0).max(0);
                let sub_created = { let g = val_to_string(s.get("created_at")); if g.is_empty() { ts.clone() } else { g } };
                let sub_updated = { let g = val_to_string(s.get("updated_at")); if g.is_empty() { ts.clone() } else { g } };
                tx.execute(
                    "INSERT OR REPLACE INTO subjects (id, name, code, professor, classroom, semester, subject_type, categories_json, credits, attended, total, medical_leave_count, target, syllabus, practicals_json, assignments_json, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
                    params![
                        new_id, name, val_to_string(s.get("code")), val_to_string(s.get("professor")),
                        val_to_string(s.get("classroom")), val_to_i64(s.get("semester"), 1).clamp(1, 8),
                        { let t = val_to_string(s.get("type").or_else(|| s.get("subject_type"))); if t.is_empty() { "theory".to_string() } else { t } },
                        serde_json::to_string(&cats).unwrap_or_else(|_| "[\"Theory\"]".to_string()),
                        val_to_i64(s.get("credits"), 3), att, tot, med,
                        val_to_i64(s.get("target"), 75).clamp(1, 100),
                        val_to_string(s.get("syllabus")),
                        serde_json::to_string(&normalize_tracker_json(s.get("practicals"), 10)).unwrap_or_else(|_| "{}".to_string()),
                        serde_json::to_string(&normalize_tracker_json(s.get("assignments"), 4)).unwrap_or_else(|_| "{}".to_string()),
                        sub_created, sub_updated
                    ],
                )
                .map_err(|e| e.to_string())?;
                sub_count += 1;
            }
        }

        // 3. Attendance Logs
        let mut log_count = 0usize;
        let mut seen_logs = HashSet::new();
        if let Some(logs) = data.get("attendance_logs").and_then(|v| v.as_array()) {
            for l in logs {
                let raw_sid = val_to_string(l.get("subject_id").or_else(|| l.get("subjectId")));
                let sid = id_map.get(&raw_sid).cloned().unwrap_or(raw_sid);
                let sub_exists: Option<(String, i64)> = tx
                    .query_row("SELECT name, semester FROM subjects WHERE id = ?1", params![sid], |r| Ok((r.get(0)?, r.get(1)?)))
                    .optional()
                    .map_err(|e| e.to_string())?;
                let Some((sub_name, sub_sem)) = sub_exists else { continue };
                let date_full = val_to_string(l.get("date"));
                let date = if date_full.len() >= 10 { &date_full[..10] } else { &date_full };
                if date.is_empty() { continue; }
                let status = normalize_status(&val_to_string(l.get("status")));
                let ltype = { let t = val_to_string(l.get("type").or_else(|| l.get("log_type"))); if t.is_empty() { "Lecture".to_string() } else { t } };
                if !seen_logs.insert(format!("{}|{}|{}", sid, date, ltype.to_lowercase())) { continue; }
                let lid = { let g = val_to_string(l.get("id").or_else(|| l.get("_id"))); if g.is_empty() { Uuid::new_v4().to_string() } else { g } };
                let lts = { let g = val_to_string(l.get("timestamp")); if g.is_empty() { ts.clone() } else { g } };
                tx.execute(
                    "INSERT OR REPLACE INTO attendance_logs (id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    params![lid, sid, sub_name, date, status, ltype, val_to_string(l.get("notes")), val_to_i64(l.get("semester"), sub_sem), val_to_string(l.get("substituted_by")), lts],
                )
                .map_err(|e| e.to_string())?;
                log_count += 1;
            }
        }

        // 4. Timetables
        let mut slot_count = 0usize;
        if let Some(tts) = data.get("timetable").or_else(|| data.get("timetables")).and_then(|v| v.as_array()) {
            for t in tts {
                let sem = val_to_i64(t.get("semester"), 1).clamp(1, 8);
                if let Some(periods) = t.get("periods").and_then(|v| v.as_array()).filter(|a| !a.is_empty()) {
                    let p_upd = { let g = val_to_string(t.get("periods_updated_at").or_else(|| t.get("updated_at"))); if g.is_empty() { ts.clone() } else { g } };
                    tx.execute(
                        "INSERT OR REPLACE INTO timetable_periods (semester, periods_json, updated_at) VALUES (?1,?2,?3)",
                        params![sem, serde_json::to_string(periods).unwrap_or_else(|_| default_periods_json()), p_upd],
                    )
                    .map_err(|e| e.to_string())?;
                }
                if let Some(sched) = t.get("schedule").and_then(|v| v.as_object()) {
                    for (day, slots_val) in sched {
                        let Some(slots) = slots_val.as_array() else { continue };
                        for slot in slots {
                            let raw_sid = val_to_string(slot.get("subject_id").or_else(|| slot.get("subjectId")));
                            let sid = id_map.get(&raw_sid).cloned().unwrap_or(raw_sid);
                            let id = { let g = val_to_string(slot.get("id").or_else(|| slot.get("_id"))); if g.is_empty() { Uuid::new_v4().to_string() } else { g } };
                            let upd = { let g = val_to_string(slot.get("updated_at")); if g.is_empty() { ts.clone() } else { g } };
                            tx.execute(
                                "INSERT OR REPLACE INTO timetable_slots (id, semester, day, start_time, end_time, subject_id, subject_name, classroom, label, slot_type, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                                params![
                                    id, sem, day,
                                    val_to_string(slot.get("start_time").or_else(|| slot.get("startTime"))),
                                    val_to_string(slot.get("end_time").or_else(|| slot.get("endTime"))),
                                    sid, val_to_string(slot.get("subject_name")), val_to_string(slot.get("classroom")),
                                    val_to_string(slot.get("label")),
                                    { let st = val_to_string(slot.get("type")).to_lowercase(); if st.is_empty() { "class".to_string() } else { st } },
                                    upd
                                ],
                            )
                            .map_err(|e| e.to_string())?;
                            slot_count += 1;
                        }
                    }
                }
            }
        }

        // 5. Notes
        let mut note_count = 0usize;
        if let Some(notes) = data.get("notes").and_then(|v| v.as_array()) {
            for n in notes {
                let id = { let g = val_to_string(n.get("id").or_else(|| n.get("_id"))); if g.is_empty() { Uuid::new_v4().to_string() } else { g } };
                let created = { let g = val_to_string(n.get("created_at")); if g.is_empty() { ts.clone() } else { g } };
                let updated = { let g = val_to_string(n.get("updated_at")); if g.is_empty() { ts.clone() } else { g } };
                let todos = n.get("todos").filter(|v| v.is_array()).cloned().unwrap_or_else(|| json!([]));
                tx.execute(
                    "INSERT OR REPLACE INTO notes (id, title, content, is_todo, todos_json, is_pinned, is_archived, color, category, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                    params![
                        id, val_to_string(n.get("title")), val_to_string(n.get("content")),
                        if n.get("is_todo").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 },
                        serde_json::to_string(&todos).unwrap_or_else(|_| "[]".to_string()),
                        if n.get("is_pinned").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 },
                        if n.get("is_archived").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 },
                        val_to_string(n.get("color")), val_to_string(n.get("category")), created, updated
                    ],
                )
                .map_err(|e| e.to_string())?;
                note_count += 1;
            }
        }

        // 6. Semester Results
        let mut res_count = 0usize;
        if let Some(sems) = data.get("semester_results").and_then(|v| v.as_array()) {
            let meta_info = data.get("results_meta").cloned().unwrap_or_else(|| json!({}));
            for sr in sems {
                let sem = val_to_i64(sr.get("semester").or_else(|| sr.get("semester_num")), 0);
                if sem <= 0 { continue; }
                let upd = { let g = val_to_string(sr.get("updated_at")); if g.is_empty() { ts.clone() } else { g } };
                let enroll = {
                    let e = val_to_string(sr.get("enrollment_number"));
                    if !e.is_empty() { e } else { val_to_string(data.pointer("/user_profile/enrollment_number")) }
                };
                let label = val_to_string(sr.get("semester_label"));
                tx.execute(
                    "INSERT OR REPLACE INTO semester_results (semester, enrollment_number, semester_label, sgpa, total_credits, total_marks, max_marks, subjects_json, student_info_json, source, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'imported',?10)",
                    params![
                        sem, enroll, if label.is_empty() { format!("Semester {}", sem) } else { label },
                        val_to_f64(sr.get("sgpa"), 0.0), val_to_i64(sr.get("total_credits"), 0),
                        val_to_string(sr.get("total_marks")), val_to_string(sr.get("max_marks")),
                        serde_json::to_string(&sr.get("subjects").cloned().unwrap_or_else(|| json!([]))).unwrap_or_else(|_| "[]".to_string()),
                        serde_json::to_string(&sr.get("student_info").cloned().unwrap_or_else(|| meta_info.clone())).unwrap_or_else(|_| "{}".to_string()),
                        upd
                    ],
                )
                .map_err(|e| e.to_string())?;
                res_count += 1;
            }
        }

        // 7. Manual Courses
        if let Some(courses) = data.get("manual_courses").and_then(|v| v.as_array()) {
            for c in courses {
                let id = { let g = val_to_string(c.get("id").or_else(|| c.get("_id"))); if g.is_empty() { Uuid::new_v4().to_string() } else { g } };
                let title = val_to_string(c.get("title").or_else(|| c.get("name")));
                if title.trim().is_empty() { continue; }
                let upd = { let g = val_to_string(c.get("updated_at")); if g.is_empty() { ts.clone() } else { g } };
                tx.execute(
                    "INSERT OR REPLACE INTO manual_courses (id, title, platform, url, progress, enrolled_date, target_completion_date, instructor, notes, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    params![
                        id, title, val_to_string(c.get("platform")), val_to_string(c.get("url")),
                        val_to_i64(c.get("progress"), 0).clamp(0, 100),
                        val_to_string(c.get("enrolledDate")), val_to_string(c.get("targetCompletionDate")),
                        val_to_string(c.get("instructor")), val_to_string(c.get("notes")), upd
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // 8. Tombstones
        if let Some(tombs) = data.get("tombstones").and_then(|v| v.as_array()) {
            for tb in tombs.iter().take(10_000) {
                let entity = val_to_string(tb.get("entity")).trim().to_lowercase();
                let key = val_to_string(tb.get("key")).trim().to_string();
                let del = val_to_string(tb.get("deleted_at")).trim().to_string();
                if !entity.is_empty() && !key.is_empty() && !del.is_empty() {
                    let _ = tx.execute("INSERT OR REPLACE INTO sync_tombstones (entity, record_key, deleted_at) VALUES (?1,?2,?3)", params![entity, key, del]);
                }
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({
            "subjects": sub_count,
            "attendance_logs": log_count,
            "timetable_slots": slot_count,
            "notes": note_count,
            "semester_results": res_count
        }))
    }

    /// Lossless 2-Way CRDT Merge right inside Rust Core:
    /// Exports local snapshot, merges with `remote_snapshot` via `sync::merge_workspace_snapshots`,
    /// atomically applies if changed, and returns `{ changed, new_hash, stats }`.
    pub fn merge_remote_snapshot(&self, remote: &Value) -> Result<Value, String> {
        let (local_hash, _, local_payload) = self.export_sync_snapshot()?;
        let merged = sync::merge_workspace_snapshots(&local_payload, remote)?;
        if merged.changed_from_local {
            self.import_backup_json(&merged.snapshot)?;
            let (new_hash, _, _) = self.export_sync_snapshot()?;
            Ok(json!({
                "changed": true,
                "new_hash": new_hash,
                "stats": merged.stats
            }))
        } else {
            Ok(json!({
                "changed": false,
                "new_hash": local_hash,
                "stats": merged.stats
            }))
        }
    }

    /// 100% offline SQLite-verified Local Academic Intelligence (parity with Desktop AI)
    pub fn query_local_assistant(&self, message: &str, semester: i64) -> Result<Value, String> {
        let q = message.to_lowercase();
        let dash = self.get_dashboard_data(semester)?;
        let subjects = dash.get("subjects").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let summary = dash.get("summary").cloned().unwrap_or_else(|| json!({}));
        let profile = dash.get("user").cloned().unwrap_or_else(|| json!({}));
        let target = val_to_i64(profile.get("attendance_threshold"), 75);
        let overall = val_to_f64(summary.get("overall_percentage"), 0.0);
        let attended = val_to_i64(summary.get("total_attended"), 0);
        let total = val_to_i64(summary.get("total_classes"), 0);
        let safe_bunks = val_to_i64(summary.get("safe_bunks_remaining"), 0);

        let risky: Vec<&Value> = subjects
            .iter()
            .filter(|s| {
                let st = val_to_i64(s.get("total"), 0) - val_to_i64(s.get("medical_leave_count"), 0);
                st > 0 && val_to_f64(s.get("attendance_percentage"), 0.0) < target as f64
            })
            .collect();

        if q.contains("result") || q.contains("cgpa") || q.contains("sgpa") || q.contains("grade") || q.contains("mark") {
            let res = self.get_results_analytics()?;
            if res.is_null() {
                return Ok(json!({
                    "response": "No university results saved offline yet. Open the Results tab and sync from IPU ExamWeb to unlock CGPA & subject insights.",
                    "suggestions": ["How is my attendance margin?", "What classes do I have today?", "Which subjects are below target?"]
                }));
            }
            let mut lines = vec![format!(
                "Academic Transcript Summary\n• Overall CGPA: {} / 10.0\n• Aggregate: {:.1}% across {} semester(s)",
                val_to_string(res.get("cgpa")),
                val_to_f64(res.get("academicStrength"), 0.0),
                res.get("semesters").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0)
            )];
            if let Some(sems) = res.get("semesters").and_then(|v| v.as_array()) {
                for s in sems {
                    lines.push(format!(
                        "• {}: SGPA {} ({} credits)",
                        val_to_string(s.get("semester_label")),
                        val_to_string(s.get("sgpa")),
                        val_to_i64(s.get("total_credits"), 0)
                    ));
                }
            }
            return Ok(json!({
                "response": lines.join("\n"),
                "suggestions": ["Which subjects are below target?", "What classes do I have today?", "Check pending tasks & notes"]
            }));
        }

        if q.contains("today") || q.contains("schedule") || q.contains("timetable") {
            let today_slots = dash.get("today_classes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            if today_slots.is_empty() {
                return Ok(json!({
                    "response": format!("You have no classes scheduled today in Semester {}.", semester),
                    "suggestions": ["How is my attendance margin?", "Show my CGPA breakdown", "Check pending tasks & notes"]
                }));
            }
            let mut lines = vec![format!("Today's Schedule (Semester {})", semester)];
            for s in &today_slots {
                let room = val_to_string(s.get("classroom"));
                let room_s = if room.is_empty() { String::new() } else { format!(" · Room {}", room) };
                lines.push(format!(
                    "• {} ({} – {}{})",
                    val_to_string(s.get("name")),
                    val_to_string(s.get("start_time")),
                    val_to_string(s.get("end_time")),
                    room_s
                ));
            }
            return Ok(json!({
                "response": lines.join("\n"),
                "suggestions": ["Which subjects are below target?", "How is my attendance margin?", "Show my CGPA breakdown"]
            }));
        }

        if q.contains("note") || q.contains("task") || q.contains("todo") || q.contains("practical") {
            let notes = self.get_notes()?;
            let mut open_todos = Vec::new();
            for n in &notes {
                if n.get("is_todo").and_then(|v| v.as_bool()).unwrap_or(false) {
                    if let Some(arr) = n.get("todos").and_then(|v| v.as_array()) {
                        for t in arr {
                            if !t.get("completed").and_then(|v| v.as_bool()).unwrap_or(false) {
                                open_todos.push(val_to_string(t.get("text")));
                            }
                        }
                    }
                }
            }
            let mut lines = vec![format!(
                "Workspace Workload\n• Open Checklist Tasks: {}\n• Saved Notes: {}",
                open_todos.len(),
                notes.len()
            )];
            for t in open_todos.iter().take(5) {
                lines.push(format!("  - {}", t));
            }
            return Ok(json!({
                "response": lines.join("\n"),
                "suggestions": ["How is my attendance margin?", "What classes do I have today?", "Show my CGPA breakdown"]
            }));
        }

        if q.contains("risk") || q.contains("below") || q.contains("recover") || q.contains("bunk") || q.contains("skip") {
            if subjects.is_empty() {
                return Ok(json!({
                    "response": format!("No subjects tracked in Semester {} yet. Add subjects or sync Google Drive in Settings.", semester),
                    "suggestions": ["Show my CGPA breakdown", "Check pending tasks & notes"]
                }));
            }
            if risky.is_empty() {
                return Ok(json!({
                    "response": format!("All {} subjects in Semester {} are safely at or above {}%!\n• Overall: {:.1}% ({}/{})\n• Safe Bunk Buffer: +{} classes", subjects.len(), semester, target, overall, attended, total, safe_bunks),
                    "suggestions": ["What classes do I have today?", "Show my CGPA breakdown"]
                }));
            }
            let mut lines = vec![format!("Recovery Plan (Target: {}%)", target)];
            for s in &risky {
                let sa = (val_to_i64(s.get("attended"), 0) - val_to_i64(s.get("medical_leave_count"), 0)).max(0);
                let st = (val_to_i64(s.get("total"), 0) - val_to_i64(s.get("medical_leave_count"), 0)).max(0);
                let needed = if target >= 100 {
                    st - sa
                } else {
                    let num = (target * st - 100 * sa).max(0);
                    let den = (100 - target).max(1);
                    (num + den - 1) / den
                };
                lines.push(format!(
                    "• {}: {:.1}% ({}/{}) — attend next {} consecutive class(es)",
                    val_to_string(s.get("name")),
                    val_to_f64(s.get("attendance_percentage"), 0.0),
                    sa,
                    st,
                    needed
                ));
            }
            return Ok(json!({
                "response": lines.join("\n"),
                "suggestions": ["What classes do I have today?", "Show my CGPA breakdown"]
            }));
        }

        let mut lines = vec![format!(
            "Semester {} Attendance Snapshot\n• Overall: {:.1}% ({}/{} classes)\n• Target: {}% · Safe Bunks: +{}\n• Below Target: {} / {}",
            semester, overall, attended, total, target, safe_bunks, risky.len(), subjects.len()
        )];
        for s in subjects.iter().take(6) {
            lines.push(format!(
                "• {}: {:.1}% ({}/{})",
                val_to_string(s.get("name")),
                val_to_f64(s.get("attendance_percentage"), 0.0),
                (val_to_i64(s.get("attended"), 0) - val_to_i64(s.get("medical_leave_count"), 0)).max(0),
                (val_to_i64(s.get("total"), 0) - val_to_i64(s.get("medical_leave_count"), 0)).max(0)
            ));
        }
        Ok(json!({
            "response": lines.join("\n"),
            "suggestions": ["Which subjects are below target?", "What classes do I have today?", "Show my CGPA breakdown"]
        }))
    }

    pub fn wipe_all_data(&self) -> Result<Value, String> {
        let ts = now_iso();
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        tx.execute_batch(
            r#"
            DELETE FROM attendance_logs;
            DELETE FROM timetable_slots;
            DELETE FROM timetable_periods;
            DELETE FROM subjects;
            DELETE FROM manual_courses;
            DELETE FROM semester_results;
            DELETE FROM notes;
            DELETE FROM system_logs;
            DELETE FROM sync_tombstones;
            "#,
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            r#"
            UPDATE user_profile
            SET name = 'Student',
                email = '',
                picture = '',
                branch = '',
                course = 'B.Tech',
                college = '',
                batch = '',
                enrollment_number = '',
                admission_year = '',
                current_semester = 1,
                attendance_threshold = 75,
                warning_threshold = 76,
                preferences_json = '{}',
                updated_at = ?1
            WHERE id = 1
            "#,
            params![ts],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({ "message": "All local academic data and profile cleared" }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_v2_full_parity_and_crdt_merge() {
        let android = WorkspaceDb::open_in_memory().unwrap();
        let desktop = WorkspaceDb::open_in_memory().unwrap();

        let sub = android
            .add_subject(&json!({ "name": "EG", "code": "ES-157", "semester": 1, "credits": 0 }))
            .unwrap();
        let sid = sub["id"].as_str().unwrap().to_string();
        android
            .mark_attendance(&sid, "present", "2026-11-26", "", "", Some(1), "class::09:00 AM")
            .unwrap();
        android
            .save_semester_results_batch(
                "00113302725",
                &json!({ "name": "Kuber Bassi" }),
                &[json!({
                    "semester": 1,
                    "subjects": [{ "code": "ES157", "name": "ENGINEERING GRAPHICS - I", "internal": "36", "external": "50", "total_marks": 86.0 }]
                })],
                "ipu_portal",
            )
            .unwrap();

        // 4-tier credit matcher prevents unset 0 on Dashboard from zeroing ES157 -> 1 Cr (Engineering Graphics lab-only)!
        let res = android.get_results_analytics().unwrap();
        assert_eq!(res["semesters"][0]["subjects"][0]["credits"], 1);
        assert_eq!(res["semesters"][0]["subjects"][0]["credit_source"], "ipu_scheme");

        // Verify smart fallback rules when credits are unavailable:
        // Theory -> 3, Lab -> 1, Engineering Graphics -> 1, NUES / HVPE -> 2
        assert_eq!(default_ipu_credits_for_code_and_name("XX301", "Compiler Design").0, 3);
        assert_eq!(default_ipu_credits_for_code_and_name("XX351", "Compiler Design Lab").0, 1);
        assert_eq!(default_ipu_credits_for_code_and_name("XX199", "Engineering Graphics").0, 1);
        assert_eq!(default_ipu_credits_for_code_and_name("XX118", "HVPE (NUES)").0, 2);

        // Mirror to desktop, diverge offline, merge both ways -> identical hashes!
        let (_, _, snap) = android.export_sync_snapshot().unwrap();
        desktop.import_backup_json(&snap).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(8));

        android
            .mark_attendance(&sid, "absent", "2026-11-27", "", "", Some(1), "class::09:00 AM")
            .unwrap();
        desktop
            .update_result_subject_credit(1, "ES157", "ENGINEERING GRAPHICS - I", 1)
            .unwrap();

        let (_, _, a_snap) = android.export_sync_snapshot().unwrap();
        let (_, _, d_snap) = desktop.export_sync_snapshot().unwrap();

        let m_a = android.merge_remote_snapshot(&d_snap).unwrap();
        let m_d = desktop.merge_remote_snapshot(&a_snap).unwrap();
        assert_eq!(m_a["new_hash"], m_d["new_hash"], "Android and Desktop workspaces MUST converge identically");

        let merged_sub = android.get_subject_by_id(&sid).unwrap().unwrap();
        assert_eq!(merged_sub["attended"], 1);
        assert_eq!(merged_sub["total"], 2);
        assert_eq!(merged_sub["credits"], 1);
    }

    #[test]
    fn test_batch_attendance_substitution_and_disk_wal_persistence() {
        let tmp_dir = std::env::temp_dir().join(format!("semester_test_{}", Uuid::new_v4()));
        let db_file = tmp_dir.join("workspace.db");
        let db_path = db_file.to_string_lossy().to_string();

        let (s1_id, s2_id, log1_id) = {
            let db = WorkspaceDb::open(&db_path).unwrap();
            let s1 = db.add_subject(&json!({ "name": "Data Structures", "code": "CIC-209", "semester": 3, "credits": 4 })).unwrap();
            let s2 = db.add_subject(&json!({ "name": "Operating Systems", "code": "CIC-205", "semester": 3, "credits": 4 })).unwrap();
            let s1_id = s1["id"].as_str().unwrap().to_string();
            let s2_id = s2["id"].as_str().unwrap().to_string();

            // Atomic batch mark (All Present)
            let batch_res = db.mark_attendance_batch(
                &[
                    json!({ "subject_id": s1_id, "type": "class::09:00 AM" }),
                    json!({ "subject_id": s2_id, "type": "class::10:00 AM" }),
                ],
                "present",
                "2026-11-27",
                "Bulk test",
                Some(3),
            ).unwrap();
            assert_eq!(batch_res["marked_count"], 2);
            let log1_id = batch_res["logs"][0]["id"].as_str().unwrap().to_string();

            // Edit to Substituted with substituted_by
            let edited = db.edit_attendance_full(&log1_id, "substituted", Some("Prof took OS"), None, Some("Operating Systems")).unwrap();
            assert_eq!(edited["status"], "substituted");
            assert_eq!(edited["substituted_by"], "Operating Systems");

            // Check per-subject history
            let logs = db.get_subject_logs(&s1_id, 20).unwrap();
            assert_eq!(logs.len(), 1);
            assert_eq!(logs[0]["substituted_by"], "Operating Systems");

            db.checkpoint_wal().unwrap();
            (s1_id, s2_id, log1_id)
        };

        // Reopen DB from disk and verify ZERO data loss!
        {
            let reopened = WorkspaceDb::open(&db_path).unwrap();
            let s1 = reopened.get_subject_by_id(&s1_id).unwrap().unwrap();
            let s2 = reopened.get_subject_by_id(&s2_id).unwrap().unwrap();
            assert_eq!(s1["attended"], 1);
            assert_eq!(s1["total"], 1);
            assert_eq!(s2["attended"], 1);
            assert_eq!(s2["total"], 1);

            // Atomic batch unmark
            let del = reopened.delete_attendance_batch(&[log1_id]).unwrap();
            assert_eq!(del["deleted_count"], 1);
            let s1_after = reopened.get_subject_by_id(&s1_id).unwrap().unwrap();
            assert_eq!(s1_after["attended"], 0);
            assert_eq!(s1_after["total"], 0);
        }

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_compact_qr_v2_35_slots_roundtrip_and_auto_subject_linking() {
        let sender = WorkspaceDb::open_in_memory().unwrap();
        let receiver = WorkspaceDb::open_in_memory().unwrap();

        // Populate 6 periods + 6 subjects + 30 class slots + 5 breaks = 35 total slots
        let periods = json!([
            { "id": "p1", "name": "P1", "startTime": "09:00 AM", "endTime": "10:00 AM" },
            { "id": "p2", "name": "P2", "startTime": "10:00 AM", "endTime": "11:00 AM" },
            { "id": "p3", "name": "P3", "startTime": "11:00 AM", "endTime": "12:00 PM" },
            { "id": "p4", "name": "Lunch", "startTime": "12:00 PM", "endTime": "01:00 PM" },
            { "id": "p5", "name": "P5", "startTime": "01:00 PM", "endTime": "02:00 PM" },
            { "id": "p6", "name": "P6", "startTime": "02:00 PM", "endTime": "03:00 PM" }
        ]);
        sender.save_timetable_structure(3, &periods).unwrap();

        let sub_specs = [
            ("Data Structures", "CIC-209", "Room 101"),
            ("Discrete Math", "CIC-205", "Room 102"),
            ("Digital Logic", "ECC-207", "Room 103"),
            ("Computer Org", "CIC-211", "Room 104"),
            ("Computational Methods", "ES-201", "Room 105"),
            ("DS Lab", "CIC-253", "Lab 2"),
        ];
        let mut sub_ids = Vec::new();
        for (name, code, room) in sub_specs {
            let s = sender.add_subject(&json!({ "name": name, "code": code, "classroom": room, "semester": 3, "credits": 4 })).unwrap();
            sub_ids.push((s["id"].as_str().unwrap().to_string(), name.to_string(), room.to_string()));
        }

        let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        let times = [
            ("09:00 AM", "10:00 AM"),
            ("10:00 AM", "11:00 AM"),
            ("11:00 AM", "12:00 PM"),
            ("12:00 PM", "01:00 PM"),
            ("01:00 PM", "02:00 PM"),
            ("02:00 PM", "03:00 PM"),
        ];
        for (d_idx, day) in days.iter().enumerate() {
            for (p_idx, (st, en)) in times.iter().enumerate() {
                if p_idx == 3 {
                    sender.save_timetable_slot(3, &json!({
                        "day": day, "start_time": st, "end_time": en, "type": "break", "label": "Lunch Break"
                    })).unwrap();
                } else {
                    let (ref sid, ref sname, ref sroom) = sub_ids[(d_idx + p_idx) % sub_ids.len()];
                    sender.save_timetable_slot(3, &json!({
                        "day": day, "start_time": st, "end_time": en, "subject_id": sid, "subject_name": sname, "classroom": sroom, "type": "class"
                    })).unwrap();
                }
            }
        }

        let qr_str = sender.export_timetable_qr_v2(3).unwrap();
        assert!(qr_str.starts_with("SEMQR2:"));
        assert!(
            qr_str.len() < 1200,
            "Full 30-slot weekly QR v2 payload must easily fit inside a scannable QR code (got {} bytes)",
            qr_str.len()
        );

        // Receiver already has 1 course with matching code "CIC209" (different formatting!) -> must LINK, not duplicate!
        let existing_ds = receiver.add_subject(&json!({ "name": "DS Theory", "code": "CIC209", "semester": 3, "credits": 4 })).unwrap();
        let existing_ds_id = existing_ds["id"].as_str().unwrap().to_string();

        let imported = receiver.import_timetable_qr_v2(3, &qr_str).unwrap();
        assert_eq!(imported["slots_imported"], 30);
        assert_eq!(imported["periods_imported"], 6);
        assert_eq!(imported["subjects_linked"], 1, "CIC-209 must smart-link to receiver's existing CIC209");
        assert_eq!(imported["subjects_created"], 5, "5 missing courses must auto-create cleanly");

        // Verify EVERY imported class slot can IMMEDIATELY mark attendance with ZERO 'Subject not found' errors!
        let recv_tt = receiver.get_timetable(3).unwrap();
        let mon_slots = recv_tt["schedule"]["Monday"].as_array().unwrap();
        assert_eq!(mon_slots.len(), 6);
        let first_slot_sid = mon_slots[0]["subject_id"].as_str().unwrap();
        assert_eq!(first_slot_sid, existing_ds_id);
        let mark_res = receiver.mark_attendance(first_slot_sid, "present", "2026-11-27", "", "", Some(3), "class::09:00 AM").unwrap();
        assert_eq!(mark_res["attended"], 1);
    }

    #[test]
    fn test_rapid_100_writes_latency_and_accuracy() {
        let db = WorkspaceDb::open_in_memory().unwrap();
        let sub = db.add_subject(&json!({ "name": "Algorithms", "code": "CIC-301", "semester": 5 })).unwrap();
        let sid = sub["id"].as_str().unwrap().to_string();

        let t0 = std::time::Instant::now();
        for i in 1..=100 {
            let status = if i % 4 == 0 { "absent" } else { "present" };
            let date = format!("2026-{:02}-{:02}", 1 + (i / 28), 1 + (i % 28));
            db.mark_attendance(&sid, status, &date, "", "", Some(5), &format!("class::p{}", i)).unwrap();
        }
        let elapsed_ms = t0.elapsed().as_millis();
        assert!(elapsed_ms < 2000, "100 SQLite transactional writes took {}ms (too slow)", elapsed_ms);

        let after = db.get_subject_by_id(&sid).unwrap().unwrap();
        assert_eq!(after["attended"], 75);
        assert_eq!(after["total"], 100);
        assert_eq!(after["attendance_percentage"], 75.0);
    }
}
