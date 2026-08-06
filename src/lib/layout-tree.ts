/**
 * Pure functions over the binary split-tree layout model.
 *
 * A workspace layout is a binary tree: every node is either a `leaf`
 * (one terminal) or a `split` (two children, divided horizontally or
 * vertically). All functions here are pure and return new trees — they
 * never mutate their input.
 */

import type { ShellId } from '@/lib/terminal-pref'

export type Direction = 'horizontal' | 'vertical'

export interface LeafNode {
  type: 'leaf'
  id: string
  terminalId: string
  /**
   * Agent this pane runs — a template id from the agent catalog. Absent means
   * the default 'terminal' agent (a plain shell). The pane's startup command is
   * derived from this at spawn time.
   */
  agentId?: string
  /** Per-pane working-directory override. Absent means use the workspace cwd. */
  cwd?: string
  /** Per-pane shell override. Absent means use the global default shell. */
  shellId?: ShellId
  /** Branch of the git worktree this pane was spawned into via worktree.spawn. */
  worktreeBranch?: string
  /** One-shot task brief appended (shell-quoted) to the agent command at spawn. */
  initialPrompt?: string
  /** Session id this pane resumes at spawn (claude/codex/opencode session
   *  recorded on disk by the CLI itself). Cleared on agent switch. */
  resumeSessionId?: string
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: Direction
  sizes: [number, number]
  children: [LayoutNode, LayoutNode]
}

export type LayoutNode = LeafNode | SplitNode

/** Depth-first search for the leaf with `leafId`. Returns `null` if absent. */
export function findLeaf(tree: LayoutNode, leafId: string): LeafNode | null {
  if (tree.type === 'leaf') {
    return tree.id === leafId ? tree : null
  }
  return findLeaf(tree.children[0], leafId) ?? findLeaf(tree.children[1], leafId)
}

/**
 * Return a new tree with `patch` merged into the leaf `leafId`. Patching a field
 * to `undefined` clears that per-pane override. Returns the tree unchanged when
 * `leafId` is not found; never mutates its input.
 */
export function updateLeaf(
  tree: LayoutNode,
  leafId: string,
  patch: Partial<
    Pick<
      LeafNode,
      'agentId' | 'cwd' | 'shellId' | 'worktreeBranch' | 'initialPrompt' | 'resumeSessionId'
    >
  >
): LayoutNode {
  if (tree.type === 'leaf') {
    return tree.id === leafId ? { ...tree, ...patch } : tree
  }
  return {
    ...tree,
    children: [
      updateLeaf(tree.children[0], leafId, patch),
      updateLeaf(tree.children[1], leafId, patch)
    ]
  }
}

/** All leaves of the tree, in left-to-right depth-first order. */
export function collectLeaves(tree: LayoutNode): LeafNode[] {
  if (tree.type === 'leaf') return [tree]
  return [...collectLeaves(tree.children[0]), ...collectLeaves(tree.children[1])]
}

/**
 * Re-place `leaves` into the slots of `tree` in depth-first order — the split
 * skeleton (every split's id, direction, and `sizes`) is preserved exactly;
 * only which leaf sits in each slot changes. `leaves` must hold exactly one
 * entry per leaf slot, in the order the slots are visited. `cursor` threads the
 * read position through the recursion; callers pass `{ i: 0 }`.
 */
function placeLeaves(tree: LayoutNode, leaves: LeafNode[], cursor: { i: number }): LayoutNode {
  if (tree.type === 'leaf') return leaves[cursor.i++]
  return {
    ...tree,
    children: [
      placeLeaves(tree.children[0], leaves, cursor),
      placeLeaves(tree.children[1], leaves, cursor)
    ]
  }
}

/**
 * Move the leaf `fromId` to the slot currently held by `toId`, shifting the
 * panes in between to fill (array-move over the depth-first leaf order), then
 * re-place every leaf into the *unchanged* slot skeleton in the new order. This
 * is reorder-with-reflow, not a 1:1 swap: dragging A onto C in `[A,B,C,D]`
 * yields `[B,C,A,D]`, not `[C,B,A,D]`.
 *
 * Moving whole leaf nodes (with their `terminalId` and per-pane overrides) means
 * anything keyed by leaf id — focus, broadcast membership — follows the terminal
 * for free, and the live xterm (keyed by terminalId in the registry) is only
 * re-parented between slots, never killed. Returns the input unchanged (same
 * reference) when `fromId === toId` or either leaf is absent; never mutates it.
 */
export function reorderLeaves(tree: LayoutNode, fromId: string, toId: string): LayoutNode {
  if (fromId === toId) return tree
  const leaves = collectLeaves(tree)
  const from = leaves.findIndex((l) => l.id === fromId)
  const to = leaves.findIndex((l) => l.id === toId)
  if (from === -1 || to === -1) return tree
  const reordered = leaves.slice()
  const [moved] = reordered.splice(from, 1)
  reordered.splice(to, 0, moved)
  return placeLeaves(tree, reordered, { i: 0 })
}

/**
 * Replace the leaf `leafId` with a new split node (`splitId`) holding the
 * original leaf and `newLeaf`, divided along `direction` at 50/50.
 * Returns the tree unchanged if `leafId` is not found.
 */
export function splitLeaf(
  tree: LayoutNode,
  leafId: string,
  direction: Direction,
  newLeaf: LeafNode,
  splitId: string
): LayoutNode {
  if (tree.type === 'leaf') {
    if (tree.id !== leafId) return tree
    return {
      type: 'split',
      id: splitId,
      direction,
      sizes: [50, 50],
      children: [tree, newLeaf]
    }
  }
  return {
    ...tree,
    children: [
      splitLeaf(tree.children[0], leafId, direction, newLeaf, splitId),
      splitLeaf(tree.children[1], leafId, direction, newLeaf, splitId)
    ]
  }
}

/**
 * Remove the leaf `leafId`. The parent split collapses, promoting the
 * sibling subtree in its place. Returns `null` when the removed leaf is
 * the whole tree, and the tree unchanged when `leafId` is not found.
 */
export function closeLeaf(tree: LayoutNode, leafId: string): LayoutNode | null {
  if (tree.type === 'leaf') {
    return tree.id === leafId ? null : tree
  }
  const [left, right] = tree.children
  // A `null` from a child means that child *was* the target leaf, so this
  // split collapses to the surviving sibling. Splits never collapse to
  // `null` (they always keep at least one of two children).
  const newLeft = closeLeaf(left, leafId)
  if (newLeft === null) return right
  const newRight = closeLeaf(right, leafId)
  if (newRight === null) return left
  return { ...tree, children: [newLeft, newRight] }
}

/**
 * Update the `sizes` of the split node `splitId`. Returns the tree
 * unchanged if `splitId` is not found.
 */
export function resizeSplit(
  tree: LayoutNode,
  splitId: string,
  sizes: [number, number]
): LayoutNode {
  if (tree.type === 'leaf') return tree
  if (tree.id === splitId) {
    return { ...tree, sizes: [sizes[0], sizes[1]] }
  }
  return {
    ...tree,
    children: [
      resizeSplit(tree.children[0], splitId, sizes),
      resizeSplit(tree.children[1], splitId, sizes)
    ]
  }
}

/** A terminal grid: `rows` stacked rows, each holding `cols` columns. */
export interface GridShape {
  rows: number
  cols: number
}

/** The supported explicit terminal counts for the workspace composer tile selector. */
export const TERMINAL_COUNTS = [1, 2, 4, 6, 8, 10, 12] as const

const GRID_BY_COUNT: Record<number, GridShape> = {
  1: { rows: 1, cols: 1 },
  2: { rows: 1, cols: 2 },
  4: { rows: 2, cols: 2 },
  6: { rows: 2, cols: 3 },
  8: { rows: 2, cols: 4 },
  10: { rows: 2, cols: 5 },
  12: { rows: 3, cols: 4 }
}

/** Grid shape for a supported terminal count. Throws on unsupported counts. */
export function gridFor(count: number): GridShape {
  const grid = GRID_BY_COUNT[count]
  if (!grid) throw new Error(`Unsupported terminal count: ${count}`)
  return grid
}

/**
 * Fold a non-empty list of nodes into a balanced binary tree along `direction`.
 * Each split's `sizes` is proportional to the leaf count of its two sides, so
 * every leaf ends up roughly the same size. A one-item list returns that item.
 */
export function buildBalancedTree(
  items: LayoutNode[],
  direction: Direction,
  makeSplitId: () => string
): LayoutNode {
  if (items.length === 1) return items[0]
  const mid = Math.ceil(items.length / 2)
  const left = buildBalancedTree(items.slice(0, mid), direction, makeSplitId)
  const right = buildBalancedTree(items.slice(mid), direction, makeSplitId)
  const leftLeaves = collectLeaves(left).length
  const total = leftLeaves + collectLeaves(right).length
  const leftSize = (leftLeaves / total) * 100
  return {
    type: 'split',
    id: makeSplitId(),
    direction,
    sizes: [leftSize, 100 - leftSize],
    children: [left, right]
  }
}

/**
 * Build a layout tree of `count` terminals arranged as the grid `gridFor`
 * picks: each row is `cols` leaves joined horizontally, and the rows are
 * joined vertically. `makeLeaf` is called once per terminal.
 */
export function buildGridLayout(
  count: number,
  makeLeaf: () => LeafNode,
  makeSplitId: () => string
): LayoutNode {
  const { rows, cols } = gridFor(count)
  const rowNodes: LayoutNode[] = []
  for (let r = 0; r < rows; r++) {
    const leaves: LayoutNode[] = []
    for (let c = 0; c < cols; c++) leaves.push(makeLeaf())
    rowNodes.push(buildBalancedTree(leaves, 'horizontal', makeSplitId))
  }
  return buildBalancedTree(rowNodes, 'vertical', makeSplitId)
}

/**
 * Layout tree for `count` panes, derived from the squad size. Supported grid
 * counts ({1,2,4,6,8,10,12}) get the uniform `buildGridLayout` grid; any other
 * count is laid out as a roughly-square ragged grid (rows of ~⌈√count⌉, last
 * row short), so 3/5/7/9/11 panes still read as a balanced 2-D arrangement
 * rather than a thin single row. `makeLeaf` is called exactly `count` times,
 * row-major, so the caller's agent order maps onto leaves in order.
 */
export function paneLayoutFor(
  count: number,
  makeLeaf: () => LeafNode,
  makeSplitId: () => string
): LayoutNode {
  if (count < 1) throw new Error(`paneLayoutFor: count must be >= 1, got ${count}`)
  if (GRID_BY_COUNT[count]) return buildGridLayout(count, makeLeaf, makeSplitId)

  const cols = Math.ceil(Math.sqrt(count))
  const rowNodes: LayoutNode[] = []
  let made = 0
  while (made < count) {
    const inThisRow = Math.min(cols, count - made)
    const leaves: LayoutNode[] = []
    for (let c = 0; c < inThisRow; c++) {
      leaves.push(makeLeaf())
      made++
    }
    rowNodes.push(buildBalancedTree(leaves, 'horizontal', makeSplitId))
  }
  return buildBalancedTree(rowNodes, 'vertical', makeSplitId)
}

/**
 * Human caption for a derived layout: `"1 pane"`, `"4 panes · 2×2"` for grid
 * counts, or `"3 panes"` for ragged-grid counts (no clean R×C to name).
 */
export function layoutSummary(count: number): string {
  const noun = count === 1 ? 'pane' : 'panes'
  const grid = count === 1 ? undefined : GRID_BY_COUNT[count]
  return grid ? `${count} ${noun} · ${grid.rows}×${grid.cols}` : `${count} ${noun}`
}
