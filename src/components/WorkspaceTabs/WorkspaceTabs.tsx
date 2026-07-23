import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Plus, Sparkles, X } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GuardedPointerSensor } from '@/lib/dnd-sensors'
import { useAppStore, type Workspace } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { collectLeaves } from '@/lib/layout-tree'
import { anyLeafActive } from '@/lib/activity-selectors'
import { useTerminalActivityStore } from '@/store/terminal-activity-store'
import { ActivityDot } from '@/components/ActivityDot'

interface WorkspaceTabsProps {
  /** Open the setup wizard to create a new workspace. */
  onNewWorkspace: () => void
}

/** Shared tab box styling — used by the live tabs and the drag overlay. */
const TAB_BASE =
  'group flex min-w-[130px] max-w-[200px] items-center gap-2 border-r border-t-2 border-r-border px-3 text-sm transition-colors'

function tabStateClass(active: boolean): string {
  return active
    ? 'border-t-ring bg-canvas text-foreground'
    : 'border-t-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground'
}

/**
 * Workspace tab strip below the title bar. Switch / close / rename / reorder
 * workspaces; the trailing `+` opens the setup wizard. Drag a tab to reorder;
 * the Welcome tab stays pinned first. Stays in sync with the navbar list.
 */
export function WorkspaceTabs({ onNewWorkspace }: WorkspaceTabsProps): ReactElement {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
  const renameWorkspace = useAppStore((s) => s.renameWorkspace)
  const closeWorkspace = useAppStore((s) => s.closeWorkspace)
  const moveWorkspace = useAppStore((s) => s.moveWorkspace)
  const welcomeOpen = useAppStore((s) => s.welcomeOpen)
  const welcomeFocused = useAppStore((s) => s.welcomeFocused)
  const focusWelcome = useAppStore((s) => s.focusWelcome)
  const closeWelcome = useAppStore((s) => s.closeWelcome)
  const activity = useTerminalActivityStore((s) => s.active)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(GuardedPointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const draggingWorkspace = workspaces.find((w) => w.id === draggingId) ?? null

  function handleDragStart(event: DragStartEvent): void {
    setDraggingId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent): void {
    setDraggingId(null)
    const { active, over } = event
    if (over && active.id !== over.id) {
      moveWorkspace(String(active.id), String(over.id))
    }
  }

  return (
    // data-focus-return: clicking a tab must not leave the keyboard stranded on
    // chrome — App.tsx hands it back to the active terminal (lib/terminal-focus.ts).
    <div
      data-focus-return
      className="flex h-12 shrink-0 items-stretch border-b border-border bg-card"
    >
      <div className="flex items-stretch overflow-x-auto">
        {welcomeOpen && (
          <WelcomeTab
            active={welcomeFocused}
            closable={workspaces.length > 0}
            onSelect={focusWelcome}
            onClose={closeWelcome}
          />
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingId(null)}
        >
          <SortableContext
            items={workspaces.map((w) => w.id)}
            strategy={horizontalListSortingStrategy}
          >
            {workspaces.map((ws) => {
              const isActive = !welcomeFocused && ws.id === activeWorkspaceId
              const showActivity =
                !isActive &&
                anyLeafActive(collectLeaves(ws.layout).map((l) => l.terminalId), activity)
              return (
                <SortableWorkspaceTab
                  key={ws.id}
                  workspace={ws}
                  active={isActive}
                  showActivity={showActivity}
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
              )
            })}
          </SortableContext>
          <DragOverlay>
            {draggingWorkspace ? (
              <div
                aria-hidden
                className={cn(
                  TAB_BASE,
                  tabStateClass(draggingWorkspace.id === activeWorkspaceId),
                  'h-12 cursor-grabbing bg-canvas shadow-lg'
                )}
              >
                <span className="flex-1 truncate">{draggingWorkspace.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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

/** The leading "Welcome" tab — pinned first, not draggable; closeable only when workspaces exist. */
function WelcomeTab({ active, closable, onSelect, onClose }: WelcomeTabProps): ReactElement {
  return (
    <div
      onClick={onSelect}
      className={cn(TAB_BASE, 'cursor-pointer', tabStateClass(active))}
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
  showActivity: boolean
  renaming: boolean
  onSelect: () => void
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onClose: () => void
}

/** A draggable, sortable workspace tab. Click selects, double-click renames, X closes. */
function SortableWorkspaceTab({
  workspace,
  active,
  showActivity,
  renaming,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onClose
}: WorkspaceTabProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id,
    disabled: renaming
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(renaming ? {} : attributes)}
      {...(renaming ? {} : listeners)}
      // dnd-kit stamps tabIndex 0 on its drag nodes. A workspace tab has no
      // keyboard action, so leaving it in the tab order only lets a Tab meant
      // for the shell park the focus ring here (see lib/terminal-focus.ts).
      tabIndex={-1}
      onClick={onSelect}
      onDoubleClick={onStartRename}
      className={cn(TAB_BASE, 'cursor-pointer', tabStateClass(active), isDragging && 'opacity-40')}
    >
      {renaming ? (
        <TabRenameInput
          initialValue={workspace.name}
          onCommit={onCommitRename}
          onCancel={onCancelRename}
        />
      ) : (
        <>
          {showActivity && <ActivityDot />}
          <span className="flex-1 truncate" title="Double-click to rename">
            {workspace.name}
          </span>
          <button
            data-no-dnd
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
