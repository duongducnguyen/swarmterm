import { describe, it, expect } from 'vitest'
import {
  type LayoutNode,
  type LeafNode,
  type SplitNode,
  findLeaf,
  collectLeaves,
  splitLeaf,
  closeLeaf,
  resizeSplit,
  updateLeaf,
  reorderLeaves,
  gridFor,
  buildBalancedTree,
  buildGridLayout
} from './layout-tree'

// --- helpers ---------------------------------------------------------------

function leaf(id: string): LeafNode {
  return { type: 'leaf', id, terminalId: `term-${id}` }
}

function split(
  id: string,
  direction: SplitNode['direction'],
  children: [LayoutNode, LayoutNode],
  sizes: [number, number] = [50, 50]
): SplitNode {
  return { type: 'split', id, direction, sizes, children }
}

// Nested fixture:
//   S1 (horizontal) [50,50]
//   ├─ A
//   └─ S2 (vertical) [60,40]
//      ├─ B
//      └─ C
function nestedTree(): SplitNode {
  return split('S1', 'horizontal', [
    leaf('A'),
    split('S2', 'vertical', [leaf('B'), leaf('C')], [60, 40])
  ])
}

// --- findLeaf --------------------------------------------------------------

describe('findLeaf', () => {
  it('returns the leaf when the tree is a single matching leaf', () => {
    expect(findLeaf(leaf('A'), 'A')).toEqual(leaf('A'))
  })

  it('returns null when a single-leaf tree does not match', () => {
    expect(findLeaf(leaf('A'), 'Z')).toBeNull()
  })

  it('finds a deeply nested leaf', () => {
    expect(findLeaf(nestedTree(), 'C')).toEqual(leaf('C'))
  })

  it('returns null for a split node id (only leaves match)', () => {
    expect(findLeaf(nestedTree(), 'S2')).toBeNull()
  })

  it('returns null when the leaf is absent from a nested tree', () => {
    expect(findLeaf(nestedTree(), 'Z')).toBeNull()
  })
})

// --- collectLeaves ---------------------------------------------------------

describe('collectLeaves', () => {
  it('returns the single leaf for a leaf-only tree', () => {
    expect(collectLeaves(leaf('A'))).toEqual([leaf('A')])
  })

  it('returns every leaf in left-to-right order', () => {
    expect(collectLeaves(nestedTree()).map((l) => l.id)).toEqual(['A', 'B', 'C'])
  })
})

// --- resizeSplit -----------------------------------------------------------

describe('resizeSplit', () => {
  it('updates the sizes of the targeted split', () => {
    const result = resizeSplit(nestedTree(), 'S2', [25, 75]) as SplitNode
    const s2 = result.children[1] as SplitNode
    expect(s2.sizes).toEqual([25, 75])
  })

  it('leaves other splits untouched', () => {
    const result = resizeSplit(nestedTree(), 'S2', [25, 75]) as SplitNode
    expect(result.sizes).toEqual([50, 50])
  })

  it('returns the tree unchanged when the split id is absent', () => {
    const tree = nestedTree()
    expect(resizeSplit(tree, 'NOPE', [10, 90])).toEqual(tree)
  })

  it('does not mutate the input tree', () => {
    const tree = nestedTree()
    resizeSplit(tree, 'S2', [25, 75])
    expect((tree.children[1] as SplitNode).sizes).toEqual([60, 40])
  })
})

// --- splitLeaf -------------------------------------------------------------

describe('splitLeaf', () => {
  it('replaces a single-leaf tree with a split of [old, new]', () => {
    const result = splitLeaf(leaf('A'), 'A', 'vertical', leaf('B'), 'S1') as SplitNode
    expect(result.type).toBe('split')
    expect(result.id).toBe('S1')
    expect(result.direction).toBe('vertical')
    expect(result.sizes).toEqual([50, 50])
    expect(result.children).toEqual([leaf('A'), leaf('B')])
  })

  it('splits a nested leaf in place, keeping the rest of the tree', () => {
    const result = splitLeaf(nestedTree(), 'A', 'horizontal', leaf('D'), 'S3') as SplitNode
    const newSplit = result.children[0] as SplitNode
    expect(newSplit.id).toBe('S3')
    expect(newSplit.direction).toBe('horizontal')
    expect(newSplit.children).toEqual([leaf('A'), leaf('D')])
    expect(result.children[1]).toEqual(nestedTree().children[1])
  })

  it('returns the tree unchanged when the leaf id is absent', () => {
    const tree = nestedTree()
    expect(splitLeaf(tree, 'Z', 'vertical', leaf('D'), 'S3')).toEqual(tree)
  })

  it('does not mutate the input tree', () => {
    const tree = nestedTree()
    splitLeaf(tree, 'A', 'vertical', leaf('D'), 'S3')
    expect(tree.children[0]).toEqual(leaf('A'))
  })
})

// --- closeLeaf -------------------------------------------------------------

describe('closeLeaf', () => {
  it('returns null when closing the only leaf (root leaf)', () => {
    expect(closeLeaf(leaf('A'), 'A')).toBeNull()
  })

  it('collapses the parent split, promoting the sibling leaf', () => {
    const result = closeLeaf(nestedTree(), 'B') as SplitNode
    expect(result.id).toBe('S1')
    expect(result.children[0]).toEqual(leaf('A'))
    expect(result.children[1]).toEqual(leaf('C'))
  })

  it('promotes a whole sibling subtree when closing its sibling leaf', () => {
    const result = closeLeaf(nestedTree(), 'A') as SplitNode
    expect(result.id).toBe('S2')
    expect(collectLeaves(result).map((l) => l.id)).toEqual(['B', 'C'])
  })

  it('returns the tree unchanged when the leaf id is absent', () => {
    const tree = nestedTree()
    expect(closeLeaf(tree, 'Z')).toEqual(tree)
  })

  it('does not mutate the input tree', () => {
    const tree = nestedTree()
    closeLeaf(tree, 'B')
    expect(collectLeaves(tree).map((l) => l.id)).toEqual(['A', 'B', 'C'])
  })
})

// --- gridFor ---------------------------------------------------------------

describe('gridFor', () => {
  it('maps each supported terminal count to a grid', () => {
    expect(gridFor(1)).toEqual({ rows: 1, cols: 1 })
    expect(gridFor(2)).toEqual({ rows: 1, cols: 2 })
    expect(gridFor(4)).toEqual({ rows: 2, cols: 2 })
    expect(gridFor(6)).toEqual({ rows: 2, cols: 3 })
    expect(gridFor(8)).toEqual({ rows: 2, cols: 4 })
    expect(gridFor(10)).toEqual({ rows: 2, cols: 5 })
    expect(gridFor(12)).toEqual({ rows: 3, cols: 4 })
  })

  it('has rows times cols equal to the terminal count', () => {
    for (const n of [1, 2, 4, 6, 8, 10, 12]) {
      const { rows, cols } = gridFor(n)
      expect(rows * cols).toBe(n)
    }
  })

  it('throws for an unsupported terminal count', () => {
    expect(() => gridFor(3)).toThrow()
  })
})

// --- buildBalancedTree -----------------------------------------------------

/** A fresh sequential split-id generator: `sp0`, `sp1`, ... */
function splitIds(): () => string {
  let n = 0
  return () => `sp${n++}`
}

describe('buildBalancedTree', () => {
  it('returns the single item unchanged for a one-item list', () => {
    expect(buildBalancedTree([leaf('A')], 'horizontal', splitIds())).toEqual(leaf('A'))
  })

  it('combines two items into one even split', () => {
    const result = buildBalancedTree([leaf('A'), leaf('B')], 'horizontal', splitIds()) as SplitNode
    expect(result.type).toBe('split')
    expect(result.direction).toBe('horizontal')
    expect(result.sizes).toEqual([50, 50])
    expect(collectLeaves(result).map((l) => l.id)).toEqual(['A', 'B'])
  })

  it('keeps left-to-right order for more than two items', () => {
    const result = buildBalancedTree([leaf('A'), leaf('B'), leaf('C')], 'vertical', splitIds())
    expect(collectLeaves(result).map((l) => l.id)).toEqual(['A', 'B', 'C'])
  })

  it('sizes a split in proportion to each side leaf count', () => {
    const result = buildBalancedTree(
      [leaf('A'), leaf('B'), leaf('C')],
      'horizontal',
      splitIds()
    ) as SplitNode
    // left subtree holds 2 leaves, right holds 1
    expect(result.sizes[0]).toBeCloseTo(66.667, 2)
    expect(result.sizes[0] + result.sizes[1]).toBe(100)
  })
})

// --- buildGridLayout -------------------------------------------------------

/** Fresh deterministic leaf / split-id generators for grid-layout tests. */
function gridGenerators(): { makeLeaf: () => LeafNode; makeSplitId: () => string } {
  let l = 0
  let s = 0
  return {
    makeLeaf: (): LeafNode => {
      const id = `L${l++}`
      return { type: 'leaf', id, terminalId: `t-${id}` }
    },
    makeSplitId: () => `S${s++}`
  }
}

describe('buildGridLayout', () => {
  it('returns a single leaf for a one-terminal layout', () => {
    const { makeLeaf, makeSplitId } = gridGenerators()
    expect(buildGridLayout(1, makeLeaf, makeSplitId).type).toBe('leaf')
  })

  it('produces exactly `count` leaves for every supported count', () => {
    for (const n of [1, 2, 4, 6, 8, 10, 12]) {
      const { makeLeaf, makeSplitId } = gridGenerators()
      expect(collectLeaves(buildGridLayout(n, makeLeaf, makeSplitId))).toHaveLength(n)
    }
  })

  it('lays four terminals out as rows of columns', () => {
    const { makeLeaf, makeSplitId } = gridGenerators()
    const tree = buildGridLayout(4, makeLeaf, makeSplitId) as SplitNode
    expect(tree.type).toBe('split')
    expect(tree.direction).toBe('vertical')
    expect((tree.children[0] as SplitNode).direction).toBe('horizontal')
  })

  it('gives each leaf a distinct terminalId', () => {
    const { makeLeaf, makeSplitId } = gridGenerators()
    const ids = collectLeaves(buildGridLayout(8, makeLeaf, makeSplitId)).map((l) => l.terminalId)
    expect(new Set(ids).size).toBe(8)
  })
})

// --- updateLeaf ------------------------------------------------------------

describe('updateLeaf', () => {
  it('patches the matching leaf with the given fields', () => {
    const result = updateLeaf(nestedTree(), 'B', { agentId: 'codex' }) as SplitNode
    const s2 = result.children[1] as SplitNode
    expect((s2.children[0] as LeafNode).agentId).toBe('codex')
  })

  it('sets a per-pane cwd override', () => {
    const result = updateLeaf(leaf('A'), 'A', { cwd: 'D:/x' }) as LeafNode
    expect(result.cwd).toBe('D:/x')
  })

  it('clears a cwd override when patched with undefined', () => {
    const withCwd = updateLeaf(leaf('A'), 'A', { cwd: 'D:/x' }) as LeafNode
    const cleared = updateLeaf(withCwd, 'A', { cwd: undefined }) as LeafNode
    expect(cleared.cwd).toBeUndefined()
  })

  it('leaves other leaves untouched', () => {
    const result = updateLeaf(nestedTree(), 'B', { shellId: 'wsl' }) as SplitNode
    expect((result.children[0] as LeafNode).shellId).toBeUndefined()
  })

  it('returns the tree unchanged when the leaf id is absent', () => {
    const tree = nestedTree()
    expect(updateLeaf(tree, 'Z', { agentId: 'codex' })).toEqual(tree)
  })

  it('does not mutate the input tree', () => {
    const tree = nestedTree()
    updateLeaf(tree, 'B', { agentId: 'codex' })
    const s2 = tree.children[1] as SplitNode
    expect((s2.children[0] as LeafNode).agentId).toBeUndefined()
  })
})

// --- reorderLeaves ---------------------------------------------------------

// 2x2 grid fixture, leaves in depth-first order [A, B, C, D]:
//   R  (vertical)   [30,70]
//   ├─ T  (horizontal) [50,50] ├─ A └─ B
//   └─ B2 (horizontal) [40,60] ├─ C └─ D
function gridTree(): SplitNode {
  return split(
    'R',
    'vertical',
    [
      split('T', 'horizontal', [leaf('A'), leaf('B')], [50, 50]),
      split('B2', 'horizontal', [leaf('C'), leaf('D')], [40, 60])
    ],
    [30, 70]
  )
}

describe('reorderLeaves', () => {
  it('moves a leaf to the target slot, shifting the panes in between (reflow)', () => {
    // Drag A (slot 0) onto C (slot 2): [A,B,C,D] -> [B,C,A,D]
    const result = reorderLeaves(gridTree(), 'A', 'C')
    expect(collectLeaves(result).map((l) => l.id)).toEqual(['B', 'C', 'A', 'D'])
  })

  it('reorders two leaves under the same parent', () => {
    const result = reorderLeaves(gridTree(), 'A', 'B')
    expect(collectLeaves(result).map((l) => l.id)).toEqual(['B', 'A', 'C', 'D'])
  })

  it('moves a later leaf earlier, shifting the rest right', () => {
    // Drag D (slot 3) onto A (slot 0): [A,B,C,D] -> [D,A,B,C]
    const result = reorderLeaves(gridTree(), 'D', 'A')
    expect(collectLeaves(result).map((l) => l.id)).toEqual(['D', 'A', 'B', 'C'])
  })

  it('carries the whole leaf node (terminalId and overrides) to its new slot', () => {
    const a: LeafNode = { type: 'leaf', id: 'A', terminalId: 'term-A', agentId: 'claude-code', cwd: '/a' }
    const tree = split('S', 'horizontal', [a, leaf('B')])
    const result = reorderLeaves(tree, 'A', 'B') as SplitNode
    expect(result.children[1]).toEqual(a) // moved intact, overrides preserved
  })

  it('preserves the split skeleton (ids, directions, sizes)', () => {
    const result = reorderLeaves(gridTree(), 'A', 'C') as SplitNode
    expect(result.id).toBe('R')
    expect(result.direction).toBe('vertical')
    expect(result.sizes).toEqual([30, 70])
    const top = result.children[0] as SplitNode
    expect(top.id).toBe('T')
    expect(top.direction).toBe('horizontal')
    expect(top.sizes).toEqual([50, 50])
    expect((result.children[1] as SplitNode).sizes).toEqual([40, 60])
  })

  it('returns the same tree reference when both ids are equal', () => {
    const tree = gridTree()
    expect(reorderLeaves(tree, 'A', 'A')).toBe(tree)
  })

  it('returns the same tree reference when a leaf is missing', () => {
    const tree = gridTree()
    expect(reorderLeaves(tree, 'A', 'Z')).toBe(tree)
  })

  it('does not mutate its input', () => {
    const tree = gridTree()
    const snapshot = structuredClone(tree)
    reorderLeaves(tree, 'A', 'C')
    expect(tree).toEqual(snapshot)
  })
})
