import { open } from '@tauri-apps/plugin-dialog'
import { homeDir } from '@tauri-apps/api/path'

/** Open a native folder picker. Resolves to the chosen path, or null if cancelled. */
export async function pickDirectory(): Promise<string | null> {
  const home = await homeDir()
  const picked = await open({ directory: true, defaultPath: home })
  return typeof picked === 'string' ? picked : null
}

export const getHomeDir = (): Promise<string> => homeDir()
