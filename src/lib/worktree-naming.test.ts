import { describe, expect, it } from 'vitest'
import {
  ADJECTIVES,
  NOUNS,
  bumpBranch,
  planWorktreeBranches,
  provisionWorktrees,
  randomWorktreeName
} from '@/lib/worktree-naming'

const FRIENDLY = /^swarm\/[a-z]+-[a-z]+$/

describe('randomWorktreeName', () => {
  it('formats as swarm/<adjective>-<noun>', () => {
    // rng always 0 → the first word of each list.
    expect(randomWorktreeName(() => 0)).toBe(`swarm/${ADJECTIVES[0]}-${NOUNS[0]}`)
  })

  it('stays in-bounds and on-pattern for any rng in [0,1]', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999, 1]) {
      expect(randomWorktreeName(() => r)).toMatch(FRIENDLY)
    }
  })

  it('draws from a large combination space', () => {
    expect(ADJECTIVES.length * NOUNS.length).toBeGreaterThan(10_000)
  })
})

describe('planWorktreeBranches', () => {
  it('gives each non-terminal pane a friendly swarm/ branch', () => {
    const plan = planWorktreeBranches(['claude-code', 'codex'])
    expect(plan).toHaveLength(2)
    for (const b of plan) expect(b).toMatch(FRIENDLY)
  })

  it('plain terminal panes get null (no worktree)', () => {
    const plan = planWorktreeBranches(['terminal', 'claude-code', 'terminal'])
    expect(plan[0]).toBeNull()
    expect(plan[2]).toBeNull()
    expect(plan[1]).toMatch(FRIENDLY)
  })

  it('names are unique within a batch', () => {
    const plan = planWorktreeBranches(Array<string>(30).fill('claude-code'))
    const names = plan.filter((b): b is string => b !== null)
    expect(names).toHaveLength(30)
    expect(new Set(names).size).toBe(30)
  })

  it('empty input yields empty plan', () => {
    expect(planWorktreeBranches([])).toEqual([])
  })
})

describe('bumpBranch', () => {
  it('appends a numeric suffix for collision retries', () => {
    expect(bumpBranch('swarm/brave-otter', 2)).toBe('swarm/brave-otter-2')
    expect(bumpBranch('swarm/quiet-harbor', 3)).toBe('swarm/quiet-harbor-3')
  })
})

describe('provisionWorktrees', () => {
  it('provisions in order, passing nulls through', async () => {
    const created: string[] = []
    const result = await provisionWorktrees(
      ['swarm/brave-otter', null, 'swarm/quiet-harbor'],
      async (b) => {
        created.push(b)
        return { path: `/wt/${b}`, branch: b }
      }
    )
    expect(created).toEqual(['swarm/brave-otter', 'swarm/quiet-harbor'])
    expect(result).toEqual([
      { path: '/wt/swarm/brave-otter', branch: 'swarm/brave-otter' },
      null,
      { path: '/wt/swarm/quiet-harbor', branch: 'swarm/quiet-harbor' }
    ])
  })

  it('bumps on "already exists" and succeeds', async () => {
    const attempts: string[] = []
    const result = await provisionWorktrees(['swarm/brave-otter'], async (b) => {
      attempts.push(b)
      if (attempts.length === 1) throw new Error('worktree directory already exists: x')
      return { path: `/wt/${b}`, branch: b }
    })
    expect(attempts).toEqual(['swarm/brave-otter', 'swarm/brave-otter-2'])
    expect(result[0]?.branch).toBe('swarm/brave-otter-2')
  })

  it('falls back to null on non-collision errors without throwing', async () => {
    const result = await provisionWorktrees(['swarm/brave-otter', 'swarm/quiet-harbor'], async (b) => {
      if (b.startsWith('swarm/brave')) throw new Error('disk on fire')
      return { path: `/wt/${b}`, branch: b }
    })
    expect(result).toEqual([null, { path: '/wt/swarm/quiet-harbor', branch: 'swarm/quiet-harbor' }])
  })

  it('gives up after 5 colliding attempts', async () => {
    let n = 0
    const result = await provisionWorktrees(['swarm/brave-otter'], async () => {
      n++
      throw new Error('already exists')
    })
    expect(n).toBe(5)
    expect(result).toEqual([null])
  })
})
