# Resume-Sessions "Show All" Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking "Show all" in the Welcome composer's Resume-sessions section opens a two-column modal (agent rail + searchable, scrollable session list) instead of expanding inline.

**Architecture:** A pure `searchSessions` helper in `src/lib/agent-sessions.ts` (TDD), a shared `SessionRow` component so the inline list and the dialog render identical rows, and a hand-rolled modal `SessionsDialog` following the existing `ClearWorktreeDialog` pattern. Selection (`tickedSessions`) stays in `Welcome.tsx` and is passed down — the dialog is a bigger window onto the same state. The dialog's agent filter is dialog-local; the composer's filter tabs are untouched.

**Tech Stack:** React 19 + TypeScript (strict), Tailwind, zustand (not needed here), Vitest, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-08-10-sessions-dialog-design.md`

## Global Constraints

- All UI copy is **English**. Empty state: `No sessions match "<query>" — try another keyword or agent.` Footer: `N selected · M slots left`.
- TypeScript is strict incl. `noUnusedLocals`/`noUnusedParameters` — removing a state var means removing every reference in the same task or the build fails.
- Imports use the `@/` alias for `src/`.
- Comments explain **why**, not what (see `pty.rs`, `terminal-registry.ts` for the bar).
- Visual target is VS Code dark chrome; reuse the app's Tailwind tokens (`border-border`, `bg-card`, `text-muted-foreground`, `ring-ring`, `bg-accent`).
- Verification before claiming done: `npm test` and `npx tsc --noEmit` from the repo root, with output shown.
- Tasks 1–3 are inert additions and commit immediately. Task 4 (user-visible wiring) is implemented but **NOT committed** until the user smoke-tests a freshly restarted app (Task 5) — this surface has been reverted twice; see the spec's Decision history.

---

### Task 1: `searchSessions` pure helper (TDD)

**Files:**
- Modify: `src/lib/agent-sessions.ts` (insert above `sessionTabCounts`, ~line 45)
- Test: `src/lib/agent-sessions.test.ts`

**Interfaces:**
- Consumes: existing `AgentSessionEntry` type from the same file.
- Produces: `searchSessions(sessions: AgentSessionEntry[], query: string): AgentSessionEntry[]` — Tasks 3 uses it.

- [ ] **Step 1: Write the failing tests**

In `src/lib/agent-sessions.test.ts`, add `searchSessions` to the existing import block from `@/lib/agent-sessions`, then append after the `filterSessions` describe block (the file already defines the `entry(over)` factory at the top):

```ts
describe('searchSessions', () => {
  const list = [
    entry({ title: 'Fix login bug' }),
    entry({
      title: 'Refactor LOGIN flow',
      sessionId: '11111111-2222-4333-8444-555555555555'
    }),
    entry({ title: 'Update docs', sessionId: '22222222-2222-4333-8444-555555555555' })
  ]
  it('empty and whitespace-only queries return the input unchanged', () => {
    expect(searchSessions(list, '')).toEqual(list)
    expect(searchSessions(list, '   ')).toEqual(list)
  })
  it('matches title substrings case-insensitively', () => {
    expect(searchSessions(list, 'login').map((e) => e.title)).toEqual([
      'Fix login bug',
      'Refactor LOGIN flow'
    ])
  })
  it('trims the query before matching', () => {
    expect(searchSessions(list, '  docs ')).toHaveLength(1)
  })
  it('no match returns empty', () => {
    expect(searchSessions(list, 'zzz')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent-sessions.test.ts`
Expected: 4 FAIL (`searchSessions` is not exported), existing 13 PASS.

- [ ] **Step 3: Implement**

In `src/lib/agent-sessions.ts`, insert above the `sessionTabCounts` doc comment:

```ts
/** Title search for the all-sessions dialog — substring, case-insensitive.
 *  Composes with `filterSessions` (the rail narrows by agent, this narrows
 *  by text); a blank query is "no filter", matching an empty input. */
export function searchSessions(
  sessions: AgentSessionEntry[],
  query: string
): AgentSessionEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') return sessions
  return sessions.filter((e) => e.title.toLowerCase().includes(q))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent-sessions.test.ts`
Expected: 17 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-sessions.ts src/lib/agent-sessions.test.ts
git commit -m "feat(sessions): searchSessions title filter for the all-sessions dialog"
```

---

### Task 2: Shared `SessionRow` component, inline list rewired

**Files:**
- Create: `src/components/Welcome/SessionRow.tsx`
- Modify: `src/components/Welcome/Welcome.tsx` (session row markup ~lines 402–439, plus a `toggleSession` helper near the other handlers ~line 176)

**Interfaces:**
- Consumes: `AgentSessionEntry`, `sessionTimeLabel` from `@/lib/agent-sessions`; `AgentIcon`, `templateById`, `cn` (all existing).
- Produces: `SessionRow` React component with props `{ session: AgentSessionEntry; ticked: boolean; disabled: boolean; onToggle: () => void }`, and `toggleSession(key: string): void` inside `Welcome` — both used by Task 3/4.

- [ ] **Step 1: Create `src/components/Welcome/SessionRow.tsx`**

```tsx
import type { ReactElement } from 'react'
import { AgentIcon } from '@/components/AgentIcon'
import { templateById } from '@/lib/templates'
import { sessionTimeLabel, type AgentSessionEntry } from '@/lib/agent-sessions'
import { cn } from '@/lib/utils'

interface SessionRowProps {
  session: AgentSessionEntry
  ticked: boolean
  /** True when the 12-pane cap is reached and this row isn't already ticked. */
  disabled: boolean
  onToggle: () => void
}

/** One resumable-session row — shared between the composer's inline list and
 *  the all-sessions dialog so the two can never drift apart visually. */
export function SessionRow({
  session,
  ticked,
  disabled,
  onToggle
}: SessionRowProps): ReactElement {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        type="checkbox"
        checked={ticked}
        disabled={disabled}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 accent-primary"
      />
      <AgentIcon template={templateById(session.agentId)} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={session.title}>
        {session.title}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {sessionTimeLabel(session.updatedAtMs, Date.now())}
      </span>
    </label>
  )
}
```

- [ ] **Step 2: Add `toggleSession` to `Welcome.tsx`**

Directly under the `const visibleSessions = ...` line:

```tsx
  const toggleSession = (key: string): void => {
    setTickedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
```

- [ ] **Step 3: Replace the inline row markup in `Welcome.tsx`**

Import `SessionRow` from `./SessionRow`. Inside the sessions list `<div>`, replace the whole `visibleSessions.map((s) => { ... <label>...</label> })` block with:

```tsx
                {visibleSessions.map((s) => {
                  const key = sessionKey(s)
                  const ticked = tickedSessions.has(key)
                  return (
                    <SessionRow
                      key={key}
                      session={s}
                      ticked={ticked}
                      disabled={!ticked && !canTickMore}
                      onToggle={() => toggleSession(key)}
                    />
                  )
                })}
```

Then remove `sessionTimeLabel` from the `@/lib/agent-sessions` import in `Welcome.tsx` (now unused there — strict TS fails otherwise). `AgentIcon`, `templateById`, `cn` stay: the steppers, legend, and tabs still use them.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; 660 tests pass (17 in agent-sessions). Behavior is unchanged — this is a pure extraction.

- [ ] **Step 5: Commit**

```bash
git add src/components/Welcome/SessionRow.tsx src/components/Welcome/Welcome.tsx
git commit -m "refactor(welcome): extract shared SessionRow"
```

---

### Task 3: `SessionsDialog` component

**Files:**
- Create: `src/components/Welcome/SessionsDialog.tsx`

**Interfaces:**
- Consumes: `searchSessions` (Task 1), `SessionRow` (Task 2), existing `filterSessions`, `sessionKey`, `sessionTabCounts`, `SESSION_FILTER_TABS`, `SessionFilter`, `AgentSessionEntry`, `AgentIcon`, `templateById`, `Button`, `cn`.
- Produces: `SessionsDialog` component with props `{ open: boolean; onClose: () => void; sessions: AgentSessionEntry[]; tickedKeys: ReadonlySet<string>; onToggle: (key: string) => void; canTickMore: boolean; slotsLeft: number }` — Task 4 mounts it.

- [ ] **Step 1: Create `src/components/Welcome/SessionsDialog.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentIcon } from '@/components/AgentIcon'
import { templateById } from '@/lib/templates'
import {
  filterSessions,
  searchSessions,
  sessionKey,
  sessionTabCounts,
  SESSION_FILTER_TABS,
  type AgentSessionEntry,
  type SessionFilter
} from '@/lib/agent-sessions'
import { cn } from '@/lib/utils'
import { SessionRow } from './SessionRow'

interface SessionsDialogProps {
  open: boolean
  onClose: () => void
  sessions: AgentSessionEntry[]
  tickedKeys: ReadonlySet<string>
  onToggle: (key: string) => void
  canTickMore: boolean
  /** Remaining 12-pane budget — shown in the footer so a disabled row explains itself. */
  slotsLeft: number
}

/**
 * Modal over EVERY resumable session: agent rail on the left, title search +
 * scrollable list on the right. Ticks mutate the composer's set via onToggle —
 * the dialog is a bigger window onto the same selection, never a second one.
 * The rail filter is deliberately dialog-local: the shared-state variant left
 * the composer section unexpectedly filtered after the dialog closed.
 * Hand-rolled overlay per ClearWorktreeDialog; role="dialog" is what
 * overlay-watch and terminal-focus key on, so both cover it for free.
 */
export function SessionsDialog({
  open,
  onClose,
  sessions,
  tickedKeys,
  onToggle,
  canTickMore,
  slotsLeft
}: SessionsDialogProps): ReactElement | null {
  const [railFilter, setRailFilter] = useState<SessionFilter>('all')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // "Show all" means ALL: every visit restarts at the full list with the
  // caret in the search box. The effect runs after the open render, so the
  // input exists by the time focus() fires.
  useEffect(() => {
    if (open) {
      setRailFilter('all')
      setQuery('')
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const counts = sessionTabCounts(sessions)
  const visible = searchSessions(filterSessions(sessions, railFilter), query)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resume sessions"
        className="flex h-[440px] max-h-[85vh] w-[640px] max-w-[90vw] overflow-hidden rounded-lg border border-border bg-card text-sm shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Agent rail — dialog-local filter, zero-count agents disabled */}
        <div className="w-[150px] shrink-0 border-r border-border p-2">
          <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Agents
          </p>
          {SESSION_FILTER_TABS.map((tab) => {
            const count = counts[tab] ?? 0
            const active = railFilter === tab
            const empty = tab !== 'all' && count === 0
            return (
              <button
                key={tab}
                type="button"
                aria-pressed={active}
                disabled={empty}
                onClick={() => setRailFilter(tab)}
                className={cn(
                  'mb-0.5 flex w-full items-center justify-between rounded-md px-2 py-1 text-xs',
                  active
                    ? 'bg-accent text-foreground ring-1 ring-ring'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                  empty && 'cursor-not-allowed opacity-40 hover:bg-transparent'
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {tab !== 'all' && (
                    <AgentIcon template={templateById(tab)} className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">
                    {tab === 'all' ? 'All' : templateById(tab).name}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Search + list + footer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="m-3 mb-2 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 focus-within:ring-1 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5">
            {visible.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
                No sessions match "{query.trim()}" — try another keyword or agent.
              </div>
            ) : (
              visible.map((s) => {
                const key = sessionKey(s)
                const ticked = tickedKeys.has(key)
                return (
                  <SessionRow
                    key={key}
                    session={s}
                    ticked={ticked}
                    disabled={!ticked && !canTickMore}
                    onToggle={() => onToggle(key)}
                  />
                )
              })
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2.5">
            <span className="mr-auto text-xs tabular-nums text-muted-foreground">
              {tickedKeys.size} selected · {slotsLeft} {slotsLeft === 1 ? 'slot' : 'slots'} left
            </span>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean. The component is not mounted anywhere yet — this only proves it compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/Welcome/SessionsDialog.tsx
git commit -m "feat(welcome): SessionsDialog — two-column all-sessions modal"
```

---

### Task 4: Wire the dialog into `Welcome.tsx` (NO COMMIT until Task 5)

**Files:**
- Modify: `src/components/Welcome/Welcome.tsx`

**Interfaces:**
- Consumes: `SessionsDialog` (Task 3), `toggleSession` (Task 2), existing `maxTiles`, `totalPaneCount`, `canTickMore`, `tickedSessions`, `sessions`.
- Produces: the user-visible feature.

- [ ] **Step 1: Swap the expansion state for dialog state**

1. Import: `import { SessionsDialog } from './SessionsDialog'`.
2. Replace `const [sessionsExpanded, setSessionsExpanded] = useState(false)` with `const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false)`.
3. In the folder-change reset effect, replace `setSessionsExpanded(false)` with `setSessionsDialogOpen(false)` (a stale dialog over a new folder's empty list is meaningless).
4. `const visibleSessions = visibleSlice(filteredSessions, sessionsExpanded, VISIBLE_SESSION_ROWS)` → pass `false` instead of `sessionsExpanded`.
5. In the filter-tab `onClick`, delete the `setSessionsExpanded(false)` line and its "A new filter is a new list" comment (the inline list no longer expands).
6. On the sessions list wrapper, replace `className={cn('space-y-0.5 overflow-y-auto', sessionsExpanded && 'max-h-56')}` with `className="space-y-0.5"`.
7. Replace the expander button body:

```tsx
              {hiddenCount(filteredSessions.length, false, VISIBLE_SESSION_ROWS) > 0 && (
                <button
                  type="button"
                  onClick={() => setSessionsDialogOpen(true)}
                  className="mx-auto mt-1 block text-xs text-muted-foreground hover:text-foreground"
                >
                  Show all ({filteredSessions.length})
                </button>
              )}
```

(No `▾` arrow: nothing drops below the button any more.)

- [ ] **Step 2: Mount the dialog**

At the end of the returned tree, between the closing `</div>` of the two-column grid and the root `</div>`:

```tsx
      <SessionsDialog
        open={sessionsDialogOpen}
        onClose={() => setSessionsDialogOpen(false)}
        sessions={sessions}
        tickedKeys={tickedSessions}
        onToggle={toggleSession}
        canTickMore={canTickMore}
        slotsLeft={maxTiles - totalPaneCount}
      />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean — strict TS confirms no `sessionsExpanded` reference survived.

- [ ] **Step 4: Do NOT commit yet**

This surface was reverted twice; the wiring commit waits for the user's live smoke in Task 5.

---

### Task 5: Fresh-run smoke, user drive, then commit

**Files:** none (verification gate).

- [ ] **Step 1: Restart the dev app cleanly**

Kill any running `npm run tauri dev`, then start it again (background). Do not trust a hot HMR state after this many edits — a stale HMR CSS graph produced the false "broken UI" alarm that killed attempt #1.

- [ ] **Step 2: Self-check before involving the user**

In the running app: pick a folder with many sessions, click "Show all" under Resume sessions. Confirm: dialog centered, rail counts match tabs, search focused, typing filters, Esc / backdrop / Done close it, ticks survive close, fonts and window layout intact.

- [ ] **Step 3: User drives**

Hand the app to the user for the same walk-through plus anything they want to poke. Fix-forward small feedback; anything structural goes back to brainstorming.

- [ ] **Step 4: Commit after user approval**

```bash
git add src/components/Welcome/Welcome.tsx
git commit -m "feat(welcome): Show all opens the all-sessions dialog"
```

---

## Self-review notes

- Spec coverage: trigger/inline-cap (T4), dialog layout+rail+local filter (T3), shared selection (T2+T4), search behavior (T1), empty state + English copy (T3), close behaviors (T3+T4), fresh-run smoke + user gate (T5). Out-of-scope items have no tasks, as intended.
- `SESSION_FILTER_TABS` order doubles as the rail order — no new constant needed.
- Type check: `SessionRow` props and `SessionsDialog` props match their uses in T3/T4; `slotsLeft = maxTiles - totalPaneCount` is the same arithmetic the tile picker uses.
