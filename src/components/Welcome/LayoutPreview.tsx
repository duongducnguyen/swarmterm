import { type ReactElement } from 'react'
import { paneLayoutFor, type LayoutNode } from '@/lib/layout-tree'
import { templateById } from '@/lib/templates'
import { AgentIcon } from '@/components/AgentIcon'
import { cn } from '@/lib/utils'

interface LayoutPreviewProps {
  /** Number of terminal panes; drives the layout tree shape. */
  terminalCount: number
  /** Agent id per pane, in build order (row-major). Length must equal terminalCount. */
  agents: string[]
}

/**
 * A miniature of the workspace being composed: the real layout tree (via
 * `paneLayoutFor`) rendered as nested flex boxes. Each leaf shows the assigned
 * agent's icon centered in the cell. Non-interactive — agent assignment is
 * controlled by the quantity steppers in Welcome, not by clicking panes.
 * What you see is exactly what `createWorkspace` builds.
 */
export function LayoutPreview({ terminalCount, agents }: LayoutPreviewProps): ReactElement {
  // Build the same tree createWorkspace will, stamping each leaf with its
  // agent id so we can paint the matching icon. leafIndex is closed over by
  // makeLeaf and incremented row-major, matching agentIds order exactly.
  let leafIndex = 0
  let splitN = 0
  const tree = paneLayoutFor(
    terminalCount,
    () => {
      const i = leafIndex++
      return { type: 'leaf', id: `p${i}`, terminalId: `p${i}`, agentId: agents[i] }
    },
    () => `s${splitN++}`
  )

  return (
    <div className="h-full w-full min-h-0 overflow-hidden rounded-lg border border-border bg-background p-1">
      <PreviewNode node={tree} />
    </div>
  )
}

interface PreviewNodeProps {
  node: LayoutNode
}

/** Recursively render a layout node: a leaf as an icon cell, a split as a
 *  flex row/column sized by the split's proportions. */
function PreviewNode({ node }: PreviewNodeProps): ReactElement {
  if (node.type === 'leaf') {
    const t = templateById(node.agentId ?? 'terminal')

    return (
      <div className="flex h-full w-full items-center justify-center rounded-[3px] bg-accent/40">
        <AgentIcon template={t} className="h-4 w-4" />
      </div>
    )
  }

  const [a, b] = node.children
  const isRow = node.direction === 'horizontal'
  return (
    <div className={cn('flex h-full w-full gap-1', isRow ? 'flex-row' : 'flex-col')}>
      <div style={{ flexGrow: node.sizes[0] }} className="min-h-0 min-w-0">
        <PreviewNode node={a} />
      </div>
      <div style={{ flexGrow: node.sizes[1] }} className="min-h-0 min-w-0">
        <PreviewNode node={b} />
      </div>
    </div>
  )
}
