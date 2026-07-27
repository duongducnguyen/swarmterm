import type { ReactElement } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { LayoutNode, LeafNode } from '@/lib/layout-tree'
import { useAppStore, type Workspace as WorkspaceModel } from '@/store/app-store'
import { TerminalPane } from '@/components/TerminalPane/TerminalPane'
import { BroadcastBanner } from '@/components/Workspace/BroadcastBanner'
import { AgentIcon } from '@/components/AgentIcon'
import { templateById, DEFAULT_TEMPLATE_ID } from '@/lib/templates'
import { cn } from '@/lib/utils'

interface WorkspaceProps {
  workspace: WorkspaceModel
}

/** Render one workspace: its binary split-tree of resizable terminal panes. */
export function Workspace({ workspace }: WorkspaceProps): ReactElement {
  const resizeSplitNode = useAppStore((s) => s.resizeSplitNode)

  function renderNode(node: LayoutNode): ReactElement {
    if (node.type === 'leaf') {
      return (
        <TerminalPane
          key={node.id}
          leaf={node}
          cwd={workspace.cwd}
          isFocused={node.id === workspace.focusedLeafId}
          broadcastActive={workspace.broadcastActive}
          isBroadcastMember={
            workspace.broadcastActive && workspace.broadcastLeafIds.includes(node.id)
          }
          worktreeMode={workspace.worktreeMode}
        />
      )
    }

    const leftId = `${node.id}:a`
    const rightId = `${node.id}:b`
    return (
      <Group
        key={node.id}
        orientation={node.direction}
        className="h-full w-full"
        defaultLayout={{ [leftId]: node.sizes[0], [rightId]: node.sizes[1] }}
        onLayoutChanged={(layout) => {
          const a = layout[leftId]
          const b = layout[rightId]
          if (typeof a === 'number' && typeof b === 'number') {
            resizeSplitNode(node.id, [a, b])
          }
        }}
      >
        <Panel id={leftId} minSize="8%" className="h-full w-full overflow-hidden">
          {renderNode(node.children[0])}
        </Panel>
        <Separator
          className={cn(
            'shrink-0 bg-canvas transition-colors hover:bg-ring data-[separator]:bg-canvas',
            node.direction === 'horizontal' ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'
          )}
        />
        <Panel id={rightId} minSize="8%" className="h-full w-full overflow-hidden">
          {renderNode(node.children[1])}
        </Panel>
      </Group>
    )
  }

  // data-focus-return: dragging a split separator (or clicking the gap
  // between panes) leaves DOM focus on chrome; App.tsx hands the keyboard
  // back to the focused terminal — see lib/terminal-focus.ts.
  return (
    <div data-focus-return className="flex h-full w-full flex-col bg-canvas">
      <BroadcastBanner workspace={workspace} />
      <div className="min-h-0 flex-1 p-2">{renderNode(workspace.layout)}</div>
    </div>
  )
}

/**
 * The lifted "ghost" shown under the cursor while a pane is dragged. The
 * DragOverlay sizes it to the dragged pane, so it fills h/w to read as the whole
 * pane moving. The body is a static placeholder — a live xterm instance can't be
 * cloned into the overlay.
 */
export function PaneDragGhost({ leaf }: { leaf: LeafNode }): ReactElement {
  const agent = templateById(leaf.agentId ?? DEFAULT_TEMPLATE_ID)
  return (
    <div className="flex h-full w-full cursor-grabbing flex-col overflow-hidden rounded-md border border-ring bg-background opacity-80 shadow-2xl">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 text-sm text-foreground">
        <AgentIcon template={agent} className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{agent.name}</span>
      </div>
      <div className="flex-1 bg-background" />
    </div>
  )
}
