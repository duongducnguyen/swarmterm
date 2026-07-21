/**
 * OS drag-and-drop bridge. The webview never sees these as HTML5 drop events:
 * Tauri intercepts the OS drag (`dragDropEnabled` defaults to true), and even
 * with it off `dataTransfer.files` yields File objects with no absolute path —
 * which is the only thing we actually want. So the native event is the sole
 * source.
 */
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { UnlistenFn } from '@tauri-apps/api/event'

/** Physical-pixel cursor position reported by Tauri. */
export interface DropPosition {
  x: number
  y: number
}

export type FileDropEvent =
  | { type: 'enter'; paths: string[]; position: DropPosition }
  | { type: 'over'; position: DropPosition }
  | { type: 'drop'; paths: string[]; position: DropPosition }
  | { type: 'leave' }

/** Subscribe to OS file drags over this window. Resolves to an unlisten fn. */
export function onFileDrop(handler: (event: FileDropEvent) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    handler(event.payload as FileDropEvent)
  })
}
