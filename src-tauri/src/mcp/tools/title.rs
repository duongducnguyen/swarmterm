use serde::{Deserialize, Serialize};
// `tool` / `tool_router` MUST be imported bare — a fully-qualified path
// (`#[rmcp::tool_router]`) silently produces no router. See mcp/server.rs.
use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::{schemars, tool, tool_router};
use tauri::Emitter;

use crate::mcp::server::SwarmtermMcpServer;
// Reuse the browser tool group's error type — same InvalidArgs shape, no reason
// to duplicate it per tool group.
use crate::mcp::tools::browser::ToolError;

/// Emitted on the `terminal:title` Tauri event when an agent sets its pane
/// title. Wire shape (camelCase) MUST stay in lockstep with the renderer's
/// `onTerminalTitle` listener — a rename here breaks the header title.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleSetEvent {
    pub terminal_id: String,
    pub title: String,
}

/// Normalize an agent-supplied title: collapse all whitespace (agents often
/// include newlines) to single spaces + trim, reject empty, and cap at 120
/// chars *by codepoint* (never split a multibyte char) so a runaway agent can't
/// write a paragraph into the 28px header.
pub fn sanitize_title(raw: &str) -> Result<String, ToolError> {
    let collapsed = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return Err(ToolError::InvalidArgs("title is empty after trimming".into()));
    }
    Ok(collapsed.chars().take(120).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_collapses_whitespace() {
        assert_eq!(sanitize_title("  Fix   login\nbug  ").unwrap(), "Fix login bug");
    }

    #[test]
    fn rejects_empty_after_trim() {
        assert!(matches!(sanitize_title("   \n  "), Err(ToolError::InvalidArgs(_))));
    }

    #[test]
    fn caps_at_120_codepoints() {
        let long = "x".repeat(200);
        assert_eq!(sanitize_title(&long).unwrap().chars().count(), 120);
    }

    #[test]
    fn title_set_event_serializes_camelcase() {
        let ev = TitleSetEvent { terminal_id: "t1".into(), title: "Hi".into() };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["terminalId"], "t1");
        assert_eq!(json["title"], "Hi");
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetTitleArgs {
    /// Short human-readable summary of what this terminal is working on,
    /// e.g. "Fix login bug". Max 120 chars; longer is truncated.
    pub title: String,
}

/// Structured result for `terminal.set_title` — `Json<T>` needs
/// `Serialize + JsonSchema`, so a bare `serde_json::Value` won't do.
#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct SetTitleResult {
    pub ok: bool,
    #[serde(rename = "terminalId")]
    pub terminal_id: String,
}

// This impl block gets its own router name (`tool_router_title`) — rmcp's macro
// emits one generated fn per impl block, so every tool group needs a distinct
// name to avoid colliding on the default `tool_router`. server.rs merges it in.
#[tool_router(router = tool_router_title, vis = "pub")]
impl SwarmtermMcpServer {
    #[tool(
        name = "terminal.set_title",
        description = "Set the calling terminal's header title. Call this right after \
                       you receive your first task, passing a short (<=120 char) summary \
                       of what you are doing, e.g. \"Fix login bug\"."
    )]
    pub async fn set_title(
        &self,
        rmcp::handler::server::tool::Extension(parts): rmcp::handler::server::tool::Extension<
            axum::http::request::Parts,
        >,
        Parameters(args): Parameters<SetTitleArgs>,
    ) -> Result<Json<SetTitleResult>, rmcp::ErrorData> {
        let terminal = self.caller(&parts)?;
        let title = sanitize_title(&args.title).map_err(|e| match e {
            ToolError::InvalidArgs(m) => rmcp::ErrorData::invalid_params(m, None),
        })?;
        self.app
            .emit(
                "terminal:title",
                TitleSetEvent { terminal_id: terminal.0.clone(), title },
            )
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
        Ok(Json(SetTitleResult { ok: true, terminal_id: terminal.0 }))
    }
}
