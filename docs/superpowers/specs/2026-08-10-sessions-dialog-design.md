# Resume-sessions "Show all" dialog — design

Date: 2026-08-10. Status: approved via brainstorm (visual mockups, layout C).

## Problem

The Welcome composer's **Resume sessions** section shows at most
`VISIBLE_SESSION_ROWS` rows and expands inline via "Show all". Session titles
are full prompt sentences and the list can be long; the narrow Compose column
is a poor place to browse it, and there is no way to search. The user needs
both, equally: find one session fast by typing, and browse/tick many
comfortably.

## Decision history

A first implementation (2026-08-10, stacked layout: search → tabs → list,
filter state shared with the composer tabs) was reverted the same day. The
revert trigger was a transient dev-only rendering breakage (Vite/Tailwind HMR
corrupted `index.css` mid-session — global font loss and page offset), but the
redo was brainstormed properly with real-proportion mockups. The user picked
the **two-column layout (option C)** over a stacked dialog (A) and a
⌘K-style command palette (B).

## Design

**Trigger.** The "Show all (N)" button under the inline list (rendered only
when more rows exist than the cap) opens a modal dialog. The inline section
never expands in place; it stays capped at `VISIBLE_SESSION_ROWS`. Its
filter tabs and rows are unchanged.

**Dialog.** Centered modal, ~640×440 (max-width/height guarded for small
windows), dark backdrop, hand-rolled per `ClearWorktreeDialog`. The panel
carries `role="dialog"` + `aria-modal` so `overlay-watch` and
`terminal-focus` recognize it with zero extra wiring.

- **Left rail (~150px)** — "Agents" label, then All / Claude Code / Codex /
  OpenCode with per-agent counts. Zero-count agents are disabled. Rail
  selection is **dialog-local state**: it does NOT drive the composer's tabs
  (the shared-state variant surprised by leaving the section filtered after
  the dialog closed).
- **Right column** — search input on top (autofocused on every open, query
  cleared on every open), scrollable session list, footer.
- **Rows** — identical to the composer's rows via a shared `SessionRow`
  component: checkbox, agent icon, truncated title, relative time. When the
  12-pane cap is reached, un-ticked rows are disabled.
- **Footer** — left: `"N selected · M slots left"`; right: **Done** button
  (closes; ticks persist).
- **Selection** is the composer's `tickedSessions` set, passed down — the
  dialog is a bigger window onto the same selection, never a second one.
- **Search** filters by title, case-insensitive substring, trimmed; blank
  query = no filter. It composes with the rail (agent filter first, then
  text).
- **Empty search state** — centered muted text:
  `No sessions match "<query>" — try another keyword or agent.`
- **Close** — Esc, backdrop click, or Done. All keep the ticks. Changing the
  working folder closes the dialog and resets session state (existing
  effect).

**All UI copy is English** (repo rule; mockups used Vietnamese only as
annotation for review).

## Code plan

- `src/lib/agent-sessions.ts` — pure `searchSessions(sessions, query)` with
  Vitest cases first (TDD): blank/whitespace query returns input, substring
  case-insensitive match, trims query, no-match returns empty.
- `src/components/Welcome/SessionRow.tsx` — extract the row `<label>` used by
  both the inline section and the dialog.
- `src/components/Welcome/SessionsDialog.tsx` — the modal (rail + search +
  list + footer). Rail filter is internal `useState`; search query resets on
  open.
- `src/components/Welcome/Welcome.tsx` — drop `sessionsExpanded`, add
  `sessionsDialogOpen`; "Show all" opens the dialog; mount the dialog at the
  root of the returned tree. Composer tabs stay as-is (no shared
  `SessionFilterTabs` extraction — the dialog uses a rail, not pills).

## Testing

- Unit: the new `searchSessions` cases; full `npm test` + `npx tsc --noEmit`.
- Manual smoke happens on a **freshly reloaded app** (restart `tauri dev` or
  reload the window after the edits settle) — not on a hot HMR state after a
  burst of CSS-affecting edits, which is what produced the false "broken UI"
  alarm last time. The user drives the dialog live before anything is
  committed.

## Out of scope

- Arrow-key/Space list navigation (palette-style keyboarding) — YAGNI for a
  mouse-first picker; revisit on demand.
- Any change to session discovery, resume command building, or the 12-pane
  cap logic.
