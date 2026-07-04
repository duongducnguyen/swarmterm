use serde::Serialize;

/// Emitted on the `preview:open` Tauri event when a valid MCP call arrives.
/// Wire shape (camelCase) matches what the renderer's `onPreviewOpen` listener
/// already consumes — a rename here breaks the browser column.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewOpenEvent {
    pub terminal_id: String,
    pub url: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ToolError {
    InvalidArgs(String),
}

/// Accept only http:// and https:// URLs. Mirrors the old deeplink
/// `Reject::BadUrl` rule — same allow-list, same shape of failure.
pub fn validate_preview_url(raw: &str) -> Result<String, ToolError> {
    let parsed = url::Url::parse(raw)
        .map_err(|e| ToolError::InvalidArgs(format!("url parse failed: {e}")))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        other => Err(ToolError::InvalidArgs(format!(
            "url scheme {other} not allowed (must be http or https)"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_http() {
        assert_eq!(
            validate_preview_url("http://localhost:3000/x"),
            Ok("http://localhost:3000/x".into())
        );
    }

    #[test]
    fn accepts_https() {
        assert_eq!(
            validate_preview_url("https://example.com/"),
            Ok("https://example.com/".into())
        );
    }

    #[test]
    fn rejects_file_scheme() {
        assert!(matches!(
            validate_preview_url("file:///etc/passwd"),
            Err(ToolError::InvalidArgs(_))
        ));
    }

    #[test]
    fn rejects_javascript_scheme() {
        assert!(matches!(
            validate_preview_url("javascript:alert(1)"),
            Err(ToolError::InvalidArgs(_))
        ));
    }

    #[test]
    fn rejects_malformed() {
        assert!(matches!(
            validate_preview_url("not a url at all"),
            Err(ToolError::InvalidArgs(_))
        ));
    }

    #[test]
    fn preview_open_event_serializes_camelcase() {
        let ev = PreviewOpenEvent {
            terminal_id: "t1".into(),
            url: "https://a".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["terminalId"], "t1");
        assert_eq!(json["url"], "https://a");
    }
}
