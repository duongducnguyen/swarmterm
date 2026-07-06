import { create } from 'zustand'

/**
 * Per-terminal header titles, keyed by terminalId. Runtime state that lives
 * OUTSIDE the layout tree — mirroring terminal-registry's xterm instances and
 * browser-store's previews, both keyed by terminalId. An agent names its own
 * pane via the `terminal.set_title` MCP tool; keying by the stable terminalId
 * means the title survives pane re-parenting (split collapse), and it is
 * cleared on respawn (agent/cwd/shell switch) so a stale title never lingers.
 */
export interface TerminalTitleStore {
  titles: Record<string, string>
  setTitle: (terminalId: string, title: string) => void
  clearTitle: (terminalId: string) => void
}

export const useTerminalTitleStore = create<TerminalTitleStore>((set) => ({
  titles: {},

  setTitle: (terminalId, title) =>
    set((s) => ({ titles: { ...s.titles, [terminalId]: title } })),

  clearTitle: (terminalId) =>
    set((s) => {
      if (!(terminalId in s.titles)) return s
      const titles = { ...s.titles }
      delete titles[terminalId]
      return { titles }
    }),
}))
