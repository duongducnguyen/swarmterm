import { describe, it, expect } from 'vitest'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  appStoreCreator,
  selectWorkspaceByTerminalId,
  type AppStore,
  type CreateWorkspaceConfig,
  type Workspace
} from './app-store'
import { collectLeaves, type SplitNode } from '@/lib/layout-tree'

function freshStore(): StoreApi<AppStore> {
  return createStore<AppStore>()(appStoreCreator)
}

const SINGLE_TERMINAL: CreateWorkspaceConfig = {
  cwd: 'C:/work',
  terminalCount: 1,
  agentIds: ['terminal']
}

/** N plain-terminal panes — the agentIds a "create N panes" test wants. */
function panes(n: number): string[] {
  return Array.from({ length: n }, () => 'terminal')
}

/** A fresh store with one workspace already created from `config`. */
function storeWithWorkspace(config: CreateWorkspaceConfig = SINGLE_TERMINAL): StoreApi<AppStore> {
  const store = freshStore()
  store.getState().createWorkspace(config)
  return store
}

function activeWorkspace(store: StoreApi<AppStore>): Workspace {
  const s = store.getState()
  const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
  if (!ws) throw new Error('no active workspace')
  return ws
}

// --- initial state --------------------------------------------------------

describe('initial state', () => {
  it('starts with no workspaces', () => {
    expect(freshStore().getState().workspaces).toHaveLength(0)
  })

  it('has no active workspace', () => {
    expect(freshStore().getState().activeWorkspaceId).toBe('')
  })
})

// --- createWorkspace ------------------------------------------------------

describe('createWorkspace', () => {
  it('appends a workspace named "Workspace 1" first', () => {
    const store = storeWithWorkspace()
    expect(store.getState().workspaces).toHaveLength(1)
    expect(store.getState().workspaces[0].name).toBe('Workspace 1')
  })

  it('numbers workspaces sequentially', () => {
    const store = storeWithWorkspace()
    store.getState().createWorkspace(SINGLE_TERMINAL)
    expect(store.getState().workspaces.map((w) => w.name)).toEqual(['Workspace 1', 'Workspace 2'])
  })

  it('makes the new workspace active', () => {
    const store = storeWithWorkspace()
    expect(store.getState().activeWorkspaceId).toBe(store.getState().workspaces[0].id)
  })

  it('stores the chosen working directory', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, cwd: 'D:/projects/app' })
    expect(activeWorkspace(store).cwd).toBe('D:/projects/app')
  })

  it('builds the requested number of terminal panes', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 6, agentIds: panes(6) })
    expect(collectLeaves(activeWorkspace(store).layout)).toHaveLength(6)
  })

  it('focuses the first pane', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    const ws = activeWorkspace(store)
    expect(ws.focusedLeafId).toBe(collectLeaves(ws.layout)[0].id)
  })

  it('stamps each leaf with its agent id from the agentIds list', () => {
    const store = storeWithWorkspace({
      cwd: 'C:/work',
      terminalCount: 4,
      agentIds: ['claude-code', 'claude-code', 'codex', 'terminal']
    })
    const leaves = collectLeaves(activeWorkspace(store).layout)
    expect(leaves).toHaveLength(4)
    expect(leaves.map((l) => l.agentId)).toEqual([
      'claude-code',
      'claude-code',
      'codex',
      'terminal'
    ])
  })

  it('sets the agent id to terminal for the Terminal template', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 2, agentIds: panes(2) })
    const leaves = collectLeaves(activeWorkspace(store).layout)
    expect(leaves.every((l) => l.agentId === 'terminal')).toBe(true)
  })

  it('falls back to terminal when agentIds shorter than pane count', () => {
    const store = storeWithWorkspace({
      cwd: 'C:/work',
      terminalCount: 4,
      agentIds: ['claude-code', 'claude-code']
    })
    const leaves = collectLeaves(activeWorkspace(store).layout)
    expect(leaves).toHaveLength(4)
    expect(leaves[0].agentId).toBe('claude-code')
    expect(leaves[1].agentId).toBe('claude-code')
    expect(leaves[2].agentId).toBe('terminal')
    expect(leaves[3].agentId).toBe('terminal')
  })

  it('gives each pane a distinct terminalId', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 8, agentIds: panes(8) })
    const ids = collectLeaves(activeWorkspace(store).layout).map((l) => l.terminalId)
    expect(new Set(ids).size).toBe(8)
  })
})

// --- setActiveWorkspace ---------------------------------------------------

describe('setActiveWorkspace', () => {
  it('switches the active workspace', () => {
    const store = storeWithWorkspace()
    const firstId = store.getState().workspaces[0].id
    store.getState().createWorkspace(SINGLE_TERMINAL)
    store.getState().setActiveWorkspace(firstId)
    expect(store.getState().activeWorkspaceId).toBe(firstId)
  })
})

// --- renameWorkspace ------------------------------------------------------

describe('renameWorkspace', () => {
  it('updates the workspace name', () => {
    const store = storeWithWorkspace()
    store.getState().renameWorkspace(store.getState().workspaces[0].id, 'web')
    expect(store.getState().workspaces[0].name).toBe('web')
  })

  it('trims surrounding whitespace', () => {
    const store = storeWithWorkspace()
    store.getState().renameWorkspace(store.getState().workspaces[0].id, '  api  ')
    expect(store.getState().workspaces[0].name).toBe('api')
  })

  it('ignores an empty or whitespace-only name', () => {
    const store = storeWithWorkspace()
    store.getState().renameWorkspace(store.getState().workspaces[0].id, '   ')
    expect(store.getState().workspaces[0].name).toBe('Workspace 1')
  })
})

// --- closeWorkspace -------------------------------------------------------

describe('closeWorkspace', () => {
  it('removes a non-active workspace', () => {
    const store = storeWithWorkspace()
    const firstId = store.getState().workspaces[0].id
    store.getState().createWorkspace(SINGLE_TERMINAL)
    store.getState().closeWorkspace(firstId)
    expect(store.getState().workspaces).toHaveLength(1)
    expect(store.getState().workspaces[0].name).toBe('Workspace 2')
  })

  it('keeps the active workspace unchanged when closing another', () => {
    const store = storeWithWorkspace()
    const firstId = store.getState().workspaces[0].id
    store.getState().createWorkspace(SINGLE_TERMINAL)
    const activeBefore = store.getState().activeWorkspaceId
    store.getState().closeWorkspace(firstId)
    expect(store.getState().activeWorkspaceId).toBe(activeBefore)
  })

  it('moves the active marker when closing the active workspace', () => {
    const store = storeWithWorkspace()
    const firstId = store.getState().workspaces[0].id
    store.getState().createWorkspace(SINGLE_TERMINAL)
    const secondId = store.getState().activeWorkspaceId
    store.getState().closeWorkspace(secondId)
    expect(store.getState().workspaces).toHaveLength(1)
    expect(store.getState().activeWorkspaceId).toBe(firstId)
  })

  it('leaves no workspaces when the only workspace is closed', () => {
    const store = storeWithWorkspace()
    store.getState().closeWorkspace(activeWorkspace(store).id)
    expect(store.getState().workspaces).toHaveLength(0)
    expect(store.getState().activeWorkspaceId).toBe('')
  })
})

// --- moveWorkspace --------------------------------------------------------

describe('moveWorkspace', () => {
  function threeWorkspaces(): StoreApi<AppStore> {
    const store = storeWithWorkspace()
    store.getState().createWorkspace(SINGLE_TERMINAL)
    store.getState().createWorkspace(SINGLE_TERMINAL)
    return store
  }

  it('moves a workspace later in the list', () => {
    const store = threeWorkspaces()
    const [a, , c] = store.getState().workspaces
    store.getState().moveWorkspace(a.id, c.id)
    expect(store.getState().workspaces.map((w) => w.name)).toEqual([
      'Workspace 2',
      'Workspace 3',
      'Workspace 1'
    ])
  })

  it('moves a workspace earlier in the list', () => {
    const store = threeWorkspaces()
    const [a, , c] = store.getState().workspaces
    store.getState().moveWorkspace(c.id, a.id)
    expect(store.getState().workspaces.map((w) => w.name)).toEqual([
      'Workspace 3',
      'Workspace 1',
      'Workspace 2'
    ])
  })

  it('ignores a non-existent id', () => {
    const store = threeWorkspaces()
    const before = store.getState().workspaces.map((w) => w.id)
    store.getState().moveWorkspace('nope', before[0])
    expect(store.getState().workspaces.map((w) => w.id)).toEqual(before)
  })

  it('ignores a non-existent target id', () => {
    const store = threeWorkspaces()
    const before = store.getState().workspaces.map((w) => w.id)
    store.getState().moveWorkspace(before[0], 'nope')
    expect(store.getState().workspaces.map((w) => w.id)).toEqual(before)
  })

  it('is a no-op when source and target are the same', () => {
    const store = threeWorkspaces()
    const before = store.getState().workspaces.map((w) => w.id)
    store.getState().moveWorkspace(before[1], before[1])
    expect(store.getState().workspaces.map((w) => w.id)).toEqual(before)
  })

  it('does not change the active workspace', () => {
    const store = threeWorkspaces()
    const activeBefore = store.getState().activeWorkspaceId
    const [a, , c] = store.getState().workspaces
    store.getState().moveWorkspace(a.id, c.id)
    expect(store.getState().activeWorkspaceId).toBe(activeBefore)
  })
})

// --- splitPane ------------------------------------------------------------

describe('splitPane', () => {
  it('splits the focused pane into two', () => {
    const store = storeWithWorkspace()
    store.getState().splitPane(activeWorkspace(store).focusedLeafId, 'horizontal')
    expect(collectLeaves(activeWorkspace(store).layout)).toHaveLength(2)
  })

  it('focuses the newly created pane', () => {
    const store = storeWithWorkspace()
    const original = activeWorkspace(store).focusedLeafId
    store.getState().splitPane(original, 'vertical')
    expect(activeWorkspace(store).focusedLeafId).not.toBe(original)
  })

  it('records the split direction on the new split node', () => {
    const store = storeWithWorkspace()
    store.getState().splitPane(activeWorkspace(store).focusedLeafId, 'vertical')
    const layout = activeWorkspace(store).layout as SplitNode
    expect(layout.type).toBe('split')
    expect(layout.direction).toBe('vertical')
  })

  it('creates the split pane with no agent override (plain shell)', () => {
    const store = storeWithWorkspace({ cwd: 'C:/work', terminalCount: 1, agentIds: ['claude-code'] })
    const original = activeWorkspace(store).focusedLeafId
    store.getState().splitPane(original, 'horizontal')
    const created = collectLeaves(activeWorkspace(store).layout).find((l) => l.id !== original)
    expect(created?.agentId).toBeUndefined()
  })
})

// --- closePane ------------------------------------------------------------

describe('closePane', () => {
  it('removes a pane and collapses the tree', () => {
    const store = storeWithWorkspace()
    store.getState().splitPane(activeWorkspace(store).focusedLeafId, 'horizontal')
    const leaves = collectLeaves(activeWorkspace(store).layout)
    store.getState().closePane(leaves[0].id)
    expect(collectLeaves(activeWorkspace(store).layout)).toHaveLength(1)
  })

  it('moves focus to a surviving pane when the focused pane is closed', () => {
    const store = storeWithWorkspace()
    store.getState().splitPane(activeWorkspace(store).focusedLeafId, 'horizontal')
    const focused = activeWorkspace(store).focusedLeafId
    store.getState().closePane(focused)
    const ws = activeWorkspace(store)
    expect(ws.focusedLeafId).not.toBe(focused)
    expect(collectLeaves(ws.layout).some((l) => l.id === ws.focusedLeafId)).toBe(true)
  })

  it('closes the workspace when its last pane is closed', () => {
    const store = storeWithWorkspace()
    store.getState().createWorkspace(SINGLE_TERMINAL)
    const secondId = store.getState().activeWorkspaceId
    store.getState().closePane(activeWorkspace(store).focusedLeafId)
    expect(store.getState().workspaces.some((w) => w.id === secondId)).toBe(false)
    expect(store.getState().workspaces).toHaveLength(1)
  })

  it('leaves no workspaces when the last pane of the only workspace is closed', () => {
    const store = storeWithWorkspace()
    store.getState().closePane(activeWorkspace(store).focusedLeafId)
    expect(store.getState().workspaces).toHaveLength(0)
  })
})

// --- resizeSplitNode ------------------------------------------------------

describe('resizeSplitNode', () => {
  it('updates the sizes of a split node', () => {
    const store = storeWithWorkspace()
    store.getState().splitPane(activeWorkspace(store).focusedLeafId, 'horizontal')
    const layout = activeWorkspace(store).layout as SplitNode
    store.getState().resizeSplitNode(layout.id, [30, 70])
    expect((activeWorkspace(store).layout as SplitNode).sizes).toEqual([30, 70])
  })
})

// --- pane overrides -------------------------------------------------------

describe('setPaneAgent', () => {
  it('sets the agent id on the targeted leaf', () => {
    const store = storeWithWorkspace()
    const leafId = activeWorkspace(store).focusedLeafId
    store.getState().setPaneAgent(leafId, 'codex')
    const leaf = collectLeaves(activeWorkspace(store).layout).find((l) => l.id === leafId)
    expect(leaf?.agentId).toBe('codex')
  })
})

describe('setPaneCwd', () => {
  it('sets a per-pane cwd override', () => {
    const store = storeWithWorkspace()
    const leafId = activeWorkspace(store).focusedLeafId
    store.getState().setPaneCwd(leafId, 'D:/elsewhere')
    const leaf = collectLeaves(activeWorkspace(store).layout).find((l) => l.id === leafId)
    expect(leaf?.cwd).toBe('D:/elsewhere')
  })

  it('clears the override when passed undefined', () => {
    const store = storeWithWorkspace()
    const leafId = activeWorkspace(store).focusedLeafId
    store.getState().setPaneCwd(leafId, 'D:/elsewhere')
    store.getState().setPaneCwd(leafId, undefined)
    const leaf = collectLeaves(activeWorkspace(store).layout).find((l) => l.id === leafId)
    expect(leaf?.cwd).toBeUndefined()
  })
})

describe('setPaneShell', () => {
  it('sets a per-pane shell override', () => {
    const store = storeWithWorkspace()
    const leafId = activeWorkspace(store).focusedLeafId
    store.getState().setPaneShell(leafId, 'wsl')
    const leaf = collectLeaves(activeWorkspace(store).layout).find((l) => l.id === leafId)
    expect(leaf?.shellId).toBe('wsl')
  })
})

// --- welcome state --------------------------------------------------------

describe('welcome state', () => {
  it('starts open and focused', () => {
    const s = freshStore().getState()
    expect(s.welcomeOpen).toBe(true)
    expect(s.welcomeFocused).toBe(true)
  })

  it('openWelcome opens and focuses it', () => {
    const store = storeWithWorkspace() // creating a workspace closes welcome
    store.getState().openWelcome()
    expect(store.getState().welcomeOpen).toBe(true)
    expect(store.getState().welcomeFocused).toBe(true)
  })

  it('closeWelcome closes and unfocuses it', () => {
    const store = freshStore()
    store.getState().closeWelcome()
    expect(store.getState().welcomeOpen).toBe(false)
    expect(store.getState().welcomeFocused).toBe(false)
  })

  it('focusWelcome focuses it', () => {
    const store = storeWithWorkspace()
    store.getState().focusWelcome()
    expect(store.getState().welcomeFocused).toBe(true)
  })

  it('creating a workspace closes welcome', () => {
    const store = storeWithWorkspace()
    expect(store.getState().welcomeOpen).toBe(false)
    expect(store.getState().welcomeFocused).toBe(false)
  })

  it('switching to a workspace unfocuses welcome', () => {
    const store = storeWithWorkspace()
    const id = store.getState().workspaces[0].id
    store.getState().focusWelcome()
    store.getState().setActiveWorkspace(id)
    expect(store.getState().welcomeFocused).toBe(false)
  })

  it('closing the only workspace reopens welcome', () => {
    const store = storeWithWorkspace()
    store.getState().closeWorkspace(store.getState().workspaces[0].id)
    expect(store.getState().welcomeOpen).toBe(true)
    expect(store.getState().welcomeFocused).toBe(true)
  })
})

// --- broadcast ------------------------------------------------------------

describe('broadcast group', () => {
  it('a new workspace starts with broadcast off and an empty group', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    const ws = activeWorkspace(store)
    expect(ws.broadcastActive).toBe(false)
    expect(ws.broadcastLeafIds).toEqual([])
  })

  it('toggleBroadcast turns on and selects every pane', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    store.getState().toggleBroadcast()
    const ws = activeWorkspace(store)
    const all = collectLeaves(ws.layout).map((l) => l.id)
    expect(ws.broadcastActive).toBe(true)
    expect([...ws.broadcastLeafIds].sort()).toEqual([...all].sort())
  })

  it('toggleBroadcast again turns off and clears the group', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    store.getState().toggleBroadcast()
    store.getState().toggleBroadcast()
    const ws = activeWorkspace(store)
    expect(ws.broadcastActive).toBe(false)
    expect(ws.broadcastLeafIds).toEqual([])
  })

  it('toggleBroadcastMember removes a member that is present', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    store.getState().toggleBroadcast() // selects all
    const target = collectLeaves(activeWorkspace(store).layout)[0].id
    store.getState().toggleBroadcastMember(target)
    expect(activeWorkspace(store).broadcastLeafIds).not.toContain(target)
  })

  it('toggleBroadcastMember adds a member that is absent', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    store.getState().toggleBroadcast()
    const target = collectLeaves(activeWorkspace(store).layout)[0].id
    store.getState().toggleBroadcastMember(target) // remove
    store.getState().toggleBroadcastMember(target) // add back
    expect(activeWorkspace(store).broadcastLeafIds).toContain(target)
  })

  it('toggleBroadcastMember adds a member even while broadcast mode is off', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    const target = collectLeaves(activeWorkspace(store).layout)[0].id
    // Mode is off (never toggled on). Editing the group is still allowed.
    store.getState().toggleBroadcastMember(target)
    expect(activeWorkspace(store).broadcastActive).toBe(false)
    expect(activeWorkspace(store).broadcastLeafIds).toEqual([target])
  })

  it('toggleBroadcastMember ignores an unknown leaf id', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 2, agentIds: panes(2) })
    store.getState().toggleBroadcast()
    const before = activeWorkspace(store).broadcastLeafIds.length
    store.getState().toggleBroadcastMember('nope')
    expect(activeWorkspace(store).broadcastLeafIds).toHaveLength(before)
  })

  it('selectAllBroadcast sets the group to every pane', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    store.getState().toggleBroadcast()
    store.getState().clearBroadcast()
    store.getState().selectAllBroadcast()
    const ws = activeWorkspace(store)
    expect([...ws.broadcastLeafIds].sort()).toEqual(
      [...collectLeaves(ws.layout).map((l) => l.id)].sort()
    )
  })

  it('clearBroadcast empties the group and leaves the mode flag unchanged', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4, agentIds: panes(4) })
    store.getState().toggleBroadcast()
    const activeBefore = activeWorkspace(store).broadcastActive
    store.getState().clearBroadcast()
    const ws = activeWorkspace(store)
    expect(ws.broadcastActive).toBe(activeBefore)
    expect(ws.broadcastLeafIds).toEqual([])
  })

  it('closePane prunes the closed pane from the broadcast group', () => {
    const store = storeWithWorkspace()
    store.getState().splitPane(activeWorkspace(store).focusedLeafId, 'horizontal')
    store.getState().toggleBroadcast() // both panes selected
    const leaves = collectLeaves(activeWorkspace(store).layout)
    const closed = leaves[0].id
    store.getState().closePane(closed)
    expect(activeWorkspace(store).broadcastLeafIds).not.toContain(closed)
    expect(activeWorkspace(store).broadcastLeafIds).toHaveLength(1)
  })
})

describe('selectWorkspaceByTerminalId', () => {
  it('finds the workspace whose layout contains the terminalId', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 2, agentIds: panes(2) })
    const ws = activeWorkspace(store)
    const termId = collectLeaves(ws.layout)[0].terminalId
    expect(selectWorkspaceByTerminalId(store.getState(), termId)?.id).toBe(ws.id)
  })

  it('returns undefined for an unknown terminalId', () => {
    const store = storeWithWorkspace()
    expect(selectWorkspaceByTerminalId(store.getState(), 'nope')).toBeUndefined()
  })
})

// --- reorderPane ----------------------------------------------------------

const TWO_PANES: CreateWorkspaceConfig = {
  cwd: 'C:/w',
  terminalCount: 2,
  agentIds: ['claude-code', 'terminal']
}

const FOUR_PANES: CreateWorkspaceConfig = {
  cwd: 'C:/w',
  terminalCount: 4,
  agentIds: ['claude-code', 'terminal', 'codex', 'opencode']
}

describe('reorderPane', () => {
  it('moves a pane to the target slot, reflowing the rest, in the active workspace', () => {
    const store = storeWithWorkspace(FOUR_PANES)
    const ids = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    // Drag pane 0 onto pane 2: [0,1,2,3] -> [1,2,0,3]
    store.getState().reorderPane(ids[0], ids[2])
    const after = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    expect(after).toEqual([ids[1], ids[2], ids[0], ids[3]])
  })

  it('swaps two panes when there are only two slots', () => {
    const store = storeWithWorkspace(TWO_PANES)
    const [a, b] = collectLeaves(activeWorkspace(store).layout)
    store.getState().reorderPane(a.id, b.id)
    const after = collectLeaves(activeWorkspace(store).layout)
    expect(after[0].id).toBe(b.id)
    expect(after[1].id).toBe(a.id)
    // The agent override travels with the node to its new slot.
    expect(after[0].agentId).toBe(b.agentId)
    expect(after[1].agentId).toBe(a.agentId)
  })

  it('keeps focusedLeafId on the dragged pane after the reorder', () => {
    const store = storeWithWorkspace(FOUR_PANES)
    const ids = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    store.getState().setFocusedLeaf(ids[0])
    store.getState().reorderPane(ids[0], ids[2])
    expect(activeWorkspace(store).focusedLeafId).toBe(ids[0])
  })

  it('keeps broadcast membership with the moved pane', () => {
    const store = storeWithWorkspace(FOUR_PANES)
    const ids = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    store.getState().toggleBroadcastMember(ids[0])
    store.getState().reorderPane(ids[0], ids[2])
    expect(activeWorkspace(store).broadcastLeafIds).toContain(ids[0])
    expect(collectLeaves(activeWorkspace(store).layout).some((l) => l.id === ids[0])).toBe(true)
  })

  it('no-ops when the two ids are the same', () => {
    const store = storeWithWorkspace(FOUR_PANES)
    const before = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    store.getState().reorderPane(before[0], before[0])
    const after = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    expect(after).toEqual(before)
  })

  it('no-ops when a leaf id does not exist', () => {
    const store = storeWithWorkspace(FOUR_PANES)
    const before = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    store.getState().reorderPane(before[0], 'nonexistent')
    const after = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    expect(after).toEqual(before)
  })

  it('leaves other (inactive) workspaces untouched', () => {
    const store = storeWithWorkspace(FOUR_PANES) // workspace 1
    const firstWsId = store.getState().activeWorkspaceId
    const firstLayoutBefore = store.getState().workspaces.find((w) => w.id === firstWsId)!.layout
    store.getState().createWorkspace(FOUR_PANES) // workspace 2 — now the active one
    const ids = collectLeaves(activeWorkspace(store).layout).map((l) => l.id)
    store.getState().reorderPane(ids[0], ids[2])
    const firstLayoutAfter = store.getState().workspaces.find((w) => w.id === firstWsId)!.layout
    // mapActive maps only the active workspace, so the inactive one's layout
    // object is returned untouched — same reference, not just deep-equal.
    expect(firstLayoutAfter).toBe(firstLayoutBefore)
  })
})

// --- worktree panes ---------------------------------------------------------

describe('worktree panes', () => {
  function workspaceWithWorktrees(): StoreApi<AppStore> {
    const store = freshStore()
    store.getState().createWorkspace({
      cwd: 'C:/dev/myapp',
      terminalCount: 1,
      agentIds: ['claude-code'],
      worktreeMode: true
    })
    return store
  }

  it('createWorkspace records worktreeMode (default false)', () => {
    const store = workspaceWithWorktrees()
    expect(store.getState().workspaces[0].worktreeMode).toBe(true)
    store.getState().createWorkspace({ cwd: 'x', terminalCount: 1, agentIds: [] })
    expect(store.getState().workspaces[1].worktreeMode).toBe(false)
  })

  it('spawnWorktreePane splits the requester leaf with binding fields and focuses it', () => {
    const store = workspaceWithWorktrees()
    const ws = store.getState().workspaces[0]
    const requester = collectLeaves(ws.layout)[0]
    store.getState().spawnWorktreePane({
      requesterTerminalId: requester.terminalId,
      path: 'C:/dev/myapp.worktrees/feat-login',
      branch: 'feat/login',
      prompt: 'Implement login'
    })
    const after = store.getState().workspaces[0]
    const leaves = collectLeaves(after.layout)
    expect(leaves).toHaveLength(2)
    const worker = leaves.find((l) => l.worktreeBranch === 'feat/login')!
    expect(worker.cwd).toBe('C:/dev/myapp.worktrees/feat-login')
    expect(worker.agentId).toBe('claude-code') // inherited from requester
    expect(worker.initialPrompt).toBe('Implement login')
    expect(after.focusedLeafId).toBe(worker.id)
  })

  it('spawnWorktreePane is a no-op when worktreeMode is off or requester unknown', () => {
    const store = freshStore()
    store.getState().createWorkspace({ cwd: 'x', terminalCount: 1, agentIds: ['claude-code'] })
    const requester = collectLeaves(store.getState().workspaces[0].layout)[0]
    store.getState().spawnWorktreePane({
      requesterTerminalId: requester.terminalId,
      path: 'p',
      branch: 'b',
      prompt: 'q'
    })
    expect(collectLeaves(store.getState().workspaces[0].layout)).toHaveLength(1)

    // An id that matches no leaf anywhere (e.g. the pane closed between the
    // MCP call starting and the event arriving) must also no-op, not throw.
    store.getState().spawnWorktreePane({
      requesterTerminalId: 'no-such-terminal',
      path: 'p',
      branch: 'b',
      prompt: 'q'
    })
    expect(collectLeaves(store.getState().workspaces[0].layout)).toHaveLength(1)
  })

  it('spawnWorktreePane targets the requester\'s workspace even when a different one is active', () => {
    const store = freshStore()
    store.getState().createWorkspace({
      cwd: 'C:/dev/myapp',
      terminalCount: 1,
      agentIds: ['claude-code'],
      worktreeMode: true
    })
    const ws1Id = store.getState().workspaces[0].id
    const requester = collectLeaves(store.getState().workspaces[0].layout)[0]

    // createWorkspace makes the new workspace active, so ws2 is now active —
    // the MCP tool call still names ws1's pane as requester.
    store.getState().createWorkspace({ cwd: 'C:/dev/other', terminalCount: 1, agentIds: [] })
    const ws2Id = store.getState().workspaces[1].id
    expect(store.getState().activeWorkspaceId).toBe(ws2Id)
    const ws2LeavesBefore = collectLeaves(store.getState().workspaces[1].layout)

    store.getState().spawnWorktreePane({
      requesterTerminalId: requester.terminalId,
      path: 'C:/dev/myapp.worktrees/feat-login',
      branch: 'feat/login',
      prompt: 'Implement login'
    })

    const ws1After = store.getState().workspaces.find((w) => w.id === ws1Id)!
    const ws2After = store.getState().workspaces.find((w) => w.id === ws2Id)!
    const ws1Leaves = collectLeaves(ws1After.layout)
    expect(ws1Leaves).toHaveLength(2)
    expect(ws1Leaves.some((l) => l.worktreeBranch === 'feat/login')).toBe(true)
    // The active workspace (ws2) must be untouched by a spawn targeting ws1.
    expect(collectLeaves(ws2After.layout)).toEqual(ws2LeavesBefore)
  })

  it('clearWorktreeBinding clears the badge field and relocates the pane off the deleted dir', () => {
    const store = workspaceWithWorktrees()
    const requester = collectLeaves(store.getState().workspaces[0].layout)[0]
    store.getState().spawnWorktreePane({
      requesterTerminalId: requester.terminalId,
      path: 'C:/dev/myapp.worktrees/feat-login',
      branch: 'feat/login',
      prompt: 'x'
    })
    store.getState().clearWorktreeBinding('C:/dev/myapp.worktrees/feat-login')
    const leaves = collectLeaves(store.getState().workspaces[0].layout)
    expect(leaves.every((l) => l.worktreeBranch === undefined)).toBe(true)
    // cwd/initialPrompt must clear too — the worktree directory no longer
    // exists, so leaving them set would respawn the pane into a dead path or
    // replay the original prompt; clearing cwd lets it relocate to the
    // workspace root instead (TerminalPane's existing respawn effect).
    const worker = leaves.find((l) => l.id !== requester.id)!
    expect(worker.cwd).toBeUndefined()
    expect(worker.initialPrompt).toBeUndefined()
  })

  it('clearWorktreeBinding matches paths across / and \\ separator styles', () => {
    const store = workspaceWithWorktrees()
    const requester = collectLeaves(store.getState().workspaces[0].layout)[0]
    store.getState().spawnWorktreePane({
      requesterTerminalId: requester.terminalId,
      // Leaf's cwd mixes styles, as Rust PathBuf output sometimes does on Windows.
      path: 'C:/dev/myapp.worktrees\\feat-login',
      branch: 'feat/login',
      prompt: 'x'
    })
    // Clear using the forward-slash form only — must still match the mixed leaf.
    store.getState().clearWorktreeBinding('C:/dev/myapp.worktrees/feat-login')
    const leaves = collectLeaves(store.getState().workspaces[0].layout)
    expect(leaves.every((l) => l.worktreeBranch === undefined)).toBe(true)
    const worker = leaves.find((l) => l.id !== requester.id)!
    expect(worker.cwd).toBeUndefined()
    expect(worker.initialPrompt).toBeUndefined()
  })

  it('setPaneAgent clears a pending initialPrompt', () => {
    const store = workspaceWithWorktrees()
    const requester = collectLeaves(store.getState().workspaces[0].layout)[0]
    store.getState().spawnWorktreePane({
      requesterTerminalId: requester.terminalId,
      path: 'p',
      branch: 'b',
      prompt: 'the brief'
    })
    const worker = collectLeaves(store.getState().workspaces[0].layout).find(
      (l) => l.worktreeBranch === 'b'
    )!
    store.getState().setPaneAgent(worker.id, 'codex')
    const updated = collectLeaves(store.getState().workspaces[0].layout).find(
      (l) => l.id === worker.id
    )!
    expect(updated.initialPrompt).toBeUndefined()
  })

  it('createWorkspace stamps paneWorktrees onto leaves in pane order', () => {
    const store = freshStore()
    store.getState().createWorkspace({
      cwd: 'C:/dev/myapp',
      terminalCount: 3,
      agentIds: ['claude-code', 'terminal', 'claude-code'],
      worktreeMode: true,
      paneWorktrees: [
        { path: 'C:/dev/myapp.worktrees/claude-code-1', branch: 'swarm/claude-code-1' },
        null,
        { path: 'C:/dev/myapp.worktrees/claude-code-2', branch: 'swarm/claude-code-2' }
      ]
    })
    const leaves = collectLeaves(store.getState().workspaces[0].layout)
    expect(leaves[0].cwd).toBe('C:/dev/myapp.worktrees/claude-code-1')
    expect(leaves[0].worktreeBranch).toBe('swarm/claude-code-1')
    expect(leaves[1].cwd).toBeUndefined()
    expect(leaves[1].worktreeBranch).toBeUndefined()
    expect(leaves[2].worktreeBranch).toBe('swarm/claude-code-2')
  })
})


describe('drop target', () => {
  it('starts with no drop target', () => {
    expect(freshStore().getState().dropTargetTerminalId).toBeNull()
  })

  it('sets and clears the drop target', () => {
    const store = freshStore()
    store.getState().setDropTarget('term-1')
    expect(store.getState().dropTargetTerminalId).toBe('term-1')
    store.getState().setDropTarget(null)
    expect(store.getState().dropTargetTerminalId).toBeNull()
  })
})
