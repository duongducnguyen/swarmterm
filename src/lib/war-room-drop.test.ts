import { describe, expect, it } from 'vitest'
import { MEMBER_DRAG_PREFIX, WAR_ROOM_DROP_ID, resolveDragEnd } from './war-room-drop'

describe('resolveDragEnd', () => {
  it('pane dropped on the zone joins', () => {
    expect(resolveDragEnd('leaf-1', WAR_ROOM_DROP_ID)).toEqual({ kind: 'join', leafId: 'leaf-1' })
  })

  it('pane dropped on another pane reorders', () => {
    expect(resolveDragEnd('leaf-1', 'leaf-2')).toEqual({
      kind: 'reorder', activeLeafId: 'leaf-1', overLeafId: 'leaf-2'
    })
  })

  it('pane dropped on itself or nowhere is a no-op', () => {
    expect(resolveDragEnd('leaf-1', 'leaf-1')).toEqual({ kind: 'none' })
    expect(resolveDragEnd('leaf-1', null)).toEqual({ kind: 'none' })
  })

  it('member chip dropped outside the zone leaves; on the zone stays', () => {
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t9`, null)).toEqual({ kind: 'leave', terminalId: 't9' })
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t9`, 'leaf-2')).toEqual({ kind: 'leave', terminalId: 't9' })
    expect(resolveDragEnd(`${MEMBER_DRAG_PREFIX}t9`, WAR_ROOM_DROP_ID)).toEqual({ kind: 'none' })
  })
})
