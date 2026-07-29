import { describe, expect, it } from 'vitest'
import { GROUP_WINDOW_MS, formatEvent, groupTranscript } from './war-room-transcript'
import type { WarRoomEvent } from '@/tauri/warroom'

const message = (
  seq: number,
  fromId: string,
  fromName: string,
  ts: number,
  overrides: Partial<Extract<WarRoomEvent, { kind: 'message' }>> = {}
): WarRoomEvent => ({
  kind: 'message',
  roomId: 'default',
  seq,
  fromId,
  fromName,
  toId: 'b',
  toName: 'Codex',
  content: `msg-${seq}`,
  mode: 'probe',
  ts,
  ...overrides
})

describe('formatEvent', () => {
  it('join/leave/connected read as membership changes', () => {
    const join: WarRoomEvent = { kind: 'join', roomId: 'default', seq: 1, terminalId: 't1', name: 'Claude', agentId: 'claude-code', cwd: '/x', connected: false, ts: 0 }
    expect(formatEvent(join)).toEqual({ seq: 1, icon: 'join', headline: 'Claude joined the War Room', body: undefined })
    const leave: WarRoomEvent = { kind: 'leave', roomId: 'default', seq: 2, terminalId: 't1', name: 'Claude', ts: 0 }
    expect(formatEvent(leave).headline).toBe('Claude left the War Room')
    const connected: WarRoomEvent = { kind: 'connected', roomId: 'default', seq: 3, terminalId: 't1', name: 'Claude', ts: 0 }
    expect(formatEvent(connected)).toEqual({ seq: 3, icon: 'connected', headline: 'Claude connected', body: undefined })
  })

  it('probe shows from → to with the body; broadcast says everyone', () => {
    const m = message(3, 'a', 'Claude', 0)
    const row = formatEvent(m)
    expect(row.headline).toBe('Claude → Codex')
    expect(row.body).toBe('msg-3')
    expect(formatEvent({ ...m, toId: null, toName: null } as WarRoomEvent).headline).toBe('Claude → everyone')
  })

  it('execute is visually distinct', () => {
    const row = formatEvent(message(4, 'a', 'Claude', 0, { mode: 'execute', content: 'run' }))
    expect(row.icon).toBe('execute')
    expect(row.headline).toContain('ran a prompt in')
  })
})

describe('groupTranscript', () => {
  it('folds consecutive same-sender messages into one group', () => {
    const items = groupTranscript([
      message(1, 'a', 'Claude', 1000),
      message(2, 'a', 'Claude', 2000),
      message(3, 'b', 'Codex', 3000)
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ kind: 'group', fromId: 'a', firstSeq: 1 })
    expect(items[0].kind === 'group' && items[0].messages.map((m) => m.seq)).toEqual([1, 2])
    expect(items[1]).toMatchObject({ kind: 'group', fromId: 'b' })
  })

  it('a system event breaks the group', () => {
    const items = groupTranscript([
      message(1, 'a', 'Claude', 1000),
      { kind: 'leave', roomId: 'default', seq: 2, terminalId: 't9', name: 'Codex', ts: 1500 },
      message(3, 'a', 'Claude', 2000)
    ])
    expect(items.map((i) => i.kind)).toEqual(['group', 'system', 'group'])
    expect(items[1]).toMatchObject({ kind: 'system', icon: 'leave', text: 'Codex left the War Room' })
  })

  it('a long silence starts a new group even for the same sender', () => {
    const items = groupTranscript([
      message(1, 'a', 'Claude', 1000),
      message(2, 'a', 'Claude', 1000 + GROUP_WINDOW_MS + 1)
    ])
    expect(items).toHaveLength(2)
  })
})
