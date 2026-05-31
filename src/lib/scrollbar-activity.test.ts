import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrollActivityTracker } from './scrollbar-activity'

describe('ScrollActivityTracker', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('activates on first notify and deactivates after the idle window', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ScrollActivityTracker<string>((key, active) => calls.push([key, active]), 500)

    tracker.notify('a')
    expect(calls).toEqual([['a', true]])

    vi.advanceTimersByTime(499)
    expect(calls).toEqual([['a', true]])

    vi.advanceTimersByTime(1)
    expect(calls).toEqual([
      ['a', true],
      ['a', false]
    ])
  })

  it('stays active without re-activating while scrolls keep arriving (debounced idle)', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ScrollActivityTracker<string>((key, active) => calls.push([key, active]), 500)

    tracker.notify('a') // active
    vi.advanceTimersByTime(400)
    tracker.notify('a') // still active, no second activate; idle timer reset
    expect(calls).toEqual([['a', true]])

    vi.advanceTimersByTime(400) // 400ms since last notify (< 500)
    expect(calls).toEqual([['a', true]])

    vi.advanceTimersByTime(100) // now 500ms since last notify
    expect(calls).toEqual([
      ['a', true],
      ['a', false]
    ])
  })

  it('tracks multiple targets independently', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ScrollActivityTracker<string>((key, active) => calls.push([key, active]), 500)

    tracker.notify('a')
    tracker.notify('b')
    expect(calls).toEqual([
      ['a', true],
      ['b', true]
    ])

    vi.advanceTimersByTime(500)
    expect(calls).toContainEqual(['a', false])
    expect(calls).toContainEqual(['b', false])
  })

  it('dispose cancels pending deactivations', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ScrollActivityTracker<string>((key, active) => calls.push([key, active]), 500)

    tracker.notify('a')
    tracker.dispose()
    vi.advanceTimersByTime(1000)
    expect(calls).toEqual([['a', true]]) // no deactivate fired
  })
})
