import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Plus, Sparkles, X } from 'lucide-react'
import { useAppStore, type Workspace } from '@/store/app-store'
import { cn } from '@/lib/utils'

interface WorkspaceTabsProps {
  /** Open the setup wizard to create a new workspace. */
  onNewWorkspace: () => void
}

/**
 * Workspace tab strip below the title bar. Switch / close / rename workspaces;
 * the trailing `+` opens the setup wizard. Stays in sync with the navbar list.
 */
export function WorkspaceTabs({ onNewWorkspace }: WorkspaceTabsProps): ReactElement {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
  const renameWorkspace = useAppStore((s) => s.renameWorkspace)
  const closeWorkspace = useAppStore((s) => s.closeWorkspace)
  const welcomeOpen = useAppStore((s) => s.welcomeOpen)
  const welcomeFocused = useAppStore((s) => s.welcomeFocused)
  const focusWelcome = useAppStore((s) => s.focusWelcome)
  const closeWelcome = useAppStore((s) => s.closeWelcome)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  return (
    <div className="flex h-12 shrink-0 items-stretch border-b border-border bg-card">
      <div className="flex items-stretch overflow-x-auto">
        {welcomeOpen && (
          <WelcomeTab
            active={welcomeFocused}
            closable={workspaces.length > 0}
            onSelect={focusWelcome}
            onClose={closeWelcome}
          />
        )}
        {workspaces.map((ws) => (
          <WorkspaceTab
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
      </div>
      <button
        type="button"
        title="New workspace"
        aria-label="New workspace"
        onClick={onNewWorkspace}
        className="flex w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

interface WelcomeTabProps {
  active: boolean
  closable: boolean
  onSelect: () => void
  onClose: () => void
}

/** The leading "Welcome" tab — selectable; closeable only when workspaces exist. */
function WelcomeTab({ active, closable, onSelect, onClose }: WelcomeTabProps): ReactElement {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex min-w-[130px] max-w-[200px] cursor-pointer items-center gap-2 border-r border-t-2 border-r-border px-3 text-sm transition-colors',
        active
          ? 'border-t-ring bg-canvas text-foreground'
          : 'border-t-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground'
      )}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">Welcome</span>
      {closable && (
        <button
          type="button"
          title="Close Welcome"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-background/80 group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

interface WorkspaceTabProps {
  workspace: Workspace
  active: boolean
  renaming: boolean
  onSelect: () => void
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onClose: () => void
}

function WorkspaceTab({
  workspace,
  active,
  renaming,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onClose
}: WorkspaceTabProps): ReactElement {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onStartRename}
      className={cn(
        'group flex min-w-[130px] max-w-[200px] cursor-pointer items-center gap-2 border-r border-t-2 border-r-border px-3 text-sm transition-colors',
        active
          ? 'border-t-ring bg-canvas text-foreground'
          : 'border-t-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground'
      )}
    >
      {renaming ? (
        <TabRenameInput
          initialValue={workspace.name}
          onCommit={onCommitRename}
          onCancel={onCancelRename}
        />
      ) : (
        <>
          <span className="flex-1 truncate" title="Double-click to rename">
            {workspace.name}
          </span>
          <button
            type="button"
            title="Close workspace"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-background/80 group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

interface TabRenameInputProps {
  initialValue: string
  onCommit: (name: string) => void
  onCancel: () => void
}

/** Inline text input for renaming a workspace tab. Enter commits, Esc cancels. */
function TabRenameInput({ initialValue, onCommit, onCancel }: TabRenameInputProps): ReactElement {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
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
      onClick={(e) => e.stopPropagation()}
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
      className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
    />
  )
}
