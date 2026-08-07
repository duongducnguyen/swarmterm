import { describe, expect, it } from 'vitest'
import { hiddenCount, visibleSlice } from '@/lib/list-paging'

describe('visibleSlice', () => {
  const items = ['a', 'b', 'c', 'd', 'e']
  it('returns the head when collapsed', () => {
    expect(visibleSlice(items, false, 3)).toEqual(['a', 'b', 'c'])
  })
  it('returns everything when expanded', () => {
    expect(visibleSlice(items, true, 3)).toEqual(items)
  })
  it('returns everything when total fits the head', () => {
    expect(visibleSlice(items, false, 5)).toEqual(items)
    expect(visibleSlice(items, false, 9)).toEqual(items)
  })
})

describe('hiddenCount', () => {
  it('counts rows the expander would reveal', () => {
    expect(hiddenCount(12, false, 5)).toBe(7)
  })
  it('is 0 when expanded or when nothing overflows', () => {
    expect(hiddenCount(12, true, 5)).toBe(0)
    expect(hiddenCount(5, false, 5)).toBe(0)
    expect(hiddenCount(3, false, 5)).toBe(0)
  })
})
