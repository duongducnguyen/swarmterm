import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** Payloads mirror mcp/tools/worktree.rs — camelCase on the wire. */
export interface WorktreeSpawnEvent {
  requesterTerminalId: string
  path: string
  branch: string
  agent: string | null
  prompt: string
}

export interface WorktreeRemovedEvent {
  path: string
}

/** Subscribe to worktree.spawn tool calls (worktree created, pane requested). */
export function onWorktreeSpawn(
  handler: (e: WorktreeSpawnEvent) => void
): Promise<UnlistenFn> {
  return listen<WorktreeSpawnEvent>('worktree:spawn', (event) => handler(event.payload))
}

/** Subscribe to worktree.remove tool calls (worktree deleted from disk). */
export function onWorktreeRemoved(
  handler: (e: WorktreeRemovedEvent) => void
): Promise<UnlistenFn> {
  return listen<WorktreeRemovedEvent>('worktree:removed', (event) => handler(event.payload))
}
