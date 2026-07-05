use std::path::PathBuf;

use crate::mcp::config::write_mcp_config_to_dir;

/// Write (or merge) `.mcp.json` in the given workspace directory so Claude
/// Code auto-discovers the Swarmterm MCP server. Silent on the happy path;
/// bubbles a string error for malformed existing files or IO failures so the
/// caller can decide whether to surface it. The actual read-merge-write lives
/// in `mcp::config` so worktree.spawn can reuse it for fresh worktree checkouts.
#[tauri::command]
pub async fn write_mcp_config(cwd: String) -> Result<(), String> {
    write_mcp_config_to_dir(&PathBuf::from(&cwd))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn writes_new_file() {
        let dir = tempdir().unwrap();
        write_mcp_config(dir.path().to_string_lossy().into_owned())
            .await
            .unwrap();
        let contents = fs::read_to_string(dir.path().join(".mcp.json")).unwrap();
        assert!(contents.contains("\"swarmterm\""));
        assert!(contents.contains("${SWARMTERM_MCP_URL}"));
    }

    #[tokio::test]
    async fn merges_existing_file() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join(".mcp.json"),
            r#"{"mcpServers":{"other":{"type":"stdio","command":"x"}}}"#,
        )
        .unwrap();
        write_mcp_config(dir.path().to_string_lossy().into_owned())
            .await
            .unwrap();
        let contents = fs::read_to_string(dir.path().join(".mcp.json")).unwrap();
        assert!(contents.contains("\"swarmterm\""));
        assert!(contents.contains("\"other\""));
    }

    #[tokio::test]
    async fn errors_on_missing_cwd() {
        let err = write_mcp_config("/definitely/does/not/exist/anywhere".into())
            .await
            .unwrap_err();
        assert!(err.contains("not a directory"));
    }
}
