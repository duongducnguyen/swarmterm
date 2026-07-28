/**
 * Watches the war-room queues and the per-terminal activity flag, and types
 * queued deliveries into a pane only after NUDGE_IDLE_MS of sustained quiet.
 * Wiring lives outside React (like terminal-registry) because deliveries must
 * fire while the War Room panel — or the whole right panel — is unmounted.
 */
import { deliverPromptToTerminal, submitTerminalPrompt } from '@/lib/terminal-registry'
import { NUDGE_IDLE_MS, shouldDeferDelivery } from '@/lib/war-room-nudge'
import { selectFocusedTerminalId, useAppStore } from '@/store/app-store'
import { useTerminalActivityStore } from '@/store/terminal-activity-store'
import { useTerminalTypingStore } from '@/store/terminal-typing-store'
import { useWarRoomStore } from '@/store/war-room-store'

/**
 * Gap between a flushed payload's body write and its Enter. Must land as its
 * own later input-loop tick, not glued onto the paste's close marker — the
 * target TUI guards against an Enter arriving in the same stdin flush as a
 * paste (see `deliverPromptToTerminal`'s doc comment), so anything sent in
 * the same flush is eaten. 300ms is one tick past that flush, comfortably
 * clear of any paste-burst coalescing window the TUI might apply.
 */
export const SUBMIT_DELAY_MS = 300

/**
 * How often a held queue re-asks "is the user still typing?". The recency arm
 * of `shouldDeferDelivery` expires on a clock, not on a store write, so a
 * timer is the only thing that can release it. The typing subscription below
 * just makes an Enter release it sooner than this interval.
 */
export const HOLD_RECHECK_MS = 750

export function startWarRoomDelivery(): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  // Body/submit writes staggered off a fired idle timer. Kept separate from
  // `timers` (which only ever holds the per-terminal idle countdown, one
  // entry per terminal) because a single flush can schedule several of
  // these at once and `stop()` must be able to cancel them even after the
  // idle timer that spawned them has already fired and been forgotten.
  const pending = new Set<ReturnType<typeof setTimeout>>()

  const cancel = (terminalId: string): void => {
    const t = timers.get(terminalId)
    if (t !== undefined) {
      clearTimeout(t)
      timers.delete(terminalId)
    }
  }

  /** True when typing into this pane right now would land mid-sentence. */
  function isUserTyping(terminalId: string): boolean {
    const typing = useTerminalTypingStore.getState()
    return shouldDeferDelivery(
      {
        focused: selectFocusedTerminalId(useAppStore.getState()) === terminalId,
        lastKeyAt: typing.lastKeyAt[terminalId],
        dirty: typing.dirty[terminalId] ?? false
      },
      Date.now()
    )
  }

  function schedule(terminalId: string, delay: number = NUDGE_IDLE_MS): void {
    if (timers.has(terminalId)) return
    if (useTerminalActivityStore.getState().active[terminalId]) return // wait for idle edge
    timers.set(
      terminalId,
      setTimeout(() => fire(terminalId), delay)
    )
  }

  function fire(terminalId: string): void {
    timers.delete(terminalId)
    // Re-check at fire time: output may have restarted, or the pane may
    // have left the room (leave drops its queue).
    if (useTerminalActivityStore.getState().active[terminalId]) return
    // Membership re-check closes a cross-thread race: the Rust MCP worker
    // (deliver) and the command/reader thread (leave) emit independently,
    // so a `warroom:deliver` for a terminal that just left can be applied
    // to the store AFTER the leave — re-creating a queue for an evicted
    // terminal. Without this, 3s later the flush would type into a
    // revoked (or respawned-but-never-rejoined) pane. Revocation must
    // hold even against event reordering.
    if (!useWarRoomStore.getState().isMember(terminalId)) return
    // Output-idle is not enough: the user may be mid-line in this very pane,
    // and typing a nudge into it would corrupt what they are writing. Hold
    // the queue (never drop it) and re-arm. There is no maximum hold on
    // purpose — see `shouldDeferDelivery`.
    if (isUserTyping(terminalId)) {
      useWarRoomStore.getState().setHeld(terminalId, true)
      schedule(terminalId, HOLD_RECHECK_MS)
      return
    }
    useWarRoomStore.getState().setHeld(terminalId, false)
    const payloads = useWarRoomStore.getState().takeFlush(terminalId)
    // Multiple payloads in one flush must not interleave their body and
    // Enter writes — deliver payload 0, submit it, only THEN deliver
    // payload 1 — or the agent could see a second paste land while it's
    // still deciding whether the first Enter was a real keypress.
    // Staggered on one clock: payload i's body goes at i*2*SUBMIT_DELAY_MS,
    // its submit at (i*2+1)*SUBMIT_DELAY_MS. No membership re-check per
    // stagger step — `isMember` was already checked above for this
    // flush, and each write's own `entries.get` guard (in
    // deliverPromptToTerminal/submitTerminalPrompt) covers the pane
    // being disposed out from under a pending write.
    payloads.forEach((text, i) => {
      const deliverTimer = setTimeout(
        () => {
          pending.delete(deliverTimer)
          deliverPromptToTerminal(terminalId, text)
        },
        i * 2 * SUBMIT_DELAY_MS
      )
      const submitTimer = setTimeout(
        () => {
          pending.delete(submitTimer)
          submitTerminalPrompt(terminalId)
        },
        (i * 2 + 1) * SUBMIT_DELAY_MS
      )
      pending.add(deliverTimer)
      pending.add(submitTimer)
    })
  }

  const unsubQueues = useWarRoomStore.subscribe((state, prev) => {
    if (state.queues === prev.queues) return
    for (const terminalId of Object.keys(state.queues)) schedule(terminalId)
  })

  const unsubActivity = useTerminalActivityStore.subscribe((state, prev) => {
    if (state.active === prev.active) return
    for (const terminalId of Object.keys(useWarRoomStore.getState().queues)) {
      if (state.active[terminalId]) cancel(terminalId) // burst mid-countdown: restart later
      else schedule(terminalId)
    }
  })

  const unsubTyping = useTerminalTypingStore.subscribe((state, prev) => {
    if (state.dirty === prev.dirty && state.lastKeyAt === prev.lastKeyAt) return
    // ONLY already-held terminals are woken. A queue still inside its normal
    // idle countdown must keep waiting — a keystroke in some other pane must
    // never short-circuit it into delivering early.
    const { held } = useWarRoomStore.getState()
    for (const terminalId of Object.keys(held)) {
      if (!isUserTyping(terminalId)) {
        cancel(terminalId)
        schedule(terminalId, 0)
      }
    }
  })

  return () => {
    unsubQueues()
    unsubActivity()
    unsubTyping()
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    for (const t of pending) clearTimeout(t)
    pending.clear()
  }
}
