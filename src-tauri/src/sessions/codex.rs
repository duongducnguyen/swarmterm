// src-tauri/src/sessions/codex.rs
//! Codex CLI rollout discovery: `<CODEX_HOME>/sessions/YYYY/MM/DD/
//! rollout-<ts>-<uuid>.jsonl`, first line `session_meta` (has `cwd` — the
//! filter key). v1 skips zstd-compressed cold rollouts (`.jsonl.zst`) and
//! `codex exec` runs (the CLI's own picker hides those too).

use super::{clean_title, mtime_ms, read_head, SessionEntry, PER_AGENT_CAP};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Trailing separators stripped; backslashes unified; Windows compares
/// case-insensitively (drive letters, user-typed paths).
fn same_path(a: &str, b: &str) -> bool {
    let norm = |s: &str| {
        let s = s.replace('\\', "/");
        let s = s.trim_end_matches('/').to_owned();
        if cfg!(windows) {
            s.to_lowercase()
        } else {
            s
        }
    };
    norm(a) == norm(b)
}

fn user_text(v: &Value) -> Option<String> {
    let payload = v.get("payload")?;
    match payload.get("type").and_then(Value::as_str) {
        Some("user_message") => payload
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_owned),
        Some("message") if payload.get("role").and_then(Value::as_str) == Some("user") => {
            payload.get("content")?.as_array()?.iter().find_map(|b| {
                (b.get("type").and_then(Value::as_str) == Some("input_text"))
                    .then(|| b.get("text").and_then(Value::as_str))
                    .flatten()
                    .map(str::to_owned)
            })
        }
        _ => None,
    }
}

/// All `rollout-*.jsonl` under the 3-level YYYY/MM/DD tree. Bounded walk —
/// no recursion past day dirs, so a stray deep tree can't stall the scan.
fn rollout_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let years = std::fs::read_dir(root).map(|r| r.flatten().collect::<Vec<_>>());
    for year in years.unwrap_or_default() {
        let months = std::fs::read_dir(year.path()).map(|r| r.flatten().collect::<Vec<_>>());
        for month in months.unwrap_or_default() {
            let days = std::fs::read_dir(month.path()).map(|r| r.flatten().collect::<Vec<_>>());
            for day in days.unwrap_or_default() {
                let leaves = std::fs::read_dir(day.path()).map(|r| r.flatten().collect::<Vec<_>>());
                for f in leaves.unwrap_or_default() {
                    let p = f.path();
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.starts_with("rollout-") && name.ends_with(".jsonl") {
                        files.push(p);
                    }
                }
            }
        }
    }
    files
}

pub fn scan(sessions_root: &Path, folder: &str) -> Vec<SessionEntry> {
    let mut out = Vec::new();
    for path in rollout_files(sessions_root) {
        let Some(head) = read_head(&path) else {
            continue;
        };
        let mut lines = head.lines();
        let Some(meta) = lines.next().and_then(|l| serde_json::from_str::<Value>(l).ok())
        else {
            continue;
        };
        if meta.get("type").and_then(Value::as_str) != Some("session_meta") {
            continue;
        }
        let Some(payload) = meta.get("payload") else {
            continue;
        };
        let Some(id) = payload.get("id").and_then(Value::as_str) else {
            continue;
        };
        let Some(cwd) = payload.get("cwd").and_then(Value::as_str) else {
            continue;
        };
        if !same_path(cwd, folder) {
            continue;
        }
        if payload.get("source").and_then(Value::as_str) == Some("exec") {
            continue;
        }
        let title = lines
            .filter_map(|l| serde_json::from_str::<Value>(l).ok())
            .filter_map(|v| user_text(&v))
            .find_map(|raw| clean_title(&raw))
            .unwrap_or_else(|| {
                format!("Codex session {}", id.chars().take(8).collect::<String>())
            });
        out.push(SessionEntry {
            agent_id: "codex".into(),
            session_id: id.to_owned(),
            title,
            cwd: cwd.to_owned(),
            updated_at_ms: mtime_ms(&path),
        });
    }
    out.sort_by(|a, b| b.updated_at_ms.cmp(&a.updated_at_ms));
    out.truncate(PER_AGENT_CAP);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const META: &str = "{\"timestamp\":\"2026-08-05T10:00:00.000Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"018f3b2a-7c1d-4e0a-9b2f-1a2b3c4d5e6f\",\"cwd\":\"/repo\",\"source\":\"cli\"}}";

    fn write_rollout(root: &Path, name: &str, body: &str) {
        let day = root.join("2026").join("08").join("05");
        fs::create_dir_all(&day).unwrap();
        fs::write(day.join(name), body).unwrap();
    }

    #[test]
    fn scan_matches_cwd_and_titles_from_user_message() {
        let tmp = tempfile::tempdir().unwrap();
        write_rollout(
            tmp.path(),
            "rollout-2026-08-05T10-00-00-018f3b2a.jsonl",
            &format!(
                "{META}\n{}\n{}\n",
                // env-context wrapper must NOT become the title
                "{\"timestamp\":\"t\",\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"<environment_context>...</environment_context>\"}}",
                "{\"timestamp\":\"t\",\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"Fix the tests\"}}"
            ),
        );
        let out = scan(tmp.path(), "/repo");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].agent_id, "codex");
        assert_eq!(out[0].session_id, "018f3b2a-7c1d-4e0a-9b2f-1a2b3c4d5e6f");
        assert_eq!(out[0].title, "Fix the tests");
        assert_eq!(out[0].cwd, "/repo");
    }

    #[test]
    fn scan_reads_response_item_user_content_too() {
        let tmp = tempfile::tempdir().unwrap();
        write_rollout(
            tmp.path(),
            "rollout-2026-08-05T11-00-00-11111111.jsonl",
            &format!(
                "{}\n{}\n",
                META.replace("018f3b2a-7c1d-4e0a-9b2f-1a2b3c4d5e6f", "11111111-2222-4333-8444-555555555555"),
                "{\"timestamp\":\"t\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"Refactor reader\"}]}}"
            ),
        );
        let out = scan(tmp.path(), "/repo");
        assert_eq!(out[0].title, "Refactor reader");
    }

    #[test]
    fn scan_falls_back_to_short_id_title() {
        let tmp = tempfile::tempdir().unwrap();
        write_rollout(tmp.path(), "rollout-x-22222222.jsonl", &format!("{}\n", META.replace("018f3b2a-7c1d-4e0a-9b2f-1a2b3c4d5e6f", "22222222-3333-4444-8555-666666666666")));
        let out = scan(tmp.path(), "/repo");
        assert_eq!(out[0].title, "Codex session 22222222");
    }

    #[test]
    fn scan_skips_other_cwd_exec_source_zst_and_garbage() {
        let tmp = tempfile::tempdir().unwrap();
        write_rollout(tmp.path(), "rollout-a-33333333.jsonl", &format!("{}\n", META.replace("/repo", "/elsewhere")));
        write_rollout(tmp.path(), "rollout-b-44444444.jsonl", &format!("{}\n", META.replace("cli", "exec")));
        write_rollout(tmp.path(), "rollout-c-55555555.jsonl.zst", "binary-not-jsonl");
        write_rollout(tmp.path(), "rollout-d-66666666.jsonl", "not json\n");
        assert!(scan(tmp.path(), "/repo").is_empty());
    }

    #[test]
    fn cwd_match_normalizes_trailing_separator() {
        let tmp = tempfile::tempdir().unwrap();
        write_rollout(tmp.path(), "rollout-e-77777777.jsonl", &format!("{}\n", META));
        assert_eq!(scan(tmp.path(), "/repo/").len(), 1);
    }
}
