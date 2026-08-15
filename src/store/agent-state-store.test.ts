import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentStateStore } from '@/store/agent-state-store'

const publish = (state: Parameters<ReturnType<typeof useAgentStateStore.getState>['publish']>[1], watched = false): void =>
  useAgentStateStore.getState().publish('t1', state, { paneWatched: watched })

describe('agent-state-store', () => {
  beforeEach(() => {
    useAgentStateStore.setState({ byId: {} })
  })

  it('non-idle states are always seen', () => {
    publish('working')
    expect(useAgentStateStore.getState().byId['t1']).toEqual({ state: 'working', seen: true })
  })

  it('working → idle while unwatched becomes done (seen=false)', () => {
    publish('working')
    publish('idle')
    expect(useAgentStateStore.getState().byId['t1']).toEqual({ state: 'idle', seen: false })
  })

  it('blocked → idle is also a completion', () => {
    publish('blocked')
    publish('idle')
    expect(useAgentStateStore.getState().byId['t1'].seen).toBe(false)
  })

  it('working → idle while the pane is watched is plain idle', () => {
    publish('working')
    publish('idle', true)
    expect(useAgentStateStore.getState().byId['t1']).toEqual({ state: 'idle', seen: true })
  })

  it('unknown → idle is NOT a completion (startup settle, deviation from herdr)', () => {
    publish('unknown')
    publish('idle')
    expect(useAgentStateStore.getState().byId['t1'].seen).toBe(true)
  })

  it('same-state republish never clears an existing done badge', () => {
    publish('working')
    publish('idle')
    publish('idle', true)
    expect(useAgentStateStore.getState().byId['t1'].seen).toBe(false)
  })

  it('markSeen clears the done badge; clear removes the entry', () => {
    publish('working')
    publish('idle')
    useAgentStateStore.getState().markSeen('t1')
    expect(useAgentStateStore.getState().byId['t1'].seen).toBe(true)
    useAgentStateStore.getState().clear('t1')
    expect(useAgentStateStore.getState().byId['t1']).toBeUndefined()
  })
})
