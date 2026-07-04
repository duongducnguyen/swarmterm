use std::fs;
use std::path::PathBuf;

use crate::mcp::config::merge_mcp_config;

/// Write (or merge) `.mcp.json` in the given workspace directory so Claude
/// Code auto-discovers the Swarmterm MCP server. Silent on the happy path;
/// bubbles a string error for malformed existing files or IO failures so the
/// caller can decide whether to surface it.
#[tauri::command]
pub async fn write_mcp_config(cwd: String) -> Result<(), String> {
    let dir = PathBuf::from(&cwd);
    if !dir.is_dir() {
        return Err(format!("cwd is not a directory: {cwd}"));
    }
    let path = dir.join(".mcp.json");
    let existing = match fs::read_to_string(&path) {
        Ok(s) => Some(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("read: {e}")),
    };
    let merged = merge_mcp_config(existing.as_deref())?;
    fs::write(&path, merged).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
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
