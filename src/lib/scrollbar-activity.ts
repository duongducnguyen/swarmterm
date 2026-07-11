/**
 * Scroll-activity tracking for the minimal-overlay scrollbars.
 *
 * The debounced active/idle machine now lives in `activity-tracker.ts` and is
 * shared with the per-terminal activity indicator. This module keeps the
 * scroll-specific DOM wiring and re-exports the machine under its original
 * name for existing callers.
 */
import { ActivityTracker } from './activity-tracker'

/** @deprecated Prefer importing `ActivityTracker` from `./activity-tracker`. */
export { ActivityTracker as ScrollActivityTracker } from './activity-tracker'

const ACTIVE_ATTR = 'data-scrolling'
const DEFAULT_IDLE_MS = 900

/**
 * Install a single capture-phase scroll listener that toggles `data-scrolling`
 * on whichever element is scrolling. One listener covers every native scroll
 * container app-wide — including the dynamically-created `.xterm-viewport` and
 * the Settings modal — with no per-component wiring. Returns an uninstaller.
 */
export function installScrollbarActivity(
  doc: Document = document,
  idleMs: number = DEFAULT_IDLE_MS
): () => void {
  const tracker = new ActivityTracker<Element>((el, active) => {
    if (active) el.setAttribute(ACTIVE_ATTR, '')
    else el.removeAttribute(ACTIVE_ATTR)
  }, idleMs)

  function onScroll(event: Event): void {
    const target = event.target
    if (target instanceof Element) tracker.notify(target)
  }

  doc.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return () => {
    doc.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
    tracker.dispose()
  }
}
