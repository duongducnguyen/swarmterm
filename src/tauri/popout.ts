import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

/** Open a URL in a real separate Tauri window (for sites that refuse iframing). */
export function openExternalWindow(url: string): void {
  const label = `popout-${crypto.randomUUID()}`
  // eslint-disable-next-line no-new
  new WebviewWindow(label, { url, title: url, width: 1024, height: 768 })
}
