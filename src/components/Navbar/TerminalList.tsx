import type { ReactElement } from 'react'
import { collectLeaves } from '@/lib/layout-tree'
import { templateById, DEFAULT_TEMPLATE_ID } from '@/lib/templates'
import { resolvePaneTitle } from '@/lib/pane-title'
import { useAppStore } from '@/store/app-store'
import { useTerminalTitleStore } from '@/store/terminal-title-store'
import { AgentIcon } from '@/components/AgentIcon'
import { cn } from '@/lib/utils'

/**
 * The TERMINALS section of the left rail: one row per pane of the *active*
 * workspace, by agent icon + title. Clicking a row focuses that pane — it reuses
 * `setFocusedLeaf`, which both highlights the pane and (via TerminalPane's
 * `isFocused` effect) pulls keyboard focus into its xterm. Hidden on the Welcome
 * screen, since it mirrors the foreground workspace and there is none there.
 */
export function TerminalList(): ReactElement | null {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const welcomeFocused = useAppStore((s) => s.welcomeFocused)
  const setFocusedLeaf = useAppStore((s) => s.setFocusedLeaf)
  const titles = useTerminalTitleStore((s) => s.titles)

  const active = workspaces.find((w) => w.id === activeWorkspaceId)
  // Nothing to mirror while the Welcome tab is foreground or before any
  // workspace exists.
  if (welcomeFocused || !active) return null

  const leaves = collectLeaves(active.layout)

  return (
    <div className="shrink-0 overflow-hidden border-t border-border">
      <div className="flex max-h-56 flex-col overflow-y-auto p-2">
        <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Terminals
        </p>
        <ul className="space-y-0.5">
          {leaves.map((leaf) => {
            const agentId = leaf.agentId ?? DEFAULT_TEMPLATE_ID
            const template = templateById(agentId)
            const title = resolvePaneTitle(agentId, titles[leaf.terminalId])
            const focused = leaf.id === active.focusedLeafId
            return (
              <li key={leaf.id}>
                <div
                  onClick={() => setFocusedLeaf(leaf.id)}
                  title={title}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm',
                    focused
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <AgentIcon template={template} className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{title}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
