import { describe, expect, it } from 'vitest'
import { MEMBER_COLORS, memberColor } from './war-room-identity'

describe('memberColor', () => {
  it('is deterministic for the same id', () => {
    expect(memberColor('abc-123')).toBe(memberColor('abc-123'))
  })

  it('always returns a palette color', () => {
    for (const id of ['', 'x', 'terminal-uuid-4242', '🙂']) {
      expect(MEMBER_COLORS).toContain(memberColor(id))
    }
  })

  it('spreads distinct ids across more than one color', () => {
    const colors = new Set(
      Array.from({ length: 30 }, (_, i) => memberColor(`terminal-${i}-${i * 7}`))
    )
    expect(colors.size).toBeGreaterThan(1)
  })
})
