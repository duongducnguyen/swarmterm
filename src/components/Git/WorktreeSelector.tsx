// src/components/Git/WorktreeSelector.tsx
import type { ReactElement } from 'react'
import { useGitStore } from '@/store/git-store'

export function WorktreeSelector(): ReactElement {
  const worktrees = useGitStore((s) => s.worktrees)
  const selected = useGitStore((s) => s.selectedWorktreePath)
  const selectWorktree = useGitStore((s) => s.selectWorktree)

  if (worktrees.length === 0) return <></>

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-border px-2 py-1.5">
      {worktrees.map((wt) => {
        const isActive = wt.path === selected
        return (
          <button
            key={wt.path}
            title={wt.path}
            onClick={() => selectWorktree(wt.path)}
            className={[
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors',
              isActive
                ? 'border border-[#4ec994] bg-[rgba(78,201,78,0.12)] text-[#b5efca]'
                : 'bg-accent text-muted-foreground hover:bg-accent/80',
            ].join(' ')}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-[#4ec994]' : 'bg-muted-foreground/40'}`}
            />
            {wt.branch}
          </button>
        )
      })}
    </div>
  )
}
