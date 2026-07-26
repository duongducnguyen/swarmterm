import { describe, it, expect } from 'vitest'
import { diffToEdit, encodeEdit } from './terminal-input-client'

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
