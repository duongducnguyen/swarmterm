import { describe, expect, it } from 'vitest'
import type { AgentPaneState } from '@/lib/agent-state/rollup'
import { diffAgentStates } from './notification-flow'
import { notificationCopy, resolveFire } from './notification-flow'

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

const basePrefs = { sound: true, system: true, perAgent: {} }
const pend = (kind: 'attention' | 'completion') => ({ terminalId: 't1', kind, agentId: 'claude-code' })
const ctx = (over: Partial<Parameters<typeof resolveFire>[1]>) => ({
  current: s('blocked'),
  paneWatched: false,
  windowFocused: true,
  prefs: basePrefs,
  ...over
})

describe('resolveFire', () => {
  it('drops when the entry is gone (terminal died/respawned)', () => {
    expect(resolveFire(pend('attention'), ctx({ current: undefined }))).toEqual({ sound: false, system: false })
  })

  it('drops attention when the pane is no longer blocked', () => {
    expect(resolveFire(pend('attention'), ctx({ current: s('working') }))).toEqual({ sound: false, system: false })
  })

  it('drops completion when the pane left idle or was seen', () => {
    expect(resolveFire(pend('completion'), ctx({ current: s('working') }))).toEqual({ sound: false, system: false })
    expect(resolveFire(pend('completion'), ctx({ current: s('idle', true) }))).toEqual({ sound: false, system: false })
  })

  it('fires completion while still idle-unseen', () => {
    expect(resolveFire(pend('completion'), ctx({ current: s('idle', false) }))).toEqual({ sound: true, system: false })
  })

  it('drops when the pane became watched during the delay', () => {
    expect(resolveFire(pend('attention'), ctx({ paneWatched: true }))).toEqual({ sound: false, system: false })
  })

  it('chimes without a banner while the window is focused', () => {
    expect(resolveFire(pend('attention'), ctx({ windowFocused: true }))).toEqual({ sound: true, system: false })
  })

  it('adds the banner when the window is unfocused', () => {
    expect(resolveFire(pend('attention'), ctx({ windowFocused: false }))).toEqual({ sound: true, system: true })
  })

  it('respects the channel toggles independently', () => {
    expect(
      resolveFire(pend('attention'), ctx({ windowFocused: false, prefs: { ...basePrefs, sound: false } }))
    ).toEqual({ sound: false, system: true })
    expect(
      resolveFire(pend('attention'), ctx({ windowFocused: false, prefs: { ...basePrefs, system: false } }))
    ).toEqual({ sound: true, system: false })
  })

  it('drops entirely when the per-agent toggle is off', () => {
    expect(
      resolveFire(pend('attention'), ctx({ windowFocused: false, prefs: { ...basePrefs, perAgent: { 'claude-code': false } } }))
    ).toEqual({ sound: false, system: false })
  })
})

describe('notificationCopy', () => {
  it('phrases attention and completion with the agent display name', () => {
    expect(notificationCopy('attention', 'Claude Code', 'fix tests')).toEqual({
      title: 'Claude Code needs your input',
      body: 'fix tests'
    })
    expect(notificationCopy('completion', 'Codex', '')).toEqual({ title: 'Codex finished', body: '' })
  })
})
