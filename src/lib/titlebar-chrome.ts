/**
 * Title-bar chrome geometry — the space the OS takes from our frameless header,
 * and when it takes it.
 *
 * Only macOS draws anything over that header (titleBarStyle Overlay, see
 * tauri.macos.conf.json), and it does so in two different ways:
 *
 * 1. In a normal window the traffic lights sit inside our header at the left,
 *    so the left cluster is inset to clear them.
 * 2. In native full screen the lights leave the window frame entirely (a fixed
 *    inset would just be a hole). Instead, when the pointer touches the top edge
 *    of the screen, macOS slides the menu bar AND the auto-hiding titlebar down
 *    ON TOP of our content — swallowing the whole header and half the tab strip.
 *
 * Case 2 is what `nextSystemChromeReveal` / `systemChromeOffset` exist for: the
 * app shifts down by exactly the band the OS is about to occupy, so the revealed
 * chrome lands in empty space instead of covering the header — the same result
 * Chrome gets by making its tab strip a native titlebar accessory, which a
 * webview header cannot be. Pure so it can be unit-tested without a window.
 */

/** True when the header must leave room at its left for native traffic lights. */
export function needsTrafficLightInset(isMac: boolean, isFullscreen: boolean): boolean {
  return isMac && !isFullscreen
}

/**
 * Height of the band the revealed system chrome occupies: menu bar + titlebar.
 * Deliberately on the generous side of the ~54px a non-notched display uses, so
 * the taller menu bar of a notched Mac is covered too — the shift only exists
 * while the pointer is up there, so a few extra pixels cost nothing, whereas
 * being short by a few pixels puts the traffic lights back on top of the header.
 */
export const SYSTEM_CHROME_HEIGHT_PX = 62

/** Pointer distance from the top that triggers macOS to reveal the chrome. */
const REVEAL_AT_PX = 2

/**
 * Whether the system chrome should be treated as revealed, given where the
 * pointer is now and whether it was revealed a moment ago.
 *
 * Hysteresis, not a single threshold: macOS opens the overlay when the pointer
 * hits the very top edge and keeps it open while the pointer stays within it.
 * Collapsing as soon as the pointer left the top 2px would yank the app back up
 * from under a still-visible overlay every time the user reached for the traffic
 * lights.
 */
export function nextSystemChromeReveal(current: boolean, pointerY: number): boolean {
  if (pointerY <= REVEAL_AT_PX) return true
  if (current) return pointerY <= SYSTEM_CHROME_HEIGHT_PX
  return false
}

/** Pixels to push the whole app down so the revealed system chrome clears it. */
export function systemChromeOffset(
  isMac: boolean,
  isFullscreen: boolean,
  revealed: boolean
): number {
  return isMac && isFullscreen && revealed ? SYSTEM_CHROME_HEIGHT_PX : 0
}
