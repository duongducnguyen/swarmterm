import { describe, it, expect } from 'vitest'
import { SHORTCUT_GROUPS } from './keybindings'

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
})
