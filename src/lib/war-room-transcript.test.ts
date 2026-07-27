import { describe, expect, it } from 'vitest'
import { formatEvent } from './war-room-transcript'
import type { WarRoomEvent } from '@/tauri/warroom'

describe('formatEvent', () => {
  it('join/leave read as membership changes', () => {
    const join: WarRoomEvent = { kind: 'join', seq: 1, terminalId: 't1', name: 'Claude', agentId: 'claude-code', cwd: '/x', ts: 0 }
    expect(formatEvent(join)).toEqual({ seq: 1, icon: 'join', headline: 'Claude joined the War Room', body: undefined })
    const leave: WarRoomEvent = { kind: 'leave', seq: 2, terminalId: 't1', name: 'Claude', ts: 0 }
    expect(formatEvent(leave).headline).toBe('Claude left the War Room')
  })

  it('probe shows from → to with the body; broadcast says everyone', () => {
    const m: WarRoomEvent = { kind: 'message', seq: 3, fromId: 'a', fromName: 'Claude', toId: 'b', toName: 'Codex', content: 'hi', mode: 'probe', ts: 0 }
    const row = formatEvent(m)
    expect(row.headline).toBe('Claude → Codex')
    expect(row.body).toBe('hi')
    expect(formatEvent({ ...m, toId: null, toName: null }).headline).toBe('Claude → everyone')
  })

  it('execute is visually distinct', () => {
    const m: WarRoomEvent = { kind: 'message', seq: 4, fromId: 'a', fromName: 'Claude', toId: 'b', toName: 'Codex', content: 'run', mode: 'execute', ts: 0 }
    const row = formatEvent(m)
    expect(row.icon).toBe('execute')
    expect(row.headline).toContain('ran a prompt in')
  })
})
