import type { ReactElement } from 'react'
import { Radio } from 'lucide-react'
import { useAppStore, type Workspace as WorkspaceModel } from '@/store/app-store'

interface BroadcastBannerProps {
  workspace: WorkspaceModel
}

/**
 * A slim, always-visible bar shown while broadcast is armed. Broadcasting to
 * many shells at once is powerful, so the active state must be obvious and
 * easy to leave (Select All / Clear / Exit, plus the Esc hint).
 */
export function BroadcastBanner({ workspace }: BroadcastBannerProps): ReactElement | null {
  const selectAll = useAppStore((s) => s.selectAllBroadcast)
  const clear = useAppStore((s) => s.clearBroadcast)
  const toggle = useAppStore((s) => s.toggleBroadcast)

  if (!workspace.broadcastActive) return null
  const count = workspace.broadcastLeafIds.length

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-b border-broadcast/40 bg-broadcast/10 px-3 text-xs text-broadcast">
      <span className="flex items-center gap-1.5 font-medium">
        <Radio className="h-3.5 w-3.5" />
        Broadcast ON · {count} {count === 1 ? 'pane' : 'panes'}
      </span>
      <button type="button" onClick={selectAll} className="rounded px-1.5 py-0.5 hover:bg-broadcast/20">
        Select all
      </button>
      <button type="button" onClick={clear} className="rounded px-1.5 py-0.5 hover:bg-broadcast/20">
        Clear
      </button>
      <span className="ml-auto text-muted-foreground">Alt+Click panes to toggle</span>
      <button
        type="button"
        onClick={toggle}
        className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Exit (Esc)
      </button>
    </div>
  )
}
