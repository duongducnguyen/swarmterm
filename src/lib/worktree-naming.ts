/**
 * Branch planning for deterministic worktree-per-pane (v2 spec).
 * Names are system-templated (swarm/<agent>-<n>) rather than hash-derived —
 * truncated-hash schemes have caused silent stale-worktree reuse upstream
 * (Claude Code #51596). Agents may rename their branch to match their task
 * later (git branch -m); the directory never moves.
 */
import { DEFAULT_TEMPLATE_ID } from '@/lib/templates'

/** One branch name per pane, in pane order; null for plain terminal panes. */
export function planWorktreeBranches(agentIds: string[]): (string | null)[] {
  const counts: Record<string, number> = {}
  return agentIds.map((id) => {
    if (id === DEFAULT_TEMPLATE_ID) return null
    counts[id] = (counts[id] ?? 0) + 1
    return `swarm/${id}-${counts[id]}`
  })
}

/** Collision retry name: swarm/claude-code-1 -> swarm/claude-code-1-2. */
export function bumpBranch(branch: string, attempt: number): string {
  return `${branch}-${attempt}`
}

/** Result of provisioning one pane's worktree; null = pane falls back to repo root. */
export type ProvisionedWorktree = { path: string; branch: string } | null

/**
 * Serially provision one worktree per planned branch. Serial on purpose:
 * concurrent `git worktree add` on one repo contends on git's internal
 * lock files, and a transient lock failure would burn a pane's isolation.
 * Retries with a numeric bump ONLY on "already exists" (up to 5 names);
 * any other error falls back to null — provisioning must never throw.
 */
export async function provisionWorktrees(
  plan: (string | null)[],
  create: (branch: string) => Promise<{ path: string; branch: string }>
): Promise<ProvisionedWorktree[]> {
  const results: ProvisionedWorktree[] = []
  for (const branch of plan) {
    if (branch === null) {
      results.push(null)
      continue
    }
    let provisioned: ProvisionedWorktree = null
    for (let attempt = 1; attempt <= 5; attempt++) {
      const name = attempt === 1 ? branch : bumpBranch(branch, attempt)
      try {
        provisioned = await create(name)
        break
      } catch (e) {
        if (attempt === 5 || !String(e).includes('already exists')) {
          console.warn(`worktree for ${branch} failed, pane falls back to repo root:`, e)
          break
        }
      }
    }
    results.push(provisioned)
  }
  return results
}
