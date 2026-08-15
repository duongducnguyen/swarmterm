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
