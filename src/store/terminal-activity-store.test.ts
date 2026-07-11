import { beforeEach, describe, expect, it } from 'vitest'
import { useTerminalActivityStore } from './terminal-activity-store'

const reset = (): void => useTerminalActivityStore.setState({ active: {} })

describe('terminal-activity-store', () => {
  beforeEach(reset)

  it('sets a terminal active and idle', () => {
    useTerminalActivityStore.getState().setActive('t1', true)
    expect(useTerminalActivityStore.getState().active).toEqual({ t1: true })

    useTerminalActivityStore.getState().setActive('t1', false)
    expect(useTerminalActivityStore.getState().active).toEqual({ t1: false })
  })

  it('does not create a new state object when the value is unchanged', () => {
    useTerminalActivityStore.getState().setActive('t1', true)
    const before = useTerminalActivityStore.getState().active
    useTerminalActivityStore.getState().setActive('t1', true)
    expect(useTerminalActivityStore.getState().active).toBe(before)
  })

  it('clear removes a terminal entry', () => {
    useTerminalActivityStore.getState().setActive('t1', true)
    useTerminalActivityStore.getState().clear('t1')
    expect(useTerminalActivityStore.getState().active).toEqual({})
  })
})
