/**
 * Scroll-activity tracking for the minimal-overlay scrollbars.
 *
 * The scrollbars are hidden at rest and must become visible *while the user is
 * scrolling* (not only on hover — see
 * docs/design-docs/specs/2026-05-31-scrollbar-redesign-design.md). A native
 * scrollbar can't animate or "stay shown briefly" on its own, so we mark the
 * scrolled element with a `data-scrolling` attribute during activity and remove
 * it after a short idle window; CSS reveals the thumb while that attribute is
 * present.
 */

const ACTIVE_ATTR = 'data-scrolling'
const DEFAULT_IDLE_MS = 900

/**
 * DOM-agnostic state machine: marks a target "active" on the first notify and
 * flips it back to idle after `idleMs` of quiet, debouncing repeated notifies.
 * Kept free of any DOM reference so it is unit-testable under the `node` test
 * environment.
 */
export class ScrollActivityTracker<T> {
  private readonly setActive: (target: T, active: boolean) => void
  private readonly idleMs: number
  private readonly timers = new Map<T, ReturnType<typeof setTimeout>>()

  constructor(setActive: (target: T, active: boolean) => void, idleMs: number = DEFAULT_IDLE_MS) {
    this.setActive = setActive
    this.idleMs = idleMs
  }

  /** Record a scroll tick from `target`. Activates it if idle; resets the timer. */
  notify(target: T): void {
    const existing = this.timers.get(target)
    if (existing === undefined) this.setActive(target, true)
    else clearTimeout(existing)

    this.timers.set(
      target,
      setTimeout(() => {
        this.timers.delete(target)
        this.setActive(target, false)
      }, this.idleMs)
    )
  }

  /** Cancel all pending idle timers (no deactivation callbacks fire). */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}

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
  const tracker = new ScrollActivityTracker<Element>((el, active) => {
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
