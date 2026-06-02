import { create, type StateCreator } from 'zustand'
import {
  buildGridLayout,
  collectLeaves,
  closeLeaf,
  findLeaf,
  resizeSplit,
  splitLeaf,
  updateLeaf,
  type Direction,
  type LayoutNode,
  type LeafNode
} from '@/lib/layout-tree'
import type { ShellId } from '@/lib/terminal-pref'

/** A workspace: a named binary split-tree of terminal panes. */
export interface Workspace {
  id: string
  name: string
  /** Working directory every terminal in this workspace starts from. */
  cwd: string
  layout: LayoutNode
  focusedLeafId: string
}

/** What the setup wizard collects to build a new workspace. */
export interface CreateWorkspaceConfig {
  cwd: string
  terminalCount: number
  templateId: string
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
  resizeSplitNode: (splitId: string, sizes: [number, number]) => void
  setPaneAgent: (leafId: string, agentId: string) => void
  setPaneCwd: (leafId: string, cwd: string | undefined) => void
  setPaneShell: (leafId: string, shellId: ShellId) => void
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
      // Every wizard-created leaf records the chosen agent; split-created ones don't.
      const makeWizardLeaf = (): LeafNode => ({
        type: 'leaf',
        id: uid(),
        terminalId: uid(),
        agentId: config.templateId
      })
      const layout = buildGridLayout(config.terminalCount, makeWizardLeaf, uid)
      const ws: Workspace = {
        id: uid(),
        name: `Workspace ${s.nextWorkspaceNumber}`,
        cwd: config.cwd,
        layout,
        focusedLeafId: collectLeaves(layout)[0].id
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
        const focusedLeafId = leaves.some((l) => l.id === w.focusedLeafId)
          ? w.focusedLeafId
          : leaves[0].id
        return { ...w, layout, focusedLeafId }
      })
    )
  },

  resizeSplitNode: (splitId, sizes) =>
    set((s) => mapActive(s, (w) => ({ ...w, layout: resizeSplit(w.layout, splitId, sizes) }))),

  setPaneAgent: (leafId, agentId) =>
    set((s) => mapActive(s, (w) => ({ ...w, layout: updateLeaf(w.layout, leafId, { agentId }) }))),

  setPaneCwd: (leafId, cwd) =>
    set((s) => mapActive(s, (w) => ({ ...w, layout: updateLeaf(w.layout, leafId, { cwd }) }))),

  setPaneShell: (leafId, shellId) =>
    set((s) => mapActive(s, (w) => ({ ...w, layout: updateLeaf(w.layout, leafId, { shellId }) })))
})

export const useAppStore = create<AppStore>()(appStoreCreator)
