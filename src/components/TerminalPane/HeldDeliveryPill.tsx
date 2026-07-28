/**
 * Shown inside a pane whose War Room deliveries are being withheld because the
 * user has an unsubmitted line here. Clicking does NOT bypass the scheduler —
 * it clears the typing signal, which is the thing the scheduler waits on (see
 * war-room-delivery.ts). The pane's normal output-idle gate still applies.
 */
import type { ReactElement } from 'react'
import { Swords } from 'lucide-react'
import { useWarRoomStore } from '@/store/war-room-store'
import { useTerminalTypingStore } from '@/store/terminal-typing-store'

export function HeldDeliveryPill({ terminalId }: { terminalId: string }): ReactElement | null {
  const held = useWarRoomStore((s) => s.held[terminalId] ?? false)
  const count = useWarRoomStore((s) => s.queues[terminalId]?.length ?? 0)
  if (!held || count === 0) return null
  return (
    <button
      data-no-dnd
      tabIndex={-1}
      // Never pull DOM focus off the terminal the user is mid-sentence in —
      // mousedown, not click, is what would move it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => useTerminalTypingStore.getState().clearTyping(terminalId)}
      title="Held because you're typing here. Click to deliver now."
      className="absolute bottom-2 right-3 z-10 flex items-center gap-1.5 rounded-full border border-[#f97316]/40 bg-card/95 px-2.5 py-1 text-[11px] text-muted-foreground shadow-lg transition-colors hover:text-foreground"
    >
      <Swords className="h-3 w-3 shrink-0 text-[#f97316]" />
      {count === 1 ? '1 message waiting' : `${count} messages waiting`}
      <span className="font-medium text-[#f97316]">Deliver now</span>
    </button>
  )
}
