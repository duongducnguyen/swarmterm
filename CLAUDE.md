# CLAUDE.md

Guidance for AI agents working in this repo. Keep it lean — it points at the
code and docs rather than duplicating them. When this file and the code
disagree, **trust the code**.

## What this is

**Swarmterm** — a desktop multi-terminal app: a left navbar of workspaces, each
a binary split-tree of real terminal panes (xterm.js front, `portable-pty`
shell back), plus an optional Chrome-style web-preview column. Built on
**Tauri 2 + Rust** (frontend: **React 19 + TypeScript + Vite**). Ported from an
earlier Electron app; no state is persisted between launches by design.

`README.md` is the end-user guide (English) — what the app does and how to use
it, no code guidance. The manual smoke-test checklist is
`docs/manual-smoke-tests.md`. Update both when you ship user-visible behaviour.

**Cross-platform intent:** build for macOS and Linux as well as Windows, even
though primary development happens on Windows. Don't hard-code Windows-only
assumptions; gate platform code behind `#[cfg(...)]` (Rust) or runtime checks (TS).

## Commands

Run from the repo root unless noted. The shell here is **PowerShell** — use
PowerShell syntax (`$env:VAR`, `$null`), not bash.

| Command | What it does |
|---|---|
| `npm install` | Install JS dependencies. |
| `npm run tauri dev` | Run the full app (Vite HMR frontend + Rust auto-rebuild). |
| `npm test` | Run the JS/TS unit suite (Vitest, run-once). |
| `npm run test:watch` | Vitest in watch mode. |
| `npx tsc --noEmit` | Type-check the whole frontend (strict). |
| `npm run build` | Frontend-only build (`tsc && vite build`) — no Rust. |
| `npm run tauri build` | Production bundle (installer). |
| `npm run tauri build -- --no-bundle` | Release binary, skip installer. |
| `cargo test` *(from `src-tauri/`)* | Rust unit tests (pty/shell/deeplink helpers). |

**Before claiming done:** run `npm test`, `npx tsc --noEmit`, and — if you
touched `src-tauri/` — `cargo test`. Don't assert success without the output.

## Architecture

```
┌─ Renderer (src/) ─────────────┐         ┌─ Backend (src-tauri/src/) ─┐
│ components/  React UI          │         │ lib.rs     builder/plugins │
│ store/       zustand state     │ invoke  │ commands.rs #[command] fns │
│ lib/         pure logic (TDD)  │ ──────► │ pty.rs      spawn + reader │
│ tauri/       IPC bridge ───────┼─────────┤ shell.rs    shell discovery│
│                                │ Channel │ tray.rs / deeplink.rs      │
└────────────────────────────────┘ ◄────── └────────────────────────────┘
                                    PtyOut
```

- **`src/tauri/*` is the ONLY IPC surface.** There is no `window.api` shim. Every
  call into Rust goes through a thin typed module here: `terminal.ts` (pty
  create/write/resize/kill + the `Channel<PtyOut>` stream), `window.ts`,
  `dialog.ts`, `clipboard.ts`, `shell.ts`, `deeplink.ts`, `popout.ts`. New
  backend calls get a new function in one of these — components never call
  `invoke` directly.
- **`#[tauri::command]` handlers live in `commands.rs`** and delegate to module
  logic (`pty.rs`, `shell.rs`). Register new commands in the
  `invoke_handler!` list in `lib.rs`.
- **Per-terminal streaming:** each pty gets its own `Channel<PtyOut>`; a Rust
  reader thread decodes output and sends `Data` chunks, then a final `Exit`.
  The Serde tagging (`type`/`payload`, camelCase) must stay in lockstep with the
  `PtyOut` union in `src/tauri/terminal.ts`.

## Module boundaries (respect these)

- **`src/lib/`** — pure, framework-free logic, each with a `*.test.ts` beside it
  (layout-tree, web-url, templates, terminal-session, appearance, etc.). This is
  where business rules go so they can be unit-tested without a DOM or a pty.
- **`src/store/`** — zustand stores. UI state and actions only; keep pure
  transforms in `lib/` and call them from the store (see `app-store.ts` ↔
  `layout-tree.ts`).
- **`src/lib/terminal-registry.ts`** — owns the live xterm `Terminal` instances
  **outside React's render tree**, keyed by `terminalId`. Components attach/detach
  by id; the registry survives remounts so a pane re-parenting (split collapse)
  doesn't kill the shell. Don't put xterm instances in React state.
- **`src/components/`** — thin. Layout + wiring; logic belongs in `lib`/`store`.
  `components/ui/` is shadcn-style primitives (button, dropdown-menu).

## Conventions

- **Imports:** use the `@/` alias for `src/` (`@/lib/...`), configured in both
  `vite.config.ts` and `tsconfig.json`.
- **TypeScript is strict**, including `noUnusedLocals` / `noUnusedParameters` /
  `noFallthroughCasesInSwitch`. Dead code fails the type-check.
- **TDD for `lib/`:** write/extend the `*.test.ts` first. Run via Vitest.
- **Comments explain *why*, not *what*.** This codebase leans on dense rationale
  comments for non-obvious platform/lifecycle decisions — match that density when
  you add similar logic (see `pty.rs`, `terminal-registry.ts` for the bar).
- **Styling:** Tailwind (`tailwind.config.cjs`) + CSS variables in
  `src/index.css` for light/dark theming. The visual target is **VS Code** —
  mirror its chrome, palettes, and patterns closely (the terminal palette in
  `terminal-registry.ts` is VS Code "Dark Modern" verbatim).
- **Rust:** platform-specific code behind `#[cfg(windows)]` / `#[cfg(not(windows))]`;
  keep testable helpers pure with a `#[cfg(test)] mod tests` block (see
  `take_valid_utf8`).

## Gotchas (the non-obvious stuff)

- **Terminal respawn ordering.** `create_terminal` rejects a duplicate live id.
  So killing must free the id *before* the renderer retries: `kill_terminal`
  removes the entry from the map and drops the master PTY to force the reader to
  observe EOF (on Windows ConPTY the pipe stays open until the master is dropped),
  and `read_loop` removes the id from state *before* emitting `Exit`. A same-id
  respawn (agent/cwd/shell switch) waits for that `Exit`. Touch this carefully.
- **Windows process-tree teardown.** Shells are captured in a kill-on-close **Job
  Object** so closing a pane/workspace kills children/grandchildren, not just the
  shell. See `pty.rs::job`.
- **UTF-8 chunk boundaries.** `take_valid_utf8` buffers a split trailing multibyte
  sequence across reads to avoid mojibake (emoji/box-drawing). Don't "simplify" it
  into a lossy decode.
- **Keyboard focus belongs to the terminal.** dnd-kit stamps `tabIndex: 0` on
  every drag node (workspace tabs, navbar items, pane headers), so a click parks
  DOM focus on chrome and keystrokes are dropped — and a Tab (shell completion)
  walks the focus ring across the tab titles. Those nodes are pinned to
  `tabIndex={-1}`, and `App.tsx` hands focus back to
  `selectFocusedTerminalId(...)` after clicks inside any `data-focus-return`
  region, on workspace switch, and on window re-focus. The decision lives in
  `lib/terminal-focus.ts` — it stands down for inputs, contenteditable, and open
  menus/dialogs. New chrome that swallows clicks should carry
  `data-focus-return`; anything that owns the keyboard (Welcome, Settings, the
  right panel) must not.
- **Close-to-tray vs Quit.** Closing the window hides it to the tray (pty stays
  alive); `on_window_event` calls `prevent_close()` unless `AppState.quitting` is
  set (tray → Quit). Killing the app for real must set that flag.
- **Truecolor.** The shell is spawned with `COLORTERM=truecolor` /
  `TERM=xterm-256color`; ConPTY forwards 24-bit color and xterm renders it
  verbatim. Don't downscale.
- **MCP server & session token.** On boot the Rust process binds a random
  loopback port and runs an `rmcp` Streamable-HTTP MCP server. Each PTY is
  spawned with `SWARMTERM_MCP_URL=http://127.0.0.1:<port>/mcp` and
  `SWARMTERM_SESSION=<terminalId>`. The session UUID doubles as the bearer
  token — the terminal's env is the only place it appears, and it stops
  authorising the moment the PTY is killed (auth resolver checks the live
  terminal map). To add a tool: drop it into `src-tauri/src/mcp/tools/` and
  add one `mod` line — see the spec at
  `docs/design-docs/specs/2026-07-04-swarmterm-mcp-server-design.md`.
- **War Room.** Multiple named rooms on `AppState.war_rooms` (`warroom.rs`:
  `WarRooms` registry over per-room `WarRoom` instances; default room seeded
  at boot, last room undeletable). A pane is in at most one room — drag onto
  a room tab (or the panel body = active room) to join/move; the MCP tools
  are unchanged and resolve the caller's room by membership (`find_room_of`).
  Every `warroom:event` carries `roomId`; `warroom:deliver` stays
  per-terminal, so the delivery/hold pipeline is room-agnostic. Each room has
  its own Moderator seat; the composer sends into the active room. Drag the
  member chip out (or ✕) → `war_room_leave`. The `war_room.*` MCP tools are
  always registered but gate per-call on live membership, so revocation is
  the map removal itself. PTY death auto-leaves (both `kill_terminal` and
  `read_loop`) — membership does NOT survive a same-id respawn; re-drag.
  Probe messages live in server-side inboxes; only a
  short nudge is typed into an idle pane (sustained idle, `NUDGE_IDLE_MS`),
  via `deliverPromptToTerminal` which bypasses broadcast fan-out on purpose.
  `mode: "execute"` pastes + runs a full prompt and is server-rejected toward
  plain-shell members. Codex enrollment rewrites `~/.codex/config.toml` with
  the concrete URL on every boot (`mcp/config.rs::register_codex`).
  The user has a seat: `MODERATOR_ID` (`"__moderator__"`) is seeded into the
  members map at construction — never joins or leaves, is excluded from
  `members_info()` (the renderer roster) but present in `peers()` (MCP
  `list_peers`), takes no inbox pushes, and cannot be `leave`d. The Discussion
  tab's composer sends through `war_room_moderator_send`. Deliveries are also
  gated on user typing, not just pty output: `shouldDeferDelivery` holds a
  queue while a pane has an unsubmitted line (`dirty`, tracked from
  `onData` in `terminal-registry`) or was typed in within `TYPING_QUIET_MS`
  while focused. A held queue is never dropped — it re-arms every
  `HOLD_RECHECK_MS`, shows an in-pane pill plus a panel badge, and both
  "Deliver now" affordances release it by clearing the typing signal rather
  than bypassing the scheduler. There is deliberately no maximum hold.
- **Worktree-per-agent.** The composer's "Isolate features in git worktrees"
  toggle now provisions isolation upfront: every agent pane is created inside
  its own `<repo>.worktrees/<slug>` worktree on branch `swarm/<agent>-<n>`
  (plain Terminal panes stay at the repo root; a failed creation falls back
  to the repo root with a console warning, never blocking workspace
  creation). The `worktree.spawn/list/remove` MCP tools remain as the
  secondary path — mid-session delegation to new worker panes and
  agent-driven cleanup — still gated on the same toggle via `worktree_mode`
  in the terminal map. Removal refuses dirty worktrees and anything outside
  `<repo>.worktrees`; closing panes/workspaces never deletes worktrees;
  worktree directories are never renamed (agent session state is keyed by
  absolute path).
- **Claude Code status line.** `swarmterm --statusline` is a second entry point
  into the same binary, short-circuited in `main.rs` *before* the Tauri builder
  so no window/tray/single-instance/AppKit is touched. It prints one line: an
  `mcp` segment and a `ctx` segment (`statusline/render.rs` is pure and holds
  every state). "Connected" is proved by an axum middleware on `/mcp` that
  records each inbound bearer token (`mcp/clients.rs`) — `initialize` never
  reaches `SwarmtermMcpServer::caller`, so hooking the tool layer would miss the
  one request that matters; `/status` is registered *after* `.layer(...)` so the
  probe cannot stamp its own verdict. Membership is dropped in both
  `kill_terminal` and `read_loop`, so a same-id respawn starts at `mcp …`. The
  probe is hand-rolled HTTP/1.1 over `TcpStream` (300 ms) — no tokio runtime in
  a command Claude re-runs every render. The entry is merge-written into
  `~/.claude/settings.json` (NOT `~/.claude.json`) and a foreign `statusLine` is
  never touched in either direction. On Windows the recorded path uses forward
  slashes: Claude Code runs the command through Git Bash, which eats
  backslashes. Spec:
  `docs/design-docs/specs/2026-08-01-claude-statusline-design.md`.
- **`swarmterm://auth/callback` deeplink stays** for OAuth PKCE only. Anything
  else that arrives on the scheme is now logged and dropped — the browser
  preview flow moved to MCP.
- **No persistence.** Every launch starts fresh (one Welcome → one workspace).
  Don't assume saved state.

## Dev workflow

This project uses the **design-docs** flow: brainstorm a design →
`docs/design-docs/specs/YYYY-MM-DD-<topic>-design.md` → implementation plan in
`docs/design-docs/plans/` → TDD implementation. New features should follow the
same trail; the existing specs/plans are good templates and the best record of
*why* features look the way they do.

## Docs map

- `README.md` — user-facing guide (English): what problems the app solves,
  feature walkthrough, install, shortcuts, troubleshooting, limits. No
  architecture or folder tree — that lives here. Screenshots are placehold.co
  placeholders until real ones land; `docs/images/README.md` has the shot list.
- `docs/manual-smoke-tests.md` — release smoke checklist.
- `docs/war-room-demo.md` — scripted War Room demo (Claude Code × Codex).
- `docs/design-docs/specs/` — per-feature design docs; the best record of *why*.
