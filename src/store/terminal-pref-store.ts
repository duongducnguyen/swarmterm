import { create } from 'zustand'
import {
  DEFAULT_SHELL_ID,
  readStoredShellId,
  storeShellId,
  type ShellId
} from '@/lib/terminal-pref'

export interface TerminalPrefStore {
  shellId: ShellId
  setShellId: (id: ShellId) => void
}

/**
 * The active default shell id. Reads the persisted choice on first creation and
 * writes every change back to localStorage. Renderer-only — touches `window`
 * directly.
 */
export const useTerminalPrefStore = create<TerminalPrefStore>((set) => {
  const initial =
    typeof window === 'undefined' ? DEFAULT_SHELL_ID : readStoredShellId(window.localStorage)
  return {
    shellId: initial,
    setShellId: (id) => {
      storeShellId(window.localStorage, id)
      set({ shellId: id })
    }
  }
})
