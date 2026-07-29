/** Shared dnd-kit ids + the one rule for what a finished drag means. Pure so
 *  the join/leave/reorder decision is testable without dnd-kit. */
export const WAR_ROOM_DROP_ID = 'war-room-dropzone'
export const MEMBER_DRAG_PREFIX = 'warroom-member:'
export const ROOM_DROP_PREFIX = 'war-room-room:'

export interface DragEndContext {
  /** Room shown in the panel — what a body drop means. Null before hydration. */
  activeRoomId: string | null
  memberRoomId: (terminalId: string) => string | null
}

export type DragEndAction =
  | { kind: 'join'; leafId: string; roomId: string }
  | { kind: 'move'; terminalId: string; roomId: string }
  | { kind: 'leave'; terminalId: string }
  | { kind: 'reorder'; activeLeafId: string; overLeafId: string }
  | { kind: 'none' }

export function resolveDragEnd(
  activeId: string,
  overId: string | null,
  ctx: DragEndContext
): DragEndAction {
  const isRoomTarget =
    overId !== null && (overId === WAR_ROOM_DROP_ID || overId.startsWith(ROOM_DROP_PREFIX))
  const targetRoomId = !isRoomTarget
    ? null
    : overId === WAR_ROOM_DROP_ID
      ? ctx.activeRoomId
      : overId.slice(ROOM_DROP_PREFIX.length)

  if (activeId.startsWith(MEMBER_DRAG_PREFIX)) {
    const terminalId = activeId.slice(MEMBER_DRAG_PREFIX.length)
    if (isRoomTarget) {
      // Same room (or nothing to resolve to) keeps membership; a different
      // room is a move — the drag gesture is the transfer.
      if (targetRoomId === null || targetRoomId === ctx.memberRoomId(terminalId))
        return { kind: 'none' }
      return { kind: 'move', terminalId, roomId: targetRoomId }
    }
    return { kind: 'leave', terminalId }
  }
  if (isRoomTarget) {
    // Pre-hydration body drop: no room to join yet — swallow rather than
    // falling through to a bogus reorder against the drop-zone id.
    return targetRoomId === null ? { kind: 'none' } : { kind: 'join', leafId: activeId, roomId: targetRoomId }
  }
  if (overId !== null && overId !== activeId)
    return { kind: 'reorder', activeLeafId: activeId, overLeafId: overId }
  return { kind: 'none' }
}

/**
 * Disambiguate two joined members running the same agent — two "Claude Code"
 * panes read identically in the roster chips and in "Claude Code → Claude
 * Code" transcript rows, with no way to tell which is which. Appending the
 * cwd's folder basename at join time fixes both display sites for free,
 * since they both read the stored member name.
 *
 * Skips the append when the basename is already present in the title (a
 * pane titled "NotifyMe" sitting in a "NotifyMe" checkout should stay
 * "NotifyMe", not become "NotifyMe · NotifyMe") and when the cwd has no
 * usable segment at all (empty string, "/", or a string of only separators).
 */
export function memberDisplayName(baseTitle: string, cwd: string): string {
  const basename = cwd
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0)
    .pop()
  if (!basename || baseTitle.includes(basename)) return baseTitle
  return `${baseTitle} · ${basename}`
}
