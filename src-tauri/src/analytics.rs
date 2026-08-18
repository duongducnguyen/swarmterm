//! Anonymous usage telemetry via the GA4 Measurement Protocol.
//!
//! The measurement id and API secret are baked in at *compile* time from the
//! environment (`option_env!`), which the release scripts export from
//! `.env.release`. The repo never contains a key, and a dev build or a
//! community build from source compiles `init` into a no-op — official
//! release binaries are the only ones that report anything.
//!
//! What is sent (documented for users in docs/user-guide.md): one `app_open`
//! event at launch and a `heartbeat` every five minutes, each carrying an
//! anonymous random client id, a per-launch session id, the app version and
//! the OS name. Nothing else — no paths, no terminal content, no hostname.
//! GA's Realtime view only counts an event as an "active user" when it
//! carries both `session_id` and `engagement_time_msec`, so every event
//! includes them.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

const MEASUREMENT_ID: Option<&str> = option_env!("SWARMTERM_GA_MEASUREMENT_ID");
const API_SECRET: Option<&str> = option_env!("SWARMTERM_GA_API_SECRET");

/// GA's Realtime window is 30 minutes; a 5-minute pulse keeps a running app
/// counted with wide margin while staying far below any GA rate limit.
const HEARTBEAT: Duration = Duration::from_secs(300);

/// The one file this app persists besides user-facing config: an anonymous
/// random id, so GA can tell "one user opened the app five times" from "five
/// users". Deleting the file simply mints a new identity.
const CLIENT_ID_FILE: &str = "telemetry-id";

pub fn init(app: &tauri::AppHandle) {
    let (Some(measurement_id), Some(api_secret)) = (MEASUREMENT_ID, API_SECRET) else {
        return;
    };
    let url = collect_url(measurement_id, api_secret);
    let client_id = client_id_path(app)
        .and_then(|p| load_or_create_client_id(&p).ok())
        // A read-only disk still gets counted — as a fresh user each launch.
        .unwrap_or_else(new_client_id);
    let session_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".into());
    let app_version = app.package_info().version.to_string();

    tauri::async_runtime::spawn(async move {
        let Ok(client) = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
        else {
            return;
        };
        let mut event = "app_open";
        let mut engagement_ms: u64 = 100;
        loop {
            let payload = event_payload(
                event,
                &client_id,
                &session_id,
                engagement_ms,
                &app_version,
                std::env::consts::OS,
            );
            // Fire-and-forget: offline or blocked is a normal state, never
            // worth a log line the user would mistake for an app problem.
            let _ = client.post(&url).json(&payload).send().await;
            tokio::time::sleep(HEARTBEAT).await;
            event = "heartbeat";
            engagement_ms = HEARTBEAT.as_millis() as u64;
        }
    });
}

fn client_id_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(CLIENT_ID_FILE))
}

fn collect_url(measurement_id: &str, api_secret: &str) -> String {
    format!(
        "https://www.google-analytics.com/mp/collect?measurement_id={measurement_id}&api_secret={api_secret}"
    )
}

fn event_payload(
    event: &str,
    client_id: &str,
    session_id: &str,
    engagement_time_msec: u64,
    app_version: &str,
    os: &str,
) -> Value {
    json!({
        "client_id": client_id,
        "events": [{
            "name": event,
            "params": {
                "session_id": session_id,
                "engagement_time_msec": engagement_time_msec,
                "app_version": app_version,
                "os": os,
            }
        }]
    })
}

fn new_client_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Reads the persisted anonymous id, minting and writing one on first run or
/// when the file's content doesn't look like an id we wrote (corrupt or
/// hand-edited into something that could leak into GA as garbage).
fn load_or_create_client_id(path: &Path) -> std::io::Result<String> {
    if let Ok(existing) = std::fs::read_to_string(path) {
        let existing = existing.trim();
        if is_plausible_client_id(existing) {
            return Ok(existing.to_string());
        }
    }
    let id = new_client_id();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, &id)?;
    Ok(id)
}

fn is_plausible_client_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_url_carries_both_credentials() {
        let url = collect_url("G-TEST123", "secret-abc");
        assert_eq!(
            url,
            "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=secret-abc"
        );
    }

    #[test]
    fn payload_has_realtime_required_params() {
        // Realtime "active users" silently ignores events missing session_id
        // or engagement_time_msec — regressing these breaks the whole point.
        let p = event_payload("app_open", "cid-1", "1723972800", 100, "1.0.2", "macos");
        let params = &p["events"][0]["params"];
        assert_eq!(p["client_id"], "cid-1");
        assert_eq!(p["events"][0]["name"], "app_open");
        assert_eq!(params["session_id"], "1723972800");
        assert_eq!(params["engagement_time_msec"], 100);
        assert_eq!(params["app_version"], "1.0.2");
        assert_eq!(params["os"], "macos");
    }

    #[test]
    fn client_id_is_created_then_stable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("telemetry-id");
        let first = load_or_create_client_id(&path).unwrap();
        let second = load_or_create_client_id(&path).unwrap();
        assert_eq!(first, second);
        assert!(is_plausible_client_id(&first));
        // uuid v4 shape: 36 chars, hyphenated
        assert_eq!(first.len(), 36);
    }

    #[test]
    fn corrupt_client_id_file_is_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("telemetry-id");
        std::fs::write(&path, "not\na valid id at all \u{1F480}").unwrap();
        let id = load_or_create_client_id(&path).unwrap();
        assert!(is_plausible_client_id(&id));
        // and it persisted the replacement
        assert_eq!(std::fs::read_to_string(&path).unwrap(), id);
    }

    #[test]
    fn missing_parent_dir_is_created() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("telemetry-id");
        let id = load_or_create_client_id(&path).unwrap();
        assert!(is_plausible_client_id(&id));
    }
}
