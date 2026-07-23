import { describe, it, expect } from 'vitest'
import { shouldReturnFocus, type FocusedElementInfo } from './terminal-focus'

function info(over: Partial<FocusedElementInfo> = {}): FocusedElementInfo {
  return { tagName: 'DIV', isContentEditable: false, inOverlay: false, ...over }
}

describe('shouldReturnFocus', () => {
  it('returns focus when nothing is focused', () => {
    expect(shouldReturnFocus(null)).toBe(true)
  })

  it('returns focus when the body holds it', () => {
    expect(shouldReturnFocus(info({ tagName: 'BODY' }))).toBe(true)
  })

  it('returns focus when a chrome div holds it (a tab, a navbar item, a pane root)', () => {
    expect(shouldReturnFocus(info({ tagName: 'DIV' }))).toBe(true)
  })

  it('returns focus when a plain button holds it (a close X, the + button)', () => {
    expect(shouldReturnFocus(info({ tagName: 'BUTTON' }))).toBe(true)
  })

  it('stands down for a text input — the workspace rename field', () => {
    expect(shouldReturnFocus(info({ tagName: 'INPUT' }))).toBe(false)
  })

  it('stands down for textarea and select', () => {
    expect(shouldReturnFocus(info({ tagName: 'TEXTAREA' }))).toBe(false)
    expect(shouldReturnFocus(info({ tagName: 'SELECT' }))).toBe(false)
  })

  it('stands down for a contenteditable element', () => {
    expect(shouldReturnFocus(info({ isContentEditable: true }))).toBe(false)
  })

  it('stands down while an open menu or dialog owns focus', () => {
    expect(shouldReturnFocus(info({ tagName: 'DIV', inOverlay: true }))).toBe(false)
    expect(shouldReturnFocus(info({ tagName: 'BUTTON', inOverlay: true }))).toBe(false)
  })

  it('is case-insensitive about tag names', () => {
    expect(shouldReturnFocus(info({ tagName: 'input' }))).toBe(false)
  })
})
