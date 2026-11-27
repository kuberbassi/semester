use std::fs;
use std::path::Path;

fn load_env_file_vars(path: &Path, keys: &[&str]) {
    println!("cargo:rerun-if-changed={}", path.display());
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((k, raw_v)) = trimmed.split_once('=') else {
            continue;
        };
        let key = k.trim();
        if !keys.contains(&key) {
            continue;
        }
        // Respect explicit process environment overrides if already set
        if std::env::var(key).ok().filter(|v| !v.trim().is_empty()).is_some() {
            continue;
        }
        let val = raw_v
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .trim();
        if !val.is_empty() {
            println!("cargo:rustc-env={}={}", key, val);
        }
    }
}

fn main() {
    let keys = ["GOOGLE_DESKTOP_CLIENT_ID", "GOOGLE_DESKTOP_CLIENT_SECRET"];
    for k in keys {
        println!("cargo:rerun-if-env-changed={}", k);
    }
    load_env_file_vars(Path::new("../.env"), &keys);
    load_env_file_vars(Path::new(".env"), &keys);
    tauri_build::build();
}
