import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityTracker } from './activity-tracker'

describe('ActivityTracker', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('activates on first notify and deactivates after the idle window', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ActivityTracker<string>((k, a) => calls.push([k, a]), 500)

    tracker.notify('a')
    expect(calls).toEqual([['a', true]])

    vi.advanceTimersByTime(499)
    expect(calls).toEqual([['a', true]])

    vi.advanceTimersByTime(1)
    expect(calls).toEqual([['a', true], ['a', false]])
  })

  it('stays active without re-activating while notifies keep arriving (debounced idle)', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ActivityTracker<string>((k, a) => calls.push([k, a]), 500)

    tracker.notify('a')
    vi.advanceTimersByTime(400)
    tracker.notify('a')
    expect(calls).toEqual([['a', true]])

    vi.advanceTimersByTime(400)
    expect(calls).toEqual([['a', true]])

    vi.advanceTimersByTime(100)
    expect(calls).toEqual([['a', true], ['a', false]])
  })

  it('tracks multiple targets independently', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ActivityTracker<string>((k, a) => calls.push([k, a]), 500)

    tracker.notify('a')
    tracker.notify('b')
    expect(calls).toEqual([['a', true], ['b', true]])

    vi.advanceTimersByTime(500)
    expect(calls).toContainEqual(['a', false])
    expect(calls).toContainEqual(['b', false])
  })

  it('cancel drops a target timer without firing the idle callback', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ActivityTracker<string>((k, a) => calls.push([k, a]), 500)

    tracker.notify('a')
    tracker.cancel('a')
    vi.advanceTimersByTime(1000)
    expect(calls).toEqual([['a', true]]) // no ['a', false]
  })

  it('dispose cancels all pending deactivations', () => {
    const calls: Array<[string, boolean]> = []
    const tracker = new ActivityTracker<string>((k, a) => calls.push([k, a]), 500)

    tracker.notify('a')
    tracker.dispose()
    vi.advanceTimersByTime(1000)
    expect(calls).toEqual([['a', true]])
  })
})
