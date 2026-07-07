import type { ChangedFile } from '@/tauri/git'

/**
 * Files swarmterm itself writes into every worktree — never user work, so they
 * must not count as "uncommitted changes" when deciding whether a worktree is
 * safe to clear. Without this, `git`'s own dirty-check refuses to remove even an
 * empty throwaway worktree (the whole reason stale worktrees piled up).
 */
export const GENERATED_WORKTREE_FILES: readonly string[] = ['.mcp.json']

function basename(path: string): string {
  const parts = path.split(/[/\\]+/)
  return parts[parts.length - 1] ?? path
}

/**
 * Classify a worktree for the clear dialog. "Dirty" (has unsaved work) means
 * real uncommitted files — ignoring generated files — OR commits ahead of the
 * main branch. Both must be surfaced so the user never loses work silently.
 */
export function classifyWorktree(
  changed: ChangedFile[],
  ahead: number | null
): { uncommittedCount: number; unmergedCount: number; dirty: boolean } {
  const uncommittedCount = changed.filter(
    (c) => !GENERATED_WORKTREE_FILES.includes(basename(c.path))
  ).length
  const unmergedCount = ahead ?? 0
  return { uncommittedCount, unmergedCount, dirty: uncommittedCount > 0 || unmergedCount > 0 }
}

/**
 * Whether a `git worktree remove` failure is the transient Windows lock (the
 * pane's pty is still cwd'd inside the worktree, releasing as it relocates) —
 * worth a brief retry — versus a genuine git refusal, which should fail fast.
 */
export function isTransientLock(message: string): boolean {
  return /permission denied|not empty|locked|unable to|not a working tree|validation failed/i.test(message)
}

/** Context-menu label; plural with a count when clearing a broadcast group. */
export function clearWorktreeMenuLabel(count: number): string {
  return count > 1 ? `Clear ${count} worktrees` : 'Clear worktree'
}
