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

// --- tool method on the shared server struct ---
//
// Kept in this file (not in server.rs) so future tool groups follow the same
// shape: one file per group carrying both its helpers and its rmcp `#[tool]`
// methods. This impl block gets its own `#[tool_router]` (named
// `tool_router_browser` — rmcp's default `tool_router` name would collide if
// every tool-group file used it) whose output `server.rs` merges into the
// server's single `tool_router` field via `ToolRouter::+`.

use rmcp::handler::server::wrapper::{Json, Parameters};
// NOTE: `tool` / `tool_router` MUST be imported bare — fully-qualified paths
// (e.g. `#[rmcp::tool_router]`) silently produce no router. See the module
// doc of `mcp/server.rs` for the full rationale.
use rmcp::{schemars, tool, tool_router};
use serde::Deserialize;
use tauri::Emitter;

use crate::mcp::server::SwarmtermMcpServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct OpenPreviewArgs {
    /// Absolute http:// or https:// URL of the page to preview.
    pub url: String,
}

/// Tool result payload for `browser.open_preview`. `Json<T>` (rmcp's
/// structured-content wrapper) requires `Serialize + JsonSchema`, hence the
/// dedicated type rather than a bare `serde_json::Value` (which implements
/// neither trait rmcp needs to place it in `CallToolResult::structured`).
#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct OpenPreviewResult {
    pub ok: bool,
    #[serde(rename = "terminalId")]
    pub terminal_id: String,
}

#[tool_router(router = tool_router_browser, vis = "pub")]
impl SwarmtermMcpServer {
    #[tool(
        name = "browser.open_preview",
        description = "Show a URL in the user's Swarmterm web-preview column, beside the \
                       calling terminal. Call this proactively whenever you start a dev \
                       server or produce any viewable http(s) URL (e.g. Local: \
                       http://localhost:3000) instead of only printing it — a connected \
                       Swarmterm means the user already has a live preview pane ready. \
                       Accepts one http:// or https:// URL."
    )]
    pub async fn open_preview(
        &self,
        rmcp::handler::server::tool::Extension(parts): rmcp::handler::server::tool::Extension<
            axum::http::request::Parts,
        >,
        Parameters(args): Parameters<OpenPreviewArgs>,
    ) -> Result<Json<OpenPreviewResult>, rmcp::ErrorData> {
        let terminal = self.caller(&parts)?;
        let url = validate_preview_url(&args.url).map_err(|e| match e {
            ToolError::InvalidArgs(m) => rmcp::ErrorData::invalid_params(m, None),
        })?;
        self.app
            .emit(
                "preview:open",
                PreviewOpenEvent {
                    terminal_id: terminal.0.clone(),
                    url,
                },
            )
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
        Ok(Json(OpenPreviewResult {
            ok: true,
            terminal_id: terminal.0,
        }))
    }
}
