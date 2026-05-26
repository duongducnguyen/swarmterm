import { invoke } from '@tauri-apps/api/core'
import type { ShellId } from '@/lib/terminal-pref'

/** Backend probe result for one shell. `available === false` ⇒ disable in UI. */
export interface AvailableShell {
  id: ShellId
  available: boolean
  detectedPath?: string
  args: string[]
}

export const listAvailableShells = (): Promise<AvailableShell[]> =>
  invoke('list_available_shells')
