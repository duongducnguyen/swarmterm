import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface PreviewOpenEvent {
  terminalId: string
  url: string
}

/** Subscribe to backend `preview:open` events (validated deep links). */
export function onPreviewOpen(handler: (e: PreviewOpenEvent) => void): Promise<UnlistenFn> {
  return listen<PreviewOpenEvent>('preview:open', (event) => handler(event.payload))
}

/** Subscribe to backend `auth:callback` events (OAuth PKCE code arrived). */
export function onAuthCallback(handler: (code: string) => void): Promise<UnlistenFn> {
  return listen<{ code: string }>('auth:callback', (event) => handler(event.payload.code))
}

export interface TerminalTitleEvent {
  terminalId: string
  title: string
}

/** Subscribe to backend `terminal:title` events (agent-set pane titles via MCP). */
export function onTerminalTitle(handler: (e: TerminalTitleEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalTitleEvent>('terminal:title', (event) => handler(event.payload))
}
