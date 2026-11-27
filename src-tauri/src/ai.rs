use std::sync::Arc;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::crypto;
use crate::db::DesktopDb;

pub const DEFAULT_GEMINI_MODEL: &str = "gemini-2.5-flash";
pub const DEFAULT_GROQ_MODEL: &str = "llama-3.3-70b-versatile";

const META_PROVIDER: &str = "ai_provider";
const META_GEMINI_KEY: &str = "gemini_api_key";
const META_GEMINI_MODEL: &str = "gemini_model";
const META_GROQ_KEY: &str = "groq_api_key";
const META_GROQ_MODEL: &str = "groq_model";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveAiConfigInput {
    pub provider: Option<String>,
    pub gemini_api_key: Option<String>,
    pub gemini_model: Option<String>,
    pub groq_api_key: Option<String>,
    pub groq_model: Option<String>,
    pub clear_gemini_key: Option<bool>,
    pub clear_groq_key: Option<bool>,
}

pub struct AiManager {
    db: Arc<DesktopDb>,
    http: Client,
}

impl AiManager {
    pub fn new(db: Arc<DesktopDb>) -> Arc<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(35))
            .connect_timeout(Duration::from_secs(12))
            .build()
            .expect("Failed to construct AI HTTP client");
        Arc::new(Self { db, http })
    }

    pub fn get_config(&self) -> Result<Value, String> {
        let provider = self
            .db
            .get_meta(META_PROVIDER)?
            .unwrap_or_else(|| "local".to_string());
        let gemini_model = self
            .db
            .get_meta(META_GEMINI_MODEL)?
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string());
        let groq_model = self
            .db
            .get_meta(META_GROQ_MODEL)?
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_GROQ_MODEL.to_string());

        let gemini_key = self.db.get_secret(META_GEMINI_KEY)?.unwrap_or_default();
        let groq_key = self.db.get_secret(META_GROQ_KEY)?.unwrap_or_default();

        Ok(json!({
            "provider": provider,
            "gemini_model": gemini_model,
            "groq_model": groq_model,
            "has_gemini_key": !gemini_key.is_empty(),
            "has_groq_key": !groq_key.is_empty(),
            "gemini_key_hint": crypto::mask_secret(&gemini_key),
            "groq_key_hint": crypto::mask_secret(&groq_key),
            "encrypted_storage": cfg!(target_os = "windows")
        }))
    }

    pub fn save_config(&self, input: &SaveAiConfigInput) -> Result<Value, String> {
        if input.clear_gemini_key.unwrap_or(false) {
            self.db.delete_meta(META_GEMINI_KEY)?;
        } else if let Some(key) = input.gemini_api_key.as_deref() {
            let trimmed = key.trim();
            if !trimmed.is_empty() {
                self.db.set_secret(META_GEMINI_KEY, trimmed)?;
            }
        }

        if input.clear_groq_key.unwrap_or(false) {
            self.db.delete_meta(META_GROQ_KEY)?;
        } else if let Some(key) = input.groq_api_key.as_deref() {
            let trimmed = key.trim();
            if !trimmed.is_empty() {
                self.db.set_secret(META_GROQ_KEY, trimmed)?;
            }
        }

        if let Some(gm) = input.gemini_model.as_deref() {
            let clean = sanitize_model_name(gm, DEFAULT_GEMINI_MODEL)?;
            self.db.set_meta(META_GEMINI_MODEL, &clean)?;
        }

        if let Some(q) = input.groq_model.as_deref() {
            let clean = sanitize_model_name(q, DEFAULT_GROQ_MODEL)?;
            self.db.set_meta(META_GROQ_MODEL, &clean)?;
        }

        if let Some(prov) = input.provider.as_deref() {
            let p = match prov.trim().to_lowercase().as_str() {
                "gemini" => "gemini",
                "groq" => "groq",
                _ => "local",
            };
            self.db.set_meta(META_PROVIDER, p)?;
        }

        self.get_config()
    }

    pub async fn test_connection(
        &self,
        provider: &str,
        override_key: Option<&str>,
        override_model: Option<&str>,
    ) -> Result<Value, String> {
        let prov = provider.trim().to_lowercase();
        let started = Instant::now();

        match prov.as_str() {
            "gemini" => {
                let key = match override_key.map(str::trim).filter(|s| !s.is_empty()) {
                    Some(k) => k.to_string(),
                    None => self
                        .db
                        .get_secret(META_GEMINI_KEY)?
                        .filter(|s| !s.is_empty())
                        .ok_or_else(|| "Enter a Gemini API key first.".to_string())?,
                };
                let model = match override_model.map(str::trim).filter(|s| !s.is_empty()) {
                    Some(m) => sanitize_model_name(m, DEFAULT_GEMINI_MODEL)?,
                    None => self
                        .db
                        .get_meta(META_GEMINI_MODEL)?
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string()),
                };

                let reply = self
                    .call_gemini(
                        &key,
                        &model,
                        "You are a health check responder.",
                        &[],
                        "Reply with exactly: Connected",
                        24,
                    )
                    .await?;
                Ok(json!({
                    "ok": true,
                    "provider": "gemini",
                    "model": model,
                    "latency_ms": started.elapsed().as_millis() as u64,
                    "preview": reply.trim()
                }))
            }
            "groq" => {
                let key = match override_key.map(str::trim).filter(|s| !s.is_empty()) {
                    Some(k) => k.to_string(),
                    None => self
                        .db
                        .get_secret(META_GROQ_KEY)?
                        .filter(|s| !s.is_empty())
                        .ok_or_else(|| "Enter a Groq API key first.".to_string())?,
                };
                let model = match override_model.map(str::trim).filter(|s| !s.is_empty()) {
                    Some(m) => sanitize_model_name(m, DEFAULT_GROQ_MODEL)?,
                    None => self
                        .db
                        .get_meta(META_GROQ_MODEL)?
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| DEFAULT_GROQ_MODEL.to_string()),
                };

                let reply = self
                    .call_groq(
                        &key,
                        &model,
                        "You are a health check responder.",
                        &[],
                        "Reply with exactly: Connected",
                        24,
                    )
                    .await?;
                Ok(json!({
                    "ok": true,
                    "provider": "groq",
                    "model": model,
                    "latency_ms": started.elapsed().as_millis() as u64,
                    "preview": reply.trim()
                }))
            }
            _ => Ok(json!({
                "ok": true,
                "provider": "local",
                "model": "SQLite Offline Engine",
                "latency_ms": started.elapsed().as_millis() as u64,
                "preview": "Local offline engine ready"
            })),
        }
    }

    pub async fn chat(
        &self,
        message: &str,
        history: &[ChatTurn],
        semester: i64,
    ) -> Result<Value, String> {
        let provider = self
            .db
            .get_meta(META_PROVIDER)?
            .unwrap_or_else(|| "local".to_string());

        let gemini_key = self.db.get_secret(META_GEMINI_KEY)?.unwrap_or_default();
        let groq_key = self.db.get_secret(META_GROQ_KEY)?.unwrap_or_default();

        let use_cloud = (provider == "gemini" && !gemini_key.is_empty())
            || (provider == "groq" && !groq_key.is_empty());

        if !use_cloud {
            let db = Arc::clone(&self.db);
            let msg = message.to_string();
            let mut local = tokio::task::spawn_blocking(move || db.query_local_assistant(&msg, semester))
                .await
                .map_err(|e| e.to_string())??;
            if let Some(obj) = local.as_object_mut() {
                obj.insert("provider_used".to_string(), json!("local"));
                obj.insert("model_used".to_string(), json!("Local SQLite"));
            }
            return Ok(local);
        }

        // Build live verified SQLite snapshot on worker thread
        let db = Arc::clone(&self.db);
        let context_blob = tokio::task::spawn_blocking(move || build_student_context(&db, semester))
            .await
            .map_err(|e| e.to_string())??;

        let system_prompt = format!(
            "You are Semester AI, a sharp, concise academic assistant inside the Semester desktop app.\n\
             Rules:\n\
             - Use ONLY the verified live student database snapshot below for attendance numbers, schedules, results, tasks, and notes. Never invent figures.\n\
             - Format answers in crisp Markdown (short headings, bold key metrics, concise bullet points).\n\
             - Never use star or sparkle emojis.\n\
             - If data is missing (e.g. no subjects or no synced results yet), tell the student clearly which page to add or sync it from.\n\n\
             === LIVE STUDENT DATA (Semester {}) ===\n{}",
            semester, context_blob
        );

        let suggestions = contextual_suggestions(message);

        if provider == "gemini" {
            let model = self
                .db
                .get_meta(META_GEMINI_MODEL)?
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string());
            let reply = self
                .call_gemini(&gemini_key, &model, &system_prompt, history, message, 900)
                .await?;
            return Ok(json!({
                "response": reply,
                "suggestions": suggestions,
                "provider_used": "gemini",
                "model_used": model
            }));
        }

        let model = self
            .db
            .get_meta(META_GROQ_MODEL)?
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_GROQ_MODEL.to_string());
        let reply = self
            .call_groq(&groq_key, &model, &system_prompt, history, message, 900)
            .await?;
        Ok(json!({
            "response": reply,
            "suggestions": suggestions,
            "provider_used": "groq",
            "model_used": model
        }))
    }

    pub async fn process_note(
        &self,
        content_html: &str,
        action: &str,
        custom_prompt: Option<&str>,
    ) -> Result<Value, String> {
        let provider = self
            .db
            .get_meta(META_PROVIDER)?
            .unwrap_or_else(|| "local".to_string());
        let gemini_key = self.db.get_secret(META_GEMINI_KEY)?.unwrap_or_default();
        let groq_key = self.db.get_secret(META_GROQ_KEY)?.unwrap_or_default();

        let instruction = match action {
            "reformat" => "Clean up spacing, headings, and bullet structure without changing the meaning.",
            "improve" => "Improve clarity, grammar, and conciseness while keeping all facts and technical terms.",
            _ => custom_prompt.unwrap_or("Summarize and structure this note clearly."),
        };

        let system = "You are a note editor inside a rich text app. Return ONLY clean semantic HTML fragments using tags like <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>. Do not include <html>, <body>, <script>, markdown code fences, or commentary.";
        let user_msg = format!("Task: {}\n\nNote HTML:\n{}", instruction, content_html);

        if provider == "gemini" && !gemini_key.is_empty() {
            let model = self
                .db
                .get_meta(META_GEMINI_MODEL)?
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string());
            let out = self.call_gemini(&gemini_key, &model, system, &[], &user_msg, 1200).await?;
            return Ok(json!({
                "processedContent": strip_code_fences(&out),
                "provider_used": "gemini"
            }));
        }

        if provider == "groq" && !groq_key.is_empty() {
            let model = self
                .db
                .get_meta(META_GROQ_MODEL)?
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| DEFAULT_GROQ_MODEL.to_string());
            let out = self.call_groq(&groq_key, &model, system, &[], &user_msg, 1200).await?;
            return Ok(json!({
                "processedContent": strip_code_fences(&out),
                "provider_used": "groq"
            }));
        }

        // Offline deterministic cleanup fallback
        let tag_re = regex::Regex::new(r"(?is)<[^>]+>").unwrap();
        let plain = tag_re.replace_all(content_html, "\n");
        let lines: Vec<String> = plain
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .map(escape_html)
            .collect();
        let processed = if action == "reformat" {
            lines.iter().map(|l| format!("<p>{}</p>", l)).collect::<String>()
        } else {
            let title = custom_prompt
                .filter(|s| !s.trim().is_empty())
                .map(|s| format!("Notes — {}", escape_html(s.trim())))
                .unwrap_or_else(|| "Structured Notes".to_string());
            format!(
                "<h3>{}</h3><ul>{}</ul>",
                title,
                lines.iter().map(|l| format!("<li>{}</li>", l)).collect::<String>()
            )
        };
        Ok(json!({
            "processedContent": processed,
            "provider_used": "local"
        }))
    }

    async fn call_gemini(
        &self,
        api_key: &str,
        model: &str,
        system_prompt: &str,
        history: &[ChatTurn],
        message: &str,
        max_tokens: u32,
    ) -> Result<String, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            model
        );

        let mut contents: Vec<Value> = history
            .iter()
            .rev()
            .take(10)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .filter(|t| !t.content.trim().is_empty())
            .map(|t| {
                let role = if t.role == "assistant" { "model" } else { "user" };
                json!({
                    "role": role,
                    "parts": [{ "text": t.content }]
                })
            })
            .collect();

        contents.push(json!({
            "role": "user",
            "parts": [{ "text": message }]
        }));

        let payload = json!({
            "system_instruction": {
                "parts": [{ "text": system_prompt }]
            },
            "contents": contents,
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": max_tokens
            }
        });

        let resp = self
            .http
            .post(&url)
            .header("x-goog-api-key", api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Could not reach Gemini API: {}", e))?;

        let status = resp.status();
        let body: Value = resp
            .json()
            .await
            .map_err(|e| format!("Invalid JSON from Gemini API: {}", e))?;

        if !status.is_success() {
            let err_msg = body
                .pointer("/error/message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown Gemini API error");
            return Err(format!("Gemini API error ({}): {}", status.as_u16(), err_msg));
        }

        let text = body
            .pointer("/candidates/0/content/parts")
            .and_then(|v| v.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();

        if text.trim().is_empty() {
            return Err("Gemini returned an empty response.".to_string());
        }
        Ok(text.trim().to_string())
    }

    async fn call_groq(
        &self,
        api_key: &str,
        model: &str,
        system_prompt: &str,
        history: &[ChatTurn],
        message: &str,
        max_tokens: u32,
    ) -> Result<String, String> {
        let mut messages: Vec<Value> = vec![json!({
            "role": "system",
            "content": system_prompt
        })];

        for t in history.iter().rev().take(10).collect::<Vec<_>>().into_iter().rev() {
            if !t.content.trim().is_empty() {
                let role = if t.role == "assistant" { "assistant" } else { "user" };
                messages.push(json!({ "role": role, "content": t.content }));
            }
        }
        messages.push(json!({ "role": "user", "content": message }));

        let payload = json!({
            "model": model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": max_tokens
        });

        let resp = self
            .http
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Could not reach Groq API: {}", e))?;

        let status = resp.status();
        let body: Value = resp
            .json()
            .await
            .map_err(|e| format!("Invalid JSON from Groq API: {}", e))?;

        if !status.is_success() {
            let err_msg = body
                .pointer("/error/message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown Groq API error");
            return Err(format!("Groq API error ({}): {}", status.as_u16(), err_msg));
        }

        let text = body
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        if text.is_empty() {
            return Err("Groq returned an empty response.".to_string());
        }
        Ok(text)
    }
}

fn sanitize_model_name(raw: &str, fallback: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(fallback.to_string());
    }
    if trimmed.len() > 100
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/' | ':'))
    {
        return Err("Invalid model identifier.".to_string());
    }
    Ok(trimmed.to_string())
}

fn strip_code_fences(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with("```") {
        let without_first = trimmed
            .split_once('\n')
            .map(|(_, rest)| rest)
            .unwrap_or(trimmed);
        return without_first.trim_end_matches("```").trim().to_string();
    }
    trimmed.to_string()
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn contextual_suggestions(message: &str) -> Vec<&'static str> {
    let q = message.to_lowercase();
    if q.contains("cgpa") || q.contains("result") || q.contains("sgpa") {
        vec![
            "What are my strongest and weakest subjects?",
            "How is my attendance margin?",
            "Check pending tasks & practicals",
        ]
    } else if q.contains("today") || q.contains("schedule") || q.contains("timetable") {
        vec![
            "Which is my busiest day?",
            "Which subjects are below target?",
            "Check pending tasks & practicals",
        ]
    } else if q.contains("task") || q.contains("note") || q.contains("practical") {
        vec![
            "How is my attendance margin?",
            "What classes do I have today?",
            "Show my CGPA breakdown",
        ]
    } else {
        vec![
            "Which subjects are below target?",
            "What classes do I have today?",
            "Show my CGPA breakdown",
        ]
    }
}

fn build_student_context(db: &DesktopDb, semester: i64) -> Result<String, String> {
    let dash = db.get_dashboard_data(semester)?;
    let timetable = db.get_timetable(semester)?;
    let results = db.get_results_analytics()?;
    let notes = db.get_notes()?;
    let courses = db.get_manual_courses()?;

    let profile = dash.get("user").cloned().unwrap_or_else(|| json!({}));
    let summary = dash.get("summary").cloned().unwrap_or_else(|| json!({}));
    let subjects = dash
        .get("subjects")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = String::new();
    let target = profile
        .get("attendance_threshold")
        .and_then(|v| v.as_i64())
        .unwrap_or(75);

    out.push_str(&format!(
        "Student: {} | Enrollment: {} | Course: {} {} | Target Attendance: {}%\n",
        profile.get("name").and_then(|v| v.as_str()).unwrap_or("Student"),
        profile.get("enrollment_number").and_then(|v| v.as_str()).unwrap_or("N/A"),
        profile.get("course").and_then(|v| v.as_str()).unwrap_or(""),
        profile.get("branch").and_then(|v| v.as_str()).unwrap_or(""),
        target
    ));

    out.push_str(&format!(
        "Overall Attendance: {:.1}% ({}/{} classes), Safe Bunks Buffer: +{}\n",
        summary.get("overall_percentage").and_then(|v| v.as_f64()).unwrap_or(0.0),
        summary.get("total_attended").and_then(|v| v.as_i64()).unwrap_or(0),
        summary.get("total_classes").and_then(|v| v.as_i64()).unwrap_or(0),
        summary.get("safe_bunks_remaining").and_then(|v| v.as_i64()).unwrap_or(0)
    ));

    out.push_str("\nSubjects:\n");
    if subjects.is_empty() {
        out.push_str("- None added for this semester yet.\n");
    } else {
        for s in &subjects {
            let name = s.get("name").and_then(|v| v.as_str()).unwrap_or("Subject");
            let code = s.get("code").and_then(|v| v.as_str()).unwrap_or("");
            let med = s.get("medical_leave_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let att = (s.get("attended").and_then(|v| v.as_i64()).unwrap_or(0) - med).max(0);
            let tot = (s.get("total").and_then(|v| v.as_i64()).unwrap_or(0) - med).max(0);
            let pct = s.get("attendance_percentage").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let pr_done = s.pointer("/practicals/completed").and_then(|v| v.as_i64()).unwrap_or(0);
            let pr_tot = s.pointer("/practicals/total").and_then(|v| v.as_i64()).unwrap_or(0);
            let as_done = s.pointer("/assignments/completed").and_then(|v| v.as_i64()).unwrap_or(0);
            let as_tot = s.pointer("/assignments/total").and_then(|v| v.as_i64()).unwrap_or(0);
            out.push_str(&format!(
                "- {} ({}): {:.1}% ({}/{}, med:{}), Practicals {}/{}, Assignments {}/{}\n",
                name, code, pct, att, tot, med, pr_done, pr_tot, as_done, as_tot
            ));
        }
    }

    let is_real_class = |slot: &Value| -> bool {
        let stype = slot
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_lowercase();
        if ["break", "free", "lunch", "gap", "custom"].contains(&stype.as_str()) {
            return false;
        }
        let sname = slot.get("subject_name").and_then(|v| v.as_str()).unwrap_or("").trim();
        let sid = slot.get("subject_id").and_then(|v| v.as_str()).unwrap_or("").trim();
        !sname.is_empty() || !sid.is_empty()
    };

    let today_name = chrono::Local::now().format("%A").to_string();
    out.push_str(&format!("\nToday ({}):\n", today_name));
    if let Some(sched) = timetable.get("schedule").and_then(|v| v.as_object()) {
        if let Some(today_slots) = sched.get(&today_name).and_then(|v| v.as_array()) {
            let class_slots: Vec<&Value> = today_slots.iter().filter(|s| is_real_class(s)).collect();
            if class_slots.is_empty() {
                out.push_str("- No classes scheduled today.\n");
            } else {
                for slot in class_slots {
                    let sname = slot
                        .get("subject_name")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.trim().is_empty())
                        .or_else(|| slot.get("label").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()))
                        .unwrap_or("Scheduled Class");
                    let room = slot.get("classroom").and_then(|v| v.as_str()).unwrap_or("").trim();
                    let room_suffix = if room.is_empty() { String::new() } else { format!(" ({})", room) };
                    out.push_str(&format!(
                        "- {} – {}: {}{}\n",
                        slot.get("start_time").and_then(|v| v.as_str()).unwrap_or(""),
                        slot.get("end_time").and_then(|v| v.as_str()).unwrap_or(""),
                        sname,
                        room_suffix
                    ));
                }
            }
        }
        let mut counts: Vec<String> = Vec::new();
        for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] {
            let n = sched
                .get(day)
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter(|s| is_real_class(s)).count())
                .unwrap_or(0);
            if n > 0 {
                counts.push(format!("{}: {}", day, n));
            }
        }
        if !counts.is_empty() {
            out.push_str(&format!("Weekly class load: {}\n", counts.join(", ")));
        }
    }

    if !results.is_null() {
        let parse_num = |v: Option<&Value>| -> f64 {
            v.and_then(|x| x.as_f64().or_else(|| x.as_str().and_then(|s| s.parse::<f64>().ok())))
                .unwrap_or(0.0)
        };
        let cgpa = parse_num(results.get("cgpa"));
        out.push_str(&format!("\nUniversity Results: CGPA {:.2}\n", cgpa));
        if let Some(sems) = results.get("semesters").and_then(|v| v.as_array()) {
            for sem in sems {
                let num = sem.get("semester_num").and_then(|v| v.as_i64()).unwrap_or(0);
                let sgpa = parse_num(sem.get("sgpa"));
                let cnt = sem.get("subjects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
                out.push_str(&format!("- Semester {}: SGPA {:.2} ({} papers)\n", num, sgpa, cnt));
            }
        }
    } else {
        out.push_str("\nUniversity Results: Not synced yet.\n");
    }

    // Pending tasks & recent notes
    let mut pending_tasks = Vec::new();
    let mut note_titles = Vec::new();
    for n in &notes {
        if n.get("is_todo").and_then(|v| v.as_bool()).unwrap_or(false) {
            if let Some(todos) = n.get("todos").and_then(|v| v.as_array()) {
                for t in todos {
                    if !t.get("completed").and_then(|v| v.as_bool()).unwrap_or(false) {
                        if let Some(txt) = t.get("text").and_then(|v| v.as_str()) {
                            pending_tasks.push(txt.to_string());
                        }
                    }
                }
            }
        } else if let Some(title) = n.get("title").and_then(|v| v.as_str()) {
            note_titles.push(title.to_string());
        }
    }
    out.push_str(&format!(
        "\nPending Tasks ({}): {}\n",
        pending_tasks.len(),
        if pending_tasks.is_empty() {
            "None".to_string()
        } else {
            pending_tasks.into_iter().take(12).collect::<Vec<_>>().join("; ")
        }
    ));
    if !note_titles.is_empty() {
        out.push_str(&format!(
            "Notes ({}): {}\n",
            note_titles.len(),
            note_titles.into_iter().take(8).collect::<Vec<_>>().join(", ")
        ));
    }
    if !courses.is_empty() {
        out.push_str(&format!("Tracked External Courses: {}\n", courses.len()));
    }

    Ok(out)
}
