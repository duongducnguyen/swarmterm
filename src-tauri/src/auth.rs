use keyring::Entry;

const SERVICE: &str = "swarmterm";

// Windows Credential Manager caps a credential's secret blob at 2560 *bytes*.
// The keyring crate stores the secret as UTF-16, so that's ~1280 ASCII chars —
// and a Supabase session JSON (two JWTs + the user object) blows past it. To
// stay cross-platform (macOS Keychain / Linux libsecret have far larger limits
// but chunking is harmless there) we split the value into fixed-size chunks,
// each its own credential entry, and record the chunk count in a small header
// entry stored under the bare `account` key. 1000 chars keeps every chunk well
// under the 1280-char ceiling even if a few code points need surrogate pairs.
const CHUNK_SIZE: usize = 1000;

/// Account key for chunk `i` of `account`. Kept distinct from the header key so
/// the two never collide.
fn chunk_key(account: &str, i: usize) -> String {
    format!("{account}#chunk#{i}")
}

/// Store `value` split across chunk entries, with a header entry holding the
/// count. Any previous chunks are cleared first so a shrinking session never
/// leaves stale tail chunks behind.
#[tauri::command]
pub fn save_auth_session(account: String, value: String) -> Result<(), String> {
    clear_auth_session(account.clone())?;

    let chars: Vec<char> = value.chars().collect();
    let chunks: Vec<String> = chars.chunks(CHUNK_SIZE).map(|c| c.iter().collect()).collect();
    let count = chunks.len();

    for (i, chunk) in chunks.iter().enumerate() {
        Entry::new(SERVICE, &chunk_key(&account, i))
            .map_err(|e| e.to_string())?
            .set_password(chunk)
            .map_err(|e| e.to_string())?;
    }

    // Header last: if a chunk write fails above we never claim a valid count.
    Entry::new(SERVICE, &account)
        .map_err(|e| e.to_string())?
        .set_password(&count.to_string())
        .map_err(|e| e.to_string())
}

/// Reassemble the chunked value, or `None` if no header entry exists.
#[tauri::command]
pub fn load_auth_session(account: String) -> Result<Option<String>, String> {
    let header = match Entry::new(SERVICE, &account)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(val) => val,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    // Legacy/self-heal: an entry written by the pre-chunking code holds the raw
    // value directly (not a count). If the header doesn't parse as a number,
    // treat it as that legacy value and return it verbatim.
    let count: usize = match header.parse() {
        Ok(n) => n,
        Err(_) => return Ok(Some(header)),
    };

    let mut value = String::new();
    for i in 0..count {
        let chunk = Entry::new(SERVICE, &chunk_key(&account, i))
            .map_err(|e| e.to_string())?
            .get_password()
            .map_err(|e| e.to_string())?;
        value.push_str(&chunk);
    }
    Ok(Some(value))
}

/// Delete the header and every chunk it references. Missing entries are treated
/// as already-cleared.
#[tauri::command]
pub fn clear_auth_session(account: String) -> Result<(), String> {
    let header = match Entry::new(SERVICE, &account)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(val) => Some(val),
        Err(keyring::Error::NoEntry) => None,
        Err(e) => return Err(e.to_string()),
    };

    let Some(header) = header else { return Ok(()) };

    if let Ok(count) = header.parse::<usize>() {
        for i in 0..count {
            let entry = Entry::new(SERVICE, &chunk_key(&account, i)).map_err(|e| e.to_string())?;
            match entry.delete_password() {
                Ok(_) | Err(keyring::Error::NoEntry) => {}
                Err(e) => return Err(e.to_string()),
            }
        }
    }

    let entry = Entry::new(SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
