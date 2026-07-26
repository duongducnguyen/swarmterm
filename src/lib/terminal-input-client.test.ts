import { describe, it, expect } from 'vitest'
import {
  diffToEdit,
  encodeEdit,
  ownsKeydown,
  ownsMultiCharKey,
  isOrdinaryCharKey,
  isThirdLevelShiftKey,
  ownsInputEvent,
  breaksSegment
} from './terminal-input-client'

/** A minimal KeyboardEvent stand-in — only the fields these functions read. */
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

describe('diffToEdit', () => {
  it('reports a pure insertion when the text only grew', () => {
    expect(diffToEdit('', 'a')).toEqual({ deletions: 0, insert: 'a' })
    expect(diffToEdit('red', 'redd')).toEqual({ deletions: 0, insert: 'd' })
    expect(diffToEdit('redd', 'reddit')).toEqual({ deletions: 0, insert: 'it' })
  })

  it('reports a pure deletion when the text only shrank', () => {
    expect(diffToEdit('redd', 'red')).toEqual({ deletions: 1, insert: '' })
    expect(diffToEdit('abc', '')).toEqual({ deletions: 3, insert: '' })
  })

  it('keeps the common prefix when a bộ gõ rewrites the tail', () => {
    // Telex: "red" + "d" becomes "ređ" — erase one, type one.
    expect(diffToEdit('red', 'ređ')).toEqual({ deletions: 1, insert: 'đ' })
    // "ban" + dấu nặng becomes "bạn" — the accent lands mid-word.
    expect(diffToEdit('ban', 'bạn')).toEqual({ deletions: 2, insert: 'ạn' })
  })

  it('counts graphemes, not code units, so one accent costs one DEL', () => {
    // "ạ" decomposed (NFD) is "a" + U+0323: two UTF-16 units, one terminal cell.
    // Counting units would send two DELs and desync exactly like the bug we are fixing.
    const nfd = 'ạ'
    expect(nfd.length).toBe(2)
    expect(diffToEdit(`b${nfd}`, 'b')).toEqual({ deletions: 1, insert: '' })
    expect(diffToEdit('ba', `b${nfd}`)).toEqual({ deletions: 1, insert: nfd })
  })

  it('counts an astral emoji as one unit despite being a surrogate pair', () => {
    // Unlike the NFD case above, 😀 is a single codepoint — this shows graphemes
    // agree with codepoints here, not that they differ from them. The real
    // codepoints-vs-graphemes distinction is the NFD "ạ" test above.
    expect(diffToEdit('hi😀', 'hi')).toEqual({ deletions: 1, insert: '' })
    expect(diffToEdit('hi', 'hi😀')).toEqual({ deletions: 0, insert: '😀' })
  })

  it('reports no edit when nothing changed', () => {
    expect(diffToEdit('abc', 'abc')).toEqual({ deletions: 0, insert: '' })
    expect(diffToEdit('', '')).toEqual({ deletions: 0, insert: '' })
  })
})

describe('encodeEdit', () => {
  it('sends one DEL per deleted grapheme, then the new tail', () => {
    expect(encodeEdit({ deletions: 2, insert: 'dd' })).toBe('\x7f\x7fdd')
    expect(encodeEdit({ deletions: 0, insert: 'it' })).toBe('it')
    expect(encodeEdit({ deletions: 3, insert: '' })).toBe('\x7f\x7f\x7f')
  })

  it('encodes a no-op edit as the empty string so callers can skip the write', () => {
    expect(encodeEdit({ deletions: 0, insert: '' })).toBe('')
  })
})

describe('ownsKeydown', () => {
  it('owns the IME placeholder keycode so xterm never runs its own diff', () => {
    // keyCode 229 means "the IME is handling this". xterm reacts by scheduling
    // CompositionHelper._handleAnyTextareaChanges, whose diff sends one DEL for
    // any number of deletions. Both layers firing = every keystroke sent twice.
    expect(ownsKeydown({ keyCode: 229, isComposing: false })).toBe(true)
  })

  it('leaves real keys to xterm, whose escape sequences are correct', () => {
    expect(ownsKeydown({ keyCode: 8, isComposing: false })).toBe(false) // Backspace
    expect(ownsKeydown({ keyCode: 13, isComposing: false })).toBe(false) // Enter
    expect(ownsKeydown({ keyCode: 68, isComposing: false })).toBe(false) // D
    expect(ownsKeydown({ keyCode: 37, isComposing: false })).toBe(false) // ArrowLeft
  })

  it('leaves everything alone while a composition is active', () => {
    expect(ownsKeydown({ keyCode: 229, isComposing: true })).toBe(false)
    // isComposing is checked before keyCode, so it wins regardless of keyCode.
    expect(ownsKeydown({ keyCode: 65, isComposing: true })).toBe(false)
  })
})

describe('ownsMultiCharKey', () => {
  it('owns the whole replacement string a Vietnamese bộ gõ re-inserts', () => {
    // Real captures from EVKey/xkey: after synthesising Backspaces it re-inserts
    // a multi-character string in one keydown. xterm can only carry one char
    // through keypress' charCode, so without this the tail is silently dropped.
    expect(ownsMultiCharKey(key('ạn'))).toBe(true)
    expect(ownsMultiCharKey(key('ìn'))).toBe(true)
    expect(ownsMultiCharKey(key('Ươ'))).toBe(true)
  })

  it('owns a pure-ASCII re-insertion when the physical key produces text', () => {
    // Captured from XKey typing "reddit": telex turns "dd" into "đ", then the
    // escape re-inserts the literal "dd" as one keydown whose `code` is still
    // the physical letter key. The string is indistinguishable from a key name
    // by shape alone — `code` is what tells them apart.
    expect(ownsMultiCharKey(key('dd', { code: 'KeyA' }))).toBe(true)
    expect(ownsMultiCharKey(key('aa', { code: 'KeyA' }))).toBe(true)
    expect(ownsMultiCharKey(key('reddit', { code: 'KeyT' }))).toBe(true)
    expect(ownsMultiCharKey(key('oo', { code: 'KeyO' }))).toBe(true)
    expect(ownsMultiCharKey(key('w2', { code: 'Digit2' }))).toBe(true)
  })

  it('owns a macOS Telex tone correction delivered the same way', () => {
    // Captured with real macOS Simple Telex typing "Chào bạn": the tone mark
    // arrives as one keydown with key="ạn", code="KeyA" — indistinguishable in
    // shape from XKey's re-insertion above. `committed` must survive this
    // event (see terminal-registry.ts) so the diff computes 2 deletions, not
    // the 0 the old ime-input.ts always sent — that was "banạn" instead of
    // "bạn".
    expect(ownsMultiCharKey(key('ạn', { code: 'KeyA' }))).toBe(true)
  })

  it('leaves single characters to xterm — those already arrive correctly', () => {
    expect(ownsMultiCharKey(key('a'))).toBe(false)
    expect(ownsMultiCharKey(key('à'))).toBe(false)
    // From the same XKey capture: "đ" arrives on code=KeyA and survives xterm's
    // keydown path intact, so claiming it would double-send.
    expect(ownsMultiCharKey(key('đ', { code: 'KeyA' }))).toBe(false)
  })

  it('leaves named keys alone so they keep their control-sequence meaning', () => {
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
      expect(ownsMultiCharKey(key(named)), named).toBe(false)
    }
  })

  it('leaves named keys alone even when they carry their own physical code', () => {
    // How they actually arrive in the trace: key and code both set.
    expect(ownsMultiCharKey(key('Backspace', { code: 'Backspace' }))).toBe(false)
    expect(ownsMultiCharKey(key('CapsLock', { code: 'CapsLock' }))).toBe(false)
    expect(ownsMultiCharKey(key('Meta', { code: 'MetaLeft' }))).toBe(false)
    expect(ownsMultiCharKey(key('Enter', { code: 'NumpadEnter' }))).toBe(false)
    expect(ownsMultiCharKey(key('ArrowUp', { code: 'ArrowUp' }))).toBe(false)
  })

  it('refuses an unknown named key rather than typing it into the shell', () => {
    // Defence in depth for a key this file has never heard of: a non-text
    // `code` means the OS pressed a real non-text key, whatever it is called.
    expect(ownsMultiCharKey(key('LaunchMediaPlayer', { code: 'MediaSelect' }))).toBe(false)
    expect(ownsMultiCharKey(key('SomethingNewInTheSpec', { code: 'Fn' }))).toBe(false)
    // And with no `code` at all there is nothing to go on, so shape decides —
    // an identifier stays a key. This is the one case a bộ gõ can still lose.
    expect(ownsMultiCharKey(key('SomethingNewInTheSpec'))).toBe(false)
    expect(ownsMultiCharKey(key('dd'))).toBe(false)
  })

  it('refuses a chord so Ctrl/Alt/Cmd shortcuts still reach their handlers', () => {
    expect(ownsMultiCharKey(key('ạn', { ctrlKey: true }))).toBe(false)
    expect(ownsMultiCharKey(key('ạn', { altKey: true }))).toBe(false)
    expect(ownsMultiCharKey(key('ạn', { metaKey: true }))).toBe(false)
    expect(ownsMultiCharKey(key('dd', { code: 'KeyA', ctrlKey: true }))).toBe(false)
  })
})

describe('isOrdinaryCharKey', () => {
  it('owns an unmodified single character, including Space', () => {
    for (const k of ['a', 'Z', '5', ' ', 'đ', '!']) {
      expect(isOrdinaryCharKey(key(k)), JSON.stringify(k)).toBe(true)
    }
  })

  it('refuses a chord — Ctrl/Alt/Cmd bindings are not text', () => {
    expect(isOrdinaryCharKey(key('c', { ctrlKey: true }))).toBe(false)
    expect(isOrdinaryCharKey(key('a', { altKey: true }))).toBe(false)
    expect(isOrdinaryCharKey(key('v', { metaKey: true }))).toBe(false)
  })

  it('refuses a multi-character key — that case belongs to ownsMultiCharKey', () => {
    expect(isOrdinaryCharKey(key('Enter'))).toBe(false)
    expect(isOrdinaryCharKey(key('ạn'))).toBe(false)
  })
})

describe('isThirdLevelShiftKey', () => {
  const mac = { isMac: true, isWindows: false }
  const win = { isMac: false, isWindows: true }
  const linux = { isMac: false, isWindows: false }

  const shiftEvent = (
    mods: Partial<{
      altKey: boolean
      ctrlKey: boolean
      metaKey: boolean
      keyCode: number
      altGraph: boolean
    }> = {}
  ) => ({
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    keyCode: 79, // 'O'
    altGraph: false,
    ...mods
  })

  it('owns Option+letter on macOS — repro: US layout, Option+O must send "ø", not "øø"', () => {
    expect(isThirdLevelShiftKey(shiftEvent({ altKey: true }), mac)).toBe(true)
  })

  it('owns AltGr+letter on Windows via the ctrlKey+altKey chord AltGr synthesises', () => {
    // Repro: German layout, AltGr+Q must send "@", not "@@".
    expect(isThirdLevelShiftKey(shiftEvent({ altKey: true, ctrlKey: true, keyCode: 81 }), win)).toBe(
      true
    )
  })

  it('owns AltGr reported via getModifierState("AltGraph"), independent of altKey/ctrlKey', () => {
    expect(isThirdLevelShiftKey(shiftEvent({ altGraph: true }), win)).toBe(true)
  })

  it('refuses plain Alt on Windows — that is not AltGr', () => {
    expect(isThirdLevelShiftKey(shiftEvent({ altKey: true }), win)).toBe(false)
  })

  it('refuses Option combined with Ctrl or Cmd on macOS — those are chords, not third-level shift', () => {
    expect(isThirdLevelShiftKey(shiftEvent({ altKey: true, ctrlKey: true }), mac)).toBe(false)
    expect(isThirdLevelShiftKey(shiftEvent({ altKey: true, metaKey: true }), mac)).toBe(false)
  })

  it('refuses Option/Alt entirely off macOS and Windows', () => {
    expect(isThirdLevelShiftKey(shiftEvent({ altKey: true }), linux)).toBe(false)
  })

  it('refuses when nothing is held', () => {
    expect(isThirdLevelShiftKey(shiftEvent(), mac)).toBe(false)
    expect(isThirdLevelShiftKey(shiftEvent(), win)).toBe(false)
  })

  it('respects the keyCode > 47 gate _keyDown itself applies at the keydown stage', () => {
    // Below 48 the printable-key gate this mirrors does not clear even when
    // the modifier shape matches — Space stays isOrdinaryCharKey's case.
    expect(isThirdLevelShiftKey(shiftEvent({ altKey: true, keyCode: 32 }), mac)).toBe(false)
  })

  it('treats a falsy keyCode as passing the gate, matching the literal xterm formula', () => {
    expect(isThirdLevelShiftKey(shiftEvent({ altKey: true, keyCode: 0 }), mac)).toBe(true)
  })
})

describe('ownsInputEvent', () => {
  it('owns an ordinary keystroke outside composition', () => {
    expect(ownsInputEvent({ isComposing: false, inputType: 'insertText' })).toBe(true)
  })

  it('owns a macOS Telex/VNI word replacement outside composition', () => {
    // WKWebView's delivery for Input Method Kit's `insertText:replacementRange:`
    // (see the design spec) — stock xterm's `_inputEvent` never accepted this
    // inputType at all, so this module exists specifically to carry it through.
    expect(ownsInputEvent({ isComposing: false, inputType: 'insertReplacementText' })).toBe(true)
  })

  it('leaves composition to xterm — CJK is unverified and must not be touched', () => {
    expect(ownsInputEvent({ isComposing: true, inputType: 'insertText' })).toBe(false)
  })

  it('refuses paste, drop, and undo/redo — already delivered by another path, or not a pty edit at all', () => {
    // A native paste `decideClipboardAction` doesn't suppress (menu bar Edit >
    // Paste, a Services action) is sent by xterm's own handlePasteEvent; a copy
    // from this layer's diff on the input event that follows would double-send.
    // historyUndo/historyRedo don't correspond to a pty edit at all.
    for (const inputType of ['insertFromPaste', 'insertFromDrop', 'historyUndo', 'historyRedo']) {
      expect(ownsInputEvent({ isComposing: false, inputType }), inputType).toBe(false)
    }
  })
})

describe('breaksSegment', () => {
  it('ends the segment for any key xterm handles itself', () => {
    // For most of these xterm cancels its own default handling entirely, so
    // the textarea keeps stale text while the pty line has already moved on
    // — restart rather than diff against it. Space is the one exception (see
    // `isOrdinaryCharKey`): its keydown default is NOT cancelled, but the
    // segment still ends here, because a completed word is exactly where a
    // correction should stop reaching backward.
    for (const key of ['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowLeft', 'a', ' ']) {
      expect(breaksSegment({ key }), key).toBe(true)
    }
  })

  it('survives a bare modifier press, which changes nothing', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']) {
      expect(breaksSegment({ key }), key).toBe(false)
    }
  })
})
