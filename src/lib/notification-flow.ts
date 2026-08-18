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
