use base64::Engine as _;

const DPAPI_PREFIX: &str = "dpapi:v1:";

#[cfg(target_os = "windows")]
mod win_dpapi {
    use std::ffi::c_void;
    use std::ptr;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    #[link(name = "crypt32")]
    unsafe extern "system" {
        fn CryptProtectData(
            p_data_in: *const DataBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *mut c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;

        fn CryptUnprotectData(
            p_data_in: *const DataBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *mut c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
    }

    fn volatile_zero(buf: &mut [u8]) {
        for b in buf.iter_mut() {
            unsafe {
                ptr::write_volatile(b, 0);
            }
        }
        std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    }

    pub fn encrypt(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        if plaintext.is_empty() {
            return Ok(Vec::new());
        }
        let mut input_buf = plaintext.to_vec();
        let in_blob = DataBlob {
            cb_data: input_buf.len() as u32,
            pb_data: input_buf.as_mut_ptr(),
        };
        let mut out_blob = DataBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &in_blob,
                ptr::null(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            )
        };
        volatile_zero(&mut input_buf);
        if ok == 0 {
            return Err("Windows DPAPI CryptProtectData failed".to_string());
        }
        let result = unsafe {
            let slice = std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize);
            let out = slice.to_vec();
            LocalFree(out_blob.pb_data as *mut c_void);
            out
        };
        Ok(result)
    }

    pub fn decrypt(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        if ciphertext.is_empty() {
            return Ok(Vec::new());
        }
        let mut input_buf = ciphertext.to_vec();
        let in_blob = DataBlob {
            cb_data: input_buf.len() as u32,
            pb_data: input_buf.as_mut_ptr(),
        };
        let mut out_blob = DataBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &in_blob,
                ptr::null_mut(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            )
        };
        if ok == 0 {
            return Err("Windows DPAPI CryptUnprotectData failed".to_string());
        }
        let result = unsafe {
            let slice = std::slice::from_raw_parts_mut(out_blob.pb_data, out_blob.cb_data as usize);
            let out = slice.to_vec();
            volatile_zero(slice);
            LocalFree(out_blob.pb_data as *mut c_void);
            out
        };
        Ok(result)
    }
}

/// Encrypts a sensitive string (OAuth tokens, API keys) using Windows DPAPI (CurrentUser scope).
pub fn protect_secret(plaintext: &str) -> Result<String, String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    #[cfg(target_os = "windows")]
    {
        let encrypted = win_dpapi::encrypt(plaintext.as_bytes())?;
        Ok(format!(
            "{}{}",
            DPAPI_PREFIX,
            base64::engine::general_purpose::STANDARD.encode(encrypted)
        ))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(plaintext.to_string())
    }
}

/// Decrypts a stored secret. Gracefully reads legacy plaintext values so upgrades never lose tokens.
pub fn unprotect_secret(stored: &str) -> Result<String, String> {
    if stored.is_empty() {
        return Ok(String::new());
    }
    if let Some(b64) = stored.strip_prefix(DPAPI_PREFIX) {
        #[cfg(target_os = "windows")]
        {
            let raw = base64::engine::general_purpose::STANDARD
                .decode(b64)
                .map_err(|e| format!("Invalid secret encoding: {}", e))?;
            let plain = win_dpapi::decrypt(&raw)?;
            return String::from_utf8(plain).map_err(|e| format!("Invalid secret UTF-8: {}", e));
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = b64;
            return Err("DPAPI secrets can only be decrypted on Windows".to_string());
        }
    }
    Ok(stored.to_string())
}

/// Returns a safe non-sensitive preview of an API key (e.g. "AIza••••9x2F") for Settings UI.
pub fn mask_secret(secret: &str) -> String {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 8 {
        return "••••••••".to_string();
    }
    let head: String = chars.iter().take(4).collect();
    let tail: String = chars.iter().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("{}••••{}", head, tail)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dpapi_roundtrip_and_mask() {
        let secret = "AIzaSyTestSecretKey_1234567890";
        let protected = protect_secret(secret).expect("DPAPI protect should succeed");
        #[cfg(target_os = "windows")]
        {
            assert!(protected.starts_with("dpapi:v1:"));
            assert_ne!(protected, secret);
        }
        let plain = unprotect_secret(&protected).expect("DPAPI unprotect should succeed");
        assert_eq!(plain, secret);
        assert_eq!(unprotect_secret("legacy-plain").unwrap(), "legacy-plain");
        assert_eq!(mask_secret(secret), "AIza••••7890");
    }
}
