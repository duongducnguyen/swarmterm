import { describe, it, expect } from 'vitest'
import { parseDiff, type DiffLine } from './git-diff'

describe('parseDiff', () => {
  it('returns empty array for empty string', () => {
    expect(parseDiff('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(parseDiff('  \n  ')).toEqual([])
  })

  it('parses added, removed, context lines and strips meta lines', () => {
    const raw = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -12,7 +12,10 @@ export async function login() {
 const x = 1
+const y = 2
-const z = 3
 const w = 4`
    const lines = parseDiff(raw)
    expect(lines).toEqual<DiffLine[]>([
      { type: 'hunk', content: '@@ -12,7 +12,10 @@ export async function login() {' },
      { type: 'context', content: 'const x = 1', oldLineNo: 12, newLineNo: 12 },
      { type: 'added', content: 'const y = 2', newLineNo: 13 },
      { type: 'removed', content: 'const z = 3', oldLineNo: 13 },
      { type: 'context', content: 'const w = 4', oldLineNo: 14, newLineNo: 14 },
    ])
  })

  it('filters out meta-prefix lines (diff, index, ---, +++)', () => {
    const raw = `diff --git a/foo.ts b/foo.ts
index abc..def 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1 +1 @@
+hello`
    const lines = parseDiff(raw)
    expect(lines).toHaveLength(2)
    expect(lines[0].type).toBe('hunk')
    expect(lines[1].type).toBe('added')
  })

  it('handles multiple hunks', () => {
    const raw = `diff --git a/foo.ts b/foo.ts
index abc..def 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,2 +1,3 @@
 line1
+added1
@@ -10,2 +11,2 @@
 line10
-removed`
    const lines = parseDiff(raw)
    expect(lines.filter(l => l.type === 'hunk')).toHaveLength(2)
  })

  it('numbers context/added/removed lines from the hunk header', () => {
    const raw = `@@ -4,4 +4,5 @@
 const foo = 1
 const bar = 2
-const old = x
+const neu = y
+const neu2 = z
 return foo`
    const lines = parseDiff(raw)
    expect(lines).toEqual<DiffLine[]>([
      { type: 'hunk', content: '@@ -4,4 +4,5 @@' },
      { type: 'context', content: 'const foo = 1', oldLineNo: 4, newLineNo: 4 },
      { type: 'context', content: 'const bar = 2', oldLineNo: 5, newLineNo: 5 },
      { type: 'removed', content: 'const old = x', oldLineNo: 6 },
      { type: 'added', content: 'const neu = y', newLineNo: 6 },
      { type: 'added', content: 'const neu2 = z', newLineNo: 7 },
      { type: 'context', content: 'return foo', oldLineNo: 7, newLineNo: 8 },
    ])
  })

  it('resets counters from each hunk header across multiple hunks', () => {
    const raw = `@@ -1,2 +1,3 @@
 line1
+added1
@@ -10,2 +11,2 @@
 line10
-removed`
    const lines = parseDiff(raw)
    expect(lines).toEqual<DiffLine[]>([
      { type: 'hunk', content: '@@ -1,2 +1,3 @@' },
      { type: 'context', content: 'line1', oldLineNo: 1, newLineNo: 1 },
      { type: 'added', content: 'added1', newLineNo: 2 },
      { type: 'hunk', content: '@@ -10,2 +11,2 @@' },
      { type: 'context', content: 'line10', oldLineNo: 10, newLineNo: 11 },
      { type: 'removed', content: 'removed', oldLineNo: 11 },
    ])
  })

  it('handles the count-less hunk form (@@ -1 +1 @@)', () => {
    const raw = `@@ -1 +1 @@
-old
+new`
    const lines = parseDiff(raw)
    expect(lines).toEqual<DiffLine[]>([
      { type: 'hunk', content: '@@ -1 +1 @@' },
      { type: 'removed', content: 'old', oldLineNo: 1 },
      { type: 'added', content: 'new', newLineNo: 1 },
    ])
  })
})
