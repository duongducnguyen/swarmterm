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
      { type: 'context', content: 'const x = 1' },
      { type: 'added', content: 'const y = 2' },
      { type: 'removed', content: 'const z = 3' },
      { type: 'context', content: 'const w = 4' },
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
})
