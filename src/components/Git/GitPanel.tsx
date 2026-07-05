// src/components/Git/GitPanel.tsx
import { useEffect, useMemo, type ReactElement } from 'react'
import { useAppStore, selectActiveWorkspace } from '@/store/app-store'
import { collectLeaves, findLeaf } from '@/lib/layout-tree'
import { useGitStore } from '@/store/git-store'
import { WorktreeSelector } from './WorktreeSelector'
import { ChangedFileList } from './ChangedFileList'

export function GitPanel(): ReactElement {
  const loading = useGitStore((s) => s.loading)
  const error = useGitStore((s) => s.error)
  const worktrees = useGitStore((s) => s.worktrees)
  const currentCwd = useGitStore((s) => s.currentCwd)
  const commitInfo = useGitStore((s) => s.commitInfo)
  const fetchWorktrees = useGitStore((s) => s.fetchWorktrees)

  // Branch -> agent id for the panes currently bound to a worktree, so the
  // selector can show which agent owns each worktree. Computed with useMemo
  // over the raw `workspaces` array (not a store selector) — a selector that
  // builds a fresh object every call would re-render this component forever.
  const workspaces = useAppStore((s) => s.workspaces)
  const agentByBranch = useMemo(() => {
    const map: Record<string, string> = {}
    for (const w of workspaces)
      for (const l of collectLeaves(w.layout))
        if (l.worktreeBranch && l.agentId) map[l.worktreeBranch] = l.agentId
    return map
  }, [workspaces])

  // Subscribe to the focused terminal's CWD and re-fetch when it changes.
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state) => {
      const ws = selectActiveWorkspace(state)
      if (!ws) return
      const leaf = findLeaf(ws.layout, ws.focusedLeafId)
      const cwd = leaf?.cwd ?? ws.cwd
      if (!cwd) return
      if (cwd !== useGitStore.getState().currentCwd) {
        void fetchWorktrees(cwd)
      }
    })
    // Initial fetch on mount.
    const ws = selectActiveWorkspace(useAppStore.getState())
    if (ws) {
      const leaf = findLeaf(ws.layout, ws.focusedLeafId)
      const cwd = leaf?.cwd ?? ws.cwd
      if (cwd) void fetchWorktrees(cwd)
    }
    return unsubscribe
  }, [fetchWorktrees])

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <WorktreeSelector agentByBranch={agentByBranch} />

      {loading && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-xs text-muted-foreground">
          {error}
        </div>
      )}

      {/* `currentCwd` is empty only before the first fetch — gate on it so the
          panel doesn't flash "Not a git repository" for one frame on mount
          (initial state is loading:false, worktrees:[]) before the effect runs. */}
      {!loading && !error && currentCwd !== '' && worktrees.length === 0 && (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-xs text-muted-foreground">
          Not a git repository
        </div>
      )}

      {!loading && !error && worktrees.length > 0 && <ChangedFileList />}

      {commitInfo && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
          {commitInfo.ahead != null && (
            <span>
              <span className="text-[#4ec994]">↑{commitInfo.ahead}</span>
              {' · '}
              <span>↓{commitInfo.behind ?? 0}</span>
            </span>
          )}
          {commitInfo.headSha && (
            <span className="ml-auto font-mono">HEAD: {commitInfo.headSha}</span>
          )}
        </div>
      )}
    </div>
  )
}
