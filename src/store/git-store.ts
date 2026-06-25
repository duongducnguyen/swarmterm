// src/store/git-store.ts
import { create } from 'zustand'
import {
  listWorktrees,
  getChangedFiles,
  getFileDiff,
  getCommitInfo,
  type WorktreeInfo,
  type ChangedFile,
  type CommitInfo,
} from '@/tauri/git'

export type { WorktreeInfo, ChangedFile, CommitInfo }

interface GitStore {
  panelOpen: boolean
  mode: 'browser' | 'git'
  currentCwd: string
  worktrees: WorktreeInfo[]
  selectedWorktreePath: string
  changedFiles: ChangedFile[]
  commitInfo: CommitInfo | null
  expandedFiles: Set<string>
  fileDiffs: Map<string, string>
  loading: boolean
  error: string | null

  setMode: (mode: 'browser' | 'git') => void
  setPanelOpen: (open: boolean) => void
  selectWorktree: (path: string) => void
  toggleFileExpand: (filePath: string) => void
  fetchWorktrees: (cwd: string) => Promise<void>
  fetchFileDiff: (filePath: string) => Promise<void>
  refresh: () => void
}

export const useGitStore = create<GitStore>((set, get) => ({
  panelOpen: false,
  mode: 'browser',
  currentCwd: '',
  worktrees: [],
  selectedWorktreePath: '',
  changedFiles: [],
  commitInfo: null,
  expandedFiles: new Set(),
  fileDiffs: new Map(),
  loading: false,
  error: null,

  setMode: (mode) => {
    set({ mode })
    if (mode === 'git') {
      set({ panelOpen: true })
      const { currentCwd } = get()
      if (currentCwd) void get().fetchWorktrees(currentCwd)
    }
  },

  setPanelOpen: (open) => set({ panelOpen: open }),

  selectWorktree: (path) => {
    set({
      selectedWorktreePath: path,
      changedFiles: [],
      commitInfo: null,
      expandedFiles: new Set(),
      fileDiffs: new Map(),
      loading: true,
      error: null,
    })
    void (async () => {
      try {
        const [files, info] = await Promise.all([
          getChangedFiles(path),
          getCommitInfo(path),
        ])
        if (get().selectedWorktreePath !== path) return  // selection changed — discard stale results
        set({ changedFiles: files, commitInfo: info, loading: false })
      } catch (e) {
        set({ error: String(e), loading: false })
      }
    })()
  },

  toggleFileExpand: (filePath) => {
    const { expandedFiles } = get()
    const next = new Set(expandedFiles)
    if (next.has(filePath)) {
      next.delete(filePath)
      set({ expandedFiles: next })
    } else {
      next.add(filePath)
      set({ expandedFiles: next })
      if (!get().fileDiffs.has(filePath)) {
        void get().fetchFileDiff(filePath)
      }
    }
  },

  fetchWorktrees: async (cwd) => {
    set({
      loading: true,
      error: null,
      currentCwd: cwd,
      worktrees: [],
      changedFiles: [],
      commitInfo: null,
      expandedFiles: new Set(),
      fileDiffs: new Map(),
    })
    try {
      const trees = await listWorktrees(cwd)
      if (get().currentCwd !== cwd) return  // another fetch started — discard stale results
      if (trees.length === 0) {
        set({ worktrees: [], loading: false })
        return
      }
      // Auto-select the worktree whose path is a prefix of (or equals) cwd.
      const match = trees.find(t => cwd.startsWith(t.path)) ?? trees[0]
      set({ worktrees: trees, loading: false })
      get().selectWorktree(match.path)
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  fetchFileDiff: async (filePath) => {
    const { selectedWorktreePath, fileDiffs } = get()
    if (!selectedWorktreePath) return
    try {
      const diff = await getFileDiff(selectedWorktreePath, filePath)
      const next = new Map(fileDiffs)
      next.set(filePath, diff)
      set({ fileDiffs: next })
    } catch {
      // Silently ignore — InlineDiff renders "No diff available" for empty string.
    }
  },

  refresh: () => {
    const { currentCwd } = get()
    if (currentCwd) void get().fetchWorktrees(currentCwd)
  },
}))
