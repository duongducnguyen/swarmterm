import { describe, it, expect } from 'vitest'
import { decideClipboardAction, type KeyEventLike } from './terminal-clipboard'

/** Minimal event factory for the decision function. */
function ev(partial: Partial<KeyEventLike>): KeyEventLike {
  return { type: 'keydown', key: 'a', ctrlKey: false, metaKey: false, ...partial }
}

describe('decideClipboardAction', () => {
  it('copies on Ctrl+C when there is a selection (non-mac)', () => {
    const action = decideClipboardAction(ev({ key: 'c', ctrlKey: true }), {
      hasSelection: true,
      isMac: false
    })
    expect(action).toBe('copy')
  })

  it('passes through Ctrl+C when there is no selection (preserve SIGINT)', () => {
    const action = decideClipboardAction(ev({ key: 'c', ctrlKey: true }), {
      hasSelection: false,
      isMac: false
    })
    expect(action).toBe('passthrough')
  })

  it('pastes on Ctrl+V regardless of selection (non-mac)', () => {
    expect(
      decideClipboardAction(ev({ key: 'v', ctrlKey: true }), { hasSelection: false, isMac: false })
    ).toBe('paste')
    expect(
      decideClipboardAction(ev({ key: 'v', ctrlKey: true }), { hasSelection: true, isMac: false })
    ).toBe('paste')
  })

  it('uses Cmd (meta) on mac and ignores Ctrl there', () => {
    expect(
      decideClipboardAction(ev({ key: 'c', metaKey: true }), { hasSelection: true, isMac: true })
    ).toBe('copy')
    expect(
      decideClipboardAction(ev({ key: 'v', metaKey: true }), { hasSelection: false, isMac: true })
    ).toBe('paste')
    // Ctrl+C on mac must NOT copy — it stays SIGINT.
    expect(
      decideClipboardAction(ev({ key: 'c', ctrlKey: true }), { hasSelection: true, isMac: true })
    ).toBe('passthrough')
  })

  it('does not trigger on the wrong modifier (non-mac meta, mac ctrl)', () => {
    expect(
      decideClipboardAction(ev({ key: 'c', metaKey: true }), { hasSelection: true, isMac: false })
    ).toBe('passthrough')
  })

  it('only acts on keydown, not keyup/keypress', () => {
    expect(
      decideClipboardAction(ev({ type: 'keyup', key: 'c', ctrlKey: true }), {
        hasSelection: true,
        isMac: false
      })
    ).toBe('passthrough')
  })

  it('is case-insensitive on the key', () => {
    expect(
      decideClipboardAction(ev({ key: 'C', ctrlKey: true }), { hasSelection: true, isMac: false })
    ).toBe('copy')
  })

  it('ignores unrelated keys', () => {
    expect(
      decideClipboardAction(ev({ key: 'a', ctrlKey: true }), { hasSelection: true, isMac: false })
    ).toBe('passthrough')
  })
})
