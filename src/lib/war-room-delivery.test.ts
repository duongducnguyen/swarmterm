import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NUDGE_IDLE_MS } from './war-room-nudge'
import { useWarRoomStore } from '@/store/war-room-store'
import { useTerminalActivityStore } from '@/store/terminal-activity-store'

const delivered: Array<{ id: string; text: string }> = []
vi.mock('@/lib/terminal-registry', () => ({
  deliverPromptToTerminal: (id: string, text: string) => {
    delivered.push({ id, text })
  }
}))

// Import AFTER the mock so the wiring binds the mocked delivery fn.
const { startWarRoomDelivery } = await import('./war-room-delivery')

let stop: () => void

beforeEach(() => {
  vi.useFakeTimers()
  delivered.length = 0
  useWarRoomStore.setState({ members: [], transcript: [], queues: {} })
  useTerminalActivityStore.setState({ active: {} })
  stop = startWarRoomDelivery()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('startWarRoomDelivery', () => {
  it('flushes once after sustained idle when the pane is already quiet', () => {
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS - 1)
    expect(delivered).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(delivered).toHaveLength(1)
    expect(delivered[0].id).toBe('t1')
    expect(delivered[0].text).toContain('war_room.read_inbox')
    // Queue drained — no double delivery on later ticks.
    vi.advanceTimersByTime(NUDGE_IDLE_MS * 2)
    expect(delivered).toHaveLength(1)
  })

  it('waits out an active pane and restarts the countdown on new output', () => {
    useTerminalActivityStore.getState().setActive('t1', true)
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS * 3)
    expect(delivered).toHaveLength(0)
    useTerminalActivityStore.getState().setActive('t1', false)
    vi.advanceTimersByTime(NUDGE_IDLE_MS - 1)
    // A burst of output mid-countdown aborts the pending flush.
    useTerminalActivityStore.getState().setActive('t1', true)
    vi.advanceTimersByTime(NUDGE_IDLE_MS * 2)
    expect(delivered).toHaveLength(0)
    useTerminalActivityStore.getState().setActive('t1', false)
    vi.advanceTimersByTime(NUDGE_IDLE_MS)
    expect(delivered).toHaveLength(1)
  })

  it('delivers executes before the merged nudge', () => {
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'execute', content: 'task' })
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS)
    expect(delivered.map((d) => d.text)[0]).toBe('task')
    expect(delivered).toHaveLength(2)
  })
})
