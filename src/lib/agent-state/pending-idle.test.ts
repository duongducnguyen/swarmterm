import { describe, expect, it } from 'vitest'
import { decideIdleHold, PENDING_IDLE_CAP_MS } from '@/lib/agent-state/pending-idle'
import type { Verdict } from '@/lib/agent-state/types'

const idle = (over: Partial<Verdict> = {}): Verdict => ({
  state: 'idle',
  visibleIdle: false,
  visibleBlocker: false,
  visibleWorking: false,
  skip: false,
  ...over
})

describe('decideIdleHold', () => {
  it('publishes blocked immediately — asymmetry is the point', () => {
    const d = decideIdleHold({ prev: 'working', next: idle({ state: 'blocked' }), pending: null, now: 0, processExited: false })
    expect(d.publish).toBe(true)
    expect(d.pending).toBeNull()
  })
  it('holds working → plain idle for 3 confirmations', () => {
    let d = decideIdleHold({ prev: 'working', next: idle(), pending: null, now: 0, processExited: false })
    expect(d.publish).toBe(false)
    d = decideIdleHold({ prev: 'working', next: idle(), pending: d.pending, now: 100, processExited: false })
    expect(d.publish).toBe(false)
    d = decideIdleHold({ prev: 'working', next: idle(), pending: d.pending, now: 200, processExited: false })
    expect(d.publish).toBe(false)
    d = decideIdleHold({ prev: 'working', next: idle(), pending: d.pending, now: 300, processExited: false })
    expect(d.publish).toBe(true)
    expect(d.pending).toBeNull()
  })
  it('visible_idle bypasses the hold (live prompt box IS proof)', () => {
    const d = decideIdleHold({ prev: 'working', next: idle({ visibleIdle: true }), pending: null, now: 0, processExited: false })
    expect(d.publish).toBe(true)
  })
  it('a working verdict mid-hold cancels the pending idle', () => {
    const first = decideIdleHold({ prev: 'working', next: idle(), pending: null, now: 0, processExited: false })
    const d = decideIdleHold({ prev: 'working', next: idle({ state: 'working' }), pending: first.pending, now: 100, processExited: false })
    expect(d.publish).toBe(true)
    expect(d.pending).toBeNull()
  })
  it('gives up and publishes after the hard cap', () => {
    const first = decideIdleHold({ prev: 'working', next: idle(), pending: null, now: 0, processExited: false })
    const d = decideIdleHold({ prev: 'working', next: idle(), pending: first.pending, now: PENDING_IDLE_CAP_MS, processExited: false })
    expect(d.publish).toBe(true)
  })
  it('process exit bypasses the hold', () => {
    const d = decideIdleHold({ prev: 'working', next: idle(), pending: null, now: 0, processExited: true })
    expect(d.publish).toBe(true)
  })
  it('idle → idle publishes (store dedups); only working→idle is held', () => {
    const d = decideIdleHold({ prev: 'idle', next: idle(), pending: null, now: 0, processExited: false })
    expect(d.publish).toBe(true)
  })
})
