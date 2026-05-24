import { create } from 'zustand'
import {
  applyThemeClass,
  nextTheme,
  readStoredTheme,
  storeTheme,
  type Theme
} from '@/lib/theme'

export interface ThemeStore {
  theme: Theme
  toggleTheme: () => void
}

/**
 * The active color theme. Reads the persisted choice when first created,
 * reflects every change onto the document root, and persists it to
 * localStorage. Renderer-only — touches `window` / `document` directly.
 */
export const useThemeStore = create<ThemeStore>((set, get) => {
  const commit = (theme: Theme): void => {
    applyThemeClass(document.documentElement, theme)
    storeTheme(window.localStorage, theme)
    set({ theme })
  }

  const initial = readStoredTheme(window.localStorage)
  applyThemeClass(document.documentElement, initial)

  return {
    theme: initial,
    toggleTheme: () => commit(nextTheme(get().theme))
  }
})
