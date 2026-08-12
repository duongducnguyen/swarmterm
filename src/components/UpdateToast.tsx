import { Button } from '@/components/ui/button'
import { progressPercent } from '@/lib/updater-flow'
import { useUpdaterStore } from '@/store/updater-store'

/** Bottom-left so the native preview webview (right column) can never paint
 *  over it; deliberately NOT an overlay in the overlay-watch sense — an
 *  update nag must not blank the user's preview. `data-focus-return` hands
 *  focus back to the terminal after any click inside. */
export function UpdateToast() {
  const state = useUpdaterStore((s) => s.state)
  const { download, restart, dismiss } = useUpdaterStore.getState()

  if (state.phase === 'idle' || state.phase === 'checking') return null

  const pct = progressPercent(state)
  return (
    <div
      data-focus-return
      className="fixed bottom-3 left-3 z-50 w-80 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
    >
      {state.phase === 'available' && (
        <>
          <div className="font-medium">Update available: v{state.version}</div>
          {state.error && (
            <div className="mt-1 text-xs text-destructive">Download failed: {state.error}</div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Dismiss
            </Button>
            <Button size="sm" onClick={() => void download()}>
              Download
            </Button>
          </div>
        </>
      )}
      {state.phase === 'downloading' && (
        <>
          <div className="font-medium">Downloading v{state.version}…</div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
            <div
              className={
                pct === null ? 'h-full w-1/3 animate-pulse bg-primary' : 'h-full bg-primary'
              }
              style={pct === null ? undefined : { width: `${pct}%` }}
            />
          </div>
        </>
      )}
      {state.phase === 'ready' && (
        <>
          <div className="font-medium">v{state.version} is ready</div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Later
            </Button>
            <Button size="sm" onClick={() => void restart()}>
              Restart to update
            </Button>
          </div>
        </>
      )}
      {state.phase === 'upToDate' && (
        <>
          <div className="font-medium">Swarmterm is up to date</div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              OK
            </Button>
          </div>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <div className="font-medium">Update check failed</div>
          <div className="mt-1 break-words text-xs text-muted-foreground">{state.message}</div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Dismiss
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
