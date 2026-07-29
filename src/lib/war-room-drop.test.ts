import { describe, expect, it } from 'vitest'
import { MEMBER_DRAG_PREFIX, ROOM_DROP_PREFIX, WAR_ROOM_DROP_ID, DragEndContext, memberDisplayName, resolveDragEnd } from './war-room-drop'

const ctx = (activeRoomId: string | null, roomOf: Record<string, string> = {}): DragEndContext => ({
  activeRoomId,
  memberRoomId: (id: string) => roomOf[id] ?? null
})

describe('resolveDragEnd', () => {
  it('pane on a room tab joins that room', () => {
    expect(resolveDragEnd('leaf1', `${ROOM_DROP_PREFIX}room-2`, ctx('room-1')))
      .toEqual({ kind: 'join', leafId: 'leaf1', roomId: 'room-2' })
  })

  it('pane on the panel body joins the active room', () => {
    expect(resolveDragEnd('leaf1', WAR_ROOM_DROP_ID, ctx('room-1')))
      .toEqual({ kind: 'join', leafId: 'leaf1', roomId: 'room-1' })
  })

  it('pane on the body before hydration is a no-op, never a reorder', () => {
    expect(resolveDragEnd('leaf1', WAR_ROOM_DROP_ID, ctx(null))).toEqual({ kind: 'none' })
  })

  it('member chip on another room tab moves it', () => {
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t1`, `${ROOM_DROP_PREFIX}room-2`, ctx('room-1', { t1: 'room-1' })))
      .toEqual({ kind: 'move', terminalId: 't1', roomId: 'room-2' })
  })

  it('member chip on its own room tab or the body of its room keeps membership', () => {
    const c = ctx('room-1', { t1: 'room-1' })
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t1`, `${ROOM_DROP_PREFIX}room-1`, c)).toEqual({ kind: 'none' })
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t1`, WAR_ROOM_DROP_ID, c)).toEqual({ kind: 'none' })
  })

  it('member chip on the body moves it into the ACTIVE room when that differs', () => {
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t1`, WAR_ROOM_DROP_ID, ctx('room-2', { t1: 'room-1' })))
      .toEqual({ kind: 'move', terminalId: 't1', roomId: 'room-2' })
  })

  it('member chip dropped anywhere else leaves', () => {
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t1`, null, ctx('room-1', { t1: 'room-1' })))
      .toEqual({ kind: 'leave', terminalId: 't1' })
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t1`, 'some-leaf', ctx('room-1', { t1: 'room-1' })))
      .toEqual({ kind: 'leave', terminalId: 't1' })
  })

  it('pane over pane still reorders; self/nothing is none', () => {
    expect(resolveDragEnd('a', 'b', ctx('room-1'))).toEqual({ kind: 'reorder', activeLeafId: 'a', overLeafId: 'b' })
    expect(resolveDragEnd('a', 'a', ctx('room-1'))).toEqual({ kind: 'none' })
    expect(resolveDragEnd('a', null, ctx('room-1'))).toEqual({ kind: 'none' })
  })
})

describe('memberDisplayName', () => {
  it('appends the posix cwd basename', () => {
    expect(memberDisplayName('Claude Code', '/Users/dev/projects/swarmterm')).toBe(
      'Claude Code · swarmterm'
    )
  })

  it('appends the windows cwd basename', () => {
    expect(memberDisplayName('Claude Code', 'C:\\Users\\dev\\projects\\swarmterm')).toBe(
      'Claude Code · swarmterm'
    )
  })

  it('ignores a trailing slash', () => {
    expect(memberDisplayName('Claude Code', '/Users/dev/projects/swarmterm/')).toBe(
      'Claude Code · swarmterm'
    )
  })

  it('leaves the title unchanged for a root path with no usable segment', () => {
    expect(memberDisplayName('Claude Code', '/')).toBe('Claude Code')
  })

  it('leaves the title unchanged for an empty cwd', () => {
    expect(memberDisplayName('Claude Code', '')).toBe('Claude Code')
  })

  it('skips the append when the title already names the folder', () => {
    expect(memberDisplayName('NotifyMe', '/Users/dev/projects/NotifyMe')).toBe('NotifyMe')
  })
})
