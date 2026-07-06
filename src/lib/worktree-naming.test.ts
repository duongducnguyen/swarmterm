import { describe, expect, it } from 'vitest'
import { bumpBranch, planWorktreeBranches } from '@/lib/worktree-naming'

describe('planWorktreeBranches', () => {
  it('numbers each agent type independently, 1-based', () => {
    expect(
      planWorktreeBranches(['claude-code', 'claude-code', 'codex', 'claude-code'])
    ).toEqual([
      'swarm/claude-code-1',
      'swarm/claude-code-2',
      'swarm/codex-1',
      'swarm/claude-code-3'
    ])
  })

  it('plain terminal panes get null (no worktree)', () => {
    expect(planWorktreeBranches(['terminal', 'claude-code', 'terminal'])).toEqual([
      null,
      'swarm/claude-code-1',
      null
    ])
  })

  it('empty input yields empty plan', () => {
    expect(planWorktreeBranches([])).toEqual([])
  })
})

describe('bumpBranch', () => {
  it('appends a numeric suffix for collision retries', () => {
    expect(bumpBranch('swarm/claude-code-1', 2)).toBe('swarm/claude-code-1-2')
    expect(bumpBranch('swarm/codex-1', 3)).toBe('swarm/codex-1-3')
  })
})
