//! MCP server: an in-process HTTP endpoint that in-terminal AI agents call to
//! drive Swarmterm (open a browser preview today; more tools later). See
//! docs/design-docs/specs/2026-07-04-swarmterm-mcp-server-design.md.

pub mod auth;
pub mod config;
pub mod server;
pub mod tools;

use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;

use crate::pty::AppState;

/// Bind a random loopback port, spawn the server, and return the resulting URL.
/// The URL is also stored in `AppState.mcp_url` so `spawn_terminal` can inject
/// it into shell env.
pub async fn start(app: AppHandle) -> Result<Arc<str>, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("mcp: bind failed: {e}"))?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    let url: Arc<str> = Arc::from(format!("http://{addr}/mcp"));

    // Store before spawning so any race with early PTY creation still sees it.
    let state = app.state::<AppState>();
    state
        .mcp_url
        .set(url.clone())
        .map_err(|_| "mcp: mcp_url already set (start called twice?)".to_string())?;

    let router = server::axum_router(app.clone());
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("mcp: server exited: {e}");
        }
    });

    Ok(url)
}
