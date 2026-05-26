import { create } from 'zustand'
import {
  DEFAULT_STYLE,
  readStoredStyle,
  storeStyle,
  type Style
} from '@/lib/appearance'

export interface AppearanceStore {
  style: Style
  setStyle: (style: Style) => void
}

/**
 * The active visual style. Reads the persisted choice on first creation and
 * writes every change back to localStorage. Renderer-only — touches `window`
 * directly.
 */
export const useAppearanceStore = create<AppearanceStore>((set) => {
  const initial =
    typeof window === 'undefined' ? DEFAULT_STYLE : readStoredStyle(window.localStorage)
  return {
    style: initial,
    setStyle: (style) => {
      storeStyle(window.localStorage, style)
      set({ style })
    }
  }
})
