/** Shared dnd-kit ids + the one rule for what a finished drag means. Pure so
 *  the join/leave/reorder decision is testable without dnd-kit. */
export const WAR_ROOM_DROP_ID = 'war-room-dropzone'
export const MEMBER_DRAG_PREFIX = 'warroom-member:'

export type DragEndAction =
  | { kind: 'join'; leafId: string }
  | { kind: 'leave'; terminalId: string }
  | { kind: 'reorder'; activeLeafId: string; overLeafId: string }
  | { kind: 'none' }

export function resolveDragEnd(activeId: string, overId: string | null): DragEndAction {
  if (activeId.startsWith(MEMBER_DRAG_PREFIX)) {
    const terminalId = activeId.slice(MEMBER_DRAG_PREFIX.length)
    // Dropping the chip back on the zone keeps membership; anywhere else evicts.
    return overId === WAR_ROOM_DROP_ID ? { kind: 'none' } : { kind: 'leave', terminalId }
  }
  if (overId === WAR_ROOM_DROP_ID) return { kind: 'join', leafId: activeId }
  if (overId !== null && overId !== activeId)
    return { kind: 'reorder', activeLeafId: activeId, overLeafId: overId }
  return { kind: 'none' }
}
