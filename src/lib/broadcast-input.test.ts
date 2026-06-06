import { describe, it, expect } from 'vitest'
import { resolveBroadcastTargets } from './broadcast-input'
import { buildBalancedTree, type LayoutNode, type LeafNode } from './layout-tree'

function leaf(id: string, terminalId: string): LeafNode {
  return { type: 'leaf', id, terminalId }
}

/** A horizontal row of the given leaves, with deterministic split ids. */
function layoutOf(leaves: LeafNode[]): LayoutNode {
  let n = 0
  return buildBalancedTree(leaves, 'horizontal', () => `s${n++}`)
}

const A = leaf('a', 'ta')
const B = leaf('b', 'tb')
const C = leaf('c', 'tc')
const layout = layoutOf([A, B, C])

describe('resolveBroadcastTargets', () => {
  it('returns only the source when broadcast is off', () => {
    expect(resolveBroadcastTargets(layout, false, ['a', 'b', 'c'], 'ta')).toEqual(['ta'])
  })

  it('returns only the source when the source pane is not a member', () => {
    expect(resolveBroadcastTargets(layout, true, ['b', 'c'], 'ta')).toEqual(['ta'])
  })

  it('fans out to every member terminalId when the source is a member', () => {
    expect(resolveBroadcastTargets(layout, true, ['a', 'b', 'c'], 'ta').sort()).toEqual([
      'ta',
      'tb',
      'tc'
    ])
  })

  it('returns just the source for a single-member group', () => {
    expect(resolveBroadcastTargets(layout, true, ['a'], 'ta')).toEqual(['ta'])
  })

  it('skips stale member ids that are no longer in the layout', () => {
    expect(resolveBroadcastTargets(layout, true, ['a', 'b', 'gone'], 'ta').sort()).toEqual([
      'ta',
      'tb'
    ])
  })

  it('returns only the source when the source terminalId is unknown', () => {
    expect(resolveBroadcastTargets(layout, true, ['a', 'b'], 'unknown')).toEqual(['unknown'])
  })

  it('returns only the source when the group is empty but broadcast is on', () => {
    // e.g. after "Clear" with the mode still armed — the keystroke must not be dropped.
    expect(resolveBroadcastTargets(layout, true, [], 'ta')).toEqual(['ta'])
  })
})
