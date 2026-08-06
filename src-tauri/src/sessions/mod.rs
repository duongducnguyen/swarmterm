//! Discovery of resumable agent-CLI sessions for the composer's "Resume
//! sessions" list. Read-only over stores owned by other programs, and
//! fail-open everywhere: any parse/IO error degrades to "no suggestions",
//! never to an error the renderer must handle (roadmap doctrine: a display-
//! only surface may collapse `error` into `absent`).

pub mod claude;
pub mod codex;

use serde::Serialize;
use std::io::Read;
use std::path::Path;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEntry {
    pub agent_id: String,
    pub session_id: String,
    pub title: String,
    pub cwd: String,
    pub updated_at_ms: u64,
}

/// Newest-N per store before the frontend merges — bounds IPC payload size.
pub const PER_AGENT_CAP: usize = 20;

/// First 128 KB of a session file, lossily decoded. Session files can be
/// hundreds of MB; the title always lives in the first few lines.
const HEAD_CAP: usize = 128 * 1024;

pub(crate) fn read_head(path: &Path) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; HEAD_CAP];
    let mut filled = 0;
    // Loop: File::read may return short counts well before EOF.
    loop {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => {
                filled += n;
                if filled == buf.len() {
                    break;
                }
            }
            Err(_) => return None,
        }
    }
    buf.truncate(filled);
    Some(String::from_utf8_lossy(&buf).into_owned())
}

pub(crate) fn mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Normalize a raw prompt/title for one-line display. Rejects synthetic
/// entries (command wrappers, env-context blocks — they start with `<`).
pub(crate) fn clean_title(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.starts_with('<') {
        return None;
    }
    let collapsed: String = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(collapsed.chars().take(80).collect())
}
