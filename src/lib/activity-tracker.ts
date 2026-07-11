/**
 * Debounced active/idle state machine, keyed by an arbitrary target. Marks a
 * target "active" on the first notify and flips it back to idle after `idleMs`
 * of quiet, coalescing repeated notifies. DOM-agnostic and timer-driven so it
 * is unit-testable under the `node` test environment.
 *
 * Two consumers: the minimal-overlay scrollbars (reveal-while-scrolling, see
 * scrollbar-activity.ts) and the per-terminal activity indicator (yellow while
 * a pty streams output, see terminal-registry.ts).
 */
const DEFAULT_IDLE_MS = 900

export class ActivityTracker<T> {
  private readonly setActive: (target: T, active: boolean) => void
  private readonly idleMs: number
  private readonly timers = new Map<T, ReturnType<typeof setTimeout>>()

  constructor(setActive: (target: T, active: boolean) => void, idleMs: number = DEFAULT_IDLE_MS) {
    this.setActive = setActive
    this.idleMs = idleMs
  }

  /** Record a tick from `target`. Activates it if idle; resets the idle timer. */
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

  /**
   * Drop a single target's pending idle timer WITHOUT firing its idle callback.
   * Used when the target is being destroyed and its state is cleared elsewhere,
   * so a late timer can't re-introduce a stale entry.
   */
  cancel(target: T): void {
    const timer = this.timers.get(target)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.timers.delete(target)
    }
  }

  /** Cancel all pending idle timers (no deactivation callbacks fire). */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
