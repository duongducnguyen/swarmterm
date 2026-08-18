import { describe, it, expect, beforeEach } from 'vitest'
import { useTerminalSearchStore } from './terminal-search-store'

describe('terminal-search-store', () => {
  beforeEach(() => useTerminalSearchStore.setState({ openFor: null }))

  it('starts with no overlay open', () => {
    expect(useTerminalSearchStore.getState().openFor).toBeNull()
  })

  it('open sets the overlay for that terminal', () => {
    useTerminalSearchStore.getState().open('t1')
    expect(useTerminalSearchStore.getState().openFor).toBe('t1')
  })

  it('open for a different terminal replaces the previous one (single-open)', () => {
    useTerminalSearchStore.getState().open('t1')
    useTerminalSearchStore.getState().open('t2')
    expect(useTerminalSearchStore.getState().openFor).toBe('t2')
  })

  it('close clears the overlay', () => {
    useTerminalSearchStore.getState().open('t1')
    useTerminalSearchStore.getState().close()
    expect(useTerminalSearchStore.getState().openFor).toBeNull()
  })

  it('open is idempotent: calling it again for the same id still notifies subscribers', () => {
    useTerminalSearchStore.getState().open('t1')
    let notified = false
    const unsub = useTerminalSearchStore.subscribe((s) => {
      if (s.openFor === 't1') notified = true
    })
    useTerminalSearchStore.getState().open('t1')
    unsub()
    expect(notified).toBe(true)
    expect(useTerminalSearchStore.getState().openFor).toBe('t1')
  })
})
