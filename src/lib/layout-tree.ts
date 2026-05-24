/**
 * Pure functions over the binary split-tree layout model.
 *
 * A workspace layout is a binary tree: every node is either a `leaf`
 * (one terminal) or a `split` (two children, divided horizontally or
 * vertically). All functions here are pure and return new trees — they
 * never mutate their input.
 */

export type Direction = 'horizontal' | 'vertical'

export interface LeafNode {
  type: 'leaf'
  id: string
  terminalId: string
  /**
   * Command run once when this terminal first spawns. Set on leaves the setup
   * wizard creates from the chosen template; absent on leaves created by
   * splitting a pane, which start as a plain shell.
   */
  initialCommand?: string
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

/** All leaves of the tree, in left-to-right depth-first order. */
export function collectLeaves(tree: LayoutNode): LeafNode[] {
  if (tree.type === 'leaf') return [tree]
  return [...collectLeaves(tree.children[0]), ...collectLeaves(tree.children[1])]
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

/** Terminal counts the setup wizard offers, each mapped to a grid by `gridFor`. */
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
