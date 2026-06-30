import { describe, it, expect } from 'vitest'
import { resizePaneAgents } from './pane-agents'

describe('resizePaneAgents', () => {
  it('shrink: keeps first N entries', () => {
    expect(resizePaneAgents(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b'])
  })

  it('grow: pads new entries with terminal', () => {
    expect(resizePaneAgents(['a', 'b'], 4)).toEqual(['a', 'b', 'terminal', 'terminal'])
  })

  it('same length: returns same values', () => {
    expect(resizePaneAgents(['x', 'y', 'z'], 3)).toEqual(['x', 'y', 'z'])
  })

  it('empty input, grow to N: returns N terminal entries', () => {
    expect(resizePaneAgents([], 3)).toEqual(['terminal', 'terminal', 'terminal'])
  })

  it('count 0: returns empty array', () => {
    expect(resizePaneAgents(['a', 'b'], 0)).toEqual([])
  })
})
