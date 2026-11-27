use std::collections::{HashMap, HashSet};
use std::time::Duration;

use base64::Engine as _;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

const IPU_BASE: &str = "https://examweb.ggsipu.ac.in";
const IPU_LOGIN_URL: &str = "https://examweb.ggsipu.ac.in/web/login.jsp";
const IPU_LOGIN_ACTION: &str = "https://examweb.ggsipu.ac.in/web/login";
const IPU_HOME_URL: &str = "https://examweb.ggsipu.ac.in/web/student/studenthome";
const IPU_SEARCH_URL: &str = "https://examweb.ggsipu.ac.in/web/student/search";
const IPU_PROFILE_URL: &str = "https://examweb.ggsipu.ac.in/web/student/profile";
const IPU_LEGACY_RESULTS_URL: &str = "https://examweb.ggsipu.ac.in/web/StudentSearchProcess";

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpuFieldNames {
    pub username: String,
    pub password: String,
    pub captcha: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpuCaptchaSession {
    pub captcha_image: String,
    pub hidden_fields: HashMap<String, String>,
    pub field_names: IpuFieldNames,
    pub login_action: String,
    pub hash_password: bool,
}

#[derive(Debug, Clone)]
struct DiscoveredEndpoint {
    url: String,
    method: String, // "GET" or "POST"
    sem_param: String,
    extra_params: HashMap<String, String>,
}

pub struct IpuSessionManager {
    client: Mutex<Option<Client>>,
}

impl IpuSessionManager {
    pub fn new() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }

    fn build_fresh_client() -> Result<Client, String> {
        Client::builder()
            .cookie_store(true)
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(24))
            .connect_timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))
    }

    /// Starts a fresh IPU ExamWeb session, fetches the login page & CAPTCHA image using
    /// the same cookie jar, and returns the CAPTCHA image for manual user entry.
    pub async fn fetch_captcha(&self) -> Result<IpuCaptchaSession, String> {
        let client = Self::build_fresh_client()?;
        let resp = client
            .get(IPU_LOGIN_URL)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
            .await
            .map_err(|e| format!("Could not connect to examweb.ggsipu.ac.in: {}", e))?;

        let status = resp.status();
        let html = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read IPU login page: {}", e))?;

        if !status.is_success() || html.trim().is_empty() {
            return Err(format!(
                "IPU portal returned HTTP {}. The university server may be temporarily busy.",
                status.as_u16()
            ));
        }

        let captcha_src = find_captcha_src(&html).ok_or_else(|| {
            "Could not locate CAPTCHA image on the IPU login page. The portal may be temporarily down."
                .to_string()
        })?;
        let captcha_url = resolve_ipu_url(&captcha_src, IPU_LOGIN_URL);

        let img_resp = client
            .get(&captcha_url)
            .header("Referer", IPU_LOGIN_URL)
            .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
            .send()
            .await
            .map_err(|e| format!("Failed to download CAPTCHA image: {}", e))?;

        let content_type = img_resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/png")
            .split(';')
            .next()
            .unwrap_or("image/png")
            .trim()
            .to_string();

        let bytes = img_resp
            .bytes()
            .await
            .map_err(|e| format!("Failed to read CAPTCHA bytes: {}", e))?;

        if bytes.len() < 100 || content_type.starts_with("text/") {
            return Err("IPU portal returned an invalid CAPTCHA response. Please refresh and try again.".to_string());
        }

        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let hidden_fields = extract_hidden_fields(&html);
        let field_names = detect_field_names(&html);
        let login_action = detect_login_action(&html);
        let hash_password = html.contains("hashPassword") || html.to_lowercase().contains("crypt.js");

        *self.client.lock().await = Some(client);

        Ok(IpuCaptchaSession {
            captcha_image: format!("data:{};base64,{}", content_type, b64),
            hidden_fields,
            field_names,
            login_action,
            hash_password,
        })
    }

    /// Submits enrollment, password (hashed per IPU's live `crypt.js` when enabled), and
    /// user-typed CAPTCHA to the active IPU session, verifies login on Spring Boot's
    /// `/web/student/studenthome`, dynamically discovers live result endpoints/tables from
    /// the authenticated portal HTML & JS, and returns student profile + all published semesters.
    pub async fn login_and_fetch_all(
        &self,
        enrollment: &str,
        password: &str,
        captcha: &str,
        hidden_fields: &HashMap<String, String>,
        field_names: &IpuFieldNames,
        login_action: &str,
        hash_password: bool,
    ) -> Result<(Value, Vec<Value>), String> {
        let client = {
            let guard = self.client.lock().await;
            guard
                .clone()
                .ok_or_else(|| "IPU session expired. Click refresh to load a fresh CAPTCHA.".to_string())?
        };

        let enroll = enrollment.trim();
        let cap = captcha.trim();
        if enroll.is_empty() || password.is_empty() || cap.is_empty() {
            return Err("Enrollment number, password, and CAPTCHA are all required.".to_string());
        }

        // Exact match for examweb.ggsipu.ac.in/web/js/crypt.js:
        // passwordInput.value = btoa(SHA-256(password + captcha))
        let submitted_password = if hash_password {
            compute_ipu_salted_hash(password, cap)
        } else {
            password.to_string()
        };

        let login_url = sanitize_login_action(login_action);
        let mut form_pairs: Vec<(String, String)> = Vec::new();
        let reserved: HashSet<String> = [
            field_names.username.to_lowercase(),
            field_names.password.to_lowercase(),
            field_names.captcha.to_lowercase(),
        ]
        .into_iter()
        .collect();

        for (k, v) in hidden_fields {
            if !reserved.contains(&k.to_lowercase()) {
                form_pairs.push((k.clone(), v.clone()));
            }
        }
        form_pairs.push((field_names.username.clone(), enroll.to_string()));
        form_pairs.push((field_names.password.clone(), submitted_password));
        form_pairs.push((field_names.captcha.clone(), cap.to_string()));

        let mut resp = client
            .post(&login_url)
            .header("Referer", IPU_LOGIN_URL)
            .header("Origin", IPU_BASE)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .form(&form_pairs)
            .send()
            .await
            .map_err(|e| format!("Network error posting login to IPU portal: {}", e))?;

        // Follow up to 6 redirects while preserving Tomcat/Spring session cookies
        let mut hops = 0;
        let mut final_url = login_url.clone();
        while resp.status().is_redirection() && hops < 6 {
            let Some(loc) = resp
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
            else {
                break;
            };
            let next_url = resolve_ipu_url(&loc, &final_url);
            if !next_url.starts_with(IPU_BASE) {
                return Err("Blocked unexpected cross-origin redirect from IPU portal.".to_string());
            }
            resp = client
                .get(&next_url)
                .header("Referer", &final_url)
                .send()
                .await
                .map_err(|e| format!("Redirect error on IPU portal: {}", e))?;
            final_url = next_url;
            hops += 1;
        }

        let post_status = resp.status();
        let page_text = resp.text().await.unwrap_or_default();

        if let Some(lockout) = detect_lockout(&page_text) {
            *self.client.lock().await = None;
            return Err(lockout);
        }

        // Redesigned examweb.ggsipu.ac.in renders `<title>System Message</title>` with
        // `<div class="message-type error">ERROR</div><div class="message">...</div>`
        if let Some(sys_msg) = extract_system_message(&page_text) {
            return Err(format!("IPU Portal: {}", sys_msg));
        }

        if is_login_page(&page_text) {
            if let Some(msg) = extract_error_hint(&page_text) {
                return Err(msg);
            }
            return Err("Invalid credentials or wrong CAPTCHA. CAPTCHA is case-sensitive — please check and try again.".to_string());
        }

        // Obtain authenticated student home HTML (Spring Boot: `/web/student/studenthome`)
        let (home_url, home_html) = if post_status.is_success()
            && !is_spring_error_page(&page_text)
            && final_url.to_lowercase().contains("/web/student/")
        {
            (final_url.clone(), page_text)
        } else {
            let (u, h, st) = fetch_following_redirects(&client, IPU_HOME_URL, &final_url).await?;
            if let Some(sys_msg) = extract_system_message(&h) {
                return Err(format!("IPU Portal: {}", sys_msg));
            }
            if !st.is_success() || h.trim().is_empty() || is_login_page(&h) || is_spring_error_page(&h) {
                return Err("Portal login did not reach the student dashboard. Verify your enrollment number, password, and case-sensitive CAPTCHA.".to_string());
            }
            (u, h)
        };

        // 1. Scrape student profile from both studenthome and `/web/student/profile`
        let mut merged_profile = extract_profile_from_html(&home_html);
        if let Ok((_, prof_html, prof_st)) = fetch_following_redirects(&client, IPU_PROFILE_URL, &home_url).await {
            if prof_st.is_success() && !is_login_page(&prof_html) && !is_spring_error_page(&prof_html) {
                for (k, v) in extract_profile_from_html(&prof_html) {
                    merged_profile.entry(k).or_insert(v);
                }
            }
        }

        // 2. Dynamically discover all result pages, scripts, and API endpoints from studenthome
        let mut semesters: Vec<Value> = Vec::new();
        let mut seen_sems: HashSet<i64> = HashSet::new();

        // Check if studenthome itself already contains embedded results table or inline JSON
        for (sem_val, sem_info) in parse_html_tables_for_semesters(&home_html, None) {
            let snum = sem_val.get("semester_num").and_then(|v| v.as_i64()).unwrap_or(0);
            if snum > 0 && seen_sems.insert(snum) {
                merge_profile_fields(&mut merged_profile, &sem_info);
                semesters.push(sem_val);
            }
        }

        let mut sources: Vec<(String, String)> = vec![(home_url.clone(), home_html.clone())];
        let mut fetched_urls: HashSet<String> = HashSet::new();
        fetched_urls.insert(strip_jsessionid(&home_url));

        // Fetch non-vendor scripts loaded by studenthome
        for script_url in extract_script_urls(&home_html, &home_url) {
            let clean_u = strip_jsessionid(&script_url);
            if fetched_urls.insert(clean_u) {
                if let Ok((_, js_text, st)) = fetch_following_redirects(&client, &script_url, &home_url).await {
                    if st.is_success() && !is_spring_error_page(&js_text) {
                        sources.push((script_url, js_text));
                    }
                }
            }
        }

        // Follow result/exam/marks navigation links on studenthome (up to 6 pages)
        let nav_links = extract_result_nav_links(&home_html, &home_url);
        for link_url in nav_links.iter().take(6) {
            let clean_u = strip_jsessionid(link_url);
            if !fetched_urls.insert(clean_u) {
                continue;
            }
            if let Ok((page_u, sub_html, st)) = fetch_following_redirects(&client, link_url, &home_url).await {
                if !st.is_success() || is_login_page(&sub_html) || is_spring_error_page(&sub_html) {
                    continue;
                }
                for (k, v) in extract_profile_from_html(&sub_html) {
                    merged_profile.entry(k).or_insert(v);
                }
                // Check if this page already renders results in JSON or HTML tables
                if let Some((all_sems, info)) = parse_any_results_response(&sub_html, None) {
                    merge_profile_fields(&mut merged_profile, &info);
                    for s in all_sems {
                        let snum = s.get("semester_num").and_then(|v| v.as_i64()).unwrap_or(0);
                        if snum > 0 && seen_sems.insert(snum) {
                            semesters.push(s);
                        }
                    }
                }
                // Also load scripts referenced by this result sub-page
                for script_url in extract_script_urls(&sub_html, &page_u) {
                    let clean_s = strip_jsessionid(&script_url);
                    if fetched_urls.insert(clean_s) {
                        if let Ok((_, js_text, js_st)) = fetch_following_redirects(&client, &script_url, &page_u).await {
                            if js_st.is_success() && !is_spring_error_page(&js_text) {
                                sources.push((script_url, js_text));
                            }
                        }
                    }
                }
                sources.push((page_u, sub_html));
            }
        }

        // 3. Prioritize live Spring Boot `/web/student/search?flag={searchMode}&euno={sem}` first,
        // followed by dynamically discovered endpoints and legacy fallback.
        let home_hidden = extract_hidden_fields(&home_html);
        let search_mode = home_hidden
            .get("searchMode")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "2".to_string());

        let mut endpoints: Vec<DiscoveredEndpoint> = vec![DiscoveredEndpoint {
            url: IPU_SEARCH_URL.to_string(),
            method: "GET".to_string(),
            sem_param: "euno".to_string(),
            extra_params: HashMap::from([("flag".to_string(), search_mode.clone())]),
        }];

        for ep in discover_result_endpoints(&sources) {
            if !endpoints
                .iter()
                .any(|e| strip_jsessionid(&e.url) == strip_jsessionid(&ep.url) && e.method == ep.method)
            {
                endpoints.push(ep);
            }
        }

        if !endpoints.iter().any(|e| strip_jsessionid(&e.url) == IPU_LEGACY_RESULTS_URL && e.method == "GET") {
            endpoints.push(DiscoveredEndpoint {
                url: IPU_LEGACY_RESULTS_URL.to_string(),
                method: "GET".to_string(),
                sem_param: "euno".to_string(),
                extra_params: HashMap::from([("flag".to_string(), search_mode)]),
            });
        }

        // Detect available published semester options directly from `<select id="euno" name="euno">`
        let mut sem_candidates = extract_semester_options(&sources);
        if sem_candidates.is_empty() {
            sem_candidates = vec![1, 2, 3, 4, 5, 6, 7, 8];
        }
        let individual_sems: Vec<u32> = sem_candidates
            .iter()
            .copied()
            .filter(|&n| n > 0 && n < 20)
            .collect();

        // 4. Query endpoints sequentially (safe for Spring Session): fetch each published semester
        // individually first so Semester 1, 2, ... stay cleanly separated; fall back to `euno=100`.
        if semesters.is_empty() {
            for ep in endpoints.iter().take(6) {
                let mut found_on_this_ep = false;

                for &sem_num in &individual_sems {
                    if seen_sems.contains(&(sem_num as i64)) {
                        continue;
                    }
                    if let Some((sem_list, info)) = query_endpoint_for_sem(&client, ep, sem_num, &home_url).await {
                        merge_profile_fields(&mut merged_profile, &info);
                        for s in sem_list {
                            let snum = s.get("semester_num").and_then(|v| v.as_i64()).unwrap_or(sem_num as i64);
                            if snum > 0 && seen_sems.insert(snum) {
                                semesters.push(s);
                                found_on_this_ep = true;
                            }
                        }
                    }
                }

                // Fallback to `euno=100` (ALL semesters bundle) if individual semester queries returned nothing
                if !found_on_this_ep && ep.sem_param == "euno" {
                    if let Some((bundle_sems, info)) = query_endpoint_for_sem(&client, ep, 100, &home_url).await {
                        merge_profile_fields(&mut merged_profile, &info);
                        for s in bundle_sems {
                            let snum = s.get("semester_num").and_then(|v| v.as_i64()).unwrap_or(0);
                            if snum > 0 && seen_sems.insert(snum) {
                                semesters.push(s);
                                found_on_this_ep = true;
                            }
                        }
                    }
                }

                if found_on_this_ep {
                    break;
                }
            }
        }

        semesters.sort_by_key(|s| s.get("semester_num").and_then(|v| v.as_i64()).unwrap_or(99));

        if semesters.is_empty() {
            let discovered_paths: Vec<String> = endpoints
                .iter()
                .take(5)
                .map(|e| {
                    let p = e.url.strip_prefix(IPU_BASE).unwrap_or(&e.url);
                    format!("{} {}", e.method, p)
                })
                .collect();
            let nav_summary: Vec<String> = nav_links
                .iter()
                .take(4)
                .map(|u| u.strip_prefix(IPU_BASE).unwrap_or(u).to_string())
                .collect();
            return Err(format!(
                "Logged in to IPU portal ({}), but no published semester results could be parsed. Discovered links: [{}]; endpoints tried: [{}].",
                home_url.strip_prefix(IPU_BASE).unwrap_or(&home_url),
                nav_summary.join(", "),
                discovered_paths.join(", ")
            ));
        }

        merged_profile
            .entry("roll_no".to_string())
            .or_insert_with(|| enroll.to_string());

        Ok((json!(merged_profile), semesters))
    }
}

/// Computes `Base64(SHA-256(password + captcha))` matching `examweb.ggsipu.ac.in/web/js/crypt.js`.
pub fn compute_ipu_salted_hash(password: &str, captcha: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}{}", password, captcha).as_bytes());
    let digest = hasher.finalize();
    base64::engine::general_purpose::STANDARD.encode(digest)
}

async fn fetch_following_redirects(
    client: &Client,
    start_url: &str,
    referer: &str,
) -> Result<(String, String, reqwest::StatusCode), String> {
    let mut current_url = start_url.to_string();
    let mut current_ref = referer.to_string();
    let mut resp = client
        .get(&current_url)
        .header("Referer", &current_ref)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("Network error requesting IPU portal: {}", e))?;

    let mut hops = 0;
    while resp.status().is_redirection() && hops < 5 {
        let Some(loc) = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
        else {
            break;
        };
        let next_url = resolve_ipu_url(&loc, &current_url);
        if !next_url.starts_with(IPU_BASE) {
            break;
        }
        current_ref = current_url;
        current_url = next_url;
        resp = client
            .get(&current_url)
            .header("Referer", &current_ref)
            .send()
            .await
            .map_err(|e| format!("Redirect error on IPU portal: {}", e))?;
        hops += 1;
    }

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    Ok((current_url, body, status))
}

async fn query_endpoint_for_sem(
    client: &Client,
    ep: &DiscoveredEndpoint,
    sem_num: u32,
    referer: &str,
) -> Option<(Vec<Value>, Value)> {
    let mut params: Vec<(String, String)> = ep
        .extra_params
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    // Avoid duplicating sem_param if already in URL query string
    if !ep.url.contains(&format!("{}=", ep.sem_param)) {
        params.push((ep.sem_param.clone(), sem_num.to_string()));
    }

    let resp = if ep.method == "POST" {
        client
            .post(&ep.url)
            .header("Referer", referer)
            .header("Origin", IPU_BASE)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/html, */*")
            .form(&params)
            .send()
            .await
            .ok()?
    } else {
        let sep = if ep.url.contains('?') { '&' } else { '?' };
        let qs = params
            .iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");
        let full_url = if qs.is_empty() {
            ep.url.clone()
        } else {
            format!("{}{}{}", ep.url, sep, qs)
        };
        client
            .get(&full_url)
            .header("Referer", referer)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/html, */*")
            .send()
            .await
            .ok()?
    };

    if !resp.status().is_success() {
        return None;
    }
    let text = resp.text().await.ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty()
        || trimmed == "[]"
        || trimmed == "{}"
        || is_login_page(trimmed)
        || is_spring_error_page(trimmed)
        || extract_system_message(trimmed).is_some()
    {
        return None;
    }

    parse_any_results_response(trimmed, Some(sem_num))
}

fn parse_any_results_response(body: &str, fallback_sem: Option<u32>) -> Option<(Vec<Value>, Value)> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Try JSON formats (A, B, C) first
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
            if let Some(res) = parse_json_results(&parsed, fallback_sem) {
                return Some(res);
            }
        }
    }

    // Try HTML result table parsing (Format D)
    let html_sems = parse_html_tables_for_semesters(trimmed, fallback_sem);
    if !html_sems.is_empty() {
        let mut merged_info = HashMap::new();
        let mut sems = Vec::new();
        for (sem_val, info) in html_sems {
            merge_profile_fields(&mut merged_info, &info);
            sems.push(sem_val);
        }
        return Some((sems, json!(merged_info)));
    }

    None
}

pub fn parse_json_results(parsed: &Value, fallback_sem: Option<u32>) -> Option<(Vec<Value>, Value)> {
    // Format 0 (Live 2026 Spring Boot Envelope):
    // `{ "status": "OK", "message": "{\"report\":\"IEM\",\"stprofile\":{...},\"header\":[...],\"stresult\":[[...]]}" }`
    if let Some(obj) = parsed.as_object() {
        if let Some(status) = obj.get("status").and_then(|v| v.as_str()) {
            if status.eq_ignore_ascii_case("error") || status.eq_ignore_ascii_case("fail") {
                return None;
            }
        }
        if let Some(msg_str) = obj.get("message").and_then(|v| v.as_str()) {
            let mt = msg_str.trim();
            if mt.starts_with('{') || mt.starts_with('[') {
                if let Ok(inner) = serde_json::from_str::<Value>(mt) {
                    return parse_json_results(&inner, fallback_sem);
                }
            }
        }
        // Unwrap nested object under `data` / `payload` / `result`
        for wrapper_key in ["data", "payload", "result"] {
            if let Some(inner_obj) = obj.get(wrapper_key).filter(|v| v.is_object()) {
                if let Some(res) = parse_json_results(inner_obj, fallback_sem) {
                    return Some(res);
                }
            }
        }

        // Format A: Structured `{ report, stprofile: {...}, header: [...], stresult: [[...], ...] }`
        if let Some(rows) = obj.get("stresult").and_then(|v| v.as_array()) {
            if !rows.is_empty() {
                let prof = obj.get("stprofile").cloned().unwrap_or_else(|| json!({}));
                let info = extract_info_from_json_obj(&prof);

                // If `stresult` contains objects instead of arrays, delegate directly
                if rows.first().map(|v| v.is_object()).unwrap_or(false) {
                    if let Some((sems, mut arr_info)) = parse_object_array_results(rows, fallback_sem) {
                        if let (Some(dst), Some(src)) = (arr_info.as_object_mut(), info.as_object()) {
                            for (k, v) in src {
                                if !v.as_str().unwrap_or("").is_empty() {
                                    dst.entry(k.clone()).or_insert_with(|| v.clone());
                                }
                            }
                        }
                        return Some((sems, arr_info));
                    }
                }

                // Header-driven column mapping matching live `/web/js/student/stdata.js`
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
                        let h = json_val_to_str(hv).to_lowercase();
                        if h.contains("sem") || h.contains("annual") || h.contains("euno") {
                            col_sem = Some(idx);
                        } else if (h.contains("paper") || h.contains("subject") || h.contains("course")) && h.contains("code") || h == "code" {
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

                let explicit_sem = fallback_sem.filter(|&n| n > 0 && n < 20);
                let mut grouped: HashMap<u32, Vec<Value>> = HashMap::new();

                for row in rows {
                    let Some(arr) = row.as_array() else { continue };
                    if arr.len() < 4 {
                        continue;
                    }
                    let get_s = |i: usize| -> String {
                        arr.get(i).map(json_val_to_str).unwrap_or_default()
                    };
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
                    let credits_opt = col_credits
                        .map(&get_s)
                        .and_then(|s| s.parse::<u32>().ok())
                        .filter(|&c| c > 0);

                    let row_sem = if let Some(s) = explicit_sem {
                        s
                    } else if let Some(si) = col_sem {
                        get_s(si)
                            .chars()
                            .filter(|c| c.is_ascii_digit())
                            .collect::<String>()
                            .parse::<u32>()
                            .ok()
                            .filter(|&n| n > 0 && n < 20)
                            .unwrap_or(1)
                    } else {
                        arr.first()
                            .map(json_val_to_str)
                            .and_then(|s| s.parse::<u32>().ok())
                            .filter(|&n| n > 0 && n <= 12)
                            .unwrap_or(1)
                    };

                    let is_pending =
                        total_raw.is_empty() || total_raw == "-" || total_raw.parse::<f64>().is_err();
                    let total_marks = total_raw.parse::<f64>().ok();

                    let mut sub_obj = json!({
                        "code": code,
                        "name": if name.is_empty() { "Unknown Subject".to_string() } else { name },
                        "internal": if internal.is_empty() { "-".to_string() } else { internal },
                        "external": if external.is_empty() { "-".to_string() } else { external },
                        "total_marks": total_marks,
                        "max_marks": 100.0,
                        "status": status,
                        "is_pending": is_pending,
                        "exam_session": if exam_session.is_empty() { Value::Null } else { json!(exam_session) },
                        "declared_date": if declared_date.is_empty() { Value::Null } else { json!(declared_date) }
                    });
                    if !grade.is_empty() && grade != "-" {
                        sub_obj["grade"] = json!(grade);
                    }
                    if let Some(cr) = credits_opt {
                        sub_obj["credits"] = json!(cr);
                    }
                    grouped.entry(row_sem).or_default().push(sub_obj);
                }

                if !grouped.is_empty() {
                    let mut out_sems: Vec<Value> = grouped
                        .into_iter()
                        .map(|(sem_num, subjects)| {
                            json!({
                                "semester": sem_num,
                                "semester_num": sem_num,
                                "semester_label": format!("Semester {}", sem_num),
                                "subjects": subjects,
                                "sgpa": 0.0
                            })
                        })
                        .collect();
                    out_sems.sort_by_key(|s| s.get("semester_num").and_then(|v| v.as_i64()).unwrap_or(99));
                    return Some((out_sems, info));
                }
            }
        }

        // Format C (wrapped): `{ data/results/result/subjects/rows/records/list: [...] }`
        for key in ["data", "results", "result", "subjects", "rows", "records", "list", "papers"] {
            if let Some(arr) = obj.get(key).and_then(|v| v.as_array()) {
                if let Some((sems, mut info)) = parse_object_array_results(arr, fallback_sem) {
                    if let Some(prof_obj) = obj
                        .get("student")
                        .or_else(|| obj.get("profile"))
                        .or_else(|| obj.get("stprofile"))
                        .or_else(|| obj.get("studentInfo"))
                    {
                        if let (Some(dst), Some(src)) = (info.as_object_mut(), extract_info_from_json_obj(prof_obj).as_object()) {
                            for (k, v) in src {
                                if !v.as_str().unwrap_or("").is_empty() {
                                    dst.entry(k.clone()).or_insert_with(|| v.clone());
                                }
                            }
                        }
                    }
                    return Some((sems, info));
                }
            }
        }
    }

    // Format B & C (direct array): `IpuRawSubject[]` or camelCase Spring Boot DTO array
    if let Some(arr) = parsed.as_array() {
        return parse_object_array_results(arr, fallback_sem);
    }

    None
}

fn parse_object_array_results(arr: &[Value], fallback_sem: Option<u32>) -> Option<(Vec<Value>, Value)> {
    if arr.is_empty() {
        return None;
    }

    let mut info_map: HashMap<String, String> = HashMap::new();
    let mut grouped: HashMap<u32, (f64, Vec<Value>)> = HashMap::new();

    for item in arr {
        let Some(obj) = item.as_object() else { continue };
        let name = pick_str(obj, &["papername", "paperName", "paper_name", "subjectname", "subjectName", "subject_name", "name"]);
        let code = pick_str(obj, &["papercode", "paperCode", "paper_code", "subjectcode", "subjectCode", "code"]);
        if name.is_empty() && code.is_empty() {
            continue;
        }

        let sem_raw = pick_u32(obj, &["euno", "semester", "semester_num", "semesterNum", "sem", "semNo"]);
        let sem = sem_raw
            .filter(|&n| n > 0 && n < 20)
            .or_else(|| fallback_sem.filter(|&n| n > 0 && n < 20))
            .unwrap_or(1);

        let sgpa = pick_f64(obj, &["eugpa", "sgpa", "gpa"]).unwrap_or(0.0);
        let internal = {
            let s = pick_str(obj, &["minorprint", "minorPrint", "internal", "internalMarks", "internal_marks", "minor"]);
            if s.is_empty() { "-".to_string() } else { s }
        };
        let external = {
            let s = pick_str(obj, &["majorprint", "majorPrint", "external", "externalMarks", "external_marks", "major"]);
            if s.is_empty() { "-".to_string() } else { s }
        };
        let total_raw = pick_str(obj, &["moderatedprint", "moderatedPrint", "total_marks", "totalMarks", "total", "marks", "moderated"]);
        let status = pick_str(obj, &["statuscode", "statusCode", "status", "resultStatus"]);
        let grade = pick_str(obj, &["grade", "paperGrade"]);
        let credits_opt = pick_u32(obj, &["credits", "credit", "paperCredit", "paper_credit"]).filter(|&c| c > 0);
        let declared = pick_str(obj, &["declareddate", "declaredDate", "declared_date", "resultDate"]);

        let is_pending = total_raw.is_empty() || total_raw == "-" || total_raw.parse::<f64>().is_err();
        let total_marks = total_raw.parse::<f64>().ok();

        merge_profile_fields(&mut info_map, &extract_info_from_json_obj(item));

        let entry = grouped.entry(sem).or_insert_with(|| (sgpa, Vec::new()));
        if entry.0 <= 0.0 && sgpa > 0.0 {
            entry.0 = sgpa;
        }
        let mut sub_val = json!({
            "code": code,
            "name": if name.is_empty() { "Unknown Subject".to_string() } else { name },
            "internal": internal,
            "external": external,
            "total_marks": total_marks,
            "max_marks": 100.0,
            "grade": if grade.is_empty() { Value::Null } else { json!(grade) },
            "status": status,
            "is_pending": is_pending,
            "declared_date": if declared.is_empty() { Value::Null } else { json!(declared) }
        });
        if let Some(cr) = credits_opt {
            sub_val["credits"] = json!(cr);
        }
        entry.1.push(sub_val);
    }

    if grouped.is_empty() {
        return None;
    }

    let mut semesters: Vec<Value> = grouped
        .into_iter()
        .map(|(sem, (sgpa, subjects))| {
            json!({
                "semester": sem,
                "semester_num": sem,
                "semester_label": format!("Semester {}", sem),
                "subjects": subjects,
                "sgpa": sgpa
            })
        })
        .collect();
    semesters.sort_by_key(|s| s.get("semester_num").and_then(|v| v.as_i64()).unwrap_or(99));

    Some((semesters, json!(info_map)))
}

/// Format D: Parses server-rendered HTML `<table>` results (in case redesigned Spring Boot
/// renders Thymeleaf/JSP result tables directly).
pub fn parse_html_tables_for_semesters(html: &str, fallback_sem: Option<u32>) -> Vec<(Value, Value)> {
    let table_re = Regex::new(r"(?is)<table\b[^>]*>(.*?)</table>").unwrap();
    let tr_re = Regex::new(r"(?is)<tr\b[^>]*>(.*?)</tr>").unwrap();
    let cell_re = Regex::new(r"(?is)<t[hd]\b[^>]*>(.*?)</t[hd]>").unwrap();
    let tag_re = Regex::new(r"(?is)<[^>]+>").unwrap();
    let sem_re = Regex::new(r"(?i)\b(?:semester|sem)\s*[-:#]?\s*0?([1-8])\b").unwrap();
    let sgpa_re = Regex::new(r"(?i)\b(?:sgpa|eugpa)\s*[:=\-]?\s*(\d{1,2}(?:\.\d{1,2})?)").unwrap();

    let clean_text = |raw: &str| -> String {
        tag_re
            .replace_all(raw, " ")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&#39;", "'")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    };

    let page_sem = sem_re
        .captures(html)
        .and_then(|c| c[1].parse::<u32>().ok())
        .or_else(|| fallback_sem.filter(|&n| n > 0 && n < 20))
        .unwrap_or(1);
    let page_sgpa = sgpa_re
        .captures(html)
        .and_then(|c| c[1].parse::<f64>().ok())
        .filter(|&g| g > 0.0 && g <= 10.0)
        .unwrap_or(0.0);

    let prof = extract_profile_from_html(html);
    let mut results_out = Vec::new();

    for tcap in table_re.captures_iter(html) {
        let tbody = &tcap[1];
        let mut rows: Vec<Vec<String>> = Vec::new();
        for rcap in tr_re.captures_iter(tbody) {
            let cells: Vec<String> = cell_re
                .captures_iter(&rcap[1])
                .map(|cc| clean_text(&cc[1]))
                .collect();
            if !cells.is_empty() {
                rows.push(cells);
            }
        }
        if rows.len() < 2 {
            continue;
        }

        // Identify header row containing paper/subject & marks/total/internal/external
        let mut header_idx = None;
        let mut col_code = None;
        let mut col_name = None;
        let mut col_int = None;
        let mut col_ext = None;
        let mut col_tot = None;
        let mut col_grade = None;
        let mut col_status = None;
        let mut col_sem = None;

        for (ri, row) in rows.iter().take(4).enumerate() {
            let lower: Vec<String> = row.iter().map(|c| c.to_lowercase()).collect();
            let mut found_name = None;
            let mut found_code = None;
            let mut found_int = None;
            let mut found_ext = None;
            let mut found_tot = None;
            let mut found_grade = None;
            let mut found_status = None;
            let mut found_sem = None;

            for (ci, h) in lower.iter().enumerate() {
                if (h.contains("paper") || h.contains("subject") || h.contains("course")) && h.contains("code") {
                    found_code = Some(ci);
                } else if h == "code" || h == "papercode" {
                    found_code = Some(ci);
                } else if h.contains("paper") || h.contains("subject") || h.contains("course name") || h == "title" {
                    found_name = Some(ci);
                } else if h.contains("internal") || h.contains("minor") {
                    found_int = Some(ci);
                } else if h.contains("external") || h.contains("major") {
                    found_ext = Some(ci);
                } else if h.contains("total") || h.contains("moderated") || h == "marks" {
                    found_tot = Some(ci);
                } else if h.contains("grade") {
                    found_grade = Some(ci);
                } else if h.contains("status") || h == "result" {
                    found_status = Some(ci);
                } else if h == "sem" || h.contains("semester") || h == "euno" {
                    found_sem = Some(ci);
                }
            }

            if (found_name.is_some() || found_code.is_some())
                && (found_tot.is_some() || found_int.is_some() || found_ext.is_some() || found_grade.is_some())
            {
                header_idx = Some(ri);
                col_code = found_code;
                col_name = found_name;
                col_int = found_int;
                col_ext = found_ext;
                col_tot = found_tot;
                col_grade = found_grade;
                col_status = found_status;
                col_sem = found_sem;
                break;
            }
        }

        let Some(hi) = header_idx else { continue };
        let mut grouped: HashMap<u32, Vec<Value>> = HashMap::new();

        for row in rows.iter().skip(hi + 1) {
            let get_c = |opt: Option<usize>| -> String {
                opt.and_then(|i| row.get(i)).cloned().unwrap_or_default()
            };
            let code = get_c(col_code);
            let name = get_c(col_name);
            if code.is_empty() && name.is_empty() {
                continue;
            }
            let lower_name = name.to_lowercase();
            if lower_name == "total" || lower_name.starts_with("sgpa") || lower_name.starts_with("cgpa") {
                continue;
            }
            let internal = {
                let s = get_c(col_int);
                if s.is_empty() { "-".to_string() } else { s }
            };
            let external = {
                let s = get_c(col_ext);
                if s.is_empty() { "-".to_string() } else { s }
            };
            let total_raw = get_c(col_tot);
            let grade = get_c(col_grade);
            let status = get_c(col_status);
            let row_sem = get_c(col_sem)
                .chars()
                .filter(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u32>()
                .ok()
                .filter(|&n| n > 0 && n < 20)
                .unwrap_or(page_sem);

            let is_pending = total_raw.is_empty() || total_raw == "-" || total_raw.parse::<f64>().is_err();
            let total_marks = total_raw.parse::<f64>().ok();

            grouped.entry(row_sem).or_default().push(json!({
                "code": code,
                "name": if name.is_empty() { code.clone() } else { name },
                "internal": internal,
                "external": external,
                "total_marks": total_marks,
                "max_marks": 100.0,
                "grade": if grade.is_empty() { Value::Null } else { json!(grade) },
                "status": status,
                "is_pending": is_pending
            }));
        }

        for (sem, subs) in grouped {
            if !subs.is_empty() {
                results_out.push((
                    json!({
                        "semester": sem,
                        "semester_num": sem,
                        "semester_label": format!("Semester {}", sem),
                        "subjects": subs,
                        "sgpa": page_sgpa
                    }),
                    json!(prof),
                ));
            }
        }
    }

    results_out
}

fn extract_script_urls(html: &str, base_url: &str) -> Vec<String> {
    let re = Regex::new(r#"(?is)<script[^>]+src=["']([^"']+)["']"#).unwrap();
    let skip_vendor = ["jquery", "bootstrap", "popper", "fontawesome", "crypt.js", "loginvalidate.js", "framebuster.js", "chart", "datatables"];
    let mut out = Vec::new();
    for cap in re.captures_iter(html) {
        let src = cap[1].trim();
        let low = src.to_lowercase();
        if src.is_empty() || low.starts_with("http://") || low.starts_with("https://") && !low.starts_with(IPU_BASE) {
            continue;
        }
        if skip_vendor.iter().any(|v| low.contains(v)) {
            continue;
        }
        out.push(resolve_ipu_url(src, base_url));
    }
    out
}

fn extract_result_nav_links(html: &str, base_url: &str) -> Vec<String> {
    let a_re = Regex::new(r#"(?is)<a[^>]+href=["']([^"'#]+)["'][^>]*>(.*?)</a>"#).unwrap();
    let tag_re = Regex::new(r"(?is)<[^>]+>").unwrap();
    let keywords = ["result", "mark", "grade", "exam", "search", "report", "score", "academic", "sem"];
    let skip = ["logout", "forget", "password", "javascript:", "mailto:", "pdf", ".css", ".png", ".jpg"];
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for cap in a_re.captures_iter(html) {
        let href = cap[1].trim();
        let text = tag_re.replace_all(&cap[2], " ").to_lowercase();
        let low_href = href.to_lowercase();
        if href.is_empty() || skip.iter().any(|s| low_href.contains(s)) {
            continue;
        }
        if keywords.iter().any(|k| low_href.contains(k) || text.contains(k)) {
            let resolved = resolve_ipu_url(href, base_url);
            if resolved.starts_with(IPU_BASE) && seen.insert(strip_jsessionid(&resolved)) {
                out.push(resolved);
            }
        }
    }
    out
}

fn discover_result_endpoints(sources: &[(String, String)]) -> Vec<DiscoveredEndpoint> {
    let mut out: Vec<DiscoveredEndpoint> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let form_re = Regex::new(r"(?is)<form\b([^>]*)>(.*?)</form>").unwrap();
    let attr_re = Regex::new(r#"(?is)(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#).unwrap();
    let js_url_re = Regex::new(
        r#"(?i)(?:fetch\s*\(|url\s*:\s*|\$\.(?:get|post|getJSON)\s*\(|open\s*\(\s*["'](?:GET|POST)["']\s*,\s*|axios\.(?:get|post)\s*\()\s*["'`]([^"'`\s)]+)["'`]"#,
    )
    .unwrap();
    let quoted_path_re = Regex::new(
        r#"(?i)["'`](/web/[A-Za-z0-9_./-]*(?:SearchProcess|search|result|marks|grade)[A-Za-z0-9_./?&=%-]*)["'`]"#,
    )
    .unwrap();

    let mut push_ep = |url: String, method: &str, sem_param: &str, extra: HashMap<String, String>| {
        if !url.starts_with(IPU_BASE) {
            return;
        }
        let low = url.to_lowercase();
        if low.ends_with(".css")
            || low.ends_with(".js")
            || low.ends_with(".png")
            || low.ends_with(".jpg")
            || low.ends_with(".svg")
            || low.contains("logout")
            || low.contains("login")
            || low.contains("forgetpw")
            || low.contains("captcha")
        {
            return;
        }
        let clean = strip_jsessionid(&url);
        let key = format!("{}|{}|{}", method, clean, sem_param);
        if seen.insert(key) {
            out.push(DiscoveredEndpoint {
                url,
                method: method.to_string(),
                sem_param: sem_param.to_string(),
                extra_params: extra,
            });
        }
    };

    for (base_url, content) in sources {
        // 1. HTML Forms referencing euno/sem/result
        for fcap in form_re.captures_iter(content) {
            let attrs = &fcap[1];
            let body = &fcap[2];
            let mut action = String::new();
            let mut method = "GET".to_string();
            for ac in attr_re.captures_iter(attrs) {
                let k = ac[1].to_lowercase();
                let v = ac.get(2).or(ac.get(3)).or(ac.get(4)).map(|m| m.as_str()).unwrap_or("");
                if k == "action" {
                    action = v.trim().to_string();
                } else if k == "method" && v.eq_ignore_ascii_case("post") {
                    method = "POST".to_string();
                }
            }
            if action.is_empty() {
                continue;
            }
            let low_body = body.to_lowercase();
            let low_act = action.to_lowercase();
            if low_act.contains("login") || low_act.contains("logout") || low_act.contains("password") {
                continue;
            }
            if low_body.contains("euno") || low_body.contains("sem") || low_act.contains("result") || low_act.contains("search") {
                let resolved = resolve_ipu_url(&action, base_url);
                let sem_p = if low_body.contains("name=\"euno\"") || low_body.contains("name='euno'") {
                    "euno"
                } else if low_body.contains("name=\"semester\"") {
                    "semester"
                } else if low_body.contains("name=\"sem\"") {
                    "sem"
                } else {
                    "euno"
                };
                let hidden = extract_hidden_fields(body);
                push_ep(resolved, &method, sem_p, hidden);
            }
        }

        // 2. Explicit JS fetch / $.ajax / $.get / $.post / xhr.open calls
        for cap in js_url_re.captures_iter(content) {
            let raw_u = cap[1].trim();
            if raw_u.is_empty() {
                continue;
            }
            let resolved = resolve_ipu_url(raw_u, base_url);
            let ctx = cap.get(0).map(|m| m.as_str().to_lowercase()).unwrap_or_default();
            let is_post = ctx.contains("post");
            let mut extra = HashMap::new();
            if !resolved.contains("flag=") {
                extra.insert("flag".to_string(), "2".to_string());
            }
            push_ep(resolved.clone(), if is_post { "POST" } else { "GET" }, "euno", extra.clone());
            // Also try without `flag=2` in case Spring Boot takes only `euno`
            push_ep(resolved, if is_post { "POST" } else { "GET" }, "euno", HashMap::new());
        }

        // 3. Quoted relative/absolute paths mentioning search/result/euno/flag=2
        for cap in quoted_path_re.captures_iter(content) {
            let raw_u = cap[1].trim();
            if raw_u.len() < 4 || raw_u.contains(' ') {
                continue;
            }
            let resolved = resolve_ipu_url(raw_u, base_url);
            let mut extra = HashMap::new();
            if !resolved.contains("flag=") {
                extra.insert("flag".to_string(), "2".to_string());
            }
            push_ep(resolved.clone(), "GET", "euno", extra);
            push_ep(resolved, "GET", "euno", HashMap::new());
        }
    }

    out
}

fn extract_semester_options(sources: &[(String, String)]) -> Vec<u32> {
    let select_re = Regex::new(r#"(?is)<select[^>]+(?:name|id)=["'][^"']*(?:euno|sem)[^"']*["'][^>]*>(.*?)</select>"#).unwrap();
    let opt_re = Regex::new(r#"(?is)<option[^>]+value=["'](\d{1,3})["']"#).unwrap();
    let mut vals = Vec::new();
    let mut seen = HashSet::new();
    for (_, src) in sources {
        for scap in select_re.captures_iter(src) {
            for ocap in opt_re.captures_iter(&scap[1]) {
                if let Ok(n) = ocap[1].parse::<u32>() {
                    if ((1..=10).contains(&n) || n == 100) && seen.insert(n) {
                        vals.push(n);
                    }
                }
            }
        }
    }
    vals
}

fn merge_profile_fields(merged_profile: &mut HashMap<String, String>, sem_info: &Value) {
    if let Some(obj) = sem_info.as_object() {
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                if !s.trim().is_empty() && s != "---" {
                    merged_profile
                        .entry(k.clone())
                        .or_insert_with(|| s.trim().to_string());
                }
            }
        }
    }
}

fn extract_info_from_json_obj(val: &Value) -> Value {
    let Some(obj) = val.as_object() else {
        return json!({});
    };
    json!({
        "name": pick_str(obj, &["stname", "studentName", "name"]),
        "father": pick_str(obj, &["father", "fatherName", "fname"]),
        "mother": pick_str(obj, &["mother", "motherName", "mname"]),
        "gender": pick_str(obj, &["gender", "sex"]),
        "email": pick_str(obj, &["email", "emailId", "email_id"]),
        "phone": pick_str(obj, &["mobno", "mobile", "phone", "phoneNo"]),
        "institution": pick_str(obj, &["iname", "institute", "institution", "college"]),
        "programme": pick_str(obj, &["prgname", "programme", "program", "course"]),
        "batch": pick_str(obj, &["byoa", "batch"]),
        "roll_no": pick_str(obj, &["nrollno", "rollNo", "roll_no", "enrollmentNumber", "enrollment_number"]),
        "admission_year": pick_str(obj, &["yoa", "admissionYear", "admission_year"])
    })
}

fn json_val_to_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

fn pick_str(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> String {
    for &k in keys {
        if let Some(v) = obj.get(k) {
            let s = json_val_to_str(v);
            if !s.is_empty() && s != "null" && s != "---" {
                return s;
            }
        }
    }
    String::new()
}

fn pick_u32(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<u32> {
    for &k in keys {
        if let Some(v) = obj.get(k) {
            if let Some(n) = v.as_u64() {
                return Some(n as u32);
            }
            if let Some(s) = v.as_str() {
                if let Ok(n) = s.trim().parse::<u32>() {
                    return Some(n);
                }
            }
        }
    }
    None
}

fn pick_f64(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<f64> {
    for &k in keys {
        if let Some(v) = obj.get(k) {
            if let Some(n) = v.as_f64() {
                return Some(n);
            }
            if let Some(s) = v.as_str() {
                if let Ok(n) = s.trim().parse::<f64>() {
                    return Some(n);
                }
            }
        }
    }
    None
}

fn extract_profile_from_html(html: &str) -> HashMap<String, String> {
    let mut info = HashMap::new();

    // Live Spring Boot `/web/student/profile` embeds `[{&quot;nrollno&quot; : &quot;...&quot;, ...}]`
    let unescaped = html
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&amp;", "&")
        .replace("&#39;", "'");
    if let Ok(json_re) = Regex::new(r#"(?s)\[\s*\{\s*"nrollno"\s*:.*?\}\s*\]"#) {
        if let Some(m) = json_re.find(&unescaped) {
            if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(m.as_str()) {
                if let Some(first) = arr.first() {
                    merge_profile_fields(&mut info, &extract_info_from_json_obj(first));
                }
            }
        }
    }

    let tr_re = Regex::new(r"(?is)<tr[^>]*>\s*<t[dh][^>]*>(.*?)</t[dh]>\s*<td[^>]*>(.*?)</td>").unwrap();
    let kv_re = Regex::new(r#"(?is)<(?:span|div|label|strong|b)[^>]*class=["'][^"']*label[^"']*["'][^>]*>(.*?)</(?:span|div|label|strong|b)>\s*<(?:span|div|p)[^>]*>(.*?)</(?:span|div|p)>"#).unwrap();
    let tag_re = Regex::new(r"(?is)<[^>]+>").unwrap();

    let mut insert_pair = |raw_k: &str, raw_v: &str| {
        let label = tag_re.replace_all(raw_k, " ").to_lowercase();
        let label_clean = label
            .replace([':', '.'], "")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let val = tag_re
            .replace_all(raw_v, " ")
            .replace("&nbsp;", " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if val.is_empty() || val == "-" || val == "---" {
            return;
        }
        let key = match label_clean.as_str() {
            "enrollment" | "enrollment no" | "enrollment number" | "roll no" => Some("roll_no"),
            "batch" => Some("batch"),
            "admission year" | "year of admission" => Some("admission_year"),
            "name" | "student name" => Some("name"),
            "father's name" | "father" | "father name" => Some("father"),
            "mother's name" | "mother" | "mother name" => Some("mother"),
            "institute" | "institution" | "college" => Some("institution"),
            "program" | "programme" | "course" => Some("programme"),
            _ => None,
        };
        if let Some(k) = key {
            info.entry(k.to_string()).or_insert(val);
        }
    };

    for cap in tr_re.captures_iter(html) {
        insert_pair(&cap[1], &cap[2]);
    }
    for cap in kv_re.captures_iter(html) {
        insert_pair(&cap[1], &cap[2]);
    }
    info
}

fn strip_jsessionid(url: &str) -> String {
    if let Some(idx) = url.to_lowercase().find(";jsessionid=") {
        let after = &url[idx..];
        let end = after.find('?').map(|q| idx + q).unwrap_or(url.len());
        format!("{}{}", &url[..idx], &url[end..])
    } else {
        url.to_string()
    }
}

fn resolve_ipu_url(raw: &str, base_url: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.starts_with('/') {
        format!("{}{}", IPU_BASE, trimmed)
    } else if let Some(rest) = trimmed.strip_prefix("../") {
        // Resolve one directory up from base_url
        let clean_base = strip_jsessionid(base_url);
        let no_query = clean_base.split('?').next().unwrap_or(&clean_base);
        let dir1 = no_query.rfind('/').map(|i| &no_query[..i]).unwrap_or(IPU_BASE);
        let dir2 = dir1.rfind('/').map(|i| &dir1[..i]).unwrap_or(IPU_BASE);
        format!("{}/{}", dir2, rest)
    } else {
        let clean_base = strip_jsessionid(base_url);
        let no_query = clean_base.split('?').next().unwrap_or(&clean_base);
        let dir = no_query.rfind('/').map(|i| &no_query[..=i]).unwrap_or("https://examweb.ggsipu.ac.in/web/");
        format!("{}{}", dir, trimmed.trim_start_matches("./"))
    }
}

fn find_captcha_src(html: &str) -> Option<String> {
    let patterns = [
        r#"(?is)<img[^>]+id=["']?(?:captchaImage|captcha)["']?[^>]+src=["']([^"']+)["']"#,
        r#"(?is)<img[^>]+src=["']([^"']*(?:captcha|kaptcha)[^"']*)["']"#,
        r#"(?is)<img[^>]+class=["'][^"']*captcha[^"']*["'][^>]+src=["']([^"']+)["']"#,
    ];
    for p in patterns {
        if let Ok(re) = Regex::new(p) {
            if let Some(cap) = re.captures(html) {
                return Some(cap[1].to_string());
            }
        }
    }
    None
}

fn extract_hidden_fields(html: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let input_re = Regex::new(r"(?is)<input\b([^>]+)>").unwrap();
    let attr_re = Regex::new(r#"(?is)(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#).unwrap();
    for cap in input_re.captures_iter(html) {
        let attrs_str = &cap[1];
        let mut name = None;
        let mut value = String::new();
        let mut typ = "text".to_string();
        for ac in attr_re.captures_iter(attrs_str) {
            let k = ac[1].to_lowercase();
            let v = ac.get(2).or(ac.get(3)).or(ac.get(4)).map(|m| m.as_str()).unwrap_or("");
            match k.as_str() {
                "name" => name = Some(v.to_string()),
                "value" => value = v.to_string(),
                "type" => typ = v.to_lowercase(),
                _ => {}
            }
        }
        if let Some(n) = name {
            if matches!(typ.as_str(), "hidden" | "submit" | "button") {
                map.insert(n, value);
            }
        }
    }
    map
}

fn detect_field_names(html: &str) -> IpuFieldNames {
    let name_re = Regex::new(r#"(?is)<input[^>]+name=["']([^"']+)["']"#).unwrap();
    let names: Vec<String> = name_re.captures_iter(html).map(|c| c[1].to_string()).collect();

    let find_first = |candidates: &[&str], fallback: &str| -> String {
        for cand in candidates {
            if let Some(found) = names.iter().find(|n| n.to_lowercase().contains(cand)) {
                return found.clone();
            }
        }
        fallback.to_string()
    };

    IpuFieldNames {
        username: find_first(&["username", "j_username", "userid", "user_name", "loginid"], "username"),
        password: find_first(&["passwd", "password", "j_password", "pass"], "passwd"),
        captcha: find_first(&["captcha", "captchavalue", "vcaptcha", "kaptcha", "captchacode"], "captcha"),
    }
}

fn detect_login_action(html: &str) -> String {
    let form_re = Regex::new(r#"(?is)<form[^>]+action=["']([^"']+)["']"#).unwrap();
    for cap in form_re.captures_iter(html) {
        let action = cap[1].trim();
        if !action.is_empty() {
            let resolved = resolve_ipu_url(action, IPU_LOGIN_URL);
            if !resolved.to_lowercase().contains("/web/login.jsp") {
                return resolved;
            }
        }
    }
    IPU_LOGIN_ACTION.to_string()
}

fn sanitize_login_action(raw: &str) -> String {
    let resolved = resolve_ipu_url(raw, IPU_LOGIN_URL);
    if resolved.starts_with(&format!("{}/", IPU_BASE)) {
        resolved
    } else {
        IPU_LOGIN_ACTION.to_string()
    }
}

fn is_spring_error_page(body: &str) -> bool {
    let lower = body.to_lowercase();
    lower.contains("no static resource")
        || lower.contains("whitelabel error page")
        || lower.contains("<title>error message</title>")
        || (lower.contains("\"status\":404") && lower.contains("\"error\":\"not found\""))
        || (lower.contains("\"status\":500") && lower.contains("\"error\":"))
}

fn is_login_page(html: &str) -> bool {
    let lower = html.to_lowercase();
    [
        "name=\"j_username\"",
        "name=\"j_password\"",
        "name=\"passwd\"",
        "id=\"loginform\"",
        "id=\"captchaimage\"",
        "captchaservlet",
        "<title>login page</title>",
    ]
    .iter()
    .any(|ind| lower.contains(ind))
}

/// Extracts the exact error/warning text from IPU's redesigned `System Message` page
/// (e.g. `<div class="message-type error">ERROR</div><div class="message">Invalid Captcha!</div>`).
pub fn extract_system_message(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let is_sys_msg = lower.contains("<title>system message</title>")
        || lower.contains("class=\"message-box\"")
        || lower.contains("message-type");
    if !is_sys_msg {
        return None;
    }
    let tag_re = Regex::new(r"(?is)<[^>]+>").unwrap();
    let msg_re = Regex::new(r#"(?is)<div[^>]*class=["'](?:[^"']*\s)?message(?:\s[^"']*)?["'][^>]*>(.*?)</div>"#).unwrap();
    let type_re = Regex::new(r#"(?is)<div[^>]*class=["'][^"']*message-type[^"']*["'][^>]*>(.*?)</div>"#).unwrap();

    let msg_type = type_re
        .captures(html)
        .map(|c| tag_re.replace_all(&c[1], " ").trim().to_lowercase())
        .unwrap_or_default();
    if msg_type == "success" {
        return None;
    }

    if let Some(cap) = msg_re.captures(html) {
        let cleaned = tag_re
            .replace_all(&cap[1], " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    if lower.contains("invalid captcha") {
        return Some("Invalid Captcha! Please enter the exact case-sensitive characters.".to_string());
    }
    None
}

fn detect_lockout(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let patterns = [
        "your account is locked",
        "account has been locked",
        "account is blocked",
        "too many login attempts",
        "maximum attempts exceeded",
        "contact examination division",
    ];
    if patterns.iter().any(|p| lower.contains(p)) {
        return Some("Your IPU portal account appears locked due to too many attempts. Please contact Examination Division or wait before retrying.".to_string());
    }
    None
}

fn extract_error_hint(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    if lower.contains("captcha") && (lower.contains("invalid") || lower.contains("wrong") || lower.contains("incorrect") || lower.contains("not match")) {
        return Some("Incorrect CAPTCHA entered. Please refresh and try again.".to_string());
    }
    if lower.contains("invalid user") || lower.contains("incorrect password") || lower.contains("invalid password") || lower.contains("authentication failed") {
        return Some("Invalid enrollment number or password.".to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_ipu_salted_hash() {
        let h = compute_ipu_salted_hash("testpass", "1234");
        assert_eq!(h.len(), 44);
        assert!(h.ends_with('='));
    }

    #[test]
    fn test_system_message_and_login_page_detection() {
        let sys_html = r#"<html><head><title>System Message</title></head><body><div class="message-box"><div class="message-type error">ERROR</div><div class="message">Invalid Captcha!</div></div></body></html>"#;
        assert_eq!(extract_system_message(sys_html).as_deref(), Some("Invalid Captcha!"));

        let student_home = r#"<html><head><title>Student Home</title></head><body><a href="/web/logout">Logout</a><a href="/web/student/viewResult">View Result</a></body></html>"#;
        assert!(!is_login_page(student_home));
        assert!(extract_system_message(student_home).is_none());

        let spring_404 = r#"{"timestamp":"2026-11-26T18:06:31.754Z","status":404,"error":"Not Found","path":"/web/student/studenthome.jsp"}"#;
        assert!(is_spring_error_page(spring_404));
    }

    #[test]
    fn test_dynamic_endpoint_discovery_and_multi_format_parsing() {
        let home_html = r#"
            <html><body>
                <a href="/web/student/examResult">View Exam Result</a>
                <script src="/web/js/studentResult.js"></script>
                <select name="euno"><option value="1">Sem 1</option><option value="2">Sem 2</option></select>
            </body></html>
        "#;
        let js = r#"
            async function loadResult(sem) {
                const res = await fetch('/web/student/fetchSemesterResult?flag=2&euno=' + sem);
                return res.json();
            }
        "#;
        let links = extract_result_nav_links(home_html, IPU_HOME_URL);
        assert_eq!(links, vec!["https://examweb.ggsipu.ac.in/web/student/examResult"]);

        let sources = vec![
            (IPU_HOME_URL.to_string(), home_html.to_string()),
            ("https://examweb.ggsipu.ac.in/web/js/studentResult.js".to_string(), js.to_string()),
        ];
        let eps = discover_result_endpoints(&sources);
        assert!(eps.iter().any(|e| e.url.contains("/web/student/fetchSemesterResult")));
        assert_eq!(extract_semester_options(&sources), vec![1, 2]);

        // Format C: Spring Boot camelCase JSON
        let spring_json = json!({
            "student": { "studentName": "Kuber Bassi", "enrollmentNumber": "00113302725" },
            "results": [
                { "semester": 1, "paperCode": "BS-105", "paperName": "Applied Physics", "internalMarks": "23", "externalMarks": "67", "totalMarks": "90", "status": "Pass", "sgpa": 8.9 }
            ]
        });
        let (sems, info) = parse_json_results(&spring_json, Some(1)).expect("parse spring json");
        assert_eq!(sems.len(), 1);
        assert_eq!(sems[0]["semester_num"], 1);
        assert_eq!(sems[0]["subjects"][0]["code"], "BS-105");
        assert_eq!(info["name"], "Kuber Bassi");

        // Format D: HTML table parsing
        let table_html = r#"
            <html><body>
                <h3>Semester 2 Result (SGPA: 8.65)</h3>
                <table>
                    <tr><th>Paper Code</th><th>Paper Name</th><th>Internal</th><th>External</th><th>Total</th><th>Status</th></tr>
                    <tr><td>ES-102</td><td>Programming in C</td><td>24</td><td>64</td><td>88</td><td>Pass</td></tr>
                </table>
            </body></html>
        "#;
        let html_sems = parse_html_tables_for_semesters(table_html, None);
        assert_eq!(html_sems.len(), 1);
        assert_eq!(html_sems[0].0["semester_num"], 2);
        assert_eq!(html_sems[0].0["sgpa"], 8.65);
        assert_eq!(html_sems[0].0["subjects"][0]["code"], "ES-102");
    }

    #[test]
    fn test_live_spring_boot_double_encoded_envelope_and_profile_html() {
        let inner = json!({
            "report": "IEM",
            "stprofile": {
                "nrollno": "00113302725",
                "stname": "TEST STUDENT",
                "iname": "HMR INSTITUTE",
                "prgname": "B.TECH (CSE)",
                "byoa": "2025",
                "yoa": "2025"
            },
            "header": ["Sem", "Paper Code", "Paper Name", "Internal", "External", "Total", "Status", "Exam", "Declared"],
            "stresult": [
                ["1", "BS-105", "APPLIED PHYSICS-I", "23", "67", "90", "P", "DEC,2025", "2026-02-15"],
                ["1", "ES-107", "PROGRAMMING IN C", "24", "61", "85", "P", "DEC,2025", "2026-02-15"]
            ]
        });
        let envelope = json!({
            "status": "OK",
            "message": inner.to_string()
        });

        let (sems, info) = parse_json_results(&envelope, Some(1)).expect("parse double-encoded envelope");
        assert_eq!(sems.len(), 1);
        assert_eq!(sems[0]["semester_num"], 1);
        assert_eq!(sems[0]["subjects"].as_array().unwrap().len(), 2);
        assert_eq!(sems[0]["subjects"][0]["code"], "BS-105");
        assert_eq!(sems[0]["subjects"][0]["total_marks"], 90.0);
        assert_eq!(info["name"], "TEST STUDENT");
        assert_eq!(info["institution"], "HMR INSTITUTE");

        // Error envelope must cleanly return None
        let err_env = json!({ "status": "ERROR", "message": "Invalid Parameter!" });
        assert!(parse_json_results(&err_env, Some(1)).is_none());

        // Profile page HTML-encoded JSON extraction
        let prof_html = r#"<html><body>[{&quot;nrollno&quot; : &quot;00113302725&quot;, &quot;stname&quot; : &quot;TEST STUDENT&quot;, &quot;gender&quot; : &quot;M&quot;, &quot;father&quot; : &quot;FATHER NAME&quot;}]</body></html>"#;
        let extracted = extract_profile_from_html(prof_html);
        assert_eq!(extracted.get("roll_no").map(String::as_str), Some("00113302725"));
        assert_eq!(extracted.get("gender").map(String::as_str), Some("M"));
        assert_eq!(extracted.get("father").map(String::as_str), Some("FATHER NAME"));
    }

    #[tokio::test]
    async fn test_live_ipu_captcha_fetch() {
        let mgr = IpuSessionManager::new();
        let sess = mgr.fetch_captcha().await.expect("live IPU captcha fetch");
        assert!(sess.captcha_image.starts_with("data:image/"), "invalid captcha data uri");
        assert!(sess.captcha_image.len() > 200, "captcha image too small");
        assert!(sess.hash_password, "expected live crypt.js hash_password=true");
        assert!(sess.login_action.contains("/web/login"), "unexpected login_action: {}", sess.login_action);
    }
}
