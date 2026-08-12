import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { listen } from '@tauri-apps/api/event'

export interface FoundUpdate {
  version: string
  notes?: string
}

export type ProgressEvent =
  | { kind: 'started'; total?: number }
  | { kind: 'chunk'; length: number }
  | { kind: 'finished' }

// The plugin's Update object carries the download handle; it lives here (not
// in the store) so React state stays serializable and the IPC surface stays
// the only module touching @tauri-apps/*.
let pending: Update | null = null

export async function checkForUpdate(): Promise<FoundUpdate | null> {
  const update = await check()
  pending = update
  if (!update) return null
  return { version: update.version, notes: update.body ?? undefined }
}

/** On Windows (NSIS, passive mode) the returned promise never resolves — the
 *  installer takes over and the app exits mid-call. Callers must not sequence
 *  anything after it that matters on Windows. */
export async function downloadAndInstall(
  onProgress: (e: ProgressEvent) => void
): Promise<void> {
  if (!pending) throw new Error('no update staged — call checkForUpdate first')
  await pending.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        onProgress({ kind: 'started', total: event.data.contentLength })
        break
      case 'Progress':
        onProgress({ kind: 'chunk', length: event.data.chunkLength })
        break
      case 'Finished':
        onProgress({ kind: 'finished' })
        break
    }
  })
}

export const restartApp = (): Promise<void> => relaunch()

/** Tray → renderer: the "Check for Updates…" menu item. */
export function onUpdateCheckRequested(cb: () => void): Promise<() => void> {
  return listen('updater:check-requested', () => cb())
}
