use keyring::Entry;

const SERVICE: &str = "swarmterm";

/// Store session JSON in OS credential store (Windows Credential Manager /
/// macOS Keychain / Linux libsecret). Key = supabase storage key.
#[tauri::command]
pub fn save_auth_session(account: String, value: String) -> Result<(), String> {
    Entry::new(SERVICE, &account)
        .map_err(|e| e.to_string())?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_auth_session(account: String) -> Result<Option<String>, String> {
    match Entry::new(SERVICE, &account)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(val) => Ok(Some(val)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_auth_session(account: String) -> Result<(), String> {
    match Entry::new(SERVICE, &account)
        .map_err(|e| e.to_string())?
        .delete_password()
    {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
