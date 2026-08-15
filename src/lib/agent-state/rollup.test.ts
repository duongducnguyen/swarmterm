import { describe, expect, it } from 'vitest'
import { displayState, paneDot, workspaceDot } from '@/lib/agent-state/rollup'

describe('displayState', () => {
  it('derives done from unseen idle', () => {
    expect(displayState({ state: 'idle', seen: false })).toBe('done')
    expect(displayState({ state: 'idle', seen: true })).toBe('idle')
    expect(displayState({ state: 'blocked', seen: true })).toBe('blocked')
    expect(displayState(undefined)).toBeUndefined()
  })
})

describe('paneDot', () => {
  it('shows the state dot for blocked/done/working', () => {
    expect(paneDot('blocked', false)).toBe('blocked')
    expect(paneDot('done', true)).toBe('done')
    expect(paneDot('working', false)).toBe('working')
  })
  it('idle shows nothing', () => {
    expect(paneDot('idle', true)).toBeNull()
  })
  it('unknown or undetected falls back to the output-activity dot', () => {
    expect(paneDot('unknown', true)).toBe('activity')
    expect(paneDot(undefined, true)).toBe('activity')
    expect(paneDot(undefined, false)).toBeNull()
  })
})

describe('workspaceDot', () => {
  it('picks the highest-attention pane: blocked > done > working > activity', () => {
    expect(
      workspaceDot([
        { display: 'working', outputActive: false },
        { display: 'blocked', outputActive: false }
      ])
    ).toBe('blocked')
    expect(
      workspaceDot([
        { display: 'done', outputActive: false },
        { display: undefined, outputActive: true }
      ])
    ).toBe('done')
  })
  it('plain-shell activity still lights the tab when no agent state outranks it', () => {
    expect(workspaceDot([{ display: undefined, outputActive: true }])).toBe('activity')
  })
  it('an all-idle workspace shows nothing', () => {
    expect(workspaceDot([{ display: 'idle', outputActive: false }])).toBeNull()
    expect(workspaceDot([])).toBeNull()
  })
})
