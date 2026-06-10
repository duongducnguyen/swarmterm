import { describe, it, expect } from 'vitest'
import { SHORTCUT_GROUPS, matchAppShortcut, type ShortcutKeyEvent } from './keybindings'

describe('SHORTCUT_GROUPS', () => {
  it('is non-empty', () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThan(0)
  })

  it('every group has a non-empty label and at least one entry', () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.label.trim()).not.toBe('')
      expect(group.entries.length).toBeGreaterThan(0)
    }
  })

  it('every entry has a non-empty description and at least one key token', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const entry of group.entries) {
        expect(entry.description.trim()).not.toBe('')
        expect(entry.keys.length).toBeGreaterThan(0)
      }
    }
  })

  it('no duplicate descriptions within a group', () => {
    for (const group of SHORTCUT_GROUPS) {
      const descs = group.entries.map((e) => e.description)
      const unique = new Set(descs)
      expect(unique.size).toBe(descs.length)
    }
  })

  it('every group has a non-empty id and ids are unique', () => {
    const ids = SHORTCUT_GROUPS.map((g) => g.id)
    expect(ids.every((id) => id.trim() !== '')).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

function key(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return { key: 'b', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...overrides }
}

describe('matchAppShortcut', () => {
  it('Ctrl+B toggles navbar on non-mac', () => {
    expect(matchAppShortcut(key({ ctrlKey: true }), false)).toBe('toggle-navbar')
  })

  it('Ctrl+Shift+B toggles broadcast on non-mac', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe('toggle-broadcast')
  })

  it('Cmd+B toggles navbar on mac', () => {
    expect(matchAppShortcut(key({ metaKey: true }), true)).toBe('toggle-navbar')
  })

  it('Cmd+Shift+B toggles broadcast on mac', () => {
    expect(matchAppShortcut(key({ metaKey: true, shiftKey: true }), true)).toBe('toggle-broadcast')
  })

  it('Ctrl+B does NOT match on mac (left free for tmux prefix)', () => {
    expect(matchAppShortcut(key({ ctrlKey: true }), true)).toBeNull()
  })

  it('Cmd+B does not match on non-mac', () => {
    expect(matchAppShortcut(key({ metaKey: true }), false)).toBeNull()
  })

  it('rejects when the opposite modifier is also held', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, metaKey: true }), false)).toBeNull()
    expect(matchAppShortcut(key({ ctrlKey: true, metaKey: true }), true)).toBeNull()
  })

  it('rejects when Alt is held', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, altKey: true }), false)).toBeNull()
    expect(matchAppShortcut(key({ metaKey: true, altKey: true }), true)).toBeNull()
  })

  it('rejects other keys', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, key: 'a' }), false)).toBeNull()
  })

  it('matches uppercase B (shift held)', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, shiftKey: true, key: 'B' }), false)).toBe('toggle-broadcast')
  })

  it('plain B without modifier does not match', () => {
    expect(matchAppShortcut(key({}), false)).toBeNull()
    expect(matchAppShortcut(key({}), true)).toBeNull()
  })
})
