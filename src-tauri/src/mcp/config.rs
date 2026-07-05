use serde_json::{json, Value};

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
}
