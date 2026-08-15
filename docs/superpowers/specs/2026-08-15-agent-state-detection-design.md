# Agent State Detection (Đ1) — Design

Date: 2026-08-15
Status: approved (approach A — TypeScript port of herdr's detection engine semantics)

## Goal

Swarmterm currently shows only a raw output-activity dot (yellow while the pty
streams bytes). It cannot tell the difference between an agent that is
*working*, one that is *blocked on a permission prompt*, and one that *finished
and is waiting for you*. This feature detects four user-facing states for agent
panes — **blocked / working / done / idle** — and surfaces them as per-pane
dots, a workspace-level rollup, and a "done until you look" seen-bit.

Detection rules are ported from herdr (Apache-2.0,
`/Volumes/Woware/Projects/research/herdr`, engine `src/detect/manifest.rs`,
manifests `src/detect/manifests/*.toml`, manifest engine version 3). Porting
Apache-2.0 → GPL-3.0 is one-way compatible; derived files carry an attribution
header (see Licensing).

## States and derivation

Engine states (what rules can produce): `working`, `blocked`, `idle`,
`unknown`. **`done` is not an engine state** — it is a UI derivation:
`state === 'idle' && !seen`.

- `seen` starts `true`. Any publish of a non-idle state sets `seen = true`.
- A **completion transition** — `working|blocked → idle` — sets `seen = false`
  (i.e. "done") *unless* the pane is currently the focused pane of the active
  workspace and the app window has focus. `unknown → idle` is deliberately
  excluded: `unknown` only occurs at spawn/respawn/exit, and a freshly
  spawned or respawned agent settling to idle must not read as "done".
- `seen` flips back to `true` (done → idle) when the pane becomes the focused
  pane of the active workspace: on `setFocusedLeaf`, on workspace switch, and
  on window refocus.

Attention priority for rollups and sorting: `blocked(4) > done(3) >
working(2) > idle(1) > unknown(0)`.

## Architecture

Everything runs in the renderer. No Rust changes in Đ1 (the M2 orchestrator
verbs will add a state-report invoke later; Đ2/Đ3 consumers are all
renderer-side already).

```
xterm buffer + OSC ──► snapshot/osc capture ──► engine (pure) ──► debounce ──► agent-state-store ──► dots/rollup UI
        ▲                    (registry)          lib/agent-state       (pure)         (zustand)
        └── content-seq bump on each pty chunk; 300ms tick timer per agent pane
```

### New modules — `src/lib/agent-state/` (pure, TDD, one `*.test.ts` each)

- **`types.ts`** — `AgentEngineState`, `DisplayState`, `DetectionInput { screen, oscTitle, oscProgress }`, rule/gate/manifest types.
- **`regions.ts`** — region extractors over a snapshot string:
  `whole_recent`, `bottom_non_empty_lines(N)` (suffix **from** the Nth-from-last
  non-empty line, blanks included), `top_non_empty_lines(N)`,
  `after_last_horizontal_rule` (rule = trimmed line, leading `─` run ≥1 and
  remainder empty, or run ≥3), `prompt_box_body` (between the 2nd-from-bottom
  horizontal rule and the next rule below), `after_last_prompt_marker`
  (Codex `›` prompt marker — port semantics from herdr `manifest.rs:1357-1422`),
  plus the two non-screen regions `osc_title` / `osc_progress` resolved from
  `DetectionInput`.
- **`engine.ts`** — rule evaluation, herdr-compatible:
  - Every rule evaluates against its own region; **highest `priority` wins**,
    ties go to the **first rule in manifest order** (incumbent kept when
    `prev.priority >= rule.priority`).
  - Within a gate, ALL matcher groups AND together: `contains` (ALL needles,
    **case-insensitive**), `regex` (all patterns, **case-sensitive**, matched
    anywhere), `line_regex` (each pattern must match ≥1 line), `all[]`,
    `any[]` (≥1 if non-empty), `not[]` (fail if any matches). Gates nest.
  - `skip_state_update: true` on the winning rule ⇒ the whole tick is
    discarded (no publish) — this is the transcript-viewer freeze.
  - `visible_idle` / `visible_blocker` / `visible_working` flags are reported
    only when the winning rule sets them and the state agrees.
  - No rule matched ⇒ `idle` (agent is always known here).
- **`manifests/claude-code.ts`, `manifests/codex.ts`, `manifests/opencode.ts`** —
  rule data ported from herdr's `claude.toml` / `codex.toml` / `opencode.toml`
  (keep herdr's `version` string in a comment for future re-sync). Regex
  translation Rust → JS: `\x{2733}` → `\u{2733}` with the `u` flag; inline
  `(?i)`/`(?m)`/`(?s)` → RegExp flags; `\A` → `^` without `m`. Manifests are
  typed TS data — compile-time checked, no runtime validation layer needed.
- **`pending-idle.ts`** — asymmetric debounce, pure + timer-free (caller
  passes timestamps): entering blocked/working/anything publishes
  **immediately**; only `working → plain idle` is held — 3 consecutive
  confirmations at the 100ms recheck cadence (~300ms), hard cap 700ms, and
  bypassed entirely when the idle is `visible_idle`, when `visible_blocker`
  is set, on agent change, or on process exit.
- **`detect-schedule.ts`** — pure tick decisions: spawn grace (skip screen
  detection for 3s after spawn/respawn/retry), skip-screen-scan when
  `state === idle` and the content-seq is unchanged, publish-only-on-change.
- **`snapshot.ts`** — builds the detection snapshot from a line-provider
  interface (`{ rows, lineCount, getLine(i) }` — adapter over
  `term.buffer.active` lives in the detector): last `rows` lines anchored at
  the **bottom of the full buffer** (scrollback included — user scrolling
  never moves the window), each line `trimEnd()`ed, trailing blank lines
  dropped, joined with `\n`.
- **`rollup.ts`** — `rollupDisplayState(states: DisplayState[])` by the
  attention priority above; used by workspace tabs (precedent:
  `activity-selectors.ts::anyLeafActive`).
- **`detector.ts`** — the per-terminal controller (thin, not unit-tested
  beyond its pure parts): 300ms tick while an agent pane is live, 100ms while
  a pending-idle hold is open; reads OSC evidence + snapshot, runs engine +
  debounce, publishes to the store. Created only for panes whose `agentId` is
  an agent template (`claude-code`, `codex`, `opencode`) — never for
  `terminal` panes.

### New store — `src/store/agent-state-store.ts`

`byId: Record<terminalId, { state: AgentEngineState; seen: boolean }>` with
`publish(id, state, opts)`, `markSeen(id)`, `clear(id)`. Display-state
selector derives `done`. Follows the `terminal-activity-store` pattern
(runtime state outside the layout tree, keyed by terminalId, cleared on
dispose).

### Integration points (existing files)

- **`terminal-registry.ts`**:
  - `AttachConfig` gains `agentId?: string`; `TerminalPane` passes
    `leaf.agentId`.
  - A second `onTitleChange` listener captures the **raw** title for
    detection (strip control chars, cap 256 chars, NO whitespace collapse —
    the existing title-store listener keeps its cosmetic normalization).
  - `term.parser.registerOscHandler(9, …)` records the OSC 9 payload
    (progress, e.g. `4;0;…`) as detection evidence.
  - The session `write` sink bumps the detector's content-seq alongside
    `activityTracker.notify(id)`.
  - `disposeTerminal` disposes the detector and clears the store entry;
    `respawnTerminal`/`retryTerminal` reset detection (state → `unknown`,
    OSC evidence cleared, 3s grace re-armed).
- **Focus / seen-bit**: `markSeen` fires where pane focus is already decided —
  `setFocusedLeaf`, workspace activation, and window refocus (App.tsx already
  handles the latter two for keyboard focus).

## UI

- **`StateDot`** component (sibling of `ActivityDot`): blocked = red
  (`#F14C4C`), done = green (`#23D18B`), working = the existing yellow, idle =
  no dot. Blocked and done are steady; working may pulse like today's
  activity dot.
- **`Navbar/TerminalList`**: agent panes render `StateDot` from the display
  state; `terminal` panes keep the existing output-activity `ActivityDot`.
  While an agent pane's state is `unknown` (startup grace, agent exited), fall
  back to the output-activity dot so early output still shows life.
- **`WorkspaceTabs`**: per-workspace rollup dot — the highest-priority display
  state across the workspace's agent panes, merged with the existing
  any-leaf-active yellow for plain panes (blocked/done/working win over plain
  yellow; idle-only workspaces show nothing).
- **`WarRoom/MembersTab`**: agent members upgrade to `StateDot` the same way.

## Error handling

- No agent identified / plain shells: no detector at all — zero cost.
- Rules fail toward `idle`; nothing ever guesses `blocked` (herdr's
  false-positive stance: narrow regions, not-gates, anchors — preserved in the
  ported rules).
- Manifest regexes are constructed at module load; a bad translation fails
  the unit suite, not the runtime.
- Detector ticks are wrapped so an engine exception logs once and degrades to
  the old activity behavior, never breaking the terminal.

## Performance

- Steady-state idle with no output: the tick skips the screen read entirely
  (content-seq unchanged) — no buffer text materialized.
- Snapshot is ≤ `term.rows` lines (translateToString on ~24-50 lines every
  300ms only while output flows — comparable to what the WebGL renderer
  already does per frame).
- Store publishes only on actual state/seen changes.

## Testing

- TDD for every `lib/agent-state/*` module. Manifest tests use hand-written
  screen fixtures per state per agent (Claude permission prompt, Claude
  prompt box `❯`, Codex `Action Required` title, Codex working spinner title,
  OpenCode `△ Permission required`, transcript viewers, etc.) asserting the
  winning state — these double as regression armor when re-syncing rules from
  herdr.
- `npm test` + `npx tsc --noEmit` green before done; manual smoke = run each
  of the three agents, verify dot transitions + rollup + seen-bit.
- Update `docs/user-guide.md` (state dots section) and
  `docs/manual-smoke-tests.md` (a short Đ1 checklist).

## Licensing

Manifest rule data and engine semantics are derived from herdr
(Apache-2.0). Each derived file carries a header: origin repo, file, herdr
manifest version, Apache-2.0 notice, and a note that the file is modified.
`THIRD-PARTY-NOTICES.md` at the repo root records the herdr attribution once.

## Out of scope (later backlog items)

- OS notifications / sounds (Đ3) — including herdr's 800ms blocked re-publish
  refresh, which only matters for notifications.
- War Room hold-when-blocked / true-idle nudge (Đ2).
- Rust-side state bridge for MCP orchestrator verbs (M2).
- Any persistence of states across launches (app philosophy: none).
