//! AI-agent CLI catalog + probing (`claude`, `codex`, `opencode`). Unlike
//! `shell.rs`, the result is intentionally NOT cached: the renderer re-asks
//! whenever it shows agent options (Welcome opens, pane agent dropdown opens),
//! so a CLI installed while the app is running lights up without a restart. A
//! probe is just a directory scan — a few ms at worst.

use serde::Serialize;
use std::path::PathBuf;

/// One entry per known agent CLI. `id` matches the frontend template id in
/// `src/lib/templates.ts`; `available == false` ⇒ the renderer disables the
/// option.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEntry {
    pub id: String,
    pub available: bool,
    pub detected_path: Option<String>,
}

/// (template id, executable base name) for each agent CLI we probe. Keep in
/// template order — `src/lib/templates.ts` is the source of truth for ids.
const AGENTS: &[(&str, &str)] = &[
    ("claude-code", "claude"),
    ("codex", "codex"),
    ("opencode", "opencode"),
];

/// Probe every known agent CLI. Fresh scan on every call (no cache) — see
/// module docs.
pub fn list_agents() -> Vec<AgentEntry> {
    let dirs = search_dirs();
    let pathext = std::env::var("PATHEXT").unwrap_or_default();
    AGENTS
        .iter()
        .map(|(id, exe)| {
            let cands = candidates(exe, &pathext, cfg!(windows));
            let found = find_in_dirs(&dirs, &cands);
            AgentEntry {
                id: (*id).into(),
                available: found.is_some(),
                detected_path: found.map(|p| p.to_string_lossy().into_owned()),
            }
        })
        .collect()
}

/// Directories to scan: every PATH segment, plus (on Unix) well-known bin dirs
/// that a Finder-launched GUI app does not inherit from the login shell —
/// that's where npm/homebrew put `claude`/`codex`.
fn search_dirs() -> Vec<PathBuf> {
    let path_var = std::env::var("PATH").unwrap_or_default();
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&path_var).collect();
    dirs.extend(extra_bin_dirs());
    dirs
}

#[cfg(windows)]
fn extra_bin_dirs() -> Vec<PathBuf> {
    // npm shims live in dirs already on PATH, but the native Claude installer
    // drops claude.exe into %USERPROFILE%\.local\bin and appends it to the
    // *registry* PATH — a running app's environment snapshot won't include
    // that until restart. Probing the dir directly keeps mid-session installs
    // visible without one.
    match std::env::var("USERPROFILE") {
        Ok(home) => vec![PathBuf::from(home).join(".local").join("bin")],
        Err(_) => vec![],
    }
}

#[cfg(not(windows))]
fn extra_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        let home = PathBuf::from(home);
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".npm-global").join("bin"));
    }
    dirs
}

/// Filename candidates for `name`. Windows resolves commands through PATHEXT
/// (npm ships `claude.cmd`, the native installer `claude.exe`), so one
/// candidate per extension (lowercased), plus the bare name last. Unix: the
/// bare name only. `windows` is a parameter rather than `cfg!` so both
/// branches are unit-testable on any host.
fn candidates(name: &str, pathext: &str, windows: bool) -> Vec<String> {
    if !windows {
        return vec![name.to_string()];
    }
    let mut out: Vec<String> = pathext
        .split(';')
        .filter(|e| !e.is_empty())
        .map(|ext| format!("{name}{}", ext.to_lowercase()))
        .collect();
    if out.is_empty() {
        // Defensive default when PATHEXT is unset — the common shim/installer set.
        out = vec![
            format!("{name}.exe"),
            format!("{name}.cmd"),
            format!("{name}.bat"),
        ];
    }
    out.push(name.to_string());
    out
}

/// First `dir/candidate` that exists as a file, scanning dirs in order.
fn find_in_dirs(dirs: &[PathBuf], candidates: &[String]) -> Option<PathBuf> {
    for dir in dirs {
        for cand in candidates {
            let p = dir.join(cand);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tempdir() -> tempfile::TempDir {
        tempfile::tempdir().expect("create tempdir")
    }

    #[test]
    fn candidates_windows_expands_pathext_lowercased() {
        assert_eq!(
            candidates("claude", ".COM;.EXE;.CMD", true),
            vec!["claude.com", "claude.exe", "claude.cmd", "claude"]
        );
    }

    #[test]
    fn candidates_windows_defaults_when_pathext_empty() {
        let c = candidates("claude", "", true);
        assert!(c.contains(&"claude.exe".to_string()));
        assert!(c.contains(&"claude.cmd".to_string()));
        assert!(c.contains(&"claude".to_string()));
    }

    #[test]
    fn candidates_unix_is_bare_name_only() {
        assert_eq!(candidates("claude", ".COM;.EXE", false), vec!["claude"]);
    }

    #[test]
    fn find_in_dirs_finds_first_existing_candidate() {
        let dir = tempdir();
        fs::write(dir.path().join("claude.cmd"), b"").unwrap();
        let dirs = vec![PathBuf::from("/nonexistent"), dir.path().to_path_buf()];
        let cands = vec!["claude.exe".to_string(), "claude.cmd".to_string()];
        assert_eq!(
            find_in_dirs(&dirs, &cands),
            Some(dir.path().join("claude.cmd"))
        );
    }

    #[test]
    fn find_in_dirs_none_when_missing() {
        let dir = tempdir();
        let dirs = vec![dir.path().to_path_buf()];
        assert_eq!(find_in_dirs(&dirs, &["claude.exe".to_string()]), None);
    }

    #[test]
    fn list_agents_covers_all_ai_agents_in_template_order() {
        let ids: Vec<String> = list_agents().into_iter().map(|a| a.id).collect();
        // Availability depends on the host machine; only the catalog is asserted.
        assert_eq!(
            ids,
            vec![
                "claude-code",
                "codex",
                "opencode",
            ]
        );
    }
}
