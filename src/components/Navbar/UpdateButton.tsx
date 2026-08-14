import type { ReactElement } from 'react'
import { Download, RotateCw } from 'lucide-react'
import { updateButtonView } from '@/lib/updater-flow'
import { useUpdaterStore } from '@/store/updater-store'
import { Button } from '@/components/ui/button'

/** Sits under Settings only while an update exists — the button's presence is
 * the whole notification (the silent startup/periodic checks summon it; there
 * is no manual in-app check). Primary-colored on purpose: it is the only
 * filled button in the navbar, so it reads as the one call to action. One
 * click per stage: download, then restart; a failed download turns it into
 * Retry with the error in the tooltip. */
export function UpdateButton(): ReactElement | null {
  const state = useUpdaterStore((s) => s.state)
  const view = updateButtonView(state)
  if (view === null) return null

  const { download, restart } = useUpdaterStore.getState()
  return (
    <Button
      size="sm"
      onClick={
        view.kind === 'update'
          ? () => void download()
          : view.kind === 'restart'
            ? () => void restart()
            : undefined
      }
      disabled={view.kind === 'downloading'}
      className="w-full justify-start"
      title={view.kind === 'update' ? view.tooltip : view.label}
    >
      {view.kind === 'restart' ? (
        <RotateCw className="h-4 w-4" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {view.label}
    </Button>
  )
}
