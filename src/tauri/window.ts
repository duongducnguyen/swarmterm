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
