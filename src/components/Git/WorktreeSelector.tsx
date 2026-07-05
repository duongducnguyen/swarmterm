// src/components/Git/WorktreeSelector.tsx
import type { ReactElement } from 'react'
import { useGitStore } from '@/store/git-store'
import { AgentIcon } from '@/components/AgentIcon'
import { templateById } from '@/lib/templates'

/** Human-readable change badge: "clean" | "1 file" | "N files" | "" (still loading). */
function countLabel(count: number | undefined): string {
  if (count === undefined) return ''
  if (count === 0) return 'clean'
  if (count === 1) return '1 file'
  return `${count} files`
}

interface WorktreeSelectorProps {
  /** Branch -> agent id for panes currently bound to a worktree, keyed by branch name. */
  agentByBranch?: Record<string, string>
}

export function WorktreeSelector({ agentByBranch }: WorktreeSelectorProps): ReactElement {
  const worktrees = useGitStore((s) => s.worktrees)
  const selected = useGitStore((s) => s.selectedWorktreePath)
  const counts = useGitStore((s) => s.worktreeCounts)
  const selectWorktree = useGitStore((s) => s.selectWorktree)

  if (worktrees.length === 0) return <></>

  return (
    <div className="shrink-0 border-b border-border">
      <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Worktrees
      </div>
      {/* Cap to ~5 rows, then scroll — keeps the diff list visible with many worktrees. */}
      <div className="max-h-[150px] overflow-y-auto pb-1">
        {worktrees.map((wt) => {
          const isActive = wt.path === selected
          const count = counts.get(wt.path)
          const badge = countLabel(count)
          return (
            <button
              key={wt.path}
              title={wt.path}
              onClick={() => selectWorktree(wt.path)}
              className={[
                'flex w-full items-center gap-2 border-l-2 px-2 py-1 text-left text-xs transition-colors',
                isActive
                  ? 'border-[#4ec994] bg-[rgba(78,201,78,0.1)] text-[#b5efca]'
                  : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              ].join(' ')}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-[#4ec994]' : 'bg-muted-foreground/40'}`}
              />
              {agentByBranch?.[wt.branch] && (
                <AgentIcon template={templateById(agentByBranch[wt.branch])} className="h-3 w-3 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{wt.branch}</span>
              <span
                className={`shrink-0 text-[10px] tabular-nums ${
                  count && count > 0 ? 'text-[#4ec994]' : 'text-muted-foreground/60'
                }`}
              >
                {badge}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
