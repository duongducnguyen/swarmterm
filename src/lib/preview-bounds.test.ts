import { describe, expect, it } from 'vitest'
import { toLogicalBounds, boundsEqual } from './preview-bounds'

describe('toLogicalBounds', () => {
  it('rounds to integers', () => {
    expect(toLogicalBounds({ x: 10.4, y: 20.6, width: 300.5, height: 199.4 })).toEqual({
      x: 10,
      y: 21,
      width: 301,
      height: 199
    })
  })
  it('clamps position to >= 0 and size to >= 1', () => {
    expect(toLogicalBounds({ x: -5, y: -0.4, width: 0, height: -10 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1
    })
  })
})

describe('boundsEqual', () => {
  it('compares by value and treats undefined as unequal', () => {
    const b = { x: 1, y: 2, width: 3, height: 4 }
    expect(boundsEqual(b, { ...b })).toBe(true)
    expect(boundsEqual(b, { ...b, width: 5 })).toBe(false)
    expect(boundsEqual(b, undefined)).toBe(false)
  })
})
