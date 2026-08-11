<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.png">
  <img src="docs/images/logo-light.png" alt="Swarmterm" width="96" height="96">
</picture>

# Swarmterm

**One window for a whole swarm of AI coding agents.**

Real split terminals, one git worktree per agent — and an app your agents can drive themselves.

<!-- IMAGE: replace with docs/images/hero.gif (a ~20s tour beats a still — see docs/images/README.md) -->
<img src="https://placehold.co/1600x900/1e1e1e/6b7280/png?text=Demo" alt="Swarmterm demo" width="100%">

[<a href="#install--run">Install</a>] [<a href="docs/user-guide.md">User guide</a>] [<a href="docs/war-room-demo.md">War Room demo</a>] [<a href="CONTRIBUTING.md">Contributing</a>]

[![Tauri 2](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Platforms](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-6b7280)](#install--run)
[![Status](https://img.shields.io/badge/status-pre--1.0-f97316)](#status)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

<sub>Screenshots are placeholders until real ones land — the shot list is in <a href="docs/images/README.md"><code>docs/images/README.md</code></a>.</sub>

</div>

---

## What it is

Running **one** coding agent in a terminal works anywhere. Running **five** is where ordinary terminals fall apart: tabs hide who is doing what, agents trample each other's edits, and you become the relay pasting prompts and URLs between windows.

Swarmterm is a native desktop app (Tauri 2 + Rust, real PTY terminals, a VS Code-flavoured interface) built around three ideas:

**See the whole swarm.** A workspace is one window of real split terminal panes — live titles, an activity dot on any pane still producing output, and broadcast typing for when five agents should hear the same thing at once.

**Keep the work separate.** Flip one switch and every agent pane is born inside its own git worktree, on its own branch — separate, reviewable diffs from the very first edit, with a git panel to read them without leaving the app.

**Agents are users of the app, too.** Every pane is connected to Swarmterm itself, so agents don't just run *in* it: they put a live web preview beside their own pane, spin up isolated worktrees to delegate subtasks, and discuss work with each other — with you moderating.

Everything else hangs off those three ideas. The full tour — panes, broadcast, session resume, the web preview, the War Room, the status line, shortcuts, troubleshooting — lives in **[the user guide](docs/user-guide.md)**.

---

## Install & run

No prebuilt downloads yet — run it from source:

```bash
git clone https://github.com/duongducnguyen/swarmterm.git
cd swarmterm
npm install
npm run tauri dev                    # develop / just use it
npm run tauri build                  # installer / app bundle
```

You need **Node.js 18+** (npm 10+) and a stable **Rust** toolchain from [rustup.rs](https://rustup.rs), plus per platform:

- **Windows** — [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (usually preinstalled) and Microsoft C++ Build Tools.
- **macOS** — Xcode Command Line Tools: `xcode-select --install`.
- **Linux** — `webkit2gtk-4.1`, `librsvg`, `libayatana-appindicator3`, `build-essential` — see [Tauri prerequisites](https://tauri.app/start/prerequisites/).

Install whichever agent CLIs you plan to use (`claude`, `codex`, `opencode`) — anything missing just appears disabled. The first build compiles the Rust side and takes a few minutes; later runs are fast.

---

## First run

Swarmterm opens on the composer: pick a folder, choose how many terminals, assign **Claude Code**, **Codex** or **OpenCode** to some of them, switch on **Isolate features in git worktrees**, and press `⌘/Ctrl + Enter`. Your panes open with the agents already starting up; the right panel gives you the web preview, the git view, and the War Room.

Two things worth knowing up front: **nothing is saved between launches** (a clean slate every start is deliberate — Settings do persist), and **closing the window hides the app to the tray** with everything still running; tray → **Quit** is what actually exits.

From here, the **[user guide](docs/user-guide.md)** covers the rest.

---

## Status

Pre-1.0 and moving fast, but already a daily driver for parallel agent work on Windows and macOS. Honest reasons to wait:

- you want workspaces to **survive a restart** — nothing persists between launches yet, by design;
- you need a **light theme** or **terminal search** — neither exists yet;
- you're on **Linux** — implemented, but the least-tested platform.

The full list lives in the guide's [known limits](docs/user-guide.md#known-limits).

---

## Contributing & community

Bug reports and questions are welcome in [issues](https://github.com/duongducnguyen/swarmterm/issues); [`CONTRIBUTING.md`](CONTRIBUTING.md) covers setup, the test/CI checklist, and how to propose features — design discussion happens in an issue first for anything non-trivial. Swarmterm is free software under [GPL-3.0](LICENSE).

---

<sub>Built on <a href="https://tauri.app">Tauri</a>, <a href="https://xtermjs.org">xterm.js</a> and <a href="https://github.com/wez/wezterm/tree/main/pty">portable-pty</a>; interface styled after VS Code. Working on Swarmterm itself? Start with <a href="CONTRIBUTING.md"><code>CONTRIBUTING.md</code></a>, <a href="CLAUDE.md"><code>CLAUDE.md</code></a>, and the release checklist in <a href="docs/manual-smoke-tests.md"><code>docs/manual-smoke-tests.md</code></a>.</sub>
