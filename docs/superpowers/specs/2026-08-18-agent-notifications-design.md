# Agent Notifications (Đ3) — Design

Date: 2026-08-18
Status: approved (App-side store subscriber, pure rules in `lib/`, WebAudio chimes)

## Goal

Đ1 gave agent panes a detected state (blocked / working / done / idle) surfaced
as dots and a navbar rollup — but you only see those if you are looking at the
window. Đ3 adds the "not looking" channel: when a **background** agent pane
transitions to **blocked** (needs your input) or completes to **done**, play a
short chime, and — if the app window itself is unfocused — also post an OS
notification. The dots remain the primary UI; notifications are a best-effort
augmentation and every failure path is silent.

Decisions locked with the user:

- **Channel policy:** chime whenever the pane is not being watched (even if the
  app window is focused, e.g. another workspace); OS banner **only** when the
  app window is unfocused at fire time. No banner while you are inside the app.
- **Sound source:** synthesized with WebAudio (no bundled asset, no license,
  works without OS notification permission). OS banners are sent silent so the
  two channels never double-fire audibly.

## Architecture

Everything except the notification plugin registration runs in the renderer.
The pipeline hangs off `agent-state-store` — the single source of truth for
transitions (including the seen-bit that defines "done") — via a module-level
zustand subscription wired once from App.tsx, following the updater precedent
(store subscription outside React so nothing re-renders on state churn). The
Đ1 detector is not touched.

```
agent-state-store ──► notification-watch (diff + pending timers, impure glue)
      (zustand)              │ decisions delegated to
                             ▼
                     notification-flow (pure rules, TDD)
                             │ fire
              ┌──────────────┴──────────────┐
              ▼                             ▼
   notification-sound (WebAudio)   src/tauri/notification.ts ──► tauri-plugin-notification
```

### New modules

- **`src/lib/notification-flow.ts`** (pure, TDD) — the brain. Two pure pieces:
  - `diffAgentStates(prev, next)` — compares two `byId` records and returns
    transitions: `{ terminalId, kind }` where `kind` is
    `'attention'` (state entered `blocked`; a previously absent entry counts —
    the engine's 3 s spawn grace already guards spawn noise),
    `'completion'` (`working|blocked → idle` landing with `seen === false`;
    the store only produces that when the pane was unwatched, so the
    seen-bit is reused rather than re-derived), or
    `'removed'` (entry cleared — terminal death/respawn/agent switch).
  - `resolveFire(pending, ctx)` — the fire-time re-validation (below).
- **`src/lib/notification-watch.ts`** (thin, impure) — subscribes to the store,
  keeps **one pending timer per terminalId** (a new qualifying transition
  replaces the pending and restarts its delay; `removed` cancels it), and at
  fire time gathers context (current store entry, pane-watched predicate,
  `document.hasFocus()`, prefs, agentId from the registry) and executes
  `resolveFire`'s verdict. Timers/now injected like `DetectorDeps` so the flow
  logic tests never sleep. Started once from App.tsx.
- **`src/lib/notification-sound.ts`** — two short synthesized chimes
  (oscillator + gain envelope, ~150 ms per note, gentle volume): *attention* =
  rising two-note "question", *completion* = falling two-note "resolved".
  Lazy singleton AudioContext, `resume()` before play, everything in
  try/catch — autoplay-policy or audio failures are silently ignored.
- **`src/lib/notification-pref.ts`** (pure, TDD) + **`src/store/notification-pref-store.ts`**
  — prefs shape `{ sound: boolean, system: boolean, perAgent: Record<string, boolean> }`,
  all defaulting to `true`; `perAgent` is keyed by the same agent ids
  `manifestForAgent` uses, and a missing key reads as `true` (fail-open for
  future agents). Persisted to localStorage exactly like `terminal-pref`
  (pure read/write helpers, tolerant of malformed stored JSON).
- **`src/tauri/notification.ts`** — the only IPC surface for the plugin
  (components/lib never import the plugin directly). Exposes
  `sendSystemNotification({ title, body })`; internally checks
  `isPermissionGranted()` and calls `requestPermission()` once on first use;
  a denial is remembered for the session and turns further sends into no-ops.
  Banners are sent without sound (`silent` on Windows; no `sound` attr on
  macOS/Linux).

### Rust / config

- `tauri-plugin-notification` in `src-tauri/Cargo.toml`, registered in the
  `lib.rs` builder.
- `@tauri-apps/plugin-notification` in package.json.
- `"notification:default"` added to `capabilities/default.json` — without it
  the plugin rejects silently (the `dialog:allow-message` lesson).

## Timing and re-validation

The backlog rule: **delay ~1 s, then re-validate before firing** — a blocked
flash that resolves itself must not chime.

On a qualifying transition, `notification-watch` stores a pending
`{ terminalId, kind, agentId }` and arms a 1000 ms timer (replacing any
existing pending for that id). When the timer fires, `resolveFire` checks, in
order:

1. Entry still exists in the store.
2. State still qualifies: `attention` → state is still `blocked`;
   `completion` → state is still `idle` with `seen === false`.
3. Pane still unwatched: `!(document.hasFocus() && focusedTerminalId === id)`
   — the same predicate the detector uses for `isPaneWatched`.
4. Prefs: the agent's per-agent toggle is on, else drop.
5. Channels: chime iff `prefs.sound`; banner iff `prefs.system` **and**
   `document.hasFocus() === false` at this instant.

Any failed check up to 4 drops the whole pending silently. If both channels
end up disabled, nothing fires. Simultaneous completions in several panes each
fire independently (overlapping chimes are accepted for v1 — rare, short).

Banner copy: title `"<Agent display name> needs your input"` /
`"<Agent display name> finished"`, body = the pane title from
`terminal-title-store` ('' if none). No actions, no click handling.

## Error handling

Fail-open everywhere, mirroring session discovery: missing OS permission,
blocked AudioContext, plugin errors, unknown agent id — all silently skip the
notification. No retries, no toasts, no logging beyond `console.warn` on
unexpected exceptions. The state dots remain the reliable channel.

## Settings UI

New "Notifications" panel in `SettingsView` (alongside Appearance / Keyboard /
Terminal): a **Sound** toggle, a **System notifications** toggle, then one
toggle per agent from the agent catalog (with `AgentIcon`), gating both
channels for that agent. All default on. Plain terminals have no detector and
therefore never notify — no setting needed.

## Testing

- `notification-flow.test.ts` — diff classification (enter-blocked, completion
  with/without seen, removed, no-op updates), pending replacement semantics,
  and the full `resolveFire` matrix (state changed back, pane became watched,
  window focus at fire time, each pref toggle, unknown agent).
- `notification-pref.test.ts` — defaults, round-trip, malformed JSON, missing
  per-agent keys.
- `notification-watch` stays thin enough to review by hand; its deps (timers,
  focus, registry lookup) are injected so the flow tests cover the logic.
- Manual: new entries in `docs/manual-smoke-tests.md` (blocked in background
  workspace → chime; window unfocused → banner + chime; watched pane → nothing;
  toggles off → nothing; permission denied → chime still works).

## Docs

- `docs/user-guide.md`: new Notifications section (behavior + settings +
  the "banner only when the window is unfocused" rule + platform permission
  note for macOS).
- README untouched (no core-idea change).

## Non-goals (v1)

- Click-to-focus-pane from the banner (Tauri desktop click actions are not
  reliable cross-platform).
- Per-pane toggles, custom/bundled sound files, notification history,
  rate-limiting/coalescing, do-not-disturb schedules.
- Đ2 (War Room state-aware delivery) and M3 (jump-to-attention) — separate
  backlog items unlocked by the same Đ1 foundation.

## Sequencing

Đ4 (terminal search — bounded, approved in chat, no spec) ships first as a
separate branch/commit; Đ3 follows via the implementation plan derived from
this spec.
