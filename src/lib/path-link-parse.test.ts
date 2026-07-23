import { describe, expect, it } from 'vitest'
import { detectPathCandidates, parsePathSuffix } from './path-link-parse'

describe('parsePathSuffix', () => {
  it('parses line and column', () => {
    expect(parsePathSuffix('src/foo.ts:42:9')).toEqual({ path: 'src/foo.ts', line: 42, col: 9 })
  })

  it('parses line only', () => {
    expect(parsePathSuffix('src/foo.ts:42')).toEqual({ path: 'src/foo.ts', line: 42 })
  })

  it('parses the MSVC/tsc parenthesised form', () => {
    expect(parsePathSuffix('src/foo.ts(42,9)')).toEqual({ path: 'src/foo.ts', line: 42, col: 9 })
    expect(parsePathSuffix('src/foo.ts(42)')).toEqual({ path: 'src/foo.ts', line: 42 })
  })

  it('parses the Python traceback form', () => {
    expect(parsePathSuffix('File "src/foo.py", line 42')).toEqual({ path: 'src/foo.py', line: 42 })
  })

  it('keeps a Windows drive letter out of the line number', () => {
    expect(parsePathSuffix('C:\\src\\foo.ts:42')).toEqual({ path: 'C:\\src\\foo.ts', line: 42 })
    expect(parsePathSuffix('C:\\src\\foo.ts')).toEqual({ path: 'C:\\src\\foo.ts' })
  })

  it('returns the whole text when there is no suffix', () => {
    expect(parsePathSuffix('src/foo.ts')).toEqual({ path: 'src/foo.ts' })
  })
})

describe('detectPathCandidates', () => {
  it('finds a relative path with its suffix', () => {
    expect(detectPathCandidates('  at src/lib/foo.ts:42:9 in handler')).toEqual([
      { text: 'src/lib/foo.ts:42:9', start: 5, end: 24 },
    ])
  })

  it('finds an absolute posix path', () => {
    const out = detectPathCandidates('wrote /Users/me/app/src/index.ts')
    expect(out).toEqual([{ text: '/Users/me/app/src/index.ts', start: 6, end: 32 }])
  })

  it('finds a Windows path', () => {
    const out = detectPathCandidates('open C:\\Users\\me\\app\\main.rs')
    expect(out).toEqual([{ text: 'C:\\Users\\me\\app\\main.rs', start: 5, end: 28 }])
  })

  it('strips trailing sentence punctuation', () => {
    expect(detectPathCandidates('see src/foo.ts.')).toEqual([
      { text: 'src/foo.ts', start: 4, end: 14 },
    ])
  })

  it('ignores a bare word with no separator', () => {
    expect(detectPathCandidates('foo.ts is fine')).toEqual([])
  })

  it('ignores a URL so WebLinksAddon owns it', () => {
    expect(detectPathCandidates('see https://example.com/a/b')).toEqual([])
  })

  it('returns nothing for a line past the length limit', () => {
    expect(detectPathCandidates('a/b.ts '.repeat(400))).toEqual([])
  })

  it('caps the number of candidates per line', () => {
    const line = Array.from({ length: 20 }, (_, i) => `s/f${i}.ts`).join(' ')
    expect(detectPathCandidates(line)).toHaveLength(10)
  })
})
