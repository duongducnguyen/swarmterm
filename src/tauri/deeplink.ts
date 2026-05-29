import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface PreviewOpenEvent {
  terminalId: string
  url: string
}

/** Subscribe to backend `preview:open` events (validated deep links). */
export function onPreviewOpen(handler: (e: PreviewOpenEvent) => void): Promise<UnlistenFn> {
  return listen<PreviewOpenEvent>('preview:open', (event) => handler(event.payload))
}
