import { describe, expect, it } from 'vitest'
import {
  needsTrafficLightInset,
  nextSystemChromeReveal,
  systemChromeOffset,
  SYSTEM_CHROME_HEIGHT_PX
} from './titlebar-chrome'

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

describe('nextSystemChromeReveal', () => {
  it('reveals when the pointer reaches the top edge', () => {
    expect(nextSystemChromeReveal(false, 0)).toBe(true)
    expect(nextSystemChromeReveal(false, 2)).toBe(true)
  })

  it('stays hidden while the pointer is anywhere below the edge', () => {
    expect(nextSystemChromeReveal(false, 3)).toBe(false)
    expect(nextSystemChromeReveal(false, 400)).toBe(false)
  })

  it('keeps the overlay up while the pointer is inside the band it occupies', () => {
    // macOS holds the overlay open until the pointer leaves it — moving from the
    // edge down onto the traffic lights must not make our shift flicker away.
    expect(nextSystemChromeReveal(true, 10)).toBe(true)
    expect(nextSystemChromeReveal(true, SYSTEM_CHROME_HEIGHT_PX)).toBe(true)
  })

  it('hides once the pointer clears the overlay band', () => {
    expect(nextSystemChromeReveal(true, SYSTEM_CHROME_HEIGHT_PX + 5)).toBe(false)
  })

  it('treats a negative y (pointer above the client area) as the top edge', () => {
    expect(nextSystemChromeReveal(false, -3)).toBe(true)
  })
})

describe('systemChromeOffset', () => {
  it('shifts the app down only while full screen and revealed', () => {
    expect(systemChromeOffset(true, true, true)).toBe(SYSTEM_CHROME_HEIGHT_PX)
  })

  it('is flat when the overlay is hidden', () => {
    expect(systemChromeOffset(true, true, false)).toBe(0)
  })

  it('is flat outside full screen, revealed or not', () => {
    expect(systemChromeOffset(true, false, true)).toBe(0)
    expect(systemChromeOffset(true, false, false)).toBe(0)
  })

  it('is flat off macOS — no auto-hiding titlebar there', () => {
    expect(systemChromeOffset(false, true, true)).toBe(0)
  })
})
