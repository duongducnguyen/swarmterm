import { create } from 'zustand'
import {
  DEFAULT_TERMINAL_TEXT,
  clampFontSize,
  clampLineHeight,
  readStoredTerminalText,
  storeTerminalText,
  type TerminalTextPref
} from '@/lib/terminal-text'

export interface TerminalTextStore {
  text: TerminalTextPref
  setFontFamily: (stack: string) => void
  setFontSize: (px: number) => void
  setLineHeight: (mult: number) => void
  setLigatures: (on: boolean) => void
  reset: () => void
}

/**
 * The active terminal text prefs. Reads the persisted value on first creation
 * and writes every change back to localStorage. Renderer-only — touches
 * `window` directly. The terminal registry subscribes to this store to push
 * changes onto live terminals (one-directional: registry → store).
 */
export const useTerminalTextStore = create<TerminalTextStore>((set, get) => {
  const initial =
    typeof window === 'undefined'
      ? { ...DEFAULT_TERMINAL_TEXT }
      : readStoredTerminalText(window.localStorage)

  function update(patch: Partial<TerminalTextPref>): void {
    const text = { ...get().text, ...patch }
    if (typeof window !== 'undefined') storeTerminalText(window.localStorage, text)
    set({ text })
  }

  return {
    text: initial,
    setFontFamily: (stack) => update({ fontFamily: stack }),
    setFontSize: (px) => update({ fontSize: clampFontSize(px) }),
    setLineHeight: (mult) => update({ lineHeight: clampLineHeight(mult) }),
    setLigatures: (on) => update({ ligatures: on }),
    reset: () => update({ ...DEFAULT_TERMINAL_TEXT })
  }
})
