import { create } from 'zustand'

/**
 * Per-terminal "is actively producing output" flag, keyed by terminalId.
 * Runtime state OUTSIDE the layout tree — mirroring terminal-registry's xterm
 * instances and terminal-title-store's titles. Written by the ActivityTracker
 * wired in terminal-registry (yellow while the pty streams bytes), read by the
 * Navbar terminal list and workspace tabs. Cleared when a terminal is disposed
 * so a dead pane never keeps a stale badge.
 */
export interface TerminalActivityStore {
  active: Record<string, boolean>
  setActive: (terminalId: string, active: boolean) => void
  clear: (terminalId: string) => void
}

export const useTerminalActivityStore = create<TerminalActivityStore>((set) => ({
  active: {},

  setActive: (terminalId, active) =>
    set((s) => {
      // Skip the state churn (and downstream re-renders) when nothing changed —
      // the tracker only calls on genuine edge transitions, but guard anyway.
      if (s.active[terminalId] === active) return s
      return { active: { ...s.active, [terminalId]: active } }
    }),

  clear: (terminalId) =>
    set((s) => {
      if (!(terminalId in s.active)) return s
      const active = { ...s.active }
      delete active[terminalId]
      return { active }
    }),
}))
