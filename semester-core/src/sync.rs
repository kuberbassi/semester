use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::db::Database;
use crate::models::{AttendanceLog, Note, SemesterResultData, Subject, SyncStats, TimetableSlot};

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

/// Tombstone marker used by lossless 2-way sync so deletions propagate cleanly
/// across Desktop and Android without resurrecting deleted records.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncTombstone {
    pub entity: String,
    pub key: String,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct MergeWorkspaceStats {
    pub subjects_merged: usize,
    pub attendance_logs_merged: usize,
    pub timetable_slots_merged: usize,
    pub notes_merged: usize,
    pub manual_courses_merged: usize,
    pub semester_results_merged: usize,
    pub tombstones_active: usize,
    pub conflicts_resolved: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeWorkspaceResult {
    pub snapshot: Value,
    pub stats: MergeWorkspaceStats,
    pub changed_from_local: bool,
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
        if db
            .mark_attendance(&l.id, &l.subject_id, &l.date, l.status, l.notes.clone(), &l.log_type)
            .is_ok()
        {
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
    let payload = QrTimetablePayload { v: 1, slots };
    serde_json::to_string(&payload).map_err(|e| e.to_string())
}

/// Decode scanned QR Code JSON into timetable slots
pub fn import_timetable_qr_string(payload_str: &str) -> Result<Vec<TimetableSlot>, String> {
    let payload: QrTimetablePayload = serde_json::from_str(payload_str).map_err(|e| e.to_string())?;
    Ok(payload.slots)
}

// ═════════════════════════════════════════════════════════════════════════════
// LOSSLESS 2-WAY CRDT / LWW + TOMBSTONE MERGE CORE (Desktop + Android UniFFI)
// ═════════════════════════════════════════════════════════════════════════════

/// Howard Hinnant's exact civil-date-to-days algorithm (days since 1970-01-01).
fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let y = year - if month <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let m = month as u64;
    let d = day as u64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + (doe as i64) - 719_468
}

/// Parses an RFC 3339 / ISO 8601 timestamp (including fractional seconds and `+HH:MM` / `-HH:MM` / `Z`
/// offsets) into UTC nanoseconds since Unix epoch for exact cross-timezone ordering.
pub fn parse_rfc3339_utc_nanos(raw: &str) -> Option<i128> {
    let s = raw.trim();
    if s.len() < 10 {
        return None;
    }
    let b = s.as_bytes();
    if b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let year: i64 = s[0..4].parse().ok()?;
    let month: u32 = s[5..7].parse().ok()?;
    let day: u32 = s[8..10].parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let days = days_from_civil(year, month, day);
    if s.len() == 10 {
        return Some((days as i128) * 86_400 * 1_000_000_000);
    }

    if s.len() < 19 || (b[10] != b'T' && b[10] != b't' && b[10] != b' ') || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let hour: i64 = s[11..13].parse().ok()?;
    let min: i64 = s[14..16].parse().ok()?;
    let sec: i64 = s[17..19].parse().ok()?;
    if !(0..=23).contains(&hour) || !(0..=59).contains(&min) || !(0..=60).contains(&sec) {
        return None;
    }

    let mut rest = &s[19..];
    let mut nanos: i64 = 0;
    if let Some(after_dot) = rest.strip_prefix('.') {
        let digit_len = after_dot.bytes().take_while(|c| c.is_ascii_digit()).count();
        let frac = &after_dot[..digit_len];
        let mut scale: i64 = 100_000_000;
        for ch in frac.bytes().take(9) {
            nanos += ((ch - b'0') as i64) * scale;
            scale /= 10;
        }
        rest = &after_dot[digit_len..];
    }

    let mut offset_secs: i64 = 0;
    if let Some(first) = rest.as_bytes().first().copied() {
        if first == b'Z' || first == b'z' {
            offset_secs = 0;
        } else if first == b'+' || first == b'-' {
            let sign: i64 = if first == b'+' { 1 } else { -1 };
            let tz = &rest[1..];
            let (oh, om): (i64, i64) = if tz.len() >= 5 && tz.as_bytes()[2] == b':' {
                (tz[0..2].parse().ok()?, tz[3..5].parse().ok()?)
            } else if tz.len() >= 4 {
                (tz[0..2].parse().ok()?, tz[2..4].parse().ok()?)
            } else {
                (0, 0)
            };
            offset_secs = sign * (oh * 3600 + om * 60);
        }
    }

    let utc_secs = (days as i128) * 86_400 + (hour as i128) * 3600 + (min as i128) * 60 + (sec as i128)
        - (offset_secs as i128);
    Some(utc_secs * 1_000_000_000 + (nanos as i128))
}

fn cmp_timestamps(a: &str, b: &str) -> std::cmp::Ordering {
    match (parse_rfc3339_utc_nanos(a), parse_rfc3339_utc_nanos(b)) {
        (Some(na), Some(nb)) => na.cmp(&nb).then_with(|| a.cmp(b)),
        (Some(_), None) => std::cmp::Ordering::Greater,
        (None, Some(_)) => std::cmp::Ordering::Less,
        (None, None) => a.cmp(b),
    }
}

/// Garbage-collects tombstones strictly older than `max_age_days` relative to `reference_iso`.
/// Intended for periodic local SQLite maintenance (NOT called inside `merge_workspace_snapshots`
/// so the merge operator remains strictly associative across arbitrary merge orders).
pub fn prune_tombstones(tombstones: &[SyncTombstone], reference_iso: &str, max_age_days: i64) -> Vec<SyncTombstone> {
    let Some(ref_nanos) = parse_rfc3339_utc_nanos(reference_iso) else {
        return tombstones.to_vec();
    };
    let cutoff = ref_nanos - (max_age_days.max(1) as i128) * 86_400 * 1_000_000_000;
    tombstones
        .iter()
        .filter(|t| parse_rfc3339_utc_nanos(&t.deleted_at).map(|n| n >= cutoff).unwrap_or(true))
        .cloned()
        .collect()
}

fn val_str(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn val_i64(v: Option<&Value>, fallback: i64) -> i64 {
    match v {
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f.round() as i64)).unwrap_or(fallback),
        Some(Value::String(s)) => s.trim().parse::<f64>().map(|f| f.round() as i64).unwrap_or(fallback),
        _ => fallback,
    }
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

fn calc_pct(attended: i64, total: i64) -> f64 {
    if total <= 0 {
        return 0.0;
    }
    (((attended.max(0) as f64) / (total as f64)) * 10000.0).round() / 100.0
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

fn canonical_json(v: &Value) -> String {
    serde_json::to_string(v).unwrap_or_default()
}

fn item_ts(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        let s = val_str(v.get(*k));
        if !s.trim().is_empty() {
            return s;
        }
    }
    String::new()
}

/// Deterministic total-order LWW selector:
/// 1. Newer UTC RFC3339 timestamp wins.
/// 2. On exact timestamp tie, lexicographically greater canonical JSON wins.
/// Guarantees strict commutativity, associativity, and idempotency.
fn pick_lww(a: Value, b: Value, ts_keys: &[&str], conflicts: &mut usize) -> Value {
    if a == b {
        return a;
    }
    *conflicts += 1;
    let ta = item_ts(&a, ts_keys);
    let tb = item_ts(&b, ts_keys);
    match cmp_timestamps(&ta, &tb) {
        std::cmp::Ordering::Greater => a,
        std::cmp::Ordering::Less => b,
        std::cmp::Ordering::Equal => {
            if canonical_json(&a) >= canonical_json(&b) {
                a
            } else {
                b
            }
        }
    }
}

fn extract_tombstones(root: &Value, out: &mut BTreeMap<(String, String), String>) {
    if let Some(arr) = root.get("tombstones").and_then(|v| v.as_array()) {
        for item in arr {
            let entity = val_str(item.get("entity")).trim().to_lowercase();
            let key = val_str(item.get("key")).trim().to_string();
            let deleted_at = val_str(item.get("deleted_at")).trim().to_string();
            if entity.is_empty() || key.is_empty() || deleted_at.is_empty() {
                continue;
            }
            let entry = out.entry((entity, key)).or_insert_with(|| deleted_at.clone());
            if cmp_timestamps(&deleted_at, entry) == std::cmp::Ordering::Greater {
                *entry = deleted_at;
            }
        }
    }
}

/// Returns true if any matching tombstone has `deleted_at >= item_updated_at`.
/// If the item was edited strictly AFTER `deleted_at`, it resurrects cleanly.
fn is_deleted_by_tombstone(
    tombstones: &BTreeMap<(String, String), String>,
    entity: &str,
    keys: &[String],
    item_updated_at: &str,
) -> bool {
    let mut latest_del: Option<&str> = None;
    for k in keys {
        if k.is_empty() {
            continue;
        }
        if let Some(del_ts) = tombstones.get(&(entity.to_string(), k.clone())) {
            latest_del = match latest_del {
                None => Some(del_ts.as_str()),
                Some(prev) => {
                    if cmp_timestamps(del_ts, prev) == std::cmp::Ordering::Greater {
                        Some(del_ts.as_str())
                    } else {
                        Some(prev)
                    }
                }
            };
        }
    }
    let Some(del_ts) = latest_del else {
        return false;
    };
    if item_updated_at.trim().is_empty() {
        return true;
    }
    cmp_timestamps(del_ts, item_updated_at) != std::cmp::Ordering::Less
}

fn is_uninitialized_profile(p: &Map<String, Value>) -> bool {
    let name = val_str(p.get("name"));
    let email = val_str(p.get("email"));
    let enroll = val_str(p.get("enrollment_number"));
    let college = val_str(p.get("college"));
    let branch = val_str(p.get("branch"));
    let course = val_str(p.get("course"));
    (name.trim().is_empty() || name.trim() == "Student")
        && email.trim().is_empty()
        && enroll.trim().is_empty()
        && college.trim().is_empty()
        && branch.trim().is_empty()
        && course.trim().is_empty()
}

fn merge_profiles(local: Option<&Value>, remote: Option<&Value>, conflicts: &mut usize) -> Value {
    let lp = local.and_then(|v| v.as_object()).cloned().unwrap_or_default();
    let rp = remote.and_then(|v| v.as_object()).cloned().unwrap_or_default();
    if lp.is_empty() {
        return Value::Object(rp);
    }
    if rp.is_empty() {
        return Value::Object(lp);
    }

    let l_uninit = is_uninitialized_profile(&lp);
    let r_uninit = is_uninitialized_profile(&rp);
    if l_uninit && !r_uninit {
        return Value::Object(rp);
    }
    if r_uninit && !l_uninit {
        return Value::Object(lp);
    }

    let l_val = Value::Object(lp.clone());
    let r_val = Value::Object(rp.clone());
    let (winner, loser) = {
        let lt = item_ts(&l_val, &["updated_at"]);
        let rt = item_ts(&r_val, &["updated_at"]);
        let l_wins = match cmp_timestamps(&lt, &rt) {
            std::cmp::Ordering::Greater => true,
            std::cmp::Ordering::Less => false,
            std::cmp::Ordering::Equal => canonical_json(&l_val) >= canonical_json(&r_val),
        };
        if l_val != r_val {
            *conflicts += 1;
        }
        if l_wins {
            (lp, rp)
        } else {
            (rp, lp)
        }
    };

    let mut merged = winner.clone();

    // Never wipe a non-empty identity field with an empty string from a partially initialized device
    for field in [
        "user_id",
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
        let wv = val_str(winner.get(field));
        let lv = val_str(loser.get(field));
        let w_placeholder = wv.trim().is_empty()
            || (field == "name" && wv.trim() == "Student")
            || (field == "user_id" && wv.trim() == "local-owner");
        let l_placeholder = lv.trim().is_empty()
            || (field == "name" && lv.trim() == "Student")
            || (field == "user_id" && lv.trim() == "local-owner");
        if w_placeholder && !l_placeholder {
            merged.insert(field.to_string(), Value::String(lv));
        }
    }

    // Earliest created_at, latest updated_at
    let lc = val_str(loser.get("created_at"));
    let wc = val_str(winner.get("created_at"));
    if !lc.is_empty() && (wc.is_empty() || cmp_timestamps(&lc, &wc) == std::cmp::Ordering::Less) {
        merged.insert("created_at".to_string(), Value::String(lc));
    }
    let lu = val_str(loser.get("updated_at"));
    let wu = val_str(winner.get("updated_at"));
    if !lu.is_empty() && (wu.is_empty() || cmp_timestamps(&lu, &wu) == std::cmp::Ordering::Greater) {
        merged.insert("updated_at".to_string(), Value::String(lu));
    }

    // Merge preferences map (loser keys filled in, winner keys take precedence)
    let mut prefs = Map::new();
    if let Some(lp_obj) = loser.get("preferences").and_then(|v| v.as_object()) {
        for (k, v) in lp_obj {
            if !v.is_null() {
                prefs.insert(k.clone(), v.clone());
            }
        }
    }
    if let Some(wp_obj) = winner.get("preferences").and_then(|v| v.as_object()) {
        for (k, v) in wp_obj {
            if !v.is_null() {
                prefs.insert(k.clone(), v.clone());
            }
        }
    }
    if !prefs.is_empty() {
        merged.insert("preferences".to_string(), Value::Object(prefs));
    }

    Value::Object(merged)
}

/// Computes per-subject log delta sums `(attended, total, medical)` for a single snapshot.
fn sum_log_deltas_for_snapshot(root: &Value) -> HashMap<String, (i64, i64, i64)> {
    let mut sums: HashMap<String, (i64, i64, i64)> = HashMap::new();
    let mut seen: HashSet<String> = HashSet::new();
    if let Some(logs) = root.get("attendance_logs").and_then(|v| v.as_array()) {
        for l in logs {
            let sid = val_str(l.get("subject_id").or_else(|| l.get("subjectId")));
            let date_raw = val_str(l.get("date"));
            let date = if date_raw.len() >= 10 { &date_raw[..10] } else { &date_raw };
            if sid.is_empty() || date.is_empty() {
                continue;
            }
            let ltype = {
                let t = val_str(l.get("type").or_else(|| l.get("log_type")));
                if t.trim().is_empty() { "lecture".to_string() } else { t.trim().to_lowercase() }
            };
            let key = format!("{}|{}|{}", sid, date, ltype);
            if !seen.insert(key) {
                continue;
            }
            let (da, dt, dm) = status_deltas(&val_str(l.get("status")));
            let e = sums.entry(sid).or_insert((0, 0, 0));
            e.0 += da;
            e.1 += dt;
            e.2 += dm;
        }
    }
    sums
}

#[derive(Clone)]
struct SubjectWithBaseline {
    value: Value,
    base_att: i64,
    base_tot: i64,
    base_med: i64,
}

fn subject_intrinsic_tiebreak_key(s: &SubjectWithBaseline) -> String {
    let mut cleaned = s.value.clone();
    if let Some(obj) = cleaned.as_object_mut() {
        obj.remove("attended");
        obj.remove("total");
        obj.remove("medical_leave_count");
        obj.remove("attendance_percentage");
        obj.remove("status_message");
        obj.insert("__base".to_string(), json!([s.base_att, s.base_tot, s.base_med]));
    }
    canonical_json(&cleaned)
}

fn pick_subject_lww(a: SubjectWithBaseline, b: SubjectWithBaseline, conflicts: &mut usize) -> SubjectWithBaseline {
    let ka = subject_intrinsic_tiebreak_key(&a);
    let kb = subject_intrinsic_tiebreak_key(&b);
    if ka == kb {
        return a;
    }
    *conflicts += 1;
    let ta = item_ts(&a.value, &["updated_at", "created_at"]);
    let tb = item_ts(&b.value, &["updated_at", "created_at"]);
    match cmp_timestamps(&ta, &tb) {
        std::cmp::Ordering::Greater => a,
        std::cmp::Ordering::Less => b,
        std::cmp::Ordering::Equal => {
            if ka >= kb {
                a
            } else {
                b
            }
        }
    }
}

fn collect_subjects(
    root: &Value,
    log_sums: &HashMap<String, (i64, i64, i64)>,
    tombstones: &BTreeMap<(String, String), String>,
    out: &mut BTreeMap<String, SubjectWithBaseline>,
    conflicts: &mut usize,
) {
    let Some(subs) = root.get("subjects").and_then(|v| v.as_array()) else {
        return;
    };
    for raw in subs {
        let id = val_str(raw.get("id").or_else(|| raw.get("_id")));
        if id.is_empty() {
            continue;
        }
        let upd = item_ts(raw, &["updated_at", "created_at"]);
        if is_deleted_by_tombstone(tombstones, "subject", &[id.clone()], &upd) {
            continue;
        }
        let (la, lt, lm) = log_sums.get(&id).copied().unwrap_or((0, 0, 0));
        let att = val_i64(raw.get("attended"), 0);
        let tot = val_i64(raw.get("total"), 0);
        let med = val_i64(raw.get("medical_leave_count"), 0);
        let candidate = SubjectWithBaseline {
            value: raw.clone(),
            base_att: att - la,
            base_tot: tot - lt,
            base_med: med - lm,
        };
        if let Some(prev) = out.remove(&id) {
            out.insert(id, pick_subject_lww(prev, candidate, conflicts));
        } else {
            out.insert(id, candidate);
        }
    }
}

fn collect_attendance_logs(
    root: &Value,
    valid_subjects: &BTreeMap<String, SubjectWithBaseline>,
    tombstones: &BTreeMap<(String, String), String>,
    out: &mut BTreeMap<String, Value>,
    conflicts: &mut usize,
) {
    let Some(logs) = root.get("attendance_logs").and_then(|v| v.as_array()) else {
        return;
    };
    for raw in logs {
        let sid = val_str(raw.get("subject_id").or_else(|| raw.get("subjectId")));
        if sid.is_empty() || !valid_subjects.contains_key(&sid) {
            continue;
        }
        let date_raw = val_str(raw.get("date"));
        let date = if date_raw.len() >= 10 {
            date_raw[..10].to_string()
        } else {
            date_raw
        };
        if date.is_empty() {
            continue;
        }
        let ltype = {
            let t = val_str(raw.get("type").or_else(|| raw.get("log_type")));
            if t.trim().is_empty() { "Lecture".to_string() } else { t.trim().to_string() }
        };
        let nat_key = format!("{}|{}|{}", sid, date, ltype.to_lowercase());
        let lid = val_str(raw.get("id").or_else(|| raw.get("_id")));
        let ts = item_ts(raw, &["timestamp", "updated_at"]);
        if is_deleted_by_tombstone(
            tombstones,
            "attendance_log",
            &[lid.clone(), nat_key.clone()],
            &ts,
        ) {
            continue;
        }

        let mut normalized = raw.clone();
        if let Some(obj) = normalized.as_object_mut() {
            obj.insert("date".to_string(), json!(date));
            obj.insert("type".to_string(), json!(ltype));
            if let Some(sub) = valid_subjects.get(&sid) {
                let sname = val_str(sub.value.get("name"));
                if !sname.is_empty() {
                    obj.insert("subject_name".to_string(), json!(sname));
                }
            }
        }

        if let Some(prev) = out.remove(&nat_key) {
            out.insert(nat_key, pick_lww(prev, normalized, &["timestamp", "updated_at"], conflicts));
        } else {
            out.insert(nat_key, normalized);
        }
    }
}

fn merge_timetables(
    local: &Value,
    remote: &Value,
    valid_subjects: &BTreeMap<String, SubjectWithBaseline>,
    tombstones: &BTreeMap<(String, String), String>,
    conflicts: &mut usize,
) -> (Vec<Value>, usize) {
    // semester -> (periods_updated_at, periods_json)
    let mut periods_by_sem: BTreeMap<i64, (String, Value)> = BTreeMap::new();
    // (semester, day, start_lower) -> slot Value
    let mut slots_by_key: BTreeMap<(i64, String, String), Value> = BTreeMap::new();
    let mut touched_sems: HashSet<i64> = HashSet::new();

    for root in [local, remote] {
        let Some(tts) = root
            .get("timetable")
            .or_else(|| root.get("timetables"))
            .and_then(|v| v.as_array())
        else {
            continue;
        };
        for tt in tts {
            let sem = val_i64(tt.get("semester"), 1).clamp(1, 8);
            touched_sems.insert(sem);
            let p_upd = item_ts(tt, &["periods_updated_at", "updated_at"]);
            if let Some(periods) = tt.get("periods").and_then(|v| v.as_array()).filter(|a| !a.is_empty()) {
                let p_val = Value::Array(periods.clone());
                match periods_by_sem.get(&sem) {
                    None => {
                        periods_by_sem.insert(sem, (p_upd.clone(), p_val));
                    }
                    Some((prev_ts, prev_val)) => {
                        if *prev_val == p_val {
                            if cmp_timestamps(&p_upd, prev_ts) == std::cmp::Ordering::Greater {
                                periods_by_sem.insert(sem, (p_upd.clone(), p_val));
                            }
                        } else {
                            *conflicts += 1;
                            let pick_new = match cmp_timestamps(&p_upd, prev_ts) {
                                std::cmp::Ordering::Greater => true,
                                std::cmp::Ordering::Less => false,
                                std::cmp::Ordering::Equal => canonical_json(&p_val) > canonical_json(prev_val),
                            };
                            if pick_new {
                                periods_by_sem.insert(sem, (p_upd.clone(), p_val));
                            }
                        }
                    }
                }
            }

            if let Some(sched) = tt.get("schedule").and_then(|v| v.as_object()) {
                for (day, arr_val) in sched {
                    let Some(arr) = arr_val.as_array() else { continue };
                    for slot in arr {
                        let start = val_str(slot.get("start_time").or_else(|| slot.get("startTime")));
                        if start.trim().is_empty() {
                            continue;
                        }
                        let stype = {
                            let st = val_str(slot.get("type")).to_lowercase();
                            if st.is_empty() { "class".to_string() } else { st }
                        };
                        let sid = val_str(slot.get("subject_id").or_else(|| slot.get("subjectId")));
                        if stype == "class" && !sid.is_empty() && !valid_subjects.contains_key(&sid) {
                            // Drop slots referencing tombstoned subjects
                            if is_deleted_by_tombstone(tombstones, "subject", &[sid.clone()], "") {
                                continue;
                            }
                        }
                        let slot_id = val_str(slot.get("id").or_else(|| slot.get("_id")));
                        let nat_key = format!("{}|{}|{}", sem, day, start.trim().to_lowercase());
                        let slot_ts = item_ts(slot, &["updated_at", "timestamp"]);
                        if is_deleted_by_tombstone(
                            tombstones,
                            "timetable_slot",
                            &[slot_id.clone(), nat_key.clone()],
                            &slot_ts,
                        ) {
                            continue;
                        }

                        let mut normalized = slot.clone();
                        if let Some(obj) = normalized.as_object_mut() {
                            if stype == "class" && !sid.is_empty() {
                                if let Some(sub) = valid_subjects.get(&sid) {
                                    let sname = val_str(sub.value.get("name"));
                                    if !sname.is_empty() {
                                        obj.insert("subject_name".to_string(), json!(sname));
                                    }
                                }
                            }
                        }

                        let key = (sem, day.clone(), start.trim().to_lowercase());
                        if let Some(prev) = slots_by_key.remove(&key) {
                            slots_by_key.insert(
                                key,
                                pick_lww(prev, normalized, &["updated_at", "timestamp"], conflicts),
                            );
                        } else {
                            slots_by_key.insert(key, normalized);
                        }
                    }
                }
            }
        }
    }

    let mut all_sems: Vec<i64> = touched_sems.into_iter().collect();
    all_sems.sort();

    let total_slots = slots_by_key.len();
    let mut out = Vec::new();
    for sem in all_sems {
        let mut schedule: Map<String, Value> = Map::new();
        for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] {
            schedule.insert(d.to_string(), json!([]));
        }
        for ((s, day, _), slot) in &slots_by_key {
            if *s == sem {
                schedule
                    .entry(day.clone())
                    .or_insert_with(|| json!([]))
                    .as_array_mut()
                    .map(|arr| arr.push(slot.clone()));
            }
        }
        for arr_val in schedule.values_mut() {
            if let Some(arr) = arr_val.as_array_mut() {
                arr.sort_by(|a, b| {
                    let ma = parse_time_to_minutes(&val_str(a.get("start_time").or_else(|| a.get("startTime"))));
                    let mb = parse_time_to_minutes(&val_str(b.get("start_time").or_else(|| b.get("startTime"))));
                    ma.cmp(&mb).then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
                });
            }
        }
        let (p_upd, periods) = periods_by_sem
            .get(&sem)
            .cloned()
            .unwrap_or_else(|| (String::new(), json!([])));

        let mut tt_obj = Map::new();
        tt_obj.insert("semester".to_string(), json!(sem));
        tt_obj.insert("periods".to_string(), periods);
        tt_obj.insert("schedule".to_string(), Value::Object(schedule));
        if !p_upd.is_empty() {
            tt_obj.insert("periods_updated_at".to_string(), json!(p_upd));
        }
        out.push(Value::Object(tt_obj));
    }

    (out, total_slots)
}

fn merge_id_collection(
    local: &Value,
    remote: &Value,
    field: &str,
    tombstone_entity: &str,
    ts_keys: &[&str],
    tombstones: &BTreeMap<(String, String), String>,
    conflicts: &mut usize,
) -> Vec<Value> {
    let mut map: BTreeMap<String, Value> = BTreeMap::new();
    for root in [local, remote] {
        let Some(arr) = root.get(field).and_then(|v| v.as_array()) else {
            continue;
        };
        for item in arr {
            let id = val_str(item.get("id").or_else(|| item.get("_id")));
            if id.is_empty() {
                continue;
            }
            let ts = item_ts(item, ts_keys);
            if is_deleted_by_tombstone(tombstones, tombstone_entity, &[id.clone()], &ts) {
                continue;
            }
            if let Some(prev) = map.remove(&id) {
                map.insert(id, pick_lww(prev, item.clone(), ts_keys, conflicts));
            } else {
                map.insert(id, item.clone());
            }
        }
    }
    map.into_values().collect()
}

fn merge_semester_results(
    local: &Value,
    remote: &Value,
    tombstones: &BTreeMap<(String, String), String>,
    conflicts: &mut usize,
) -> (Vec<Value>, Value) {
    let mut by_sem: BTreeMap<i64, Value> = BTreeMap::new();
    for root in [local, remote] {
        let Some(arr) = root.get("semester_results").and_then(|v| v.as_array()) else {
            continue;
        };
        for sr in arr {
            let sem = val_i64(sr.get("semester").or_else(|| sr.get("semester_num")), 0);
            if sem <= 0 {
                continue;
            }
            let ts = item_ts(sr, &["updated_at"]);
            if is_deleted_by_tombstone(tombstones, "semester_result", &[sem.to_string()], &ts) {
                continue;
            }
            if let Some(prev) = by_sem.remove(&sem) {
                by_sem.insert(sem, pick_lww(prev, sr.clone(), &["updated_at"], conflicts));
            } else {
                by_sem.insert(sem, sr.clone());
            }
        }
    }

    // Merge results_meta deterministically (prefer non-empty values; on conflict tie-break canonically)
    let mut meta = Map::new();
    let lm = local.get("results_meta").and_then(|v| v.as_object());
    let rm = remote.get("results_meta").and_then(|v| v.as_object());
    let mut all_keys: BTreeMap<String, ()> = BTreeMap::new();
    if let Some(m) = lm {
        for k in m.keys() {
            all_keys.insert(k.clone(), ());
        }
    }
    if let Some(m) = rm {
        for k in m.keys() {
            all_keys.insert(k.clone(), ());
        }
    }
    for k in all_keys.keys() {
        let lv = lm.and_then(|m| m.get(k));
        let rv = rm.and_then(|m| m.get(k));
        let ls = val_str(lv);
        let rs = val_str(rv);
        let l_empty = ls.trim().is_empty() || ls.trim() == "---";
        let r_empty = rs.trim().is_empty() || rs.trim() == "---";
        let chosen = match (l_empty, r_empty) {
            (false, true) => lv.cloned(),
            (true, false) => rv.cloned(),
            (true, true) => None,
            (false, false) => {
                if ls >= rs {
                    lv.cloned()
                } else {
                    rv.cloned()
                }
            }
        };
        if let Some(v) = chosen {
            meta.insert(k.clone(), v);
        }
    }

    (by_sem.into_values().collect(), Value::Object(meta))
}

fn merge_system_logs(local: &Value, remote: &Value) -> Vec<Value> {
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    for root in [local, remote] {
        let Some(arr) = root.get("system_logs").and_then(|v| v.as_array()) else {
            continue;
        };
        for item in arr {
            let action = val_str(item.get("action"));
            if action.trim().is_empty() || action.trim().to_lowercase().starts_with("auth_") {
                continue;
            }
            let id = val_str(item.get("id").or_else(|| item.get("_id")));
            if id.is_empty() {
                continue;
            }
            let mut dummy_conflicts = 0;
            if let Some(prev) = by_id.remove(&id) {
                by_id.insert(id, pick_lww(prev, item.clone(), &["timestamp"], &mut dummy_conflicts));
            } else {
                by_id.insert(id, item.clone());
            }
        }
    }
    let mut items: Vec<Value> = by_id.into_values().collect();
    items.sort_by(|a, b| {
        cmp_timestamps(&item_ts(b, &["timestamp"]), &item_ts(a, &["timestamp"]))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });
    items.truncate(300);
    items
}

fn canonical_content_fingerprint(snapshot: &Value) -> String {
    let mut v = snapshot.clone();
    if let Some(obj) = v.as_object_mut() {
        obj.remove("system_logs");
        obj.remove("exported_at");
        obj.remove("device_id");
        obj.remove("content_hash");
        obj.remove("version");
    }
    canonical_json(&v)
}

/// Lossless, deterministic 2-way merge for Semester v2 workspace snapshots (shared by Desktop & Android).
///
/// Mathematical properties (verified by unit tests):
/// - **Commutative**: `merge(A, B).snapshot == merge(B, A).snapshot`
/// - **Associative**: `merge(merge(A, B), C).snapshot == merge(A, merge(B, C)).snapshot`
/// - **Idempotent**:  `merge(A, A).snapshot == merge(A, A)` (and zero changes on re-merge)
/// - **Zero Overwrite & Zero Double-Counting**: Subject attendance counters are reconstructed from
///   each subject's manual baseline offset + exact sum of merged deduplicated `attendance_logs`.
pub fn merge_workspace_snapshots(local: &Value, remote: &Value) -> Result<MergeWorkspaceResult, String> {
    let local_data = local.get("data").unwrap_or(local);
    let remote_data = remote.get("data").unwrap_or(remote);
    if !local_data.is_object() || !remote_data.is_object() {
        return Err("Both local and remote snapshots must be valid JSON objects.".to_string());
    }

    let mut conflicts_resolved = 0usize;

    // 1. Union tombstones (keep latest `deleted_at` per (entity, key))
    let mut tombstones: BTreeMap<(String, String), String> = BTreeMap::new();
    extract_tombstones(local_data, &mut tombstones);
    extract_tombstones(remote_data, &mut tombstones);

    // 2. Profile merge
    let merged_profile = merge_profiles(
        local_data.get("user_profile"),
        remote_data.get("user_profile"),
        &mut conflicts_resolved,
    );

    // 3. Subjects merge with preserved baseline offsets (before combining attendance logs)
    let local_log_sums = sum_log_deltas_for_snapshot(local_data);
    let remote_log_sums = sum_log_deltas_for_snapshot(remote_data);
    let mut subjects_map: BTreeMap<String, SubjectWithBaseline> = BTreeMap::new();
    collect_subjects(local_data, &local_log_sums, &tombstones, &mut subjects_map, &mut conflicts_resolved);
    collect_subjects(remote_data, &remote_log_sums, &tombstones, &mut subjects_map, &mut conflicts_resolved);

    // 4. Attendance logs union by natural key `(subject_id, date, lowercase(type))` with LWW + tombstones
    let mut logs_map: BTreeMap<String, Value> = BTreeMap::new();
    collect_attendance_logs(local_data, &subjects_map, &tombstones, &mut logs_map, &mut conflicts_resolved);
    collect_attendance_logs(remote_data, &subjects_map, &tombstones, &mut logs_map, &mut conflicts_resolved);

    // Recompute exact subject attendance totals = baseline_offset + sum(merged_logs)
    let mut merged_log_deltas: HashMap<String, (i64, i64, i64)> = HashMap::new();
    for log in logs_map.values() {
        let sid = val_str(log.get("subject_id").or_else(|| log.get("subjectId")));
        let (da, dt, dm) = status_deltas(&val_str(log.get("status")));
        let e = merged_log_deltas.entry(sid).or_insert((0, 0, 0));
        e.0 += da;
        e.1 += dt;
        e.2 += dm;
    }

    let default_target = val_i64(merged_profile.get("attendance_threshold"), 75);
    let mut merged_subjects: Vec<Value> = Vec::with_capacity(subjects_map.len());
    for (sid, mut sub) in subjects_map.clone() {
        let (la, lt, lm) = merged_log_deltas.get(&sid).copied().unwrap_or((0, 0, 0));
        let final_med = (sub.base_med + lm).max(0);
        let final_att = (sub.base_att + la).max(final_med).max(0);
        let final_tot = (sub.base_tot + lt).max(final_att).max(0);
        let target = val_i64(sub.value.get("target"), default_target);
        let adj_att = (final_att - final_med).max(0);
        let adj_tot = (final_tot - final_med).max(0);
        let pct = calc_pct(adj_att, adj_tot);
        let status_msg = if adj_tot == 0 {
            "No Classes Yet"
        } else if pct >= target as f64 {
            "On Track"
        } else {
            "Low Attendance"
        };
        if let Some(obj) = sub.value.as_object_mut() {
            obj.insert("attended".to_string(), json!(final_att));
            obj.insert("total".to_string(), json!(final_tot));
            obj.insert("medical_leave_count".to_string(), json!(final_med));
            obj.insert("attendance_percentage".to_string(), json!(pct));
            obj.insert("status_message".to_string(), json!(status_msg));
        }
        merged_subjects.push(sub.value);
    }
    merged_subjects.sort_by(|a, b| {
        val_i64(a.get("semester"), 1)
            .cmp(&val_i64(b.get("semester"), 1))
            .then_with(|| val_str(a.get("name")).cmp(&val_str(b.get("name"))))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });

    let mut merged_logs: Vec<Value> = logs_map.into_values().collect();
    merged_logs.sort_by(|a, b| {
        val_str(a.get("date"))
            .cmp(&val_str(b.get("date")))
            .then_with(|| val_str(a.get("subject_id")).cmp(&val_str(b.get("subject_id"))))
            .then_with(|| val_str(a.get("type")).to_lowercase().cmp(&val_str(b.get("type")).to_lowercase()))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });

    // 5. Timetables (per-semester periods + natural-key slots with LWW + tombstones)
    let (merged_timetables, merged_slot_count) =
        merge_timetables(local_data, remote_data, &subjects_map, &tombstones, &mut conflicts_resolved);

    // 6. Notes (LWW + tombstones)
    let mut merged_notes = merge_id_collection(
        local_data,
        remote_data,
        "notes",
        "note",
        &["updated_at", "created_at"],
        &tombstones,
        &mut conflicts_resolved,
    );
    merged_notes.sort_by(|a, b| {
        let pa = a.get("is_pinned").and_then(|v| v.as_bool()).unwrap_or(false);
        let pb = b.get("is_pinned").and_then(|v| v.as_bool()).unwrap_or(false);
        pb.cmp(&pa)
            .then_with(|| cmp_timestamps(&item_ts(b, &["updated_at"]), &item_ts(a, &["updated_at"])))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });

    // 7. Manual Courses (LWW + tombstones)
    let mut merged_courses = merge_id_collection(
        local_data,
        remote_data,
        "manual_courses",
        "manual_course",
        &["updated_at"],
        &tombstones,
        &mut conflicts_resolved,
    );
    merged_courses.sort_by(|a, b| {
        cmp_timestamps(&item_ts(b, &["updated_at"]), &item_ts(a, &["updated_at"]))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });

    // 8. Semester Results & Results Meta (LWW by semester + tombstones)
    let (merged_results, merged_results_meta) =
        merge_semester_results(local_data, remote_data, &tombstones, &mut conflicts_resolved);

    // 9. System logs union (latest 300)
    let merged_syslogs = merge_system_logs(local_data, remote_data);

    // 10. Serialized tombstones (sorted by (entity, key))
    let merged_tombstones: Vec<Value> = tombstones
        .iter()
        .map(|((entity, key), deleted_at)| {
            json!({
                "entity": entity,
                "key": key,
                "deleted_at": deleted_at
            })
        })
        .collect();

    // Deterministic `exported_at` = max(local, remote)
    let le = val_str(local_data.get("exported_at"));
    let re = val_str(remote_data.get("exported_at"));
    let merged_exported_at = if cmp_timestamps(&le, &re) != std::cmp::Ordering::Less {
        le
    } else {
        re
    };

    let stats = MergeWorkspaceStats {
        subjects_merged: merged_subjects.len(),
        attendance_logs_merged: merged_logs.len(),
        timetable_slots_merged: merged_slot_count,
        notes_merged: merged_notes.len(),
        manual_courses_merged: merged_courses.len(),
        semester_results_merged: merged_results.len(),
        tombstones_active: merged_tombstones.len(),
        conflicts_resolved,
    };

    let snapshot = json!({
        "version": "2.0",
        "exported_at": merged_exported_at,
        "user_profile": merged_profile,
        "subjects": merged_subjects,
        "attendance_logs": merged_logs,
        "timetable": merged_timetables,
        "manual_courses": merged_courses,
        "semester_results": merged_results,
        "results_meta": merged_results_meta,
        "notes": merged_notes,
        "system_logs": merged_syslogs,
        "tombstones": merged_tombstones
    });

    // Compare normalized local-vs-local canonical merge against merged snapshot to detect
    // whether applying `snapshot` actually changes any user data or tombstones on local.
    let local_self_canonical = if std::ptr::eq(local, remote) {
        snapshot.clone()
    } else {
        merge_workspace_self_canonical(local_data)
    };
    let changed_from_local = canonical_content_fingerprint(&local_self_canonical)
        != canonical_content_fingerprint(&snapshot);

    Ok(MergeWorkspaceResult {
        snapshot,
        stats,
        changed_from_local,
    })
}

fn merge_workspace_self_canonical(local_data: &Value) -> Value {
    let mut dummy = 0usize;
    let mut tombstones = BTreeMap::new();
    extract_tombstones(local_data, &mut tombstones);
    let profile = local_data.get("user_profile").cloned().unwrap_or_else(|| json!({}));
    let log_sums = sum_log_deltas_for_snapshot(local_data);
    let mut subjects_map = BTreeMap::new();
    collect_subjects(local_data, &log_sums, &tombstones, &mut subjects_map, &mut dummy);
    let mut logs_map = BTreeMap::new();
    collect_attendance_logs(local_data, &subjects_map, &tombstones, &mut logs_map, &mut dummy);

    let mut merged_log_deltas: HashMap<String, (i64, i64, i64)> = HashMap::new();
    for log in logs_map.values() {
        let sid = val_str(log.get("subject_id").or_else(|| log.get("subjectId")));
        let (da, dt, dm) = status_deltas(&val_str(log.get("status")));
        let e = merged_log_deltas.entry(sid).or_insert((0, 0, 0));
        e.0 += da;
        e.1 += dt;
        e.2 += dm;
    }

    let default_target = val_i64(profile.get("attendance_threshold"), 75);
    let mut subjects: Vec<Value> = Vec::with_capacity(subjects_map.len());
    for (sid, mut sub) in subjects_map.clone() {
        let (la, lt, lm) = merged_log_deltas.get(&sid).copied().unwrap_or((0, 0, 0));
        let final_med = (sub.base_med + lm).max(0);
        let final_att = (sub.base_att + la).max(final_med).max(0);
        let final_tot = (sub.base_tot + lt).max(final_att).max(0);
        let target = val_i64(sub.value.get("target"), default_target);
        let pct = calc_pct((final_att - final_med).max(0), (final_tot - final_med).max(0));
        let status_msg = if (final_tot - final_med).max(0) == 0 {
            "No Classes Yet"
        } else if pct >= target as f64 {
            "On Track"
        } else {
            "Low Attendance"
        };
        if let Some(obj) = sub.value.as_object_mut() {
            obj.insert("attended".to_string(), json!(final_att));
            obj.insert("total".to_string(), json!(final_tot));
            obj.insert("medical_leave_count".to_string(), json!(final_med));
            obj.insert("attendance_percentage".to_string(), json!(pct));
            obj.insert("status_message".to_string(), json!(status_msg));
        }
        subjects.push(sub.value);
    }
    subjects.sort_by(|a, b| {
        val_i64(a.get("semester"), 1)
            .cmp(&val_i64(b.get("semester"), 1))
            .then_with(|| val_str(a.get("name")).cmp(&val_str(b.get("name"))))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });
    let mut logs: Vec<Value> = logs_map.into_values().collect();
    logs.sort_by(|a, b| {
        val_str(a.get("date"))
            .cmp(&val_str(b.get("date")))
            .then_with(|| val_str(a.get("subject_id")).cmp(&val_str(b.get("subject_id"))))
            .then_with(|| val_str(a.get("type")).to_lowercase().cmp(&val_str(b.get("type")).to_lowercase()))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });
    let empty = json!({});
    let (timetables, _) = merge_timetables(local_data, &empty, &subjects_map, &tombstones, &mut dummy);
    let mut notes = merge_id_collection(local_data, &empty, "notes", "note", &["updated_at", "created_at"], &tombstones, &mut dummy);
    notes.sort_by(|a, b| {
        let pa = a.get("is_pinned").and_then(|v| v.as_bool()).unwrap_or(false);
        let pb = b.get("is_pinned").and_then(|v| v.as_bool()).unwrap_or(false);
        pb.cmp(&pa)
            .then_with(|| cmp_timestamps(&item_ts(b, &["updated_at"]), &item_ts(a, &["updated_at"])))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });
    let mut courses = merge_id_collection(local_data, &empty, "manual_courses", "manual_course", &["updated_at"], &tombstones, &mut dummy);
    courses.sort_by(|a, b| {
        cmp_timestamps(&item_ts(b, &["updated_at"]), &item_ts(a, &["updated_at"]))
            .then_with(|| val_str(a.get("id")).cmp(&val_str(b.get("id"))))
    });
    let (results, results_meta) = merge_semester_results(local_data, &empty, &tombstones, &mut dummy);
    let ts_arr: Vec<Value> = tombstones
        .iter()
        .map(|((entity, key), deleted_at)| json!({ "entity": entity, "key": key, "deleted_at": deleted_at }))
        .collect();

    json!({
        "user_profile": profile,
        "subjects": subjects,
        "attendance_logs": logs,
        "timetable": timetables,
        "manual_courses": courses,
        "semester_results": results,
        "results_meta": results_meta,
        "notes": notes,
        "tombstones": ts_arr
    })
}

/// JSON string entrypoint exposed via UniFFI so Android (Kotlin) & Desktop share the exact same merge logic.
pub fn merge_workspace_snapshots_json(local_json: &str, remote_json: &str) -> Result<String, String> {
    let local: Value = serde_json::from_str(local_json).map_err(|e| format!("Invalid local snapshot JSON: {}", e))?;
    let remote: Value = serde_json::from_str(remote_json).map_err(|e| format!("Invalid remote snapshot JSON: {}", e))?;
    let merged = merge_workspace_snapshots(&local, &remote)?;
    serde_json::to_string(&merged).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_snapshot(exported_at: &str) -> Value {
        json!({
            "version": "2.0",
            "exported_at": exported_at,
            "user_profile": {
                "user_id": "u1",
                "name": "Kuber Bassi",
                "email": "kuber@example.com",
                "college": "HMRITM",
                "course": "B.Tech",
                "branch": "CSE",
                "current_semester": 3,
                "attendance_threshold": 75,
                "created_at": "2026-08-01T00:00:00Z",
                "updated_at": "2026-11-20T10:00:00Z",
                "preferences": { "theme": "dark", "timetable_view": "grid" }
            },
            "subjects": [{
                "id": "sub-ds",
                "name": "Data Structures",
                "code": "CIC-209",
                "semester": 3,
                "credits": 4,
                "attended": 12,
                "total": 14,
                "medical_leave_count": 0,
                "target": 75,
                "syllabus": "Trees",
                "created_at": "2026-08-01T00:00:00Z",
                "updated_at": "2026-11-20T10:00:00Z"
            }],
            "attendance_logs": [
                {
                    "id": "log-1",
                    "subject_id": "sub-ds",
                    "subject_name": "Data Structures",
                    "date": "2026-11-20",
                    "status": "present",
                    "type": "class::09:00 AM",
                    "notes": "",
                    "semester": 3,
                    "timestamp": "2026-11-20T09:05:00Z"
                },
                {
                    "id": "log-2",
                    "subject_id": "sub-ds",
                    "subject_name": "Data Structures",
                    "date": "2026-11-21",
                    "status": "present",
                    "type": "class::09:00 AM",
                    "notes": "",
                    "semester": 3,
                    "timestamp": "2026-11-21T09:05:00Z"
                }
            ],
            "timetable": [{
                "semester": 3,
                "periods_updated_at": "2026-11-20T10:00:00Z",
                "periods": [
                    { "id": "p1", "name": "1", "startTime": "09:00 AM", "endTime": "10:00 AM" }
                ],
                "schedule": {
                    "Monday": [{
                        "id": "slot-mon-1",
                        "day": "Monday",
                        "start_time": "09:00 AM",
                        "end_time": "10:00 AM",
                        "subject_id": "sub-ds",
                        "subject_name": "Data Structures",
                        "type": "class",
                        "updated_at": "2026-11-20T10:00:00Z"
                    }]
                }
            }],
            "manual_courses": [],
            "semester_results": [{
                "semester": 1,
                "semester_label": "Semester 1",
                "sgpa": "8.50",
                "total_credits": 24,
                "subjects": [{ "code": "BS101", "name": "Math I", "total_marks": 85 }],
                "updated_at": "2026-11-20T10:00:00Z"
            }],
            "results_meta": { "name": "Kuber Bassi" },
            "notes": [{
                "id": "note-1",
                "title": "Midsem Prep",
                "content": "Revise AVL trees",
                "is_pinned": false,
                "created_at": "2026-11-20T10:00:00Z",
                "updated_at": "2026-11-20T10:00:00Z"
            }],
            "system_logs": [],
            "tombstones": []
        })
    }

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

    #[test]
    fn test_offline_divergence_zero_loss_and_exact_counters() {
        // Both start with baseline 10/12 + 2 present logs = 12/14
        let mut phone = base_snapshot("2026-11-27T11:00:00Z");
        let mut laptop = base_snapshot("2026-11-27T11:05:00Z");

        // Phone goes offline: marks 2026-11-27 Present (+1/+1 -> 13/15) and adds a phone note
        phone["subjects"][0]["attended"] = json!(13);
        phone["subjects"][0]["total"] = json!(15);
        phone["attendance_logs"].as_array_mut().unwrap().push(json!({
            "id": "log-phone",
            "subject_id": "sub-ds",
            "subject_name": "Data Structures",
            "date": "2026-11-27",
            "status": "present",
            "type": "class::09:00 AM",
            "semester": 3,
            "timestamp": "2026-11-27T09:10:00Z"
        }));
        phone["notes"].as_array_mut().unwrap().push(json!({
            "id": "note-phone",
            "title": "Bus Reminder",
            "content": "Print practical file",
            "is_pinned": true,
            "updated_at": "2026-11-27T09:12:00Z"
        }));

        // Laptop goes offline: marks 2026-11-28 Absent (+0/+1 -> 12/15), updates credits 4->3 & syllabus,
        // and syncs Semester 2 IPU results!
        laptop["subjects"][0]["total"] = json!(15);
        laptop["subjects"][0]["credits"] = json!(3);
        laptop["subjects"][0]["syllabus"] = json!("Trees, Graphs, DP");
        laptop["subjects"][0]["updated_at"] = json!("2026-11-27T10:30:00Z");
        laptop["attendance_logs"].as_array_mut().unwrap().push(json!({
            "id": "log-laptop",
            "subject_id": "sub-ds",
            "subject_name": "Data Structures",
            "date": "2026-11-28",
            "status": "absent",
            "type": "class::10:00 AM",
            "semester": 3,
            "timestamp": "2026-11-28T10:05:00Z"
        }));
        laptop["semester_results"].as_array_mut().unwrap().push(json!({
            "semester": 2,
            "semester_label": "Semester 2",
            "sgpa": "9.10",
            "total_credits": 25,
            "subjects": [{ "code": "BS112", "name": "Math II", "total_marks": 91 }],
            "updated_at": "2026-11-27T10:35:00Z"
        }));

        let res = merge_workspace_snapshots(&laptop, &phone).unwrap();
        assert!(res.changed_from_local);
        let merged = &res.snapshot;

        // Baseline (10/12) + 4 merged logs (3 present + 1 absent = +3/+4) => EXACTLY 13/16!
        assert_eq!(merged["subjects"][0]["attended"], 13);
        assert_eq!(merged["subjects"][0]["total"], 16);
        assert_eq!(merged["subjects"][0]["credits"], 3);
        assert_eq!(merged["subjects"][0]["syllabus"], "Trees, Graphs, DP");
        assert_eq!(merged["attendance_logs"].as_array().unwrap().len(), 4);
        assert_eq!(merged["notes"].as_array().unwrap().len(), 2);
        assert_eq!(merged["semester_results"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_same_slot_conflict_lww_counts_once() {
        let mut phone = base_snapshot("2026-11-27T10:00:00Z");
        let mut laptop = base_snapshot("2026-11-27T10:05:00Z");

        // Phone marks 2026-11-27 09:00 AM as ABSENT at 10:00Z (with timezone +05:30 = 15:30+05:30)
        phone["subjects"][0]["total"] = json!(15);
        phone["attendance_logs"].as_array_mut().unwrap().push(json!({
            "id": "log-p",
            "subject_id": "sub-ds",
            "date": "2026-11-27",
            "status": "absent",
            "type": "class::09:00 AM",
            "timestamp": "2026-11-27T15:30:00+05:30"
        }));

        // Laptop corrects same class to PRESENT 5 minutes later (10:05:00Z)
        laptop["subjects"][0]["attended"] = json!(13);
        laptop["subjects"][0]["total"] = json!(15);
        laptop["attendance_logs"].as_array_mut().unwrap().push(json!({
            "id": "log-l",
            "subject_id": "sub-ds",
            "date": "2026-11-27",
            "status": "present",
            "type": "class::09:00 AM",
            "timestamp": "2026-11-27T10:05:00Z"
        }));

        let res = merge_workspace_snapshots(&phone, &laptop).unwrap();
        let logs = res.snapshot["attendance_logs"].as_array().unwrap();
        assert_eq!(logs.len(), 3, "same class slot must deduplicate to 1 entry");
        let target_log = logs.iter().find(|l| l["date"] == "2026-11-27").unwrap();
        assert_eq!(target_log["status"], "present");
        // Baseline 10/12 + 3 present logs = 13/15 (counted ONCE, never 13/16!)
        assert_eq!(res.snapshot["subjects"][0]["attended"], 13);
        assert_eq!(res.snapshot["subjects"][0]["total"], 15);
    }

    #[test]
    fn test_tombstone_deletes_older_item_and_newer_edit_resurrects() {
        let laptop = base_snapshot("2026-11-27T10:00:00Z");
        let mut phone = base_snapshot("2026-11-27T11:00:00Z");

        // Phone deletes note-1 and log-2 at 11:00Z (after their 10:00Z / Nov 21 timestamps)
        phone["notes"] = json!([]);
        phone["attendance_logs"]
            .as_array_mut()
            .unwrap()
            .retain(|l| l["id"] != "log-2");
        phone["subjects"][0]["attended"] = json!(11);
        phone["subjects"][0]["total"] = json!(13);
        phone["tombstones"] = json!([
            { "entity": "note", "key": "note-1", "deleted_at": "2026-11-27T11:00:00Z" },
            { "entity": "attendance_log", "key": "sub-ds|2026-11-21|class::09:00 am", "deleted_at": "2026-11-27T11:00:00Z" }
        ]);

        let merged = merge_workspace_snapshots(&laptop, &phone).unwrap();
        assert!(merged.snapshot["notes"].as_array().unwrap().is_empty(), "tombstone must delete stale note");
        assert_eq!(merged.snapshot["attendance_logs"].as_array().unwrap().len(), 1);
        assert_eq!(merged.snapshot["subjects"][0]["attended"], 11);
        assert_eq!(merged.snapshot["subjects"][0]["total"], 13);

        // Now suppose Desktop edits note-1 AFTER 11:00Z (at 12:00Z) -> must resurrect cleanly!
        let mut laptop_resurrect = laptop.clone();
        laptop_resurrect["notes"][0]["content"] = json!("Updated after delete");
        laptop_resurrect["notes"][0]["updated_at"] = json!("2026-11-27T12:00:00Z");

        let resurrected = merge_workspace_snapshots(&laptop_resurrect, &phone).unwrap();
        assert_eq!(resurrected.snapshot["notes"].as_array().unwrap().len(), 1);
        assert_eq!(resurrected.snapshot["notes"][0]["content"], "Updated after delete");
    }

    #[test]
    fn test_crdt_commutativity_idempotency_and_associativity() {
        // Construct 3 diverging devices A (Laptop), B (Phone), C (Tablet)
        let mut a = base_snapshot("2026-11-27T10:00:00Z");
        a["notes"][0]["content"] = json!("Edited on A");
        a["notes"][0]["updated_at"] = json!("2026-11-27T10:01:00Z");
        a["subjects"][0]["attended"] = json!(13);
        a["subjects"][0]["total"] = json!(15);
        a["attendance_logs"].as_array_mut().unwrap().push(json!({
            "id": "log-a",
            "subject_id": "sub-ds",
            "date": "2026-11-25",
            "status": "present",
            "type": "Lecture",
            "timestamp": "2026-11-25T10:00:00Z"
        }));

        let mut b = base_snapshot("2026-11-27T11:00:00Z");
        b["notes"][0]["content"] = json!("Edited on B");
        b["notes"][0]["updated_at"] = json!("2026-11-27T11:01:00Z");
        b["subjects"][0]["total"] = json!(15);
        b["attendance_logs"].as_array_mut().unwrap().push(json!({
            "id": "log-b",
            "subject_id": "sub-ds",
            "date": "2026-11-26",
            "status": "absent",
            "type": "Lecture",
            "timestamp": "2026-11-26T10:00:00Z"
        }));
        b["tombstones"] = json!([
            { "entity": "attendance_log", "key": "log-1", "deleted_at": "2026-11-27T10:30:00Z" }
        ]);
        b["attendance_logs"].as_array_mut().unwrap().retain(|l| l["id"] != "log-1");
        b["subjects"][0]["attended"] = json!(11);
        b["subjects"][0]["total"] = json!(14);

        let mut c = base_snapshot("2026-11-27T12:00:00Z");
        c["notes"].as_array_mut().unwrap().push(json!({
            "id": "note-c",
            "title": "From C",
            "content": "Tablet note",
            "is_pinned": false,
            "updated_at": "2026-11-27T12:00:00Z"
        }));
        c["subjects"][0]["attended"] = json!(13);
        c["subjects"][0]["total"] = json!(15);
        c["subjects"][0]["medical_leave_count"] = json!(1);
        c["attendance_logs"].as_array_mut().unwrap().push(json!({
            "id": "log-c",
            "subject_id": "sub-ds",
            "date": "2026-11-27",
            "status": "approved_medical",
            "type": "Lecture",
            "timestamp": "2026-11-27T12:00:00Z"
        }));

        // 1. Commutativity: merge(A, B) == merge(B, A)
        let ab = merge_workspace_snapshots(&a, &b).unwrap();
        let ba = merge_workspace_snapshots(&b, &a).unwrap();
        assert_eq!(ab.snapshot, ba.snapshot, "merge MUST be strictly commutative");

        // 2. Idempotency: merge(AB, AB) == AB and changed_from_local == false
        let ab_idem = merge_workspace_snapshots(&ab.snapshot, &ab.snapshot).unwrap();
        assert_eq!(ab.snapshot, ab_idem.snapshot, "merge MUST be strictly idempotent");
        assert!(!ab_idem.changed_from_local, "self-merge must report zero changes");

        // 3. Associativity: merge(merge(A, B), C) == merge(A, merge(B, C))
        let ab_c = merge_workspace_snapshots(&ab.snapshot, &c).unwrap();
        let bc = merge_workspace_snapshots(&b, &c).unwrap();
        let a_bc = merge_workspace_snapshots(&a, &bc.snapshot).unwrap();
        assert_eq!(ab_c.snapshot, a_bc.snapshot, "merge MUST be strictly associative");

        // Verify expected merged totals:
        // baseline = 10/12/0; surviving logs = log-2 (P), log-a (P), log-b (A), log-c (M: +1/+1/+1)
        // log deltas = (+3, +4, +1) -> final = 13 / 16 / 1!
        assert_eq!(ab_c.snapshot["subjects"][0]["attended"], 13);
        assert_eq!(ab_c.snapshot["subjects"][0]["total"], 16);
        assert_eq!(ab_c.snapshot["subjects"][0]["medical_leave_count"], 1);
    }

    #[test]
    fn test_tombstone_pruning_by_age() {
        let tombstones = vec![
            SyncTombstone {
                entity: "note".into(),
                key: "old-1".into(),
                deleted_at: "2026-09-01T00:00:00Z".into(),
            },
            SyncTombstone {
                entity: "note".into(),
                key: "recent-1".into(),
                deleted_at: "2026-11-20T00:00:00Z".into(),
            },
        ];
        let kept = prune_tombstones(&tombstones, "2026-11-27T00:00:00Z", 45);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].key, "recent-1");
    }

    #[test]
    fn test_uniffi_json_wrapper_roundtrip() {
        let a = serde_json::to_string(&base_snapshot("2026-11-27T10:00:00Z")).unwrap();
        let b = serde_json::to_string(&base_snapshot("2026-11-27T10:00:00Z")).unwrap();
        let out = merge_workspace_snapshots_json(&a, &b).unwrap();
        let parsed: MergeWorkspaceResult = serde_json::from_str(&out).unwrap();
        assert!(!parsed.changed_from_local);
        assert_eq!(parsed.stats.subjects_merged, 1);
    }
}
