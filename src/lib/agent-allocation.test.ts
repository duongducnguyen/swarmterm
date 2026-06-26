import { describe, it, expect } from 'vitest'
import { allocateAgents, clampCounts } from './agent-allocation'

describe('allocateAgents', () => {
  it('returns exactly `total` ids', () => {
    expect(allocateAgents(6, { 'claude-code': 2, codex: 2 })).toHaveLength(6)
  })

  it('emits agents in TEMPLATES order, padding the rest with terminal', () => {
    // TEMPLATES order is claude-code, codex, opencode, terminal.
    expect(allocateAgents(6, { 'claude-code': 2, codex: 2, opencode: 2 })).toEqual([
      'claude-code',
      'claude-code',
      'codex',
      'codex',
      'opencode',
      'opencode'
    ])
  })

  it('pads unallocated slots with the plain terminal', () => {
    expect(allocateAgents(4, { 'claude-code': 2 })).toEqual([
      'claude-code',
      'claude-code',
      'terminal',
      'terminal'
    ])
  })

  it('produces all terminals when nothing is allocated', () => {
    expect(allocateAgents(3, {})).toEqual(['terminal', 'terminal', 'terminal'])
  })

  it('never exceeds `total` even if counts oversubscribe', () => {
    const out = allocateAgents(2, { 'claude-code': 5, codex: 5 })
    expect(out).toHaveLength(2)
    expect(out).toEqual(['claude-code', 'claude-code'])
  })

  it('counts the plain terminal template explicitly, then pads with terminal', () => {
    // total 3: 1 claude + 1 explicit terminal, plus 1 terminal of padding.
    expect(allocateAgents(3, { 'claude-code': 1, terminal: 1 })).toEqual([
      'claude-code',
      'terminal',
      'terminal'
    ])
  })
})

describe('clampCounts', () => {
  it('leaves counts untouched when they fit', () => {
    expect(clampCounts({ 'claude-code': 2, codex: 2 }, 6)).toEqual({
      'claude-code': 2,
      codex: 2
    })
  })

  it('caps the running sum at `total`, in TEMPLATES order', () => {
    // total 3: claude takes 2, codex may only take 1, opencode 0.
    expect(clampCounts({ 'claude-code': 2, codex: 2, opencode: 2 }, 3)).toEqual({
      'claude-code': 2,
      codex: 1
    })
  })

  it('drops negative or zero entries', () => {
    expect(clampCounts({ 'claude-code': -1, codex: 0 }, 4)).toEqual({})
  })

  it('includes the plain terminal in the running sum', () => {
    // total 4: claude takes 2, terminal may only take the remaining 2.
    expect(clampCounts({ 'claude-code': 2, terminal: 3 }, 4)).toEqual({
      'claude-code': 2,
      terminal: 2
    })
  })
})
