import type { ReactElement } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { LayoutNode } from '@/lib/layout-tree'
import { useAppStore, type Workspace as WorkspaceModel } from '@/store/app-store'
import { TerminalPane } from '@/components/TerminalPane/TerminalPane'
import { BroadcastBanner } from '@/components/Workspace/BroadcastBanner'
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
    <div className="flex h-full w-full flex-col bg-canvas">
      <BroadcastBanner workspace={workspace} />
      <div className="min-h-0 flex-1 p-2">{renderNode(workspace.layout)}</div>
    </div>
  )
}
