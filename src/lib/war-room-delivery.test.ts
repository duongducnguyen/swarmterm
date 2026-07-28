import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NUDGE_IDLE_MS, TYPING_QUIET_MS } from './war-room-nudge'
import { useAppStore } from '@/store/app-store'
import { useWarRoomStore } from '@/store/war-room-store'
import { useTerminalActivityStore } from '@/store/terminal-activity-store'
import { useTerminalTypingStore } from '@/store/terminal-typing-store'
import type { WarRoomEvent } from '@/tauri/warroom'

// Same shape as war-room-store.test.ts's join helper.
const join = (terminalId: string, name: string, seq: number): WarRoomEvent => ({
  kind: 'join', seq, terminalId, name, agentId: 'claude-code', cwd: '/x', connected: false, ts: seq
})

interface DeliveryEvent {
  kind: 'body' | 'submit'
  id: string
  text?: string
}
const events: DeliveryEvent[] = []
vi.mock('@/lib/terminal-registry', () => ({
  deliverPromptToTerminal: (id: string, text: string) => {
    events.push({ kind: 'body', id, text })
  },
  submitTerminalPrompt: (id: string) => {
    events.push({ kind: 'submit', id })
  }
}))

// Import AFTER the mock so the wiring binds the mocked delivery fns.
const { startWarRoomDelivery, SUBMIT_DELAY_MS, HOLD_RECHECK_MS } = await import('./war-room-delivery')

let stop: () => void

beforeEach(() => {
  vi.useFakeTimers()
  events.length = 0
  useWarRoomStore.setState({ members: [], transcript: [], queues: {}, held: {} })
  useTerminalActivityStore.setState({ active: {} })
  useTerminalTypingStore.setState({ lastKeyAt: {}, dirty: {} })
  useAppStore.setState({ workspaces: [], activeWorkspaceId: '' })
  stop = startWarRoomDelivery()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('startWarRoomDelivery', () => {
  it('flushes once after sustained idle, then submits its Enter after SUBMIT_DELAY_MS', () => {
    useWarRoomStore.getState().applyEvent(join('t1', 'Claude', 1))
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS - 1)
    expect(events).toHaveLength(0)
    // Cross the idle threshold with one tick of headroom: the payload's body
    // write is itself a zero-delay timer scheduled from inside the idle
    // timer's own callback, so fake timers need one more pass of the loop
    // to run it than real timers would need.
    vi.advanceTimersByTime(2)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('body')
    expect(events[0].id).toBe('t1')
    expect(events[0].text).toContain('war_room.read_inbox')
    // Enter is a separate, later write — not glued onto the body.
    vi.advanceTimersByTime(SUBMIT_DELAY_MS - 1)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({ kind: 'submit', id: 't1' })
    // Queue drained — no double delivery on later ticks.
    vi.advanceTimersByTime(NUDGE_IDLE_MS * 2)
    expect(events).toHaveLength(2)
  })

  it('waits out an active pane and restarts the countdown on new output', () => {
    useWarRoomStore.getState().applyEvent(join('t1', 'Claude', 1))
    useTerminalActivityStore.getState().setActive('t1', true)
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS * 3)
    expect(events).toHaveLength(0)
    useTerminalActivityStore.getState().setActive('t1', false)
    vi.advanceTimersByTime(NUDGE_IDLE_MS - 1)
    // A burst of output mid-countdown aborts the pending flush.
    useTerminalActivityStore.getState().setActive('t1', true)
    vi.advanceTimersByTime(NUDGE_IDLE_MS * 2)
    expect(events).toHaveLength(0)
    useTerminalActivityStore.getState().setActive('t1', false)
    vi.advanceTimersByTime(NUDGE_IDLE_MS + SUBMIT_DELAY_MS)
    expect(events).toEqual([
      { kind: 'body', id: 't1', text: expect.any(String) },
      { kind: 'submit', id: 't1' }
    ])
  })

  it('delivers executes before the merged nudge, fully serialized body-then-submit per payload', () => {
    useWarRoomStore.getState().applyEvent(join('t1', 'Claude', 1))
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'execute', content: 'task' })
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS - 1)
    expect(events).toHaveLength(0)
    // +1 extra tick past idle for the same reason as the previous test: the
    // execute payload's body write is a zero-delay timer scheduled from
    // inside the idle callback itself.
    vi.advanceTimersByTime(2)
    expect(events).toEqual([{ kind: 'body', id: 't1', text: 'task' }])
    // Payload 1's body must not appear until payload 0's Enter has gone out.
    vi.advanceTimersByTime(SUBMIT_DELAY_MS - 1)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({ kind: 'submit', id: 't1' })
    vi.advanceTimersByTime(SUBMIT_DELAY_MS)
    expect(events).toHaveLength(3)
    expect(events[2]?.kind).toBe('body')
    expect(events[2]?.id).toBe('t1')
    expect(events[2]?.text).toContain('war_room.read_inbox')
    vi.advanceTimersByTime(SUBMIT_DELAY_MS)
    expect(events).toHaveLength(4)
    expect(events[3]).toEqual({ kind: 'submit', id: 't1' })
    expect(events.map((e) => e.kind)).toEqual(['body', 'submit', 'body', 'submit'])
  })

  it('drops a flush for a terminal that never joined (evicted before flush-time)', () => {
    // No join event applied for 't1' — enqueue can still race ahead of (or
    // arrive without) membership across the Rust MCP worker vs command/reader
    // threads. The flush-time membership guard must bail instead of typing
    // into a pane that isn't (or is no longer) a member.
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS + SUBMIT_DELAY_MS * 4)
    expect(events).toHaveLength(0)
  })
})

describe('nudge typing guard', () => {
  it('holds the flush while a line is unsubmitted, then delivers once it clears', () => {
    useWarRoomStore.getState().applyEvent(join('t1', 'Claude', 1))
    useTerminalTypingStore.getState().noteInput('t1', 'half a sentence')
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })

    // The idle window passes, but nothing is typed into the pane.
    vi.advanceTimersByTime(NUDGE_IDLE_MS + HOLD_RECHECK_MS * 4)
    expect(events).toHaveLength(0)
    expect(useWarRoomStore.getState().held['t1']).toBe(true)
    // Held, not dropped.
    expect(useWarRoomStore.getState().queues['t1']).toHaveLength(1)

    // Pressing Enter clears the line; the delivery follows.
    useTerminalTypingStore.getState().noteInput('t1', '\r')
    vi.advanceTimersByTime(SUBMIT_DELAY_MS * 2)
    expect(events[0]?.kind).toBe('body')
    expect(useWarRoomStore.getState().held['t1']).toBeUndefined()
  })

  it('releases a hold when the Deliver-now button clears the typing signal', () => {
    useWarRoomStore.getState().applyEvent(join('t1', 'Claude', 1))
    useTerminalTypingStore.getState().noteInput('t1', 'x')
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS + 2)
    expect(events).toHaveLength(0)

    useTerminalTypingStore.getState().clearTyping('t1')
    vi.advanceTimersByTime(SUBMIT_DELAY_MS * 2)
    expect(events).toHaveLength(2)
  })

  it('does not hold for an unfocused pane whose line was submitted', () => {
    useWarRoomStore.getState().applyEvent(join('t1', 'Claude', 1))
    useTerminalTypingStore.getState().noteInput('t1', 'done\r')
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS + SUBMIT_DELAY_MS * 2)
    expect(events).toHaveLength(2)
  })

  it('a keystroke in another pane does not wake a queue still inside its idle window', () => {
    useWarRoomStore.getState().applyEvent(join('t1', 'Claude', 1))
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    vi.advanceTimersByTime(NUDGE_IDLE_MS - 500)
    // t2 is a different pane; this must not short-circuit t1's idle countdown.
    useTerminalTypingStore.getState().noteInput('t2', 'a')
    expect(events).toHaveLength(0)
    vi.advanceTimersByTime(600)
    expect(events).toHaveLength(1)
  })
})

describe('the focused-and-recent arm (no terminal is focused anywhere else in this suite)', () => {
  // shouldDeferDelivery's `focused && recency` arm is the safety net for input
  // a TUI consumes off the `onData` path without ever setting `dirty` (see its
  // doc comment). Every other test above leaves useAppStore's workspaces empty,
  // so selectFocusedTerminalId always returns undefined and `focused` is always
  // false — this arm has never actually been exercised end-to-end. Seed a real
  // single-leaf workspace so the delivery scheduler's own focus read (not a
  // mock of the selector) resolves to `terminalId`.
  function focusTerminalInStore(terminalId: string): void {
    const leafId = 'leaf-1'
    useAppStore.setState({
      workspaces: [
        {
          id: 'ws-1',
          name: 'ws',
          cwd: '/x',
          layout: { type: 'leaf', id: leafId, terminalId },
          focusedLeafId: leafId,
          broadcastActive: false,
          broadcastLeafIds: [],
          worktreeMode: false
        }
      ],
      activeWorkspaceId: 'ws-1'
    })
  }

  it('holds a focused, recently-typed-in, non-dirty pane, then releases once the quiet window elapses', () => {
    // The current constants divide evenly (750 × 4 = 3000 = TYPING_QUIET_MS −
    // NUDGE_IDLE_MS); guard the arithmetic below so a future constant change
    // fails loudly here instead of silently landing the release assertion on
    // the wrong poll.
    expect(TYPING_QUIET_MS - NUDGE_IDLE_MS).toBe(HOLD_RECHECK_MS * 4)

    useWarRoomStore.getState().applyEvent(join('t1', 'Claude', 1))
    focusTerminalInStore('t1')
    // A nav keystroke (arrow key) stamps lastKeyAt WITHOUT setting dirty —
    // exactly the state only the focused-and-recent arm can catch. If that arm
    // were removed, `dirty` alone would let this delivery through immediately
    // at the first idle fire below instead of holding it.
    useTerminalTypingStore.getState().noteInput('t1', '\x1b[A')
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })

    vi.advanceTimersByTime(NUDGE_IDLE_MS)
    expect(events).toHaveLength(0)
    expect(useWarRoomStore.getState().held['t1']).toBe(true)

    // Still short of TYPING_QUIET_MS since the nav keystroke — stays held
    // through the periodic re-checks.
    vi.advanceTimersByTime(HOLD_RECHECK_MS * 3)
    expect(useWarRoomStore.getState().held['t1']).toBe(true)
    expect(events).toHaveLength(0)

    // Crossing TYPING_QUIET_MS since the last keystroke releases it on the
    // next periodic re-check, with no further typing required.
    vi.advanceTimersByTime(HOLD_RECHECK_MS)
    // The flush's own body write is a zero-delay timer scheduled from inside
    // this fire — same nuance noted on the very first test in this file —
    // so it needs one more pass to actually run.
    vi.advanceTimersByTime(2)
    expect(useWarRoomStore.getState().held['t1']).toBeUndefined()
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('body')
  })
})
