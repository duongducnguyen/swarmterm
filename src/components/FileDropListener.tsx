import { useEffect, type ReactElement } from 'react'
import { onFileDrop, type DropPosition } from '@/tauri/dragdrop'
import { formatDroppedPaths, dropPointToCss } from '@/lib/terminal-drop'
import { isMacPlatform } from '@/lib/platform'
import { focusTerminal, pasteIntoTerminal } from '@/lib/terminal-registry'
import { useAppStore } from '@/store/app-store'
import type { ShellFlavor } from '@/lib/agent-spawn-command'

/** The pane under a drop point, resolved from the DOM contract in TerminalPane. */
interface DropPane {
  terminalId: string
  leafId: string
  flavor: ShellFlavor
}

function paneAt(position: DropPosition): DropPane | null {
  const point = dropPointToCss(position, window.devicePixelRatio, isMacPlatform())
  const el = document.elementFromPoint(point.x, point.y)
  const pane = el?.closest<HTMLElement>('[data-terminal-id]')
  const terminalId = pane?.dataset.terminalId
  const leafId = pane?.dataset.leafId
  const flavor = pane?.dataset.shellFlavor as ShellFlavor | undefined
  if (!terminalId || !leafId || !flavor) return null
  return { terminalId, leafId, flavor }
}

/**
 * Types the paths of files dropped from the OS file manager into whichever pane
 * they were dropped on. Renders nothing; mounted once at app level because the
 * native drag event is per-window, not per-element.
 */
export function FileDropListener(): ReactElement | null {
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    void onFileDrop((event) => {
      const { setDropTarget, setFocusedLeaf } = useAppStore.getState()

      if (event.type === 'leave') {
        setDropTarget(null)
        return
      }
      if (event.type === 'enter' || event.type === 'over') {
        setDropTarget(paneAt(event.position)?.terminalId ?? null)
        return
      }

      setDropTarget(null)
      const target = paneAt(event.position)
      // Dropped outside any pane (navbar, preview column, Welcome): do nothing
      // rather than guess at the focused pane and type into the wrong shell.
      if (!target) return

      const text = formatDroppedPaths(event.paths, target.flavor)
      if (text === '') return

      // Paste rather than write: this routes through the registry's onData, so
      // when broadcast is armed the path lands in every selected pane, matching
      // what typing does.
      pasteIntoTerminal(target.terminalId, text)
      setFocusedLeaf(target.leafId)
      focusTerminal(target.terminalId)
    }).then((fn) => {
      // The effect may have been torn down before the listener resolved.
      if (cancelled) fn()
      else unlisten = fn
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return null
}
