import { describe, it, expect } from 'vitest'
import { resolveHeaderLevel, shortenPath } from './header-layout'

describe('resolveHeaderLevel', () => {
  it('shows everything at full width', () => {
    expect(resolveHeaderLevel(400, true)).toEqual({
      showFolderPath: true,
      showShellLabel: true,
      worktree: 'full',
    })
  })

  it('truncates the worktree name first as width shrinks', () => {
    const level = resolveHeaderLevel(300, true)
    expect(level.worktree).toBe('name-trunc')
    expect(level.showShellLabel).toBe(true)
    expect(level.showFolderPath).toBe(true)
  })

  it('drops worktree to icon before shedding the shell label', () => {
    const level = resolveHeaderLevel(240, true)
    expect(level.worktree).toBe('icon')
    expect(level.showShellLabel).toBe(true)
    expect(level.showFolderPath).toBe(true)
  })

  it('sheds the shell label before the folder path', () => {
    const level = resolveHeaderLevel(200, true)
    expect(level.showShellLabel).toBe(false)
    expect(level.showFolderPath).toBe(true)
  })

  it('sheds the folder path at the narrowest widths', () => {
    expect(resolveHeaderLevel(150, true).showFolderPath).toBe(false)
  })

  it('never shows a worktree chip when there is no worktree', () => {
    expect(resolveHeaderLevel(400, false).worktree).toBe('hidden')
    expect(resolveHeaderLevel(100, false).worktree).toBe('hidden')
  })
})

describe('shortenPath', () => {
  it('returns the trailing segment of a posix path', () => {
    expect(shortenPath('/home/duong/project')).toBe('project')
  })

  it('returns the trailing segment of a windows path', () => {
    expect(shortenPath('C:\\Project\\2026\\swarmterm')).toBe('swarmterm')
  })

  it('ignores a trailing separator', () => {
    expect(shortenPath('/home/duong/project/')).toBe('project')
  })

  it('returns the input when there is no separator', () => {
    expect(shortenPath('project')).toBe('project')
  })
})
