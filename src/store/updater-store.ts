import { create } from 'zustand'
import { reduceUpdater, type UpdaterEvent, type UpdaterState } from '@/lib/updater-flow'
import { checkForUpdate, downloadAndInstall, restartApp } from '@/tauri/updater'

export interface UpdaterStore {
  state: UpdaterState
  check: (manual: boolean) => Promise<void>
  download: () => Promise<void>
  restart: () => Promise<void>
  dismiss: () => void
}

/**
 * Thin bridge: every transition funnels through the pure reducer so the
 * "silent startup / talkative manual" rules stay unit-tested in lib. The
 * reducer also acts as the concurrency guard — a dispatch that the current
 * phase forbids is a no-op, so double-clicks and overlapping checks resolve
 * here without extra flags.
 */
export const useUpdaterStore = create<UpdaterStore>((set, get) => {
  const dispatch = (ev: UpdaterEvent) => set({ state: reduceUpdater(get().state, ev) })

  return {
    state: { phase: 'idle' },
    check: async (manual) => {
      const before = get().state
      dispatch({ type: 'check', manual })
      if (get().state === before) return // reducer refused: already busy
      try {
        const found = await checkForUpdate()
        if (found) dispatch({ type: 'found', version: found.version, notes: found.notes })
        else dispatch({ type: 'none' })
      } catch (e) {
        dispatch({ type: 'checkFailed', message: String(e) })
      }
    },
    download: async () => {
      const before = get().state
      dispatch({ type: 'downloadStart' })
      if (get().state === before) return
      try {
        await downloadAndInstall((ev) => {
          if (ev.kind === 'started') dispatch({ type: 'progress', chunk: 0, total: ev.total })
          else if (ev.kind === 'chunk') dispatch({ type: 'progress', chunk: ev.length })
        })
        // Windows never reaches here (the NSIS installer exits the app); on
        // macOS the new bundle is staged and wants a relaunch.
        dispatch({ type: 'downloaded' })
      } catch (e) {
        dispatch({ type: 'downloadFailed', message: String(e) })
      }
    },
    restart: () => restartApp(),
    dismiss: () => dispatch({ type: 'dismiss' })
  }
})
