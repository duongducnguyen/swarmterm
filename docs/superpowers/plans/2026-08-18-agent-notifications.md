# Agent Notifications (Đ3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a background agent pane transitions to blocked or completes to done, play a synthesized chime; if the app window is unfocused, also post a silent OS notification.

**Architecture:** A module-level zustand subscription on `agent-state-store` (wired once from App.tsx, mirroring the updater precedent) diffs `byId` between updates, arms a 1 s pending timer per terminal, re-validates at fire time via pure rules in `lib/notification-flow.ts`, then dispatches to a WebAudio chime module and a new `src/tauri/notification.ts` IPC surface over `tauri-plugin-notification`.

**Tech Stack:** React 19 + TS strict, zustand v5, Vitest, WebAudio, Tauri 2 + `tauri-plugin-notification`.

**Spec:** `docs/superpowers/specs/2026-08-18-agent-notifications-design.md`

## Global Constraints

- Work on branch `feat/agent-notifications`.
- TypeScript strict incl. `noUnusedLocals`/`noUnusedParameters` — dead code fails `npx tsc --noEmit`.
- `src/lib/` modules are framework-free; every logic module gets a `*.test.ts` beside it, written FIRST (TDD). Impure thin glue (`notification-sound.ts`) follows the `preview-registry.ts` precedent (no test) but stays tiny.
- Imports use the `@/` alias.
- Comments explain *why*, not *what* — match the density of `terminal-registry.ts`.
- `src/tauri/*` is the ONLY IPC surface: components/lib never import `@tauri-apps/plugin-notification` directly.
- Fail-open everywhere: permission denied, AudioContext blocked, plugin error ⇒ silently skip (at most `console.warn`). The state dots remain the primary channel.
- All user-facing copy and docs in English.
- Per-agent pref keys are workspace **template ids** (`claude-code`, `codex`, `opencode` — `src/lib/templates.ts`), the same ids `manifestForAgent` consumes. A missing key means enabled.
- Delay before firing: `NOTIFY_DELAY_MS = 1000`.
- Every task ends with: run the named tests, then commit.

---

### Task 1: Notification preferences (pure lib)

**Files:**
- Create: `src/lib/notification-pref.ts`
- Test: `src/lib/notification-pref.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (later tasks import these exact names):
  - `interface NotificationPrefs { sound: boolean; system: boolean; perAgent: Record<string, boolean> }`
  - `const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs` (`{ sound: true, system: true, perAgent: {} }`)
  - `const NOTIFICATION_PREF_STORAGE_KEY = 'cc-notification-prefs'`
  - `interface NotificationPrefStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }`
  - `agentNotificationsEnabled(prefs: NotificationPrefs, agentId: string): boolean`
  - `readStoredNotificationPrefs(storage: NotificationPrefStorage): NotificationPrefs`
  - `storeNotificationPrefs(storage: NotificationPrefStorage, prefs: NotificationPrefs): void`

Mirror `src/lib/terminal-pref.ts` (storage-surface injection so tests pass a fake).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/notification-pref.test.ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREF_STORAGE_KEY,
  agentNotificationsEnabled,
  readStoredNotificationPrefs,
  storeNotificationPrefs,
  type NotificationPrefStorage
} from './notification-pref'

function fakeStorage(initial: Record<string, string> = {}): NotificationPrefStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v }
  }
}

describe('readStoredNotificationPrefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readStoredNotificationPrefs(fakeStorage())).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it('round-trips through store', () => {
    const storage = fakeStorage()
    const prefs = { sound: false, system: true, perAgent: { codex: false } }
    storeNotificationPrefs(storage, prefs)
    expect(readStoredNotificationPrefs(storage)).toEqual(prefs)
  })

  it('falls back to defaults on malformed JSON', () => {
    const storage = fakeStorage({ [NOTIFICATION_PREF_STORAGE_KEY]: '{not json' })
    expect(readStoredNotificationPrefs(storage)).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it('falls back to defaults on non-object payloads', () => {
    const storage = fakeStorage({ [NOTIFICATION_PREF_STORAGE_KEY]: '"yes"' })
    expect(readStoredNotificationPrefs(storage)).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it('coerces missing/invalid fields per-field and keeps only boolean perAgent entries', () => {
    const storage = fakeStorage({
      [NOTIFICATION_PREF_STORAGE_KEY]: JSON.stringify({ sound: 'loud', perAgent: { codex: false, opencode: 'x' } })
    })
    expect(readStoredNotificationPrefs(storage)).toEqual({
      sound: true,
      system: true,
      perAgent: { codex: false }
    })
  })
})

describe('agentNotificationsEnabled', () => {
  const prefs = { sound: true, system: true, perAgent: { codex: false, opencode: true } }
  it('treats a missing key as enabled (fail-open for future agents)', () => {
    expect(agentNotificationsEnabled(prefs, 'claude-code')).toBe(true)
  })
  it('respects explicit false / true', () => {
    expect(agentNotificationsEnabled(prefs, 'codex')).toBe(false)
    expect(agentNotificationsEnabled(prefs, 'opencode')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/notification-pref.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/notification-pref.ts`**

```ts
/** User preferences for Đ3 agent notifications. Persisted to localStorage. */
export interface NotificationPrefs {
  sound: boolean
  system: boolean
  /** Keyed by workspace template id (claude-code/codex/opencode). Missing key = enabled. */
  perAgent: Record<string, boolean>
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { sound: true, system: true, perAgent: {} }

/** localStorage key the notification preference is persisted under. */
export const NOTIFICATION_PREF_STORAGE_KEY = 'cc-notification-prefs'

/** Minimal storage surface — lets tests pass a fake in place of localStorage. */
export interface NotificationPrefStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Missing key reads as enabled so a future agent id needs no migration. */
export function agentNotificationsEnabled(prefs: NotificationPrefs, agentId: string): boolean {
  return prefs.perAgent[agentId] !== false
}

/** Per-field tolerant parse: any invalid field falls back alone, never the whole blob. */
export function readStoredNotificationPrefs(storage: NotificationPrefStorage): NotificationPrefs {
  const raw = storage.getItem(NOTIFICATION_PREF_STORAGE_KEY)
  if (raw === null) return DEFAULT_NOTIFICATION_PREFS
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_NOTIFICATION_PREFS
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_NOTIFICATION_PREFS
  const obj = parsed as Record<string, unknown>
  const perAgent: Record<string, boolean> = {}
  if (typeof obj.perAgent === 'object' && obj.perAgent !== null) {
    for (const [k, v] of Object.entries(obj.perAgent as Record<string, unknown>)) {
      if (typeof v === 'boolean') perAgent[k] = v
    }
  }
  return {
    sound: typeof obj.sound === 'boolean' ? obj.sound : true,
    system: typeof obj.system === 'boolean' ? obj.system : true,
    perAgent
  }
}

export function storeNotificationPrefs(storage: NotificationPrefStorage, prefs: NotificationPrefs): void {
  storage.setItem(NOTIFICATION_PREF_STORAGE_KEY, JSON.stringify(prefs))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/notification-pref.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notification-pref.ts src/lib/notification-pref.test.ts
git commit -m "feat(notifications): notification preference model + storage helpers"
```

---

### Task 2: Transition diffing (pure lib)

**Files:**
- Create: `src/lib/notification-flow.ts`
- Test: `src/lib/notification-flow.test.ts`

**Interfaces:**
- Consumes: `AgentPaneState` from `@/lib/agent-state/rollup` (shape `{ state: AgentEngineState; seen: boolean }`).
- Produces:
  - `type NotificationKind = 'attention' | 'completion'`
  - `type AgentStateTransition = { terminalId: string; kind: NotificationKind | 'removed' }`
  - `diffAgentStates(prev: Record<string, AgentPaneState>, next: Record<string, AgentPaneState>): AgentStateTransition[]`

Semantics (from the spec): `attention` = state entered `blocked` (a previously
absent entry counts — the engine's 3 s spawn grace guards spawn noise);
`completion` = `working|blocked → idle` landing with `seen === false` (the
store only produces that when the pane was unwatched — the seen-bit is reused,
not re-derived); `removed` = entry cleared. `unknown → idle` and
`markSeen` flips are NOT transitions. `agent-state-store.publish` never
replaces an entry with an identical state, so a reference-equal entry can be
skipped.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/notification-flow.test.ts
import { describe, expect, it } from 'vitest'
import type { AgentPaneState } from '@/lib/agent-state/rollup'
import { diffAgentStates } from './notification-flow'

const s = (state: AgentPaneState['state'], seen = true): AgentPaneState => ({ state, seen })

describe('diffAgentStates', () => {
  it('returns nothing for identical records', () => {
    const a = { t1: s('working') }
    expect(diffAgentStates(a, a)).toEqual([])
    expect(diffAgentStates({}, {})).toEqual([])
  })

  it('reports attention when a pane enters blocked', () => {
    expect(diffAgentStates({ t1: s('working') }, { t1: s('blocked') })).toEqual([
      { terminalId: 't1', kind: 'attention' }
    ])
  })

  it('reports attention for a previously absent entry that is blocked', () => {
    expect(diffAgentStates({}, { t1: s('blocked') })).toEqual([{ terminalId: 't1', kind: 'attention' }])
  })

  it('does not re-report attention while blocked persists (new object, same state)', () => {
    expect(diffAgentStates({ t1: s('blocked') }, { t1: s('blocked') })).toEqual([])
  })

  it('reports completion for working→idle landing unseen', () => {
    expect(diffAgentStates({ t1: s('working') }, { t1: s('idle', false) })).toEqual([
      { terminalId: 't1', kind: 'completion' }
    ])
  })

  it('reports completion for blocked→idle landing unseen', () => {
    expect(diffAgentStates({ t1: s('blocked') }, { t1: s('idle', false) })).toEqual([
      { terminalId: 't1', kind: 'completion' }
    ])
  })

  it('ignores a watched completion (seen stays true)', () => {
    expect(diffAgentStates({ t1: s('working') }, { t1: s('idle', true) })).toEqual([])
  })

  it('ignores unknown→idle (spawn settling) and absent→idle', () => {
    expect(diffAgentStates({ t1: s('unknown') }, { t1: s('idle', false) })).toEqual([])
    expect(diffAgentStates({}, { t1: s('idle', false) })).toEqual([])
  })

  it('ignores the markSeen flip (idle unseen → idle seen)', () => {
    expect(diffAgentStates({ t1: s('idle', false) }, { t1: s('idle', true) })).toEqual([])
  })

  it('reports removed when an entry disappears', () => {
    expect(diffAgentStates({ t1: s('working') }, {})).toEqual([{ terminalId: 't1', kind: 'removed' }])
  })

  it('handles several panes in one update', () => {
    const prev = { t1: s('working'), t2: s('idle'), t3: s('working') }
    const next = { t1: s('blocked'), t2: s('idle') }
    expect(diffAgentStates(prev, next)).toEqual([
      { terminalId: 't1', kind: 'attention' },
      { terminalId: 't3', kind: 'removed' }
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/notification-flow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `diffAgentStates` in `src/lib/notification-flow.ts`**

```ts
import type { AgentPaneState } from '@/lib/agent-state/rollup'

export type NotificationKind = 'attention' | 'completion'

export interface AgentStateTransition {
  terminalId: string
  kind: NotificationKind | 'removed'
}

/**
 * Classify what changed between two agent-state snapshots. Relies on the
 * store's dedupe (identical state never republished as a new object): a
 * reference-equal entry cannot carry a transition. `unknown → idle` is not a
 * completion (spawn settling), and the markSeen flip is not a transition.
 */
export function diffAgentStates(
  prev: Record<string, AgentPaneState>,
  next: Record<string, AgentPaneState>
): AgentStateTransition[] {
  const out: AgentStateTransition[] = []
  for (const [terminalId, cur] of Object.entries(next)) {
    const old = prev[terminalId]
    if (old === cur) continue
    if (cur.state === 'blocked' && old?.state !== 'blocked') {
      out.push({ terminalId, kind: 'attention' })
    } else if (
      cur.state === 'idle' &&
      !cur.seen &&
      (old?.state === 'working' || old?.state === 'blocked')
    ) {
      out.push({ terminalId, kind: 'completion' })
    }
  }
  for (const terminalId of Object.keys(prev)) {
    if (!(terminalId in next)) out.push({ terminalId, kind: 'removed' })
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/notification-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notification-flow.ts src/lib/notification-flow.test.ts
git commit -m "feat(notifications): classify agent-state transitions for notification triggers"
```

---

### Task 3: Fire-time re-validation + banner copy (pure lib)

**Files:**
- Modify: `src/lib/notification-flow.ts`
- Test: `src/lib/notification-flow.test.ts` (extend)

**Interfaces:**
- Consumes: `NotificationPrefs`, `agentNotificationsEnabled` from `@/lib/notification-pref` (Task 1).
- Produces:
  - `interface PendingNotification { terminalId: string; kind: NotificationKind; agentId: string }`
  - `interface FireContext { current: AgentPaneState | undefined; paneWatched: boolean; windowFocused: boolean; prefs: NotificationPrefs }`
  - `interface FireVerdict { sound: boolean; system: boolean }`
  - `resolveFire(pending: PendingNotification, ctx: FireContext): FireVerdict`
  - `notificationCopy(kind: NotificationKind, agentName: string, paneTitle: string): { title: string; body: string }`

Rules (spec order): entry gone → drop; state no longer qualifies
(`attention` needs `blocked`; `completion` needs `idle && !seen`) → drop; pane
watched → drop; per-agent pref off → drop; else `sound = prefs.sound`,
`system = prefs.system && !windowFocused`.

- [ ] **Step 1: Write the failing tests (append to the existing describe file)**

```ts
// append to src/lib/notification-flow.test.ts
import { notificationCopy, resolveFire } from './notification-flow'

const basePrefs = { sound: true, system: true, perAgent: {} }
const pend = (kind: 'attention' | 'completion') => ({ terminalId: 't1', kind, agentId: 'claude-code' })
const ctx = (over: Partial<Parameters<typeof resolveFire>[1]>) => ({
  current: s('blocked'),
  paneWatched: false,
  windowFocused: true,
  prefs: basePrefs,
  ...over
})

describe('resolveFire', () => {
  it('drops when the entry is gone (terminal died/respawned)', () => {
    expect(resolveFire(pend('attention'), ctx({ current: undefined }))).toEqual({ sound: false, system: false })
  })

  it('drops attention when the pane is no longer blocked', () => {
    expect(resolveFire(pend('attention'), ctx({ current: s('working') }))).toEqual({ sound: false, system: false })
  })

  it('drops completion when the pane left idle or was seen', () => {
    expect(resolveFire(pend('completion'), ctx({ current: s('working') }))).toEqual({ sound: false, system: false })
    expect(resolveFire(pend('completion'), ctx({ current: s('idle', true) }))).toEqual({ sound: false, system: false })
  })

  it('fires completion while still idle-unseen', () => {
    expect(resolveFire(pend('completion'), ctx({ current: s('idle', false) }))).toEqual({ sound: true, system: false })
  })

  it('drops when the pane became watched during the delay', () => {
    expect(resolveFire(pend('attention'), ctx({ paneWatched: true }))).toEqual({ sound: false, system: false })
  })

  it('chimes without a banner while the window is focused', () => {
    expect(resolveFire(pend('attention'), ctx({ windowFocused: true }))).toEqual({ sound: true, system: false })
  })

  it('adds the banner when the window is unfocused', () => {
    expect(resolveFire(pend('attention'), ctx({ windowFocused: false }))).toEqual({ sound: true, system: true })
  })

  it('respects the channel toggles independently', () => {
    expect(
      resolveFire(pend('attention'), ctx({ windowFocused: false, prefs: { ...basePrefs, sound: false } }))
    ).toEqual({ sound: false, system: true })
    expect(
      resolveFire(pend('attention'), ctx({ windowFocused: false, prefs: { ...basePrefs, system: false } }))
    ).toEqual({ sound: true, system: false })
  })

  it('drops entirely when the per-agent toggle is off', () => {
    expect(
      resolveFire(pend('attention'), ctx({ windowFocused: false, prefs: { ...basePrefs, perAgent: { 'claude-code': false } } }))
    ).toEqual({ sound: false, system: false })
  })
})

describe('notificationCopy', () => {
  it('phrases attention and completion with the agent display name', () => {
    expect(notificationCopy('attention', 'Claude Code', 'fix tests')).toEqual({
      title: 'Claude Code needs your input',
      body: 'fix tests'
    })
    expect(notificationCopy('completion', 'Codex', '')).toEqual({ title: 'Codex finished', body: '' })
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/notification-flow.test.ts`
Expected: FAIL — `resolveFire` not exported.

- [ ] **Step 3: Implement in `src/lib/notification-flow.ts`**

```ts
import { agentNotificationsEnabled, type NotificationPrefs } from '@/lib/notification-pref'

export interface PendingNotification {
  terminalId: string
  kind: NotificationKind
  agentId: string
}

export interface FireContext {
  current: AgentPaneState | undefined
  paneWatched: boolean
  windowFocused: boolean
  prefs: NotificationPrefs
}

export interface FireVerdict {
  sound: boolean
  system: boolean
}

const DROP: FireVerdict = { sound: false, system: false }

/**
 * Fire-time re-validation, ~1 s after the transition: a blocked flash that
 * resolved itself, a pane the user has since looked at, or a dead terminal
 * must not notify. The banner additionally requires the window to be
 * unfocused AT THIS INSTANT — inside the app the chime alone is the signal.
 */
export function resolveFire(pending: PendingNotification, ctx: FireContext): FireVerdict {
  const { current } = ctx
  if (current === undefined) return DROP
  if (pending.kind === 'attention' && current.state !== 'blocked') return DROP
  if (pending.kind === 'completion' && !(current.state === 'idle' && !current.seen)) return DROP
  if (ctx.paneWatched) return DROP
  if (!agentNotificationsEnabled(ctx.prefs, pending.agentId)) return DROP
  return { sound: ctx.prefs.sound, system: ctx.prefs.system && !ctx.windowFocused }
}

export function notificationCopy(
  kind: NotificationKind,
  agentName: string,
  paneTitle: string
): { title: string; body: string } {
  return {
    title: kind === 'attention' ? `${agentName} needs your input` : `${agentName} finished`,
    body: paneTitle
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/notification-flow.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notification-flow.ts src/lib/notification-flow.test.ts
git commit -m "feat(notifications): fire-time re-validation rules and banner copy"
```

---

### Task 4: WebAudio chimes

**Files:**
- Create: `src/lib/notification-sound.ts` (impure, no test — `preview-registry.ts` precedent; keep it this small)

**Interfaces:**
- Consumes: `NotificationKind` from `@/lib/notification-flow`.
- Produces: `playChime(kind: NotificationKind): void` — fire-and-forget, never throws.

- [ ] **Step 1: Implement**

```ts
import type { NotificationKind } from '@/lib/notification-flow'

/**
 * Synthesized two-note chimes — no bundled audio asset, no license, and they
 * work even when OS notification permission is denied. Attention rises like a
 * question; completion falls to a resolution. One lazy AudioContext for the
 * app lifetime; every failure path (autoplay policy, missing WebAudio) is
 * silent because the state dots remain the primary channel.
 */
const NOTES: Record<NotificationKind, [number, number]> = {
  attention: [660, 880],
  completion: [880, 660]
}

let ctx: AudioContext | null = null

function note(ac: AudioContext, freq: number, at: number): void {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
  osc.connect(gain).connect(ac.destination)
  osc.start(at)
  osc.stop(at + 0.2)
}

export function playChime(kind: NotificationKind): void {
  try {
    if (typeof AudioContext === 'undefined') return
    ctx ??= new AudioContext()
    const play = (): void => {
      const [a, b] = NOTES[kind]
      const t = ctx!.currentTime
      note(ctx!, a, t)
      note(ctx!, b, t + 0.16)
    }
    // The context starts suspended until the page has had user interaction —
    // the app always has (you typed into a terminal), so resume() succeeds.
    if (ctx.state === 'suspended') void ctx.resume().then(play, () => undefined)
    else play()
  } catch {
    // WebAudio unavailable — dots stay the signal.
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notification-sound.ts
git commit -m "feat(notifications): synthesized WebAudio chimes"
```

---

### Task 5: Tauri notification plugin + IPC surface

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `tauri-plugin-notification = "2"` under `[dependencies]`)
- Modify: `src-tauri/src/lib.rs` (add `.plugin(tauri_plugin_notification::init())` beside the other `.plugin(...)` calls, ~line 33)
- Modify: `src-tauri/capabilities/default.json` (add `"notification:default"` to `permissions`)
- Modify: `package.json` (add `@tauri-apps/plugin-notification`)
- Create: `src/tauri/notification.ts`

**Interfaces:**
- Produces: `sendSystemNotification(opts: { title: string; body: string }): Promise<void>` — resolves always; never rejects.

- [ ] **Step 1: Add the dependencies**

```bash
npm install @tauri-apps/plugin-notification
```

In `src-tauri/Cargo.toml` `[dependencies]` add:

```toml
tauri-plugin-notification = "2"
```

In `src-tauri/src/lib.rs`, beside the existing plugin registrations:

```rust
.plugin(tauri_plugin_notification::init())
```

In `src-tauri/capabilities/default.json` `permissions`, add (the
`dialog:allow-message` lesson — a missing capability rejects silently):

```json
"notification:default",
```

- [ ] **Step 2: Implement `src/tauri/notification.ts`**

```ts
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

/**
 * The only IPC surface for OS notifications (components/lib never import the
 * plugin directly). Permission is resolved lazily on first send; a denial is
 * remembered for the session so we never re-prompt. Banners are sent silent —
 * the in-app WebAudio chime is the audible channel, and firing both would
 * double up. Every failure is swallowed: notifications are best-effort.
 */
let denied = false

export async function sendSystemNotification(opts: { title: string; body: string }): Promise<void> {
  if (denied) return
  try {
    let granted = await isPermissionGranted()
    if (!granted) {
      granted = (await requestPermission()) === 'granted'
      if (!granted) {
        denied = true
        return
      }
    }
    sendNotification({ title: opts.title, body: opts.body, silent: true })
  } catch (err) {
    console.warn('system notification failed', err)
  }
}
```

Note: if the plugin's `Options` type has no `silent` field in the installed
version, drop `silent: true` (macOS/Linux default to silent anyway; the
Windows default sound is an acceptable fallback) — do NOT cast around the
type.

- [ ] **Step 3: Verify builds**

Run: `npx tsc --noEmit` — expected clean.
Run (from `src-tauri/`): `cargo test` — expected: compiles, existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src/tauri/notification.ts
git commit -m "feat(notifications): tauri notification plugin + silent send surface"
```

---

### Task 6: Preference store + Settings panel

**Files:**
- Create: `src/store/notification-pref-store.ts`
- Create: `src/components/Settings/NotificationsPanel.tsx`
- Modify: `src/components/Settings/SettingsView.tsx` (new category)

**Interfaces:**
- Consumes: Task 1 helpers; `TEMPLATES` from `@/lib/templates`; `manifestForAgent` from `@/lib/agent-state/manifests`; `AgentIcon` from `@/components/AgentIcon`.
- Produces: `useNotificationPrefStore` with `{ prefs: NotificationPrefs; setSound(on: boolean): void; setSystem(on: boolean): void; setAgentEnabled(agentId: string, on: boolean): void }`.

- [ ] **Step 1: Implement the store (mirror `terminal-pref-store.ts`)**

```ts
import { create } from 'zustand'
import {
  DEFAULT_NOTIFICATION_PREFS,
  readStoredNotificationPrefs,
  storeNotificationPrefs,
  type NotificationPrefs
} from '@/lib/notification-pref'

export interface NotificationPrefStore {
  prefs: NotificationPrefs
  setSound: (on: boolean) => void
  setSystem: (on: boolean) => void
  setAgentEnabled: (agentId: string, on: boolean) => void
}

/**
 * Notification preferences. Reads the persisted choice on first creation and
 * writes every change back to localStorage. Renderer-only — touches `window`.
 */
export const useNotificationPrefStore = create<NotificationPrefStore>((set, get) => {
  const initial =
    typeof window === 'undefined'
      ? DEFAULT_NOTIFICATION_PREFS
      : readStoredNotificationPrefs(window.localStorage)
  const apply = (prefs: NotificationPrefs): void => {
    storeNotificationPrefs(window.localStorage, prefs)
    set({ prefs })
  }
  return {
    prefs: initial,
    setSound: (on) => apply({ ...get().prefs, sound: on }),
    setSystem: (on) => apply({ ...get().prefs, system: on }),
    setAgentEnabled: (agentId, on) =>
      apply({ ...get().prefs, perAgent: { ...get().prefs.perAgent, [agentId]: on } })
  }
})
```

- [ ] **Step 2: Implement `NotificationsPanel.tsx`**

Follow the visual language of the other Settings panels (section heading +
muted description). No Switch primitive exists in `components/ui` — build a
small `ToggleRow` locally with a `role="switch"` button (VS Code-style track +
thumb):

```tsx
import type { ReactElement } from 'react'
import { AgentIcon } from '@/components/AgentIcon'
import { manifestForAgent } from '@/lib/agent-state/manifests'
import { agentNotificationsEnabled } from '@/lib/notification-pref'
import { TEMPLATES } from '@/lib/templates'
import { cn } from '@/lib/utils'
import { useNotificationPrefStore } from '@/store/notification-pref-store'

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (on: boolean) => void
  icon?: ReactElement
}

function ToggleRow({ label, description, checked, onChange, icon }: ToggleRowProps): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <div className="min-w-0">
          <div className="text-sm text-foreground">{label}</div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}

/** Agent templates that actually have a state detector — plain shells never notify. */
const AGENT_TEMPLATES = TEMPLATES.filter((t) => manifestForAgent(t.id) !== undefined)

export function NotificationsPanel(): ReactElement {
  const prefs = useNotificationPrefStore((s) => s.prefs)
  const { setSound, setSystem, setAgentEnabled } = useNotificationPrefStore.getState()

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-1 text-base font-semibold text-foreground">Notifications</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          When a background agent pane needs your input or finishes, Swarmterm plays a short
          chime — and shows a system notification if the window is unfocused.
        </p>
        <ToggleRow label="Sound" description="Chime when a background agent blocks or finishes." checked={prefs.sound} onChange={setSound} />
        <ToggleRow label="System notifications" description="Only shown while the Swarmterm window is unfocused." checked={prefs.system} onChange={setSystem} />
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Per agent</h3>
        <p className="mb-2 text-xs text-muted-foreground">Turn off both channels for a specific agent.</p>
        {AGENT_TEMPLATES.map((t) => (
          <ToggleRow
            key={t.id}
            label={t.name}
            checked={agentNotificationsEnabled(prefs, t.id)}
            onChange={(on) => setAgentEnabled(t.id, on)}
            icon={<AgentIcon template={t} className="h-4 w-4" />}
          />
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Register the category in `SettingsView.tsx`**

- Extend `CategoryId` to `'appearance' | 'terminal' | 'notifications' | 'shortcuts'`.
- Import `Bell` from `lucide-react` and `NotificationsPanel` from `./NotificationsPanel`.
- Add `{ id: 'notifications', label: 'Notifications', Icon: Bell }` to `CATEGORIES` between `terminal` and `shortcuts`.
- Add `{activeCategory === 'notifications' && <NotificationsPanel />}` beside the other panel renders.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected clean.
Run: `npm test` — expected: all pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/store/notification-pref-store.ts src/components/Settings/NotificationsPanel.tsx src/components/Settings/SettingsView.tsx
git commit -m "feat(notifications): preference store and Settings panel"
```

---

### Task 7: Watcher + registry accessor + App wiring

**Files:**
- Create: `src/lib/notification-watch.ts`
- Test: `src/lib/notification-watch.test.ts`
- Modify: `src/lib/terminal-registry.ts` (new exported accessor, next to `getTerminalCwd` ~line 992)
- Modify: `src/App.tsx` (one new `useEffect`, beside the updater subscription ~line 534)

**Interfaces:**
- Consumes: Tasks 1–5 exports; `templateById` from `@/lib/templates`.
- Produces:
  - `getTerminalAgentId(id: string): string | undefined` (terminal-registry)
  - `const NOTIFY_DELAY_MS = 1000`
  - `interface NotificationWatchDeps` (below) and `startNotificationWatch(deps: NotificationWatchDeps): () => void`

```ts
export interface NotificationWatchDeps {
  subscribeAgentStates: (
    listener: (next: Record<string, AgentPaneState>, prev: Record<string, AgentPaneState>) => void
  ) => () => void
  getAgentStates: () => Record<string, AgentPaneState>
  isPaneWatched: (terminalId: string) => boolean
  isWindowFocused: () => boolean
  getAgentId: (terminalId: string) => string | undefined
  getPrefs: () => NotificationPrefs
  getPaneTitle: (terminalId: string) => string
  playChime: (kind: NotificationKind) => void
  sendSystemNotification: (opts: { title: string; body: string }) => void
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}
```

Behavior: one pending per terminalId. A qualifying transition replaces any
existing pending (clear its timer) and arms `NOTIFY_DELAY_MS`; `removed`
cancels; a transition whose `getAgentId` returns `undefined` is skipped
(respawn race — the terminal map entry is already gone). At fire: build
`FireContext` from deps, `resolveFire`, then chime and/or
`sendSystemNotification(notificationCopy(kind, templateById(agentId).name, getPaneTitle(id)))`.
The returned disposer clears all pending timers and unsubscribes.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/notification-watch.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPaneState } from '@/lib/agent-state/rollup'
import { NOTIFY_DELAY_MS, startNotificationWatch, type NotificationWatchDeps } from './notification-watch'

const s = (state: AgentPaneState['state'], seen = true): AgentPaneState => ({ state, seen })

interface Harness {
  deps: NotificationWatchDeps
  emit: (next: Record<string, AgentPaneState>, prev: Record<string, AgentPaneState>) => void
  fireTimers: () => void
  playChime: ReturnType<typeof vi.fn>
  sendSystem: ReturnType<typeof vi.fn>
  states: { current: Record<string, AgentPaneState> }
  focus: { window: boolean; watchedId: string | null }
}

function harness(): Harness {
  let listener: ((n: Record<string, AgentPaneState>, p: Record<string, AgentPaneState>) => void) | null = null
  const timers = new Map<number, () => void>()
  let nextHandle = 1
  const playChime = vi.fn()
  const sendSystem = vi.fn()
  const states = { current: {} as Record<string, AgentPaneState> }
  const focus = { window: true, watchedId: null as string | null }
  const deps: NotificationWatchDeps = {
    subscribeAgentStates: (l) => {
      listener = l
      return () => { listener = null }
    },
    getAgentStates: () => states.current,
    isPaneWatched: (id) => focus.watchedId === id,
    isWindowFocused: () => focus.window,
    getAgentId: (id) => (id === 'plain' ? undefined : 'claude-code'),
    getPrefs: () => ({ sound: true, system: true, perAgent: {} }),
    getPaneTitle: () => 'my pane',
    playChime,
    sendSystemNotification: sendSystem,
    setTimer: (fn, ms) => {
      expect(ms).toBe(NOTIFY_DELAY_MS)
      const h = nextHandle++
      timers.set(h, fn)
      return h
    },
    clearTimer: (h) => { timers.delete(h as number) }
  }
  return {
    deps,
    emit: (next, prev) => {
      states.current = next
      listener?.(next, prev)
    },
    fireTimers: () => {
      const fns = [...timers.values()]
      timers.clear()
      fns.forEach((fn) => fn())
    },
    playChime,
    sendSystem,
    states,
    focus
  }
}

describe('startNotificationWatch', () => {
  let h: Harness
  beforeEach(() => { h = harness() })

  it('chimes after the delay when blocked persists (window focused → no banner)', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    expect(h.playChime).not.toHaveBeenCalled()
    h.fireTimers()
    expect(h.playChime).toHaveBeenCalledWith('attention')
    expect(h.sendSystem).not.toHaveBeenCalled()
  })

  it('adds the banner when the window is unfocused at fire time', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    h.focus.window = false
    h.fireTimers()
    expect(h.sendSystem).toHaveBeenCalledWith({ title: 'Claude Code needs your input', body: 'my pane' })
  })

  it('drops when the state resolved during the delay', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    h.states.current = { t1: s('working') }
    h.fireTimers()
    expect(h.playChime).not.toHaveBeenCalled()
  })

  it('a newer transition replaces the pending one', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    h.emit({ t1: s('idle', false) }, { t1: s('blocked') })
    h.fireTimers()
    expect(h.playChime).toHaveBeenCalledTimes(1)
    expect(h.playChime).toHaveBeenCalledWith('completion')
  })

  it('removal cancels the pending notification', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    h.emit({}, { t1: s('blocked') })
    h.fireTimers()
    expect(h.playChime).not.toHaveBeenCalled()
  })

  it('skips panes without an agent id', () => {
    startNotificationWatch(h.deps)
    h.emit({ plain: s('blocked') }, {})
    h.fireTimers()
    expect(h.playChime).not.toHaveBeenCalled()
  })

  it('disposer cancels pending timers', () => {
    const stop = startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    stop()
    h.fireTimers()
    expect(h.playChime).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/notification-watch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/notification-watch.ts`**

```ts
import {
  diffAgentStates,
  notificationCopy,
  resolveFire,
  type NotificationKind,
  type PendingNotification
} from '@/lib/notification-flow'
import type { NotificationPrefs } from '@/lib/notification-pref'
import type { AgentPaneState } from '@/lib/agent-state/rollup'
import { templateById } from '@/lib/templates'

export const NOTIFY_DELAY_MS = 1000

export interface NotificationWatchDeps { /* exactly as in the Interfaces block above */ }

interface Armed {
  pending: PendingNotification
  timer: unknown
}

/**
 * The impure half of Đ3: diffs agent-state snapshots, holds ONE pending
 * notification per terminal (a newer qualifying transition replaces it — the
 * user cares about the latest fact, not the history), and delegates every
 * decision to the pure rules in notification-flow. Timers are injected so the
 * tests never sleep, mirroring DetectorDeps.
 */
export function startNotificationWatch(deps: NotificationWatchDeps): () => void {
  const armed = new Map<string, Armed>()

  const cancel = (terminalId: string): void => {
    const cur = armed.get(terminalId)
    if (cur === undefined) return
    deps.clearTimer(cur.timer)
    armed.delete(terminalId)
  }

  const fire = (pending: PendingNotification): void => {
    armed.delete(pending.terminalId)
    const verdict = resolveFire(pending, {
      current: deps.getAgentStates()[pending.terminalId],
      paneWatched: deps.isPaneWatched(pending.terminalId),
      windowFocused: deps.isWindowFocused(),
      prefs: deps.getPrefs()
    })
    if (verdict.sound) deps.playChime(pending.kind)
    if (verdict.system) {
      const name = templateById(pending.agentId).name
      deps.sendSystemNotification(notificationCopy(pending.kind, name, deps.getPaneTitle(pending.terminalId)))
    }
  }

  const arm = (terminalId: string, kind: NotificationKind): void => {
    const agentId = deps.getAgentId(terminalId)
    if (agentId === undefined) return
    cancel(terminalId)
    const pending: PendingNotification = { terminalId, kind, agentId }
    armed.set(terminalId, { pending, timer: deps.setTimer(() => fire(pending), NOTIFY_DELAY_MS) })
  }

  const unsubscribe = deps.subscribeAgentStates((next, prev) => {
    for (const t of diffAgentStates(prev, next)) {
      if (t.kind === 'removed') cancel(t.terminalId)
      else arm(t.terminalId, t.kind)
    }
  })

  return () => {
    for (const id of [...armed.keys()]) cancel(id)
    unsubscribe()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/notification-watch.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the registry accessor**

In `src/lib/terminal-registry.ts`, next to `getTerminalCwd` (~line 992):

```ts
/** The agent template id this terminal was spawned with, if any. */
export function getTerminalAgentId(id: string): string | undefined {
  return entries.get(id)?.config.agentId
}
```

- [ ] **Step 6: Wire it in `App.tsx`**

Beside the updater subscription effect (~line 534), add (imports:
`startNotificationWatch` from `@/lib/notification-watch`, `useAgentStateStore`
from `@/store/agent-state-store`, `useNotificationPrefStore` from
`@/store/notification-pref-store`, `useTerminalTitleStore` from
`@/store/terminal-title-store`, `getTerminalAgentId` from
`@/lib/terminal-registry`, `playChime` from `@/lib/notification-sound`,
`sendSystemNotification` from `@/tauri/notification` — `useAppStore` and
`selectFocusedTerminalId` are already imported):

```tsx
// Đ3 notifications: subscribed outside the render path (updater precedent)
// so per-tick agent-state churn never re-renders App.
useEffect(() => {
  return startNotificationWatch({
    subscribeAgentStates: (listener) =>
      useAgentStateStore.subscribe((cur, prev) => listener(cur.byId, prev.byId)),
    getAgentStates: () => useAgentStateStore.getState().byId,
    isPaneWatched: (id) =>
      document.hasFocus() && selectFocusedTerminalId(useAppStore.getState()) === id,
    isWindowFocused: () => document.hasFocus(),
    getAgentId: getTerminalAgentId,
    getPrefs: () => useNotificationPrefStore.getState().prefs,
    getPaneTitle: (id) => useTerminalTitleStore.getState().titles[id] ?? '',
    playChime,
    sendSystemNotification: (opts) => void sendSystemNotification(opts),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (h) => window.clearTimeout(h as number)
  })
}, [])
```

- [ ] **Step 7: Verify the whole suite**

Run: `npm test` — expected: PASS.
Run: `npx tsc --noEmit` — expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/notification-watch.ts src/lib/notification-watch.test.ts src/lib/terminal-registry.ts src/App.tsx
git commit -m "feat(notifications): wire agent-state transitions to chimes and OS banners"
```

---

### Task 8: Docs + final verification

**Files:**
- Modify: `docs/user-guide.md` (new Notifications section near the agent-state/dots docs)
- Modify: `docs/manual-smoke-tests.md` (new checklist entries)

- [ ] **Step 1: User guide**

Add a "Notifications" section documenting exactly: chime when a background
agent pane blocks or finishes; system notification only while the window is
unfocused (silent — the chime is the sound); ~1 s delay with re-validation so
flashes don't notify; Settings → Notifications toggles (Sound, System
notifications, per-agent); macOS asks for notification permission on first
banner; plain terminal panes never notify. Match the guide's existing tone
and heading style.

- [ ] **Step 2: Smoke checklist**

Add to `docs/manual-smoke-tests.md`:

```markdown
## Notifications (Đ3)

- [ ] Agent blocks (permission prompt) in a background workspace → chime after ~1 s, no OS banner while the window is focused.
- [ ] Same, but with the window unfocused → chime + silent OS banner ("<Agent> needs your input").
- [ ] Agent finishes in a background pane → completion chime; banner only when window unfocused.
- [ ] Blocked flash that resolves within ~1 s → no chime.
- [ ] Blocked while you are watching that pane → nothing.
- [ ] Settings → Notifications: Sound off → banner still works; System off → chime still works; per-agent off → that agent is fully silent.
- [ ] macOS: first banner triggers the system permission prompt; denying it keeps chimes working.
- [ ] Plain Terminal pane never notifies.
```

- [ ] **Step 3: Final gates**

Run: `npm test` — PASS required.
Run: `npx tsc --noEmit` — clean required.
Run (from `src-tauri/`): `cargo test` — PASS required (Rust was touched in Task 5).

- [ ] **Step 4: Commit**

```bash
git add docs/user-guide.md docs/manual-smoke-tests.md
git commit -m "docs(notifications): user guide section + smoke checklist"
```
