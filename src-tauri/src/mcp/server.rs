//! The MCP server surface. One struct = the whole tool set; tool groups are
//! added as additional `impl SwarmtermMcpServer` blocks in dedicated files
//! (e.g. `mcp/tools/browser.rs`). Each such block gets its own
//! `#[tool_router(router = tool_router_<group>)]` (rmcp's macro emits a
//! generated fn per `impl` block, so every group needs a distinct name to
//! avoid colliding on the default `tool_router`); `SwarmtermMcpServer::new`
//! below merges every group's router with `ToolRouter`'s `+` into the single
//! `tool_router` field `#[tool_handler]` reads from.
//!
//! Adding a tool later:
//! 1. Add `pub mod <group>;` in `mcp/tools/mod.rs`.
//! 2. Write an `impl SwarmtermMcpServer` block in `mcp/tools/<group>.rs`
//!    annotated `#[tool_router(router = tool_router_<group>, vis = "pub")]`
//!    (see `mcp/tools/browser.rs`) with `#[tool]` methods, importing
//!    `use rmcp::{tool, tool_router};` (the macros must be in scope
//!    unqualified — invoking them via a fully-qualified `rmcp::tool_router`
//!    path does not expand correctly with this rmcp version).
//! 3. Register that block's router in `SwarmtermMcpServer::new` below via
//!    `Self::tool_router_<group>()`, merged into the `tool_router` field with
//!    `+` if more than one group exists.
//!
//! rmcp 2.1 API notes (verified via context7 / docs.rs, since the plan was
//! written against a hypothetical 0.7 shape that does not match this pin):
//! - `#[tool_router]` on an `impl Self` block collects `#[tool]` methods into
//!   a `ToolRouter<Self>` returned by a generated fn (default name
//!   `tool_router`); `#[tool_handler(router = self.tool_router)]` on
//!   `impl ServerHandler for Self` wires whatever `ToolRouter` is stored in
//!   that field into `ServerHandler::call_tool`/`list_tools` automatically.
//! - A tool method can take `rmcp::handler::server::tool::Extension<http::request::Parts>`
//!   as a parameter to read the raw HTTP request (headers etc.) — the
//!   Streamable-HTTP transport stashes `Parts` in the request extensions
//!   before consuming the body, and `Extension<T>` (like arguments structs)
//!   is extracted via rmcp's `FromContextPart`, so it composes with a
//!   `Parameters<Args>` parameter on the same method.
//! - `rmcp::transport::streamable_http_server::tower::StreamableHttpService::new`
//!   takes `(service_factory: impl Fn() -> Result<S, io::Error>, session_manager: Arc<M>, config: StreamableHttpServerConfig)`.
//!   `StreamableHttpService` implements `tower_service::Service` and is
//!   `Clone`, so it mounts directly via `axum::Router::route_service`.
//! - `rmcp::ErrorData::{invalid_request, invalid_params, internal_error}(message, data: Option<Value>)`
//!   are the constructors used to map auth/validation failures to
//!   JSON-RPC-shaped protocol errors (the MCP client renders these as 4xx-ish
//!   failures, distinct from a tool-level `CallToolResult::error`).
//! - `ServerInfo` (`= InitializeResult`) and `Implementation` are both
//!   `#[non_exhaustive]`, so `get_info` below builds them via their `new`/
//!   `with_*` builder methods rather than a struct literal.

use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::model::{Implementation, ProtocolVersion, ServerCapabilities, ServerInfo};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::tower::{
    StreamableHttpServerConfig, StreamableHttpService,
};
use rmcp::{tool_handler, ServerHandler};
use tauri::{AppHandle, Manager};

use crate::mcp::auth::{self, AuthError, TerminalId};
use crate::pty::AppState;

#[derive(Clone)]
pub struct SwarmtermMcpServer {
    pub app: AppHandle,
    tool_router: ToolRouter<Self>,
}

impl SwarmtermMcpServer {
    fn new(app: AppHandle) -> Self {
        // Merge every tool group's router. Today there's just `browser`'s;
        // future groups add `+ crate::mcp::tools::<group>::tool_router_<group>()`.
        Self {
            app,
            tool_router: Self::tool_router_browser(),
        }
    }

    /// Resolve the caller's terminal from the bearer header. Returns an rmcp
    /// protocol error (surfaced to the caller roughly as a 401) on failure.
    pub(crate) fn caller(
        &self,
        parts: &axum::http::request::Parts,
    ) -> Result<TerminalId, rmcp::ErrorData> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let token = header.strip_prefix("Bearer ").unwrap_or(header);
        let state = self.app.state::<AppState>();
        let terminals = state.terminals.lock().unwrap();
        auth::resolve(token, |id| terminals.contains_key(id)).map_err(|e| match e {
            AuthError::Missing => rmcp::ErrorData::invalid_request("missing bearer token", None),
            AuthError::Unknown => rmcp::ErrorData::invalid_request("unknown session", None),
        })
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for SwarmtermMcpServer {
    fn get_info(&self) -> ServerInfo {
        // `ServerInfo` (aka `InitializeResult`) is `#[non_exhaustive]`, so a
        // field literal is rejected even naming every field — use its builder
        // methods instead.
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_protocol_version(ProtocolVersion::LATEST)
            .with_server_info(
                Implementation::new("swarmterm", env!("CARGO_PKG_VERSION"))
                    .with_title("Swarmterm"),
            )
            .with_instructions(
                "Swarmterm in-app tools: control the desktop terminal app from an agent \
                 running inside one of its panes.",
            )
    }

    // `#[rmcp::tool_handler]` wires `call_tool`/`list_tools` to `self.tool_router`
    // — the field name must be `tool_router` (rmcp's macro convention).
}

/// Build the axum router that hosts the MCP server on `POST /mcp`.
///
/// Stateless-session config: each HTTP call is independent (no `Mcp-Session-Id`
/// continuity required across requests). Swarmterm's tools are one-shot
/// (open a preview, etc.) and the bearer token — not an MCP session — is what
/// scopes a call to a terminal, so `LocalSessionManager`'s in-memory session
/// bookkeeping is used purely to satisfy the transport's type, not to persist
/// caller state across calls.
pub fn axum_router(app: AppHandle) -> axum::Router {
    let session_manager = Arc::new(LocalSessionManager::default());
    let service = StreamableHttpService::new(
        move || Ok(SwarmtermMcpServer::new(app.clone())),
        session_manager,
        StreamableHttpServerConfig::default(),
    );
    axum::Router::new().route_service("/mcp", service)
}
