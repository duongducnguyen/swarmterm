import { collectLeaves, type LayoutNode } from '@/lib/layout-tree'

/**
 * Decide which terminalIds a keystroke originating at `sourceTerminalId` should
 * be written to. Pure — depends only on the layout and the broadcast group, so
 * it is unit-testable without a store, DOM, or pty.
 *
 * Rules: if broadcast is off, or the source pane is not part of the group, the
 * keystroke stays local (just the source). Otherwise it fans out to every group
 * member that still exists in the layout (stale ids are dropped).
 * Returned terminalIds are in layout depth-first (left-to-right) order.
 */
export function resolveBroadcastTargets(
  layout: LayoutNode,
  broadcastActive: boolean,
  broadcastLeafIds: string[],
  sourceTerminalId: string
): string[] {
  if (!broadcastActive) return [sourceTerminalId]
  const leaves = collectLeaves(layout)
  const source = leaves.find((l) => l.terminalId === sourceTerminalId)
  if (!source || !broadcastLeafIds.includes(source.id)) return [sourceTerminalId]
  const members = new Set(broadcastLeafIds)
  return leaves.filter((l) => members.has(l.id)).map((l) => l.terminalId)
}
