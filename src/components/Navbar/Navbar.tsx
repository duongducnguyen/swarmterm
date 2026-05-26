import { useEffect, useRef, useState, type ReactElement } from 'react'
import { MoreVertical, Pencil, Plus, Settings, X } from 'lucide-react'
import { collectLeaves } from '@/lib/layout-tree'
import { useAppStore, type Workspace } from '@/store/app-store'
import { useNavbarVisibilityStore } from '@/store/navbar-visibility-store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface NavbarProps {
  /** Open the setup wizard to create a new workspace. */
  onNewWorkspace: () => void
  /** Whether the Settings page is currently open. */
  settingsOpen: boolean
  /** Toggle the Settings page open/closed. */
  onToggleSettings: () => void
}

/** Left navigation rail: the workspace list — add / switch / rename / close.
 * Collapses to 0 width when the title bar's toggle button is off.
 */
export function Navbar({ onNewWorkspace, settingsOpen, onToggleSettings }: NavbarProps): ReactElement {
  const visible = useNavbarVisibilityStore((s) => s.visible)
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
  const renameWorkspace = useAppStore((s) => s.renameWorkspace)
  const closeWorkspace = useAppStore((s) => s.closeWorkspace)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  return (
    <nav
      aria-hidden={!visible}
      inert={!visible}
      style={{ width: visible ? 224 : 0 }}
      className="h-full shrink-0 overflow-hidden border-r border-border bg-card transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
    >
      <div className="flex h-full w-56 flex-col">
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workspaces
          </p>
          <ul className="space-y-0.5">
            {workspaces.map((ws) => (
              <WorkspaceItem
                key={ws.id}
                workspace={ws}
                active={ws.id === activeWorkspaceId}
                renaming={renamingId === ws.id}
                onSelect={() => setActiveWorkspace(ws.id)}
                onStartRename={() => setRenamingId(ws.id)}
                onCommitRename={(name) => {
                  renameWorkspace(ws.id, name)
                  setRenamingId(null)
                }}
                onCancelRename={() => setRenamingId(null)}
                onClose={() => closeWorkspace(ws.id)}
              />
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start text-muted-foreground"
            onClick={onNewWorkspace}
          >
            <Plus className="h-4 w-4" />
            New workspace
          </Button>
        </div>

        <div className="shrink-0 space-y-0.5 border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSettings}
            className={cn(
              'w-full justify-start',
              settingsOpen
                ? 'bg-accent text-accent-foreground hover:bg-accent'
                : 'text-muted-foreground'
            )}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>
    </nav>
  )
}

interface WorkspaceItemProps {
  workspace: Workspace
  active: boolean
  renaming: boolean
  onSelect: () => void
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onClose: () => void
}

function WorkspaceItem({
  workspace,
  active,
  renaming,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onClose
}: WorkspaceItemProps): ReactElement {
  const paneCount = collectLeaves(workspace.layout).length

  if (renaming) {
    return (
      <li>
        <RenameInput
          initialValue={workspace.name}
          onCommit={onCommitRename}
          onCancel={onCancelRename}
        />
      </li>
    )
  }

  return (
    <li>
      <div
        onClick={onSelect}
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm',
          active
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        )}
      >
        <span className="flex-1 truncate">{workspace.name}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{paneCount}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-background/80 group-hover:opacity-100 data-[state=open]:opacity-100"
              title="Workspace actions"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onStartRename}>
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onClose}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

interface RenameInputProps {
  initialValue: string
  onCommit: (name: string) => void
  onCancel: () => void
}

function RenameInput({ initialValue, onCommit, onCancel }: RenameInputProps): ReactElement {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef(false)

  // Defer focus past Radix's focus-restore so the input reliably wins.
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const finish = (commit: boolean): void => {
    if (doneRef.current) return
    doneRef.current = true
    if (commit) onCommit(value)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
      className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
    />
  )
}
