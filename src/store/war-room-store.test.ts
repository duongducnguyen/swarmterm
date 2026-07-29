import { beforeEach, describe, expect, it } from 'vitest'
import { TRANSCRIPT_CAP, useWarRoomStore } from './war-room-store'
import type { WarRoomEvent } from '@/tauri/warroom'

const join = (roomId: string, terminalId: string, seq = 1): WarRoomEvent => ({
  kind: 'join', seq, roomId, terminalId,
  name: terminalId.toUpperCase(), agentId: 'codex', cwd: '/x', connected: false, ts: seq
})

const seedRooms = (): void =>
  useWarRoomStore.getState().hydrateRooms([
    { roomId: 'room-1', name: 'War Room', members: [] },
    { roomId: 'room-2', name: 'Website B', members: [] }
  ])

beforeEach(() => {
  useWarRoomStore.setState({
    rooms: [], activeRoomId: null, membersByRoom: {}, transcriptByRoom: {}, queues: {}, held: {}
  })
})

describe('room routing', () => {
  it('hydrateRooms seeds rooms, members, and the active room', () => {
    useWarRoomStore.getState().hydrateRooms([
      { roomId: 'room-1', name: 'War Room', members: [
        { terminalId: 't1', name: 'A', agentId: 'codex', cwd: '/a', connected: true }
      ] }
    ])
    const s = useWarRoomStore.getState()
    expect(s.activeRoomId).toBe('room-1')
    expect(s.membersByRoom['room-1']).toHaveLength(1)
    expect(s.isMember('t1')).toBe(true)
    expect(s.memberRoomId('t1')).toBe('room-1')
  })

  it('applyEvent routes join/leave/message by roomId', () => {
    seedRooms()
    useWarRoomStore.getState().applyEvent(join('room-2', 't1'))
    const s = useWarRoomStore.getState()
    expect(s.membersByRoom['room-2']).toHaveLength(1)
    expect(s.membersByRoom['room-1'] ?? []).toHaveLength(0)
    expect(s.transcriptByRoom['room-2']).toHaveLength(1)
    expect(s.transcriptByRoom['room-1'] ?? []).toHaveLength(0)
    expect(s.memberRoomId('t1')).toBe('room-2')
  })

  it('a join into one room evicts the terminal from every other room slice', () => {
    seedRooms()
    useWarRoomStore.getState().applyEvent(join('room-1', 't1', 1))
    useWarRoomStore.getState().applyEvent(join('room-2', 't1', 2))
    const s = useWarRoomStore.getState()
    expect(s.membersByRoom['room-1']).toHaveLength(0)
    expect(s.membersByRoom['room-2']).toHaveLength(1)
  })

  it('leave drops that terminal queue and held flag (unchanged behaviour, now per room)', () => {
    seedRooms()
    useWarRoomStore.getState().applyEvent(join('room-1', 't1'))
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'X', mode: 'probe', content: null })
    useWarRoomStore.getState().setHeld('t1', true)
    useWarRoomStore.getState().applyEvent({ kind: 'leave', seq: 2, roomId: 'room-1', terminalId: 't1', name: 'T1', ts: 2 })
    const s = useWarRoomStore.getState()
    expect(s.queues['t1']).toBeUndefined()
    expect(s.held['t1']).toBeUndefined()
    expect(s.isMember('t1')).toBe(false)
  })

  it('transcript cap applies per room', () => {
    seedRooms()
    for (let i = 0; i < TRANSCRIPT_CAP + 10; i++) {
      useWarRoomStore.getState().applyEvent({
        kind: 'message', seq: i, roomId: 'room-1', fromId: '__moderator__', fromName: 'Moderator',
        toId: null, toName: null, content: `m${i}`, mode: 'probe', ts: i
      })
    }
    useWarRoomStore.getState().applyEvent(join('room-2', 't9'))
    const s = useWarRoomStore.getState()
    expect(s.transcriptByRoom['room-1']).toHaveLength(TRANSCRIPT_CAP)
    expect(s.transcriptByRoom['room-2']).toHaveLength(1)
  })

  it('applyRooms adds, renames, drops rooms, and falls back the active room', () => {
    seedRooms()
    useWarRoomStore.getState().setActiveRoom('room-2')
    useWarRoomStore.getState().applyEvent(join('room-2', 't1'))
    useWarRoomStore.getState().enqueue({ toId: 't1', fromName: 'X', mode: 'probe', content: null })
    useWarRoomStore.getState().applyRooms([{ roomId: 'room-1', name: 'Renamed' }, { roomId: 'room-3', name: 'C' }])
    const s = useWarRoomStore.getState()
    expect(s.rooms.map((r) => r.roomId)).toEqual(['room-1', 'room-3'])
    expect(s.rooms[0].name).toBe('Renamed')
    expect(s.activeRoomId).toBe('room-1') // room-2 vanished → first room
    expect(s.membersByRoom['room-2']).toBeUndefined()
    expect(s.transcriptByRoom['room-2']).toBeUndefined()
    expect(s.queues['t1']).toBeUndefined() // belt-and-braces queue drop
  })

  it('clearTranscript clears only the named room', () => {
    seedRooms()
    useWarRoomStore.getState().applyEvent(join('room-1', 't1'))
    useWarRoomStore.getState().applyEvent(join('room-2', 't2'))
    useWarRoomStore.getState().clearTranscript('room-1')
    const s = useWarRoomStore.getState()
    expect(s.transcriptByRoom['room-1']).toHaveLength(0)
    expect(s.transcriptByRoom['room-2']).toHaveLength(1)
  })
})

describe('queues', () => {
  it('enqueue groups by recipient; takeFlush returns payloads and clears', () => {
    seedRooms()
    const s = useWarRoomStore.getState()
    s.applyEvent(join('room-1', 't1'))
    s.enqueue({ toId: 't1', fromName: 'Codex', mode: 'execute', content: 'do it' })
    s.enqueue({ toId: 't1', fromName: 'Codex', mode: 'probe', content: null })
    const payloads = useWarRoomStore.getState().takeFlush('t1')
    expect(payloads[0]).toBe('do it')
    expect(payloads[1]).toContain('war_room.read_inbox')
    expect(useWarRoomStore.getState().takeFlush('t1')).toEqual([])
  })

  it('enqueueIntro queues a verbatim paste', () => {
    seedRooms()
    const s = useWarRoomStore.getState()
    s.enqueueIntro('t1', 'INTRO TEXT')
    expect(useWarRoomStore.getState().takeFlush('t1')).toEqual(['INTRO TEXT'])
  })
})

describe('held', () => {
  it('sets and clears the flag, deleting the key on clear', () => {
    seedRooms()
    const s = useWarRoomStore.getState()
    s.setHeld('t1', true)
    expect(useWarRoomStore.getState().held['t1']).toBe(true)
    s.setHeld('t1', false)
    expect(useWarRoomStore.getState().held['t1']).toBeUndefined()
  })

  it('does not churn state when nothing changes', () => {
    seedRooms()
    const before = useWarRoomStore.getState().held
    useWarRoomStore.getState().setHeld('t1', false)
    expect(useWarRoomStore.getState().held).toBe(before)
  })

  it('clears on flush — a delivered queue is no longer held', () => {
    seedRooms()
    const s = useWarRoomStore.getState()
    s.applyEvent(join('room-1', 't1'))
    s.enqueue({ toId: 't1', fromName: 'B', mode: 'probe', content: null })
    s.setHeld('t1', true)
    useWarRoomStore.getState().takeFlush('t1')
    expect(useWarRoomStore.getState().held['t1']).toBeUndefined()
  })

  it('clears on leave alongside the queue', () => {
    seedRooms()
    const s = useWarRoomStore.getState()
    s.applyEvent(join('room-1', 't1'))
    s.enqueue({ toId: 't1', fromName: 'B', mode: 'probe', content: null })
    s.setHeld('t1', true)
    s.applyEvent({ kind: 'leave', seq: 2, roomId: 'room-1', terminalId: 't1', name: 'T1', ts: 2 })
    const after = useWarRoomStore.getState()
    expect(after.held['t1']).toBeUndefined()
    expect(after.queues['t1']).toBeUndefined()
  })
})
