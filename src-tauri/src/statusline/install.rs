//! Registering the status line in Claude Code's user-scope settings.
//!
//! Same policy as `mcp/config.rs`: read → merge → write `.tmp` → rename, so a
//! crash mid-write can never truncate `settings.json` (which holds far more
//! than our one key). Unlike the MCP registration, this file has a key the user
//! may already own, so a foreign `statusLine` is never overwritten — in either
//! direction: we don't clobber it on enable and we don't delete it on disable.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// Build the `statusLine.command` string for an executable path.
///
/// `windows` is a parameter rather than a `cfg!` so both branches are testable
/// on every platform. On Windows the path's backslashes become forward slashes:
/// Claude Code executes the command through Git Bash, which consumes unquoted
/// backslashes as escape characters, so `C:\Users\...` never resolves. Quoting
/// covers paths with spaces on both platforms.
pub fn format_command(exe: &str, windows: bool) -> String {
    let path = if windows {
        exe.replace('\\', "/")
    } else {
        exe.to_owned()
    };
    format!("\"{path}\" --statusline")
}

/// Does this `statusLine.command` belong to us? Both halves must match so a
/// third-party script that happens to live next to a `swarmterm` binary, or an
/// unrelated tool that also takes `--statusline`, is left alone.
pub fn is_ours(command: &str) -> bool {
    let c = command.trim().to_ascii_lowercase();
    c.ends_with("--statusline") && c.contains("swarmterm")
}

/// What `merge_settings` decided.
#[derive(Debug)]
pub enum SettingsWrite {
    /// Nothing to do — already current, or nothing of ours to remove.
    Unchanged,
    /// The user owns `statusLine`. Never touched, and never an app-level error.
    Foreign,
    /// New file contents.
    Write(String),
}

/// Compute the new `settings.json` contents. `command: Some(_)` installs,
/// `None` uninstalls.
pub fn merge_settings(
    existing: Option<&str>,
    command: Option<&str>,
) -> Result<SettingsWrite, String> {
    let mut root: Value = match existing.map(str::trim).filter(|s| !s.is_empty()) {
        None => json!({}),
        Some(s) => serde_json::from_str(s).map_err(|e| format!("parse: {e}"))?,
    };
    if !root.is_object() {
        return Err("root is not a JSON object".into());
    }

    let current = root
        .get("statusLine")
        .and_then(|s| s.get("command"))
        .and_then(|c| c.as_str())
        .map(str::to_owned);

    if let Some(cmd) = current.as_deref() {
        if !is_ours(cmd) {
            return Ok(SettingsWrite::Foreign);
        }
    }

    let obj = root.as_object_mut().unwrap();
    match command {
        Some(cmd) => {
            if current.as_deref() == Some(cmd) {
                // Re-serialising would reorder and reformat the user's whole
                // settings file for no change — the same churn `mcp/config.rs`
                // avoids on `~/.claude.json`.
                return Ok(SettingsWrite::Unchanged);
            }
            obj.insert(
                "statusLine".to_string(),
                json!({ "type": "command", "command": cmd }),
            );
        }
        None => {
            if current.is_none() {
                return Ok(SettingsWrite::Unchanged);
            }
            obj.remove("statusLine");
        }
    }

    serde_json::to_string_pretty(&root)
        .map(SettingsWrite::Write)
        .map_err(|e| e.to_string())
}

/// Resolve Claude Code's user-scope settings file. Honors `CLAUDE_CONFIG_DIR`
/// (which relocates the whole `~/.claude` directory); a blank value is treated
/// as unset so we never resolve to `/settings.json`. Note this is a DIFFERENT
/// file from the `~/.claude.json` that `mcp::config` writes.
pub fn resolve_settings_path(home: &Path, claude_config_dir: Option<&str>) -> PathBuf {
    match claude_config_dir.map(str::trim).filter(|s| !s.is_empty()) {
        Some(dir) => Path::new(dir).join("settings.json"),
        None => home.join(".claude").join("settings.json"),
    }
}

/// Read → merge → write tmp → rename. The rename is atomic, so a crash
/// mid-write can never leave the user with a truncated settings file.
pub fn write_settings_to_file(path: &Path, command: Option<&str>) -> Result<(), String> {
    let existing = match fs::read_to_string(path) {
        Ok(s) => Some(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("read: {e}")),
    };
    let merged = match merge_settings(existing.as_deref(), command)? {
        SettingsWrite::Unchanged => return Ok(()),
        SettingsWrite::Foreign => {
            return Err("settings.json already has a custom statusLine — left untouched".into())
        }
        SettingsWrite::Write(s) => s,
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, merged).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| {
        // Best-effort tmp cleanup on rename failure so we don't leave litter.
        let _ = fs::remove_file(&tmp);
        format!("rename: {e}")
    })
}

/// Install or remove the status line entry for the running app.
///
/// The path is re-derived from `current_exe()` on every call, so moving or
/// updating the app repairs a stale command instead of leaving Claude Code
/// running something that no longer exists.
pub fn apply(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("no home dir: {e}"))?;
    let cfg_dir = std::env::var("CLAUDE_CONFIG_DIR").ok();
    let path = resolve_settings_path(&home, cfg_dir.as_deref());

    let command = if enabled {
        let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
        Some(format_command(&exe.to_string_lossy(), cfg!(windows)))
    } else {
        None
    };
    write_settings_to_file(&path, command.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }

    const OURS: &str = "\"/Applications/Swarmterm.app/Contents/MacOS/swarmterm\" --statusline";

    #[test]
    fn quotes_the_path_and_appends_the_flag() {
        assert_eq!(
            format_command(
                "/Applications/Swarmterm.app/Contents/MacOS/swarmterm",
                false
            ),
            OURS
        );
    }

    #[test]
    fn rewrites_backslashes_on_windows() {
        // Claude Code runs the command through Git Bash, which consumes
        // unquoted backslashes as escapes, so a native Windows path never
        // resolves. Forward slashes work in both shells.
        assert_eq!(
            format_command(
                "C:\\Users\\me\\AppData\\Local\\Swarmterm\\swarmterm.exe",
                true
            ),
            "\"C:/Users/me/AppData/Local/Swarmterm/swarmterm.exe\" --statusline"
        );
    }

    #[test]
    fn leaves_backslashes_alone_off_windows() {
        // A backslash is a legal character in a POSIX filename; rewriting it
        // there would corrupt the path.
        assert_eq!(
            format_command("/tmp/we\\ird/swarmterm", false),
            "\"/tmp/we\\ird/swarmterm\" --statusline"
        );
    }

    #[test]
    fn recognises_our_own_command() {
        assert!(is_ours(OURS));
        assert!(is_ours("\"C:/x/swarmterm.exe\" --statusline"));
        assert!(is_ours("/usr/local/bin/swarmterm --statusline"));
    }

    #[test]
    fn does_not_claim_a_foreign_command() {
        assert!(!is_ours("~/.claude/statusline.sh"));
        assert!(!is_ours("starship prompt"));
        assert!(!is_ours("swarmterm"));
        assert!(!is_ours("some-other-tool --statusline"));
        assert!(!is_ours(""));
    }

    #[test]
    fn creates_settings_from_nothing() {
        let SettingsWrite::Write(out) = merge_settings(None, Some(OURS)).unwrap() else {
            panic!("expected a write");
        };
        let v = parse(&out);
        assert_eq!(v["statusLine"]["type"], "command");
        assert_eq!(v["statusLine"]["command"], OURS);
    }

    #[test]
    fn creates_settings_from_an_empty_file() {
        assert!(matches!(
            merge_settings(Some("   "), Some(OURS)).unwrap(),
            SettingsWrite::Write(_)
        ));
    }

    #[test]
    fn preserves_unrelated_settings() {
        let existing = r#"{"model":"opus[1m]","theme":"dark","effortLevel":"xhigh"}"#;
        let SettingsWrite::Write(out) = merge_settings(Some(existing), Some(OURS)).unwrap() else {
            panic!("expected a write");
        };
        let v = parse(&out);
        assert_eq!(v["model"], "opus[1m]");
        assert_eq!(v["theme"], "dark");
        assert_eq!(v["effortLevel"], "xhigh");
        assert_eq!(v["statusLine"]["command"], OURS);
    }

    #[test]
    fn skips_the_write_when_our_entry_is_already_current() {
        let existing = format!(
            r#"{{"statusLine":{{"type":"command","command":{}}}}}"#,
            serde_json::to_string(OURS).unwrap()
        );
        assert!(matches!(
            merge_settings(Some(&existing), Some(OURS)).unwrap(),
            SettingsWrite::Unchanged
        ));
    }

    #[test]
    fn rewrites_our_entry_when_the_binary_moved() {
        let existing =
            r#"{"statusLine":{"type":"command","command":"\"/old/path/swarmterm\" --statusline"}}"#;
        let SettingsWrite::Write(out) = merge_settings(Some(existing), Some(OURS)).unwrap() else {
            panic!("expected a write");
        };
        assert_eq!(parse(&out)["statusLine"]["command"], OURS);
    }

    #[test]
    fn refuses_to_clobber_a_foreign_status_line() {
        let existing = r#"{"statusLine":{"type":"command","command":"~/.claude/mine.sh"}}"#;
        assert!(matches!(
            merge_settings(Some(existing), Some(OURS)).unwrap(),
            SettingsWrite::Foreign
        ));
    }

    #[test]
    fn removes_only_our_own_entry_on_disable() {
        let existing = format!(
            r#"{{"theme":"dark","statusLine":{{"type":"command","command":{}}}}}"#,
            serde_json::to_string(OURS).unwrap()
        );
        let SettingsWrite::Write(out) = merge_settings(Some(&existing), None).unwrap() else {
            panic!("expected a write");
        };
        let v = parse(&out);
        assert!(v.get("statusLine").is_none());
        assert_eq!(v["theme"], "dark");
    }

    #[test]
    fn disable_leaves_a_foreign_entry_alone() {
        let existing = r#"{"statusLine":{"type":"command","command":"~/.claude/mine.sh"}}"#;
        assert!(matches!(
            merge_settings(Some(existing), None).unwrap(),
            SettingsWrite::Foreign
        ));
    }

    #[test]
    fn disable_is_a_no_op_when_there_is_nothing_to_remove() {
        assert!(matches!(
            merge_settings(None, None).unwrap(),
            SettingsWrite::Unchanged
        ));
        assert!(matches!(
            merge_settings(Some(r#"{"theme":"dark"}"#), None).unwrap(),
            SettingsWrite::Unchanged
        ));
    }

    #[test]
    fn errors_on_malformed_json() {
        assert!(merge_settings(Some("{ not json"), Some(OURS)).is_err());
    }

    #[test]
    fn errors_when_root_is_not_an_object() {
        assert!(merge_settings(Some("[1,2,3]"), Some(OURS)).is_err());
    }

    #[test]
    fn settings_path_defaults_under_dot_claude() {
        let p = resolve_settings_path(Path::new("/home/duong"), None);
        assert_eq!(p, Path::new("/home/duong/.claude/settings.json"));
    }

    #[test]
    fn settings_path_honors_claude_config_dir() {
        let p = resolve_settings_path(Path::new("/home/duong"), Some("/custom/cfg"));
        assert_eq!(p, Path::new("/custom/cfg/settings.json"));
    }

    #[test]
    fn settings_path_ignores_a_blank_config_dir() {
        let p = resolve_settings_path(Path::new("/home/duong"), Some("  "));
        assert_eq!(p, Path::new("/home/duong/.claude/settings.json"));
    }

    #[test]
    fn to_file_creates_parent_directories_and_writes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude").join("settings.json");
        write_settings_to_file(&path, Some(OURS)).unwrap();
        let v = parse(&fs::read_to_string(&path).unwrap());
        assert_eq!(v["statusLine"]["command"], OURS);
    }

    #[test]
    fn to_file_round_trips_enable_then_disable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{"theme":"dark"}"#).unwrap();
        write_settings_to_file(&path, Some(OURS)).unwrap();
        write_settings_to_file(&path, None).unwrap();
        let v = parse(&fs::read_to_string(&path).unwrap());
        assert!(v.get("statusLine").is_none());
        assert_eq!(v["theme"], "dark");
    }

    #[test]
    fn to_file_leaves_a_malformed_file_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{ not json").unwrap();
        assert!(write_settings_to_file(&path, Some(OURS)).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{ not json");
    }
}
