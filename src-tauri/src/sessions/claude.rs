// src-tauri/src/sessions/claude.rs
//! Claude Code session discovery. Store layout (documented but internal):
//! `<config>/projects/<encoded-cwd>/<uuid>.jsonl`, one JSONL file per
//! session. The format has no public schema, so every parse here is
//! best-effort per line — an unreadable line is skipped, an unreadable file
//! contributes nothing.

use super::{clean_title, mtime_ms, read_head, SessionEntry};
use serde_json::Value;
use std::path::Path;

/// Claude's project-dir encoding: every non-alphanumeric char → `-`
/// (docs example: `/Users/me/proj` → `-Users-me-proj`).
pub fn encode_project_dir(folder: &str) -> String {
    folder
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// First non-sidechain user message in the head of the file, cleaned for
/// display. `None` ⇒ the file has no real prompt (warmup, `claude -p`
/// one-shot) and is not worth suggesting.
fn extract_title(head: &str) -> Option<String> {
    for line in head.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if v.get("type").and_then(Value::as_str) != Some("user") {
            continue;
        }
        if v.get("isSidechain").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        let Some(content) = v.get("message").and_then(|m| m.get("content")) else {
            continue;
        };
        let raw = match content {
            Value::String(s) => Some(s.clone()),
            Value::Array(blocks) => blocks.iter().find_map(|b| {
                (b.get("type").and_then(Value::as_str) == Some("text"))
                    .then(|| b.get("text").and_then(Value::as_str))
                    .flatten()
                    .map(str::to_owned)
            }),
            _ => None,
        };
        if let Some(title) = raw.as_deref().and_then(clean_title) {
            return Some(title);
        }
    }
    None
}

pub fn scan(projects_root: &Path, folder: &str) -> Vec<SessionEntry> {
    let dir = projects_root.join(encode_project_dir(folder));
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !is_uuid(stem) {
            continue;
        }
        let Some(title) = read_head(&path).as_deref().and_then(extract_title) else {
            continue;
        };
        out.push(SessionEntry {
            agent_id: "claude-code".into(),
            session_id: stem.to_owned(),
            title,
            cwd: folder.to_owned(),
            updated_at_ms: mtime_ms(&path),
        });
    }
    // No cap: the scan already paid to read every file's head, entries are
    // ~200 bytes each, and the all-sessions dialog makes long lists usable.
    out.sort_by_key(|s| std::cmp::Reverse(s.updated_at_ms));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn encode_replaces_every_non_alphanumeric_with_dash() {
        assert_eq!(
            encode_project_dir("/Users/me/Projects/swarmterm"),
            "-Users-me-Projects-swarmterm"
        );
        assert_eq!(
            encode_project_dir("C:\\Users\\me\\proj"),
            "C--Users-me-proj"
        );
        assert_eq!(encode_project_dir("/a b/c.d_e"), "-a-b-c-d-e");
    }

    #[test]
    fn scan_lists_sessions_with_first_user_message_as_title() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join(encode_project_dir("/repo"));
        fs::create_dir_all(&proj).unwrap();
        fs::write(
            proj.join("fe845bc6-6932-4459-8fb6-cdd0e7c6cc84.jsonl"),
            concat!(
                "{\"type\":\"last-prompt\",\"sessionId\":\"fe845bc6\"}\n",
                "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"Fix the   login bug\"}}\n",
            ),
        )
        .unwrap();
        let out = scan(tmp.path(), "/repo");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].agent_id, "claude-code");
        assert_eq!(out[0].session_id, "fe845bc6-6932-4459-8fb6-cdd0e7c6cc84");
        assert_eq!(out[0].title, "Fix the login bug");
        assert_eq!(out[0].cwd, "/repo");
        assert!(out[0].updated_at_ms > 0);
    }

    #[test]
    fn scan_reads_block_array_content() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join(encode_project_dir("/repo"));
        fs::create_dir_all(&proj).unwrap();
        fs::write(
            proj.join("11111111-2222-4333-8444-555555555555.jsonl"),
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"Refactor pty module\"}]}}\n",
        )
        .unwrap();
        let out = scan(tmp.path(), "/repo");
        assert_eq!(out[0].title, "Refactor pty module");
    }

    #[test]
    fn scan_skips_noise() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join(encode_project_dir("/repo"));
        fs::create_dir_all(&proj).unwrap();
        // No user message at all (warmup / one-shot) → skipped.
        fs::write(
            proj.join("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl"),
            "{\"type\":\"summary\",\"summary\":\"x\"}\n",
        )
        .unwrap();
        // Sidechain user entry and command-wrapper text → skipped as titles;
        // real prompt further down is used instead.
        fs::write(
            proj.join("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff.jsonl"),
            concat!(
                "{\"type\":\"user\",\"isSidechain\":true,\"message\":{\"role\":\"user\",\"content\":\"sidechain noise\"}}\n",
                "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"<command-name>/clear</command-name>\"}}\n",
                "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"real prompt\"}}\n",
            ),
        )
        .unwrap();
        // Non-UUID filename → not a session file.
        fs::write(proj.join("notes.jsonl"), "{}\n").unwrap();
        // Unparseable garbage → skipped without panicking.
        fs::write(
            proj.join("cccccccc-dddd-4eee-8fff-000000000000.jsonl"),
            "not json at all\n",
        )
        .unwrap();
        let out = scan(tmp.path(), "/repo");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].title, "real prompt");
    }

    #[test]
    fn scan_missing_dir_is_empty_not_error() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(scan(tmp.path(), "/never/used").is_empty());
    }
}
