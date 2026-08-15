import { describe, expect, it } from 'vitest'
import { inSpawnGrace, shouldSkipScreenScan, SPAWN_GRACE_MS } from '@/lib/agent-state/detect-schedule'

describe('inSpawnGrace', () => {
  it('is true strictly inside the window, false at and after its end', () => {
    expect(inSpawnGrace(1000, 1000 + SPAWN_GRACE_MS - 1)).toBe(true)
    expect(inSpawnGrace(1000, 1000 + SPAWN_GRACE_MS)).toBe(false)
  })
})

describe('shouldSkipScreenScan', () => {
  it('skips only when idle with no new output and no pending hold', () => {
    expect(shouldSkipScreenScan({ state: 'idle', contentSeq: 5, lastScannedSeq: 5, pendingIdle: false })).toBe(true)
    expect(shouldSkipScreenScan({ state: 'idle', contentSeq: 6, lastScannedSeq: 5, pendingIdle: false })).toBe(false)
    expect(shouldSkipScreenScan({ state: 'working', contentSeq: 5, lastScannedSeq: 5, pendingIdle: false })).toBe(false)
    expect(shouldSkipScreenScan({ state: 'idle', contentSeq: 5, lastScannedSeq: 5, pendingIdle: true })).toBe(false)
  })
})
