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
