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

## v2 smoke: Moderator seat + nudge typing guard

Two agent panes in the room, both showing `connected`.

**Moderator**
1. Broadcast a probe from the composer → both panes get nudged; the transcript
   shows one `Moderator → everyone` group with a crown avatar.
2. Direct probe to one member → only that pane is nudged.
3. Switch to Execute → the `Everyone` row disappears and the input turns
   orange; send a short prompt → it is pasted and run in that pane only.
4. Ask an agent to `war_room.send` to `__moderator__` → the reply lands in
   Discussion and nothing is typed into any pane.
5. Ask an agent to send `mode: "execute"` to `__moderator__` → the tool call is
   rejected with a message naming the Moderator.

**Typing guard**
6. Type a half line into pane A without pressing Enter, then probe pane A from
   the composer → nothing is typed, the half line is intact, the pill appears
   bottom-right in pane A, and the Members sub-tab shows `⏸1`.
7. Press Enter in pane A → the nudge arrives right afterwards.
8. Repeat step 6, then click the pill instead → the nudge is delivered
   immediately.
9. Repeat step 6, then click into pane B → pane A's pill stays. An unsubmitted
   line holds regardless of focus.
10. Close pane A while its delivery is held → no stray text, no orphan badge.
