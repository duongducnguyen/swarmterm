import { create, type StateCreator } from 'zustand'
import {
  paneLayoutFor,
  collectLeaves,
  closeLeaf,
  findLeaf,
  resizeSplit,
  splitLeaf,
  reorderLeaves,
  updateLeaf,
  type Direction,
  type LayoutNode,
  type LeafNode
} from '@/lib/layout-tree'
import type { ShellId } from '@/lib/terminal-pref'
import { DEFAULT_TEMPLATE_ID } from '@/lib/templates'

/** A workspace: a named binary split-tree of terminal panes. */
export interface Workspace {
  id: string
  name: string
  /** Working directory every terminal in this workspace starts from. */
  cwd: string
  layout: LayoutNode
  focusedLeafId: string
  /** Whether broadcast (keystroke fan-out) is armed for this workspace. */
  broadcastActive: boolean
  /** Leaf ids that receive broadcast keystrokes while `broadcastActive`. */
  broadcastLeafIds: string[]
  /** Enable MCP worktree tools for every terminal in this workspace. */
  worktreeMode: boolean
}

/** What the setup wizard collects to build a new workspace. */
export interface CreateWorkspaceConfig {
  cwd: string
  /** Number of terminal panes; must be a value from TERMINAL_COUNTS. */
  terminalCount: number
  /** One agent id per pane, in build order. Short arrays are padded with
   *  DEFAULT_TEMPLATE_ID so `agentIds.length` need not equal `terminalCount`,
   *  but the caller should keep them in sync. */
  agentIds: string[]
  /** Enable MCP worktree tools for every terminal in this workspace. */
  worktreeMode?: boolean
  /** Per-pane worktree assignment, index-aligned with agentIds; null = pane
   *  stays at the workspace cwd. Created by the composer BEFORE the store is
   *  touched, so leaves are born with their isolation — no post-hoc rebinding. */
  paneWorktrees?: ({ path: string; branch: string } | null)[]
}

export interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string
  /** Monotonic counter used to name new workspaces "Workspace N". */
  nextWorkspaceNumber: number
  /** Whether the Welcome tab exists in the tab strip. */
  welcomeOpen: boolean
  /** Whether the Welcome tab (vs the active workspace) is the foreground view. */
  welcomeFocused: boolean
  /** Draft working folder shown in the Welcome form (shared with the title-bar search). */
  welcomeFolder: string
}

export interface AppActions {
  createWorkspace: (config: CreateWorkspaceConfig) => void
  setWelcomeFolder: (path: string) => void
  openWelcome: () => void
  focusWelcome: () => void
  closeWelcome: () => void
  setActiveWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
  closeWorkspace: (id: string) => void
  moveWorkspace: (fromId: string, toId: string) => void
  setFocusedLeaf: (leafId: string) => void
  splitPane: (leafId: string, direction: Direction) => void
  closePane: (leafId: string) => void
  reorderPane: (fromLeafId: string, toLeafId: string) => void
  resizeSplitNode: (splitId: string, sizes: [number, number]) => void
  setPaneAgent: (leafId: string, agentId: string) => void
  setPaneCwd: (leafId: string, cwd: string | undefined) => void
  setPaneShell: (leafId: string, shellId: ShellId) => void
  spawnWorktreePane: (p: {
    requesterTerminalId: string
    path: string
    branch: string
    agentId?: string
    prompt: string
  }) => void
  clearWorktreeBinding: (path: string) => void
  toggleBroadcast: () => void
  toggleBroadcastMember: (leafId: string) => void
  selectAllBroadcast: () => void
  clearBroadcast: () => void
}

export type AppStore = AppState & AppActions

// --- pure helpers ---------------------------------------------------------

function uid(): string {
  return crypto.randomUUID()
}

/** Return `list` with the item at index `from` moved to index `to`. */
function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** A plain-shell leaf — no template command. Used when splitting a pane. */
function makeLeaf(): LeafNode {
  return { type: 'leaf', id: uid(), terminalId: uid() }
}

/** Return the active workspace, or `undefined` if it cannot be resolved. */
export function selectActiveWorkspace(state: AppState): Workspace | undefined {
  return state.workspaces.find((w) => w.id === state.activeWorkspaceId)
}

/** The workspace whose layout owns `terminalId`, or `undefined` if none. */
export function selectWorkspaceByTerminalId(
  state: AppState,
  terminalId: string
): Workspace | undefined {
  return state.workspaces.find((w) =>
    collectLeaves(w.layout).some((l) => l.terminalId === terminalId)
  )
}

/** Map the active workspace through `fn`, leaving the others untouched. */
function mapActive(state: AppState, fn: (w: Workspace) => Workspace): Pick<AppState, 'workspaces'> {
  return {
    workspaces: state.workspaces.map((w) => (w.id === state.activeWorkspaceId ? fn(w) : w))
  }
}

// --- store ----------------------------------------------------------------

export const appStoreCreator: StateCreator<AppStore> = (set, get) => ({
  workspaces: [],
  activeWorkspaceId: '',
  nextWorkspaceNumber: 1,
  welcomeOpen: true,
  welcomeFocused: true,
  welcomeFolder: '',

  createWorkspace: (config) =>
    set((s) => {
      // Pane count = squad size (one agent id per pane); paneLayoutFor derives
      // the grid/split shape. makeWizardLeaf is called row-major, matching the
      // agentIds order. The ?? fallback is defensive — agentIds.length panes
      // always have a matching id.
      let paneIndex = 0
      const makeWizardLeaf = (): LeafNode => {
        const i = paneIndex++
        const wt = config.paneWorktrees?.[i] ?? null
        return {
          type: 'leaf',
          id: uid(),
          terminalId: uid(),
          agentId: config.agentIds[i] ?? DEFAULT_TEMPLATE_ID,
          ...(wt ? { cwd: wt.path, worktreeBranch: wt.branch } : {})
        }
      }
      const layout = paneLayoutFor(config.terminalCount, makeWizardLeaf, uid)
      const ws: Workspace = {
        id: uid(),
        name: `Workspace ${s.nextWorkspaceNumber}`,
        cwd: config.cwd,
        layout,
        focusedLeafId: collectLeaves(layout)[0].id,
        broadcastActive: false,
        broadcastLeafIds: [],
        worktreeMode: config.worktreeMode ?? false
      }
      return {
        workspaces: [...s.workspaces, ws],
        activeWorkspaceId: ws.id,
        nextWorkspaceNumber: s.nextWorkspaceNumber + 1,
        welcomeOpen: false,
        welcomeFocused: false
      }
    }),

  setWelcomeFolder: (path) => set({ welcomeFolder: path }),

  openWelcome: () => set({ welcomeOpen: true, welcomeFocused: true }),

  focusWelcome: () => set({ welcomeFocused: true }),

  closeWelcome: () => set({ welcomeOpen: false, welcomeFocused: false }),

  setActiveWorkspace: (id) =>
    set((s) =>
      s.workspaces.some((w) => w.id === id)
        ? { activeWorkspaceId: id, welcomeFocused: false }
        : {}
    ),

  renameWorkspace: (id, name) =>
    set((s) => {
      const trimmed = name.trim()
      if (trimmed === '') return {}
      return {
        workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w))
      }
    }),

  closeWorkspace: (id) =>
    set((s) => {
      const index = s.workspaces.findIndex((w) => w.id === id)
      if (index === -1) return {}
      const remaining = s.workspaces.filter((w) => w.id !== id)
      // Closing the last workspace leaves none — the app reopens the setup wizard.
      if (remaining.length === 0) {
        return { workspaces: [], activeWorkspaceId: '', welcomeOpen: true, welcomeFocused: true }
      }
      let activeWorkspaceId = s.activeWorkspaceId
      if (id === s.activeWorkspaceId) {
        activeWorkspaceId = remaining[Math.min(index, remaining.length - 1)].id
      }
      return { workspaces: remaining, activeWorkspaceId }
    }),

  moveWorkspace: (fromId, toId) =>
    set((s) => {
      if (fromId === toId) return {}
      const from = s.workspaces.findIndex((w) => w.id === fromId)
      const to = s.workspaces.findIndex((w) => w.id === toId)
      if (from === -1 || to === -1) return {}
      return { workspaces: arrayMove(s.workspaces, from, to) }
    }),

  setFocusedLeaf: (leafId) =>
    set((s) =>
      mapActive(s, (w) => (findLeaf(w.layout, leafId) ? { ...w, focusedLeafId: leafId } : w))
    ),

  splitPane: (leafId, direction) =>
    set((s) =>
      mapActive(s, (w) => {
        if (!findLeaf(w.layout, leafId)) return w
        const newLeaf = makeLeaf()
        return {
          ...w,
          layout: splitLeaf(w.layout, leafId, direction, newLeaf, uid()),
          focusedLeafId: newLeaf.id
        }
      })
    ),

  closePane: (leafId) => {
    const active = selectActiveWorkspace(get())
    if (!active) return
    const layout = closeLeaf(active.layout, leafId)
    // Closing the last pane of a workspace closes the workspace itself.
    if (layout === null) {
      get().closeWorkspace(active.id)
      return
    }
    set((s) =>
      mapActive(s, (w) => {
        const leaves = collectLeaves(layout)
        const ids = new Set(leaves.map((l) => l.id))
        const focusedLeafId = ids.has(w.focusedLeafId) ? w.focusedLeafId : leaves[0].id
        return {
          ...w,
          layout,
          focusedLeafId,
          broadcastLeafIds: w.broadcastLeafIds.filter((id) => ids.has(id))
        }
      })
    )
  },

  // Reorder panes in the active workspace: move `fromLeafId` to `toLeafId`'s
  // slot, reflowing the rest. reorderLeaves moves whole leaf nodes, so
  // focusedLeafId and broadcastLeafIds (which point at leaf ids) stay valid and
  // follow the terminals — no extra bookkeeping needed.
  reorderPane: (fromLeafId, toLeafId) =>
    set((s) =>
      mapActive(s, (w) => {
        if (fromLeafId === toLeafId) return w
        if (!findLeaf(w.layout, fromLeafId) || !findLeaf(w.layout, toLeafId)) return w
        return { ...w, layout: reorderLeaves(w.layout, fromLeafId, toLeafId) }
      })
    ),

  resizeSplitNode: (splitId, sizes) =>
    set((s) => mapActive(s, (w) => ({ ...w, layout: resizeSplit(w.layout, splitId, sizes) }))),

  // An agent switch respawns the pty; replaying a brief written for another
  // agent would be wrong, so a pending prompt is dropped along with it.
  setPaneAgent: (leafId, agentId) =>
    set((s) =>
      mapActive(s, (w) => ({
        ...w,
        layout: updateLeaf(w.layout, leafId, { agentId, initialPrompt: undefined })
      }))
    ),

  setPaneCwd: (leafId, cwd) =>
    set((s) => mapActive(s, (w) => ({ ...w, layout: updateLeaf(w.layout, leafId, { cwd }) }))),

  setPaneShell: (leafId, shellId) =>
    set((s) => mapActive(s, (w) => ({ ...w, layout: updateLeaf(w.layout, leafId, { shellId }) }))),

  // Worker panes are spawned by the backend's worktree.spawn MCP tool: split
  // the *requester's* leaf (which may live in a non-active workspace, so this
  // deliberately avoids mapActive) and let the normal pane-mount path spawn
  // the pty inside the worktree with the task brief.
  spawnWorktreePane: (p) =>
    set((s) => {
      const ws = selectWorkspaceByTerminalId(s, p.requesterTerminalId)
      if (!ws || !ws.worktreeMode) return {}
      const requester = collectLeaves(ws.layout).find(
        (l) => l.terminalId === p.requesterTerminalId
      )
      if (!requester) return {}
      const newLeaf: LeafNode = {
        type: 'leaf',
        id: uid(),
        terminalId: uid(),
        // Fall back to the requester's agent; a plain-shell requester yields a
        // plain shell in the worktree — visible, never a silent drop.
        agentId: p.agentId ?? requester.agentId,
        cwd: p.path,
        worktreeBranch: p.branch,
        initialPrompt: p.prompt
      }
      return {
        workspaces: s.workspaces.map((w) =>
          w.id === ws.id
            ? {
                ...w,
                layout: splitLeaf(w.layout, requester.id, 'horizontal', newLeaf, uid()),
                focusedLeafId: newLeaf.id
              }
            : w
        )
      }
    }),

  clearWorktreeBinding: (path) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => {
        const bound = collectLeaves(w.layout).filter((l) => l.cwd === path)
        if (bound.length === 0) return w
        let layout = w.layout
        for (const leaf of bound) {
          // The worktree directory is gone after worktree.remove, so leaving
          // cwd/initialPrompt pointed at it would respawn into a dead path (or
          // replay the original prompt) next time the pane's pty restarts.
          // Clearing cwd lets TerminalPane's existing respawn effect relocate
          // the pane back to the workspace folder, same as any other pane.
          layout = updateLeaf(layout, leaf.id, {
            worktreeBranch: undefined,
            cwd: undefined,
            initialPrompt: undefined
          })
        }
        return { ...w, layout }
      })
    })),

  toggleBroadcast: () =>
    set((s) =>
      mapActive(s, (w) => {
        const active = !w.broadcastActive
        return {
          ...w,
          broadcastActive: active,
          // Turning on selects every pane (the common "drive all" case); the
          // user narrows from there. Turning off clears the group.
          broadcastLeafIds: active ? collectLeaves(w.layout).map((l) => l.id) : []
        }
      })
    ),

  // Group membership can be edited even while broadcast is off; turning it on
  // via toggleBroadcast re-selects all panes, so off-mode edits are harmless.
  toggleBroadcastMember: (leafId) =>
    set((s) =>
      mapActive(s, (w) => {
        if (!findLeaf(w.layout, leafId)) return w
        const has = w.broadcastLeafIds.includes(leafId)
        return {
          ...w,
          broadcastLeafIds: has
            ? w.broadcastLeafIds.filter((id) => id !== leafId)
            : [...w.broadcastLeafIds, leafId]
        }
      })
    ),

  selectAllBroadcast: () =>
    set((s) =>
      mapActive(s, (w) => ({ ...w, broadcastLeafIds: collectLeaves(w.layout).map((l) => l.id) }))
    ),

  clearBroadcast: () => set((s) => mapActive(s, (w) => ({ ...w, broadcastLeafIds: [] })))
})

export const useAppStore = create<AppStore>()(appStoreCreator)
