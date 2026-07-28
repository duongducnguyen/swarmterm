import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTerminalTypingStore } from './terminal-typing-store'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-28T00:00:00Z'))
  useTerminalTypingStore.setState({ lastKeyAt: {}, dirty: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('noteInput', () => {
  it('marks the line dirty and stamps the time on an edit', () => {
    useTerminalTypingStore.getState().noteInput('t1', 'a')
    const s = useTerminalTypingStore.getState()
    expect(s.dirty['t1']).toBe(true)
    expect(s.lastKeyAt['t1']).toBe(Date.now())
  })

  it('clears dirty on a submit but keeps the timestamp', () => {
    const s = useTerminalTypingStore.getState()
    s.noteInput('t1', 'abc')
    vi.advanceTimersByTime(1000)
    s.noteInput('t1', '\r')
    const after = useTerminalTypingStore.getState()
    expect(after.dirty['t1']).toBe(false)
    expect(after.lastKeyAt['t1']).toBe(Date.now())
  })

  it('leaves dirty untouched on navigation but refreshes the timestamp', () => {
    const s = useTerminalTypingStore.getState()
    s.noteInput('t1', 'abc')
    vi.advanceTimersByTime(500)
    s.noteInput('t1', '\x1b[A')
    const after = useTerminalTypingStore.getState()
    expect(after.dirty['t1']).toBe(true)
    expect(after.lastKeyAt['t1']).toBe(Date.now())
  })

  it('keeps terminals independent', () => {
    const s = useTerminalTypingStore.getState()
    s.noteInput('t1', 'a')
    s.noteInput('t2', '\r')
    const after = useTerminalTypingStore.getState()
    expect(after.dirty['t1']).toBe(true)
    expect(after.dirty['t2']).toBe(false)
  })
})

describe('clearTyping', () => {
  it('drops both entries for the terminal and leaves others alone', () => {
    const s = useTerminalTypingStore.getState()
    s.noteInput('t1', 'a')
    s.noteInput('t2', 'b')
    s.clearTyping('t1')
    const after = useTerminalTypingStore.getState()
    expect(after.dirty['t1']).toBeUndefined()
    expect(after.lastKeyAt['t1']).toBeUndefined()
    expect(after.dirty['t2']).toBe(true)
  })

  it('is a no-op for a terminal that never typed', () => {
    const before = useTerminalTypingStore.getState()
    before.clearTyping('ghost')
    const after = useTerminalTypingStore.getState()
    expect(after.dirty).toBe(before.dirty)
    expect(after.lastKeyAt).toBe(before.lastKeyAt)
  })
})
