# Manual smoke tests

Run this by hand before a release, or after touching pty, focus, War Room or
worktree code. Start with `npm run tauri dev`.

A longer scripted War Room scenario lives in [`war-room-demo.md`](war-room-demo.md).

## Basics

- [ ] Launch → one workspace, one terminal; run a command and see output.
- [ ] Split a pane horizontally and vertically; drag the separator; close a
      pane → the tree collapses.
- [ ] Drag a pane header onto another pane → the two swap, shells stay alive.
- [ ] Add / switch / rename / close / drag-reorder workspaces in the navbar.
- [ ] Composer: native folder picker returns the right path, recent folders
      work, agent steppers allocate correctly, the layout preview matches the
      result, `⌘/Ctrl + Enter` creates the workspace.
- [ ] Navbar terminal list: clicking an entry focuses that pane.
- [ ] Close the window → hides to tray (ptys stay alive); tray → Show restores;
      tray → Quit exits and kills every pty.
- [ ] Launch a second instance → only focuses the existing window.
- [ ] Custom titlebar renders; dragging it moves the window; edges resize
      (Windows/Linux — macOS uses native traffic lights).
- [ ] Minimize / maximize-restore toggle the right icon state (Windows/Linux).
- [ ] The close button hides to tray without quitting (Windows/Linux).

## Terminal

- [ ] **Truecolor:** run a 24-bit colour CLI → colours are exact, not
      downscaled to 256.
- [ ] **UTF-8:** print emoji, box drawing and accented text in a stream → no
      mojibake.
- [ ] **IME:** type Vietnamese with Telex (or a CJK IME) → no lost or duplicated
      characters; backspace deletes exactly one character, including NFD
      compositions.
- [ ] **Copy/paste:** with a selection `Ctrl/⌘+C` copies; with no selection
      `Ctrl+C` still sends SIGINT; `Ctrl/⌘+V` pastes exactly once.
- [ ] **File drop:** drop a file on a pane → the path is inserted, quoted for
      that pane's shell.
- [ ] **Shell switch:** pick another shell in the pane header → that pane
      respawns with it, other panes are untouched.
- [ ] **Keyboard focus:** click the titlebar / a tab / a pane header, then type
      immediately → characters reach the terminal; Tab triggers shell
      completion instead of walking the focus ring.
- [ ] **Activity dot:** lights while a pane streams output, clears when quiet.

## Terminal links

- [ ] URL: `echo https://example.com` → hover underlines it; a **plain click**
      opens the OS browser and does NOT open the in-app preview column.
- [ ] Drag-select that URL with the mouse → text selects, no browser opens.
- [ ] Absolute path: `ls $PWD/package.json` → plain click does nothing;
      `⌘/Ctrl + click` opens it in the editor.
- [ ] Relative path with line: `echo "src/lib/terminal-links.ts:15:1"` →
      `⌘/Ctrl + click` opens line 15. Then `cd src`, `echo
      "lib/terminal-links.ts:15"` → still resolves (bash/zsh; not PowerShell —
      see Known limits in the README).
- [ ] Non-existent path: `echo "src/lib/does-not-exist.ts:9"` → no underline,
      click does nothing.
- [ ] OSC 8 from an agent: run `claude` in a pane and have it read a file so it
      prints a path → `⌘/Ctrl + click` opens the right file.

## Broadcast and settings

- [ ] `⌘/Ctrl + Shift + B` enters broadcast; `Alt + Click` adds/removes panes;
      typing once reaches every group member; `Esc` exits.
- [ ] Settings → Terminal: changing font / size / line height / ligatures
      updates the preview and every pane.
- [ ] Settings → Keyboard Shortcuts lists the bindings for the current platform.
- [ ] `⌘/Ctrl + B` toggles the sidebar; `Esc` closes Settings.
- [ ] Restart the app → appearance and terminal preferences are remembered.

## Worktrees

- [ ] The "Isolate features in git worktrees" toggle is disabled for a
      non-repository folder (and for a repo with no commits yet).
- [ ] Toggle on + create a workspace with 3 Claude panes → 3 worktree
      directories exist next to the repo, 🌿 badges appear immediately without
      typing a prompt.
- [ ] Broadcast one prompt to the 3 panes → 3 separate, clean diffs on 3
      branches in the Git tab.
- [ ] `worktree.remove` refuses a worktree with uncommitted changes; commit and
      retry → the directory is removed.
- [ ] Create a workspace with the toggle OFF, call `worktree.spawn` → fails with
      "worktree isolation is not enabled".
- [ ] Closing a pane or workspace does NOT delete any worktree.

## Web preview

- [ ] Two panes, each agent opens a different URL via `browser.open_preview` →
      clicking between panes swaps the page correctly.
- [ ] An agent in a NON-focused pane calls the tool → the current view is not
      stolen.
- [ ] A pane with no preview shows the empty state; typing a URL in the address
      bar creates the preview for that pane only.
- [ ] A second tool call navigates the existing preview; back/forward work; no
      extra preview is created.

## War Room — basics

- [ ] Drag two agent panes into the War Room tab → member chips appear and an
      intro is typed into each pane.
- [ ] **Probe:** agent A sends a probe → the transcript shows it, idle agent B
      is nudged and reads its inbox.
- [ ] **Execute:** agent A sends execute → the prompt runs in pane B and the
      transcript marks it orange.
- [ ] **Revocation:** drag a chip out or press ✕ → the next tool call from that
      pane is refused with "not in the War Room".
- [ ] **PTY death:** close a member pane → the transcript logs the leave and
      `list_peers` shows no ghost.

## War Room — moderator and typing guard

- [ ] Broadcast a probe from the composer → both panes are nudged; the
      transcript shows one `Moderator → everyone` group with a crown avatar.
- [ ] Direct probe to one member → only that pane is nudged.
- [ ] Switch to Execute → the `Everyone` row disappears, the input turns orange;
      sending a short prompt pastes and runs it in that pane only.
- [ ] An agent sends to `__moderator__` → the reply lands in Discussion and
      nothing is typed into any pane.
- [ ] An agent sends `mode: "execute"` to `__moderator__` → rejected.
- [ ] Type half a line into pane A without Enter, then probe pane A from the
      composer → nothing is typed, the half line is intact, the pill appears in
      pane A, and the Members sub-tab shows `⏸1`.
- [ ] Press Enter in pane A → the nudge arrives right after.
- [ ] Repeat, then click the pill instead → delivered immediately.
- [ ] Repeat, then click into pane B → pane A's pill stays. An unsubmitted line
      holds regardless of focus.
- [ ] Close pane A while a delivery is held → no stray text, no orphan badge.

## War Room — multiple rooms

- [ ] Launch → one "War Room" tab; drag a pane into the panel body → it joins
      that room and the intro names it.
- [ ] `+` creates "Website B"; drag a second pane straight onto the B tab → it
      joins B and the first room is untouched.
- [ ] `war_room.list_peers` from each pane shows only same-room peers, with the
      correct `room` name.
- [ ] Broadcast in room A → room B's transcript receives nothing.
- [ ] Drag a member chip from A onto tab B → A logs Leave, B logs Join
      (pending), the intro is retyped, and the next tool call reconnects.
- [ ] Double-click a tab → rename inline; composer and transcript update at once.
- [ ] Press ✕ on a room with members → two-step confirm → members disconnect,
      the tab disappears, the active room falls back to a remaining one.
- [ ] With only one room left → its tab has no ✕.
- [ ] While viewing room A, queue a message into a pane being typed in in room B
      → tab B shows `⏸N`.

## Claude Code status line

- [ ] Open a workspace with a Claude Code agent pane. Within a few seconds of
      the first prompt the line under the input box reads
      `mcp ✓  ·  ctx <n>k/<n>k <n>%`.
- [ ] A fresh Claude session reads `ctx —` until its first reply.
- [ ] In a plain Terminal pane run `claude --strict-mcp-config` → `mcp …`:
      Claude is alive but never called our server.
- [ ] With a Claude pane running, quit Swarmterm from the tray (Quit, not
      close-to-tray) → the next render reads `mcp ✗`.
- [ ] Run `claude` in a system terminal → the `mcp` segment is absent, only
      `ctx …` renders.
- [ ] Let a session pass 70% context → the `ctx` segment turns amber; past 90%
      → red.
- [ ] Settings → Terminal → Agent status line → off. `statusLine` is gone from
      `~/.claude/settings.json` and every other key survived. Toggle back on →
      it returns, pointing at the current binary.
- [ ] Put your own `statusLine` in `~/.claude/settings.json`, relaunch
      Swarmterm → it is untouched (a warning is logged to the devtools console).
- [ ] Switch a pane's agent (respawns the pty under the same id) → the line
      drops to `mcp …` until the new Claude connects.

## Session resume (composer)

- [ ] Pick a folder with prior Claude Code activity → "Resume sessions" lists
      them, newest first, with agent icon and relative time.
- [ ] Tick one + Create → the new pane runs `claude … --resume <id>` and the
      old conversation is visible.
- [ ] Folder with no sessions → no "Resume sessions" section, composer
      otherwise unchanged.
- [ ] Uninstall/rename an agent CLI → its sessions disappear from the list.
- [ ] Worktree toggle ON + a ticked session → stepper panes get worktrees,
      the resume pane spawns at the session's original folder.
- [ ] Switch agent on a resume pane via the header dropdown → pane respawns
      fresh (no --resume in the typed command).
