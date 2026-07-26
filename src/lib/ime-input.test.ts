import { describe, it, expect } from 'vitest'
import { imeTextFromKeyEvent } from './ime-input'

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey', boolean>> & { code?: string } = {}
) => ({
  key: k,
  code: '',
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

  it('returns a pure-ASCII re-insertion when the physical key produces text', () => {
    // Captured from XKey typing "reddit": telex turns "dd" into "đ", then the
    // escape re-inserts the literal "dd" as one keydown whose `code` is still
    // the physical letter key. The string is indistinguishable from a key name
    // by shape alone — `code` is what tells them apart. Losing this event is the
    // whole "reddit" bug: the pty saw "d", XKey believed it sent "dd", and every
    // later correction landed one character off (đ d đ d …).
    expect(imeTextFromKeyEvent(key('dd', { code: 'KeyA' }))).toBe('dd')
    expect(imeTextFromKeyEvent(key('aa', { code: 'KeyA' }))).toBe('aa')
    expect(imeTextFromKeyEvent(key('reddit', { code: 'KeyT' }))).toBe('reddit')
    expect(imeTextFromKeyEvent(key('oo', { code: 'KeyO' }))).toBe('oo')
    expect(imeTextFromKeyEvent(key('w2', { code: 'Digit2' }))).toBe('w2')
  })

  it('ignores single characters — xterm already delivers those correctly', () => {
    expect(imeTextFromKeyEvent(key('a'))).toBeNull()
    expect(imeTextFromKeyEvent(key('à'))).toBeNull()
    // From the same XKey capture: "đ" arrives on code=KeyA and survives xterm's
    // keydown path intact, so intercepting it would double-send.
    expect(imeTextFromKeyEvent(key('đ', { code: 'KeyA' }))).toBeNull()
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

  it('ignores named keys even when they carry their own physical code', () => {
    // How they actually arrive in the trace: key and code both set.
    expect(imeTextFromKeyEvent(key('Backspace', { code: 'Backspace' }))).toBeNull()
    expect(imeTextFromKeyEvent(key('CapsLock', { code: 'CapsLock' }))).toBeNull()
    expect(imeTextFromKeyEvent(key('Meta', { code: 'MetaLeft' }))).toBeNull()
    expect(imeTextFromKeyEvent(key('Enter', { code: 'NumpadEnter' }))).toBeNull()
    expect(imeTextFromKeyEvent(key('ArrowUp', { code: 'ArrowUp' }))).toBeNull()
  })

  it('refuses an unknown named key rather than typing it into the shell', () => {
    // Defence in depth for a key this file has never heard of: a non-text
    // `code` means the OS pressed a real non-text key, whatever it is called.
    expect(imeTextFromKeyEvent(key('LaunchMediaPlayer', { code: 'MediaSelect' }))).toBeNull()
    expect(imeTextFromKeyEvent(key('SomethingNewInTheSpec', { code: 'Fn' }))).toBeNull()
    // And with no `code` at all there is nothing to go on, so shape decides —
    // an identifier stays a key. This is the one case a bộ gõ can still lose.
    expect(imeTextFromKeyEvent(key('SomethingNewInTheSpec'))).toBeNull()
    expect(imeTextFromKeyEvent(key('dd'))).toBeNull()
  })

  it('ignores chords so Ctrl/Alt/Cmd shortcuts still reach their handlers', () => {
    expect(imeTextFromKeyEvent(key('ạn', { ctrlKey: true }))).toBeNull()
    expect(imeTextFromKeyEvent(key('ạn', { altKey: true }))).toBeNull()
    expect(imeTextFromKeyEvent(key('ạn', { metaKey: true }))).toBeNull()
    expect(imeTextFromKeyEvent(key('dd', { code: 'KeyA', ctrlKey: true }))).toBeNull()
  })
})
