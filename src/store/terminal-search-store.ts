import { create } from 'zustand'

/**
 * Which terminal's find overlay is open, if any. One overlay at a time (VS
 * Code keeps a find widget per focused terminal; single-open is the accepted
 * v1 simplification) — opening a new one implicitly replaces whatever was
 * open elsewhere. `open` is idempotent: calling it again for the same id is
 * how Cmd/Ctrl+F re-focuses an already-open overlay (SearchOverlay listens
 * for that via an effect keyed on `openFor`).
 */
export interface TerminalSearchStore {
  openFor: string | null
  open: (terminalId: string) => void
  close: () => void
}

export const useTerminalSearchStore = create<TerminalSearchStore>((set) => ({
  openFor: null,
  open: (terminalId) => set({ openFor: terminalId }),
  close: () => set({ openFor: null })
}))
