use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const MAX_EXTERNAL_URL_LEN: usize = 2048;

/// Strictly validates and canonicalizes an external URL before handing it to the OS launcher.
/// Prevents command/argument injection, control-character smuggling, and dangerous schemes
/// (`file://`, `javascript:`, `ms-msdt:`, `vbscript:`, etc.).
pub fn validate_external_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_EXTERNAL_URL_LEN {
        return Err("External URL is empty or exceeds maximum safe length.".to_string());
    }
    if trimmed.chars().any(|c| c.is_control() || c == '\\') {
        return Err("External URL contains disallowed control or backslash characters.".to_string());
    }
    let parsed = reqwest::Url::parse(trimmed)
        .map_err(|_| "Malformed external URL.".to_string())?;

    match parsed.scheme() {
        "https" | "http" => {
            if parsed.host_str().is_none() {
                return Err("External web URL must include a valid host.".to_string());
            }
            if !parsed.username().is_empty() || parsed.password().is_some() {
                return Err("External URLs with embedded credentials are not allowed.".to_string());
            }
        }
        "mailto" => {
            if parsed.path().trim().is_empty() {
                return Err("Empty mailto: address.".to_string());
            }
        }
        _ => {
            return Err("Only http://, https://, and mailto: URLs can be opened externally.".to_string());
        }
    }

    // `parsed.as_str()` guarantees RFC 3986 percent-encoding (no raw spaces or quotes)
    Ok(parsed.as_str().to_string())
}

/// Safely opens an external `https://`, `http://`, or `mailto:` URL in the user's
/// default OS browser or email client without spawning a visible console window.
pub fn open_url(url: &str) -> Result<(), String> {
    let safe_url = validate_external_url(url)?;

    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &safe_url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open link in browser: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&safe_url)
            .spawn()
            .map_err(|e| format!("Failed to open link in browser: {}", e))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&safe_url)
            .spawn()
            .map_err(|e| format!("Failed to open link in browser: {}", e))?;
        return Ok(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_external_url_security() {
        assert!(validate_external_url("https://kuberbassi.com/path?a=1").is_ok());
        assert!(validate_external_url("mailto:me@kuberbassi.com").is_ok());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("file:///C:/Windows/System32/calc.exe").is_err());
        assert!(validate_external_url("ms-msdt:/id PCWDiagnostic").is_err());
        assert!(validate_external_url("https://evil.com/foo\r\nbar").is_err());
        assert!(validate_external_url("https://user:pass@evil.com/").is_err());
        assert!(validate_external_url("https://evil.com\\..\\foo").is_err());
    }
}
