import { describe, it, expect } from 'vitest'
import { diffToEdit, encodeEdit, ownsKeydown, ownsInputEvent, breaksSegment } from './terminal-input-client'

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

  it('counts an astral emoji as one grapheme', () => {
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
  })
})

describe('ownsInputEvent', () => {
  it('owns text changes outside composition', () => {
    expect(ownsInputEvent({ isComposing: false })).toBe(true)
  })

  it('leaves composition to xterm — CJK is unverified and must not be touched', () => {
    expect(ownsInputEvent({ isComposing: true })).toBe(false)
  })
})

describe('breaksSegment', () => {
  it('ends the segment for any key xterm handles itself', () => {
    // xterm cancels every key it emits for, so the textarea keeps stale text
    // while the pty line has already moved on. Restart rather than diff against it.
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
