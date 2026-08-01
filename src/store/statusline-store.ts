import { create } from 'zustand'
import {
  DEFAULT_STATUSLINE_ENABLED,
  readStoredStatuslineEnabled,
  storeStatuslineEnabled
} from '@/lib/statusline-pref'
import { setClaudeStatusline } from '@/tauri/statusline'

export interface StatuslineStore {
  enabled: boolean
  /** Push the persisted preference to disk on boot. */
  sync: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
}

/**
 * Whether Swarmterm owns Claude Code's status line. Renderer-only — touches
 * `window` directly. `sync` runs on boot so the entry self-heals after the app
 * moves: the backend re-derives the command from `current_exe()` every time,
 * and a stale path would otherwise leave Claude running a binary that is gone.
 */
export const useStatuslineStore = create<StatuslineStore>((set, get) => {
  const initial =
    typeof window === 'undefined'
      ? DEFAULT_STATUSLINE_ENABLED
      : readStoredStatuslineEnabled(window.localStorage)
  return {
    enabled: initial,
    sync: async () => {
      // A rejection here means the user owns their statusLine. That is a
      // legitimate configuration, not an error worth surfacing on every boot.
      await setClaudeStatusline(get().enabled).catch((e) =>
        console.warn('statusline: could not apply preference', e)
      )
    },
    setEnabled: async (enabled) => {
      storeStatuslineEnabled(window.localStorage, enabled)
      set({ enabled })
      await setClaudeStatusline(enabled).catch((e) =>
        console.warn('statusline: could not apply preference', e)
      )
    }
  }
})
