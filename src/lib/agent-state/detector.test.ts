import { describe, expect, it } from 'vitest'
import { AgentStateDetector, type DetectorDeps } from '@/lib/agent-state/detector'
import { SPAWN_GRACE_MS, TICK_MS } from '@/lib/agent-state/detect-schedule'
import type { AgentEngineState, Manifest } from '@/lib/agent-state/types'

const manifest: Manifest = {
  id: 'test',
  herdrVersion: 't',
  rules: [
    { id: 'working', state: 'working', priority: 500, region: 'whole_recent', contains: ['esc to interrupt'] },
    { id: 'blocked', state: 'blocked', priority: 900, region: 'whole_recent', contains: ['do you want to proceed?'] }
  ]
}

interface Harness {
  detector: AgentStateDetector
  published: AgentEngineState[]
  setScreen(text: string): void
  /** Advance the manual clock and fire the single pending timer. */
  tick(ms?: number): void
}

function makeHarness(): Harness {
  let screen = ''
  let now = 0
  let pending: { fn: () => void } | null = null
  const published: AgentEngineState[] = []
  const deps: DetectorDeps = {
    getView: () => ({ rows: 24, length: 1, line: () => screen }),
    isPaneWatched: () => false,
    publish: (state) => published.push(state),
    now: () => now,
    setTimer: (fn) => {
      pending = { fn }
      return pending
    },
    clearTimer: () => {
      pending = null
    }
  }
  const detector = new AgentStateDetector(manifest, deps)
  return {
    detector,
    published,
    setScreen: (text) => {
      screen = text
      detector.noteOutput()
    },
    tick: (ms = TICK_MS) => {
      now += ms
      const p = pending
      pending = null
      p?.fn()
    }
  }
}

describe('AgentStateDetector', () => {
  it('publishes nothing during the spawn grace window', () => {
    const h = makeHarness()
    h.detector.start()
    h.setScreen('Do you want to proceed?')
    h.tick()
    expect(h.published).toEqual([])
  })

  it('detects blocked immediately after grace', () => {
    const h = makeHarness()
    h.detector.start()
    h.setScreen('Do you want to proceed?')
    h.tick(SPAWN_GRACE_MS)
    h.tick()
    expect(h.published).toEqual(['blocked'])
  })

  it('holds working → idle across confirmations, then publishes idle', () => {
    const h = makeHarness()
    h.detector.start()
    // The grace-crossing tick scans an EMPTY screen and settles to idle
    // (the no-match fallback) — that leading publish is expected.
    h.tick(SPAWN_GRACE_MS)
    h.setScreen('thinking… esc to interrupt')
    h.tick()
    expect(h.published).toEqual(['idle', 'working'])
    h.setScreen('$ quiet prompt')
    h.tick() // idle verdict #1 — held
    h.tick(100) // #2
    h.tick(100) // #3
    h.tick(100) // #4 — released
    expect(h.published).toEqual(['idle', 'working', 'idle'])
  })

  it('reset returns to unknown and re-arms the grace window', () => {
    const h = makeHarness()
    h.detector.start()
    h.tick(SPAWN_GRACE_MS) // empty screen settles to idle
    h.setScreen('Do you want to proceed?')
    h.tick()
    expect(h.published).toEqual(['idle', 'blocked'])
    h.detector.reset()
    expect(h.published).toEqual(['idle', 'blocked', 'unknown'])
    h.tick() // still inside the fresh grace window — no detection
    expect(h.published).toEqual(['idle', 'blocked', 'unknown'])
  })

  it('noteExit stops the loop and publishes unknown', () => {
    const h = makeHarness()
    h.detector.start()
    h.tick(SPAWN_GRACE_MS) // empty screen settles to idle
    h.setScreen('thinking… esc to interrupt')
    h.tick()
    h.detector.noteExit()
    expect(h.published).toEqual(['idle', 'working', 'unknown'])
  })
})
