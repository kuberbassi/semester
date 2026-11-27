use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{Datelike, Local, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub struct DesktopDb {
    conn: Mutex<Connection>,
    db_path: PathBuf,
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
    // Returns (attended_delta, total_delta, medical_delta)
    // Convention matches Dashboard.tsx & EditSubjectModal.tsx:
    // - physicalAttended = attended - medical_leave_count
    // - eligibleTotal = total - medical_leave_count
    // - rawWithMedicalAsAbsent = physicalAttended / total
    match status.trim().to_lowercase().as_str() {
        "present" | "late" | "duty" | "substituted" => (1, 1, 0),
        "absent" => (0, 1, 0),
        "medical" | "approved_medical" => (1, 1, 1),
        "cancelled" | "excused" => (0, 0, 0),
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
        "cancelled" | "canceled" => "cancelled",
        "excused" => "cancelled",
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
        if let Some(s) = obj.get("$numberDecimal").and_then(|x| x.as_str()).and_then(|x| x.parse::<f64>().ok()) {
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
        let total = val_to_i64(obj.get("total"), default_total).max(0);
        let completed = val_to_i64(obj.get("completed"), 0).max(0);
        let hardcopy = obj.get("hardcopy").and_then(|x| x.as_bool()).unwrap_or(false);
        json!({
            "total": total,
            "completed": completed,
            "hardcopy": hardcopy
        })
    } else {
        json!({
            "total": default_total,
            "completed": 0,
            "hardcopy": false
        })
    }
}

fn sanitize_ui_preferences(raw: &Value) -> serde_json::Map<String, Value> {
    const ALLOWED_PREF_KEYS: &[&str] = &[
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
        for &k in ALLOWED_PREF_KEYS {
            if let Some(v) = obj.get(k) {
                if !v.is_null() {
                    clean.insert(k.to_string(), unwrap_mongo_val(v));
                }
            }
        }
    }
    clean
}

fn is_legacy_auth_log(action: &str) -> bool {
    action.trim().to_lowercase().starts_with("auth_")
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

/// Official GGSIPU Ordinance 11 (CBCS 10-Point Scale) Grade Points:
/// O=10 (90-100), A+=9 (75-89), A=8 (65-74), B+=7 (55-64), B=6 (50-54),
/// C=5 (45-49), P=4 (40-44), F=0 (<40).
fn grade_points(grade: &str) -> u32 {
    match grade.trim().to_uppercase().as_str() {
        "O" => 10,
        "A+" => 9,
        "A" => 8,
        "B+" => 7,
        "B" => 6,
        "C" | "C+" => 5,
        "P" => 4,
        _ => 0,
    }
}

fn score_to_grade(total: f64) -> &'static str {
    if total >= 90.0 {
        "O"
    } else if total >= 75.0 {
        "A+"
    } else if total >= 65.0 {
        "A"
    } else if total >= 55.0 {
        "B+"
    } else if total >= 50.0 {
        "B"
    } else if total >= 45.0 {
        "C"
    } else if total >= 40.0 {
        "P"
    } else {
        "F"
    }
}

fn normalize_lookup_key(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// Normalizes university subject codes like `BS-112`, `bs 112`, `ES-157(P)`, `CIC-209T`
/// into a canonical alphanumeric key (`bs112`, `es157`, `cic209`) plus its numeric suffix (`112`).
fn canonical_subject_code(raw: &str) -> (String, String) {
    let trimmed = raw.trim().to_uppercase();
    // Strip parenthesized suffixes like (T), (P), (L), (LAB)
    let without_parens = trimmed.split('(').next().unwrap_or(&trimmed);
    let mut alnum: String = without_parens
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    if alnum == "sub" || alnum == "na" || alnum == "none" || alnum == "n/a" {
        return (String::new(), String::new());
    }
    // Strip trailing single section/type marker after 3+ digits (e.g. "bs112t" -> "bs112", "es157p" -> "es157")
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
        let last_two = num % 100;
        if (51..=99).contains(&last_two) {
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
            "and" | "of" | "in" | "the" | "for" | "to" | "using" | "with" | "a" | "an" | "i" | "ii" | "iii" | "iv" | "1" | "2" | "3" | "4" => {}
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
            "chem" => expanded.push("chemistry".into()),
            "phy" => expanded.push("physics".into()),
            "dlcd" => expanded.extend(["digital".into(), "logic".into(), "computer".into(), "design".into()]),
            "ds" => expanded.extend(["data".into(), "structures".into()]),
            "dsa" => expanded.extend(["data".into(), "structures".into(), "algorithms".into()]),
            "oop" | "oops" => expanded.extend(["object".into(), "oriented".into(), "programming".into()]),
            "os" => expanded.extend(["operating".into(), "systems".into()]),
            "dbms" => expanded.extend(["database".into(), "management".into(), "systems".into()]),
            "cn" => expanded.extend(["computer".into(), "networks".into()]),
            "daa" => expanded.extend(["design".into(), "analysis".into(), "algorithms".into()]),
            "coa" => expanded.extend(["computer".into(), "organization".into(), "architecture".into()]),
            "toc" => expanded.extend(["theory".into(), "computation".into()]),
            "se" => expanded.extend(["software".into(), "engineering".into()]),
            "cm" => expanded.extend(["computational".into(), "methods".into()]),
            "dm" => expanded.extend(["discrete".into(), "mathematics".into()]),
            "ml" => expanded.extend(["machine".into(), "learning".into()]),
            "ai" => expanded.extend(["artificial".into(), "intelligence".into()]),
            "prac" | "practicals" => expanded.push("lab".into()),
            "technology" => expanded.push("practice".into()),
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

/// Official GGSIPU B.Tech CBCS (2021–2025+) syllabus credit map by normalized code + paper-number rules.
fn default_ipu_credits_for_code_and_name(code: &str, name: &str) -> (i64, &'static str) {
    let (ckey, digits) = canonical_subject_code(code);
    // Exact official GGSIPU B.Tech Sem 1–4 CBCS scheme codes
    let known: Option<i64> = match ckey.as_str() {
        // Sem 1 & 2 Theory
        "bs103" | "bs104" | "bs105" | "bs106" | "bs109" | "bs110" => Some(3),
        "bs111" | "bs112" => Some(4),
        "es101" | "es102" | "es107" | "es108" | "es113" | "es114" => Some(3),
        "es119" => Some(4),
        "hs113" | "hs114" => Some(3),
        "hs115" | "hs116" => Some(2),
        // Sem 1 & 2 Engineering Graphics / Workshop / Labs (1 credit lab-only practicals)
        "es157" | "es158" | "es163" | "es164" => Some(1),
        "bs151" | "bs152" | "bs155" | "bs156" | "bs161" | "bs162" | "es153" | "es154" | "es155"
        | "es156" | "es159" | "es160" => Some(1),
        // Sem 3 & 4 Core CSE/IT/ECE
        "es201" | "cic205" | "cic209" | "ecc207" | "cic211" | "cic206" | "cic208" | "cic210"
        | "cic212" | "bs202" => Some(4),
        "hs201" | "hs202" | "ms201" | "ms202" | "ict201" => Some(3),
        "cic251" | "cic253" | "cic255" | "ecc257" | "es251" | "cic252" | "cic254" | "cic256"
        | "cic258" => Some(1),
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
    // NUES / HVPE / Human Values / Constitution / Ethics / UHV -> 2 credits
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

struct DashboardSubjectCreditRow {
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

fn load_dashboard_credit_rows(conn: &Connection) -> Vec<DashboardSubjectCreditRow> {
    let mut rows_out = Vec::new();
    let Ok(mut stmt) = conn.prepare("SELECT id, semester, code, name, credits FROM subjects") else {
        return rows_out;
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
        return rows_out;
    };
    for (id, semester, code, name, credits) in iter.flatten() {
        let (code_key, code_digits) = canonical_subject_code(&code);
        let tokens = tokenize_expanded_name(&name);
        let acronym = name_acronym(&tokens);
        let roman = extract_roman_part(&name);
        let is_lab = is_lab_or_practical_text(&code_digits, &name);
        rows_out.push(DashboardSubjectCreditRow {
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
    rows_out
}

fn find_matching_dashboard_subject<'a>(
    dashboard_rows: &'a [DashboardSubjectCreditRow],
    semester: i64,
    code: &str,
    name: &str,
) -> Option<&'a DashboardSubjectCreditRow> {
    let (ckey, cdigits) = canonical_subject_code(code);
    let nkey = normalize_lookup_key(name);

    // 1. Exact canonical subject code match in SAME semester (e.g. BS112 <-> BS-112, ES157 <-> ES-157)
    if !ckey.is_empty() {
        if let Some(hit) = dashboard_rows
            .iter()
            .find(|r| r.semester == semester && r.code_key == ckey && r.credits > 0)
            .or_else(|| dashboard_rows.iter().find(|r| r.semester == semester && r.code_key == ckey))
        {
            return Some(hit);
        }
        // 2. Exact canonical subject code match across ANY semester
        if let Some(hit) = dashboard_rows
            .iter()
            .find(|r| r.code_key == ckey && r.credits > 0)
            .or_else(|| dashboard_rows.iter().find(|r| r.code_key == ckey))
        {
            return Some(hit);
        }
    }

    // 3. Exact normalized full name match (same semester first, then any semester)
    if nkey.len() >= 4 {
        if let Some(hit) = dashboard_rows
            .iter()
            .find(|r| r.semester == semester && r.name_key == nkey)
        {
            return Some(hit);
        }
        if let Some(hit) = dashboard_rows.iter().find(|r| r.name_key == nkey) {
            return Some(hit);
        }
    }

    // 4. Smart Acronym + Engineering Abbreviation + Token Similarity Matcher (handles "AM - II" <-> "APPLIED MATHEMATICS - II", "EG" <-> "ENGINEERING GRAPHICS - I", "HV&E" <-> "HUMAN VALUES")
    let target_tokens = tokenize_expanded_name(name);
    let target_set: HashSet<&str> = target_tokens.iter().map(String::as_str).collect();
    let target_acro = name_acronym(&target_tokens);
    let target_roman = extract_roman_part(name);
    let target_is_lab = is_lab_or_practical_text(&cdigits, name);

    let mut best_match: Option<(&DashboardSubjectCreditRow, f64)> = None;
    for r in dashboard_rows {
        // Require same semester for fuzzy name/code-digits matches to prevent cross-semester confusion
        if r.semester != semester {
            continue;
        }
        // Roman numeral parity: never confuse "Applied Math I" with "Applied Math II"
        if let (Some(tr), Some(rr)) = (target_roman, r.roman) {
            if tr != rr {
                continue;
            }
        }
        // Lab/Theory parity: don't mix Theory "AP" with "AP - LAB" (except Graphics/Workshop which often have Lab omitted)
        let graphics_or_ws = target_set.contains("graphics") || target_set.contains("workshop");
        if !graphics_or_ws && r.is_lab != target_is_lab {
            continue;
        }

        let mut score = 0.0f64;

        // Same numeric paper code in same semester even if prefix typo'd (e.g. BS-157 vs ES-157)
        if !cdigits.is_empty() && cdigits.len() >= 3 && r.code_digits == cdigits {
            score = score.max(0.92);
        }

        // Exact acronym match (e.g. "EG" == "eg" from "Engineering Graphics", "AM" == "am")
        if !r.acronym.is_empty() && r.acronym.len() >= 2 && r.acronym == target_acro {
            score = score.max(0.90);
        }

        // Expanded token Jaccard & containment similarity
        if !r.tokens.is_empty() && !target_set.is_empty() {
            let row_set: HashSet<&str> = r.tokens.iter().map(String::as_str).collect();
            let inter = row_set.intersection(&target_set).count() as f64;
            let union = row_set.union(&target_set).count().max(1) as f64;
            let min_sz = row_set.len().min(target_set.len()).max(1) as f64;
            let jaccard = inter / union;
            let contain = inter / min_sz;
            if inter >= 2.0 || (inter >= 1.0 && row_set.len() == 1 && target_set.len() == 1) {
                score = score.max(jaccard.max(contain * 0.88));
            }
        }

        if score >= 0.72 {
            // Prefer subjects that actually have credits > 0 when scores tie
            let tie_bonus = if r.credits > 0 { 0.02 } else { 0.0 };
            let total_score = score + tie_bonus;
            if best_match.map(|(_, prev)| total_score > prev).unwrap_or(true) {
                best_match = Some((r, total_score));
            }
        }
    }

    best_match.map(|(r, _)| r)
}

/// 4-Tier Near-100% Credit Resolver:
/// 1. Explicit manual override saved on Results (`credit_source == "manual"` or `"portal"` with > 0)
/// 2. Matched Attendance Dashboard subject (by unique Subject Code first, then smart Acronym/Name matcher)
///    — NOTE: an unset `0` on a normal credit-bearing Dashboard subject falls through to Tier 3 instead of zeroing GPA!
/// 3. Official GGSIPU B.Tech CBCS scheme lookup by paper code + paper-number lab/theory rules.
fn resolve_subject_credits(
    dashboard_rows: &[DashboardSubjectCreditRow],
    semester: i64,
    code: &str,
    name: &str,
    explicit_stored: Option<i64>,
    stored_source: &str,
) -> (i64, &'static str, Option<String>) {
    let matched = find_matching_dashboard_subject(dashboard_rows, semester, code, name);
    let matched_id = matched.map(|r| r.id.clone());

    // 1. Explicit manual credit set directly in Results UI (respects even explicit 0 for audit courses!)
    if stored_source == "manual" {
        if let Some(c) = explicit_stored.filter(|&v| v >= 0) {
            return (c, "manual", matched_id);
        }
    }

    // 2. Live Dashboard subject match with real credits (> 0, or 0 for audit courses)
    if let Some(hit) = matched {
        if hit.credits > 0 || is_audit_or_non_credit_name(name) {
            return (hit.credits, "dashboard", Some(hit.id.clone()));
        }
    }

    // 3. Explicit portal credits if provided (> 0)
    if stored_source == "portal" {
        if let Some(c) = explicit_stored.filter(|&v| v > 0) {
            return (c, "portal", matched_id);
        }
    }

    // 4. Built-in official GGSIPU B.Tech CBCS scheme lookup + paper-code heuristic
    let (scheme_cr, scheme_src) = default_ipu_credits_for_code_and_name(code, name);
    (scheme_cr, scheme_src, matched_id)
}

impl DesktopDb {
    pub fn open(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create app data directory: {}", e))?;
        }
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
            db_path,
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
            PRAGMA cache_size = -16000;

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
                periods_json TEXT NOT NULL
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
                slot_type TEXT NOT NULL DEFAULT 'class'
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
            CREATE INDEX IF NOT EXISTS idx_syslogs_ts ON system_logs(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_tombstones_deleted ON sync_tombstones(deleted_at);
            "#,
        )
        .map_err(|e| format!("Failed to initialize SQLite schema: {}", e))?;

        // Idempotent schema upgrades for existing Desktop SQLite databases
        let _ = conn.execute(
            "ALTER TABLE timetable_slots ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE timetable_periods ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
            [],
        );

        let ts = now_iso();
        conn.execute(
            r#"
            INSERT OR IGNORE INTO user_profile (id, user_id, name, email, created_at, updated_at)
            VALUES (1, 'local-owner', 'Student', '', ?1, ?1)
            "#,
            params![ts],
        )
        .map_err(|e| e.to_string())?;

        // Initialize sync metadata defaults
        conn.execute(
            "INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('auto_sync_enabled', 'true')",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('device_id', ?1)",
            params![Uuid::new_v4().to_string()],
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

    fn record_tombstone_tx(tx: &rusqlite::Transaction<'_>, entity: &str, record_key: &str) {
        let key = record_key.trim();
        if key.is_empty() {
            return;
        }
        let _ = tx.execute(
            "INSERT OR REPLACE INTO sync_tombstones (entity, record_key, deleted_at) VALUES (?1, ?2, ?3)",
            params![entity, key, now_iso()],
        );
    }

    /// Garbage-collects tombstones older than `max_age_days` locally so `sync_tombstones` stays tiny.
    pub fn prune_old_tombstones(&self, max_age_days: i64) -> Result<usize, String> {
        let cutoff = (Utc::now() - chrono::Duration::days(max_age_days.max(1))).to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let removed = conn
            .execute("DELETE FROM sync_tombstones WHERE deleted_at < ?1", params![cutoff])
            .map_err(|e| e.to_string())?;
        Ok(removed)
    }

    pub fn get_meta(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM sync_meta WHERE key = ?1",
            params![key],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn set_meta(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_meta(&self, key: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM sync_meta WHERE key = ?1", params![key])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Reads and decrypts a Windows DPAPI-protected secret from `sync_meta`.
    pub fn get_secret(&self, key: &str) -> Result<Option<String>, String> {
        match self.get_meta(key)? {
            Some(stored) if !stored.is_empty() => Ok(Some(crate::crypto::unprotect_secret(&stored)?)),
            _ => Ok(None),
        }
    }

    /// Encrypts a secret with Windows DPAPI before storing it in `sync_meta`.
    pub fn set_secret(&self, key: &str, plaintext: &str) -> Result<(), String> {
        let protected = crate::crypto::protect_secret(plaintext)?;
        self.set_meta(key, &protected)
    }

    pub fn delete_secret(&self, key: &str) -> Result<(), String> {
        self.delete_meta(key)
    }

    /// Creates an atomic safety backup snapshot of the SQLite database file on disk
    /// before destructive imports/restores/wipes to prevent mid-save corruption.
    pub fn create_safety_snapshot(&self, tag: &str) -> Result<PathBuf, String> {
        let backups_dir = self
            .db_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("safety_backups");
        std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
        let fname = format!("semester_{}_{}.db", tag, Utc::now().format("%Y%m%d_%H%M%S"));
        let target = backups_dir.join(fname);
        let escaped = target.to_string_lossy().replace('\'', "''");
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(&format!("VACUUM INTO '{}';", escaped))
            .map_err(|e| format!("Failed to create safety snapshot: {}", e))?;
        drop(conn);

        // Retain at most the 10 most recent local safety snapshots to prevent unbounded disk growth
        if let Ok(entries) = std::fs::read_dir(&backups_dir) {
            let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
                .flatten()
                .filter_map(|e| {
                    let p = e.path();
                    if p.extension().and_then(|x| x.to_str()) == Some("db") {
                        let mtime = e.metadata().ok()?.modified().ok()?;
                        Some((mtime, p))
                    } else {
                        None
                    }
                })
                .collect();
            files.sort_by(|a, b| b.0.cmp(&a.0));
            for (_, old_path) in files.into_iter().skip(10) {
                let _ = std::fs::remove_file(old_path);
            }
        }
        Ok(target)
    }

    // ─── PROFILE & PREFERENCES ───────────────────────────────────────────────

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
                let sem: i64 = r.get(10)?;
                let prefs_str: String = r.get(13)?;
                let prefs: Value = serde_json::from_str(&prefs_str).unwrap_or_else(|_| json!({}));
                Ok(json!({
                    "_id": r.get::<_, String>(0)?,
                    "id": r.get::<_, String>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "email": r.get::<_, String>(2)?,
                    "picture": r.get::<_, String>(3)?,
                    "branch": r.get::<_, String>(4)?,
                    "course": r.get::<_, String>(5)?,
                    "college": r.get::<_, String>(6)?,
                    "batch": r.get::<_, String>(7)?,
                    "enrollment_number": r.get::<_, String>(8)?,
                    "admission_year": r.get::<_, String>(9)?,
                    "semester": sem,
                    "current_semester": sem,
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
        let mut current = self.get_profile()?;
        let map = current.as_object_mut().ok_or("Invalid profile state")?;
        if let Some(p) = patch.as_object() {
            for k in [
                "name",
                "email",
                "picture",
                "branch",
                "course",
                "college",
                "batch",
                "enrollment_number",
                "admission_year",
            ] {
                if let Some(v) = p.get(k) {
                    if !v.is_null() {
                        map.insert(k.to_string(), json!(val_to_string(Some(v))));
                    }
                }
            }
            if let Some(v) = p.get("current_semester").or_else(|| p.get("semester")) {
                let s = val_to_i64(Some(v), 1).clamp(1, 8);
                map.insert("current_semester".to_string(), json!(s));
                map.insert("semester".to_string(), json!(s));
            }
            if let Some(v) = p.get("attendance_threshold").or_else(|| p.get("target_attendance")) {
                let t = val_to_i64(Some(v), 75).clamp(1, 100);
                map.insert("attendance_threshold".to_string(), json!(t));
            }
            if let Some(v) = p.get("warning_threshold") {
                let w = val_to_i64(Some(v), 76).clamp(1, 100);
                map.insert("warning_threshold".to_string(), json!(w));
            }
        }

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let ts = now_iso();
        tx.execute(
            r#"
            UPDATE user_profile
            SET name = ?1, email = ?2, picture = ?3, branch = ?4, course = ?5,
                college = ?6, batch = ?7, enrollment_number = ?8, admission_year = ?9,
                current_semester = ?10, attendance_threshold = ?11, warning_threshold = ?12,
                updated_at = ?13
            WHERE id = 1
            "#,
            params![
                val_to_string(map.get("name")),
                val_to_string(map.get("email")),
                val_to_string(map.get("picture")),
                val_to_string(map.get("branch")),
                val_to_string(map.get("course")),
                val_to_string(map.get("college")),
                val_to_string(map.get("batch")),
                val_to_string(map.get("enrollment_number")),
                val_to_string(map.get("admission_year")),
                val_to_i64(map.get("current_semester"), 1),
                val_to_i64(map.get("attendance_threshold"), 75),
                val_to_i64(map.get("warning_threshold"), 76),
                ts
            ],
        )
        .map_err(|e| e.to_string())?;
        Self::append_log_tx(&tx, "Profile Updated", "Updated student profile and preferences");
        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);
        self.get_profile()
    }

    pub fn get_preferences(&self) -> Result<Value, String> {
        let prof = self.get_profile()?;
        let mut prefs = prof
            .get("preferences")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();
        prefs.insert(
            "attendance_threshold".to_string(),
            prof.get("attendance_threshold").cloned().unwrap_or(json!(75)),
        );
        prefs.insert(
            "warning_threshold".to_string(),
            prof.get("warning_threshold").cloned().unwrap_or(json!(76)),
        );
        Ok(Value::Object(prefs))
    }

    pub fn update_preferences(&self, patch: &Value) -> Result<Value, String> {
        let mut prefs = self.get_preferences()?;
        if let (Some(dst), Some(src)) = (prefs.as_object_mut(), patch.as_object()) {
            for (k, v) in src {
                dst.insert(k.clone(), v.clone());
            }
        }
        let att_t = patch.get("attendance_threshold").map(|v| val_to_i64(Some(v), 75).clamp(1, 100));
        let warn_t = patch.get("warning_threshold").map(|v| val_to_i64(Some(v), 76).clamp(1, 100));

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let prefs_str = serde_json::to_string(&prefs).unwrap_or_else(|_| "{}".to_string());
        conn.execute(
            r#"
            UPDATE user_profile
            SET preferences_json = ?1,
                attendance_threshold = COALESCE(?2, attendance_threshold),
                warning_threshold = COALESCE(?3, warning_threshold),
                updated_at = ?4
            WHERE id = 1
            "#,
            params![prefs_str, att_t, warn_t, now_iso()],
        )
        .map_err(|e| e.to_string())?;
        Ok(prefs)
    }

    // ─── SUBJECTS ────────────────────────────────────────────────────────────

    fn map_subject_row(r: &rusqlite::Row<'_>, default_target: i64) -> rusqlite::Result<Value> {
        let id: String = r.get(0)?;
        let name: String = r.get(1)?;
        let code: String = r.get(2)?;
        let professor: String = r.get(3)?;
        let classroom: String = r.get(4)?;
        let semester: i64 = r.get(5)?;
        let subject_type: String = r.get(6)?;
        let categories_str: String = r.get(7)?;
        let credits: i64 = r.get(8)?;
        let attended: i64 = r.get(9)?;
        let total: i64 = r.get(10)?;
        let med: i64 = r.get(11)?;
        let target: i64 = r.get::<_, i64>(12).unwrap_or(default_target);
        let syllabus: String = r.get(13)?;
        let practicals_str: String = r.get(14)?;
        let assignments_str: String = r.get(15)?;
        let created_at: String = r.get::<_, String>(16).unwrap_or_default();
        let updated_at: String = r.get::<_, String>(17).unwrap_or_default();

        let categories: Value = serde_json::from_str(&categories_str).unwrap_or_else(|_| json!(["Theory"]));
        let practicals: Value = serde_json::from_str(&practicals_str)
            .unwrap_or_else(|_| json!({ "total": 10, "completed": 0, "hardcopy": false }));
        let assignments: Value = serde_json::from_str(&assignments_str)
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
                    r#"
                    SELECT id, name, code, professor, classroom, semester, subject_type,
                           categories_json, credits, attended, total, medical_leave_count,
                           target, syllabus, practicals_json, assignments_json, created_at, updated_at
                    FROM subjects WHERE semester = ?1 ORDER BY name ASC
                    "#,
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![sem], |r| Self::map_subject_row(r, default_target))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        } else {
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT id, name, code, professor, classroom, semester, subject_type,
                           categories_json, credits, attended, total, medical_leave_count,
                           target, syllabus, practicals_json, assignments_json, created_at, updated_at
                    FROM subjects ORDER BY semester ASC, name ASC
                    "#,
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
            r#"
            SELECT id, name, code, professor, classroom, semester, subject_type,
                   categories_json, credits, attended, total, medical_leave_count,
                   target, syllabus, practicals_json, assignments_json, created_at, updated_at
            FROM subjects WHERE id = ?1
            "#,
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
            let given = val_to_string(payload.get("id").or_else(|| payload.get("_id")));
            if given.is_empty() {
                Uuid::new_v4().to_string()
            } else {
                given
            }
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
        let cats_str = serde_json::to_string(&categories_val).unwrap_or_else(|_| "[\"Theory\"]".to_string());
        let is_prac = categories_val
            .as_array()
            .map(|a| a.iter().any(|x| x.as_str() == Some("Practical")))
            .unwrap_or(false);
        let subject_type = {
            let given = val_to_string(payload.get("type"));
            if given.is_empty() {
                if is_prac { "practical".to_string() } else { "theory".to_string() }
            } else {
                given
            }
        };
        let target = val_to_i64(payload.get("target"), 75).clamp(1, 100);
        let ts = now_iso();

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        tx.execute(
            r#"
            INSERT INTO subjects (
                id, name, code, professor, classroom, semester, subject_type,
                categories_json, credits, attended, total, medical_leave_count,
                target, syllabus, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 0, 0, ?10, '', ?11, ?11)
            "#,
            params![id, name, code, professor, classroom, semester, subject_type, cats_str, credits, target, ts],
        )
        .map_err(|e| e.to_string())?;
        Self::append_log_tx(&tx, "Subject Added", &format!("Created subject {} (Semester {})", name, semester));
        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);

        self.get_subject_by_id(&id)?
            .ok_or_else(|| "Failed to load created subject".to_string())
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
        let code = patch
            .get("code")
            .map(|v| val_to_string(Some(v)))
            .unwrap_or_else(|| val_to_string(existing.get("code")));
        let professor = patch
            .get("professor")
            .map(|v| val_to_string(Some(v)))
            .unwrap_or_else(|| val_to_string(existing.get("professor")));
        let classroom = patch
            .get("classroom")
            .map(|v| val_to_string(Some(v)))
            .unwrap_or_else(|| val_to_string(existing.get("classroom")));
        let syllabus = patch
            .get("syllabus")
            .map(|v| val_to_string(Some(v)))
            .unwrap_or_else(|| val_to_string(existing.get("syllabus")));
        let semester = patch
            .get("semester")
            .map(|v| val_to_i64(Some(v), 1).clamp(1, 8))
            .unwrap_or_else(|| val_to_i64(existing.get("semester"), 1));
        let credits = patch
            .get("credits")
            .map(|v| val_to_i64(Some(v), 3).clamp(0, 12))
            .unwrap_or_else(|| val_to_i64(existing.get("credits"), 3));
        let med_count = val_to_i64(existing.get("medical_leave_count"), 0);

        // EditSubjectModal passes `attended` as physical attended (excluding medical) and `total` as raw total
        let raw_total = patch
            .get("total")
            .map(|v| val_to_i64(Some(v), 0).max(med_count))
            .unwrap_or_else(|| val_to_i64(existing.get("total"), 0));
        let raw_attended = if let Some(att_val) = patch.get("attended") {
            let physical = val_to_i64(Some(att_val), 0).max(0);
            (physical + med_count).min(raw_total)
        } else {
            val_to_i64(existing.get("attended"), 0).min(raw_total)
        };

        let categories_val = patch
            .get("categories")
            .filter(|v| v.is_array())
            .cloned()
            .unwrap_or_else(|| existing.get("categories").cloned().unwrap_or_else(|| json!(["Theory"])));
        let cats_str = serde_json::to_string(&categories_val).unwrap_or_else(|_| "[\"Theory\"]".to_string());

        let mut practicals = existing
            .get("practicals")
            .cloned()
            .unwrap_or_else(|| json!({ "total": 10, "completed": 0, "hardcopy": false }));
        if let Some(p_obj) = patch.get("practicals").and_then(|v| v.as_object()) {
            if let Some(dst) = practicals.as_object_mut() {
                for (k, v) in p_obj {
                    dst.insert(k.clone(), v.clone());
                }
            }
        }
        if let Some(pt) = patch.get("practical_total") {
            if let Some(dst) = practicals.as_object_mut() {
                dst.insert("total".to_string(), json!(val_to_i64(Some(pt), 10).max(1)));
            }
        }

        let mut assignments = existing
            .get("assignments")
            .cloned()
            .unwrap_or_else(|| json!({ "total": 4, "completed": 0, "hardcopy": false }));
        if let Some(a_obj) = patch.get("assignments").and_then(|v| v.as_object()) {
            if let Some(dst) = assignments.as_object_mut() {
                for (k, v) in a_obj {
                    dst.insert(k.clone(), v.clone());
                }
            }
        }
        if let Some(at) = patch.get("assignment_total") {
            if let Some(dst) = assignments.as_object_mut() {
                dst.insert("total".to_string(), json!(val_to_i64(Some(at), 4).max(1)));
            }
        }

        let prac_str = serde_json::to_string(&practicals).unwrap_or_else(|_| "{}".to_string());
        let asgn_str = serde_json::to_string(&assignments).unwrap_or_else(|_| "{}".to_string());

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        tx.execute(
            r#"
            UPDATE subjects
            SET name = ?1, code = ?2, professor = ?3, classroom = ?4, semester = ?5,
                categories_json = ?6, credits = ?7, attended = ?8, total = ?9,
                syllabus = ?10, practicals_json = ?11, assignments_json = ?12, updated_at = ?13
            WHERE id = ?14
            "#,
            params![
                name,
                code,
                professor,
                classroom,
                semester,
                cats_str,
                credits,
                raw_attended,
                raw_total,
                syllabus,
                prac_str,
                asgn_str,
                now_iso(),
                subject_id
            ],
        )
        .map_err(|e| e.to_string())?;
        // Keep subject_name & live classroom in sync on timetable slots & attendance logs
        let _ = tx.execute(
            "UPDATE timetable_slots SET subject_name = ?1 WHERE subject_id = ?2",
            params![name, subject_id],
        );
        let _ = tx.execute(
            "UPDATE timetable_slots SET classroom = '' WHERE subject_id = ?1 AND slot_type = 'class'",
            params![subject_id],
        );
        let _ = tx.execute(
            "UPDATE attendance_logs SET subject_name = ?1 WHERE subject_id = ?2",
            params![name, subject_id],
        );
        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);

        self.get_subject_by_id(subject_id)?
            .ok_or_else(|| "Subject not found after update".to_string())
    }

    pub fn delete_subject(&self, subject_id: &str) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let name: Option<String> = tx
            .query_row("SELECT name FROM subjects WHERE id = ?1", params![subject_id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        let deleted = tx
            .execute("DELETE FROM subjects WHERE id = ?1", params![subject_id])
            .map_err(|e| e.to_string())?;
        let _ = tx.execute("DELETE FROM timetable_slots WHERE subject_id = ?1", params![subject_id]);
        if deleted > 0 {
            Self::record_tombstone_tx(&tx, "subject", subject_id);
        }
        if let Some(n) = name {
            Self::append_log_tx(&tx, "Subject Deleted", &format!("Removed subject {}", n));
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(deleted > 0)
    }

    // ─── ATTENDANCE ──────────────────────────────────────────────────────────

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
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;

        let (sub_name, sub_sem, cur_att, cur_tot, cur_med): (String, i64, i64, i64, i64) = tx
            .query_row(
                "SELECT name, semester, attended, total, medical_leave_count FROM subjects WHERE id = ?1",
                params![subject_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .map_err(|_| "Subject not found".to_string())?;

        let sem = semester_opt.unwrap_or(sub_sem);

        // Check existing log on same (subject_id, date, log_type) to avoid duplicate double-counting
        let existing: Option<(String, String)> = tx
            .query_row(
                "SELECT id, status FROM attendance_logs WHERE subject_id = ?1 AND date = ?2 AND log_type = ?3 LIMIT 1",
                params![subject_id, clean_date, clean_type],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let (log_id, new_att, new_tot, new_med, was_duplicate) = if let Some((eid, old_status)) = existing {
            let (oa, ot, om) = status_deltas(&old_status);
            let (na, nt, nm) = status_deltas(status);
            let next_att = (cur_att - oa + na).max(0);
            let next_tot = (cur_tot - ot + nt).max(0);
            let next_med = (cur_med - om + nm).max(0);
            // Preserve `subjects.updated_at` so marking attendance never overrides metadata edits on another device
            tx.execute(
                "UPDATE subjects SET attended = ?1, total = ?2, medical_leave_count = ?3 WHERE id = ?4",
                params![next_att, next_tot, next_med, subject_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE attendance_logs SET status = ?1, notes = ?2, substituted_by = ?3, timestamp = ?4 WHERE id = ?5",
                params![status, notes, substituted_by, now_iso(), eid],
            )
            .map_err(|e| e.to_string())?;
            (eid, next_att, next_tot, next_med, true)
        } else {
            let new_id = Uuid::new_v4().to_string();
            let (na, nt, nm) = status_deltas(status);
            let next_att = (cur_att + na).max(0);
            let next_tot = (cur_tot + nt).max(0);
            let next_med = (cur_med + nm).max(0);
            // Preserve `subjects.updated_at` so marking attendance never overrides metadata edits on another device
            tx.execute(
                "UPDATE subjects SET attended = ?1, total = ?2, medical_leave_count = ?3 WHERE id = ?4",
                params![next_att, next_tot, next_med, subject_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                r#"
                INSERT INTO attendance_logs (id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
                params![new_id, subject_id, sub_name, clean_date, status, clean_type, notes, sem, substituted_by, now_iso()],
            )
            .map_err(|e| e.to_string())?;
            (new_id, next_att, next_tot, next_med, false)
        };

        Self::append_log_tx(
            &tx,
            "Attendance Marked",
            &format!("{} marked {} on {}", sub_name, status, clean_date),
        );
        tx.commit().map_err(|e| e.to_string())?;

        let pct = calc_pct((new_att - new_med).max(0), (new_tot - new_med).max(0));
        Ok(json!({
            "message": format!("Marked {}", status),
            "duplicate": was_duplicate,
            "subject_id": subject_id,
            "date": clean_date,
            "status": status,
            "attended": new_att,
            "total": new_tot,
            "percentage": pct,
            "log": {
                "_id": log_id,
                "id": log_id,
                "subject_id": subject_id,
                "subject_name": sub_name,
                "date": clean_date,
                "status": status,
                "type": clean_type,
                "notes": notes,
                "semester": sem,
                "substituted_by": substituted_by,
                "timestamp": now_iso()
            }
        }))
    }

    pub fn edit_attendance(&self, log_id: &str, status_raw: &str, notes: Option<&str>, date: Option<&str>) -> Result<Value, String> {
        let status = normalize_status(status_raw);
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;

        let (subject_id, sub_name, old_status, old_date, old_notes, log_type, sem): (String, String, String, String, String, String, i64) = tx
            .query_row(
                "SELECT subject_id, subject_name, status, date, notes, log_type, semester FROM attendance_logs WHERE id = ?1",
                params![log_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
            )
            .map_err(|_| "Attendance log not found".to_string())?;

        let (oa, ot, om) = status_deltas(&old_status);
        let (na, nt, nm) = status_deltas(status);
        let (cur_att, cur_tot, cur_med): (i64, i64, i64) = tx
            .query_row(
                "SELECT attended, total, medical_leave_count FROM subjects WHERE id = ?1",
                params![subject_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap_or((0, 0, 0));

        let next_att = (cur_att - oa + na).max(0);
        let next_tot = (cur_tot - ot + nt).max(0);
        let next_med = (cur_med - om + nm).max(0);
        let next_date = date.map(|d| if d.len() >= 10 { &d[..10] } else { d }).unwrap_or(&old_date);
        let next_notes = notes.unwrap_or(&old_notes);

        tx.execute(
            "UPDATE subjects SET attended = ?1, total = ?2, medical_leave_count = ?3 WHERE id = ?4",
            params![next_att, next_tot, next_med, subject_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE attendance_logs SET status = ?1, notes = ?2, date = ?3, timestamp = ?4 WHERE id = ?5",
            params![status, next_notes, next_date, now_iso(), log_id],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;

        Ok(json!({
            "message": "Attendance updated",
            "log": {
                "_id": log_id,
                "id": log_id,
                "subject_id": subject_id,
                "subject_name": sub_name,
                "date": next_date,
                "status": status,
                "type": log_type,
                "notes": next_notes,
                "semester": sem
            }
        }))
    }

    pub fn delete_attendance(&self, log_id: &str) -> Result<Value, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;

        let row: Option<(String, String, String, String, String)> = tx
            .query_row(
                "SELECT subject_id, subject_name, status, date, log_type FROM attendance_logs WHERE id = ?1",
                params![log_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some((subject_id, sub_name, old_status, date, log_type)) = row {
            let (oa, ot, om) = status_deltas(&old_status);
            tx.execute(
                r#"
                UPDATE subjects
                SET attended = MAX(0, attended - ?1),
                    total = MAX(0, total - ?2),
                    medical_leave_count = MAX(0, medical_leave_count - ?3)
                WHERE id = ?4
                "#,
                params![oa, ot, om, subject_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM attendance_logs WHERE id = ?1", params![log_id])
                .map_err(|e| e.to_string())?;
            let clean_date = if date.len() >= 10 { &date[..10] } else { &date };
            let clean_type = if log_type.trim().is_empty() { "lecture".to_string() } else { log_type.trim().to_lowercase() };
            let nat_key = format!("{}|{}|{}", subject_id, clean_date, clean_type);
            Self::record_tombstone_tx(&tx, "attendance_log", log_id);
            Self::record_tombstone_tx(&tx, "attendance_log", &nat_key);
            Self::append_log_tx(
                &tx,
                "Attendance Cleared",
                &format!("Removed {} mark for {} on {}", old_status, sub_name, date),
            );
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({ "message": "Attendance deleted" }))
    }

    pub fn mark_all_attendance(&self, classes: &[Value], status_raw: &str, date: &str, semester: i64) -> Result<Value, String> {
        let mut logs = Vec::new();
        for cls in classes {
            let sid = val_to_string(cls.get("subject_id"));
            if sid.is_empty() {
                continue;
            }
            let typ = val_to_string(cls.get("type"));
            let res = self.mark_attendance(&sid, status_raw, date, "", "", Some(semester), &typ)?;
            if let Some(log) = res.get("log") {
                logs.push(log.clone());
            }
        }
        Ok(json!({
            "marked_count": logs.len(),
            "activity_id": Uuid::new_v4().to_string(),
            "logs": logs
        }))
    }

    pub fn unmark_attendance_logs(&self, log_ids: &[String]) -> Result<Value, String> {
        let mut deleted_count = 0usize;
        for lid in log_ids {
            if self.delete_attendance(lid).is_ok() {
                deleted_count += 1;
            }
        }
        Ok(json!({
            "deleted_count": deleted_count,
            "requested_count": log_ids.len()
        }))
    }

    pub fn get_calendar_data(&self, year: i32, month: u32, semester: Option<i64>) -> Result<Vec<Value>, String> {
        let prefix = format!("{:04}-{:02}-%", year, month);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let map_row = |r: &rusqlite::Row<'_>| -> rusqlite::Result<Value> {
            let id: String = r.get(0)?;
            Ok(json!({
                "_id": id,
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
                .prepare(
                    r#"
                    SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp
                    FROM attendance_logs
                    WHERE date LIKE ?1 AND semester = ?2
                    ORDER BY date ASC, timestamp ASC
                    "#,
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![prefix, sem], map_row).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        } else {
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp
                    FROM attendance_logs
                    WHERE date LIKE ?1
                    ORDER BY date ASC, timestamp ASC
                    "#,
                )
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
                "_id": id,
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
                .prepare(
                    "SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs WHERE date = ?1 AND semester = ?2 ORDER BY timestamp ASC",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![clean, sem], map_row).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp FROM attendance_logs WHERE date = ?1 ORDER BY timestamp ASC",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![clean], map_row).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        }
    }

    pub fn get_classes_for_date(&self, date: &str, semester: i64) -> Result<Vec<Value>, String> {
        let clean = if date.len() >= 10 { &date[..10] } else { date };
        let parsed = NaiveDate::parse_from_str(clean, "%Y-%m-%d").unwrap_or_else(|_| Local::now().date_naive());
        let day_name = match parsed.weekday() {
            chrono::Weekday::Mon => "Monday",
            chrono::Weekday::Tue => "Tuesday",
            chrono::Weekday::Wed => "Wednesday",
            chrono::Weekday::Thu => "Thursday",
            chrono::Weekday::Fri => "Friday",
            chrono::Weekday::Sat => "Saturday",
            chrono::Weekday::Sun => "Sunday",
        };

        let tt = self.get_timetable(semester)?;
        let subjects = self.get_subjects(Some(semester))?;
        let logs = self.get_logs_for_date(clean, Some(semester))?;

        let mut day_slots = tt
            .get("schedule")
            .and_then(|s| s.get(day_name))
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();

        // Sort chronologically (AM/PM aware) before computing consecutive slot blocks
        day_slots.sort_by_key(|slot| {
            let start = val_to_string(slot.get("start_time").or_else(|| slot.get("startTime")));
            parse_time_to_minutes(&start)
        });

        let mut class_slots: Vec<(usize, Value)> = Vec::new();
        for (sched_pos, slot) in day_slots.into_iter().enumerate() {
            let slot_type = val_to_string(slot.get("type")).to_lowercase();
            if ["break", "free", "lunch", "gap", "custom"].contains(&slot_type.as_str()) {
                continue;
            }
            let sid = val_to_string(slot.get("subject_id"));
            if sid.is_empty() {
                continue;
            }
            class_slots.push((sched_pos, slot));
        }

        // Partition logs into regular vs substitution_class, sorted by timestamp per subject
        let mut logs_by_sub: HashMap<String, Vec<Value>> = HashMap::new();
        for log in &logs {
            let ltype = val_to_string(log.get("type"));
            if ltype == "substitution_class" {
                continue;
            }
            let sid = val_to_string(log.get("subject_id"));
            logs_by_sub.entry(sid).or_default().push(log.clone());
        }
        for sub_logs in logs_by_sub.values_mut() {
            sub_logs.sort_by(|a, b| val_to_string(a.get("timestamp")).cmp(&val_to_string(b.get("timestamp"))));
        }

        let mut matched_log_ids: HashSet<String> = HashSet::new();
        let mut block_types: Vec<String> = Vec::with_capacity(class_slots.len());
        let mut slot_logs: Vec<Option<Value>> = Vec::with_capacity(class_slots.len());
        let mut legacy_idx_by_sub: HashMap<String, usize> = HashMap::new();

        for (idx, (sched_pos, slot)) in class_slots.iter().enumerate() {
            let sid = val_to_string(slot.get("subject_id"));
            let slot_type = {
                let st = val_to_string(slot.get("type"));
                if st.is_empty() { "class".to_string() } else { st }
            };
            let start = val_to_string(slot.get("start_time").or_else(|| slot.get("startTime")));

            let continues_previous = if idx > 0 {
                let (prev_pos, prev_slot) = &class_slots[idx - 1];
                let prev_sid = val_to_string(prev_slot.get("subject_id"));
                let prev_type = {
                    let st = val_to_string(prev_slot.get("type"));
                    if st.is_empty() { "class".to_string() } else { st }
                };
                *sched_pos == *prev_pos + 1 && prev_sid == sid && prev_type == slot_type
            } else {
                false
            };

            let attendance_type = if continues_previous {
                block_types[idx - 1].clone()
            } else {
                let key_start = if start.is_empty() { idx.to_string() } else { start.clone() };
                format!("{}::{}", slot_type, key_start).chars().take(50).collect()
            };
            block_types.push(attendance_type.clone());

            let empty_vec = Vec::new();
            let sub_logs = logs_by_sub.get(&sid).unwrap_or(&empty_vec);
            let mut matched = sub_logs
                .iter()
                .find(|l| {
                    let lid = val_to_string(l.get("_id").or_else(|| l.get("id")));
                    val_to_string(l.get("type")) == attendance_type && !matched_log_ids.contains(&lid)
                })
                .cloned();

            if matched.is_none() && !continues_previous {
                let legacy_candidates: Vec<&Value> = sub_logs
                    .iter()
                    .filter(|l| {
                        let lid = val_to_string(l.get("_id").or_else(|| l.get("id")));
                        !val_to_string(l.get("type")).contains("::") && !matched_log_ids.contains(&lid)
                    })
                    .collect();
                let next_idx = *legacy_idx_by_sub.get(&sid).unwrap_or(&0);
                if let Some(cand) = legacy_candidates.get(next_idx) {
                    matched = Some((*cand).clone());
                    legacy_idx_by_sub.insert(sid.clone(), next_idx + 1);
                }
            } else if matched.is_none() && continues_previous {
                matched = slot_logs[idx - 1].clone();
            }

            if let Some(ref m) = matched {
                let lid = val_to_string(m.get("_id").or_else(|| m.get("id")));
                if !lid.is_empty() {
                    matched_log_ids.insert(lid);
                }
            }
            slot_logs.push(matched);
        }

        let mut results = Vec::new();
        for (idx, (_, slot)) in class_slots.iter().enumerate() {
            let sid = val_to_string(slot.get("subject_id"));
            let sub = subjects.iter().find(|s| val_to_string(s.get("_id")) == sid);
            let name = sub
                .map(|s| val_to_string(s.get("name")))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| val_to_string(slot.get("subject_name").or_else(|| slot.get("label"))));
            let start = val_to_string(slot.get("start_time").or_else(|| slot.get("startTime")));
            let end = val_to_string(slot.get("end_time").or_else(|| slot.get("endTime")));
            let time_str = if !start.is_empty() && !end.is_empty() {
                format!("{} - {}", start, end)
            } else {
                start
            };
            let slot_type = {
                let st = val_to_string(slot.get("type"));
                if st.is_empty() { "class".to_string() } else { st }
            };
            let attendance_type = &block_types[idx];
            let matched_log = slot_logs[idx].as_ref();

            results.push(json!({
                "_id": sid,
                "subject_id": sid,
                "name": name,
                "time": time_str,
                "type": slot_type,
                "attendance_type": attendance_type,
                "slot_id": val_to_string(slot.get("id")).chars().take(64).collect::<String>(),
                "semester": semester,
                "marked": matched_log.is_some(),
                "marked_status": matched_log.map(|l| val_to_string(l.get("status"))).unwrap_or_else(|| "pending".to_string()),
                "log_id": matched_log.map(|l| val_to_string(l.get("_id"))),
                "notes": matched_log.map(|l| val_to_string(l.get("notes"))).unwrap_or_default(),
                "attended": sub.map(|s| val_to_i64(s.get("attended"), 0)).unwrap_or(0),
                "total": sub.map(|s| val_to_i64(s.get("total"), 0)).unwrap_or(0),
                "idx": idx
            }));
        }

        // If no timetable slots exist for this day yet, fall back to listing semester subjects on weekdays
        // so the user can still mark attendance easily right away.
        if results.is_empty() && !matches!(day_name, "Sunday") && !subjects.is_empty() {
            for sub in &subjects {
                let sid = val_to_string(sub.get("_id"));
                let matched_log = logs.iter().find(|l| val_to_string(l.get("subject_id")) == sid);
                results.push(json!({
                    "_id": sid,
                    "subject_id": sid,
                    "name": val_to_string(sub.get("name")),
                    "time": "",
                    "type": "Lecture",
                    "attendance_type": "Lecture",
                    "slot_id": sid,
                    "semester": semester,
                    "marked": matched_log.is_some(),
                    "marked_status": matched_log.map(|l| val_to_string(l.get("status"))).unwrap_or_else(|| "pending".to_string()),
                    "log_id": matched_log.map(|l| val_to_string(l.get("_id"))),
                    "notes": matched_log.map(|l| val_to_string(l.get("notes"))).unwrap_or_default(),
                    "attended": val_to_i64(sub.get("attended"), 0),
                    "total": val_to_i64(sub.get("total"), 0)
                }));
            }
        }

        Ok(results)
    }

    // ─── DASHBOARD ───────────────────────────────────────────────────────────

    pub fn get_dashboard_data(&self, semester: i64) -> Result<Value, String> {
        let profile = self.get_profile()?;
        let target = val_to_i64(profile.get("attendance_threshold"), 75).clamp(1, 100);
        let subjects = self.get_subjects(Some(semester))?;

        let mut raw_att = 0i64;
        let mut raw_tot = 0i64;
        let mut med_tot = 0i64;
        for s in &subjects {
            raw_att += val_to_i64(s.get("attended"), 0);
            raw_tot += val_to_i64(s.get("total"), 0);
            med_tot += val_to_i64(s.get("medical_leave_count"), 0);
        }

        let phys_att = (raw_att - med_tot).max(0);
        let eligible_tot = (raw_tot - med_tot).max(0);
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
        } else if overall_pct >= (target - 10) as f64 {
            "Warning"
        } else {
            "Critical"
        };

        let today_weekday = match Local::now().weekday() {
            chrono::Weekday::Mon => "Monday",
            chrono::Weekday::Tue => "Tuesday",
            chrono::Weekday::Wed => "Wednesday",
            chrono::Weekday::Thu => "Thursday",
            chrono::Weekday::Fri => "Friday",
            chrono::Weekday::Sat => "Saturday",
            chrono::Weekday::Sun => "Sunday",
        };
        let tt = self.get_timetable(semester)?;
        let today_classes = tt
            .get("schedule")
            .and_then(|s| s.get(today_weekday))
            .cloned()
            .unwrap_or_else(|| json!([]));

        Ok(json!({
            "user": profile,
            "semester": semester,
            "subjects": subjects,
            "total_subjects": subjects.len(),
            "overall_attendance": overall_pct,
            "attendance_without_medical": without_med_pct,
            "medical_leave_count": med_tot,
            "today_classes": today_classes,
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

    // ─── TIMETABLE ───────────────────────────────────────────────────────────

    pub fn get_timetable(&self, semester: i64) -> Result<Value, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let periods_row: Option<(String, String)> = conn
            .query_row(
                "SELECT periods_json, updated_at FROM timetable_periods WHERE semester = ?1",
                params![semester],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let (periods_str, periods_updated_at) = periods_row
            .map(|(p, u)| (p, u))
            .unwrap_or_else(|| (default_periods_json(), String::new()));
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
        let mut schedule: serde_json::Map<String, Value> = serde_json::Map::new();
        for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] {
            schedule.insert(d.to_string(), json!([]));
        }
        let rows = stmt
            .query_map(params![semester], |r| {
                let id: String = r.get(0)?;
                let day: String = r.get(1)?;
                let start: String = r.get(2)?;
                let end: String = r.get(3)?;
                let sid: String = r.get(4)?;
                let sname: String = r.get(5)?;
                let room: String = r.get(6)?;
                let label: String = r.get(7)?;
                let stype: String = r.get(8)?;
                let upd: String = r.get::<_, String>(9).unwrap_or_default();
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
                        "subject_id": sid,
                        "subject_name": sname,
                        "classroom": room,
                        "label": label,
                        "type": stype,
                        "semester": semester,
                        "updated_at": upd
                    }),
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            if let Ok((day, val)) = row {
                schedule
                    .entry(day)
                    .or_insert_with(|| json!([]))
                    .as_array_mut()
                    .map(|arr| arr.push(val));
            }
        }

        // Chronological sort (AM/PM & 24h aware) instead of ASCII string order
        for slots_val in schedule.values_mut() {
            if let Some(arr) = slots_val.as_array_mut() {
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
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let p_str = serde_json::to_string(periods).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO timetable_periods (semester, periods_json, updated_at) VALUES (?1, ?2, ?3)",
            params![semester, p_str, now_iso()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
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
                // Keep class slot classroom empty so LEFT JOIN subjects always reflects live Dashboard edits
                room = String::new();
            }
        }

        let id = {
            let given = val_to_string(slot.get("id").or_else(|| slot.get("_id")));
            if given.is_empty() { Uuid::new_v4().to_string() } else { given }
        };
        let ts = now_iso();

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        // Replace any existing slot at exact same (semester, day, start_time) to avoid overlaps
        tx.execute(
            "DELETE FROM timetable_slots WHERE semester = ?1 AND day = ?2 AND start_time = ?3 AND id != ?4",
            params![semester, day, start, id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            r#"
            INSERT OR REPLACE INTO timetable_slots (id, semester, day, start_time, end_time, subject_id, subject_name, classroom, label, slot_type, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![id, semester, day, start, end, sid, sname, room, label, stype, ts],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;

        Ok(json!({
            "id": id,
            "day": day,
            "start_time": start,
            "end_time": end,
            "subject_id": sid,
            "subject_name": sname,
            "classroom": resolved_room,
            "label": label,
            "type": stype,
            "updated_at": ts
        }))
    }

    pub fn delete_timetable_slot(
        &self,
        slot_id: &str,
        semester: i64,
        fallback_day: Option<&str>,
        fallback_start: Option<&str>,
    ) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;

        let existing: Option<(String, i64, String, String)> = tx
            .query_row(
                "SELECT id, semester, day, start_time FROM timetable_slots WHERE id = ?1",
                params![slot_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .or_else(|| {
                if let (Some(d), Some(s)) = (fallback_day, fallback_start) {
                    tx.query_row(
                        "SELECT id, semester, day, start_time FROM timetable_slots WHERE semester = ?1 AND day = ?2 AND start_time = ?3 LIMIT 1",
                        params![semester, d, s],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                    )
                    .optional()
                    .ok()
                    .flatten()
                } else {
                    None
                }
            });

        let mut deleted = tx
            .execute("DELETE FROM timetable_slots WHERE id = ?1", params![slot_id])
            .map_err(|e| e.to_string())?;
        if deleted == 0 {
            if let (Some(d), Some(s)) = (fallback_day, fallback_start) {
                deleted = tx
                    .execute(
                        "DELETE FROM timetable_slots WHERE semester = ?1 AND day = ?2 AND start_time = ?3",
                        params![semester, d, s],
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
        if let Some((found_id, found_sem, found_day, found_start)) = existing {
            Self::record_tombstone_tx(&tx, "timetable_slot", &found_id);
            let nat_key = format!("{}|{}|{}", found_sem, found_day, found_start.trim().to_lowercase());
            Self::record_tombstone_tx(&tx, "timetable_slot", &nat_key);
        } else if deleted > 0 {
            Self::record_tombstone_tx(&tx, "timetable_slot", slot_id);
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(deleted > 0)
    }

    // ─── MANUAL COURSES ──────────────────────────────────────────────────────

    pub fn get_manual_courses(&self) -> Result<Vec<Value>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, platform, url, progress, enrolled_date, target_completion_date, instructor, notes, updated_at FROM manual_courses ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let id: String = r.get(0)?;
                Ok(json!({
                    "_id": id,
                    "id": id,
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

    pub fn upsert_manual_course(&self, course_id: Option<&str>, payload: &Value) -> Result<Value, String> {
        let id = course_id
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| {
                let g = val_to_string(payload.get("_id").or_else(|| payload.get("id")));
                if g.is_empty() { None } else { Some(g) }
            })
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let title = val_to_string(payload.get("title").or_else(|| payload.get("name")));
        let platform = {
            let p = val_to_string(payload.get("platform").or_else(|| payload.get("provider")));
            if p.is_empty() { "custom".to_string() } else { p }
        };
        let url = val_to_string(payload.get("url"));
        let progress = val_to_i64(payload.get("progress").or_else(|| payload.get("percentage")), 0).clamp(0, 100);
        let enrolled = val_to_string(payload.get("enrolledDate"));
        let target = val_to_string(payload.get("targetCompletionDate"));
        let instructor = val_to_string(payload.get("instructor"));
        let notes = val_to_string(payload.get("notes"));
        let ts = now_iso();

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            r#"
            INSERT OR REPLACE INTO manual_courses (id, title, platform, url, progress, enrolled_date, target_completion_date, instructor, notes, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![id, title, platform, url, progress, enrolled, target, instructor, notes, ts],
        )
        .map_err(|e| e.to_string())?;

        Ok(json!({
            "_id": id,
            "id": id,
            "title": title,
            "platform": platform,
            "url": url,
            "progress": progress,
            "enrolledDate": enrolled,
            "targetCompletionDate": target,
            "instructor": instructor,
            "notes": notes,
            "updated_at": ts
        }))
    }

    pub fn delete_manual_course(&self, id: &str) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let n = tx
            .execute("DELETE FROM manual_courses WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if n > 0 {
            Self::record_tombstone_tx(&tx, "manual_course", id);
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(n > 0)
    }

    // ─── SEMESTER RESULTS (IPU + MANUAL) ─────────────────────────────────────

    pub fn save_semester_results_batch(
        &self,
        enrollment_number: &str,
        student_info: &Value,
        semesters: &[Value],
        source: &str,
    ) -> Result<Value, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;

        let dashboard_credits = load_dashboard_credit_rows(&tx);
        // Preserve any prior manual credit overrides stored on Results across IPU portal re-syncs
        let mut prior_manual_credits: HashMap<(i64, String), i64> = HashMap::new();
        if let Ok(mut m_stmt) = tx.prepare("SELECT semester, subjects_json FROM semester_results") {
            if let Ok(rows) = m_stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))) {
                for (s_num, s_json) in rows.flatten() {
                    if let Ok(arr) = serde_json::from_str::<Vec<Value>>(&s_json) {
                        for item in arr {
                            if val_to_string(item.get("credit_source")) == "manual" {
                                let (ck, _) = canonical_subject_code(&val_to_string(item.get("code")));
                                let nk = normalize_lookup_key(&val_to_string(item.get("name")));
                                let cr = val_to_i64(item.get("credits"), -1);
                                if cr >= 0 {
                                    if !ck.is_empty() {
                                        prior_manual_credits.insert((s_num, ck), cr);
                                    }
                                    if !nk.is_empty() {
                                        prior_manual_credits.insert((s_num, nk), cr);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        let ts = now_iso();
        let info_str = serde_json::to_string(student_info).unwrap_or_else(|_| "{}".to_string());
        let mut max_sem = 0i64;

        for sem in semesters {
            let sem_num = val_to_i64(sem.get("semester_num").or_else(|| sem.get("semester")), 0);
            if sem_num <= 0 {
                continue;
            }
            if sem_num > max_sem {
                max_sem = sem_num;
            }
            let sem_label = {
                let s = val_to_string(sem.get("semester_label"));
                if s.is_empty() { format!("Semester {}", sem_num) } else { s }
            };
            let subjects_raw = sem.get("subjects").and_then(|v| v.as_array()).cloned().unwrap_or_default();

            // Normalize subjects and accurately compute official IPU credit-weighted SGPA
            let mut normalized_subs = Vec::new();
            let mut total_credits: i64 = 0;
            let mut weighted_pts: f64 = 0.0;
            let mut sum_marks: f64 = 0.0;
            let mut sum_max: f64 = 0.0;

            for sub in subjects_raw {
                let name = val_to_string(sub.get("name").or_else(|| sub.get("subject_name")));
                let code = val_to_string(sub.get("code").or_else(|| sub.get("paper_code").or_else(|| sub.get("subject_code"))));
                let upper = name.to_uppercase();
                let is_lab = upper.contains("LAB")
                    || upper.contains("PRACTICAL")
                    || upper.contains("WORKSHOP")
                    || upper.contains("VIVA");
                let (sub_ck, _) = canonical_subject_code(&code);
                let sub_nk = normalize_lookup_key(&name);
                let prior_manual = prior_manual_credits
                    .get(&(sem_num, sub_ck))
                    .or_else(|| prior_manual_credits.get(&(sem_num, sub_nk)))
                    .copied();
                let explicit_c = prior_manual.or_else(|| {
                    sub.get("credits").and_then(|v| {
                        let parsed = val_to_i64(Some(v), -1);
                        if parsed >= 0 { Some(parsed) } else { None }
                    })
                });
                let prev_src = val_to_string(sub.get("credit_source"));
                let stored_src = if prior_manual.is_some() {
                    "manual"
                } else if !prev_src.is_empty() {
                    prev_src.as_str()
                } else if source == "manual" {
                    "manual"
                } else {
                    "portal"
                };
                let (credits, credit_source, matched_subject_id) =
                    resolve_subject_credits(&dashboard_credits, sem_num, &code, &name, explicit_c, stored_src);

                let internal_str = val_to_string(
                    sub.get("internal")
                        .or_else(|| if is_lab { sub.get("internal_practical") } else { sub.get("internal_theory") })
                        .or_else(|| sub.get("internal_theory"))
                        .or_else(|| sub.get("internal_practical")),
                );
                let external_str = val_to_string(
                    sub.get("external")
                        .or_else(|| if is_lab { sub.get("external_practical") } else { sub.get("external_theory") })
                        .or_else(|| sub.get("external_theory"))
                        .or_else(|| sub.get("external_practical")),
                );
                let int_num = internal_str.trim().parse::<f64>().unwrap_or(0.0);
                let ext_num = external_str.trim().parse::<f64>().unwrap_or(0.0);

                let is_pending = sub.get("is_pending").and_then(|v| v.as_bool()).unwrap_or(false);
                let total_marks = if is_pending {
                    None
                } else if let Some(tm) = sub.get("total_marks").and_then(|v| v.as_f64()) {
                    Some(tm)
                } else {
                    Some(int_num + ext_num)
                };
                let max_marks = val_to_f64(sub.get("max_marks"), 100.0);

                let grade = if is_pending {
                    "-".to_string()
                } else {
                    let g = val_to_string(sub.get("grade"));
                    if !g.is_empty() && g != "-" {
                        g
                    } else {
                        let pct_100 = if max_marks > 0.0 {
                            (total_marks.unwrap_or(0.0) / max_marks) * 100.0
                        } else {
                            total_marks.unwrap_or(0.0)
                        };
                        score_to_grade(pct_100).to_string()
                    }
                };
                let gp = if is_pending { 0 } else { grade_points(&grade) };

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
                    "internal": if internal_str.is_empty() { int_num.to_string() } else { internal_str },
                    "external": if external_str.is_empty() { ext_num.to_string() } else { external_str },
                    "total_marks": total_marks,
                    "max_marks": max_marks,
                    "percentage": total_marks.map(|t| if max_marks > 0.0 { ((t / max_marks) * 10000.0).round() / 100.0 } else { 0.0 }),
                    "grade": grade,
                    "grade_point": if is_pending { Value::Null } else { json!(gp) },
                    "credit_points": if is_pending { Value::Null } else { json!(credits * (gp as i64)) },
                    "status": val_to_string(sub.get("status")),
                    "is_pending": is_pending,
                    "declared_date": sub.get("declared_date").cloned().unwrap_or(Value::Null),
                    "exam_session": sub.get("exam_session").cloned().unwrap_or(Value::Null)
                }));
            }

            let computed_sgpa = if total_credits > 0 {
                ((weighted_pts / (total_credits as f64)) * 100.0).round() / 100.0
            } else {
                let reported_sgpa = val_to_f64(sem.get("sgpa"), 0.0);
                (reported_sgpa * 100.0).round() / 100.0
            };

            let subs_json = serde_json::to_string(&normalized_subs).unwrap_or_else(|_| "[]".to_string());
            tx.execute(
                r#"
                INSERT OR REPLACE INTO semester_results (
                    semester, enrollment_number, semester_label, sgpa, total_credits,
                    total_marks, max_marks, subjects_json, student_info_json, source, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                "#,
                params![
                    sem_num,
                    enrollment_number,
                    sem_label,
                    computed_sgpa,
                    total_credits,
                    format!("{:.0}", sum_marks),
                    format!("{:.0}", sum_max),
                    subs_json,
                    info_str,
                    source,
                    ts
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        // Enrich local user profile from official student info if present (including smart course/branch/batch split)
        if let Some(info) = student_info.as_object() {
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

        Self::append_log_tx(
            &tx,
            "Results Synced",
            &format!("Saved {} semester result(s) from {}", semesters.len(), source),
        );
        tx.commit().map_err(|e| e.to_string())?;
        drop(conn);

        self.get_results_analytics()
    }

    /// Updates the credit weight for a specific Results paper AND automatically syncs it
    /// to any linked Attendance Dashboard subject (matched by unique code or name).
    pub fn update_result_subject_credit(
        &self,
        semester: i64,
        code: &str,
        name: &str,
        credits: i64,
    ) -> Result<Value, String> {
        let clamped = credits.clamp(0, 12);
        let (target_ckey, _) = canonical_subject_code(code);
        let target_nkey = normalize_lookup_key(name);
        let ts = now_iso();

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;

        let subs_str: String = tx
            .query_row(
                "SELECT subjects_json FROM semester_results WHERE semester = ?1",
                params![semester],
                |r| r.get(0),
            )
            .map_err(|_| format!("Semester {} results not found", semester))?;

        let mut subs: Vec<Value> = serde_json::from_str(&subs_str).unwrap_or_default();
        let mut updated_any = false;
        for s in &mut subs {
            let (s_ckey, _) = canonical_subject_code(&val_to_string(s.get("code")));
            let s_nkey = normalize_lookup_key(&val_to_string(s.get("name")));
            let is_match = (!target_ckey.is_empty() && s_ckey == target_ckey)
                || (!target_nkey.is_empty() && s_nkey == target_nkey);
            if is_match {
                if let Some(obj) = s.as_object_mut() {
                    obj.insert("credits".to_string(), json!(clamped));
                    obj.insert("credit_source".to_string(), json!("manual"));
                    updated_any = true;
                }
            }
        }
        if !updated_any {
            return Err("Could not find matching paper in semester results".to_string());
        }

        // Also propagate credit back to matched Attendance Dashboard subject so both views stay locked
        let dashboard_credits = load_dashboard_credit_rows(&tx);
        if let Some(matched) = find_matching_dashboard_subject(&dashboard_credits, semester, code, name) {
            let _ = tx.execute(
                "UPDATE subjects SET credits = ?1, updated_at = ?2 WHERE id = ?3",
                params![clamped, ts, matched.id],
            );
        }

        let new_json = serde_json::to_string(&subs).map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE semester_results SET subjects_json = ?1, updated_at = ?2 WHERE semester = ?3",
            params![new_json, ts, semester],
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
            .prepare(
                r#"
                SELECT semester, enrollment_number, semester_label, sgpa, total_credits,
                       total_marks, max_marks, subjects_json, student_info_json, updated_at
                FROM semester_results
                ORDER BY semester ASC
                "#,
            )
            .map_err(|e| e.to_string())?;

        let mut semesters = Vec::new();
        let mut enrollment = String::new();
        let mut merged_info = serde_json::Map::new();
        let mut last_updated: Option<String> = None;
        let mut grade_dist: HashMap<String, i64> = HashMap::new();
        let mut cum_weighted_pts = 0.0;
        let mut cum_credits: i64 = 0;
        let mut grand_marks = 0.0;
        let mut grand_max = 0.0;
        let mut total_subjects: usize = 0;
        let mut credits_synced_count: usize = 0;

        let rows = stmt
            .query_map([], |r| {
                let sem: i64 = r.get(0)?;
                let enroll: String = r.get(1)?;
                let label: String = r.get(2)?;
                let sgpa: f64 = r.get(3)?;
                let credits: i64 = r.get(4)?;
                let tmarks: String = r.get(5)?;
                let mmarks: String = r.get(6)?;
                let subs_str: String = r.get(7)?;
                let info_str: String = r.get(8)?;
                let upd: String = r.get(9)?;
                Ok((sem, enroll, label, sgpa, credits, tmarks, mmarks, subs_str, info_str, upd))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (sem, enroll, label, stored_sgpa, _stored_credits, _tmarks, _mmarks, subs_str, info_str, upd) =
                row.map_err(|e| e.to_string())?;
            if !enroll.is_empty() {
                enrollment = enroll;
            }
            if last_updated.as_deref().map(|p| upd.as_str() > p).unwrap_or(true) {
                last_updated = Some(upd.clone());
            }
            if let Ok(Value::Object(info_obj)) = serde_json::from_str::<Value>(&info_str) {
                for (k, v) in info_obj {
                    let s = val_to_string(Some(&v));
                    if !s.is_empty() && s != "---" {
                        merged_info.insert(k, v);
                    }
                }
            }

            let raw_subs: Vec<Value> = serde_json::from_str(&subs_str).unwrap_or_default();
            let mut live_subs: Vec<Value> = Vec::with_capacity(raw_subs.len());
            let mut sem_credits: i64 = 0;
            let mut sem_weighted_pts: f64 = 0.0;
            let mut sem_marks: f64 = 0.0;
            let mut sem_max: f64 = 0.0;

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

                // Dynamically resolve credits via 4-tier matcher (Manual Override -> Dashboard Subject Code/Name -> Portal -> Official GGSIPU Scheme)
                let (live_credits, credit_source, matched_subject_id) =
                    resolve_subject_credits(&dashboard_credits, sem, &code, &name, stored_c, &prev_source);
                if credit_source == "dashboard" || credit_source == "manual" {
                    credits_synced_count += 1;
                }

                let total_m = s.get("total_marks").and_then(|v| v.as_f64());
                let max_m = val_to_f64(s.get("max_marks"), 100.0);
                let pct_100 = total_m
                    .map(|t| if max_m > 0.0 { (t / max_m) * 100.0 } else { t })
                    .unwrap_or(0.0);

                // Re-derive official IPU Ordinance 11 grade & grade point from marks
                let live_grade = if pending {
                    "-".to_string()
                } else if total_m.is_some() {
                    score_to_grade(pct_100).to_string()
                } else {
                    let g = val_to_string(s.get("grade"));
                    if g.is_empty() { "-".to_string() } else { g }
                };
                let gp = if pending { 0 } else { grade_points(&live_grade) };

                if !pending {
                    if !live_grade.is_empty() && live_grade != "-" {
                        *grade_dist.entry(live_grade.clone()).or_insert(0) += 1;
                    }
                    let tm = total_m.unwrap_or(0.0);
                    sem_marks += tm;
                    sem_max += max_m;
                    grand_marks += tm;
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

            let sem_sgpa = if sem_credits > 0 {
                ((sem_weighted_pts / (sem_credits as f64)) * 100.0).round() / 100.0
            } else {
                (stored_sgpa * 100.0).round() / 100.0
            };
            cum_weighted_pts += sem_weighted_pts;
            cum_credits += sem_credits;
            let running_cgpa = if cum_credits > 0 {
                ((cum_weighted_pts / (cum_credits as f64)) * 100.0).round() / 100.0
            } else {
                sem_sgpa
            };

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

        // Official GGSIPU Ordinance 11 credit-weighted CGPA across ALL completed semesters
        let cgpa = if cum_credits > 0 {
            ((cum_weighted_pts / (cum_credits as f64)) * 100.0).round() / 100.0
        } else {
            0.0
        };
        let strength = if grand_max > 0.0 {
            ((grand_marks / grand_max) * 1000.0).round() / 10.0
        } else {
            0.0
        };
        let ipu_equiv_pct = ((cgpa * 10.0) * 10.0).round() / 10.0;

        Ok(json!({
            "enrollment_number": enrollment,
            "student_info": Value::Object(merged_info),
            "semesters": semesters,
            "cgpa": format!("{:.2}", cgpa),
            "ipuPercentage": ipu_equiv_pct,
            "academicStrength": strength,
            "overallPercentage": strength,
            "totalCredits": cum_credits,
            "totalGradePoints": cum_weighted_pts,
            "totalSubjects": total_subjects,
            "creditsSyncedCount": credits_synced_count,
            "gradeDistribution": grade_dist,
            "last_updated": last_updated
        }))
    }

    // ─── NOTES & TASKS ───────────────────────────────────────────────────────

    pub fn get_notes(&self) -> Result<Vec<Value>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, title, content, is_todo, todos_json, is_pinned, is_archived, color, category, created_at, updated_at
                FROM notes
                ORDER BY is_pinned DESC, updated_at DESC
                "#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let todos_str: String = r.get(4)?;
                let todos: Value = serde_json::from_str(&todos_str).unwrap_or_else(|_| json!([]));
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
            if g.is_empty() || g.starts_with("temp-") {
                Uuid::new_v4().to_string()
            } else {
                g
            }
        };
        let ts = now_iso();

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let existing: Option<(String, String, i64, String, i64, i64, String, String, String)> = conn
            .query_row(
                "SELECT title, content, is_todo, todos_json, is_pinned, is_archived, color, category, created_at FROM notes WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let title = note
            .get("title")
            .map(|v| val_to_string(Some(v)))
            .or_else(|| existing.as_ref().map(|e| e.0.clone()))
            .unwrap_or_else(|| "Untitled Note".to_string());
        let content = note
            .get("content")
            .map(|v| val_to_string(Some(v)))
            .or_else(|| existing.as_ref().map(|e| e.1.clone()))
            .unwrap_or_default();
        let is_todo = note
            .get("is_todo")
            .and_then(|v| v.as_bool())
            .map(|b| if b { 1 } else { 0 })
            .or_else(|| existing.as_ref().map(|e| e.2))
            .unwrap_or(0);
        let todos_val = note
            .get("todos")
            .filter(|v| v.is_array())
            .cloned()
            .unwrap_or_else(|| {
                existing
                    .as_ref()
                    .and_then(|e| serde_json::from_str(&e.3).ok())
                    .unwrap_or_else(|| json!([]))
            });
        let todos_json = serde_json::to_string(&todos_val).unwrap_or_else(|_| "[]".to_string());
        let is_pinned = note
            .get("is_pinned")
            .and_then(|v| v.as_bool())
            .map(|b| if b { 1 } else { 0 })
            .or_else(|| existing.as_ref().map(|e| e.4))
            .unwrap_or(0);
        let is_archived = note
            .get("is_archived")
            .and_then(|v| v.as_bool())
            .map(|b| if b { 1 } else { 0 })
            .or_else(|| existing.as_ref().map(|e| e.5))
            .unwrap_or(0);
        let color = note
            .get("color")
            .map(|v| val_to_string(Some(v)))
            .or_else(|| existing.as_ref().map(|e| e.6.clone()))
            .unwrap_or_default();
        let category = note
            .get("category")
            .map(|v| val_to_string(Some(v)))
            .or_else(|| existing.as_ref().map(|e| e.7.clone()))
            .unwrap_or_default();
        let created_at = existing
            .as_ref()
            .map(|e| e.8.clone())
            .unwrap_or_else(|| {
                let g = val_to_string(note.get("created_at"));
                if g.is_empty() { ts.clone() } else { g }
            });

        conn.execute(
            r#"
            INSERT OR REPLACE INTO notes (id, title, content, is_todo, todos_json, is_pinned, is_archived, color, category, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![id, title, content, is_todo, todos_json, is_pinned, is_archived, color, category, created_at, ts],
        )
        .map_err(|e| e.to_string())?;

        Ok(json!({
            "id": id,
            "title": title,
            "content": content,
            "is_todo": is_todo != 0,
            "todos": todos_val,
            "is_pinned": is_pinned != 0,
            "is_archived": is_archived != 0,
            "color": color,
            "category": category,
            "created_at": created_at,
            "updated_at": ts
        }))
    }

    pub fn delete_note(&self, id: &str) -> Result<bool, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let n = tx
            .execute("DELETE FROM notes WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if n > 0 {
            Self::record_tombstone_tx(&tx, "note", id);
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(n > 0)
    }

    // ─── SYSTEM LOGS ─────────────────────────────────────────────────────────

    pub fn get_system_logs(&self, limit: i64, offset: i64) -> Result<Value, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, action, description, timestamp FROM system_logs ORDER BY timestamp DESC LIMIT ?1 OFFSET ?2")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit + 1, offset], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "action": r.get::<_, String>(1)?,
                    "description": r.get::<_, String>(2)?,
                    "timestamp": r.get::<_, String>(3)?
                }))
            })
            .map_err(|e| e.to_string())?;
        let mut items: Vec<Value> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        let has_more = (items.len() as i64) > limit;
        if has_more {
            items.truncate(limit as usize);
        }
        Ok(json!({
            "items": items,
            "has_more": has_more,
            "next_offset": offset + (items.len() as i64),
            "snapshot": now_iso()
        }))
    }

    // ─── EXPORT / IMPORT / CLEANUP / WIPE ────────────────────────────────────

    pub fn export_canonical_data(&self) -> Result<Value, String> {
        let profile = self.get_profile()?;
        let subjects = self.get_subjects(None)?;
        let courses = self.get_manual_courses()?;
        let notes = self.get_notes()?;
        let results = self.get_results_analytics()?;
        let logs_res = self.get_system_logs(300, 0)?;

        // Collect all attendance logs across all semesters
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

        let mut t_stmt = conn
            .prepare("SELECT entity, record_key, deleted_at FROM sync_tombstones ORDER BY entity ASC, record_key ASC")
            .map_err(|e| e.to_string())?;
        let tombstones: Vec<Value> = t_stmt
            .query_map([], |r| {
                Ok(json!({
                    "entity": r.get::<_, String>(0)?,
                    "key": r.get::<_, String>(1)?,
                    "deleted_at": r.get::<_, String>(2)?
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(t_stmt);
        drop(conn);

        let mut timetables = Vec::new();
        for sem in 1..=8 {
            let tt = self.get_timetable(sem)?;
            let has_slots = tt
                .get("schedule")
                .and_then(|s| s.as_object())
                .map(|m| m.values().any(|arr| arr.as_array().map(|a| !a.is_empty()).unwrap_or(false)))
                .unwrap_or(false);
            if has_slots || sem == val_to_i64(profile.get("current_semester"), 1) {
                timetables.push(tt);
            }
        }

        let semester_results = results
            .get("semesters")
            .cloned()
            .unwrap_or_else(|| json!([]));

        Ok(json!({
            "user_profile": profile,
            "subjects": subjects,
            "attendance_logs": attendance_logs,
            "timetable": timetables,
            "manual_courses": courses,
            "semester_results": semester_results,
            "results_meta": results.get("student_info").cloned().unwrap_or_else(|| json!({})),
            "notes": notes,
            "system_logs": logs_res.get("items").cloned().unwrap_or_else(|| json!([])),
            "tombstones": tombstones
        }))
    }

    /// Computes a deterministic SHA-256 content hash over user data (excluding volatile timestamps)
    /// so Google Drive auto-sync skips redundant uploads when nothing changed.
    pub fn compute_content_hash(&self) -> Result<(String, Value), String> {
        let mut data = self.export_canonical_data()?;
        let mut hashable = data.clone();
        if let Some(obj) = hashable.as_object_mut() {
            obj.remove("system_logs");
            if let Some(prof) = obj.get_mut("user_profile").and_then(|v| v.as_object_mut()) {
                prof.remove("updated_at");
                prof.remove("created_at");
            }
            for arr_key in ["semester_results", "notes", "subjects", "manual_courses", "attendance_logs"] {
                if let Some(arr) = obj.get_mut(arr_key).and_then(|v| v.as_array_mut()) {
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
                                        if let Some(sm) = slot.as_object_mut() {
                                            sm.remove("updated_at");
                                        }
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

        if let Some(obj) = data.as_object_mut() {
            obj.insert("device_id".to_string(), json!(self.get_meta("device_id")?.unwrap_or_default()));
            obj.insert("content_hash".to_string(), json!(hash));
            obj.insert("exported_at".to_string(), json!(now_iso()));
            obj.insert("version".to_string(), json!("2.0"));
        }
        Ok((hash, data))
    }

    /// Imports either a native v2 snapshot OR a legacy Semester/Zenith export JSON
    /// (with MongoDB `$oid`/`$date` wrappers), cleaning duplicates and preserving atomic integrity.
    pub fn import_backup_json(&self, raw_json: &Value) -> Result<Value, String> {
        self.import_backup_json_inner(raw_json, true, "Backup Imported")
    }

    /// Atomically applies a merged 2-way CRDT snapshot without creating extra disk safety files on each poll.
    pub fn apply_merged_snapshot(&self, merged: &Value) -> Result<Value, String> {
        self.import_backup_json_inner(merged, false, "2-Way Sync Merged")
    }

    fn import_backup_json_inner(
        &self,
        raw_json: &Value,
        create_safety_file: bool,
        log_action: &str,
    ) -> Result<Value, String> {
        if raw_json.get("secure").and_then(|v| v.as_bool()) == Some(true)
            && raw_json.get("payload").is_some()
        {
            return Err("This is a legacy encrypted web backup (`secure: true`). Please use the decrypted Semester v2 JSON file instead.".to_string());
        }

        // 1. Validate structure & sanity bounds BEFORE taking a snapshot or touching any tables
        let serialized_len = serde_json::to_string(raw_json).map(|s| s.len()).unwrap_or(0);
        if serialized_len > 25 * 1024 * 1024 {
            return Err("Backup file exceeds the 25 MB maximum safe import size.".to_string());
        }
        let data = raw_json.get("data").unwrap_or(raw_json);
        let Some(obj) = data.as_object() else {
            return Err("Invalid backup file: expected a JSON object.".to_string());
        };
        let recognized_keys = [
            "user_profile",
            "subjects",
            "attendance_logs",
            "timetable",
            "timetables",
            "manual_courses",
            "semester_results",
            "notes",
        ];
        if !recognized_keys.iter().any(|k| obj.contains_key(*k)) {
            return Err("Invalid backup file: missing recognizable Semester data sections.".to_string());
        }
        let arr_len = |k: &str| obj.get(k).and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
        if arr_len("subjects") > 500
            || arr_len("attendance_logs") > 50_000
            || arr_len("notes") > 5_000
            || arr_len("manual_courses") > 1_000
            || arr_len("semester_results") > 40
        {
            return Err("Backup payload exceeds safe import limits.".to_string());
        }

        let has_notes_section = obj.contains_key("notes");
        let has_results_section = obj.contains_key("semester_results");

        // 2. Protect existing state with a real SQLite file snapshot first (for manual imports/restores)
        if create_safety_file {
            let _ = self.create_safety_snapshot("pre_import");
        }

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;

        // Clear replaceable tables inside the atomic transaction.
        // Preserve existing local `notes` & `semester_results` when importing a legacy
        // backup that didn't include those sections.
        tx.execute_batch(
            r#"
            DELETE FROM attendance_logs;
            DELETE FROM timetable_slots;
            DELETE FROM timetable_periods;
            DELETE FROM subjects;
            DELETE FROM manual_courses;
            DELETE FROM sync_tombstones;
            "#,
        )
        .map_err(|e| e.to_string())?;
        if has_results_section {
            tx.execute("DELETE FROM semester_results", []).map_err(|e| e.to_string())?;
        }
        if has_notes_section {
            tx.execute("DELETE FROM notes", []).map_err(|e| e.to_string())?;
        }

        let ts = now_iso();

        // Collect safe UI preferences from v2 `preferences`, `user_profile.preferences`,
        // or legacy `user_preferences[0].preferences` (stripping legacy auth_sessions/tokens/skills_filter).
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
        if let Some(prof_prefs) = data.get("user_profile").and_then(|p| p.get("preferences")) {
            clean_prefs.extend(sanitize_ui_preferences(prof_prefs));
        }
        if let Some(top_prefs) = data.get("preferences") {
            clean_prefs.extend(sanitize_ui_preferences(top_prefs));
        }

        // 1. Profile & Safe UI Preferences (syncs attendance_threshold, warning_threshold & identity fields cleanly)
        if let Some(prof) = data
            .get("user_profile")
            .or_else(|| data.get("profile"))
            .or_else(|| data.get("user"))
            .and_then(|v| v.as_object())
        {
            let name = val_to_string(prof.get("name"));
            let email = val_to_string(prof.get("email"));
            let picture = val_to_string(prof.get("picture"));
            let branch = val_to_string(prof.get("branch"));
            let course = val_to_string(prof.get("course"));
            let college = val_to_string(prof.get("college"));
            let batch = val_to_string(prof.get("batch"));
            let enroll = val_to_string(prof.get("enrollment_number"));
            let adm = val_to_string(prof.get("admission_year"));
            let sem = val_to_i64(prof.get("current_semester").or_else(|| prof.get("semester")), 1).clamp(1, 8);
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
            let created_at = val_to_string(prof.get("created_at"));
            let prof_updated = {
                let g = val_to_string(prof.get("updated_at"));
                if g.is_empty() { ts.clone() } else { g }
            };

            let prefs_str = serde_json::to_string(&Value::Object(clean_prefs.clone())).unwrap_or_else(|_| "{}".to_string());

            tx.execute(
                r#"
                UPDATE user_profile
                SET name = CASE WHEN ?1 != '' THEN ?1 ELSE name END,
                    email = CASE WHEN ?2 != '' AND email = '' THEN ?2 ELSE email END,
                    picture = CASE WHEN ?3 != '' THEN ?3 ELSE picture END,
                    branch = ?4, course = ?5, college = ?6, batch = ?7,
                    enrollment_number = ?8, admission_year = ?9,
                    current_semester = ?10, attendance_threshold = ?11, warning_threshold = ?12,
                    preferences_json = ?13,
                    created_at = CASE WHEN ?14 != '' THEN ?14 ELSE created_at END,
                    updated_at = ?15
                WHERE id = 1
                "#,
                params![name, email, picture, branch, course, college, batch, enroll, adm, sem, att_t, warn_t, prefs_str, created_at, prof_updated],
            )
            .map_err(|e| e.to_string())?;
        } else if !clean_prefs.is_empty() {
            let prefs_str = serde_json::to_string(&Value::Object(clean_prefs)).unwrap_or_else(|_| "{}".to_string());
            tx.execute(
                "UPDATE user_profile SET preferences_json = ?1, updated_at = ?2 WHERE id = 1",
                params![prefs_str, ts],
            )
            .map_err(|e| e.to_string())?;
        }

        // 2. Subjects (keep deterministic ID mapping so logs & timetable stay linked!)
        let mut id_map: HashMap<String, String> = HashMap::new();
        let mut sub_meta: HashMap<String, (String, String)> = HashMap::new(); // id -> (name, classroom)
        let mut sub_count = 0usize;
        if let Some(subs) = data.get("subjects").and_then(|v| v.as_array()) {
            for s in subs {
                let old_id = val_to_string(s.get("id").or_else(|| s.get("_id")));
                let new_id = if old_id.is_empty() { Uuid::new_v4().to_string() } else { old_id.clone() };
                if !old_id.is_empty() {
                    id_map.insert(old_id, new_id.clone());
                }
                let name = val_to_string(s.get("name"));
                if name.trim().is_empty() {
                    continue;
                }
                let code = val_to_string(s.get("code"));
                let prof = val_to_string(s.get("professor"));
                let room = val_to_string(s.get("classroom"));
                let sem = val_to_i64(s.get("semester"), 1).clamp(1, 8);
                let cats = s
                    .get("categories")
                    .filter(|v| v.is_array())
                    .cloned()
                    .unwrap_or_else(|| json!(["Theory"]));
                let stype = {
                    let t = val_to_string(s.get("type").or_else(|| s.get("subject_type")));
                    if t.is_empty() { "theory".to_string() } else { t }
                };
                let credits = val_to_i64(s.get("credits"), 3);
                let attended = val_to_i64(s.get("attended"), 0).max(0);
                let total = val_to_i64(s.get("total"), 0).max(attended);
                let med = val_to_i64(s.get("medical_leave_count"), 0).max(0);
                let target = val_to_i64(s.get("target").or_else(|| s.get("target_attendance")), 75).clamp(1, 100);
                let syllabus = val_to_string(s.get("syllabus"));
                let practicals = normalize_tracker_json(s.get("practicals"), 10);
                let assignments = normalize_tracker_json(s.get("assignments"), 4);
                let sub_created = {
                    let g = val_to_string(s.get("created_at"));
                    if g.is_empty() { ts.clone() } else { g }
                };
                let sub_updated = {
                    let g = val_to_string(s.get("updated_at"));
                    if g.is_empty() { ts.clone() } else { g }
                };

                sub_meta.insert(new_id.clone(), (name.clone(), room.clone()));

                tx.execute(
                    r#"
                    INSERT OR REPLACE INTO subjects (
                        id, name, code, professor, classroom, semester, subject_type,
                        categories_json, credits, attended, total, medical_leave_count,
                        target, syllabus, practicals_json, assignments_json, created_at, updated_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
                    "#,
                    params![
                        new_id,
                        name,
                        code,
                        prof,
                        room,
                        sem,
                        stype,
                        serde_json::to_string(&cats).unwrap_or_else(|_| "[\"Theory\"]".to_string()),
                        credits,
                        attended,
                        total,
                        med,
                        target,
                        syllabus,
                        serde_json::to_string(&practicals).unwrap_or_else(|_| "{}".to_string()),
                        serde_json::to_string(&assignments).unwrap_or_else(|_| "{}".to_string()),
                        sub_created,
                        sub_updated
                    ],
                )
                .map_err(|e| e.to_string())?;
                sub_count += 1;
            }
        }

        // 3. Attendance Logs (deduplicated & orphan-cleaned)
        let mut log_count = 0usize;
        let mut seen_logs: HashSet<String> = HashSet::new();
        let mut log_totals_by_sub: HashMap<String, (i64, i64, i64)> = HashMap::new();
        if let Some(logs) = data.get("attendance_logs").and_then(|v| v.as_array()) {
            for l in logs {
                let raw_sid = val_to_string(l.get("subject_id").or_else(|| l.get("subjectId")));
                let sid = id_map.get(&raw_sid).cloned().unwrap_or(raw_sid);
                // Skip orphaned logs whose subject doesn't exist
                let sub_exists: Option<(String, i64)> = tx
                    .query_row("SELECT name, semester FROM subjects WHERE id = ?1", params![sid], |r| {
                        Ok((r.get(0)?, r.get(1)?))
                    })
                    .optional()
                    .map_err(|e| e.to_string())?;
                let Some((sub_name, sub_sem)) = sub_exists else {
                    continue;
                };
                let date_full = val_to_string(l.get("date"));
                let date = if date_full.len() >= 10 { &date_full[..10] } else { &date_full };
                if date.is_empty() {
                    continue;
                }
                let status = normalize_status(&val_to_string(l.get("status")));
                let ltype = {
                    let t = val_to_string(l.get("type").or_else(|| l.get("log_type")));
                    if t.is_empty() { "Lecture".to_string() } else { t }
                };
                let dedupe_key = format!("{}|{}|{}", sid, date, ltype.to_lowercase());
                if !seen_logs.insert(dedupe_key) {
                    continue;
                }
                let (da, dt, dm) = status_deltas(&status);
                let entry = log_totals_by_sub.entry(sid.clone()).or_insert((0, 0, 0));
                entry.0 += da;
                entry.1 += dt;
                entry.2 += dm;
                let lid = {
                    let g = val_to_string(l.get("id").or_else(|| l.get("_id")));
                    if g.is_empty() { Uuid::new_v4().to_string() } else { g }
                };
                let notes = val_to_string(l.get("notes"));
                let sem = val_to_i64(l.get("semester"), sub_sem);
                let sub_by = val_to_string(l.get("substituted_by"));
                let log_ts = {
                    let g = val_to_string(l.get("timestamp"));
                    if g.is_empty() { ts.clone() } else { g }
                };
                tx.execute(
                    r#"
                    INSERT OR REPLACE INTO attendance_logs (id, subject_id, subject_name, date, status, log_type, notes, semester, substituted_by, timestamp)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                    "#,
                    params![lid, sid, sub_name, date, status, ltype, notes, sem, sub_by, log_ts],
                )
                .map_err(|e| e.to_string())?;
                log_count += 1;
            }
        }
        for (sid, (att_logs, tot_logs, med_logs)) in log_totals_by_sub {
            let _ = tx.execute(
                r#"
                UPDATE subjects
                SET attended = CASE WHEN total = 0 AND ?1 > 0 THEN ?2 ELSE attended END,
                    total = CASE WHEN total = 0 AND ?1 > 0 THEN ?1 ELSE total END,
                    medical_leave_count = MAX(medical_leave_count, ?3)
                WHERE id = ?4
                "#,
                params![tot_logs, att_logs, med_logs, sid],
            );
        }

        // 4. Timetables (handles both `timetable` and `timetables`, skips empty period shells, backfills names)
        let mut slot_count = 0usize;
        let mut seen_slots: HashSet<String> = HashSet::new();
        if let Some(tts) = data.get("timetable").or_else(|| data.get("timetables")).and_then(|v| v.as_array()) {
            for t in tts {
                let sem = val_to_i64(t.get("semester"), 1).clamp(1, 8);
                if let Some(periods) = t.get("periods").and_then(|v| v.as_array()).filter(|a| !a.is_empty()) {
                    let p_str = serde_json::to_string(periods).unwrap_or_else(|_| default_periods_json());
                    let p_upd = {
                        let g = val_to_string(t.get("periods_updated_at").or_else(|| t.get("updated_at")));
                        if g.is_empty() { ts.clone() } else { g }
                    };
                    tx.execute(
                        "INSERT OR REPLACE INTO timetable_periods (semester, periods_json, updated_at) VALUES (?1, ?2, ?3)",
                        params![sem, p_str, p_upd],
                    )
                    .map_err(|e| e.to_string())?;
                }
                if let Some(sched) = t.get("schedule").and_then(|v| v.as_object()) {
                    for (day, slots_val) in sched {
                        let Some(slots) = slots_val.as_array() else { continue };
                        for slot in slots {
                            let sid_raw = val_to_string(slot.get("subject_id").or_else(|| slot.get("subjectId")));
                            let sid = id_map.get(&sid_raw).cloned().unwrap_or(sid_raw);
                            let start = val_to_string(slot.get("start_time").or_else(|| slot.get("startTime")));
                            let end = val_to_string(slot.get("end_time").or_else(|| slot.get("endTime")));
                            let stype = {
                                let st = val_to_string(slot.get("type")).to_lowercase();
                                if st.is_empty() { "class".to_string() } else { st }
                            };
                            let mut sname = val_to_string(slot.get("subject_name"));
                            let mut room = val_to_string(slot.get("classroom"));
                            if stype == "class" && !sid.is_empty() {
                                if let Some((resolved_name, resolved_room)) = sub_meta.get(&sid) {
                                    if sname.is_empty() {
                                        sname = resolved_name.clone();
                                    }
                                    if room.is_empty() {
                                        room = resolved_room.clone();
                                    }
                                }
                            }
                            let label = val_to_string(slot.get("label"));
                            let slot_key = format!("{}|{}|{}", sem, day, start.to_lowercase());
                            if !start.is_empty() && !seen_slots.insert(slot_key) {
                                continue;
                            }
                            let id = {
                                let g = val_to_string(slot.get("id").or_else(|| slot.get("_id")));
                                if g.is_empty() { Uuid::new_v4().to_string() } else { g }
                            };
                            let slot_upd = {
                                let g = val_to_string(slot.get("updated_at"));
                                if g.is_empty() { ts.clone() } else { g }
                            };
                            tx.execute(
                                r#"
                                INSERT OR REPLACE INTO timetable_slots (id, semester, day, start_time, end_time, subject_id, subject_name, classroom, label, slot_type, updated_at)
                                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                                "#,
                                params![id, sem, day, start, end, sid, sname, room, label, stype, slot_upd],
                            )
                            .map_err(|e| e.to_string())?;
                            slot_count += 1;
                        }
                    }
                }
            }
        }

        // 5. Manual Courses
        let mut course_count = 0usize;
        if let Some(courses) = data.get("manual_courses").and_then(|v| v.as_array()) {
            for c in courses {
                let id = {
                    let g = val_to_string(c.get("id").or_else(|| c.get("_id")));
                    if g.is_empty() { Uuid::new_v4().to_string() } else { g }
                };
                let title = val_to_string(c.get("title").or_else(|| c.get("name")));
                if title.trim().is_empty() { continue; }
                let platform = val_to_string(c.get("platform").or_else(|| c.get("provider")));
                let url = val_to_string(c.get("url"));
                let progress = val_to_i64(c.get("progress").or_else(|| c.get("percentage")), 0).clamp(0, 100);
                let extra = c.get("extra");
                let enrolled = val_to_string(c.get("enrolledDate").or_else(|| extra.and_then(|e| e.get("enrolledDate"))));
                let target = val_to_string(c.get("targetCompletionDate").or_else(|| extra.and_then(|e| e.get("targetCompletionDate"))));
                let instructor = val_to_string(c.get("instructor").or_else(|| extra.and_then(|e| e.get("instructor"))));
                let notes = val_to_string(c.get("notes"));
                let course_upd = {
                    let g = val_to_string(c.get("updated_at"));
                    if g.is_empty() { ts.clone() } else { g }
                };

                tx.execute(
                    r#"
                    INSERT OR REPLACE INTO manual_courses (id, title, platform, url, progress, enrolled_date, target_completion_date, instructor, notes, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                    "#,
                    params![id, title, platform, url, progress, enrolled, target, instructor, notes, course_upd],
                )
                .map_err(|e| e.to_string())?;
                course_count += 1;
            }
        }

        // 6. Notes
        let mut note_count = 0usize;
        if let Some(notes) = data.get("notes").and_then(|v| v.as_array()) {
            for n in notes {
                let id = {
                    let g = val_to_string(n.get("id").or_else(|| n.get("_id")));
                    if g.is_empty() { Uuid::new_v4().to_string() } else { g }
                };
                let title = val_to_string(n.get("title"));
                let content = val_to_string(n.get("content"));
                let is_todo = if n.get("is_todo").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
                let todos = n.get("todos").filter(|v| v.is_array()).cloned().unwrap_or_else(|| json!([]));
                let is_pinned = if n.get("is_pinned").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
                let is_archived = if n.get("is_archived").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
                let color = val_to_string(n.get("color"));
                let category = val_to_string(n.get("category"));
                let created = {
                    let g = val_to_string(n.get("created_at"));
                    if g.is_empty() { ts.clone() } else { g }
                };
                let updated = {
                    let g = val_to_string(n.get("updated_at"));
                    if g.is_empty() { ts.clone() } else { g }
                };
                tx.execute(
                    r#"
                    INSERT OR REPLACE INTO notes (id, title, content, is_todo, todos_json, is_pinned, is_archived, color, category, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                    "#,
                    params![id, title, content, is_todo, serde_json::to_string(&todos).unwrap_or_else(|_| "[]".to_string()), is_pinned, is_archived, color, category, created, updated],
                )
                .map_err(|e| e.to_string())?;
                note_count += 1;
            }
        }

        // 7. Semester Results
        let mut res_count = 0usize;
        if let Some(sems) = data.get("semester_results").and_then(|v| v.as_array()) {
            let meta_info = data.get("results_meta").cloned().unwrap_or_else(|| json!({}));
            for sr in sems {
                let sem = val_to_i64(sr.get("semester").or_else(|| sr.get("semester_num")), 0);
                if sem <= 0 { continue; }
                let enroll = {
                    let e = val_to_string(sr.get("enrollment_number"));
                    if !e.is_empty() {
                        e
                    } else {
                        let pe = val_to_string(data.pointer("/user_profile/enrollment_number"));
                        if !pe.is_empty() {
                            pe
                        } else {
                            val_to_string(meta_info.get("roll_no").or_else(|| meta_info.get("enrollment_number")))
                        }
                    }
                };
                let label = val_to_string(sr.get("semester_label"));
                let sgpa = val_to_f64(sr.get("sgpa"), 0.0);
                let credits = val_to_i64(sr.get("total_credits"), 0);
                let tmarks = val_to_string(sr.get("total_marks"));
                let mmarks = val_to_string(sr.get("max_marks"));
                let subs = sr.get("subjects").cloned().unwrap_or_else(|| json!([]));
                let info = sr.get("student_info").cloned().unwrap_or_else(|| meta_info.clone());
                let sr_upd = {
                    let g = val_to_string(sr.get("updated_at"));
                    if g.is_empty() { ts.clone() } else { g }
                };
                tx.execute(
                    r#"
                    INSERT OR REPLACE INTO semester_results (
                        semester, enrollment_number, semester_label, sgpa, total_credits,
                        total_marks, max_marks, subjects_json, student_info_json, source, updated_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'imported', ?10)
                    "#,
                    params![
                        sem,
                        enroll,
                        if label.is_empty() { format!("Semester {}", sem) } else { label },
                        sgpa,
                        credits,
                        tmarks,
                        mmarks,
                        serde_json::to_string(&subs).unwrap_or_else(|_| "[]".to_string()),
                        serde_json::to_string(&info).unwrap_or_else(|_| "{}".to_string()),
                        sr_upd
                    ],
                )
                .map_err(|e| e.to_string())?;
                res_count += 1;
            }
        }

        // 7b. Sync Tombstones (preserved across 2-way CRDT merges & backups so deletions never resurrect)
        let mut tomb_count = 0usize;
        if let Some(tombs) = data.get("tombstones").and_then(|v| v.as_array()) {
            for tb in tombs.iter().take(10_000) {
                let entity = val_to_string(tb.get("entity")).trim().to_lowercase();
                let key = val_to_string(tb.get("key")).trim().to_string();
                let del_at = val_to_string(tb.get("deleted_at")).trim().to_string();
                if entity.is_empty() || key.is_empty() || del_at.is_empty() {
                    continue;
                }
                tx.execute(
                    "INSERT OR REPLACE INTO sync_tombstones (entity, record_key, deleted_at) VALUES (?1, ?2, ?3)",
                    params![entity, key, del_at],
                )
                .map_err(|e| e.to_string())?;
                tomb_count += 1;
            }
        }

        // 8. Academic System Logs (strip legacy web auth_* entries, IPs, and user agents)
        let mut syslog_count = 0usize;
        if let Some(syslogs) = data.get("system_logs").and_then(|v| v.as_array()) {
            for sl in syslogs.iter().take(500) {
                let action = val_to_string(sl.get("action"));
                if action.trim().is_empty() || is_legacy_auth_log(&action) {
                    continue;
                }
                let id = {
                    let g = val_to_string(sl.get("id").or_else(|| sl.get("_id")));
                    if g.is_empty() { Uuid::new_v4().to_string() } else { g }
                };
                let desc = val_to_string(sl.get("description"));
                let log_ts = {
                    let g = val_to_string(sl.get("timestamp"));
                    if g.is_empty() { ts.clone() } else { g }
                };
                tx.execute(
                    "INSERT OR REPLACE INTO system_logs (id, action, description, timestamp) VALUES (?1, ?2, ?3, ?4)",
                    params![id, action, desc, log_ts],
                )
                .map_err(|e| e.to_string())?;
                syslog_count += 1;
            }
        }

        Self::append_log_tx(
            &tx,
            log_action,
            &format!(
                "Synced {} subjects, {} logs, {} slots, {} courses, {} notes, {} result semesters",
                sub_count, log_count, slot_count, course_count, note_count, res_count
            ),
        );
        tx.commit().map_err(|e| e.to_string())?;

        Ok(json!({
            "message": "Backup imported & verified successfully",
            "counts": {
                "subjects": sub_count,
                "attendance_logs": log_count,
                "timetable_slots": slot_count,
                "manual_courses": course_count,
                "notes": note_count,
                "semester_results": res_count,
                "system_logs": syslog_count,
                "tombstones": tomb_count
            }
        }))
    }

    pub fn wipe_all_data(&self) -> Result<Value, String> {
        let _ = self.create_safety_snapshot("pre_wipe");
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
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
        Self::append_log_tx(&tx, "Workspace Wiped", "Cleared all local academic records (safety snapshot preserved)");
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({ "message": "All local academic data cleared" }))
    }

    /// Completely resets the local account & workspace (Settings -> Delete Account Permanently):
    /// Takes a final SQLite safety snapshot, clears all academic tables, purges encrypted OAuth/AI
    /// secrets from `sync_meta`, and resets `user_profile` to clean defaults.
    pub fn reset_account_completely(&self) -> Result<Value, String> {
        let snapshot = self.create_safety_snapshot("pre_account_delete").ok();
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
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
            DELETE FROM sync_meta;
            "#,
        )
        .map_err(|e| e.to_string())?;

        let ts = now_iso();
        tx.execute(
            r#"
            UPDATE user_profile
            SET name = 'Student',
                email = '',
                picture = '',
                branch = '',
                course = '',
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

        Ok(json!({
            "success": true,
            "message": "Local account, keys, and academic data completely reset",
            "safety_snapshot": snapshot.map(|p| p.to_string_lossy().to_string())
        }))
    }

    /// Writes a canonical JSON backup file atomically (write temp + rename) to `target_dir`.
    pub fn export_backup_to_dir(&self, target_dir: &Path) -> Result<Value, String> {
        let (_, payload) = self.compute_content_hash()?;
        let pretty = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(target_dir)
            .map_err(|e| format!("Failed creating export directory: {}", e))?;
        let filename = format!("semester_backup_{}.json", Utc::now().format("%Y-%m-%d_%H-%M-%S"));
        let final_path = target_dir.join(&filename);
        let tmp_path = target_dir.join(format!(".{}.tmp", filename));
        std::fs::write(&tmp_path, pretty.as_bytes())
            .map_err(|e| format!("Failed writing backup file: {}", e))?;
        std::fs::rename(&tmp_path, &final_path)
            .map_err(|e| format!("Failed finalizing backup file: {}", e))?;
        Ok(json!({
            "path": final_path.to_string_lossy().to_string(),
            "filename": filename,
            "size_bytes": pretty.len()
        }))
    }

    // ─── LOCAL ACADEMIC INTELLIGENCE (100% SQLite-Verified, Zero Hallucinations) ─

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

        // 1. Results / CGPA / SGPA / Grades
        if q.contains("result") || q.contains("cgpa") || q.contains("sgpa") || q.contains("grade") || q.contains("mark") || q.contains("strongest") || q.contains("weakest") {
            let res = self.get_results_analytics()?;
            if res.is_null() {
                return Ok(json!({
                    "response": "No university results are saved in your local database yet.\n\n- Open the **Results** page and sign in to the **IPU ExamWeb Portal** to fetch all published semesters directly.\n- Once synced, all semesters are stored offline and I can analyze your CGPA, SGPA trends, and subject ranks anytime.",
                    "suggestions": ["How is my attendance margin?", "What classes do I have today?", "Check pending tasks & practicals"]
                }));
            }
            let cgpa = val_to_string(res.get("cgpa"));
            let agg = val_to_f64(res.get("academicStrength"), 0.0);
            let sems = res.get("semesters").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let mut lines = vec![format!(
                "### Academic Transcript Summary\n\n- **Overall CGPA**: **{}** / 10.0\n- **Aggregate Score**: **{:.1}%** across **{} semester(s)**",
                cgpa, agg, sems.len()
            )];
            for s in &sems {
                lines.push(format!(
                    "- **{}**: SGPA **{}** ({} credits)",
                    val_to_string(s.get("semester_label")),
                    val_to_string(s.get("sgpa")),
                    val_to_i64(s.get("total_credits"), 0)
                ));
            }

            // Strongest & weakest subjects across completed results
            let mut all_subs: Vec<(String, f64, String)> = Vec::new();
            for s in &sems {
                if let Some(arr) = s.get("subjects").and_then(|v| v.as_array()) {
                    for sub in arr {
                        if !sub.get("is_pending").and_then(|v| v.as_bool()).unwrap_or(false) {
                            let pct = val_to_f64(sub.get("percentage"), -1.0);
                            if pct >= 0.0 {
                                all_subs.push((
                                    val_to_string(sub.get("name")),
                                    pct,
                                    val_to_string(sub.get("grade")),
                                ));
                            }
                        }
                    }
                }
            }
            if !all_subs.is_empty() {
                all_subs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                let best = &all_subs[0];
                let worst = &all_subs[all_subs.len() - 1];
                lines.push(format!(
                    "\n- **Strongest Subject**: **{}** ({:.0}%, Grade **{}**)\n- **Needs Attention**: **{}** ({:.0}%, Grade **{}**)",
                    best.0, best.1, best.2, worst.0, worst.1, worst.2
                ));
            }
            return Ok(json!({
                "response": lines.join("\n"),
                "suggestions": ["Which subjects are below target?", "How is my attendance margin?", "What classes do I have today?"]
            }));
        }

        // 2. Timetable / Today / Busiest Day
        if q.contains("today") || q.contains("schedule") || q.contains("timetable") || q.contains("busiest") || q.contains("week") {
            let is_real_class = |s: &Value| -> bool {
                let stype = val_to_string(s.get("type")).to_lowercase();
                if ["break", "free", "lunch", "gap", "custom"].contains(&stype.as_str()) {
                    return false;
                }
                let sname = val_to_string(s.get("subject_name"));
                let sid = val_to_string(s.get("subject_id"));
                !sname.trim().is_empty() || !sid.trim().is_empty()
            };
            let tt = self.get_timetable(semester)?;
            let sched = tt.get("schedule").and_then(|v| v.as_object());
            if q.contains("busiest") || q.contains("week") {
                let mut counts: Vec<(String, usize)> = Vec::new();
                if let Some(m) = sched {
                    for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] {
                        let c = m
                            .get(day)
                            .and_then(|v| v.as_array())
                            .map(|a| a.iter().filter(|s| is_real_class(s)).count())
                            .unwrap_or(0);
                        counts.push((day.to_string(), c));
                    }
                }
                counts.sort_by(|a, b| b.1.cmp(&a.1));
                let mut lines = vec![format!("### Semester {} Weekly Load\n", semester)];
                for (d, c) in &counts {
                    lines.push(format!("- **{}**: {} scheduled class(es)", d, c));
                }
                if let Some((top_d, top_c)) = counts.first() {
                    if *top_c > 0 {
                        lines.push(format!("\nYour busiest day is **{}** with **{}** classes.", top_d, top_c));
                    }
                }
                return Ok(json!({
                    "response": lines.join("\n"),
                    "suggestions": ["What classes do I have today?", "Which subjects are below target?", "Show my CGPA breakdown"]
                }));
            }

            let mut today_slots: Vec<Value> = dash
                .get("today_classes")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter(|s| is_real_class(s))
                .collect();
            today_slots.sort_by_key(|s| parse_time_to_minutes(&val_to_string(s.get("start_time"))));
            if today_slots.is_empty() {
                return Ok(json!({
                    "response": format!("You have **no classes scheduled today** in Semester {}. Enjoy the free day or catch up on notes & practicals!", semester),
                    "suggestions": ["What is my busiest day this week?", "Check pending tasks & practicals", "How is my attendance margin?"]
                }));
            }
            let mut lines = vec![format!("### Today's Schedule (Semester {})\n", semester)];
            for s in &today_slots {
                let name = [s.get("subject_name"), s.get("label")]
                    .into_iter()
                    .map(val_to_string)
                    .find(|v| !v.trim().is_empty())
                    .unwrap_or_else(|| "Scheduled Class".to_string());
                let start = val_to_string(s.get("start_time"));
                let end = val_to_string(s.get("end_time"));
                let room = val_to_string(s.get("classroom"));
                let room_part = if room.trim().is_empty() { String::new() } else { format!(" · {}", room.trim()) };
                lines.push(format!("- **{}** ({} – {}{})", name.trim(), start, end, room_part));
            }
            return Ok(json!({
                "response": lines.join("\n"),
                "suggestions": ["Which subjects are below target?", "How is my attendance margin?", "What is my busiest day this week?"]
            }));
        }

        // 3. Tasks, Notes & Practicals
        if q.contains("task") || q.contains("todo") || q.contains("note") || q.contains("practical") || q.contains("assignment") || q.contains("deadline") || q.contains("course") {
            let notes = self.get_notes()?;
            let mut pending_tasks = Vec::new();
            let mut regular_notes = Vec::new();
            for n in &notes {
                if n.get("is_todo").and_then(|v| v.as_bool()).unwrap_or(false) {
                    if let Some(todos) = n.get("todos").and_then(|v| v.as_array()) {
                        for t in todos {
                            if !t.get("completed").and_then(|v| v.as_bool()).unwrap_or(false) {
                                pending_tasks.push(val_to_string(t.get("text")));
                            }
                        }
                    }
                } else {
                    regular_notes.push(val_to_string(n.get("title")));
                }
            }
            let mut prac_remaining = 0i64;
            let mut prac_subjects = 0usize;
            for s in &subjects {
                let cats = s.get("categories").and_then(|v| v.as_array());
                if cats.map(|a| a.iter().any(|x| x.as_str() == Some("Practical"))).unwrap_or(false) {
                    prac_subjects += 1;
                    let p_tot = val_to_i64(s.get("practicals").and_then(|p| p.get("total")), 10);
                    let p_done = val_to_i64(s.get("practicals").and_then(|p| p.get("completed")), 0);
                    prac_remaining += (p_tot - p_done).max(0);
                }
            }
            let courses = self.get_manual_courses()?;
            let mut lines = vec!["### Workspace Workload Overview\n".to_string()];
            lines.push(format!("- **Pending Tasks**: **{}** open item(s)", pending_tasks.len()));
            for t in pending_tasks.iter().take(5) {
                lines.push(format!("  - {}", t));
            }
            lines.push(format!("- **Practicals**: **{}** remaining across **{}** lab subject(s)", prac_remaining, prac_subjects));
            lines.push(format!("- **Study Notes**: **{}** saved note(s){}", regular_notes.len(), if regular_notes.is_empty() { String::new() } else { format!(" (latest: **{}**)", regular_notes[0]) }));
            lines.push(format!("- **Tracked Courses**: **{}** active/completed", courses.len()));

            return Ok(json!({
                "response": lines.join("\n"),
                "suggestions": ["How is my attendance margin?", "What classes do I have today?", "Show my CGPA breakdown"]
            }));
        }

        // 4. At-risk / Recovery plan
        if q.contains("risk") || q.contains("low") || q.contains("below") || q.contains("recover") || q.contains("danger") || q.contains("need") {
            if subjects.is_empty() {
                return Ok(json!({
                    "response": format!("No subjects are added for **Semester {}** yet. Add your courses on the Dashboard or import your backup JSON in Settings.", semester),
                    "suggestions": ["Show my CGPA breakdown", "Check pending tasks & practicals"]
                }));
            }
            if risky.is_empty() {
                return Ok(json!({
                    "response": format!("All **{}** tracked subjects in Semester {} are safely at or above your **{}%** goal!\n\n- **Overall Attendance**: **{:.1}%** ({}/{})\n- **Overall Safe Bunks Buffer**: **+{}** class(es)", subjects.len(), semester, target, overall, attended, total, safe_bunks),
                    "suggestions": ["How many classes can I skip per subject?", "What classes do I have today?", "Show my CGPA breakdown"]
                }));
            }
            let mut lines = vec![format!("### Recovery Plan (Target: {}%)\n", target)];
            for s in &risky {
                let s_att = (val_to_i64(s.get("attended"), 0) - val_to_i64(s.get("medical_leave_count"), 0)).max(0);
                let s_tot = (val_to_i64(s.get("total"), 0) - val_to_i64(s.get("medical_leave_count"), 0)).max(0);
                let pct = val_to_f64(s.get("attendance_percentage"), 0.0);
                let needed = if target >= 100 {
                    s_tot - s_att
                } else {
                    let num = (target * s_tot - 100 * s_att).max(0);
                    let den = (100 - target).max(1);
                    (num + den - 1) / den
                };
                lines.push(format!(
                    "- **{}**: **{:.1}%** ({}/{}) — attend next **{}** consecutive class(es)",
                    val_to_string(s.get("name")), pct, s_att, s_tot, needed
                ));
            }
            return Ok(json!({
                "response": lines.join("\n"),
                "suggestions": ["How is my attendance margin?", "What classes do I have today?", "Check pending tasks & practicals"]
            }));
        }

        // 5. Default / Attendance summary & per-subject bunk margin
        if subjects.is_empty() {
            return Ok(json!({
                "response": format!("Your **Semester {}** workspace is ready.\n\n- Add subjects on the Dashboard, or import your backup JSON in **Settings → Data**.\n- Once populated, I can compute exact recovery plans, safe bunk budgets, schedule insights, and CGPA breakdowns.", semester),
                "suggestions": ["Show my CGPA breakdown", "Check pending tasks & practicals"]
            }));
        }

        let mut lines = vec![format!(
            "### Semester {} Attendance Report\n\n- **Overall Attendance**: **{:.1}%** ({}/{} classes)\n- **Target Goal**: **{}%**\n- **Safe Bunks Buffer**: **+{}** class(es)\n- **Subjects Below Target**: **{}** / {}\n",
            semester, overall, attended, total, target, safe_bunks, risky.len(), subjects.len()
        )];

        for s in subjects.iter().take(8) {
            let s_att = (val_to_i64(s.get("attended"), 0) - val_to_i64(s.get("medical_leave_count"), 0)).max(0);
            let s_tot = (val_to_i64(s.get("total"), 0) - val_to_i64(s.get("medical_leave_count"), 0)).max(0);
            let pct = val_to_f64(s.get("attendance_percentage"), 0.0);
            let margin_str = if s_tot == 0 {
                "No logs".to_string()
            } else if pct >= target as f64 && target > 0 {
                let skip = ((s_att * 100) - (target * s_tot)).max(0) / target;
                format!("+{} safe", skip)
            } else {
                let num = (target * s_tot - 100 * s_att).max(0);
                let den = (100 - target).max(1);
                format!("need {}", (num + den - 1) / den)
            };
            lines.push(format!(
                "- **{}**: **{:.1}%** ({}/{}) — {}",
                val_to_string(s.get("name")), pct, s_att, s_tot, margin_str
            ));
        }

        Ok(json!({
            "response": lines.join("\n"),
            "suggestions": if !risky.is_empty() {
                vec!["Calculate recovery plan for risky subjects", "What classes do I have today?", "Show my CGPA breakdown"]
            } else {
                vec!["What classes do I have today?", "Check pending tasks & practicals", "Show my CGPA breakdown"]
            }
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(tag: &str) -> (DesktopDb, PathBuf) {
        let dir = std::env::temp_dir().join(format!("semester_test_{}_{}", tag, Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = DesktopDb::open(dir.join("test.db")).expect("open test db");
        (db, dir)
    }

    #[test]
    fn test_full_desktop_db_lifecycle_export_wipe_import_reset() {
        let (db, dir) = temp_db("lifecycle");

        // 1. Profile & threshold preferences
        let prof = db
            .update_profile(&json!({
                "name": "Kuber Bassi",
                "email": "me@kuberbassi.com",
                "enrollment_number": "00113302725",
                "college": "USICT",
                "course": "B.Tech",
                "branch": "CSE",
                "batch": "2023-2027",
                "current_semester": 5,
                "attendance_threshold": 80,
                "warning_threshold": 82
            }))
            .expect("update profile");
        assert_eq!(prof["name"], "Kuber Bassi");
        assert_eq!(prof["attendance_threshold"], 80);

        let prefs = db.update_preferences(&json!({ "accent_color": "indigo" })).expect("update prefs");
        assert_eq!(prefs["accent_color"], "indigo");
        assert_eq!(prefs["attendance_threshold"], 80);

        // 2. Subject CRUD + exact attendance math (present, absent, approved_medical, cancelled, edit, delete)
        let sub = db
            .add_subject(&json!({
                "name": "Operating Systems",
                "code": "CS-301",
                "semester": 5,
                "credits": 4,
                "categories": ["Theory"]
            }))
            .expect("add subject");
        let sid = sub["id"].as_str().unwrap().to_string();

        db.mark_attendance(&sid, "present", "2026-11-20", "", "", Some(5), "Lecture").unwrap();
        db.mark_attendance(&sid, "present", "2026-11-21", "", "", Some(5), "Lecture").unwrap();
        let abs_res = db
            .mark_attendance(&sid, "absent", "2026-11-22", "", "", Some(5), "Lecture")
            .unwrap();
        db.mark_attendance(&sid, "approved_medical", "2026-11-23", "Fever", "", Some(5), "Lecture").unwrap();
        db.mark_attendance(&sid, "cancelled", "2026-11-24", "", "", Some(5), "Lecture").unwrap();

        // Physical = 2 present, 1 absent (3 eligible); medical = 1 (raw attended=3, raw total=4)
        // Adjusted percentage = 2/3 = 66.67%
        let s_after = db.get_subject_by_id(&sid).unwrap().unwrap();
        assert_eq!(s_after["attended"], 3);
        assert_eq!(s_after["total"], 4);
        assert_eq!(s_after["medical_leave_count"], 1);
        let pct = s_after["attendance_percentage"].as_f64().unwrap();
        assert!((pct - 66.67).abs() < 0.05, "unexpected pct: {}", pct);

        // Edit absent -> present: now 3/3 eligible = 100%
        let abs_log_id = abs_res["log"]["_id"].as_str().unwrap().to_string();
        db.edit_attendance(&abs_log_id, "present", Some("Corrected"), None).unwrap();
        let s_edited = db.get_subject_by_id(&sid).unwrap().unwrap();
        assert_eq!(s_edited["attendance_percentage"].as_f64().unwrap(), 100.0);

        // 3. Timetable, manual course, notes, results
        db.save_timetable_slot(5, &json!({
            "day": "Monday",
            "start_time": "09:00",
            "end_time": "10:00",
            "subject_id": sid,
            "type": "Lecture",
            "classroom": "Room 305"
        })).unwrap();
        db.upsert_manual_course(None, &json!({
            "title": "Distributed Systems",
            "platform": "coursera",
            "url": "https://coursera.org",
            "progress": 60
        })).unwrap();
        db.save_note(&json!({
            "title": "Exam Checklist",
            "is_todo": true,
            "todos": [{ "id": "t1", "text": "Finish OS lab file", "completed": false }]
        })).unwrap();
        db.save_semester_results_batch(
            "00113302725",
            &json!({ "name": "Kuber Bassi", "institution": "USICT", "programme": "B.Tech CSE" }),
            &[json!({
                "semester_num": 1,
                "sgpa": 8.75,
                "subjects": [{ "code": "BS101", "name": "Physics", "credits": 4, "internal": "36", "external": "54", "total_marks": 90.0 }]
            })],
            "ipu_portal",
        ).unwrap();

        // Store DPAPI secrets (must NOT appear in export!)
        db.set_secret("gemini_api_key", "AIzaSecretTest1234").unwrap();
        db.set_secret("google_refresh_token", "refresh-secret-xyz").unwrap();

        // 4. Atomic export to directory
        let exp_meta = db.export_backup_to_dir(&dir).expect("export to dir");
        let exp_path = PathBuf::from(exp_meta["path"].as_str().unwrap());
        assert!(exp_path.exists());
        let exp_text = std::fs::read_to_string(&exp_path).unwrap();
        assert!(!exp_text.contains("AIzaSecretTest1234"), "API keys must NEVER leak into export JSON!");
        assert!(!exp_text.contains("refresh-secret-xyz"), "OAuth tokens must NEVER leak into export JSON!");
        let exported_json: Value = serde_json::from_str(&exp_text).unwrap();

        // 5. Reject malformed import BEFORE touching DB
        assert!(db.import_backup_json(&json!({ "random": 123 })).is_err());
        assert_eq!(db.get_subjects(Some(5)).unwrap().len(), 1);

        // 6. Wipe All Data -> tables empty, safety snapshot created, secrets intact for sync
        db.wipe_all_data().expect("wipe all data");
        assert!(db.get_subjects(Some(5)).unwrap().is_empty());
        assert!(db.get_notes().unwrap().is_empty());
        assert!(db.get_manual_courses().unwrap().is_empty());
        assert!(db.get_results_analytics().unwrap().is_null());
        let snaps: Vec<_> = std::fs::read_dir(dir.join("safety_backups")).unwrap().collect();
        assert!(!snaps.is_empty(), "Safety snapshot must exist before wipe");

        // 7. Re-import exported JSON -> 100% lossless restore!
        db.import_backup_json(&exported_json).expect("import exported json");
        assert_eq!(db.get_subjects(Some(5)).unwrap().len(), 1);
        assert_eq!(db.get_manual_courses().unwrap().len(), 1);
        assert_eq!(db.get_notes().unwrap().len(), 1);
        let restored_res = db.get_results_analytics().unwrap();
        assert_eq!(restored_res["cgpa"], "10.00");

        // 8. Legacy MongoDB `$oid`/`$date` export import compatibility
        let legacy = json!({
            "user_profile": { "name": "Legacy User", "current_semester": 3, "attendance_threshold": 75 },
            "subjects": [{
                "_id": { "$oid": "660000000000000000000001" },
                "name": "Data Structures",
                "code": "CS201",
                "semester": 3,
                "credits": 4
            }],
            "attendance_logs": [{
                "_id": { "$oid": "660000000000000000000002" },
                "subject_id": { "$oid": "660000000000000000000001" },
                "status": "present",
                "date": { "$date": "2026-10-01T00:00:00Z" }
            }]
        });
        db.import_backup_json(&legacy).expect("import legacy export");
        let leg_subs = db.get_subjects(Some(3)).unwrap();
        assert_eq!(leg_subs.len(), 1);
        assert_eq!(leg_subs[0]["attended"], 1);
        assert_eq!(leg_subs[0]["total"], 1);

        // 9. Full Account Reset -> wipes tables, DPAPI secrets, AND resets profile to defaults!
        let reset = db.reset_account_completely().expect("reset account");
        assert_eq!(reset["success"], true);
        assert!(db.get_subjects(None).unwrap().is_empty());
        assert!(db.get_secret("gemini_api_key").unwrap().is_none());
        assert!(db.get_secret("google_refresh_token").unwrap().is_none());
        let clean_prof = db.get_profile().unwrap();
        assert_eq!(clean_prof["name"], "Student");
        assert_eq!(clean_prof["email"], "");
        assert_eq!(clean_prof["enrollment_number"], "");
        assert_eq!(clean_prof["current_semester"], 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_chronological_timetable_multi_slot_and_legacy_cleanup_import() {
        let (db, dir) = temp_db("migration");

        // Pre-seed a local note & IPU result — importing a legacy backup that omits `notes`
        // & `semester_results` MUST preserve them!
        db.save_note(&json!({ "title": "Keep Me", "content": "Important local note" }))
            .expect("seed note");
        db.save_semester_results_batch(
            "00113302725",
            &json!({ "name": "Kuber Bassi" }),
            &[json!({
                "semester_num": 1,
                "sgpa": 8.5,
                "subjects": [{ "code": "BS-105", "name": "AP", "credits": 4, "total_marks": 85.0 }]
            })],
            "ipu_portal",
        )
        .expect("seed results");

        // 1. Legacy encrypted envelope should return a clear, helpful error
        let enc_err = db
            .import_backup_json(&json!({ "secure": true, "payload": "aa:bb", "checksum": "cc" }))
            .unwrap_err();
        assert!(enc_err.contains("encrypted"), "unexpected err: {}", enc_err);

        // 2. Import legacy-style payload with AM/PM timetable, two Friday DLCD slots,
        //    empty Sem 4 placeholder, sensitive web preferences, and auth_refresh logs
        let backup = json!({
            "user_profile": {
                "name": "Kuber Bassi",
                "email": "kuberbassi2007@gmail.com",
                "picture": "data:image/webp;base64,TESTAVATAR",
                "college": "HMRITM",
                "course": "B.Tech",
                "branch": "CSE",
                "batch": "2025",
                "enrollment_number": "00113302725",
                "admission_year": "2025",
                "current_semester": 3,
                "attendance_threshold": 60,
                "warning_threshold": 61,
                "biometrics": {}
            },
            "user_preferences": [{
                "preferences": {
                    "last_semester": 3,
                    "timetable_view": "grid",
                    "skills_filter": "all",
                    "auth_sessions": { "s1": { "token": "secret" } },
                    "google_drive_refresh_token": "enc_secret_token"
                }
            }],
            "subjects": [{
                "id": "sub-dlcd",
                "name": "Digital Logic and Computer Design",
                "code": "ECC-207",
                "classroom": "102",
                "semester": 3,
                "credits": 4,
                "attended": 2,
                "total": 4,
                "target": 60,
                "categories": ["Theory", "Assignment"],
                "practicals": { "total": 10 },
                "assignments": { "total": 4, "completed": 4, "hardcopy": true }
            }],
            "attendance_logs": [
                { "id": "l1", "subject_id": "sub-dlcd", "subject_name": "", "date": "2026-11-20", "status": "absent", "type": "class::11:50 AM", "semester": null },
                { "id": "l2", "subject_id": "sub-dlcd", "subject_name": "", "date": "2026-11-20", "status": "approved_medical", "type": "class::03:05 PM", "semester": null }
            ],
            "timetable": [
                {
                    "semester": 3,
                    "periods": [
                        { "id": "p1", "name": "1", "type": "class", "startTime": "08:30 AM", "endTime": "09:30 AM" },
                        { "id": "p5", "name": "4", "type": "class", "startTime": "11:50 AM", "endTime": "12:45 PM" },
                        { "id": "p7", "name": "Break", "type": "break", "startTime": "01:40 PM", "endTime": "02:10 PM" },
                        { "id": "p9", "name": "7", "type": "class", "startTime": "03:05 PM", "endTime": "04:00 PM" }
                    ],
                    "schedule": {
                        "Friday": [
                            { "id": "s-pm", "type": "class", "start_time": "03:05 PM", "end_time": "04:00 PM", "subject_id": "sub-dlcd" },
                            { "id": "s-brk", "type": "break", "start_time": "01:40 PM", "end_time": "02:10 PM", "subject_id": "" },
                            { "id": "s-am", "type": "class", "start_time": "11:50 AM", "end_time": "12:45 PM", "subject_id": "sub-dlcd" }
                        ]
                    }
                },
                {
                    "semester": 4,
                    "periods": [],
                    "schedule": {}
                }
            ],
            "system_logs": [
                { "id": "sl1", "action": "auth_refresh", "description": "Rotated web refresh token", "timestamp": "2026-11-26T17:00:00Z" },
                { "id": "sl2", "action": "Attendance Marked", "description": "Marked DLCD", "timestamp": "2026-11-20T12:00:00Z" }
            ]
        });

        let res = db.import_backup_json(&backup).expect("import legacy payload");
        assert_eq!(res["counts"]["subjects"], 1);
        assert_eq!(res["counts"]["attendance_logs"], 2);
        assert_eq!(res["counts"]["system_logs"], 1);

        // Local notes & IPU results preserved because backup omitted them (85 marks -> A+ = 9.00 SGPA)
        assert_eq!(db.get_notes().unwrap().len(), 1);
        assert_eq!(db.get_results_analytics().unwrap()["cgpa"], "9.00");

        // Profile + avatar + sanitized preferences restored (zero secrets or skills_filter)
        let prof = db.get_profile().unwrap();
        assert_eq!(prof["picture"], "data:image/webp;base64,TESTAVATAR");
        assert_eq!(prof["current_semester"], 3);
        assert_eq!(prof["preferences"]["timetable_view"], "grid");
        assert!(prof["preferences"].get("auth_sessions").is_none());
        assert!(prof["preferences"].get("google_drive_refresh_token").is_none());
        assert!(prof["preferences"].get("skills_filter").is_none());

        // Subject trackers normalized & medical_leave_count derived
        let subs = db.get_subjects(Some(3)).unwrap();
        assert_eq!(subs[0]["medical_leave_count"], 1);
        assert_eq!(subs[0]["practicals"]["completed"], 0);
        assert_eq!(subs[0]["practicals"]["hardcopy"], false);
        assert_eq!(subs[0]["assignments"]["completed"], 4);
        assert_eq!(subs[0]["assignments"]["hardcopy"], true);

        // Timetable chronologically sorted (11:50 AM -> 01:40 PM -> 03:05 PM) & names backfilled
        let tt3 = db.get_timetable(3).unwrap();
        let fri = tt3["schedule"]["Friday"].as_array().unwrap();
        assert_eq!(fri.len(), 3);
        assert_eq!(fri[0]["start_time"], "11:50 AM");
        assert_eq!(fri[0]["subject_name"], "Digital Logic and Computer Design");
        assert_eq!(fri[0]["classroom"], "102");
        assert_eq!(fri[1]["start_time"], "01:40 PM");
        assert_eq!(fri[2]["start_time"], "03:05 PM");

        // Empty Sem 4 shell did NOT overwrite default periods
        let tt4 = db.get_timetable(4).unwrap();
        assert!(!tt4["periods"].as_array().unwrap().is_empty());

        // Friday 2026-11-20 multi-slot matching binds each DLCD slot to its own distinct log!
        let classes = db.get_classes_for_date("2026-11-20", 3).unwrap();
        assert_eq!(classes.len(), 2);
        assert_eq!(classes[0]["attendance_type"], "class::11:50 AM");
        assert_eq!(classes[0]["marked_status"], "absent");
        assert_eq!(classes[0]["log_id"], "l1");
        assert_eq!(classes[1]["attendance_type"], "class::03:05 PM");
        assert_eq!(classes[1]["marked_status"], "approved_medical");
        assert_eq!(classes[1]["log_id"], "l2");

        // Legacy auth_refresh log filtered out
        let syslogs = db.get_system_logs(50, 0).unwrap();
        let items = syslogs["items"].as_array().unwrap();
        assert!(!items.iter().any(|x| x["action"] == "auth_refresh"));
        assert!(items.iter().any(|x| x["action"] == "Attendance Marked"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_optional_real_migration_file_roundtrip() {
        let Ok(path) = std::env::var("SEMESTER_VERIFY_MIGRATION_JSON") else {
            return;
        };
        let raw_text = std::fs::read_to_string(&path).expect("read migration json");
        let payload: Value = serde_json::from_str(&raw_text).expect("parse migration json");
        let (db, dir) = temp_db("real_migration");

        // 1. Import into fresh SQLite DB
        let import_res = db.import_backup_json(&payload).expect("import real migration");
        println!("REAL MIGRATION IMPORT COUNTS: {}", import_res["counts"]);
        assert_eq!(import_res["counts"]["subjects"], 35);
        assert_eq!(import_res["counts"]["attendance_logs"], 817);
        assert_eq!(import_res["counts"]["timetable_slots"], 135);
        assert_eq!(import_res["counts"]["manual_courses"], 12);
        assert_eq!(import_res["counts"]["system_logs"], 330);

        // 2. Verify profile & preferences
        let prof = db.get_profile().unwrap();
        assert_eq!(prof["name"], "Kuber Bassi");
        assert_eq!(prof["email"], "kuberbassi2007@gmail.com");
        assert_eq!(prof["college"], "HMRITM");
        assert_eq!(prof["enrollment_number"], "00113302725");
        assert_eq!(prof["current_semester"], 3);
        assert_eq!(prof["attendance_threshold"], 60);
        assert_eq!(prof["warning_threshold"], 61);
        assert!(prof["picture"].as_str().unwrap_or("").starts_with("data:image/webp;base64,"));
        assert_eq!(prof["preferences"]["timetable_view"], "grid");

        // 3. Verify Semester 3 Dashboard math matches exact records (78/236 = 33.05%, 96 medical leaves)
        let dash3 = db.get_dashboard_data(3).unwrap();
        assert_eq!(dash3["subjects"].as_array().unwrap().len(), 10);
        assert_eq!(dash3["medical_leave_count"], 96);
        assert_eq!(dash3["summary"]["total_attended"], 78);
        assert_eq!(dash3["summary"]["total_classes"], 236);
        assert!((dash3["overall_attendance"].as_f64().unwrap() - 33.05).abs() < 0.05);
        assert!((dash3["attendance_without_medical"].as_f64().unwrap() - 23.49).abs() < 0.05);

        // 4. Verify Sem 1 & Sem 2 subjects + timetables + chronological sorting
        assert_eq!(db.get_subjects(Some(1)).unwrap().len(), 12);
        assert_eq!(db.get_subjects(Some(2)).unwrap().len(), 13);
        let tt3 = db.get_timetable(3).unwrap();
        let fri = tt3["schedule"]["Friday"].as_array().unwrap();
        assert_eq!(fri.len(), 9);
        assert_eq!(fri[0]["start_time"], "08:30 AM");
        assert_eq!(fri[8]["start_time"], "03:05 PM");
        assert!(fri.iter().filter(|s| s["type"] == "class").all(|s| !s["subject_name"].as_str().unwrap_or("").is_empty()));

        // 5. Verify Friday 2026-11-20 multi-slot matching for DLCD (11:50 AM & 03:05 PM)
        let fri_classes = db.get_classes_for_date("2026-11-20", 3).unwrap();
        let dlcd_slots: Vec<&Value> = fri_classes
            .iter()
            .filter(|c| c["name"] == "Digital Logic and Computer Design")
            .collect();
        assert_eq!(dlcd_slots.len(), 2);
        assert_eq!(dlcd_slots[0]["attendance_type"], "class::11:50 AM");
        assert_eq!(dlcd_slots[0]["marked"], true);
        assert_eq!(dlcd_slots[1]["attendance_type"], "class::03:05 PM");
        assert_eq!(dlcd_slots[1]["marked"], true);
        assert_ne!(dlcd_slots[0]["log_id"], dlcd_slots[1]["log_id"]);

        // 6. Verify 12 courses & 330 cleaned system logs
        assert_eq!(db.get_manual_courses().unwrap().len(), 12);

        // 7. Full v2 canonical export -> wipe -> re-import lossless roundtrip!
        let (_, exported) = db.compute_content_hash().expect("export canonical");
        db.wipe_all_data().expect("wipe");
        let reimport = db.import_backup_json(&exported).expect("reimport");
        assert_eq!(reimport["counts"]["subjects"], 35);
        assert_eq!(reimport["counts"]["attendance_logs"], 817);
        assert_eq!(reimport["counts"]["timetable_slots"], 135);
        assert_eq!(reimport["counts"]["manual_courses"], 12);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_backup_export_never_leaks_secrets() {
        let dir = std::env::temp_dir().join(format!("semester_sec_test_{}", Uuid::new_v4()));
        let db = DesktopDb::open(dir.join("test.db")).expect("open db");
        db.set_secret("gemini_api_key", "AIzaSy_SUPER_SECRET_KEY_12345").unwrap();
        db.set_secret("groq_api_key", "gsk_SUPER_SECRET_GROQ_98765").unwrap();
        db.set_secret("google_refresh_token", "1//0gSUPER_SECRET_REFRESH_TOKEN").unwrap();
        db.set_secret("google_access_token", "ya29.SUPER_SECRET_ACCESS_TOKEN").unwrap();

        let (_, exported) = db.compute_content_hash().expect("export canonical");
        let serialized = serde_json::to_string(&exported).unwrap();
        assert!(!serialized.contains("AIzaSy_SUPER_SECRET"));
        assert!(!serialized.contains("gsk_SUPER_SECRET"));
        assert!(!serialized.contains("SUPER_SECRET_REFRESH"));
        assert!(!serialized.contains("SUPER_SECRET_ACCESS"));
        assert!(!serialized.contains("dpapi:v1:"));
        assert!(!serialized.contains("google_refresh_token"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_official_ipu_credit_weighted_gpa_from_dashboard_subjects() {
        let dir = std::env::temp_dir().join(format!("semester_ipu_gpa_test_{}", Uuid::new_v4()));
        let db = DesktopDb::open(dir.join("test.db")).expect("open db");

        // Add Attendance Dashboard subjects with exact official credits (note hyphenated codes)
        let s1 = db
            .add_subject(&json!({ "name": "Applied Mathematics I", "code": "BS-111", "semester": 1, "credits": 4 }))
            .unwrap();
        let _ = db
            .add_subject(&json!({ "name": "Human Values", "code": "HS-115", "semester": 1, "credits": 1 }))
            .unwrap();
        let _ = db
            .add_subject(&json!({ "name": "Applied Mathematics II", "code": "BS-112", "semester": 2, "credits": 3 }))
            .unwrap();
        let _ = db
            .add_subject(&json!({ "name": "Programming in C Lab", "code": "ES-156", "semester": 2, "credits": 1 }))
            .unwrap();

        // Save IPU portal results with hyphen-less codes (BS111, HS115, BS112, ES156) and NO portal credits
        let sems = vec![
            json!({
                "semester": 1,
                "subjects": [
                    { "code": "BS111", "name": "APPLIED MATHEMATICS-I", "internal": "20", "external": "42", "total_marks": 62.0, "max_marks": 100.0 },
                    { "code": "HS115", "name": "HUMAN VALUES", "internal": "25", "external": "71", "total_marks": 96.0, "max_marks": 100.0 }
                ]
            }),
            json!({
                "semester": 2,
                "subjects": [
                    { "code": "BS112", "name": "APPLIED MATHEMATICS-II", "internal": "22", "external": "58", "total_marks": 80.0, "max_marks": 100.0 },
                    { "code": "ES156", "name": "PROGRAMMING IN C LAB", "internal": "30", "external": "16", "total_marks": 46.0, "max_marks": 100.0 }
                ]
            }),
        ];

        let analytics = db
            .save_semester_results_batch("00113302725", &json!({ "name": "Test" }), &sems, "ipu_portal")
            .expect("save results");

        // Verify Ordinance 11 grades: 62->B+(7), 96->O(10), 80->A+(9), 46->C(5)
        // Sem 1: (4*7 + 1*10) / (4+1) = 38 / 5 = 7.60
        // Sem 2: (3*9 + 1*5) / (3+1) = 32 / 4 = 8.00
        // Credit-weighted CGPA: (38 + 32) / (5 + 4) = 70 / 9 = 7.78 (NOT unweighted avg (7.6+8.0)/2 = 7.80!)
        assert_eq!(analytics["creditsSyncedCount"], 4);
        assert_eq!(analytics["totalCredits"], 9);
        assert_eq!(analytics["semesters"][0]["sgpa"], "7.60");
        assert_eq!(analytics["semesters"][1]["sgpa"], "8.00");
        assert_eq!(analytics["semesters"][1]["subjects"][1]["grade"], "C");
        assert_eq!(analytics["semesters"][1]["subjects"][1]["grade_point"], 5);
        assert_eq!(analytics["cgpa"], "7.78");

        // Live sync test: change BS-111 credits from 4 -> 2 on Dashboard; Results CGPA updates immediately!
        db.update_subject(s1["_id"].as_str().unwrap(), &json!({ "credits": 2 })).unwrap();
        let refreshed = db.get_results_analytics().unwrap();
        // Sem 1 now: (2*7 + 1*10) / 3 = 24 / 3 = 8.00; Overall: (24 + 32) / 7 = 56 / 7 = 8.00
        assert_eq!(refreshed["totalCredits"], 7);
        assert_eq!(refreshed["semesters"][0]["sgpa"], "8.00");
        assert_eq!(refreshed["cgpa"], "8.00");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_drive_backup_restore_roundtrip_and_hash_sync() {
        let dir = std::env::temp_dir().join(format!("semester_drive_restore_{}", Uuid::new_v4()));
        let db = DesktopDb::open(dir.join("test.db")).expect("open db");

        let sub = db
            .add_subject(&json!({ "name": "Data Structures", "code": "CIC-209", "semester": 3, "credits": 4 }))
            .unwrap();
        let sid = sub["_id"].as_str().unwrap().to_string();
        db.mark_attendance(&sid, "present", "2026-11-20", "", "", Some(3), "class::10:30 AM")
            .unwrap();
        db.save_note(&json!({ "title": "Exam Prep", "content": "<p>Graphs</p>" })).unwrap();
        db.save_semester_results_batch(
            "00113302725",
            &json!({ "name": "Student" }),
            &[json!({
                "semester": 1,
                "subjects": [{ "code": "BS105", "name": "Physics", "internal": "24", "external": "68", "total_marks": 92.0 }]
            })],
            "ipu_portal",
        )
        .unwrap();

        let (orig_hash, drive_payload) = db.compute_content_hash().expect("export drive payload");
        db.wipe_all_data().expect("wipe");
        assert_eq!(db.get_subjects(None).unwrap().len(), 0);

        // Simulate Drive restore
        let imported = db.import_backup_json(&drive_payload).expect("restore drive payload");
        assert_eq!(imported["counts"]["subjects"], 1);
        assert_eq!(imported["counts"]["attendance_logs"], 1);
        assert_eq!(imported["counts"]["notes"], 1);
        assert_eq!(imported["counts"]["semester_results"], 1);

        let (restored_hash, _) = db.compute_content_hash().expect("hash after restore");
        assert_eq!(orig_hash, restored_hash, "restored DB hash must match Drive snapshot hash");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_credit_matcher_code_acronym_unset_zero_and_manual_override() {
        let (db, dir) = temp_db("credit_matcher");

        // 1. Subject with code ES-157 has unset 0 credits on Dashboard (like legacy migrated subjects)
        //    -> MUST NOT zero out Engineering Graphics-I; should fall back to Official IPU Scheme (2 Cr)!
        let eg_sub = db
            .add_subject(&json!({ "name": "EG", "code": "ES-157", "semester": 1, "credits": 0 }))
            .unwrap();
        // 2. Subject with NO code on Dashboard, abbreviated name "AM - II", explicit 3 Cr
        //    -> Smart Acronym/Expansion matcher matches "APPLIED MATHEMATICS - II" in Sem 2 (3 Cr, dashboard)!
        db.add_subject(&json!({ "name": "AM - II", "code": "", "semester": 2, "credits": 3 }))
            .unwrap();
        // 3. Subject with acronym "HV&E" and code "HS-115" with 2 Cr
        db.add_subject(&json!({ "name": "HV&E", "code": "HS-115", "semester": 1, "credits": 2 }))
            .unwrap();

        let sems = vec![
            json!({
                "semester": 1,
                "subjects": [
                    { "code": "ES157", "name": "ENGINEERING GRAPHICS - I", "internal": "36", "external": "50", "total_marks": 86.0 },
                    { "code": "HS115", "name": "HUMAN VALUES & ETHICS", "internal": "25", "external": "70", "total_marks": 95.0 }
                ]
            }),
            json!({
                "semester": 2,
                "subjects": [
                    { "code": "BS112", "name": "APPLIED MATHEMATICS - II", "internal": "24", "external": "56", "total_marks": 80.0 }
                ]
            }),
        ];

        let res = db
            .save_semester_results_batch("00113302725", &json!({ "name": "Test" }), &sems, "ipu_portal")
            .unwrap();

        // ES157 must NOT be 0! Engineering Graphics is a 1-credit lab-only subject (links matched_subject_id to eg_sub)
        let es157 = &res["semesters"][0]["subjects"][0];
        assert_eq!(es157["credits"], 1, "unset 0 on Dashboard must never zero out ES157");
        assert_eq!(es157["credit_source"], "ipu_scheme");
        assert_eq!(es157["matched_subject_id"], eg_sub["id"]);

        // Smart fallback rules when credits are unknown (not in Dashboard or scheme):
        // Theory -> 3, Lab -> 1, Engineering Graphics -> 1, NUES / HVPE -> 2
        assert_eq!(default_ipu_credits_for_code_and_name("XX301", "Compiler Design").0, 3);
        assert_eq!(default_ipu_credits_for_code_and_name("XX351", "Compiler Design Lab").0, 1);
        assert_eq!(default_ipu_credits_for_code_and_name("XX199", "Engineering Graphics").0, 1);
        assert_eq!(default_ipu_credits_for_code_and_name("XX118", "HVPE (NUES)").0, 2);

        // HS115 matched by code from Dashboard (2 Cr)
        assert_eq!(res["semesters"][0]["subjects"][1]["credits"], 2);
        assert_eq!(res["semesters"][0]["subjects"][1]["credit_source"], "dashboard");

        // BS112 matched by smart abbreviation matcher ("AM - II" <-> "APPLIED MATHEMATICS - II") even with empty code!
        assert_eq!(res["semesters"][1]["subjects"][0]["credits"], 3);
        assert_eq!(res["semesters"][1]["subjects"][0]["credit_source"], "dashboard");

        // Inline manual override in Results updates BOTH Results AND the linked Dashboard subject!
        let updated = db
            .update_result_subject_credit(1, "ES157", "ENGINEERING GRAPHICS - I", 1)
            .unwrap();
        assert_eq!(updated["semesters"][0]["subjects"][0]["credits"], 1);
        assert_eq!(updated["semesters"][0]["subjects"][0]["credit_source"], "manual");
        let synced_dash = db.get_subject_by_id(eg_sub["id"].as_str().unwrap()).unwrap().unwrap();
        assert_eq!(synced_dash["credits"], 1, "Results credit edit must sync back to Dashboard subject");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_two_way_sync_converges_two_offline_sqlite_databases() {
        let (laptop, dir_l) = temp_db("sync_laptop");
        let (phone, dir_p) = temp_db("sync_phone");

        // 1. Seed initial shared workspace on Laptop and mirror onto Phone (simulating initial cloud link)
        laptop
            .update_profile(&json!({ "name": "Kuber Bassi", "college": "HMRITM", "current_semester": 3 }))
            .unwrap();
        let ds = laptop
            .add_subject(&json!({ "name": "Data Structures", "code": "CIC-209", "semester": 3, "credits": 4 }))
            .unwrap();
        let ds_id = ds["id"].as_str().unwrap().to_string();
        laptop
            .mark_attendance(&ds_id, "present", "2026-11-20", "", "", Some(3), "class::09:00 AM")
            .unwrap();
        let old_note = laptop
            .save_note(&json!({ "title": "Old Note", "content": "To be deleted on laptop" }))
            .unwrap();
        let old_note_id = old_note["id"].as_str().unwrap().to_string();

        let (_, initial_snap) = laptop.compute_content_hash().unwrap();
        phone.import_backup_json(&initial_snap).unwrap();

        // Wait 5ms so subsequent offline timestamps strictly post-date initial state
        std::thread::sleep(std::time::Duration::from_millis(10));

        // 2. BOTH devices go offline and make diverging edits + deletions!
        // Laptop: updates DS credits 4 -> 3, marks 2026-11-27 Present, adds Laptop note, deletes Old Note
        laptop.update_subject(&ds_id, &json!({ "credits": 3, "syllabus": "Graphs & Trees" })).unwrap();
        laptop
            .mark_attendance(&ds_id, "present", "2026-11-27", "Great lecture", "", Some(3), "class::09:00 AM")
            .unwrap();
        laptop.save_note(&json!({ "title": "Laptop Note", "content": "Exam schedule" })).unwrap();
        laptop.delete_note(&old_note_id).unwrap();

        // Phone: marks 2026-11-28 Absent on SAME subject, adds new OS subject, syncs Sem 2 results
        phone
            .mark_attendance(&ds_id, "absent", "2026-11-28", "Sick", "", Some(3), "class::10:00 AM")
            .unwrap();
        phone
            .add_subject(&json!({ "name": "Operating Systems", "code": "CIC-211", "semester": 3, "credits": 4 }))
            .unwrap();
        phone
            .save_semester_results_batch(
                "00113302725",
                &json!({ "name": "Kuber Bassi" }),
                &[json!({
                    "semester": 2,
                    "subjects": [{ "code": "BS112", "name": "APPLIED MATHEMATICS - II", "internal": "25", "external": "65", "total_marks": 90.0 }]
                })],
                "ipu_portal",
            )
            .unwrap();

        // 3. Both devices come back online & run 2-way merge via shared `semester-core` CRDT engine!
        let (_, laptop_snap) = laptop.compute_content_hash().unwrap();
        let (_, phone_snap) = phone.compute_content_hash().unwrap();

        let merged_for_laptop =
            semester_core::sync::merge_workspace_snapshots(&laptop_snap, &phone_snap).unwrap();
        let merged_for_phone =
            semester_core::sync::merge_workspace_snapshots(&phone_snap, &laptop_snap).unwrap();
        assert_eq!(
            merged_for_laptop.snapshot, merged_for_phone.snapshot,
            "Both devices must compute byte-identical merged snapshots"
        );

        laptop.apply_merged_snapshot(&merged_for_laptop.snapshot).unwrap();
        phone.apply_merged_snapshot(&merged_for_phone.snapshot).unwrap();

        // 4. Verify BOTH SQLite DBs converged to the EXACT SAME content hash and ZERO lost data!
        let (hash_l, _) = laptop.compute_content_hash().unwrap();
        let (hash_p, _) = phone.compute_content_hash().unwrap();
        assert_eq!(hash_l, hash_p, "Converged SQLite hashes must be 100% identical");

        // Verify DS subject on both DBs:
        // - credits == 3 & syllabus == "Graphs & Trees" (from Laptop)
        // - attended == 2, total == 3 (initial Present + Laptop Present + Phone Absent — ZERO lost marks!)
        let ds_l = laptop.get_subject_by_id(&ds_id).unwrap().unwrap();
        assert_eq!(ds_l["credits"], 3);
        assert_eq!(ds_l["syllabus"], "Graphs & Trees");
        assert_eq!(ds_l["attended"], 2);
        assert_eq!(ds_l["total"], 3);

        // Both subjects present, Old Note stayed deleted via tombstone, Laptop Note kept, Sem 2 results kept!
        assert_eq!(laptop.get_subjects(Some(3)).unwrap().len(), 2);
        let notes_l = laptop.get_notes().unwrap();
        assert_eq!(notes_l.len(), 1);
        assert_eq!(notes_l[0]["title"], "Laptop Note");
        assert_eq!(laptop.get_results_analytics().unwrap()["cgpa"], "10.00");

        let _ = std::fs::remove_dir_all(&dir_l);
        let _ = std::fs::remove_dir_all(&dir_p);
    }
}
