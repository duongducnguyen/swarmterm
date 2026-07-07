import { describe, it, expect } from 'vitest'
import {
  classifyWorktree,
  isTransientLock,
  clearWorktreeMenuLabel,
  GENERATED_WORKTREE_FILES,
} from './worktree-cleanup'
import type { ChangedFile } from '@/tauri/git'

const file = (path: string): ChangedFile => ({ path, status: 'M', added: 1, removed: 0 })

describe('classifyWorktree', () => {
  it('treats a worktree with only the generated .mcp.json as clean', () => {
    expect(classifyWorktree([file('.mcp.json')], 0)).toEqual({
      uncommittedCount: 0,
      unmergedCount: 0,
      dirty: false,
    })
  })

  it('counts real uncommitted files, ignoring .mcp.json', () => {
    const r = classifyWorktree([file('.mcp.json'), file('src/a.ts'), file('src/b.ts')], 0)
    expect(r.uncommittedCount).toBe(2)
    expect(r.dirty).toBe(true)
  })

  it('flags unmerged commits (ahead > 0) as dirty', () => {
    const r = classifyWorktree([file('.mcp.json')], 3)
    expect(r.unmergedCount).toBe(3)
    expect(r.uncommittedCount).toBe(0)
    expect(r.dirty).toBe(true)
  })

  it('treats a null ahead (detached / no upstream) as zero unmerged', () => {
    expect(classifyWorktree([], null).unmergedCount).toBe(0)
  })

  it('ignores generated files regardless of path separator', () => {
    expect(classifyWorktree([file('nested/.mcp.json')], 0).uncommittedCount).toBe(0)
  })
})

describe('isTransientLock', () => {
  it('matches Windows lock / permission failures', () => {
    expect(isTransientLock('unable to remove: Permission denied')).toBe(true)
    expect(isTransientLock('fatal: directory not empty')).toBe(true)
    expect(isTransientLock('files are locked, close the pane')).toBe(true)
  })

  it('does not match a genuine git refusal', () => {
    expect(isTransientLock('refusing: path is not a swarmterm-managed worktree')).toBe(false)
  })
})

describe('clearWorktreeMenuLabel', () => {
  it('is singular for zero or one', () => {
    expect(clearWorktreeMenuLabel(0)).toBe('Clear worktree')
    expect(clearWorktreeMenuLabel(1)).toBe('Clear worktree')
  })

  it('is plural with a count for many', () => {
    expect(clearWorktreeMenuLabel(5)).toBe('Clear 5 worktrees')
  })
})

it('exposes .mcp.json as a generated file', () => {
  expect(GENERATED_WORKTREE_FILES).toContain('.mcp.json')
})
