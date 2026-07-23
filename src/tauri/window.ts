import { getCurrentWindow } from '@tauri-apps/api/window'

const appWindow = getCurrentWindow()

export const minimize = (): Promise<void> => appWindow.minimize()
export const toggleMaximize = (): Promise<void> => appWindow.toggleMaximize()
export const closeWindow = (): Promise<void> => appWindow.close()
export const showWindow = (): Promise<void> => appWindow.show()

/** Invoke `cb` with the current maximized state now and on every resize.
 *  Returns an unlisten function. */
export async function onMaximizedChanged(
  cb: (maximized: boolean) => void
): Promise<() => void> {
  cb(await appWindow.isMaximized())
  return appWindow.onResized(async () => cb(await appWindow.isMaximized()))
}

/** Invoke `cb` with the current full-screen state now and on every resize.
 *
 *  Tauri exposes no dedicated full-screen event, but entering/leaving native
 *  macOS full screen always resizes the window, so piggy-backing on `onResized`
 *  catches every transition — including the ones we don't drive ourselves
 *  (green traffic light, ⌃⌘F, Mission Control).
 *  Returns an unlisten function. */
export async function onFullscreenChanged(
  cb: (fullscreen: boolean) => void
): Promise<() => void> {
  cb(await appWindow.isFullscreen())
  return appWindow.onResized(async () => cb(await appWindow.isFullscreen()))
}
