import { describe, it, expect } from 'vitest'
import { getShortcutGroups, matchAppShortcut, type ShortcutKeyEvent } from './keybindings'

describe.each([
  { label: 'non-mac', isMac: false },
  { label: 'mac', isMac: true },
])('getShortcutGroups ($label)', ({ isMac }) => {
  const groups = getShortcutGroups(isMac)

  it('is non-empty', () => {
    expect(groups.length).toBeGreaterThan(0)
  })

  it('every group has a non-empty label and at least one entry', () => {
    for (const group of groups) {
      expect(group.label.trim()).not.toBe('')
      expect(group.entries.length).toBeGreaterThan(0)
    }
  })

  it('every entry has a non-empty description and at least one key token', () => {
    for (const group of groups) {
      for (const entry of group.entries) {
        expect(entry.description.trim()).not.toBe('')
        expect(entry.keys.length).toBeGreaterThan(0)
      }
    }
  })

  it('no duplicate descriptions within a group', () => {
    for (const group of groups) {
      const descs = group.entries.map((e) => e.description)
      expect(new Set(descs).size).toBe(descs.length)
    }
  })

  it('every group has a non-empty id and ids are unique', () => {
    const ids = groups.map((g) => g.id)
    expect(ids.every((id) => id.trim() !== '')).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('getShortcutGroups platform tokens', () => {
  const tokens = (isMac: boolean): string[] =>
    getShortcutGroups(isMac).flatMap((g) => g.entries.flatMap((e) => e.keys))

  it('uses Ctrl/Alt on non-mac, never ⌘/⌥', () => {
    const t = tokens(false)
    expect(t).toContain('Ctrl')
    expect(t).toContain('Alt')
    expect(t).not.toContain('⌘')
    expect(t).not.toContain('⌥')
  })

  it('uses ⌘/⌥ on mac, never Ctrl/Alt', () => {
    const t = tokens(true)
    expect(t).toContain('⌘')
    expect(t).toContain('⌥')
    expect(t).not.toContain('Ctrl')
    expect(t).not.toContain('Alt')
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

describe('matchAppShortcut find-in-terminal', () => {
  it('Ctrl+F opens find on non-mac', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, key: 'f' }), false)).toBe('find-in-terminal')
  })

  it('Cmd+F opens find on mac', () => {
    expect(matchAppShortcut(key({ metaKey: true, key: 'f' }), true)).toBe('find-in-terminal')
  })

  it('Ctrl+F does NOT match on mac (wrong modifier)', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, key: 'f' }), true)).toBeNull()
  })

  it('Cmd+F does not match on non-mac', () => {
    expect(matchAppShortcut(key({ metaKey: true, key: 'f' }), false)).toBeNull()
  })

  it('Shift+F must NOT match (no shifted find binding)', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, shiftKey: true, key: 'f' }), false)).toBeNull()
    expect(matchAppShortcut(key({ metaKey: true, shiftKey: true, key: 'f' }), true)).toBeNull()
  })

  it('rejects when Alt is held', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, altKey: true, key: 'f' }), false)).toBeNull()
    expect(matchAppShortcut(key({ metaKey: true, altKey: true, key: 'f' }), true)).toBeNull()
  })

  it('rejects when the opposite modifier is also held', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, metaKey: true, key: 'f' }), false)).toBeNull()
    expect(matchAppShortcut(key({ ctrlKey: true, metaKey: true, key: 'f' }), true)).toBeNull()
  })

  it('plain F without modifier does not match', () => {
    expect(matchAppShortcut(key({ key: 'f' }), false)).toBeNull()
    expect(matchAppShortcut(key({ key: 'f' }), true)).toBeNull()
  })

  it('matches uppercase F (shift held on the key itself, no modifier flag)', () => {
    expect(matchAppShortcut(key({ ctrlKey: true, key: 'F' }), false)).toBe('find-in-terminal')
  })
})

describe('getShortcutGroups window group: find in terminal', () => {
  it('lists Find in terminal and Close find with the right tokens', () => {
    const nonMac = getShortcutGroups(false).find((g) => g.id === 'window')
    const mac = getShortcutGroups(true).find((g) => g.id === 'window')
    expect(nonMac?.entries).toContainEqual({ description: 'Find in terminal', keys: ['Ctrl', 'F'] })
    expect(nonMac?.entries).toContainEqual({ description: 'Close find', keys: ['Esc'] })
    expect(mac?.entries).toContainEqual({ description: 'Find in terminal', keys: ['⌘', 'F'] })
    expect(mac?.entries).toContainEqual({ description: 'Close find', keys: ['Esc'] })
  })
})
