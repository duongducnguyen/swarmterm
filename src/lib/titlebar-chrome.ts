/**
 * Title-bar chrome geometry — which insets the custom header must reserve for
 * OS-drawn window buttons.
 *
 * Only macOS draws anything over our frameless header (titleBarStyle Overlay,
 * see tauri.macos.conf.json), and only while the window is *not* in native
 * full screen: entering full screen moves the traffic lights out of the window
 * frame and into the auto-hiding menu-bar overlay, so a fixed inset would leave
 * a 5rem hole at the left of the header. Pure so it can be unit-tested without
 * a window.
 */

/** True when the header must leave room at its left for native traffic lights. */
export function needsTrafficLightInset(isMac: boolean, isFullscreen: boolean): boolean {
  return isMac && !isFullscreen
}
