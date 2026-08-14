/**
 * Pure state machine for the in-app updater. The rules that matter live here,
 * not in the store or the toast:
 *  - a startup ("silent") check must never nag — up-to-date and failures both
 *    collapse back to idle; only a manual tray check surfaces them,
 *  - one flight at a time — check/download events during the wrong phase are
 *    ignored rather than queued,
 *  - a failed download falls back to `available` with the error attached, so
 *    retry is just clicking Download again.
 */
export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking'; manual: boolean }
  | { phase: 'available'; version: string; notes?: string; error?: string }
  | { phase: 'downloading'; version: string; downloaded: number; total?: number }
  | { phase: 'ready'; version: string }
  | { phase: 'upToDate' }
  | { phase: 'error'; message: string }

export type UpdaterEvent =
  | { type: 'check'; manual: boolean }
  | { type: 'found'; version: string; notes?: string }
  | { type: 'none' }
  | { type: 'checkFailed'; message: string }
  | { type: 'downloadStart' }
  | { type: 'progress'; chunk: number; total?: number }
  | { type: 'downloaded' }
  | { type: 'downloadFailed'; message: string }
  | { type: 'dismiss' }

/** Delayed so the check never competes with pty spawn on boot. */
export const STARTUP_CHECK_DELAY_MS = 5_000

/** Swarmterm runs for days — without an in-app "check" button the periodic
 * re-check is the only way a long-lived instance ever learns of a release. */
export const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export function reduceUpdater(state: UpdaterState, ev: UpdaterEvent): UpdaterState {
  switch (ev.type) {
    case 'check':
      // Never interrupt an in-flight check or download; a manual check may
      // restart from any settled phase (idle, available, upToDate, error…).
      if (state.phase === 'checking' || state.phase === 'downloading') return state
      return { phase: 'checking', manual: ev.manual }
    case 'found':
      if (state.phase !== 'checking') return state
      return { phase: 'available', version: ev.version, notes: ev.notes }
    case 'none':
      if (state.phase !== 'checking') return state
      return state.manual ? { phase: 'upToDate' } : { phase: 'idle' }
    case 'checkFailed':
      if (state.phase !== 'checking') return state
      return state.manual ? { phase: 'error', message: ev.message } : { phase: 'idle' }
    case 'downloadStart':
      if (state.phase !== 'available') return state
      return { phase: 'downloading', version: state.version, downloaded: 0 }
    case 'progress':
      if (state.phase !== 'downloading') return state
      return {
        ...state,
        downloaded: state.downloaded + ev.chunk,
        total: ev.total ?? state.total
      }
    case 'downloaded':
      if (state.phase !== 'downloading') return state
      return { phase: 'ready', version: state.version }
    case 'downloadFailed':
      if (state.phase !== 'downloading') return state
      return { phase: 'available', version: state.version, error: ev.message }
    case 'dismiss':
      // Downloads have no cancel path in the plugin; everything else clears.
      return state.phase === 'downloading' ? state : { phase: 'idle' }
  }
}

/** Percent 0–100, or null while the total is unknown (indeterminate bar). */
export function progressPercent(state: UpdaterState): number | null {
  if (state.phase !== 'downloading' || state.total === undefined || state.total <= 0) return null
  return Math.min(100, Math.round((state.downloaded / state.total) * 100))
}

/** What the navbar update button should show — or null, which is the normal
 * state: the button only exists while there is an update to act on, so its
 * mere presence is the notification. */
export type UpdateButtonView =
  | { kind: 'update'; label: string; tooltip: string }
  | { kind: 'downloading'; label: string }
  | { kind: 'restart'; label: string }

export function updateButtonView(state: UpdaterState): UpdateButtonView | null {
  switch (state.phase) {
    case 'available':
      return state.error
        ? { kind: 'update', label: 'Retry update', tooltip: `Download failed: ${state.error}` }
        : {
            kind: 'update',
            label: `Update to v${state.version}`,
            tooltip: `Update to v${state.version}`
          }
    case 'downloading': {
      const pct = progressPercent(state)
      return { kind: 'downloading', label: pct === null ? 'Downloading…' : `Downloading… ${pct}%` }
    }
    case 'ready':
      return { kind: 'restart', label: 'Restart to update' }
    default:
      return null
  }
}
