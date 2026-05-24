import { describe, it, expect } from 'vitest'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  appStoreCreator,
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
  templateId: 'terminal'
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
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 6 })
    expect(collectLeaves(activeWorkspace(store).layout)).toHaveLength(6)
  })

  it('focuses the first pane', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 4 })
    const ws = activeWorkspace(store)
    expect(ws.focusedLeafId).toBe(collectLeaves(ws.layout)[0].id)
  })

  it('puts the template command on every leaf for the Claude Code template', () => {
    const store = storeWithWorkspace({ cwd: 'C:/work', terminalCount: 4, templateId: 'claude-code' })
    const leaves = collectLeaves(activeWorkspace(store).layout)
    expect(leaves).toHaveLength(4)
    expect(
      leaves.every((l) => l.initialCommand === 'claude --dangerously-skip-permissions')
    ).toBe(true)
  })

  it('leaves initialCommand unset for the Terminal template', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 2 })
    const leaves = collectLeaves(activeWorkspace(store).layout)
    expect(leaves.every((l) => l.initialCommand === undefined)).toBe(true)
  })

  it('gives each pane a distinct terminalId', () => {
    const store = storeWithWorkspace({ ...SINGLE_TERMINAL, terminalCount: 8 })
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

  it('creates the split pane as a plain shell with no initial command', () => {
    const store = storeWithWorkspace({ cwd: 'C:/work', terminalCount: 1, templateId: 'claude-code' })
    const original = activeWorkspace(store).focusedLeafId
    store.getState().splitPane(original, 'horizontal')
    const created = collectLeaves(activeWorkspace(store).layout).find((l) => l.id !== original)
    expect(created?.initialCommand).toBeUndefined()
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
