// Discord-style War Room panel shell: sub-tabs over the Members roster and
// the Discussion transcript. The whole panel is the drop zone. The tab bodies
// live in their own files — this one only routes between them.
import { useState, type ReactElement, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Swords } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useWarRoomStore } from '@/store/war-room-store'
import { WAR_ROOM_DROP_ID } from '@/lib/war-room-drop'
import { groupTranscript } from '@/lib/war-room-transcript'
import { MembersTab } from './MembersTab'
import { ClearButton, DiscussionTab } from './DiscussionTab'
import { RoomTabs } from './RoomTabs'
import { cn } from '@/lib/utils'

export function WarRoomPanel(): ReactElement {
  const rooms = useWarRoomStore((s) => s.rooms)
  const activeRoomId = useWarRoomStore((s) => s.activeRoomId)
  const members = useWarRoomStore((s) =>
    s.activeRoomId !== null ? (s.membersByRoom[s.activeRoomId] ?? []) : []
  )
  const transcript = useWarRoomStore((s) =>
    s.activeRoomId !== null ? (s.transcriptByRoom[s.activeRoomId] ?? []) : []
  )
  const [tab, setTab] = useState<'members' | 'discussion'>('discussion')
  const { setNodeRef, isOver } = useDroppable({ id: WAR_ROOM_DROP_ID })

  // Waiting-message counts per room: the tab badge must be visible even while
  // another room is on screen — held state is per-terminal, so bucket it by
  // each member's room.
  const heldByRoom = useWarRoomStore(
    useShallow((s) => {
      const out: Record<string, number> = {}
      for (const [roomId, ms] of Object.entries(s.membersByRoom)) {
        let n = 0
        for (const m of ms) if (s.held[m.terminalId]) n += s.queues[m.terminalId]?.length ?? 0
        if (n > 0) out[roomId] = n
      }
      return out
    })
  )
  const heldTotal = heldByRoom[activeRoomId ?? ''] ?? 0

  const subTab = (key: 'members' | 'discussion', label: ReactNode): ReactElement => (
    <button
      onClick={() => setTab(key)}
      className={cn(
        'rounded px-2 py-0.5 text-xs transition-colors',
        tab === key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden',
        isOver && 'ring-2 ring-inset ring-[#f97316]'
      )}
    >
      <RoomTabs
        rooms={rooms}
        activeRoomId={activeRoomId}
        heldByRoom={heldByRoom}
        onSelect={(id) => useWarRoomStore.getState().setActiveRoom(id)}
      />
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <Swords className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
        {subTab(
          'members',
          <>
            {`Members · ${members.length}`}
            {heldTotal > 0 && <span className="ml-1 text-[#f97316]">⏸{heldTotal}</span>}
          </>
        )}
        {subTab('discussion', 'Discussion')}
        <div className="ml-auto flex items-center">
          {tab === 'discussion' && activeRoomId !== null && <ClearButton roomId={activeRoomId} />}
        </div>
      </div>

      {tab === 'members' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MembersTab members={members} />
        </div>
      ) : (
        <DiscussionTab items={groupTranscript(transcript)} />
      )}
    </div>
  )
}
