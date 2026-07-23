import { describe, expect, it } from 'vitest'
import { needsTrafficLightInset } from './titlebar-chrome'

describe('needsTrafficLightInset', () => {
  it('reserves room on macOS in a normal window', () => {
    expect(needsTrafficLightInset(true, false)).toBe(true)
  })

  it('drops the inset on macOS in full screen — the lights are gone', () => {
    expect(needsTrafficLightInset(true, true)).toBe(false)
  })

  it('never reserves room off macOS', () => {
    expect(needsTrafficLightInset(false, false)).toBe(false)
    expect(needsTrafficLightInset(false, true)).toBe(false)
  })
})
