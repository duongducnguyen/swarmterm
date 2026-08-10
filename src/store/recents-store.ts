import { create } from 'zustand'
import { readRecents, addRecent, removeRecent, storeRecents } from '@/lib/recent-folders'

/**
 * Shared list of recently-used working folders, persisted in localStorage.
 * Lifted into a store so both the Welcome form and the title-bar search read
 * and mutate one source of truth (a remove in either place updates both).
 *
 * `recents` starts empty; call `hydrate()` once from the renderer on mount —
 * the store creator must not touch `window` so node-based tests can import it.
 */
interface RecentsState {
  recents: string[]
  hydrate: () => void
  add: (path: string) => void
  remove: (path: string) => void
}

export const useRecentsStore = create<RecentsState>((set, get) => ({
  recents: [],
  hydrate: () => set({ recents: readRecents(window.localStorage) }),
  add: (path) => {
    const next = addRecent(get().recents, path)
    set({ recents: next })
    storeRecents(window.localStorage, next)
  },
  remove: (path) => {
    const next = removeRecent(get().recents, path)
    set({ recents: next })
    storeRecents(window.localStorage, next)
  }
}))
