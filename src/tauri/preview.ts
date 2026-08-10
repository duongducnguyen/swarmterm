import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface PreviewOpenEvent {
  terminalId: string
  url: string
}

/** Subscribe to backend `preview:open` events (emitted by the MCP browser tool). */
export function onPreviewOpen(handler: (e: PreviewOpenEvent) => void): Promise<UnlistenFn> {
  return listen<PreviewOpenEvent>('preview:open', (event) => handler(event.payload))
}

/** Logical px relative to the main window — what getBoundingClientRect yields. */
export interface PreviewBoundsPayload {
  x: number
  y: number
  width: number
  height: number
}

/** Wire shape of `preview:state` — must stay in lockstep with PreviewStateEvent in preview.rs. */
export interface PreviewStateEvent {
  terminalId: string
  url?: string
  title?: string
  loading?: boolean
}

/** Wire shape of `preview:popup` — must stay in lockstep with PreviewPopupEvent in preview.rs. */
export interface PreviewPopupEvent {
  terminalId: string
  url: string
}

export function previewOpen(
  terminalId: string,
  url: string,
  bounds: PreviewBoundsPayload
): Promise<void> {
  return invoke('preview_open', { terminalId, url, bounds })
}

export function previewNavigate(terminalId: string, url: string): Promise<void> {
  return invoke('preview_navigate', { terminalId, url })
}

export function previewReload(terminalId: string): Promise<void> {
  return invoke('preview_reload', { terminalId })
}

export function previewBack(terminalId: string): Promise<void> {
  return invoke('preview_back', { terminalId })
}

export function previewForward(terminalId: string): Promise<void> {
  return invoke('preview_forward', { terminalId })
}

export function previewSetBounds(
  terminalId: string,
  bounds: PreviewBoundsPayload
): Promise<void> {
  return invoke('preview_set_bounds', { terminalId, bounds })
}

export function previewSetVisible(terminalId: string, visible: boolean): Promise<void> {
  return invoke('preview_set_visible', { terminalId, visible })
}

export function previewClose(terminalId: string): Promise<void> {
  return invoke('preview_close', { terminalId })
}

/** Subscribe to per-webview navigation/title/loading updates. */
export function onPreviewState(handler: (e: PreviewStateEvent) => void): Promise<UnlistenFn> {
  return listen<PreviewStateEvent>('preview:state', (event) => handler(event.payload))
}

/** Subscribe to denied window.open requests (popups navigate in place). */
export function onPreviewPopup(handler: (e: PreviewPopupEvent) => void): Promise<UnlistenFn> {
  return listen<PreviewPopupEvent>('preview:popup', (event) => handler(event.payload))
}
