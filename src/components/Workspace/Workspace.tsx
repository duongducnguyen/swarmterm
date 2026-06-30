import { useState, type ReactElement } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { findLeaf, type LayoutNode, type LeafNode } from '@/lib/layout-tree'
import { GuardedPointerSensor } from '@/lib/dnd-sensors'
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
  const swapPanes = useAppStore((s) => s.swapPanes)

  // The leaf currently being dragged (for the lifted overlay ghost), or null.
  const [draggingLeafId, setDraggingLeafId] = useState<string | null>(null)

  // 5px threshold (like the tab strip) so a plain click still focuses the pane;
  // GuardedPointerSensor ignores pointer-downs inside [data-no-dnd] controls.
  const sensors = useSensors(
    useSensor(GuardedPointerSensor, { activationConstraint: { distance: 5 } })
  )

  const draggingLeaf = draggingLeafId ? findLeaf(workspace.layout, draggingLeafId) : null

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setDraggingLeafId(String(e.active.id))}
      onDragEnd={(e: DragEndEvent) => {
        setDraggingLeafId(null)
        const { active, over } = e
        if (over && active.id !== over.id) {
          swapPanes(String(active.id), String(over.id))
        }
      }}
      onDragCancel={() => setDraggingLeafId(null)}
    >
      <div className="flex h-full w-full flex-col bg-canvas">
        <BroadcastBanner workspace={workspace} />
        <div className="min-h-0 flex-1 p-2">{renderNode(workspace.layout)}</div>
      </div>
      <DragOverlay>{draggingLeaf ? <PaneDragGhost leaf={draggingLeaf} /> : null}</DragOverlay>
    </DndContext>
  )
}

/** The lifted "ghost" shown under the cursor while a pane is dragged. */
function PaneDragGhost({ leaf }: { leaf: LeafNode }): ReactElement {
  const agent = templateById(leaf.agentId ?? DEFAULT_TEMPLATE_ID)
  return (
    <div className="flex h-7 items-center gap-1.5 rounded-md border border-ring bg-card px-2 text-sm text-foreground opacity-90 shadow-lg">
      <AgentIcon template={agent} className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{agent.name}</span>
    </div>
  )
}
