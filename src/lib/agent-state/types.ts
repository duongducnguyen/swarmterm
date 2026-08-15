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
