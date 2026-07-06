import { describe, expect, it } from 'vitest'
import { bumpBranch, planWorktreeBranches, provisionWorktrees } from '@/lib/worktree-naming'

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

describe('provisionWorktrees', () => {
  it('provisions in order, passing nulls through', async () => {
    const created: string[] = []
    const result = await provisionWorktrees(
      ['swarm/claude-code-1', null, 'swarm/codex-1'],
      async (b) => {
        created.push(b)
        return { path: `/wt/${b}`, branch: b }
      }
    )
    expect(created).toEqual(['swarm/claude-code-1', 'swarm/codex-1'])
    expect(result).toEqual([
      { path: '/wt/swarm/claude-code-1', branch: 'swarm/claude-code-1' },
      null,
      { path: '/wt/swarm/codex-1', branch: 'swarm/codex-1' }
    ])
  })

  it('bumps on "already exists" and succeeds', async () => {
    const attempts: string[] = []
    const result = await provisionWorktrees(['swarm/claude-code-1'], async (b) => {
      attempts.push(b)
      if (attempts.length === 1) throw new Error('worktree directory already exists: x')
      return { path: `/wt/${b}`, branch: b }
    })
    expect(attempts).toEqual(['swarm/claude-code-1', 'swarm/claude-code-1-2'])
    expect(result[0]?.branch).toBe('swarm/claude-code-1-2')
  })

  it('falls back to null on non-collision errors without throwing', async () => {
    const result = await provisionWorktrees(['swarm/claude-code-1', 'swarm/codex-1'], async (b) => {
      if (b.startsWith('swarm/claude-code')) throw new Error('disk on fire')
      return { path: `/wt/${b}`, branch: b }
    })
    expect(result).toEqual([null, { path: '/wt/swarm/codex-1', branch: 'swarm/codex-1' }])
  })

  it('gives up after 5 colliding attempts', async () => {
    let n = 0
    const result = await provisionWorktrees(['swarm/claude-code-1'], async () => {
      n++
      throw new Error('already exists')
    })
    expect(n).toBe(5)
    expect(result).toEqual([null])
  })
})
