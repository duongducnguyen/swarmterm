// src-tauri/src/sessions/opencode.rs
//! OpenCode session discovery. Deliberately NOT reading `opencode.db`
//! directly — the SQLite schema is internal, WAL-live while opencode runs,
//! and even the DB filename varies by release channel. `opencode session
//! list --format json` is the public interface: run with cwd = the composer
//! folder, it scopes to that project and already excludes child sessions.

use super::SessionEntry;
use serde_json::Value;
use std::time::Duration;

/// The CLI is a large single binary; a cold start can take seconds on a slow
/// disk. 4 s keeps the composer snappy while covering the common case — on
/// expiry the child is killed and OpenCode simply contributes no rows.
const LIST_TIMEOUT: Duration = Duration::from_secs(4);

pub(crate) fn parse_session_list(json: &str) -> Vec<SessionEntry> {
    let Ok(v) = serde_json::from_str::<Value>(json) else {
        return Vec::new();
    };
    let Some(rows) = v.as_array() else {
        return Vec::new();
    };
    rows.iter()
        .filter_map(|row| {
            let id = row.get("id").and_then(Value::as_str)?;
            if !id.starts_with("ses_") {
                return None;
            }
            let title = row.get("title").and_then(Value::as_str)?.trim();
            // Placeholder titles mean an empty/child session — not worth resuming.
            if title.is_empty()
                || title.starts_with("New session - ")
                || title.starts_with("Child session - ")
            {
                return None;
            }
            let directory = row.get("directory").and_then(Value::as_str)?;
            // `updated` is epoch ms today; tolerate a numeric string, and fall
            // back to 0 (sorts last) rather than dropping the row.
            let updated_at_ms = row
                .get("updated")
                .and_then(|u| {
                    u.as_u64()
                        .or_else(|| u.as_str().and_then(|s| s.parse::<u64>().ok()))
                })
                .unwrap_or(0);
            Some(SessionEntry {
                agent_id: "opencode".into(),
                session_id: id.to_owned(),
                title: title.chars().take(80).collect(),
                cwd: directory.to_owned(),
                updated_at_ms,
            })
        })
        .collect()
}

pub async fn scan(folder: &str) -> Vec<SessionEntry> {
    let Some(bin) = crate::agents::find_agent_binary("opencode") else {
        return Vec::new();
    };
    let mut cmd = tokio::process::Command::new(bin);
    cmd.args(["session", "list", "--format", "json"])
        .current_dir(folder)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW — same flag git.rs/shell.rs use so a GUI-launched
        // release binary doesn't flash a console per probe.
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let output = match tokio::time::timeout(LIST_TIMEOUT, cmd.output()).await {
        Ok(Ok(out)) if out.status.success() => out,
        // Timeout, spawn failure, or non-zero exit: fail open — no rows.
        _ => return Vec::new(),
    };
    parse_session_list(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rows_and_maps_directory_to_cwd() {
        let json = r#"[{"id":"ses_8fk2ab34cd56EfGh78Ij90Kl12","title":"Fix login bug","updated":1754450000000,"created":1754440000000,"projectId":"prj_1","directory":"/repo/sub"}]"#;
        let out = parse_session_list(json);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].agent_id, "opencode");
        assert_eq!(out[0].session_id, "ses_8fk2ab34cd56EfGh78Ij90Kl12");
        assert_eq!(out[0].title, "Fix login bug");
        assert_eq!(out[0].cwd, "/repo/sub");
        assert_eq!(out[0].updated_at_ms, 1754450000000);
    }

    #[test]
    fn drops_placeholder_titles_and_non_session_ids() {
        let json = r#"[
            {"id":"ses_aaaaaaaaaaaa","title":"New session - 2026-08-06T00:00:00.000Z","updated":2,"directory":"/r"},
            {"id":"ses_bbbbbbbbbbbb","title":"Child session - agent","updated":2,"directory":"/r"},
            {"id":"msg_notasession","title":"ok","updated":2,"directory":"/r"},
            {"id":"ses_cccccccccccc","title":"Real work","updated":2,"directory":"/r"}
        ]"#;
        let out = parse_session_list(json);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].title, "Real work");
    }

    #[test]
    fn tolerates_string_updated_and_missing_fields() {
        let json = r#"[
            {"id":"ses_dddddddddddd","title":"Numeric string","updated":"1754450000000","directory":"/r"},
            {"id":"ses_eeeeeeeeeeee","title":"No updated at all","directory":"/r"}
        ]"#;
        let out = parse_session_list(json);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].updated_at_ms, 1754450000000);
        assert_eq!(out[1].updated_at_ms, 0);
    }

    #[test]
    fn garbage_json_is_empty_not_error() {
        assert!(parse_session_list("not json").is_empty());
        assert!(parse_session_list("{\"not\":\"an array\"}").is_empty());
    }
}
