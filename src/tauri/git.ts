import { invoke } from '@tauri-apps/api/core'

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
  isMain: boolean
}

export interface ChangedFile {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | '?'
  added: number
  removed: number
}

export interface CommitInfo {
  headSha: string
  branch: string
  ahead: number | null
  behind: number | null
}

export interface CreatedWorktree {
  path: string
  branch: string
}

export function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  return invoke('git_list_worktrees', { cwd })
}

export function getChangedFiles(worktreePath: string): Promise<ChangedFile[]> {
  return invoke('git_get_changed_files', { worktreePath })
}

export function getFileDiff(worktreePath: string, file: string): Promise<string> {
  return invoke('git_get_file_diff', { worktreePath, file })
}

export function getCommitInfo(worktreePath: string): Promise<CommitInfo> {
  return invoke('git_get_commit_info', { worktreePath })
}

export function createWorktree(repoRoot: string, branch: string): Promise<CreatedWorktree> {
  return invoke('git_create_worktree', { repoRoot, branch })
}

export function branchUnmergedCount(repoRoot: string, branch: string): Promise<number> {
  return invoke('git_branch_unmerged_count', { repoRoot, branch })
}

export function clearWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  return invoke('git_clear_worktree', { repoRoot, worktreePath, branch })
}

export async function ensureRepoWithCommit(path: string): Promise<void> {
  return invoke<void>('ensure_repo_with_commit', { path })
}
