import { message, open } from '@tauri-apps/plugin-dialog'
import { homeDir } from '@tauri-apps/api/path'

/** Native OS message box. Used for update-check verdicts so they land centered
 * and OS-styled instead of floating over the terminal. Needs the
 * `dialog:allow-message` capability — without it the promise rejects silently. */
export async function showMessage(
  text: string,
  opts?: { title?: string; kind?: 'info' | 'error' }
): Promise<void> {
  await message(text, { title: opts?.title, kind: opts?.kind })
}

/** Open a native folder picker. Resolves to the chosen path, or null if cancelled. */
export async function pickDirectory(): Promise<string | null> {
  const home = await homeDir()
  const picked = await open({ directory: true, defaultPath: home })
  return typeof picked === 'string' ? picked : null
}

export const getHomeDir = (): Promise<string> => homeDir()
