import { describe, expect, it } from 'vitest'
import { anyLeafActive } from './activity-selectors'

describe('anyLeafActive', () => {
  it('is true when at least one terminal is active', () => {
    expect(anyLeafActive(['a', 'b'], { a: false, b: true })).toBe(true)
  })

  it('is false when none are active', () => {
    expect(anyLeafActive(['a', 'b'], { a: false, b: false })).toBe(false)
  })

  it('is false for terminals absent from the map', () => {
    expect(anyLeafActive(['a', 'b'], {})).toBe(false)
  })

  it('is false for an empty terminal list', () => {
    expect(anyLeafActive([], { a: true })).toBe(false)
  })
})
