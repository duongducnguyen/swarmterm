//! Which panes an MCP client has actually talked to us from.
//!
//! The `mcp` segment of the status line answers "did Claude load our config?",
//! and the only honest evidence is an inbound request carrying the pane's
//! bearer token. Env-var presence proves nothing (the env is injected whether
//! or not Claude ever reads `~/.claude.json`), and `SwarmtermMcpServer::caller`
//! is too late — it only runs for `#[tool]` invocations, while `initialize` is
//! both the first request Claude Code sends and the one that proves the link.
//! So this set is fed from a transport-level middleware instead.
//!
//! Membership is monotonic for a pane's lifetime: it answers "has a client ever
//! reached us", not "is one attached right now". Liveness would mean accounting
//! for held SSE streams inside rmcp's session manager, and the state worth
//! surfacing is the *absence* of a client, which a set already tells us.

use std::collections::HashSet;

/// Terminal ids (which double as session bearer tokens) an MCP client has
/// called in with. Entries die with the PTY — see `forget`.
#[derive(Debug, Default)]
pub struct McpClients {
    seen: HashSet<String>,
}

impl McpClients {
    /// Record an inbound MCP request from `token`. Blank tokens are dropped so
    /// a header-less request can never manufacture a `connected` verdict.
    /// Trimming matches `auth::resolve`, which is the function that decides
    /// whether the same string is a live terminal.
    pub fn touch(&mut self, token: &str) {
        let t = token.trim();
        if t.is_empty() {
            return;
        }
        self.seen.insert(t.to_owned());
    }

    /// Has any MCP client ever called in with this token during the pane's life?
    pub fn has_seen(&self, token: &str) -> bool {
        self.seen.contains(token.trim())
    }

    /// Drop a pane's footprint. Called wherever the terminal leaves
    /// `AppState.terminals`, so a same-id respawn starts from "no client yet"
    /// instead of inheriting the previous shell's verdict.
    pub fn forget(&mut self, token: &str) {
        self.seen.remove(token.trim());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_token_has_not_been_seen() {
        let c = McpClients::default();
        assert!(!c.has_seen("abc-123"));
    }

    #[test]
    fn touch_marks_the_token_seen() {
        let mut c = McpClients::default();
        c.touch("abc-123");
        assert!(c.has_seen("abc-123"));
    }

    #[test]
    fn touch_is_idempotent() {
        let mut c = McpClients::default();
        c.touch("abc-123");
        c.touch("abc-123");
        assert!(c.has_seen("abc-123"));
    }

    #[test]
    fn touch_ignores_a_blank_token() {
        let mut c = McpClients::default();
        c.touch("");
        c.touch("   ");
        assert!(!c.has_seen(""));
        assert!(!c.has_seen("   "));
    }

    #[test]
    fn touch_trims_whitespace_like_auth_resolve() {
        let mut c = McpClients::default();
        c.touch("  abc-123  ");
        assert!(c.has_seen("abc-123"));
    }

    #[test]
    fn forget_drops_the_entry_so_a_respawn_starts_clean() {
        let mut c = McpClients::default();
        c.touch("abc-123");
        c.forget("abc-123");
        assert!(!c.has_seen("abc-123"));
    }

    #[test]
    fn forget_is_idempotent() {
        let mut c = McpClients::default();
        c.forget("never-existed");
        assert!(!c.has_seen("never-existed"));
    }
}
