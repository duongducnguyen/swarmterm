use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// The MCP entry Swarmterm writes into `.mcp.json`. Uses `${VAR}` syntax that
/// Claude Code expands from the shell env — the two vars are set on every PTY
/// by `pty::spawn_terminal`.
pub fn swarmterm_entry() -> Value {
    json!({
        "type": "http",
        "url": "${SWARMTERM_MCP_URL}",
        "headers": { "Authorization": "Bearer ${SWARMTERM_SESSION}" }
    })
}

/// Produce the new `.mcp.json` contents:
/// * If `existing` is `None` or blank, return a file with only Swarmterm.
/// * If `existing` parses as JSON with a `mcpServers` object, deep-merge the
///   `swarmterm` key (preserving any other server entries and any user edits
///   to keys the user added under `swarmterm`).
/// * If `existing` is malformed JSON, return `Err` — the caller logs it and
///   leaves the file untouched.
pub fn merge_mcp_config(existing: Option<&str>) -> Result<String, String> {
    let mut root: Value = match existing.map(str::trim).filter(|s| !s.is_empty()) {
        None => json!({ "mcpServers": {} }),
        Some(s) => serde_json::from_str(s).map_err(|e| format!("parse: {e}"))?,
    };
    if !root.is_object() {
        return Err("root is not a JSON object".into());
    }
    let servers = root
        .as_object_mut()
        .unwrap()
        .entry("mcpServers".to_string())
        .or_insert_with(|| json!({}));
    if !servers.is_object() {
        return Err("mcpServers is not an object".into());
    }
    servers
        .as_object_mut()
        .unwrap()
        .insert("swarmterm".to_string(), swarmterm_entry());
    serde_json::to_string_pretty(&root).map_err(|e| e.to_string())
}

/// Merge-write the `swarmterm` MCP entry into `path` on disk (read →
/// `merge_mcp_config` → write tmp → rename). The tmp+rename means a crash
/// mid-write can never truncate the target — important for `~/.claude.json`,
/// which holds far more than MCP config. A missing file is created; a
/// malformed existing file returns `Err` and is left untouched.
pub fn write_mcp_config_to_file(path: &Path) -> Result<(), String> {
    let existing = match fs::read_to_string(path) {
        Ok(s) => Some(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("read: {e}")),
    };
    let merged = merge_mcp_config(existing.as_deref())?;
    // `.claude.json` → `.claude.json.tmp` (same for `.mcp.json`): with_extension
    // replaces the trailing `json` segment, preserving the leading dot-name.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, merged).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| {
        // Best-effort tmp cleanup on rename failure so we don't leave litter.
        let _ = fs::remove_file(&tmp);
        format!("rename: {e}")
    })?;
    Ok(())
}

/// Register Swarmterm's MCP server once in Claude Code's user-scope config
/// (`~/.claude.json`) so every terminal Swarmterm spawns — in any folder or
/// worktree — discovers it without a per-project `.mcp.json`. Idempotent: the
/// entry is placeholder-only, so re-running on an already-registered config
/// writes identical bytes. Log-only: a failure here must never block boot, and
/// leaves Swarmterm fully usable minus the agent-facing MCP tools.
pub fn register_user_scope(app: &AppHandle) {
    let home = match app.path().home_dir() {
        Ok(h) => h,
        Err(e) => {
            eprintln!("mcp: cannot resolve home dir for global MCP config: {e}");
            return;
        }
    };
    let cfg_dir = std::env::var("CLAUDE_CONFIG_DIR").ok();
    let path = resolve_global_config_path(&home, cfg_dir.as_deref());
    if let Err(e) = write_mcp_config_to_file(&path) {
        eprintln!(
            "mcp: failed to register global MCP config at {}: {e}",
            path.display()
        );
    }
}

/// Resolve Claude Code's user-scope config file (`.claude.json`). Honors
/// `CLAUDE_CONFIG_DIR` (Claude Code lets users relocate its config there);
/// a blank value is treated as unset so we never resolve to `/.claude.json`.
pub fn resolve_global_config_path(home: &Path, claude_config_dir: Option<&str>) -> PathBuf {
    match claude_config_dir.map(str::trim).filter(|s| !s.is_empty()) {
        Some(dir) => Path::new(dir).join(".claude.json"),
        None => home.join(".claude.json"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }

    #[test]
    fn creates_from_nothing() {
        let out = merge_mcp_config(None).unwrap();
        let v = parse(&out);
        assert_eq!(v["mcpServers"]["swarmterm"]["type"], "http");
        assert_eq!(v["mcpServers"]["swarmterm"]["url"], "${SWARMTERM_MCP_URL}");
    }

    #[test]
    fn creates_from_empty_string() {
        let out = merge_mcp_config(Some("   ")).unwrap();
        assert_eq!(parse(&out)["mcpServers"]["swarmterm"]["type"], "http");
    }

    #[test]
    fn preserves_other_servers() {
        let existing = r#"{"mcpServers": {"other": {"type": "stdio", "command": "x"}}}"#;
        let out = merge_mcp_config(Some(existing)).unwrap();
        let v = parse(&out);
        assert_eq!(v["mcpServers"]["other"]["command"], "x");
        assert_eq!(v["mcpServers"]["swarmterm"]["type"], "http");
    }

    #[test]
    fn replaces_existing_swarmterm_block() {
        // If the user (or an old Swarmterm build) already had a swarmterm entry
        // with stale headers, overwrite it so the current shape wins.
        let existing = r#"{"mcpServers": {"swarmterm": {"type": "stdio"}}}"#;
        let out = merge_mcp_config(Some(existing)).unwrap();
        assert_eq!(parse(&out)["mcpServers"]["swarmterm"]["type"], "http");
    }

    #[test]
    fn preserves_unrelated_top_level_keys() {
        let existing = r#"{"projects": {"foo": 1}, "mcpServers": {}}"#;
        let out = merge_mcp_config(Some(existing)).unwrap();
        let v = parse(&out);
        assert_eq!(v["projects"]["foo"], 1);
        assert_eq!(v["mcpServers"]["swarmterm"]["type"], "http");
    }

    #[test]
    fn errors_on_malformed_json() {
        assert!(merge_mcp_config(Some("{not json")).is_err());
    }

    #[test]
    fn errors_when_root_not_object() {
        assert!(merge_mcp_config(Some("[1,2,3]")).is_err());
    }

    #[test]
    fn errors_when_mcp_servers_not_object() {
        assert!(merge_mcp_config(Some(r#"{"mcpServers":"nope"}"#)).is_err());
    }

    #[test]
    fn global_path_defaults_to_home() {
        let p = resolve_global_config_path(Path::new("/home/duong"), None);
        assert_eq!(p, Path::new("/home/duong/.claude.json"));
    }

    #[test]
    fn global_path_honors_claude_config_dir() {
        let p = resolve_global_config_path(Path::new("/home/duong"), Some("/custom/cfg"));
        assert_eq!(p, Path::new("/custom/cfg/.claude.json"));
    }

    #[test]
    fn global_path_ignores_blank_config_dir() {
        // Blank/whitespace CLAUDE_CONFIG_DIR must fall back to home, not
        // resolve to "/.claude.json".
        let p = resolve_global_config_path(Path::new("/home/duong"), Some("   "));
        assert_eq!(p, Path::new("/home/duong/.claude.json"));
    }

    #[test]
    fn to_file_creates_when_absent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        write_mcp_config_to_file(&path).unwrap();
        let contents = std::fs::read_to_string(&path).unwrap();
        assert!(contents.contains("\"swarmterm\""));
        assert!(contents.contains("${SWARMTERM_MCP_URL}"));
    }

    #[test]
    fn to_file_merges_and_preserves_other_config() {
        // Simulate a realistic ~/.claude.json: a top-level key plus an
        // unrelated MCP server that must survive the merge.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        std::fs::write(
            &path,
            r#"{"numStartups":42,"mcpServers":{"1devtool":{"command":"x"}}}"#,
        )
        .unwrap();
        write_mcp_config_to_file(&path).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v["numStartups"], 42);
        assert_eq!(v["mcpServers"]["1devtool"]["command"], "x");
        assert_eq!(v["mcpServers"]["swarmterm"]["type"], "http");
    }

    #[test]
    fn to_file_leaves_malformed_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        std::fs::write(&path, "{not json").unwrap();
        assert!(write_mcp_config_to_file(&path).is_err());
        // Original bytes preserved — the tmp+rename never clobbered them.
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{not json");
    }
}
