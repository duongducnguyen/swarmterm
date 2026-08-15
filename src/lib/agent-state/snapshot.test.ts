import { describe, expect, it } from 'vitest'
import { buildSnapshot, type BufferView } from '@/lib/agent-state/snapshot'

const view = (rows: number, lines: string[]): BufferView => ({
  rows,
  length: lines.length,
  line: (i) => lines[i]
})

describe('buildSnapshot', () => {
  it('takes the last `rows` lines of the full buffer — scrollback position is irrelevant', () => {
    expect(buildSnapshot(view(2, ['old', 'a', 'b']))).toBe('a\nb')
  })
  it('right-trims lines and drops trailing blank lines', () => {
    expect(buildSnapshot(view(4, ['a  ', 'b', '   ', '']))).toBe('a\nb')
  })
  it('handles a buffer shorter than rows', () => {
    expect(buildSnapshot(view(24, ['only']))).toBe('only')
  })
  it('returns empty string for an all-blank buffer', () => {
    expect(buildSnapshot(view(2, ['', '  ']))).toBe('')
  })
})
