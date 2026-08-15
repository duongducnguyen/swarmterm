# Agent State Detection (Đ1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect four user-facing states (blocked / working / done / idle) for agent terminal panes and surface them as per-pane dots, a workspace rollup, and a "done until you look" seen-bit.

**Architecture:** A pure, herdr-compatible rule engine in `src/lib/agent-state/` evaluates data-driven manifests (ported from herdr's Apache-2.0 TOML) against a snapshot of the bottom of the xterm buffer plus OSC title/progress evidence. A per-terminal detector (300ms tick, content-seq throttle, 3s spawn grace, asymmetric working→idle debounce) publishes into a new zustand store; UI derives `done = idle && !seen`.

**Tech Stack:** TypeScript strict, Vitest, zustand, xterm.js buffer API. No Rust changes.

**Spec:** `docs/superpowers/specs/2026-08-15-agent-state-detection-design.md`

## Global Constraints

- TypeScript is strict incl. `noUnusedLocals`/`noUnusedParameters` — dead code fails `npx tsc --noEmit`.
- Every `src/lib/**` module is pure (no DOM, no timers unless injected) with a `*.test.ts` beside it; TDD: write the failing test first.
- Imports use the `@/` alias for `src/`.
- Comments explain *why*, not *what* — match the density of `terminal-registry.ts`.
- Manifest regexes MUST NOT use the `g` flag (`RegExp.test` with `g` is stateful and would corrupt evaluation).
- Detection never guesses blocked: unmatched screens fall back to `idle`.
- Run from repo root: `npm test` (Vitest run-once), `npx tsc --noEmit`. Both must pass before every commit claim.
- Work happens on branch `feat/agent-state-detection` (already created).

---

### Task 1: Types + region extractors

**Files:**
- Create: `src/lib/agent-state/types.ts`
- Create: `src/lib/agent-state/regions.ts`
- Test: `src/lib/agent-state/regions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all types below, plus `resolveRegion(region: Region, input: DetectionInput): string` and the helpers `bottomNonEmptyLines`, `topNonEmptyLines`, `afterLastHorizontalRule`, `promptBoxBody`, `afterLastPromptMarker`, `isHorizontalRule` (exported for tests).

- [ ] **Step 1: Write `types.ts`** (types only — no test file needed for a type-only module):

```ts
/**
 * Agent-state detection types. Engine semantics are ported from herdr
 * (https://github.com/herdr-sh/herdr, Apache-2.0, src/detect/manifest.rs,
 * manifest engine version 3) — see THIRD-PARTY-NOTICES.md.
 */

/** What detection rules can produce. `done` is NOT an engine state — it is
 *  derived in the UI as `idle && !seen` (see agent-state-store). */
export type AgentEngineState = 'working' | 'blocked' | 'idle' | 'unknown'

/** Engine states plus the derived `done`. */
export type DisplayState = 'working' | 'blocked' | 'done' | 'idle' | 'unknown'

/** Evidence a detection tick evaluates. `screen` is the bottom-of-buffer
 *  snapshot (see snapshot.ts); the OSC strings are the latest sanitized
 *  OSC 0/2 title and OSC 9 progress payloads ('' when none). */
export interface DetectionInput {
  screen: string
  oscTitle: string
  oscProgress: string
}

export type Region =
  | 'whole_recent'
  | 'osc_title'
  | 'osc_progress'
  | 'after_last_horizontal_rule'
  | 'prompt_box_body'
  | 'after_last_prompt_marker'
  | { bottomNonEmptyLines: number }
  | { topNonEmptyLines: number }

/** One matcher group. All present fields must pass (AND). `contains` needles
 *  are case-insensitive; `regex`/`lineRegex` are case-sensitive unless the
 *  pattern carries the `i` flag — herdr relies on this asymmetry. */
export interface Gate {
  contains?: string[]
  regex?: RegExp[]
  lineRegex?: RegExp[]
  all?: Gate[]
  any?: Gate[]
  not?: Gate[]
}

export interface Rule extends Gate {
  id: string
  state: AgentEngineState
  priority: number
  region: Region
  /** Winning rule with this set discards the whole tick (transcript-viewer
   *  freeze): no state publish at all. */
  skipStateUpdate?: boolean
  visibleIdle?: boolean
  visibleBlocker?: boolean
  visibleWorking?: boolean
}

export interface Manifest {
  id: string
  /** herdr manifest version this port was taken from, for future re-syncs. */
  herdrVersion: string
  rules: Rule[]
}

export interface Verdict {
  state: AgentEngineState
  visibleIdle: boolean
  visibleBlocker: boolean
  visibleWorking: boolean
  /** True when the winning rule had skipStateUpdate — caller must discard. */
  skip: boolean
  ruleId?: string
}
```

- [ ] **Step 2: Write the failing tests** in `src/lib/agent-state/regions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  afterLastHorizontalRule,
  afterLastPromptMarker,
  bottomNonEmptyLines,
  isHorizontalRule,
  promptBoxBody,
  resolveRegion,
  topNonEmptyLines
} from '@/lib/agent-state/regions'

describe('bottomNonEmptyLines', () => {
  it('returns the suffix FROM the Nth-from-last non-empty line, blanks included', () => {
    expect(bottomNonEmptyLines('a\nb\n\nc', 2)).toBe('b\n\nc')
  })
  it('returns empty string when there is no non-empty line', () => {
    expect(bottomNonEmptyLines('\n\n', 3)).toBe('')
  })
  it('returns the whole content when fewer than N non-empty lines exist', () => {
    expect(bottomNonEmptyLines('a\nb', 5)).toBe('a\nb')
  })
})

describe('topNonEmptyLines', () => {
  it('returns the prefix ENDING at the Nth non-empty line from the top', () => {
    expect(topNonEmptyLines('a\n\nb\nc', 2)).toBe('a\n\nb')
  })
  it('returns whole content when fewer than N non-empty lines exist', () => {
    expect(topNonEmptyLines('a', 3)).toBe('a')
  })
})

describe('isHorizontalRule', () => {
  it('accepts a bare dash run of any length', () => {
    expect(isHorizontalRule('─')).toBe(true)
    expect(isHorizontalRule('  ──  ')).toBe(true)
  })
  it('accepts a labelled rule only when the run is ≥3', () => {
    expect(isHorizontalRule('─── Label')).toBe(true)
    expect(isHorizontalRule('── Label')).toBe(false)
  })
  it('rejects non-rule lines', () => {
    expect(isHorizontalRule('hello')).toBe(false)
    expect(isHorizontalRule('')).toBe(false)
  })
})

describe('afterLastHorizontalRule', () => {
  it('returns everything after the last rule line', () => {
    expect(afterLastHorizontalRule('a\n───\nb\nc')).toBe('b\nc')
  })
  it('returns whole content when no rule exists', () => {
    expect(afterLastHorizontalRule('a\nb')).toBe('a\nb')
  })
})

describe('promptBoxBody', () => {
  it('returns lines strictly between the 2nd-from-bottom rule and the rule below it', () => {
    expect(promptBoxBody('history\n───\n❯ type here\n───')).toBe('❯ type here')
  })
  it('returns empty string with fewer than two rules', () => {
    expect(promptBoxBody('a\n───\nb')).toBe('')
  })
})

describe('afterLastPromptMarker (Codex › prompt)', () => {
  it('returns the suffix after the last › marker line', () => {
    expect(afterLastPromptMarker('out\n› ask\nanswer')).toBe('answer')
    expect(afterLastPromptMarker('out\n›\nanswer')).toBe('answer')
  })
  it('returns whole content when no marker exists', () => {
    expect(afterLastPromptMarker('a\nb')).toBe('a\nb')
  })
  it('does not treat mid-line › as a marker', () => {
    expect(afterLastPromptMarker('say › hi\nb')).toBe('say › hi\nb')
  })
})

describe('resolveRegion', () => {
  const input = { screen: 'l1\nl2\nl3', oscTitle: '✳ Ready', oscProgress: '4;0' }
  it('maps osc regions to the OSC evidence, not the screen', () => {
    expect(resolveRegion('osc_title', input)).toBe('✳ Ready')
    expect(resolveRegion('osc_progress', input)).toBe('4;0')
  })
  it('maps whole_recent to the untouched screen', () => {
    expect(resolveRegion('whole_recent', input)).toBe('l1\nl2\nl3')
  })
  it('maps parameterised regions', () => {
    expect(resolveRegion({ bottomNonEmptyLines: 2 }, input)).toBe('l2\nl3')
    expect(resolveRegion({ topNonEmptyLines: 1 }, input)).toBe('l1')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent-state/regions.test.ts`
Expected: FAIL — module `regions.ts` does not exist.

- [ ] **Step 4: Implement `regions.ts`**

```ts
import type { DetectionInput, Region } from '@/lib/agent-state/types'

/**
 * Region extractors over a detection snapshot — a TS port of herdr's region
 * semantics (Apache-2.0, src/detect/manifest.rs:1255-1499 and the Codex
 * prompt-marker helpers at :1357-1422; see THIRD-PARTY-NOTICES.md). Regions
 * slice the snapshot narrowly so rules can anchor to stable TUI chrome
 * instead of scanning the whole screen — herdr's core false-positive defence.
 */

const isBlank = (line: string): boolean => line.trim() === ''

/** Suffix starting at the Nth-from-last non-empty line — intervening blank
 *  lines are INCLUDED (this is "cut above here", not "take N lines"). */
export function bottomNonEmptyLines(content: string, n: number): string {
  const lines = content.split('\n')
  let seen = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!isBlank(lines[i])) {
      seen++
      if (seen === n) return lines.slice(i).join('\n')
    }
  }
  return seen === 0 ? '' : content
}

/** Prefix ending at the Nth non-empty line from the top. */
export function topNonEmptyLines(content: string, n: number): string {
  const lines = content.split('\n')
  let seen = 0
  for (let i = 0; i < lines.length; i++) {
    if (!isBlank(lines[i])) {
      seen++
      if (seen === n) return lines.slice(0, i + 1).join('\n')
    }
  }
  return seen === 0 ? '' : content
}

/** A horizontal rule is a trimmed line whose leading run of `─` is ≥1 and
 *  either fills the line, or is ≥3 when a label follows (`─── Label`). */
export function isHorizontalRule(line: string): boolean {
  const t = line.trim()
  let run = 0
  while (run < t.length && t[run] === '─') run++
  if (run === 0) return false
  return run === t.length || run >= 3
}

export function afterLastHorizontalRule(content: string): string {
  const lines = content.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isHorizontalRule(lines[i])) return lines.slice(i + 1).join('\n')
  }
  return content
}

/** The 2nd horizontal rule from the bottom is the prompt box's top border;
 *  the body is what sits strictly between it and the rule below it. */
export function promptBoxBody(content: string): string {
  const lines = content.split('\n')
  const rules: number[] = []
  for (let i = lines.length - 1; i >= 0 && rules.length < 2; i--) {
    if (isHorizontalRule(lines[i])) rules.push(i)
  }
  if (rules.length < 2) return ''
  const [bottom, top] = rules
  return lines.slice(top + 1, bottom).join('\n')
}

/** Codex draws its composer as a line that IS `›` or starts with `› `. */
const isCodexPromptLine = (line: string): boolean => line === '›' || line.startsWith('› ')

export function afterLastPromptMarker(content: string): string {
  const lines = content.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isCodexPromptLine(lines[i])) return lines.slice(i + 1).join('\n')
  }
  return content
}

export function resolveRegion(region: Region, input: DetectionInput): string {
  if (typeof region === 'object') {
    return 'bottomNonEmptyLines' in region
      ? bottomNonEmptyLines(input.screen, region.bottomNonEmptyLines)
      : topNonEmptyLines(input.screen, region.topNonEmptyLines)
  }
  switch (region) {
    case 'whole_recent':
      return input.screen
    case 'osc_title':
      return input.oscTitle
    case 'osc_progress':
      return input.oscProgress
    case 'after_last_horizontal_rule':
      return afterLastHorizontalRule(input.screen)
    case 'prompt_box_body':
      return promptBoxBody(input.screen)
    case 'after_last_prompt_marker':
      return afterLastPromptMarker(input.screen)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent-state/regions.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-state/types.ts src/lib/agent-state/regions.ts src/lib/agent-state/regions.test.ts
git commit -m "feat(agent-state): detection types and region extractors"
```

---

### Task 2: Rule engine

**Files:**
- Create: `src/lib/agent-state/engine.ts`
- Test: `src/lib/agent-state/engine.test.ts`

**Interfaces:**
- Consumes: `types.ts` (Gate, Rule, Manifest, Verdict, DetectionInput), `regions.ts` (`resolveRegion`).
- Produces: `evaluateManifest(manifest: Manifest, input: DetectionInput): Verdict` and `gateMatches(gate: Gate, text: string): boolean` (exported for tests).

- [ ] **Step 1: Write the failing tests** in `src/lib/agent-state/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evaluateManifest, gateMatches } from '@/lib/agent-state/engine'
import type { Manifest, Rule } from '@/lib/agent-state/types'

const input = (screen: string, oscTitle = '', oscProgress = ''): Parameters<typeof evaluateManifest>[1] => ({
  screen,
  oscTitle,
  oscProgress
})

const rule = (over: Partial<Rule> & Pick<Rule, 'id' | 'state'>): Rule => ({
  priority: 0,
  region: 'whole_recent',
  ...over
})

const manifest = (...rules: Rule[]): Manifest => ({ id: 'test', herdrVersion: 't', rules })

describe('gateMatches', () => {
  it('requires ALL contains needles, case-insensitively', () => {
    expect(gateMatches({ contains: ['Foo', 'bar'] }, 'FOO and BAR')).toBe(true)
    expect(gateMatches({ contains: ['foo', 'missing'] }, 'foo only')).toBe(false)
  })
  it('regex is case-sensitive unless the pattern has the i flag', () => {
    expect(gateMatches({ regex: [/Foo/] }, 'foo')).toBe(false)
    expect(gateMatches({ regex: [/Foo/i] }, 'foo')).toBe(true)
  })
  it('lineRegex needs each pattern to match at least one LINE', () => {
    expect(gateMatches({ lineRegex: [/^b$/] }, 'a\nb')).toBe(true)
    expect(gateMatches({ lineRegex: [/^a\nb$/] }, 'a\nb')).toBe(false)
  })
  it('any needs one branch; not fails when any branch matches; all needs every branch', () => {
    expect(gateMatches({ any: [{ contains: ['x'] }, { contains: ['y'] }] }, 'has y')).toBe(true)
    expect(gateMatches({ not: [{ contains: ['y'] }] }, 'has y')).toBe(false)
    expect(gateMatches({ all: [{ contains: ['a'] }, { contains: ['b'] }] }, 'a b')).toBe(true)
    expect(gateMatches({ all: [{ contains: ['a'] }, { contains: ['b'] }] }, 'a only')).toBe(false)
  })
  it('nests gates (any containing contains + nested any)', () => {
    const gate = { contains: ['do you want to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] }
    expect(gateMatches(gate, 'Do you want to proceed? ❯')).toBe(true)
    expect(gateMatches(gate, 'Do you want to proceed?')).toBe(false)
  })
})

describe('evaluateManifest', () => {
  it('highest priority wins', () => {
    const m = manifest(
      rule({ id: 'low', state: 'idle', priority: 100, contains: ['x'] }),
      rule({ id: 'high', state: 'blocked', priority: 900, contains: ['x'] })
    )
    expect(evaluateManifest(m, input('x')).state).toBe('blocked')
  })
  it('ties go to the FIRST rule in manifest order', () => {
    const m = manifest(
      rule({ id: 'first', state: 'working', priority: 500, contains: ['x'] }),
      rule({ id: 'second', state: 'blocked', priority: 500, contains: ['x'] })
    )
    expect(evaluateManifest(m, input('x')).ruleId).toBe('first')
  })
  it('falls back to idle when nothing matches — never guesses blocked', () => {
    const v = evaluateManifest(manifest(rule({ id: 'r', state: 'blocked', contains: ['nope'] })), input('screen'))
    expect(v.state).toBe('idle')
    expect(v.skip).toBe(false)
  })
  it('skipStateUpdate on the winner discards the tick', () => {
    const m = manifest(rule({ id: 'freeze', state: 'unknown', priority: 1000, skipStateUpdate: true, contains: ['transcript'] }))
    expect(evaluateManifest(m, input('showing transcript')).skip).toBe(true)
  })
  it('visible flags are reported only when the winning state agrees', () => {
    const m = manifest(rule({ id: 'r', state: 'blocked', visibleBlocker: true, visibleIdle: true, contains: ['x'] }))
    const v = evaluateManifest(m, input('x'))
    expect(v.visibleBlocker).toBe(true)
    expect(v.visibleIdle).toBe(false)
  })
  it('each rule evaluates against its OWN region', () => {
    const m = manifest(
      rule({ id: 'title', state: 'working', priority: 1100, region: 'osc_title', regex: [/^\u{2733} /u] })
    )
    expect(evaluateManifest(m, input('screen text', '✳ Ready')).state).toBe('working')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent-state/engine.test.ts`
Expected: FAIL — module `engine.ts` does not exist.

- [ ] **Step 3: Implement `engine.ts`**

```ts
import { resolveRegion } from '@/lib/agent-state/regions'
import type { DetectionInput, Gate, Manifest, Verdict } from '@/lib/agent-state/types'

/**
 * herdr-compatible rule evaluation (Apache-2.0 port, src/detect/manifest.rs:
 * 415-496 main loop, 1206-1253 gate matching; see THIRD-PARTY-NOTICES.md).
 * Compatibility matters because it keeps herdr's battle-tested manifests
 * copy-portable when agent TUIs change: every rule is evaluated (no
 * short-circuit), the highest priority wins, ties keep the FIRST rule in
 * manifest order, `contains` is case-insensitive while regexes are not, and
 * an unmatched screen falls back to idle — detection must never guess
 * blocked.
 */

export function gateMatches(gate: Gate, text: string, lower?: string): boolean {
  // Lowered once per rule evaluation and shared down the gate tree — herdr
  // lowers needles at compile time; lowering at match keeps manifests
  // readable as written.
  const lowerText = lower ?? text.toLowerCase()
  if (gate.contains !== undefined && !gate.contains.every((n) => lowerText.includes(n.toLowerCase()))) {
    return false
  }
  if (gate.regex !== undefined && !gate.regex.every((r) => r.test(text))) return false
  if (gate.lineRegex !== undefined) {
    const lines = text.split('\n')
    if (!gate.lineRegex.every((r) => lines.some((l) => r.test(l)))) return false
  }
  if (gate.all !== undefined && !gate.all.every((g) => gateMatches(g, text, lowerText))) return false
  if (gate.any !== undefined && gate.any.length > 0 && !gate.any.some((g) => gateMatches(g, text, lowerText))) {
    return false
  }
  if (gate.not !== undefined && gate.not.some((g) => gateMatches(g, text, lowerText))) return false
  return true
}

const NO_MATCH: Verdict = {
  // Agent panes are the only callers, so the agent is always "known" here —
  // herdr's default_known_agent_idle_fallback, not Unknown.
  state: 'idle',
  visibleIdle: false,
  visibleBlocker: false,
  visibleWorking: false,
  skip: false
}

export function evaluateManifest(manifest: Manifest, input: DetectionInput): Verdict {
  let winner: Manifest['rules'][number] | undefined
  for (const rule of manifest.rules) {
    const text = resolveRegion(rule.region, input)
    if (!gateMatches(rule, text)) continue
    // `>` (not `>=`) keeps the incumbent on ties — first in manifest order wins.
    if (winner === undefined || rule.priority > winner.priority) winner = rule
  }
  if (winner === undefined) return NO_MATCH
  if (winner.skipStateUpdate === true) {
    return { state: 'unknown', visibleIdle: false, visibleBlocker: false, visibleWorking: false, skip: true, ruleId: winner.id }
  }
  return {
    state: winner.state,
    visibleIdle: winner.visibleIdle === true && winner.state === 'idle',
    visibleBlocker: winner.visibleBlocker === true && winner.state === 'blocked',
    visibleWorking: winner.visibleWorking === true && winner.state === 'working',
    skip: false,
    ruleId: winner.id
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent-state/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-state/engine.ts src/lib/agent-state/engine.test.ts
git commit -m "feat(agent-state): herdr-compatible rule engine"
```

---

### Task 3: Manifests for claude-code / codex / opencode + attribution

**Files:**
- Create: `src/lib/agent-state/manifests/claude-code.ts`
- Create: `src/lib/agent-state/manifests/codex.ts`
- Create: `src/lib/agent-state/manifests/opencode.ts`
- Create: `src/lib/agent-state/manifests/index.ts`
- Create: `THIRD-PARTY-NOTICES.md` (repo root)
- Test: `src/lib/agent-state/manifests/manifests.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`Manifest`), `engine.ts` (`evaluateManifest` — in tests).
- Produces: `manifestForAgent(agentId: string | undefined): Manifest | undefined` mapping template ids `'claude-code' | 'codex' | 'opencode'` (as defined in `src/lib/templates.ts`) to their manifests; `'terminal'`/undefined → `undefined`.

Every manifest file starts with this attribution header (adjust source file name per agent):

```ts
/**
 * Detection rules for <agent>, ported to TypeScript from herdr's
 * src/detect/manifests/<file>.toml (manifest version <version>).
 * herdr is licensed under the Apache License 2.0; this derived file is
 * modified from the original. See THIRD-PARTY-NOTICES.md at the repo root.
 *
 * Regex translation from Rust `regex` syntax: `\x{2733}` → `\u{2733}` with
 * the `u` flag; inline `(?i)`/`(?m)` → RegExp flags; `\A` → `^` (no `m`).
 * NEVER add the `g` flag — RegExp.test with `g` is stateful.
 */
```

- [ ] **Step 1: Write the failing fixture tests** in `src/lib/agent-state/manifests/manifests.test.ts`. These fixtures are hand-written screens/titles per state and double as regression armor for future herdr re-syncs:

```ts
import { describe, expect, it } from 'vitest'
import { evaluateManifest } from '@/lib/agent-state/engine'
import { claudeCodeManifest } from '@/lib/agent-state/manifests/claude-code'
import { codexManifest } from '@/lib/agent-state/manifests/codex'
import { opencodeManifest } from '@/lib/agent-state/manifests/opencode'
import { manifestForAgent } from '@/lib/agent-state/manifests'

const input = (screen: string, oscTitle = '', oscProgress = ''): Parameters<typeof evaluateManifest>[1] => ({
  screen,
  oscTitle,
  oscProgress
})

describe('manifestForAgent', () => {
  it('maps agent template ids and refuses plain terminals', () => {
    expect(manifestForAgent('claude-code')?.id).toBe('claude-code')
    expect(manifestForAgent('codex')?.id).toBe('codex')
    expect(manifestForAgent('opencode')?.id).toBe('opencode')
    expect(manifestForAgent('terminal')).toBeUndefined()
    expect(manifestForAgent(undefined)).toBeUndefined()
  })
})

describe('claude-code manifest', () => {
  it('braille or half-circle spinner in the OSC title means working', () => {
    expect(evaluateManifest(claudeCodeManifest, input('anything', '⠹ Reticulating…')).state).toBe('working')
    expect(evaluateManifest(claudeCodeManifest, input('anything', '◐ Thinking…')).state).toBe('working')
  })
  it('✳ in the OSC title means idle', () => {
    const v = evaluateManifest(claudeCodeManifest, input('anything', '✳ Ready'))
    expect(v.state).toBe('idle')
    expect(v.visibleIdle).toBe(true)
  })
  it('a bash permission prompt is blocked', () => {
    const screen = [
      'Bash command',
      '',
      '  rm -rf node_modules',
      '',
      'Do you want to proceed?',
      '❯ 1. Yes',
      '  2. No, and tell Claude what to do differently (esc)'
    ].join('\n')
    const v = evaluateManifest(claudeCodeManifest, input(screen))
    expect(v.state).toBe('blocked')
    expect(v.visibleBlocker).toBe(true)
  })
  it('a confirm form after the last rule is blocked', () => {
    const screen = ['───', 'Create file src/foo.ts?', '', 'enter to confirm · esc to cancel'].join('\n')
    expect(evaluateManifest(claudeCodeManifest, input(screen)).state).toBe('blocked')
  })
  it('the ❯ prompt box body is idle, but not when a menu is open inside it', () => {
    const idleScreen = ['some output', '───', ' ❯ ', '───'].join('\n')
    expect(evaluateManifest(claudeCodeManifest, input(idleScreen)).state).toBe('idle')
    const menuScreen = ['some output', '───', ' ❯ pick one — enter to select · tab/arrow keys to navigate', '───'].join('\n')
    expect(evaluateManifest(claudeCodeManifest, input(menuScreen)).state).not.toBe('idle')
  })
  it('the transcript viewer freezes state (skip)', () => {
    const screen = ['big transcript', 'Showing detailed transcript', 'ctrl+o to toggle · ↑↓ scroll'].join('\n')
    expect(evaluateManifest(claudeCodeManifest, input(screen)).skip).toBe(true)
  })
  it('OSC 9 progress cleared (4;0) reads idle', () => {
    expect(evaluateManifest(claudeCodeManifest, input('anything', '', '4;0')).state).toBe('idle')
  })
})

describe('codex manifest', () => {
  it('"Action Required" title beats the working spinner title', () => {
    const v = evaluateManifest(codexManifest, input('screen', '⠙ Action Required'))
    expect(v.state).toBe('blocked')
  })
  it('braille spinner title means working', () => {
    expect(evaluateManifest(codexManifest, input('screen', '⠙ codex')).state).toBe('working')
  })
  it('a non-spinner title means idle', () => {
    const v = evaluateManifest(codexManifest, input('screen', 'codex — ready'))
    expect(v.state).toBe('idle')
    expect(v.visibleIdle).toBe(true)
  })
  it('the trust-directory prompt is blocked', () => {
    const screen = ['> You are in /work/repo', '', 'Do you trust the contents of this directory?'].join('\n')
    expect(evaluateManifest(codexManifest, input(screen)).state).toBe('blocked')
  })
  it('a strong blocker after the › prompt marker is blocked', () => {
    const screen = ['done stuff', '› ', 'Allow command? Press enter to confirm or esc to cancel'].join('\n')
    expect(evaluateManifest(codexManifest, input(screen)).state).toBe('blocked')
  })
  it('the • Working footer means working', () => {
    const screen = ['output', '• Working (3s · esc to interrupt)'].join('\n')
    expect(evaluateManifest(codexManifest, input(screen)).state).toBe('working')
  })
  it('the transcript viewer freezes state', () => {
    const screen = ['history', '› ', '↑/↓ to scroll · pgup/pgdn to page · home/end to jump · q to quit · esc to edit prev'].join('\n')
    expect(evaluateManifest(codexManifest, input(screen)).skip).toBe(true)
  })
})

describe('opencode manifest', () => {
  it('△ Permission required is blocked', () => {
    const v = evaluateManifest(opencodeManifest, input('stuff\n△ Permission required'))
    expect(v.state).toBe('blocked')
    expect(v.visibleBlocker).toBe(true)
  })
  it('the dialog footer variant is blocked', () => {
    const screen = 'question\n↑↓ select · enter confirm · esc dismiss'
    expect(evaluateManifest(opencodeManifest, input(screen)).state).toBe('blocked')
  })
  it('esc-to-interrupt hint means working', () => {
    expect(evaluateManifest(opencodeManifest, input('thinking… esc to interrupt')).state).toBe('working')
  })
  it('a progress bar run means working', () => {
    expect(evaluateManifest(opencodeManifest, input('■■■■■□□')).state).toBe('working')
  })
  it('a quiet screen falls back to idle', () => {
    expect(evaluateManifest(opencodeManifest, input('$ ready')).state).toBe('idle')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent-state/manifests/manifests.test.ts`
Expected: FAIL — manifest modules do not exist.

- [ ] **Step 3: Write `claude-code.ts`** — a faithful port of herdr `claude.toml` version `2026.08.13.1` (all 12 rules; the attribution header from above goes on top):

```ts
import type { Manifest } from '@/lib/agent-state/types'

export const claudeCodeManifest: Manifest = {
  id: 'claude-code',
  herdrVersion: '2026.08.13.1',
  rules: [
    {
      id: 'osc_title_working',
      state: 'working',
      priority: 1100,
      region: 'osc_title',
      visibleWorking: true,
      // Braille covers Claude Code ≤ 2.1.227; half-circles are the 2.1.228 busy spinner.
      regex: [/^[\u{2800}-\u{28FF}\u{25D0}-\u{25D3}] /u]
    },
    {
      id: 'btw_overlay_working',
      state: 'working',
      priority: 975,
      region: { bottomNonEmptyLines: 5 },
      visibleWorking: true,
      lineRegex: [/^\s*\/btw(?:\s|$)/, /esc to close\s*$/i]
    },
    {
      id: 'transcript_viewer',
      state: 'unknown',
      priority: 1000,
      region: { bottomNonEmptyLines: 3 },
      skipStateUpdate: true,
      contains: ['showing detailed transcript'],
      any: [
        { contains: ['ctrl+o', 'to toggle'] },
        { contains: ['ctrl+e', 'show all'] },
        { contains: ['ctrl+e', 'collapse'] },
        { contains: ['↑↓ scroll'] },
        { contains: ['? for shortcuts'] }
      ]
    },
    {
      id: 'live_blocked_form',
      state: 'blocked',
      priority: 980,
      region: 'after_last_horizontal_rule',
      visibleBlocker: true,
      contains: ['esc to cancel'],
      any: [
        { contains: ['enter to confirm'] },
        {
          contains: ['enter to select'],
          any: [
            { contains: ['tab/arrow keys to navigate'] },
            { contains: ['arrow keys to navigate'] },
            { contains: ['arrows to navigate'] },
            { contains: ['↑/↓ to navigate'] },
            { contains: ['↑↓ to navigate'] }
          ]
        }
      ]
    },
    {
      id: 'dynamic_workflow_prompt',
      state: 'blocked',
      priority: 980,
      region: 'whole_recent',
      visibleBlocker: true,
      contains: ['run a dynamic workflow?', 'esc to cancel']
    },
    {
      id: 'live_prompt_box',
      state: 'idle',
      priority: 950,
      region: 'prompt_box_body',
      visibleIdle: true,
      lineRegex: [/^\s*❯/],
      not: [
        { contains: ['enter to select'] },
        { contains: ['esc to cancel'] },
        { contains: ['tab/arrow keys'] },
        { contains: ['arrow keys to navigate'] },
        { contains: ['↑/↓ to navigate'] }
      ]
    },
    {
      id: 'model_picker_menu',
      state: 'unknown',
      priority: 900,
      region: 'whole_recent',
      skipStateUpdate: true,
      contains: ['select model', 'enter to set as default', 'esc to cancel'],
      not: [{ contains: ['do you want to proceed?'] }, { contains: ['enter to select'] }]
    },
    {
      id: 'bash_permission_prompt',
      state: 'blocked',
      priority: 850,
      region: 'whole_recent',
      visibleBlocker: true,
      contains: ['do you want to proceed?'],
      any: [
        { contains: ['bash command'] },
        { contains: ['bash('] },
        { contains: ['contains expansion'] },
        { contains: ['tab to amend'] },
        { contains: ['ctrl+e to explain'] }
      ],
      all: [
        {
          any: [
            { lineRegex: [/^\s*❯?\s*yes\b/i] },
            { lineRegex: [/^\s*1\.\s*yes\b/i] },
            { lineRegex: [/^\s*2\.\s*no\b/i] }
          ]
        }
      ]
    },
    {
      id: 'generic_permission_prompt',
      state: 'blocked',
      priority: 840,
      region: 'after_last_horizontal_rule',
      visibleBlocker: true,
      contains: ['do you want to proceed?', 'esc to cancel'],
      all: [
        {
          any: [
            { lineRegex: [/^\s*❯?\s*1\.\s*yes\b/i] },
            { lineRegex: [/^\s*2\.\s*yes\b/i] },
            { lineRegex: [/^\s*2\.\s*no\b/i] },
            { lineRegex: [/^\s*3\.\s*no\b/i] }
          ]
        }
      ]
    },
    {
      id: 'legacy_no_prompt_blocker',
      state: 'blocked',
      priority: 300,
      region: 'whole_recent',
      any: [
        { contains: ['do you want to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] },
        { contains: ['would you like to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] },
        { contains: ['waiting for permission'] },
        { contains: ['do you want to allow this connection?'] },
        { contains: ['tab to amend'] },
        { contains: ['ctrl+e to explain'] },
        { contains: ['do you want to proceed?', 'esc to cancel'] },
        { contains: ['review your answers'] },
        { contains: ['skip interview and plan immediately'] }
      ],
      not: [{ regex: [/^\s*❯\s*$/m] }]
    },
    {
      id: 'osc_title_idle',
      state: 'idle',
      priority: 250,
      region: 'osc_title',
      visibleIdle: true,
      regex: [/^\u{2733} /u]
    },
    {
      id: 'osc_progress_idle',
      state: 'idle',
      priority: 250,
      region: 'osc_progress',
      regex: [/^4;0/]
    }
  ]
}
```

- [ ] **Step 4: Write `codex.ts`** — port of herdr `codex.toml` version `2026.08.09.1` (8 rules; attribution header on top):

```ts
import type { Manifest } from '@/lib/agent-state/types'

const CODEX_SPINNER = /(?:^| )[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?: |$)/

export const codexManifest: Manifest = {
  id: 'codex',
  herdrVersion: '2026.08.09.1',
  rules: [
    {
      id: 'osc_title_blocked',
      state: 'blocked',
      priority: 1100,
      region: 'osc_title',
      visibleBlocker: true,
      contains: ['Action Required']
    },
    {
      id: 'osc_title_working',
      state: 'working',
      priority: 1050,
      region: 'osc_title',
      visibleWorking: true,
      regex: [CODEX_SPINNER]
    },
    {
      id: 'transcript_viewer',
      state: 'unknown',
      priority: 1000,
      region: 'after_last_prompt_marker',
      skipStateUpdate: true,
      contains: ['↑/↓ to scroll', 'pgup/pgdn to', 'home/end to jump', 'q to quit'],
      any: [{ contains: ['esc to edit prev'] }, { contains: ['esc/← to edit prev'] }]
    },
    {
      id: 'trust_directory',
      state: 'blocked',
      priority: 950,
      region: { topNonEmptyLines: 20 },
      visibleBlocker: true,
      all: [
        { regex: [/^> You are in [^\r\n]+(?:\r?\n|$)/] },
        { regex: [/Do\s+you\s+trust\s+the\s+contents\s+of\s+this\s+directory\?/] }
      ]
    },
    {
      id: 'live_strong_blocker',
      state: 'blocked',
      priority: 900,
      region: 'after_last_prompt_marker',
      visibleBlocker: true,
      any: [
        { contains: ['press enter to confirm or esc to cancel'] },
        { contains: ['enter to submit answer'] },
        { contains: ['enter to submit all'] },
        { contains: ['allow command?'] }
      ]
    },
    {
      id: 'weak_blocker',
      state: 'blocked',
      priority: 600,
      region: 'whole_recent',
      any: [
        { contains: ['[y/n]'] },
        { contains: ['yes (y)'] },
        { contains: ['do you want to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] },
        { contains: ['would you like to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] }
      ]
    },
    {
      id: 'screen_working_fallback',
      state: 'working',
      priority: 500,
      region: { bottomNonEmptyLines: 3 },
      visibleWorking: true,
      lineRegex: [/^[•◦]\s+Working \([^)]*esc to interrupt\)(?: · .*)?$/],
      not: [{ contains: ['■ Conversation interrupted'] }]
    },
    {
      id: 'osc_title_idle',
      state: 'idle',
      priority: 100,
      region: 'osc_title',
      visibleIdle: true,
      regex: [/\S/],
      not: [{ regex: [CODEX_SPINNER] }, { contains: ['Action Required'] }]
    }
  ]
}
```

- [ ] **Step 5: Write `opencode.ts`** — port of herdr `opencode.toml` version `2026.06.10.1` (3 rules; attribution header on top):

```ts
import type { Manifest } from '@/lib/agent-state/types'

export const opencodeManifest: Manifest = {
  id: 'opencode',
  herdrVersion: '2026.06.10.1',
  rules: [
    {
      id: 'permission_required',
      state: 'blocked',
      priority: 300,
      region: 'whole_recent',
      visibleBlocker: true,
      any: [
        { contains: ['△ Permission required'] },
        {
          contains: ['esc dismiss'],
          any: [{ contains: ['enter confirm'] }, { contains: ['enter submit'] }, { contains: ['enter toggle'] }],
          all: [{ any: [{ contains: ['↑↓ select'] }, { contains: ['⇆ tab'] }] }]
        }
      ]
    },
    {
      id: 'interrupt_hint_working',
      state: 'working',
      priority: 110,
      region: 'whole_recent',
      visibleWorking: true,
      any: [
        { contains: ['esc to interrupt'] },
        { contains: ['ctrl+c to interrupt'] },
        { contains: ['press esc to interrupt'] },
        { lineRegex: [/.*opencode.*esc (again to )?interrupt/i] }
      ]
    },
    {
      id: 'progress_bar_working',
      state: 'working',
      priority: 100,
      region: 'whole_recent',
      visibleWorking: true,
      regex: [/(■|⬝){4,}/]
    }
  ]
}
```

- [ ] **Step 6: Write `manifests/index.ts`**:

```ts
import { claudeCodeManifest } from '@/lib/agent-state/manifests/claude-code'
import { codexManifest } from '@/lib/agent-state/manifests/codex'
import { opencodeManifest } from '@/lib/agent-state/manifests/opencode'
import type { Manifest } from '@/lib/agent-state/types'

/** Keyed by workspace template id (src/lib/templates.ts), NOT herdr agent id. */
const MANIFESTS: Record<string, Manifest> = {
  'claude-code': claudeCodeManifest,
  codex: codexManifest,
  opencode: opencodeManifest
}

/** undefined for plain 'terminal' panes and unknown ids — no detection. */
export function manifestForAgent(agentId: string | undefined): Manifest | undefined {
  return agentId === undefined ? undefined : MANIFESTS[agentId]
}
```

- [ ] **Step 7: Write `THIRD-PARTY-NOTICES.md`** at the repo root:

```markdown
# Third-party notices

## herdr (Apache License 2.0)

The agent-state detection rule data and engine semantics under
`src/lib/agent-state/` are ported (with modifications) from
[herdr](https://github.com/herdr-sh/herdr) — engine
`src/detect/manifest.rs`, rule manifests `src/detect/manifests/{claude,codex,opencode}.toml`.

herdr is licensed under the Apache License, Version 2.0
(http://www.apache.org/licenses/LICENSE-2.0). The ported files are
distributed as part of Swarmterm under GPL-3.0 (Apache-2.0 → GPL-3.0 is a
one-way compatible combination); each derived file carries a header noting
its origin and that it has been modified.
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent-state/manifests/manifests.test.ts`
Expected: PASS. If a fixture fails, debug the RULE PORT (compare against the herdr TOML quoted in the spec's research trail), not the fixture — fixtures encode herdr's intended behavior. Exception: a fixture that misreads herdr semantics (e.g. forgets `contains` is AND) may be corrected, with a comment.

- [ ] **Step 9: Commit**

```bash
git add src/lib/agent-state/manifests/ THIRD-PARTY-NOTICES.md
git commit -m "feat(agent-state): ported herdr manifests for claude-code, codex, opencode"
```

---

### Task 4: Debounce + tick scheduling decisions

**Files:**
- Create: `src/lib/agent-state/pending-idle.ts`
- Create: `src/lib/agent-state/detect-schedule.ts`
- Test: `src/lib/agent-state/pending-idle.test.ts`
- Test: `src/lib/agent-state/detect-schedule.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`AgentEngineState`, `Verdict`).
- Produces:
  - `decideIdleHold(args: { prev: AgentEngineState; next: Verdict; pending: PendingIdle | null; now: number; processExited: boolean }): { publish: boolean; pending: PendingIdle | null }` with `interface PendingIdle { startedAt: number; confirmations: number }`
  - Constants `PENDING_IDLE_RECHECK_MS = 100`, `PENDING_IDLE_CONFIRMATIONS = 3`, `PENDING_IDLE_CAP_MS = 700`, `TICK_MS = 300`, `SPAWN_GRACE_MS = 3000`
  - `inSpawnGrace(spawnedAt: number, now: number): boolean`
  - `shouldSkipScreenScan(args: { state: AgentEngineState; contentSeq: number; lastScannedSeq: number; pendingIdle: boolean }): boolean`

- [ ] **Step 1: Write the failing tests** in `pending-idle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decideIdleHold, PENDING_IDLE_CAP_MS } from '@/lib/agent-state/pending-idle'
import type { Verdict } from '@/lib/agent-state/types'

const idle = (over: Partial<Verdict> = {}): Verdict => ({
  state: 'idle',
  visibleIdle: false,
  visibleBlocker: false,
  visibleWorking: false,
  skip: false,
  ...over
})

describe('decideIdleHold', () => {
  it('publishes blocked immediately — asymmetry is the point', () => {
    const d = decideIdleHold({ prev: 'working', next: idle({ state: 'blocked' }), pending: null, now: 0, processExited: false })
    expect(d.publish).toBe(true)
    expect(d.pending).toBeNull()
  })
  it('holds working → plain idle for 3 confirmations', () => {
    let d = decideIdleHold({ prev: 'working', next: idle(), pending: null, now: 0, processExited: false })
    expect(d.publish).toBe(false)
    d = decideIdleHold({ prev: 'working', next: idle(), pending: d.pending, now: 100, processExited: false })
    expect(d.publish).toBe(false)
    d = decideIdleHold({ prev: 'working', next: idle(), pending: d.pending, now: 200, processExited: false })
    expect(d.publish).toBe(false)
    d = decideIdleHold({ prev: 'working', next: idle(), pending: d.pending, now: 300, processExited: false })
    expect(d.publish).toBe(true)
    expect(d.pending).toBeNull()
  })
  it('visible_idle bypasses the hold (live prompt box IS proof)', () => {
    const d = decideIdleHold({ prev: 'working', next: idle({ visibleIdle: true }), pending: null, now: 0, processExited: false })
    expect(d.publish).toBe(true)
  })
  it('a working verdict mid-hold cancels the pending idle', () => {
    const first = decideIdleHold({ prev: 'working', next: idle(), pending: null, now: 0, processExited: false })
    const d = decideIdleHold({ prev: 'working', next: idle({ state: 'working' }), pending: first.pending, now: 100, processExited: false })
    expect(d.publish).toBe(true)
    expect(d.pending).toBeNull()
  })
  it('gives up and publishes after the hard cap', () => {
    const first = decideIdleHold({ prev: 'working', next: idle(), pending: null, now: 0, processExited: false })
    const d = decideIdleHold({ prev: 'working', next: idle(), pending: first.pending, now: PENDING_IDLE_CAP_MS, processExited: false })
    expect(d.publish).toBe(true)
  })
  it('process exit bypasses the hold', () => {
    const d = decideIdleHold({ prev: 'working', next: idle(), pending: null, now: 0, processExited: true })
    expect(d.publish).toBe(true)
  })
  it('idle → idle publishes (store dedups); only working→idle is held', () => {
    const d = decideIdleHold({ prev: 'idle', next: idle(), pending: null, now: 0, processExited: false })
    expect(d.publish).toBe(true)
  })
})
```

And in `detect-schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { inSpawnGrace, shouldSkipScreenScan, SPAWN_GRACE_MS } from '@/lib/agent-state/detect-schedule'

describe('inSpawnGrace', () => {
  it('is true strictly inside the window, false at and after its end', () => {
    expect(inSpawnGrace(1000, 1000 + SPAWN_GRACE_MS - 1)).toBe(true)
    expect(inSpawnGrace(1000, 1000 + SPAWN_GRACE_MS)).toBe(false)
  })
})

describe('shouldSkipScreenScan', () => {
  it('skips only when idle with no new output and no pending hold', () => {
    expect(shouldSkipScreenScan({ state: 'idle', contentSeq: 5, lastScannedSeq: 5, pendingIdle: false })).toBe(true)
    expect(shouldSkipScreenScan({ state: 'idle', contentSeq: 6, lastScannedSeq: 5, pendingIdle: false })).toBe(false)
    expect(shouldSkipScreenScan({ state: 'working', contentSeq: 5, lastScannedSeq: 5, pendingIdle: false })).toBe(false)
    expect(shouldSkipScreenScan({ state: 'idle', contentSeq: 5, lastScannedSeq: 5, pendingIdle: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent-state/pending-idle.test.ts src/lib/agent-state/detect-schedule.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `pending-idle.ts`**:

```ts
import type { AgentEngineState, Verdict } from '@/lib/agent-state/types'

/**
 * Asymmetric debounce, ported from herdr (Apache-2.0,
 * src/pane/agent_detection.rs:5-77): entering blocked — or any other state —
 * publishes immediately; only `working → plain idle` is held, because agent
 * TUIs flicker through idle-looking frames between working redraws. Idle
 * with live proof (`visibleIdle` — the composer is actually on screen) or a
 * dead process skips the hold. Pure and timer-free: the detector passes
 * timestamps, so this is unit-testable without fake timers.
 */
export const PENDING_IDLE_RECHECK_MS = 100
export const PENDING_IDLE_CONFIRMATIONS = 3
export const PENDING_IDLE_CAP_MS = 700

export interface PendingIdle {
  startedAt: number
  confirmations: number
}

export interface HoldDecision {
  publish: boolean
  pending: PendingIdle | null
}

export function decideIdleHold(args: {
  prev: AgentEngineState
  next: Verdict
  pending: PendingIdle | null
  now: number
  processExited: boolean
}): HoldDecision {
  const { prev, next, pending, now, processExited } = args
  const holdApplies =
    prev === 'working' &&
    next.state === 'idle' &&
    !next.visibleIdle &&
    !next.visibleBlocker &&
    !processExited
  if (!holdApplies) return { publish: true, pending: null }

  if (pending === null) {
    return { publish: false, pending: { startedAt: now, confirmations: 0 } }
  }
  const confirmations = pending.confirmations + 1
  if (confirmations >= PENDING_IDLE_CONFIRMATIONS || now - pending.startedAt >= PENDING_IDLE_CAP_MS) {
    return { publish: true, pending: null }
  }
  return { publish: false, pending: { startedAt: pending.startedAt, confirmations } }
}
```

- [ ] **Step 4: Implement `detect-schedule.ts`**:

```ts
import type { AgentEngineState } from '@/lib/agent-state/types'

/** Tick cadence while an agent pane is live; 100ms (PENDING_IDLE_RECHECK_MS)
 *  applies instead while a pending-idle hold is open. */
export const TICK_MS = 300

/** Agent TUIs draw menus/banners while booting that look like blockers;
 *  herdr skips screen detection entirely for 3s after spawn. */
export const SPAWN_GRACE_MS = 3000

export function inSpawnGrace(spawnedAt: number, now: number): boolean {
  return now - spawnedAt < SPAWN_GRACE_MS
}

/** Steady-state idle with no new pty output since the last scan: don't even
 *  materialize the buffer text. This is what makes 300ms polling free. */
export function shouldSkipScreenScan(args: {
  state: AgentEngineState
  contentSeq: number
  lastScannedSeq: number
  pendingIdle: boolean
}): boolean {
  return args.state === 'idle' && !args.pendingIdle && args.contentSeq === args.lastScannedSeq
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent-state/pending-idle.test.ts src/lib/agent-state/detect-schedule.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-state/pending-idle.ts src/lib/agent-state/pending-idle.test.ts src/lib/agent-state/detect-schedule.ts src/lib/agent-state/detect-schedule.test.ts
git commit -m "feat(agent-state): asymmetric idle debounce and tick scheduling decisions"
```

---

### Task 5: Snapshot builder + display/rollup selectors

**Files:**
- Create: `src/lib/agent-state/snapshot.ts`
- Create: `src/lib/agent-state/rollup.ts`
- Test: `src/lib/agent-state/snapshot.test.ts`
- Test: `src/lib/agent-state/rollup.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`DisplayState`, `AgentEngineState`).
- Produces:
  - `interface BufferView { rows: number; length: number; line(index: number): string }` and `buildSnapshot(view: BufferView): string`
  - `interface AgentPaneState { state: AgentEngineState; seen: boolean }` (exported from rollup.ts — the store in Task 6 imports it)
  - `displayState(s: AgentPaneState | undefined): DisplayState | undefined`
  - `paneDot(display: DisplayState | undefined, outputActive: boolean): DisplayState | 'activity' | null`
  - `workspaceDot(panes: Array<{ display: DisplayState | undefined; outputActive: boolean }>): DisplayState | 'activity' | null`

- [ ] **Step 1: Write the failing tests** in `snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSnapshot, type BufferView } from '@/lib/agent-state/snapshot'

const view = (rows: number, lines: string[]): BufferView => ({
  rows,
  length: lines.length,
  line: (i) => lines[i]
})

describe('buildSnapshot', () => {
  it('takes the last `rows` lines of the full buffer — scrollback position is irrelevant', () => {
    expect(buildSnapshot(view(2, ['old', 'a', 'b']))).toBe('a\nb')
  })
  it('right-trims lines and drops trailing blank lines', () => {
    expect(buildSnapshot(view(4, ['a  ', 'b', '   ', '']))).toBe('a\nb')
  })
  it('handles a buffer shorter than rows', () => {
    expect(buildSnapshot(view(24, ['only']))).toBe('only')
  })
  it('returns empty string for an all-blank buffer', () => {
    expect(buildSnapshot(view(2, ['', '  ']))).toBe('')
  })
})
```

And in `rollup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { displayState, paneDot, workspaceDot } from '@/lib/agent-state/rollup'

describe('displayState', () => {
  it('derives done from unseen idle', () => {
    expect(displayState({ state: 'idle', seen: false })).toBe('done')
    expect(displayState({ state: 'idle', seen: true })).toBe('idle')
    expect(displayState({ state: 'blocked', seen: true })).toBe('blocked')
    expect(displayState(undefined)).toBeUndefined()
  })
})

describe('paneDot', () => {
  it('shows the state dot for blocked/done/working', () => {
    expect(paneDot('blocked', false)).toBe('blocked')
    expect(paneDot('done', true)).toBe('done')
    expect(paneDot('working', false)).toBe('working')
  })
  it('idle shows nothing', () => {
    expect(paneDot('idle', true)).toBeNull()
  })
  it('unknown or undetected falls back to the output-activity dot', () => {
    expect(paneDot('unknown', true)).toBe('activity')
    expect(paneDot(undefined, true)).toBe('activity')
    expect(paneDot(undefined, false)).toBeNull()
  })
})

describe('workspaceDot', () => {
  it('picks the highest-attention pane: blocked > done > working > activity', () => {
    expect(
      workspaceDot([
        { display: 'working', outputActive: false },
        { display: 'blocked', outputActive: false }
      ])
    ).toBe('blocked')
    expect(
      workspaceDot([
        { display: 'done', outputActive: false },
        { display: undefined, outputActive: true }
      ])
    ).toBe('done')
  })
  it('plain-shell activity still lights the tab when no agent state outranks it', () => {
    expect(workspaceDot([{ display: undefined, outputActive: true }])).toBe('activity')
  })
  it('an all-idle workspace shows nothing', () => {
    expect(workspaceDot([{ display: 'idle', outputActive: false }])).toBeNull()
    expect(workspaceDot([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent-state/snapshot.test.ts src/lib/agent-state/rollup.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `snapshot.ts`**:

```ts
/**
 * Builds the detection snapshot: the last `rows` lines anchored at the
 * BOTTOM of the full buffer (scrollback included) — the user scrolling the
 * viewport never moves the detection window, which reads the live screen
 * herdr-style (Apache-2.0, src/pane/terminal.rs:2675-2687). Lines are
 * right-trimmed and trailing blanks dropped so "bottom line" means the last
 * line with content, not the last terminal row. Takes a narrow view
 * interface rather than an xterm Terminal so it stays pure and testable —
 * the adapter over `term.buffer.active` lives in the detector.
 */
export interface BufferView {
  rows: number
  length: number
  line(index: number): string
}

export function buildSnapshot(view: BufferView): string {
  const end = view.length
  const start = Math.max(0, end - view.rows)
  const lines: string[] = []
  for (let i = start; i < end; i++) lines.push(view.line(i).trimEnd())
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}
```

- [ ] **Step 4: Implement `rollup.ts`**:

```ts
import type { AgentEngineState, DisplayState } from '@/lib/agent-state/types'

/** What the store holds per agent pane. `seen=false` on an idle state is the
 *  "done" badge — the agent finished while the user wasn't looking. */
export interface AgentPaneState {
  state: AgentEngineState
  seen: boolean
}

export function displayState(s: AgentPaneState | undefined): DisplayState | undefined {
  if (s === undefined) return undefined
  return s.state === 'idle' && !s.seen ? 'done' : s.state
}

/** Attention order (herdr's, Apache-2.0, src/app/api_helpers.rs:1-9), with
 *  the plain output-activity dot slotted below real agent states. */
const PRIORITY: Record<DisplayState | 'activity', number> = {
  blocked: 5,
  done: 4,
  working: 3,
  activity: 2,
  idle: 1,
  unknown: 0
}

/** What dot one pane's row shows: a real agent state when known, the legacy
 *  output-activity dot while state is unknown (startup grace, agent exited)
 *  or for plain shells, nothing when idle/quiet. */
export function paneDot(
  display: DisplayState | undefined,
  outputActive: boolean
): DisplayState | 'activity' | null {
  if (display === 'blocked' || display === 'done' || display === 'working') return display
  if (display === 'idle') return null
  return outputActive ? 'activity' : null
}

/** Workspace-tab rollup: the highest-attention dot across the panes. */
export function workspaceDot(
  panes: Array<{ display: DisplayState | undefined; outputActive: boolean }>
): DisplayState | 'activity' | null {
  let best: DisplayState | 'activity' | null = null
  for (const pane of panes) {
    const dot = paneDot(pane.display, pane.outputActive)
    if (dot !== null && (best === null || PRIORITY[dot] > PRIORITY[best])) best = dot
  }
  return best
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent-state/snapshot.test.ts src/lib/agent-state/rollup.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-state/snapshot.ts src/lib/agent-state/snapshot.test.ts src/lib/agent-state/rollup.ts src/lib/agent-state/rollup.test.ts
git commit -m "feat(agent-state): buffer snapshot builder and display/rollup selectors"
```

---

### Task 6: Agent-state store (seen-bit lives here)

**Files:**
- Create: `src/store/agent-state-store.ts`
- Test: `src/store/agent-state-store.test.ts`

**Interfaces:**
- Consumes: `rollup.ts` (`AgentPaneState`), `types.ts` (`AgentEngineState`).
- Produces: `useAgentStateStore` with:
  - `byId: Record<string, AgentPaneState>`
  - `publish(terminalId: string, state: AgentEngineState, opts: { paneWatched: boolean }): void`
  - `markSeen(terminalId: string): void`
  - `clear(terminalId: string): void`

- [ ] **Step 1: Write the failing tests** in `src/store/agent-state-store.test.ts` (follow the reset pattern used by `terminal-typing-store.test.ts` — grab `getState()` fresh per assertion):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentStateStore } from '@/store/agent-state-store'

const publish = (state: Parameters<ReturnType<typeof useAgentStateStore.getState>['publish']>[1], watched = false): void =>
  useAgentStateStore.getState().publish('t1', state, { paneWatched: watched })

describe('agent-state-store', () => {
  beforeEach(() => {
    useAgentStateStore.setState({ byId: {} })
  })

  it('non-idle states are always seen', () => {
    publish('working')
    expect(useAgentStateStore.getState().byId['t1']).toEqual({ state: 'working', seen: true })
  })

  it('working → idle while unwatched becomes done (seen=false)', () => {
    publish('working')
    publish('idle')
    expect(useAgentStateStore.getState().byId['t1']).toEqual({ state: 'idle', seen: false })
  })

  it('blocked → idle is also a completion', () => {
    publish('blocked')
    publish('idle')
    expect(useAgentStateStore.getState().byId['t1'].seen).toBe(false)
  })

  it('working → idle while the pane is watched is plain idle', () => {
    publish('working')
    publish('idle', true)
    expect(useAgentStateStore.getState().byId['t1']).toEqual({ state: 'idle', seen: true })
  })

  it('unknown → idle is NOT a completion (startup settle, deviation from herdr)', () => {
    publish('unknown')
    publish('idle')
    expect(useAgentStateStore.getState().byId['t1'].seen).toBe(true)
  })

  it('same-state republish never clears an existing done badge', () => {
    publish('working')
    publish('idle')
    publish('idle', true)
    expect(useAgentStateStore.getState().byId['t1'].seen).toBe(false)
  })

  it('markSeen clears the done badge; clear removes the entry', () => {
    publish('working')
    publish('idle')
    useAgentStateStore.getState().markSeen('t1')
    expect(useAgentStateStore.getState().byId['t1'].seen).toBe(true)
    useAgentStateStore.getState().clear('t1')
    expect(useAgentStateStore.getState().byId['t1']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/agent-state-store.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `agent-state-store.ts`**:

```ts
import { create } from 'zustand'
import type { AgentPaneState } from '@/lib/agent-state/rollup'
import type { AgentEngineState } from '@/lib/agent-state/types'

/**
 * Per-terminal agent state, keyed by terminalId. Runtime state OUTSIDE the
 * layout tree — same family as terminal-activity-store. Written by each
 * pane's AgentStateDetector; read by the navbar terminal list, workspace
 * tabs, and the War Room members tab. The seen-bit lives here because it is
 * a property of the published state's lifetime, not of any one component:
 * a completion (working|blocked → idle) while the pane isn't being watched
 * flips seen=false, which the UI renders as "done" until the pane is
 * focused. unknown → idle is deliberately NOT a completion — unlike herdr,
 * our `unknown` only occurs at spawn/respawn/exit, and a fresh agent
 * settling into its first prompt must not greet the user with a done badge.
 */
export interface AgentStateStore {
  byId: Record<string, AgentPaneState>
  publish: (terminalId: string, state: AgentEngineState, opts: { paneWatched: boolean }) => void
  markSeen: (terminalId: string) => void
  clear: (terminalId: string) => void
}

export const useAgentStateStore = create<AgentStateStore>((set) => ({
  byId: {},

  publish: (terminalId, state, { paneWatched }) =>
    set((s) => {
      const prev = s.byId[terminalId]
      // Same state again: keep the entry (and its seen-bit) untouched so a
      // steady idle republish can't clear a done badge.
      if (prev !== undefined && prev.state === state) return s
      const completion = state === 'idle' && (prev?.state === 'working' || prev?.state === 'blocked')
      const seen = completion ? paneWatched : true
      return { byId: { ...s.byId, [terminalId]: { state, seen } } }
    }),

  markSeen: (terminalId) =>
    set((s) => {
      const prev = s.byId[terminalId]
      if (prev === undefined || prev.seen) return s
      return { byId: { ...s.byId, [terminalId]: { ...prev, seen: true } } }
    }),

  clear: (terminalId) =>
    set((s) => {
      if (!(terminalId in s.byId)) return s
      const byId = { ...s.byId }
      delete byId[terminalId]
      return { byId }
    })
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/agent-state-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/agent-state-store.ts src/store/agent-state-store.test.ts
git commit -m "feat(agent-state): zustand store with completion-driven seen-bit"
```

---

### Task 7: Detector controller

**Files:**
- Create: `src/lib/agent-state/detector.ts`
- Test: `src/lib/agent-state/detector.test.ts`

**Interfaces:**
- Consumes: `engine.ts` (`evaluateManifest`), `snapshot.ts` (`BufferView`, `buildSnapshot`), `pending-idle.ts` (`decideIdleHold`, `PENDING_IDLE_RECHECK_MS`), `detect-schedule.ts` (`TICK_MS`, `SPAWN_GRACE_MS`, `inSpawnGrace`, `shouldSkipScreenScan`), `types.ts`.
- Produces:

```ts
export interface DetectorDeps {
  getView(): BufferView | null
  isPaneWatched(): boolean
  publish(state: AgentEngineState, opts: { paneWatched: boolean }): void
  now(): number                       // injected clock — Date.now in prod
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}
export class AgentStateDetector {
  constructor(manifest: Manifest, deps: DetectorDeps)
  start(): void
  noteOutput(): void                  // pty chunk arrived — bump content seq
  noteTitle(rawTitle: string): void   // raw OSC 0/2, pre-normalization
  noteProgress(payload: string): void // OSC 9 payload
  noteExit(): void                    // pty exited/errored — stop, publish unknown
  reset(): void                       // respawn — state unknown, evidence cleared, grace re-armed
  dispose(): void
}
```

- [ ] **Step 1: Write the failing tests** in `detector.test.ts` — a manual-clock harness, no fake timers needed:

```ts
import { describe, expect, it } from 'vitest'
import { AgentStateDetector, type DetectorDeps } from '@/lib/agent-state/detector'
import { SPAWN_GRACE_MS, TICK_MS } from '@/lib/agent-state/detect-schedule'
import type { AgentEngineState, Manifest } from '@/lib/agent-state/types'

const manifest: Manifest = {
  id: 'test',
  herdrVersion: 't',
  rules: [
    { id: 'working', state: 'working', priority: 500, region: 'whole_recent', contains: ['esc to interrupt'] },
    { id: 'blocked', state: 'blocked', priority: 900, region: 'whole_recent', contains: ['do you want to proceed?'] }
  ]
}

interface Harness {
  detector: AgentStateDetector
  published: AgentEngineState[]
  setScreen(text: string): void
  /** Advance the manual clock and fire the single pending timer. */
  tick(ms?: number): void
}

function makeHarness(): Harness {
  let screen = ''
  let now = 0
  let pending: { fn: () => void } | null = null
  const published: AgentEngineState[] = []
  const deps: DetectorDeps = {
    getView: () => ({ rows: 24, length: 1, line: () => screen }),
    isPaneWatched: () => false,
    publish: (state) => published.push(state),
    now: () => now,
    setTimer: (fn) => {
      pending = { fn }
      return pending
    },
    clearTimer: () => {
      pending = null
    }
  }
  const detector = new AgentStateDetector(manifest, deps)
  return {
    detector,
    published,
    setScreen: (text) => {
      screen = text
      detector.noteOutput()
    },
    tick: (ms = TICK_MS) => {
      now += ms
      const p = pending
      pending = null
      p?.fn()
    }
  }
}

describe('AgentStateDetector', () => {
  it('publishes nothing during the spawn grace window', () => {
    const h = makeHarness()
    h.detector.start()
    h.setScreen('Do you want to proceed?')
    h.tick()
    expect(h.published).toEqual([])
  })

  it('detects blocked immediately after grace', () => {
    const h = makeHarness()
    h.detector.start()
    h.setScreen('Do you want to proceed?')
    h.tick(SPAWN_GRACE_MS)
    h.tick()
    expect(h.published).toEqual(['blocked'])
  })

  it('holds working → idle across confirmations, then publishes idle', () => {
    const h = makeHarness()
    h.detector.start()
    h.tick(SPAWN_GRACE_MS)
    h.setScreen('thinking… esc to interrupt')
    h.tick()
    expect(h.published).toEqual(['working'])
    h.setScreen('$ quiet prompt')
    h.tick() // idle verdict #1 — held
    h.tick(100) // #2
    h.tick(100) // #3
    h.tick(100) // #4 — released
    expect(h.published).toEqual(['working', 'idle'])
  })

  it('reset returns to unknown and re-arms the grace window', () => {
    const h = makeHarness()
    h.detector.start()
    h.tick(SPAWN_GRACE_MS)
    h.setScreen('Do you want to proceed?')
    h.tick()
    expect(h.published).toEqual(['blocked'])
    h.detector.reset()
    expect(h.published).toEqual(['blocked', 'unknown'])
    h.tick() // still inside the fresh grace window — no detection
    expect(h.published).toEqual(['blocked', 'unknown'])
  })

  it('noteExit stops the loop and publishes unknown', () => {
    const h = makeHarness()
    h.detector.start()
    h.tick(SPAWN_GRACE_MS)
    h.setScreen('thinking… esc to interrupt')
    h.tick()
    h.detector.noteExit()
    expect(h.published).toEqual(['working', 'unknown'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent-state/detector.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `detector.ts`**:

```ts
import { evaluateManifest } from '@/lib/agent-state/engine'
import { inSpawnGrace, shouldSkipScreenScan, TICK_MS } from '@/lib/agent-state/detect-schedule'
import { decideIdleHold, PENDING_IDLE_RECHECK_MS, type PendingIdle } from '@/lib/agent-state/pending-idle'
import { buildSnapshot, type BufferView } from '@/lib/agent-state/snapshot'
import type { AgentEngineState, Manifest } from '@/lib/agent-state/types'

/** OSC titles arrive raw from the program; herdr strips control chars and
 *  caps length (src/pane/osc.rs:448-527). No whitespace collapse — the
 *  spinner rules anchor on `<spinner><space>` prefixes. */
const OSC_MAX_CHARS = 256
const sanitizeOsc = (raw: string): string =>
  // eslint-disable-next-line no-control-regex
  raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').slice(0, OSC_MAX_CHARS)

export interface DetectorDeps {
  getView(): BufferView | null
  isPaneWatched(): boolean
  publish(state: AgentEngineState, opts: { paneWatched: boolean }): void
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

/**
 * Per-terminal detection loop. Timer-driven rather than per-output-chunk
 * (herdr's design): a busy agent redraws its spinner dozens of times per
 * second, and scraping on every chunk would burn CPU for identical
 * verdicts. Output only bumps a sequence counter; the 300ms tick skips the
 * screen read entirely while idle with an unchanged counter, so a quiet
 * pane costs nothing. All side effects (clock, timers, store publish, xterm
 * buffer) are injected so the loop is testable with a manual clock.
 */
export class AgentStateDetector {
  private readonly manifest: Manifest
  private readonly deps: DetectorDeps
  private oscTitle = ''
  private oscProgress = ''
  private contentSeq = 0
  private lastScannedSeq = -1
  private spawnedAt: number
  private state: AgentEngineState = 'unknown'
  private pending: PendingIdle | null = null
  private timer: unknown = null
  private exited = false
  private disposed = false

  constructor(manifest: Manifest, deps: DetectorDeps) {
    this.manifest = manifest
    this.deps = deps
    this.spawnedAt = deps.now()
  }

  start(): void {
    this.schedule(TICK_MS)
  }

  noteOutput(): void {
    this.contentSeq++
  }

  noteTitle(rawTitle: string): void {
    this.oscTitle = sanitizeOsc(rawTitle)
  }

  noteProgress(payload: string): void {
    this.oscProgress = sanitizeOsc(payload)
  }

  /** Pty exited or errored: stop detecting, drop to unknown so the UI falls
   *  back to the plain activity dot instead of freezing a stale state. */
  noteExit(): void {
    this.exited = true
    this.pending = null
    this.setState('unknown')
  }

  /** Respawn (agent/cwd/shell switch or retry): the screen and OSC evidence
   *  describe a pty that no longer exists. Re-arm the spawn grace. */
  reset(): void {
    this.oscTitle = ''
    this.oscProgress = ''
    this.pending = null
    this.exited = false
    this.spawnedAt = this.deps.now()
    this.lastScannedSeq = -1
    this.setState('unknown')
  }

  dispose(): void {
    this.disposed = true
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = null
  }

  private setState(state: AgentEngineState): void {
    if (this.state === state) return
    this.state = state
    this.deps.publish(state, { paneWatched: this.deps.isPaneWatched() })
  }

  private schedule(ms: number): void {
    if (this.disposed) return
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = this.deps.setTimer(() => {
      this.timer = null
      this.tick()
    }, ms)
  }

  private tick(): void {
    if (this.disposed || this.exited) return
    const now = this.deps.now()
    if (inSpawnGrace(this.spawnedAt, now)) {
      this.schedule(TICK_MS)
      return
    }
    if (
      shouldSkipScreenScan({
        state: this.state,
        contentSeq: this.contentSeq,
        lastScannedSeq: this.lastScannedSeq,
        pendingIdle: this.pending !== null
      })
    ) {
      this.schedule(TICK_MS)
      return
    }
    const view = this.deps.getView()
    if (view === null) {
      this.schedule(TICK_MS)
      return
    }
    // Capture the seq BEFORE scanning: output racing in during the scan must
    // trigger a fresh scan next tick, not be silently absorbed.
    const seq = this.contentSeq
    let verdictState: AgentEngineState | null = null
    try {
      const verdict = evaluateManifest(this.manifest, {
        screen: buildSnapshot(view),
        oscTitle: this.oscTitle,
        oscProgress: this.oscProgress
      })
      this.lastScannedSeq = seq
      if (!verdict.skip) {
        const decision = decideIdleHold({
          prev: this.state,
          next: verdict,
          pending: this.pending,
          now,
          processExited: this.exited
        })
        this.pending = decision.pending
        if (decision.publish) verdictState = verdict.state
      }
    } catch (err) {
      // A broken rule must degrade to the old activity-dot behavior, never
      // take the terminal down with it. Log once per detector.
      if (!this.warned) {
        this.warned = true
        console.warn('agent-state detection failed; pane falls back to activity dot', err)
      }
    }
    if (verdictState !== null) this.setState(verdictState)
    this.schedule(this.pending !== null ? PENDING_IDLE_RECHECK_MS : TICK_MS)
  }

  private warned = false
}
```

Note for the implementer: `setState` dedups on unchanged state, so the store's own dedup is belt-and-braces; the `paneWatched` flag is only consulted by the store on completion transitions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent-state/detector.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `npm test && npx tsc --noEmit`
Expected: full suite PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-state/detector.ts src/lib/agent-state/detector.test.ts
git commit -m "feat(agent-state): per-terminal detection loop with injected clock"
```

---

### Task 8: Wire detection into terminal-registry and TerminalPane

**Files:**
- Modify: `src/lib/terminal-registry.ts` (AttachConfig ~line 88, `getOrCreate` title/OSC handlers ~lines 220-236, session sink ~line 646, `attachTerminal` ~line 679, `disposeTerminal` ~line 721, `retryTerminal` ~line 833, `respawnTerminal` ~line 853)
- Modify: `src/components/TerminalPane/TerminalPane.tsx` (attach config ~line 140, respawn effect just below)
- Test: type-check + full suite (integration wiring; the logic under it is already unit-tested)

**Interfaces:**
- Consumes: `AgentStateDetector`/`DetectorDeps` (Task 7), `manifestForAgent` (Task 3), `useAgentStateStore` (Task 6), `BufferView` (Task 5), `selectFocusedTerminalId` from `@/store/app-store` (exists, app-store.ts:169).
- Produces: `AttachConfig.agentId?: string` — TerminalPane passes `resolvedAgentId`; every agent pane gets a running detector keyed to its entry.

- [ ] **Step 1: Extend `AttachConfig` and `Entry`** in `terminal-registry.ts`:

```ts
export interface AttachConfig {
  cwd?: string
  shellId?: import('@/lib/terminal-pref').ShellId
  initialCommand?: string
  worktreeMode?: boolean
  repoRoot?: string
  agentId?: string
}
```

Add to `Entry`: `detector?: AgentStateDetector`. Imports:

```ts
import { AgentStateDetector, type DetectorDeps } from '@/lib/agent-state/detector'
import { manifestForAgent } from '@/lib/agent-state/manifests'
import { useAgentStateStore } from '@/store/agent-state-store'
import type { BufferView } from '@/lib/agent-state/snapshot'
import { selectFocusedTerminalId } from '@/store/app-store'
```

(`useAppStore` and the app-store import line already exist at the top of the file.)

- [ ] **Step 2: Feed OSC evidence and output ticks** in `getOrCreate` — handlers are registered at terminal creation but look the detector up at fire time, because the detector is only created at attach (when `agentId` is known):

Right after the existing `term.onTitleChange(...)` block (~line 225):

```ts
  // Second title listener: detection needs the RAW title (spinner prefix and
  // spacing intact), not the header's whitespace-collapsed one above.
  term.onTitleChange((title) => {
    entries.get(id)?.detector?.noteTitle(title)
  })
  // OSC 9 progress (ConEmu-style "4;st;pct") — detection evidence only.
  term.parser.registerOscHandler(9, (data) => {
    entries.get(id)?.detector?.noteProgress(data)
    return true
  })
```

In the session sink (the `write` callback that calls `activityTracker.notify(id)`, ~line 650), add one line after `notify`:

```ts
        entries.get(id)?.detector?.noteOutput()
```

- [ ] **Step 3: Create/replace the detector at attach and respawn.** Add a module-level helper near `getOrCreate`:

```ts
/**
 * (Re)build the detection loop for this entry's agent. Called from attach
 * and respawn — the two places `config.agentId` can change. Plain terminals
 * get no detector at all; their dot stays the output-activity one.
 */
function refreshDetector(id: string, entry: Entry): void {
  const manifest = manifestForAgent(entry.config.agentId)
  if (entry.detector !== undefined && (manifest === undefined || manifest.id !== entry.detectorManifestId)) {
    entry.detector.dispose()
    entry.detector = undefined
    useAgentStateStore.getState().clear(id)
  }
  if (manifest === undefined || entry.detector !== undefined) return
  entry.detectorManifestId = manifest.id
  const deps: DetectorDeps = {
    getView: (): BufferView | null => {
      const e = entries.get(id)
      if (!e || !e.opened) return null
      const buffer = e.term.buffer.active
      return {
        rows: e.term.rows,
        length: buffer.length,
        line: (i) => buffer.getLine(i)?.translateToString(true) ?? ''
      }
    },
    isPaneWatched: () =>
      document.hasFocus() && selectFocusedTerminalId(useAppStore.getState()) === id,
    publish: (state, opts) => useAgentStateStore.getState().publish(id, state, opts),
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
  }
  entry.detector = new AgentStateDetector(manifest, deps)
  entry.detector.start()
}
```

Add `detectorManifestId?: string` to `Entry`. Call `refreshDetector(id, entry)` in `attachTerminal` right after `entry.config = {...}` is assigned, and in `respawnTerminal` right after its `entry.config = { ...entry.config, ...config }`.

- [ ] **Step 4: Exit / retry / respawn / dispose transitions:**

In `getOrCreate`, after the `session` is constructed, mirror pty death into the detector (the session emits `exited`/`error` through its status subscription):

```ts
  session.subscribe(() => {
    const kind = session.getStatus().kind
    if (kind === 'exited' || kind === 'error') entries.get(id)?.detector?.noteExit()
  })
```

In `retryTerminal` and `respawnTerminal`, next to the existing `clearTyping(id)` calls, add:

```ts
  entry.detector?.reset()
```

(in `respawnTerminal`, call `refreshDetector` first as per Step 3 — order: merge config → refreshDetector → reset).

In `disposeTerminal`, alongside the activity/typing cleanup:

```ts
  entry.detector?.dispose()
  useAgentStateStore.getState().clear(id)
```

- [ ] **Step 5: Pass `agentId` from TerminalPane.** In `TerminalPane.tsx`, the attach call (~line 140) gains one field:

```ts
    attachTerminal(terminalId, container, {
      cwd: resolvedCwd,
      shellId: resolvedShellId,
      initialCommand: resolvedCommand,
      worktreeMode: worktreeMode || undefined,
      repoRoot: worktreeMode ? cwd : undefined,
      agentId: resolvedAgentId
    })
```

Find the respawn effect below (~line 159+, it calls `respawnTerminal(terminalId, {...})`) and add `agentId: resolvedAgentId` to that config object too, so an agent switch rebuilds the detector.

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / clean. There are no new unit tests in this task — it is wiring; the pieces are tested in Tasks 1-7 and the behavior is covered by the manual smoke checklist in Task 10.

- [ ] **Step 7: Commit**

```bash
git add src/lib/terminal-registry.ts src/components/TerminalPane/TerminalPane.tsx
git commit -m "feat(agent-state): wire detection loop into terminal registry"
```

---

### Task 9: UI — StateDot, terminal list, workspace rollup, War Room, seen-bit wiring

**Files:**
- Create: `src/components/StateDot.tsx`
- Modify: `src/components/Navbar/TerminalList.tsx` (dot at ~line 64)
- Modify: `src/components/WorkspaceTabs/WorkspaceTabs.tsx` (`showActivity` ~lines 111-114, prop threading, dot at ~line 247)
- Modify: `src/components/WarRoom/MembersTab.tsx` (activity dot ~line 19)
- Modify: `src/App.tsx` (new markSeen effect near the focus-return effects, ~line 309)
- Test: covered by Task 5's pure selectors + type-check; no component tests (repo has none — logic stays in `lib/`)

**Interfaces:**
- Consumes: `displayState`, `paneDot`, `workspaceDot` (Task 5), `useAgentStateStore` (Task 6), `selectFocusedTerminalId` (app-store.ts:169), existing `ActivityDot`.
- Produces: `<StateDot state={...} />` accepting `'blocked' | 'done' | 'working'`.

- [ ] **Step 1: Create `StateDot.tsx`** (sibling of `ActivityDot.tsx`, same shape):

```tsx
import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'

/**
 * Agent-state dot: red demands input, green waits to be looked at, yellow is
 * the same "busy" the ActivityDot shows. Colors are VS Code Dark Modern ANSI
 * (brightRed / brightGreen) so the chrome matches the terminal interior.
 * idle/unknown render nothing — callers decide fallbacks via paneDot().
 */
const DOT: Record<'blocked' | 'done' | 'working', { className: string; label: string }> = {
  blocked: { className: 'bg-[#F14C4C]', label: 'Blocked — needs your input' },
  done: { className: 'bg-[#23D18B]', label: 'Done — finished while you were away' },
  working: { className: 'bg-activity', label: 'Working' }
}

export function StateDot({
  state,
  className
}: {
  state: 'blocked' | 'done' | 'working'
  className?: string
}): ReactElement {
  const { className: color, label } = DOT[state]
  return (
    <span
      aria-label={label}
      title={label}
      className={cn('h-2 w-2 shrink-0 rounded-full', color, className)}
    />
  )
}
```

- [ ] **Step 2: Add a tiny shared render helper** — since three components need the same dot-or-activity decision, put the JSX mapping inline in each (it is two lines); the DECISION is already pure (`paneDot`). In `TerminalList.tsx`, replace line 64 (`{activity[leaf.terminalId] && <ActivityDot />}`):

```tsx
                {(() => {
                  const dot = paneDot(
                    displayState(agentStates[leaf.terminalId]),
                    activity[leaf.terminalId] === true
                  )
                  if (dot === null) return null
                  return dot === 'activity' ? <ActivityDot /> : <StateDot state={dot} />
                })()}
```

with the store subscription added next to the others (~line 25):

```ts
  const agentStates = useAgentStateStore((s) => s.byId)
```

and imports for `useAgentStateStore`, `displayState`, `paneDot`, `StateDot`.

- [ ] **Step 3: WorkspaceTabs rollup.** Replace the `showActivity` computation (~lines 111-114):

```tsx
              const dot = isActive
                ? null
                : workspaceDot(
                    collectLeaves(ws.layout).map((l) => ({
                      display: displayState(agentStates[l.terminalId]),
                      outputActive: activity[l.terminalId] === true
                    }))
                  )
```

Thread `dot` through `SortableWorkspaceTab` in place of `showActivity` (rename the prop to `dot: DisplayState | 'activity' | null`), and replace `{showActivity && <ActivityDot />}` (~line 247) with:

```tsx
          {dot !== null &&
            (dot === 'activity' || dot === 'working' || dot === 'blocked' || dot === 'done' ? (
              dot === 'activity' ? <ActivityDot /> : <StateDot state={dot} />
            ) : null)}
```

(Equivalent simpler form is fine — `idle`/`unknown` never escape `workspaceDot`, so the guard can be a type predicate; keep whatever satisfies strict TS cleanly.) Subscribe `agentStates` like in Step 2. The `anyLeafActive` import becomes unused — delete it (`noUnusedLocals` enforces this). Do NOT delete `src/lib/activity-selectors.ts` itself if other callers remain; if `anyLeafActive` has no other callers, delete the module and its test.

- [ ] **Step 4: MembersTab.** In `src/components/WarRoom/MembersTab.tsx`, the member row currently shows `ActivityDot` from `useTerminalActivityStore` (~line 19). Apply the same paneDot pattern: subscribe to `useAgentStateStore`, compute `paneDot(displayState(byId[member.terminalId]), active)`, render `StateDot`/`ActivityDot` accordingly. Read the file first and keep its existing row structure.

- [ ] **Step 5: markSeen wiring in App.tsx.** Near the existing focus-return effects (~line 309), add one effect:

```tsx
  // A done badge means "finished while you weren't looking" — so it clears
  // the moment the pane is actually being looked at: focus changes within
  // the app (store subscription covers setFocusedLeaf AND workspace
  // switches) and the window regaining OS focus. Watched-ness at completion
  // time is judged inside the store publish; this effect handles the other
  // direction — the user coming TO an already-done pane.
  useEffect(() => {
    const markFocusedSeen = (): void => {
      if (!document.hasFocus()) return
      const terminalId = selectFocusedTerminalId(useAppStore.getState())
      if (terminalId) useAgentStateStore.getState().markSeen(terminalId)
    }
    markFocusedSeen()
    const unsubscribe = useAppStore.subscribe(markFocusedSeen)
    window.addEventListener('focus', markFocusedSeen)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', markFocusedSeen)
    }
  }, [])
```

`selectFocusedTerminalId` and `useAppStore` are already imported in App.tsx (lines 12, 330).

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/StateDot.tsx src/components/Navbar/TerminalList.tsx src/components/WorkspaceTabs/WorkspaceTabs.tsx src/components/WarRoom/MembersTab.tsx src/App.tsx
git commit -m "feat(agent-state): state dots, workspace rollup, done-until-seen"
```

(add the `activity-selectors` deletion to this commit if Step 3 removed it)

---

### Task 10: Docs + final verification

**Files:**
- Modify: `docs/user-guide.md` (new "Agent state dots" subsection — read the file first and place it near the existing activity/navbar documentation)
- Modify: `docs/manual-smoke-tests.md` (new Đ1 checklist section)
- Test: full gates

- [ ] **Step 1: User guide.** Add a short subsection (English, end-user voice, follow the guide's existing style) covering: the four dot meanings (red = the agent needs your input; yellow = working; green = finished while you were away, clears when you focus the pane; no dot = idle), that it applies to Claude Code / Codex / OpenCode panes, that workspace tabs show the highest-priority state among their panes, and that plain terminal panes keep the simple output dot.

- [ ] **Step 2: Smoke checklist.** Append to `docs/manual-smoke-tests.md` (match the file's existing checklist format):

```markdown
## Agent state detection (Đ1)

- [ ] Claude pane: ask for a long task → dot turns yellow (working) while it runs.
- [ ] Claude pane: trigger a permission prompt (e.g. a Bash command without allow rules) → dot turns red (blocked) within ~1s.
- [ ] Answer the prompt, let the task finish while ANOTHER workspace is active → its workspace tab shows a green dot; switching to it and focusing the pane clears the green.
- [ ] Finish a task while WATCHING the pane → no green dot appears (goes straight to idle).
- [ ] Claude transcript viewer (ctrl+o): state does not flap while it is open.
- [ ] Codex pane: same working / blocked (Action Required) / done pass.
- [ ] OpenCode pane: same working / blocked (Permission required) / done pass.
- [ ] Plain terminal pane: yellow output dot behaves exactly as before.
- [ ] Respawn an agent pane (switch agent) → no stale dot; detection resumes after ~3s.
- [ ] Scroll an agent pane far up during a working task → dot still tracks the live bottom of the buffer.
```

- [ ] **Step 3: Full verification**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / clean. Rust untouched — `cargo test` not required.

- [ ] **Step 4: Commit**

```bash
git add docs/user-guide.md docs/manual-smoke-tests.md
git commit -m "docs: agent state dots in user guide and smoke checklist"
```

---

## Plan self-review (done at write time)

- **Spec coverage:** states/derivation → Tasks 5-6; engine+regions → 1-2; manifests+attribution → 3; debounce/grace/throttle → 4, 7; snapshot → 5; store → 6; detector → 7; registry/pane wiring incl. OSC + exit/respawn/dispose → 8; UI dots/rollup/seen + fallbacks → 9 (uses Task 5's `paneDot` unknown→activity fallback); docs → 10. Out-of-scope items (notifications, war-room gating, Rust bridge) appear in no task. ✔
- **Placeholders:** none — every code step carries real code; Steps that say "read the file first" (MembersTab, user-guide) are integration edits into files whose current shape the implementer must see, with the decision logic already fixed by pure helpers. ✔
- **Type consistency:** `AgentPaneState` defined once (rollup.ts, Task 5) and imported by the store (Task 6); `DetectorDeps.publish` matches the store's `publish(id, state, {paneWatched})` via the closure in Task 8; `paneDot`/`workspaceDot` return `DisplayState | 'activity' | null` consistently in Tasks 5 and 9; `manifestForAgent` keyed by template ids matching `templates.ts` (`claude-code`, not `claude`). ✔
