import { beforeEach, describe, expect, it } from 'vitest'
import { TRANSCRIPT_CAP, useWarRoomStore } from './war-room-store'
import type { WarRoomEvent } from '@/tauri/warroom'

const join = (terminalId: string, name: string, seq: number): WarRoomEvent => ({
  kind: 'join', seq, terminalId, name, agentId: 'claude-code', cwd: '/x', ts: seq
})
const leave = (terminalId: string, name: string, seq: number): WarRoomEvent => ({
  kind: 'leave', seq, terminalId, name, ts: seq
})
const message = (seq: number): WarRoomEvent => ({
  kind: 'message', seq, fromId: 't1', fromName: 'A', toId: 't2', toName: 'B',
  content: 'hi', mode: 'probe', ts: seq
})

beforeEach(() => {
  useWarRoomStore.setState({ members: [], transcript: [], queues: {} })
})

describe('applyEvent', () => {
  it('join adds a member once and re-join refreshes metadata', () => {
    const s = useWarRoomStore.getState()
    s.applyEvent(join('t1', 'Claude', 1))
    s.applyEvent({ ...join('t1', 'Renamed', 2) })
    const { members, transcript } = useWarRoomStore.getState()
    expect(members).toHaveLength(1)
    expect(members[0].name).toBe('Renamed')
    expect(transcript).toHaveLength(2)
  })

  it('leave removes the member and drops its queue', () => {
    const s = useWarRoomStore.getState()
    s.applyEvent(join('t1', 'Claude', 1))
    s.enqueue({ toId: 't1', fromName: 'B', mode: 'probe', content: null })
    s.applyEvent(leave('t1', 'Claude', 2))
    const st = useWarRoomStore.getState()
    expect(st.members).toHaveLength(0)
    expect(st.queues['t1']).toBeUndefined()
    expect(st.isMember('t1')).toBe(false)
  })

  it('caps the transcript at TRANSCRIPT_CAP, dropping the oldest', () => {
    const s = useWarRoomStore.getState()
    for (let i = 1; i <= TRANSCRIPT_CAP + 10; i++) s.applyEvent(message(i))
    const { transcript } = useWarRoomStore.getState()
    expect(transcript).toHaveLength(TRANSCRIPT_CAP)
    expect(transcript[0].seq).toBe(11)
  })
})

describe('queues', () => {
  it('enqueue groups by recipient; takeFlush returns payloads and clears', () => {
    const s = useWarRoomStore.getState()
    s.applyEvent(join('t1', 'Claude', 1))
    s.enqueue({ toId: 't1', fromName: 'Codex', mode: 'execute', content: 'do it' })
    s.enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    const payloads = useWarRoomStore.getState().takeFlush('t1')
    expect(payloads[0]).toBe('do it')
    expect(payloads[1]).toContain('war_room.read_inbox')
    expect(useWarRoomStore.getState().takeFlush('t1')).toEqual([])
  })

  it('enqueueIntro queues a verbatim paste', () => {
    const s = useWarRoomStore.getState()
    s.enqueueIntro('t1', 'INTRO TEXT')
    expect(useWarRoomStore.getState().takeFlush('t1')).toEqual(['INTRO TEXT'])
  })
})
