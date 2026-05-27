import { create } from 'zustand'
import {
  DEFAULT_NAVBAR_VISIBLE,
  readStoredNavbarVisible,
  storeNavbarVisible
} from '@/lib/navbar-visibility'

export interface NavbarVisibilityStore {
  visible: boolean
  toggle: () => void
}

/**
 * Whether the left Navbar is currently expanded. Reads the persisted choice on
 * first creation and writes every change back to localStorage. Renderer-only —
 * touches `window` directly.
 */
export const useNavbarVisibilityStore = create<NavbarVisibilityStore>((set) => {
  const initial =
    typeof window === 'undefined'
      ? DEFAULT_NAVBAR_VISIBLE
      : readStoredNavbarVisible(window.localStorage)
  return {
    visible: initial,
    toggle: () =>
      set((s) => {
        const visible = !s.visible
        storeNavbarVisible(window.localStorage, visible)
        return { visible }
      })
  }
})
