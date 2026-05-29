import { Bot, Folder, Terminal as ShellIcon, Check, Columns2, Rows2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu'
import { TEMPLATES } from '@/lib/templates'
import { KNOWN_SHELLS, type ShellId } from '@/lib/terminal-pref'
import { cn } from '@/lib/utils'

interface PaneHeaderProps {
  /** Resolved agent id (leaf override already applied). */
  agentId: string
  /** Resolved shell id (leaf override already applied). */
  shellId: ShellId
  /** Resolved cwd, shown in the folder tooltip. */
  resolvedCwd: string
  /** Whether this pane has its own cwd override (enables "Use workspace folder"). */
  hasCwdOverride: boolean
  onAgentChange: (id: string) => void
  onShellChange: (id: ShellId) => void
  onChoosePath: () => void
  onResetPath: () => void
  onSplitRight: () => void
  onSplitDown: () => void
  onClose: () => void
}

/** The per-pane header: agent / path / shell dropdowns plus split & close. */
export function PaneHeader(props: PaneHeaderProps): React.ReactElement {
  const { agentId, shellId, resolvedCwd, hasCwdOverride } = props
  const agentLabel = TEMPLATES.find((t) => t.id === agentId)?.name ?? TEMPLATES[0].name
  const shellLabel = KNOWN_SHELLS.find((s) => s.id === shellId)?.label ?? KNOWN_SHELLS[0].label

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-b border-border bg-card px-1.5">
      <div className="flex items-center gap-0.5">
        {/* Agent */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" title={`Agent: ${agentLabel}`} aria-label={`Agent: ${agentLabel}`}>
              <Bot className="h-3.5 w-3.5 text-ring" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {TEMPLATES.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => props.onAgentChange(t.id)}>
                <Check aria-hidden="true" className={cn('h-3.5 w-3.5', t.id === agentId ? 'opacity-100' : 'opacity-0')} />
                <span>{t.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Path */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" title={`Folder: ${resolvedCwd}`} aria-label={`Folder: ${resolvedCwd}`}>
              <Folder className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={props.onChoosePath}>
              <Folder className="h-3.5 w-3.5" />
              <span>Choose folder…</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onResetPath} disabled={!hasCwdOverride}>
              <Check aria-hidden="true" className="h-3.5 w-3.5 opacity-0" />
              <span>Use workspace folder</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Shell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" title={`Shell: ${shellLabel}`} aria-label={`Shell: ${shellLabel}`}>
              <ShellIcon className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {KNOWN_SHELLS.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => props.onShellChange(s.id)}>
                <Check aria-hidden="true" className={cn('h-3.5 w-3.5', s.id === shellId ? 'opacity-100' : 'opacity-0')} />
                <span>{s.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" title="Split right" aria-label="Split right" onClick={props.onSplitRight}>
          <Columns2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Split down" aria-label="Split down" onClick={props.onSplitDown}>
          <Rows2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Close pane" aria-label="Close pane" onClick={props.onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
