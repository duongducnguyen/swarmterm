/**
 * Watches the war-room queues and the per-terminal activity flag, and types
 * queued deliveries into a pane only after NUDGE_IDLE_MS of sustained quiet.
 * Wiring lives outside React (like terminal-registry) because deliveries must
 * fire while the War Room panel — or the whole right panel — is unmounted.
 */
import { deliverPromptToTerminal } from '@/lib/terminal-registry'
import { NUDGE_IDLE_MS } from '@/lib/war-room-nudge'
import { useTerminalActivityStore } from '@/store/terminal-activity-store'
import { useWarRoomStore } from '@/store/war-room-store'

export function startWarRoomDelivery(): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const cancel = (terminalId: string): void => {
    const t = timers.get(terminalId)
    if (t !== undefined) {
      clearTimeout(t)
      timers.delete(terminalId)
    }
  }

  const schedule = (terminalId: string): void => {
    if (timers.has(terminalId)) return
    if (useTerminalActivityStore.getState().active[terminalId]) return // wait for idle edge
    timers.set(
      terminalId,
      setTimeout(() => {
        timers.delete(terminalId)
        // Re-check at fire time: output may have restarted, or the pane may
        // have left the room (leave drops its queue).
        if (useTerminalActivityStore.getState().active[terminalId]) return
        for (const text of useWarRoomStore.getState().takeFlush(terminalId)) {
          deliverPromptToTerminal(terminalId, text)
        }
      }, NUDGE_IDLE_MS)
    )
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

  return () => {
    unsubQueues()
    unsubActivity()
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
  }
}
