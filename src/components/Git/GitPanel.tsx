// src/components/Git/GitPanel.tsx
import { useEffect, type ReactElement } from 'react'
import { useAppStore, selectActiveWorkspace } from '@/store/app-store'
import { findLeaf } from '@/lib/layout-tree'
import { useGitStore } from '@/store/git-store'
import { WorktreeSelector } from './WorktreeSelector'
import { ChangedFileList } from './ChangedFileList'

export function GitPanel(): ReactElement {
  const loading = useGitStore((s) => s.loading)
  const error = useGitStore((s) => s.error)
  const commitInfo = useGitStore((s) => s.commitInfo)
  const fetchWorktrees = useGitStore((s) => s.fetchWorktrees)

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
      <WorktreeSelector />

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

      {!loading && !error && <ChangedFileList />}

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
