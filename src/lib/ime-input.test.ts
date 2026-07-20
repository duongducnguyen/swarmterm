import { describe, it, expect } from 'vitest'
import { imeTextFromKeyEvent } from './ime-input'

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...mods
})

describe('imeTextFromKeyEvent', () => {
  it('returns the whole replacement string a Vietnamese bộ gõ re-inserts', () => {
    // Real captures from EVKey/xkey: after synthesising Backspaces it re-inserts
    // a multi-character string in one keydown. xterm can only carry one char
    // through keypress' charCode, so without this the tail is silently dropped.
    expect(imeTextFromKeyEvent(key('ạn'))).toBe('ạn')
    expect(imeTextFromKeyEvent(key('ìn'))).toBe('ìn')
    expect(imeTextFromKeyEvent(key('Ươ'))).toBe('Ươ')
  })

  it('ignores single characters — xterm already delivers those correctly', () => {
    expect(imeTextFromKeyEvent(key('a'))).toBeNull()
    expect(imeTextFromKeyEvent(key('à'))).toBeNull()
    expect(imeTextFromKeyEvent(key('ạ'))).toBeNull()
  })

  it('ignores named keys so they keep their control-sequence meaning', () => {
    for (const named of [
      'Enter',
      'Backspace',
      'Tab',
      'Escape',
      'Delete',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'Insert',
      'Shift',
      'Control',
      'Alt',
      'Meta',
      'CapsLock',
      'NumLock',
      'ScrollLock',
      'ContextMenu',
      'Dead',
      'Process',
      'Unidentified',
      'AltGraph',
      'F1',
      'F12',
      'AudioVolumeUp',
      'MediaPlayPause',
      'BrowserBack',
      'OS'
    ]) {
      expect(imeTextFromKeyEvent(key(named)), named).toBeNull()
    }
  })

  it('ignores chords so Ctrl/Alt/Cmd shortcuts still reach their handlers', () => {
    expect(imeTextFromKeyEvent(key('ạn', { ctrlKey: true }))).toBeNull()
    expect(imeTextFromKeyEvent(key('ạn', { altKey: true }))).toBeNull()
    expect(imeTextFromKeyEvent(key('ạn', { metaKey: true }))).toBeNull()
  })
})
