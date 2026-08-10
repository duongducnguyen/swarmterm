<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.png">
  <img src="docs/images/logo-light.png" alt="Swarmterm" width="96" height="96">
</picture>

# Swarmterm

**One window for a whole swarm of AI coding agents.**

Real split terminals · one git worktree per agent · a live web preview beside each pane · and a War Room where your agents talk to each other.

[![Tauri 2](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Platforms](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-6b7280)](#requirements)
[![Status](https://img.shields.io/badge/status-pre--1.0-f97316)](#known-limits)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

<!-- IMAGE: replace with docs/images/hero.png (1600×900) -->
<img src="https://placehold.co/1600x900/1e1e1e/6b7280/png?text=Hero+screenshot" alt="Swarmterm overview" width="100%">

</div>

---

## Contents

- [Why Swarmterm](#why-swarmterm)
- [Screenshots](#screenshots)
- [Requirements](#requirements)
- [Install & run](#install--run)
- [Your first workspace](#your-first-workspace)
- [Using Swarmterm](#using-swarmterm)
  - [Workspaces and panes](#workspaces-and-panes)
  - [Running several agents at once](#running-several-agents-at-once)
  - [Resume past agent sessions](#resume-past-agent-sessions)
  - [Worktree isolation](#worktree-isolation)
  - [The Git panel](#the-git-panel)
  - [Web preview](#web-preview)
  - [War Room](#war-room)
  - [Status line in Claude Code panes](#status-line-in-claude-code-panes)
  - [Terminal essentials](#terminal-essentials)
  - [Settings](#settings)
  - [Window, tray and quitting](#window-tray-and-quitting)
- [What your agents can do](#what-your-agents-can-do)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)
- [Known limits](#known-limits)
- [Contributing & license](#contributing--license)

---

## Why Swarmterm

Running **one** coding agent in a terminal works anywhere. Running **five** is where ordinary terminals fall apart:

| The problem | What Swarmterm does about it |
|---|---|
| One window or tab per agent — you lose track of which pane is doing what. | Every workspace is a real **split tree of panes**, with a workspace navbar, a terminal list, agent icons and an **activity dot** that lights up while a pane is producing output. |
| Several agents editing the same checkout — they collide, and the diff becomes one unreviewable mess. | Flip one switch when you create the workspace and **each agent pane is born inside its own git worktree**, on its own branch. Separate diffs from the very first edit. |
| An agent prints `http://localhost:5173` and you have to copy it into a browser. | A **web preview column** sits right next to the panes. The agent opens the page itself; each terminal keeps its own preview, so clicking a pane shows that pane's page. |
| Agents can't talk to each other, so you become the copy-paste relay between them. | The **War Room**: drag panes into the panel and they can message each other, argue about a design, and hand over finished work. You get a seat too. |
| Sending the same prompt to five agents means pasting it five times. | **Broadcast input**: pick a group of panes with `Alt + Click`, type once, every pane in the group receives it. |
| You can't tell which agent is stuck waiting for you. | Per-pane activity dots, live pane titles, and a badge counting messages queued for a pane that is busy. |

Swarmterm is a native desktop app (Tauri 2 + Rust, not Electron) with real PTY terminals and a VS Code-flavoured interface.

---

## Screenshots

> These are **placeholders**. See [`docs/images/README.md`](docs/images/README.md) for the file names and sizes to drop in; each `<img>` below has a comment naming the file that replaces it.

<table>
<tr>
<td width="50%">

<!-- IMAGE: docs/images/composer.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Workspace+composer" alt="Workspace composer" width="100%">

**Composer** — pick a folder, choose how many panes, assign agents, preview the layout.

</td>
<td width="50%">

<!-- IMAGE: docs/images/split-panes.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Split+panes+%2B+broadcast" alt="Split panes and broadcast" width="100%">

**Panes + broadcast** — split, resize, swap panes; type once for a whole group.

</td>
</tr>
<tr>
<td width="50%">

<!-- IMAGE: docs/images/war-room.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=War+Room" alt="War Room" width="100%">

**War Room** — rooms, transcript, members, and your Moderator composer.

</td>
<td width="50%">

<!-- IMAGE: docs/images/git-worktrees.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Git+%2B+worktrees" alt="Git panel" width="100%">

**Git panel** — each agent's worktree, changed files, inline diff.

</td>
</tr>
<tr>
<td width="50%">

<!-- IMAGE: docs/images/web-preview.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Web+preview" alt="Web preview" width="100%">

**Web preview** — the agent opens the page; it lands next to its own pane.

</td>
<td width="50%">

<!-- IMAGE: docs/images/settings.png (1200×750) -->
<img src="https://placehold.co/1200x750/1e1e1e/6b7280/png?text=Settings" alt="Settings" width="100%">

**Settings** — appearance, terminal font and shell, shortcuts.

</td>
</tr>
</table>

---

## Requirements

| | |
|---|---|
| **Node.js** | 18 or newer, with npm 10+ |
| **Rust** | stable toolchain from [rustup.rs](https://rustup.rs) |
| **Windows** | [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (usually preinstalled on Win 10/11) and Microsoft C++ Build Tools |
| **macOS** | Xcode Command Line Tools — `xcode-select --install` |
| **Linux** | `webkit2gtk-4.1`, `librsvg`, `libayatana-appindicator3`, `build-essential` — see [Tauri prerequisites](https://tauri.app/start/prerequisites/) |
| **Optional** | The agent CLIs you want to use: `claude`, `codex`, `opencode`. Anything that isn't installed simply appears disabled in the composer. |

---

## Install & run

There are no prebuilt downloads yet, so you run it from source:

```bash
git clone https://github.com/duongducnguyen/swarmterm.git
cd swarmterm
npm install
npm run tauri dev
```

To produce an installer for your platform instead:

```bash
npm run tauri build                  # installer / app bundle
npm run tauri build -- --no-bundle   # just the binary, no installer
```

The first build compiles the Rust side and takes a few minutes; later runs are fast.

---

## Your first workspace

1. **Launch.** Swarmterm opens on the Welcome screen — the workspace composer.
2. **Pick a folder.** Browse to your project, or click one of the recent folders. This becomes the working directory for every pane.
3. **Choose how many terminals** you want (the tiles on the right), then use the steppers to say how many of them run **Claude Code**, **Codex** or **OpenCode**. Anything you don't assign stays a plain shell. The layout preview updates as you go.
4. **Optional but recommended for parallel work:** turn on **Isolate features in git worktrees** so every agent gets its own branch and directory.
5. **Create** — click the button or press `⌘/Ctrl + Enter`.

Your panes open with the agents already starting up. From here, the right-hand panel gives you **Preview**, **Git** and **War Room**.

> Swarmterm deliberately keeps **no state between launches** — every start is a clean slate.

---

## Using Swarmterm

### Workspaces and panes

- **Left navbar** — all your workspaces. Add, switch, rename, close, or drag to reorder. Below them is the list of terminals in the current workspace; click one to jump straight to that pane.
- **Split a pane** — use the split buttons in the pane header to divide it horizontally or vertically. Drag the separator to resize.
- **Rearrange** — drag a pane by its header and drop it on another pane to swap the two. The shells keep running.
- **Close a pane** — the layout closes the gap automatically. Closing the last pane of a workspace closes the workspace.
- **Hide the sidebar** with `⌘/Ctrl + B` when you want maximum terminal space.

### Running several agents at once

- **Agent detection.** Swarmterm looks for `claude`, `codex` and `opencode` on your machine. If you install one while the app is running, just reopen the composer — it re-checks, no restart needed.
- **Activity dots.** A pane's dot lights up while its shell is producing output and goes quiet when it stops, so you can see at a glance who is working and who is waiting for you.
- **Broadcast input.** Press `⌘/Ctrl + Shift + B` to enter broadcast mode, `Alt + Click` panes to add or remove them from the group, then type. Every pane in the group receives the same keystrokes — ideal for "now run the tests" across five agents. `Esc` leaves broadcast mode.
- **Per-pane control.** Each pane can be switched to a different agent, a different shell, or a different working directory from its header menu.

### Resume past agent sessions

When you pick a working folder, the composer lists that folder's recent
Claude Code, Codex, and OpenCode sessions (read from each CLI's own history).
Tick any of them — each becomes an extra pane that reopens the conversation
right where it left off. Swarmterm never modifies the CLIs' session files.

Tabs above the list filter it to one agent (All · Claude Code · Codex ·
OpenCode), and both this list and Recent show a short head you can expand
with "Show all".

### Worktree isolation

Turn on **Isolate features in git worktrees** in the composer and Swarmterm sets everything up before the workspace even opens:

- every agent pane is created **inside its own worktree** at `<repo>.worktrees/<name>`, on a new `swarm/<agent>-<n>` branch;
- plain Terminal panes stay in the repository root;
- if the folder isn't a git repository yet, it is initialised with a first commit for you;
- panes running in a worktree are marked with a 🌿 badge in their header.

Two rules that protect your work:

- **Closing a pane or workspace never deletes a worktree.** Your branches survive.
- **A worktree with uncommitted changes cannot be removed** — not by you through the app, and not by an agent. Commit first, then clean up.

To tidy up later, use **Clear worktree** from a pane's context menu, or let an agent remove merged branches itself.

### The Git panel

Open the **Git** tab in the right panel to see, for the currently focused pane:

- which worktree and branch it is on, and which agent owns each branch;
- the files that changed, with an inline diff and line numbers;
- how many commits the branch is ahead of the main line.

It follows your focus — click a different agent's pane and the panel switches to that agent's work.

### Web preview

The **Preview** tab is a browser column docked next to your terminals, with a real address bar and working back/forward/reload.

- **Each terminal keeps its own page.** Click between panes and the preview follows.
- **Agents open pages themselves.** When an agent starts a dev server it can put the page on screen for you; calling again just navigates the existing preview.
- An agent working in a **background pane updates its own preview silently** — it never steals the view you're looking at.
- You can also type any URL into the address bar yourself — free text becomes a Google search, and something like `localhost:3000` is understood as a page to open.
- **Sites that refuse to be embedded render anyway.** GitHub, Google, and most SaaS dashboards work right in the column instead of staying blank.
- **The address bar follows you.** Click a link inside the page and the URL and tab title update to match; Back and Forward move through that pane's real history, and the reload button spins while a page is loading.
- **Popups open in place.** When a page calls `window.open` or a link targets a new tab (an OAuth "sign in", for example), the preview navigates to it directly instead of spawning a separate window — press Back to return to where you were, or use the pop-out button next to the address bar to break the page out into a real OS window.

### War Room

The War Room is where agents stop being isolated.

**Getting agents in**

Drag a pane by its header onto the right panel — the War Room tab reveals itself while you drag. Drop it, and that agent joins the room and receives a short introduction telling it who else is there.

**Rooms**

The panel has a tab strip of rooms:

- `+` creates a new room, double-click a tab to rename it, `✕` deletes it (with a two-step confirm; the last room can't be deleted).
- **A pane belongs to at most one room.** Dragging it onto another room's tab moves it there.
- Each room has its own transcript, member list and moderator seat, so two unrelated efforts never hear each other.

**How agents talk**

- **Probe** — a message lands in the peer's inbox and the peer is nudged to read it. This is what agents use for questions, debate and coordination.
- **Execute** — the message is pasted into the peer's terminal and run as their next prompt. This is a handover: "we agreed, now do it." Execute is refused if the target is a plain shell rather than an agent.

**Your seat**

You are a member too — the **Moderator**. Use the composer at the bottom of the Discussion tab to send a message to one agent or broadcast to the whole room, in either mode. Agents can reply to you, and their replies show up in the transcript instead of being typed into somebody's terminal.

**It waits for you to finish typing**

If a message is destined for a pane where you have a half-typed command, Swarmterm **holds it** rather than interrupting: a small pill appears in the pane and the room tab shows `⏸N`. It retries by itself once the pane is free, and either "Deliver now" affordance releases it immediately. Held messages are never dropped.

**Leaving**

Drag a member chip out of the panel, or press its `✕`, and that agent immediately loses access — its next attempt to message the room is refused. Closing a pane removes it from the room automatically.

> **Note:** switching a pane's agent, shell or folder restarts it, which also removes it from the room. Drag it back in.

A full walkthrough — Claude Code and Codex negotiating an API contract — is in [`docs/war-room-demo.md`](docs/war-room-demo.md).

### Status line in Claude Code panes

Every Claude Code pane gets a one-line readout under its prompt:

```
mcp ✓  ·  ctx 84k/200k 42%
```

The left half answers a question that is otherwise invisible — whether Claude actually connected to Swarmterm, and therefore whether it really has the War Room and worktree tools:

| | |
|---|---|
| `mcp ✓` | connected — Swarmterm's tools are available in this pane |
| `mcp …` | Claude is running but never reached Swarmterm; its tools are missing |
| `mcp ✗` | Swarmterm is no longer answering |

The right half is the session's context window: tokens in use, the model's limit, and the percentage. It turns amber past 70% and red past 90%, and reads `ctx —` until Claude's first reply. In a terminal outside Swarmterm the `mcp` half is simply absent.

Turn it off in **Settings → Terminal → Agent status line**. Swarmterm writes the entry into `~/.claude/settings.json`; if you already have your own status line there, yours is kept and Swarmterm's is skipped.

### Terminal essentials

- **Real shells, full colour.** Terminals are real PTYs with 24-bit truecolor, so agent CLIs look exactly as they do in your normal terminal. Emoji and box drawing render correctly.
- **Copy and paste like VS Code.** `Ctrl/⌘ + C` copies when text is selected and otherwise still sends the interrupt to the shell; `Ctrl/⌘ + V` pastes.
- **Clicking links.**
  - A **single click** on a URL opens it in your normal browser.
  - `⌘/Ctrl + click` on a file path opens it in your editor, at the right line — `src/foo.ts:42:9`, TypeScript's `src/foo.ts(42,9)` and Python's `File "x.py", line 42` all work.
  - Paths that don't exist aren't clickable, and **no link is ever opened with the operating system's default app** — a mis-click on a `.sh` or `.exe` can never run it.
- **Drag files in.** Drop a file or folder onto a pane and its path is inserted at the prompt, quoted correctly for that pane's shell.
- **Choose your shell.** PowerShell, cmd, PowerShell 7 and Git Bash on Windows; zsh, bash and fish on macOS and Linux — per pane, or as a default in Settings.
- **International input.** Vietnamese Telex, CJK IMEs and other multi-character input work in the terminal without dropped or duplicated characters.

### Settings

Open Settings from the navbar. Three sections:

- **Appearance** — the visual style (currently VS Code Dark Modern).
- **Terminal** — font family, size, line height and ligatures, with a live preview, your default shell, and the Claude Code status line toggle.
- **Keyboard Shortcuts** — the full list for your platform.

Your appearance and terminal preferences are remembered between launches.

### Window, tray and quitting

- **Closing the window hides Swarmterm to the tray** and everything keeps running. Click the tray icon or choose *Show Swarmterm* to bring it back.
- **Tray → Quit** is what actually exits, shutting down every terminal.
- Opening Swarmterm a second time just focuses the window you already have.
- On Windows, closing a pane kills the whole process tree it started — no orphaned build servers.

---

## What your agents can do

Every terminal Swarmterm opens is automatically connected to the app, so agents that speak MCP (Claude Code, Codex, and others) can drive these features themselves. Nothing to configure — the connection is set up on every launch, and it only lasts as long as that pane.

| Ability | What it does for you |
|---|---|
| **Open a preview** | The agent puts a page — usually the dev server it just started — into the preview column beside its own pane. |
| **Spawn an isolated worktree** | Mid-session, an agent can hand a task to a fresh agent in its own worktree and branch, so parallel work never collides. |
| **List worktrees** | The agent can see which branches and directories exist. |
| **Remove a worktree** | Cleanup after a branch is merged — refused if anything is uncommitted, or if the directory isn't one Swarmterm created. |
| **See who's in the room** | The agent lists its War Room peers, what they are, and where they're working. |
| **Message a peer** | Ask a question, argue a design (probe), or hand over an agreed task to run (execute). |
| **Read its inbox** | Pick up messages after being nudged, and reply. |

The War Room abilities only work for panes you have actually dragged into a room, and the worktree abilities only in workspaces where you enabled isolation. Removing a pane from a room revokes its access instantly.

---

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

On macOS the modifier is `⌘`, which deliberately leaves `Ctrl + B` to the terminal for tmux.

---

## Troubleshooting

**An agent is greyed out in the composer.** Its CLI isn't on your `PATH`. Install it, then reopen the composer — Swarmterm re-checks each time.

**The worktree toggle is disabled.** The folder isn't a git repository, or it's a fresh repository with no commits yet. Make one commit and it becomes available.

**An agent says it isn't in the War Room.** It was removed, or its pane restarted — switching a pane's agent, shell or folder restarts it. Drag the pane back into the room.

**A message never arrived in a pane.** Look for the pill in the pane's corner or a `⏸N` badge on the room tab: it's being held because there's an unsubmitted line at that prompt. Press Enter, or click "Deliver now".

**A relative path isn't clickable after `cd`.** On PowerShell, relative paths stop resolving once you change directory — absolute paths (including everything agents print) still work. Bare file names without a `/` are never linked, to avoid false positives.

**The app disappeared.** Closing the window hides it to the tray. Click the tray icon to bring it back; use tray → Quit to exit for real.

---

## Known limits

- **Nothing is saved between launches** — workspaces, layouts and previews all start fresh. This is intentional for now.
- **One visual style.** VS Code Dark Modern only; a light theme is on the list.
- **War Room membership doesn't survive a pane restart.** Re-drag the pane.
- **The preview column has no devtools, zoom, multiple tabs, or per-terminal
  cookie isolation.** A page that fails to load shows your OS's default error
  page rather than a Swarmterm one.
- **No terminal search yet.**
- **Linux** paths are implemented but less thoroughly tested than Windows and macOS.

---

## Contributing & license

Swarmterm is free software under [GPL-3.0](LICENSE). Contributions are very
welcome — [`CONTRIBUTING.md`](CONTRIBUTING.md) covers setup, the test/CI
checklist, and how to propose features.

---

<sub>Working on Swarmterm itself? Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CLAUDE.md`](CLAUDE.md), and the release checklist in [`docs/manual-smoke-tests.md`](docs/manual-smoke-tests.md).</sub>
