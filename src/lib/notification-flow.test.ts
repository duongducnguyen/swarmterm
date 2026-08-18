import { describe, expect, it } from 'vitest'
import type { AgentPaneState } from '@/lib/agent-state/rollup'
import { diffAgentStates } from './notification-flow'

const s = (state: AgentPaneState['state'], seen = true): AgentPaneState => ({ state, seen })

describe('diffAgentStates', () => {
  it('returns nothing for identical records', () => {
    const a = { t1: s('working') }
    expect(diffAgentStates(a, a)).toEqual([])
    expect(diffAgentStates({}, {})).toEqual([])
  })

  it('reports attention when a pane enters blocked', () => {
    expect(diffAgentStates({ t1: s('working') }, { t1: s('blocked') })).toEqual([
      { terminalId: 't1', kind: 'attention' }
    ])
  })

  it('reports attention for a previously absent entry that is blocked', () => {
    expect(diffAgentStates({}, { t1: s('blocked') })).toEqual([{ terminalId: 't1', kind: 'attention' }])
  })

  it('does not re-report attention while blocked persists (new object, same state)', () => {
    expect(diffAgentStates({ t1: s('blocked') }, { t1: s('blocked') })).toEqual([])
  })

  it('reports completion for working→idle landing unseen', () => {
    expect(diffAgentStates({ t1: s('working') }, { t1: s('idle', false) })).toEqual([
      { terminalId: 't1', kind: 'completion' }
    ])
  })

  it('reports completion for blocked→idle landing unseen', () => {
    expect(diffAgentStates({ t1: s('blocked') }, { t1: s('idle', false) })).toEqual([
      { terminalId: 't1', kind: 'completion' }
    ])
  })

  it('ignores a watched completion (seen stays true)', () => {
    expect(diffAgentStates({ t1: s('working') }, { t1: s('idle', true) })).toEqual([])
  })

  it('ignores unknown→idle (spawn settling) and absent→idle', () => {
    expect(diffAgentStates({ t1: s('unknown') }, { t1: s('idle', false) })).toEqual([])
    expect(diffAgentStates({}, { t1: s('idle', false) })).toEqual([])
  })

  it('ignores the markSeen flip (idle unseen → idle seen)', () => {
    expect(diffAgentStates({ t1: s('idle', false) }, { t1: s('idle', true) })).toEqual([])
  })

  it('reports removed when an entry disappears', () => {
    expect(diffAgentStates({ t1: s('working') }, {})).toEqual([{ terminalId: 't1', kind: 'removed' }])
  })

  it('handles several panes in one update', () => {
    const prev = { t1: s('working'), t2: s('idle'), t3: s('working') }
    const next = { t1: s('blocked'), t2: s('idle') }
    expect(diffAgentStates(prev, next)).toEqual([
      { terminalId: 't1', kind: 'attention' },
      { terminalId: 't3', kind: 'removed' }
    ])
  })
})
