// The one expressive element is the member identity color (avatar ring →
// name → header), derived from terminalId so it survives renames and
// re-joins; everything else stays in the app's VS Code palette.
import { type ReactElement } from 'react'
import { useAppStore } from '@/store/app-store'
import { focusTerminal } from '@/lib/terminal-registry'
import { templateById, DEFAULT_TEMPLATE_ID } from '@/lib/templates'
import { memberColor } from '@/lib/war-room-identity'
import { AgentIcon } from '@/components/AgentIcon'
import { cn } from '@/lib/utils'

/** Jump to the member's pane: activate its workspace, focus its terminal. */
export function jumpToTerminal(terminalId: string): void {
  useAppStore.getState().revealTerminal(terminalId)
  focusTerminal(terminalId)
}

export function Avatar({
  terminalId,
  agentId,
  size = 'md',
  onClick
}: {
  terminalId: string
  agentId: string | null
  size?: 'sm' | 'md'
  onClick?: () => void
}): ReactElement {
  const template = templateById(agentId ?? DEFAULT_TEMPLATE_ID)
  const color = memberColor(terminalId)
  return (
    <button
      data-no-dnd
      tabIndex={-1}
      onClick={onClick}
      title="Go to this terminal"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'md' ? 'h-6 w-6' : 'h-4 w-4',
        onClick && 'cursor-pointer'
      )}
      style={{ backgroundColor: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}` }}
    >
      <AgentIcon template={template} className={size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'} />
    </button>
  )
}
