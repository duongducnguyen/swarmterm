# War Room demo — Claude Code × Codex debating an API contract

Prereqs: `claude` and `codex` CLIs installed; two project folders (e.g. a
backend and a frontend). Swarmterm launched at least once so both agents'
MCP configs are registered (`~/.claude.json`, `~/.codex/config.toml`).

1. `npm run tauri dev`.
2. Create workspace A in the backend folder with a **Claude Code** pane, and
   workspace B in the frontend folder with a **Codex** pane (or one workspace,
   two panes).
3. Wait for both CLIs to be at their prompt. Verify connectivity inside the
   Claude pane with `/mcp` — the `swarmterm` server should be connected.
4. Drag the Claude Code pane by its header onto the right panel — the War Room
   tab reveals while dragging; drop anywhere on it. The member chip appears
   and an intro prompt is typed into the pane. Repeat for the Codex pane.
5. In the Claude pane, type:
   "The frontend needs `created_at` in the `/users` response. Debate the
   contract change with your War Room peer (they own the frontend) until you
   both agree, then hand them the agreed change with mode execute."
6. Watch the transcript tab: probe messages flow both ways (nudges wake each
   side when idle), then an execute entry appears and the Codex pane runs the
   handed-over prompt.
7. Drag one member chip out of the panel (or press its ✕). Ask the remaining
   agent to send another war_room message — the tool call now fails with
   "not in the War Room", proving revocation.
