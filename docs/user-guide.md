# Swarmterm user guide

Everything the [README](../README.md) summarises, in detail: workspaces and panes,
running several agents at once, worktree isolation, the web preview, the War Room,
settings, keyboard shortcuts, troubleshooting and current limits.

## Create a workspace

Swarmterm opens on the **composer**: pick a folder (the working directory for every pane), choose how many terminals, and use the steppers to assign AI agents — **Claude Code**, **Codex**, **OpenCode**, **GitHub Copilot**, **Qwen Code**, **Amp**, **Gemini CLI**, **Cursor Agent**, **Antigravity** or **OMP (Oh My Pi)** — the rest stay plain shells. Agents whose CLI isn't installed show up greyed out. Turn on **Isolate features in git worktrees** for parallel work, then press `⌘/Ctrl + Enter`.

Agent detection re-runs every time the composer opens, so installing a CLI needs no restart. Swarmterm keeps **no workspace state between launches** — every start is a clean slate (Settings do persist).

## Panes

- **Split** from the pane header, drag the separator to resize, and drag a header onto another pane to swap the two — shells keep running.
- Closing a pane closes the gap; closing the last pane closes the workspace.
- The left navbar lists workspaces (add, rename, reorder) and the current workspace's terminals — click one to jump to it. `⌘/Ctrl + B` hides the sidebar.
- A pane can switch to a different agent, shell or folder from its header menu — note this restarts the shell.

## Running several agents at once

- **Activity dots** light up while a pane produces output, so you can see who is working — for agent panes this becomes the richer [agent state dot](#agent-state-dots) instead (every agent except OMP, which keeps the plain dot).
- **Broadcast input** — `⌘/Ctrl + Shift + B`, then `Alt + Click` panes into the group and type once; every pane receives the same keystrokes ("now run the tests" × 5). `Esc` leaves.
- A badge counts War Room messages queued for a pane that is busy.

## Agent state dots

An agent pane shows a coloured dot instead of the plain activity dot: **red** — the agent is blocked and needs your input (a permission prompt, a question); **yellow** — it's working; **green** — it finished while you were looking elsewhere, and clears the moment you focus that pane; **no dot** — idle, nothing to report. Right after a pane spawns (and again if the agent process exits) state is briefly unknown, so it falls back to the plain output-activity dot until detection catches up. Plain Terminal panes always use that plain dot — they never get colours. One known limit: **OMP** panes also keep the plain dot — its screen exposes no reliable state signals, so Swarmterm doesn't guess.

**Claude Code** panes also receive exact signals from Claude's own hooks, not just from reading the screen. At every launch Swarmterm merge-writes `swarmterm --hook` entries into `~/.claude/settings.json` (the same file as the status line; additive — hooks you already have are never touched). That makes a permission prompt turn the dot red the instant it appears and a finished reply clear it at once, while screen reading still fills the gaps — for example a question Claude asks without a permission prompt.

A workspace tab in the navbar rolls this up across all its panes and shows the highest-priority dot — blocked beats done, done beats working, working beats plain activity — but only while that tab is **inactive**; the tab you're looking at never needs a dot. War Room member rows show the same coloured dot, or a muted grey dot labelled "Connected, idle" when a member has nothing to report.

The sidebar header also shows a small counter across **all** workspaces — a red pill for blocked panes and a green one for panes that finished while you were away. Hover any dot to see how long the pane has been in that state ("Blocked for 4m — needs your input"), and hover the red pill to see the longest wait among them. Click a pill, or press `⌘/Ctrl + Shift + J`, to jump to the next pane that needs you: blocked panes first — the one that has waited longest ahead of the rest — then finished (earliest first), then working, then idle in sidebar order, cycling on repeat presses (and switching workspaces when needed). Landing on a finished pane marks it seen, so the green count drops as you go. Hiding the sidebar hides the counter; the shortcut keeps working.

## Notifications

A background agent pane chimes when it blocks (needs your input) or finishes — a short WebAudio tone, so you don't have to keep watching the dots. The chime fires about a second after the state change, and Swarmterm re-checks at that moment: a blocked flash that resolves itself, or a pane you've since switched to, never sounds. Several panes changing within about half a second share one chime and one banner — a pane that needs your input wins the tone, and the banner lists them ("Claude Code needs your input · Codex finished", "2 Claude Code panes finished").

A system notification (banner) only appears while the Swarmterm window is **unfocused** — it's sent silent, since the chime is already the audible part; focus the window and you get the chime alone. macOS asks for notification permission the first time a banner would show, and declining it still leaves the chime working.

Turn channels on or off in **Settings → Notifications**: **Sound** and **System notifications** apply everywhere, and a **per-agent** toggle below silences one CLI without touching the others — every agent with a state dot gets a row, and all default to on. A plain Terminal pane has no agent state, but once its shell has **shell integration** set up (see below) it chimes the same way when a command that ran for more than 10 seconds finishes while you were elsewhere — the banner reads "Command finished (42s)" or "Command failed (exit 1 · 42s)" — and the **Terminal** row in the per-agent list turns that off.

## Resume past agent sessions

Picking a working folder also lists that folder's recent Claude Code, Codex, OpenCode and Qwen Code sessions, read from each CLI's own history (never modified). Tick any of them — each reopens as an extra pane, right where the conversation left off. Tabs filter by agent, and "Show all" opens a searchable dialog over the full list.

## Worktree isolation

With the composer toggle on, every agent pane is created **inside its own worktree** at `<repo>.worktrees/<name>` on a fresh `swarm/<agent>-<n>` branch — separate diffs from the very first edit. Plain Terminal panes stay at the repo root; a folder that isn't a git repository yet is initialised with a first commit for you. Worktree panes carry a 🌿 badge.

Two rules protect your work: closing a pane or workspace **never deletes a worktree**, and a worktree with **uncommitted changes cannot be removed** — not by you, not by an agent. Once a branch is merged, clean up with **Clear worktree** in the pane menu or let an agent do it.

## The Git panel

The **Git** tab in the right panel shows, for the focused pane: its worktree and branch (and which agent owns each branch), changed files with an inline diff, and how many commits it is ahead of the main line. It follows your focus between panes and refreshes itself when an agent working in that worktree finishes, pauses for input, or exits (a command typed by hand in a plain Terminal pane counts too once that shell has **shell integration** set up — see below; otherwise use the ↻ button). For a worktree branch, a footer line also tells you whether it **merges cleanly into the main branch** or lists the conflicting files, plus how many commits it is behind — a dry run that never touches your files (needs git ≥ 2.38).

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

Deliveries never interrupt you: if the target pane has a half-typed — or pasted but not yet sent — command, the message is **held** — a pill in the pane, `⏸N` on the room tab — retries by itself once the pane is free, and "Deliver now" releases it immediately. The same hold applies while the agent is still working or is waiting on a permission/question prompt (so a delivery can never answer a prompt for you); those holds release on their own once the agent is idle and have no "Deliver now". Held messages are never dropped.

Drag a member chip out (or press its `✕`) and the agent instantly loses access. Closing a pane removes it automatically — and so does restarting one (switching its agent, shell or folder); just drag it back in.

A full walkthrough — Claude Code and Codex negotiating an API contract — is in [`war-room-demo.md`](war-room-demo.md).

## Status line in Claude Code panes

Every Claude Code pane gets a one-line readout under its prompt:

```
mcp ✓  ·  ctx 84k/200k 42%
```

The left half tells you whether Claude actually connected to Swarmterm — and therefore has the War Room and worktree tools: `✓` connected, `…` never reached Swarmterm (tools missing), `✗` Swarmterm no longer answering. The right half is the session's context window — tokens used, limit, percentage — amber past 70 %, red past 90 %.

Toggle it in **Settings → Terminal**. Swarmterm merge-writes the entry into `~/.claude/settings.json` and never touches a status line you already have.

The pane header mirrors the percentage as a small `ctx 63%` chip (same amber / red bands) once the first reply lands, so you can compare panes without reading each status line. It needs the status line enabled — that is where the number comes from — and disappears on `/clear`, when `claude` exits, and on very narrow panes.

## Terminal essentials

- **Real PTYs with 24-bit truecolor** — agent CLIs, emoji and box drawing render exactly as in your normal terminal, and IMEs (Vietnamese Telex, CJK) work without dropped characters.
- `⌘/Ctrl + C` copies when text is selected and otherwise interrupts; `⌘/Ctrl + V` pastes — like VS Code.
- **Programs can copy to your clipboard** — nvim `"+y`, tmux `set -s set-clipboard on`, yazi and `gh` copy through OSC 52, exactly as in VS Code's terminal. Only writes are honoured: a program can never read your clipboard.
- **Click a URL** to open it in your browser; `⌘/Ctrl + click` a file path (`src/foo.ts:42:9`, `src/foo.ts(42,9)`, `File "x.py", line 42`) to open it in your editor at that line. Nothing is ever opened with the OS default app, so a mis-click on a `.sh` or `.exe` can never run it.
- **Drop a file or folder** onto a pane to insert its path, quoted for that pane's shell.
- **Choose your shell** — PowerShell, cmd, PowerShell 7, Git Bash on Windows; zsh, bash, fish on macOS/Linux — per pane, or as a default in Settings.

## Shell integration

A plain Terminal pane has no agent, so Swarmterm cannot tell when a command you typed has finished — unless your shell says so. If it emits the standard **OSC 133** prompt marks (the same ones VS Code, WezTerm, Ghostty, kitty and Windows Terminal read), Swarmterm follows each command from prompt to exit and uses that to refresh the **Git panel** when a command finishes inside the selected worktree — a hand-typed `git commit` shows up just like an agent's — and to notify you when a command that ran for more than 10 seconds finishes in a pane you weren't watching (see §Notifications). Nothing is injected into your shell: add the snippet for yours, guarded so it only runs inside Swarmterm (`SWARMTERM_SESSION` is set in every pane). If you already use another terminal's shell integration that emits these marks, there is nothing to add.

**zsh** (`~/.zshrc`)

```zsh
if [[ -n $SWARMTERM_SESSION ]]; then
  __swarmterm_precmd()  { printf '\033]133;D;%s\a\033]133;A\a' "$?"; }
  __swarmterm_preexec() { printf '\033]133;C\a'; }
  precmd_functions+=(__swarmterm_precmd)
  preexec_functions+=(__swarmterm_preexec)
fi
```

**bash** (`~/.bashrc`; bash ≥ 4.4 for `PS0`)

```bash
if [[ -n $SWARMTERM_SESSION ]]; then
  __swarmterm_prompt() { printf '\033]133;D;%s\a\033]133;A\a' "$?"; }
  PROMPT_COMMAND="__swarmterm_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
  PS0='\[\e]133;C\a\]'"$PS0"
fi
```

**fish** (`~/.config/fish/config.fish`)

```fish
if set -q SWARMTERM_SESSION
    function __swarmterm_prompt --on-event fish_prompt
        printf '\e]133;A\a'
    end
    function __swarmterm_preexec --on-event fish_preexec
        printf '\e]133;C\a'
    end
    function __swarmterm_postexec --on-event fish_postexec
        printf '\e]133;D;%s\a' $status
    end
end
```

**PowerShell 7** (`$PROFILE`; the least-tested of the four — `cmd.exe` has no equivalent)

```powershell
if ($env:SWARMTERM_SESSION) {
  $global:__swarmtermPrompt = $function:prompt
  function global:prompt {
    $code = [int](-not $?)
    "$([char]27)]133;D;$code`a$([char]27)]133;A`a" + (& $global:__swarmtermPrompt)
  }
  Set-PSReadLineKeyHandler -Key Enter -ScriptBlock {
    [Console]::Write("$([char]27)]133;C`a")
    [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
  }
}
```

The marks are `A` (prompt drawn), `C` (command started) and `D;<exit>` (command ended); `B` (end of prompt) is optional and omitted above. The very first prompt's `D` is ignored, and a machine you `ssh` into without the snippet simply sends nothing until you are back.

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

Every pane is automatically connected to the app over MCP for exactly as long as it lives — nothing to configure for Claude Code, Codex and Qwen Code, which Swarmterm enrolls automatically; other MCP-capable CLIs can be pointed at the per-pane URL by hand (the War Room panel shows the hint). Enrolled agents can drive Swarmterm themselves: **open a web preview** beside their own pane, **spawn / list / remove worktrees** to hand tasks to fresh parallel agents (removal refuses uncommitted changes), and use the **War Room** — list peers, message them in probe or execute mode, read their inbox and reply, wait for a peer to need input or finish (`wait_peer`) and peek at what its screen shows (`read_peer`). An execute hand-off to a peer that is sitting on a prompt is refused until that prompt is answered — the sender is told to wait first.

War Room abilities only work for panes you dragged into a room, worktree abilities only in workspaces with isolation enabled — and removing a pane from a room revokes its access instantly.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + B` | Show or hide the sidebar |
| `⌘/Ctrl + Shift + B` | Toggle broadcast input |
| `Alt + Click` | Add or remove a pane from the broadcast group |
| `Esc` | Leave broadcast mode · close Settings |
| `⌘/Ctrl + Enter` | Create the workspace from the composer |
| `Shift + Enter` | Insert a line break in supported terminal apps and agent prompts |
| `⌘/Ctrl + C` · `⌘/Ctrl + V` | Copy (when text is selected) · paste |
| `⌘/Ctrl + Click` | Open a file path in your editor, at that line |
| `⌘/Ctrl + F` | Find in the focused terminal · press again to re-select the query · `Esc` closes it |
| `⌘/Ctrl + Shift + J` | Jump to the next pane needing attention (longest-waiting blocked → done → working → idle) |

On macOS the modifier is `⌘`, which deliberately leaves `Ctrl + B` to the terminal for tmux.

## Troubleshooting

- **An agent is greyed out in the composer** — its CLI isn't on your `PATH`; install it and reopen the composer.
- **A War Room message never arrived** — look for the pill in the pane or `⏸N` on the room tab: it's held behind an unsubmitted prompt line, or the agent is working / sitting on a prompt (the pill says which). Press Enter or click "Deliver now" for a typing hold; answer the prompt or wait for the agent to finish otherwise.
- **An agent says its execute was refused** — the target pane is blocked on a permission or question; answer that prompt (or let the sending agent `wait_peer`) and the hand-off goes through on re-send.
- **A War Room send was refused for a "control character"** — the message contained an escape code or other terminal control byte, which Swarmterm never types into a pane (it could break out of the paste and run as keystrokes). Resend as plain text; quote escape sequences as the literal text `ESC[…` instead.
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
- **Claude Code hooks are written at every launch** — the `swarmterm --hook` entries in `~/.claude/settings.json` are re-checked on each boot (no write when nothing changed; your own hooks are left alone).
- **`claude` started by hand in a plain Terminal pane gets no coloured dot** — only panes created as Claude Code agents are wired to the hooks.
- **After Esc (interrupt) a Claude Code pane can read "working" for up to 30 s** — Claude fires no Stop hook on an interrupt, so the working signal has to time out before screen reading takes over again.
- **Find widget with regex on shows "Invalid regex" while you type** — a pattern that does not parse yet (for example `foo(`) reads **Invalid regex** in the counter and clears the previous highlights until the pattern is valid again. Toggle regex off to search it as literal text.
- **Any program in any pane can overwrite the clipboard via OSC 52** — like VS Code, there is no per-pane gate. Reads are refused and empty writes never clear it; copies larger than 1 MiB are ignored.
- **Shell integration is opt-in** — a hand-typed command in a plain Terminal pane is only noticed if that shell emits OSC 133 marks (§Shell integration). Nothing is injected, `cmd.exe` cannot do it, and an interrupted command that redraws the prompt without a `D` mark is simply forgotten.
