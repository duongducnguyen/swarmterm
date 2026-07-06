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
