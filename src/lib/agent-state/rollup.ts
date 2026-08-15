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

/** A dot function's result is never idle/unknown — both fold to `null`
 *  (idle) or `'activity'` (unknown/undetected) before this type is reached,
 *  so callers can render a plain ternary without an idle/unknown guard. */
export type DotState = 'blocked' | 'done' | 'working' | 'activity'

/** What dot one pane's row shows: a real agent state when known, the legacy
 *  output-activity dot while state is unknown (startup grace, agent exited)
 *  or for plain shells, nothing when idle/quiet. */
export function paneDot(display: DisplayState | undefined, outputActive: boolean): DotState | null {
  if (display === 'blocked' || display === 'done' || display === 'working') return display
  if (display === 'idle') return null
  return outputActive ? 'activity' : null
}

/** Workspace-tab rollup: the highest-attention dot across the panes. */
export function workspaceDot(
  panes: Array<{ display: DisplayState | undefined; outputActive: boolean }>
): DotState | null {
  let best: DotState | null = null
  for (const pane of panes) {
    const dot = paneDot(pane.display, pane.outputActive)
    if (dot !== null && (best === null || PRIORITY[dot] > PRIORITY[best])) best = dot
  }
  return best
}
