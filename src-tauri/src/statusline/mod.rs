//! The `swarmterm --statusline` command: Claude Code runs it and renders the
//! single line it prints below the input box.

pub mod install;
pub mod probe;
pub mod render;

use std::io::Read;
use std::time::Duration;

pub use render::McpState;

/// How long the whole probe gets. Claude Code re-runs this command on every
/// render, so a slow answer is worse than no answer.
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);

/// Decide the `mcp` segment. `run` is injected so the mapping is testable
/// without a listening socket.
pub fn mcp_state(
    url: Option<&str>,
    token: Option<&str>,
    run: impl Fn(&str, &str) -> Option<bool>,
) -> McpState {
    let (Some(url), Some(token)) = (url, token) else {
        return McpState::Absent;
    };
    let (url, token) = (url.trim(), token.trim());
    if url.is_empty() || token.is_empty() {
        return McpState::Absent;
    }
    match run(url, token) {
        Some(true) => McpState::Connected,
        Some(false) => McpState::NoClient,
        None => McpState::Unreachable,
    }
}

/// Render the line for a raw stdin payload. Unparseable input yields the
/// no-context line rather than an error.
pub fn line_for(stdin: &str, mcp: McpState, color: bool) -> String {
    let input: render::StatusInput = serde_json::from_str(stdin).unwrap_or_default();
    let ctx = input.context_window.as_ref().and_then(render::ctx_info);
    render::render(mcp, ctx, color)
}

/// The `--statusline` entry point. Reached from `main.rs` BEFORE the Tauri
/// builder runs, so no window, tray, single-instance IPC, or (on macOS) AppKit
/// is ever touched — this process is a plain CLI that prints one line and exits.
pub fn run_cli() {
    let mut stdin = String::new();
    // A read error is treated like empty input: still print the ctx placeholder.
    let _ = std::io::stdin().read_to_string(&mut stdin);

    let url = std::env::var("SWARMTERM_MCP_URL").ok();
    let token = std::env::var("SWARMTERM_SESSION").ok();
    let mcp = mcp_state(url.as_deref(), token.as_deref(), |u, t| {
        probe::probe(u, t, PROBE_TIMEOUT)
    });

    println!("{}", line_for(&stdin, mcp, true));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_env_means_no_mcp_segment() {
        assert_eq!(mcp_state(None, None, |_, _| Some(true)), McpState::Absent);
        assert_eq!(
            mcp_state(Some("http://x"), None, |_, _| Some(true)),
            McpState::Absent
        );
        assert_eq!(
            mcp_state(None, Some("tok"), |_, _| Some(true)),
            McpState::Absent
        );
    }

    #[test]
    fn blank_env_counts_as_absent() {
        assert_eq!(
            mcp_state(Some(""), Some("tok"), |_, _| Some(true)),
            McpState::Absent
        );
        assert_eq!(
            mcp_state(Some("http://x"), Some("  "), |_, _| Some(true)),
            McpState::Absent
        );
    }

    #[test]
    fn probe_verdict_maps_to_the_three_live_states() {
        let env = (Some("http://127.0.0.1:1/mcp"), Some("tok"));
        assert_eq!(
            mcp_state(env.0, env.1, |_, _| Some(true)),
            McpState::Connected
        );
        assert_eq!(
            mcp_state(env.0, env.1, |_, _| Some(false)),
            McpState::NoClient
        );
        assert_eq!(mcp_state(env.0, env.1, |_, _| None), McpState::Unreachable);
    }

    #[test]
    fn line_for_reads_context_from_the_payload() {
        let raw = r#"{"context_window":{"total_input_tokens":84213,
                     "context_window_size":200000,"used_percentage":42.1}}"#;
        assert_eq!(
            line_for(raw, McpState::Connected, false),
            "mcp ✓  ·  ctx 84k/200k 42%"
        );
    }

    #[test]
    fn line_for_survives_garbage_stdin() {
        // Malformed input must still produce a line rather than an error: an
        // empty status line is invisible, a panic is a visible Claude Code error.
        assert_eq!(line_for("not json", McpState::Absent, false), "ctx —");
        assert_eq!(line_for("", McpState::Connected, false), "mcp ✓  ·  ctx —");
    }
}
