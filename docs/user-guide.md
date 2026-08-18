# Swarmterm user guide

Everything the [README](../README.md) summarises, in detail: workspaces and panes,
running several agents at once, worktree isolation, the web preview, the War Room,
settings, keyboard shortcuts, troubleshooting and current limits.

## Create a workspace

Swarmterm opens on the **composer**: pick a folder (the working directory for every pane), choose how many terminals, and use the steppers to assign **Claude Code**, **Codex** or **OpenCode** — the rest stay plain shells. Turn on **Isolate features in git worktrees** for parallel work, then press `⌘/Ctrl + Enter`.

Agent detection re-runs every time the composer opens, so installing a CLI needs no restart. Swarmterm keeps **no workspace state between launches** — every start is a clean slate (Settings do persist).

## Panes

- **Split** from the pane header, drag the separator to resize, and drag a header onto another pane to swap the two — shells keep running.
- Closing a pane closes the gap; closing the last pane closes the workspace.
- The left navbar lists workspaces (add, rename, reorder) and the current workspace's terminals — click one to jump to it. `⌘/Ctrl + B` hides the sidebar.
- A pane can switch to a different agent, shell or folder from its header menu — note this restarts the shell.

## Running several agents at once

- **Activity dots** light up while a pane produces output, so you can see who is working — for Claude Code, Codex and OpenCode panes this becomes the richer [agent state dot](#agent-state-dots) instead.
- **Broadcast input** — `⌘/Ctrl + Shift + B`, then `Alt + Click` panes into the group and type once; every pane receives the same keystrokes ("now run the tests" × 5). `Esc` leaves.
- A badge counts War Room messages queued for a pane that is busy.

## Agent state dots

A Claude Code, Codex or OpenCode pane shows a coloured dot instead of the plain activity dot: **red** — the agent is blocked and needs your input (a permission prompt, a question); **yellow** — it's working; **green** — it finished while you were looking elsewhere, and clears the moment you focus that pane; **no dot** — idle, nothing to report. Right after a pane spawns (and again if the agent process exits) state is briefly unknown, so it falls back to the plain output-activity dot until detection catches up. Plain Terminal panes always use that plain dot — they never get colours.

A workspace tab in the navbar rolls this up across all its panes and shows the highest-priority dot — blocked beats done, done beats working, working beats plain activity — but only while that tab is **inactive**; the tab you're looking at never needs a dot. War Room member rows show the same coloured dot, or a muted grey dot labelled "Connected, idle" when a member has nothing to report.

## Resume past agent sessions

Picking a working folder also lists that folder's recent Claude Code, Codex and OpenCode sessions, read from each CLI's own history (never modified). Tick any of them — each reopens as an extra pane, right where the conversation left off. Tabs filter by agent, and "Show all" opens a searchable dialog over the full list.

## Worktree isolation

With the composer toggle on, every agent pane is created **inside its own worktree** at `<repo>.worktrees/<name>` on a fresh `swarm/<agent>-<n>` branch — separate diffs from the very first edit. Plain Terminal panes stay at the repo root; a folder that isn't a git repository yet is initialised with a first commit for you. Worktree panes carry a 🌿 badge.

Two rules protect your work: closing a pane or workspace **never deletes a worktree**, and a worktree with **uncommitted changes cannot be removed** — not by you, not by an agent. Once a branch is merged, clean up with **Clear worktree** in the pane menu or let an agent do it.

## The Git panel

The **Git** tab in the right panel shows, for the focused pane: its worktree and branch (and which agent owns each branch), changed files with an inline diff, and how many commits it is ahead of the main line. It follows your focus between panes.

## Web preview

The **Preview** tab is a browser column docked beside the terminals, with a real address bar and working back/forward/reload.

- **Each terminal keeps its own page** and the preview follows your focus; an agent in a background pane updates its own preview without stealing the one you're looking at.
- Type into the address bar yourself — `localhost:3000` opens as a page, free text becomes a Google search.
- **Sites that refuse to be embedded render anyway** — GitHub, Google, most SaaS dashboards.
- Popups and `window.open` navigate the preview in place (press Back to return); the pop-out button breaks the page out into a real OS window.

## War Room

Drag a pane by its header onto the right panel and the agent joins the room, receiving a short introduction to who else is there. The tab strip holds multiple rooms — `+` adds, double-click renames, `✕` deletes (two-step confirm; the last room stays) — each with its own transcript, members and moderator seat. **A pane belongs to at most one room**; dragging it onto another room's tab moves it.

Agents talk in two modes:

- **Probe** — lands in the peer's inbox and nudges it to read: questions, debate, coordination.
- **Execute** — pasted into the peer's terminal and run as its next prompt: a handover ("we agreed, now do it"). Refused if the target is a plain shell.

You are a member too — the **Moderator**. The composer at the bottom of the Discussion tab sends to one agent or the whole room, in either mode; replies land in the transcript instead of someone's terminal.

Deliveries never interrupt you: if the target pane has a half-typed command, the message is **held** — a pill in the pane, `⏸N` on the room tab — retries by itself once the pane is free, and "Deliver now" releases it immediately. Held messages are never dropped.

Drag a member chip out (or press its `✕`) and the agent instantly loses access. Closing a pane removes it automatically — and so does restarting one (switching its agent, shell or folder); just drag it back in.

A full walkthrough — Claude Code and Codex negotiating an API contract — is in [`war-room-demo.md`](war-room-demo.md).

## Status line in Claude Code panes

Every Claude Code pane gets a one-line readout under its prompt:

```
mcp ✓  ·  ctx 84k/200k 42%
```

The left half tells you whether Claude actually connected to Swarmterm — and therefore has the War Room and worktree tools: `✓` connected, `…` never reached Swarmterm (tools missing), `✗` Swarmterm no longer answering. The right half is the session's context window — tokens used, limit, percentage — amber past 70 %, red past 90 %.

Toggle it in **Settings → Terminal**. Swarmterm merge-writes the entry into `~/.claude/settings.json` and never touches a status line you already have.

## Terminal essentials

- **Real PTYs with 24-bit truecolor** — agent CLIs, emoji and box drawing render exactly as in your normal terminal, and IMEs (Vietnamese Telex, CJK) work without dropped characters.
- `⌘/Ctrl + C` copies when text is selected and otherwise interrupts; `⌘/Ctrl + V` pastes — like VS Code.
- **Click a URL** to open it in your browser; `⌘/Ctrl + click` a file path (`src/foo.ts:42:9`, `src/foo.ts(42,9)`, `File "x.py", line 42`) to open it in your editor at that line. Nothing is ever opened with the OS default app, so a mis-click on a `.sh` or `.exe` can never run it.
- **Drop a file or folder** onto a pane to insert its path, quoted for that pane's shell.
- **Choose your shell** — PowerShell, cmd, PowerShell 7, Git Bash on Windows; zsh, bash, fish on macOS/Linux — per pane, or as a default in Settings.

## Settings, tray and quitting

**Settings** (from the navbar) covers appearance, terminal font and default shell with a live preview, the status line toggle, and the full shortcut list — these preferences persist between launches.

**Closing the window hides Swarmterm to the tray** and everything keeps running; tray → **Quit** is what actually exits. Launching a second copy just focuses the window you already have. On Windows, closing a pane kills the entire process tree it started — no orphaned build servers.

## Updates

Swarmterm quietly checks GitHub Releases for a newer version shortly after launch, then every few hours while it stays open. When one exists, an **Update to vX.Y.Z** button appears at the bottom of the navbar, under Settings — nothing downloads until you click it. The button shows download progress, then turns into **Restart to update** (on Windows the installer takes over and relaunches the app itself). No update, no button — that's the whole notification. To check on demand, use tray → **Check for Updates…** — that one also tells you when you're already up to date, in a native dialog. Offline or flaky network? The automatic check stays silent; it never nags.

## Telemetry

Official release builds send an anonymous usage ping so we can see how many
people actually run Swarmterm: one `app_open` event at launch, then a
heartbeat every five minutes while the app is open. Each event carries a
random id, the app version and the OS name (`macos` / `windows` / `linux`) —
nothing else. No paths, no terminal content, no hostname, no account.
Google Analytics infers a country from the request's IP, as any website does;
Swarmterm never sends the IP itself.

The random id lives in one small file so restarts count as the same person —
`~/Library/Application Support/com.swarmterm.app/telemetry-id` on macOS,
`%APPDATA%\com.swarmterm.app\telemetry-id` on Windows,
`~/.config/com.swarmterm.app/telemetry-id` on Linux. Delete it any time to
start over as a new anonymous user.

**Builds from source contain no telemetry at all.** The analytics keys are
injected only when official releases are built; compile Swarmterm yourself
(`npm run tauri dev` or `npm run tauri build`) and the reporting code
compiles to nothing. Offline use is fine too — a failed ping is silently
dropped, never retried loudly, and never blocks the app.

## What your agents can do

Every pane is automatically connected to the app over MCP for exactly as long as it lives — nothing to configure. Agents that speak MCP (Claude Code, Codex, and others) can drive Swarmterm themselves: **open a web preview** beside their own pane, **spawn / list / remove worktrees** to hand tasks to fresh parallel agents (removal refuses uncommitted changes), and use the **War Room** — list peers, message them in probe or execute mode, read their inbox and reply.

War Room abilities only work for panes you dragged into a room, worktree abilities only in workspaces with isolation enabled — and removing a pane from a room revokes its access instantly.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + B` | Show or hide the sidebar |
| `⌘/Ctrl + Shift + B` | Toggle broadcast input |
| `Alt + Click` | Add or remove a pane from the broadcast group |
| `Esc` | Leave broadcast mode · close Settings |
| `⌘/Ctrl + Enter` | Create the workspace from the composer |
| `⌘/Ctrl + C` · `⌘/Ctrl + V` | Copy (when text is selected) · paste |
| `⌘/Ctrl + Click` | Open a file path in your editor, at that line |
| `⌘/Ctrl + F` | Find in the focused terminal · `Esc` closes it |

On macOS the modifier is `⌘`, which deliberately leaves `Ctrl + B` to the terminal for tmux.

## Troubleshooting

- **An agent is greyed out in the composer** — its CLI isn't on your `PATH`; install it and reopen the composer.
- **A War Room message never arrived** — look for the pill in the pane or `⏸N` on the room tab: it's held behind an unsubmitted prompt line. Press Enter, or click "Deliver now".
- **An agent says it isn't in the War Room** — its pane was removed or restarted; drag it back in.
- **A relative path isn't clickable after `cd`** — a PowerShell quirk; absolute paths (everything agents print) still work.
- **The app disappeared** — it's in the tray; click the icon to bring it back.

## Known limits

- **Nothing is saved between launches** — workspaces, layouts and previews start fresh. Intentional for now.
- **One visual style** — VS Code Dark Modern; a light theme is on the list.
- **War Room membership doesn't survive a pane restart** — re-drag the pane.
- **The preview column has no devtools, zoom, tabs, or per-terminal cookie isolation**, and a failed page shows the platform's own error view.
- **Terminal search covers the visible scrollback only** — matches beyond xterm's own buffer, and search-and-replace, aren't available.
- **Linux** is implemented but less tested than Windows and macOS.
