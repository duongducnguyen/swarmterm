import { useEffect, useRef, type ReactElement } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Swords, X } from 'lucide-react'
import { useWarRoomStore, type WarRoomMember } from '@/store/war-room-store'
import { useTerminalActivityStore } from '@/store/terminal-activity-store'
import { warRoomLeave } from '@/tauri/warroom'
import { MEMBER_DRAG_PREFIX, WAR_ROOM_DROP_ID } from '@/lib/war-room-drop'
import { formatEvent } from '@/lib/war-room-transcript'
import { templateById, DEFAULT_TEMPLATE_ID } from '@/lib/templates'
import { AgentIcon } from '@/components/AgentIcon'
import { cn } from '@/lib/utils'

function MemberChip({ member }: { member: WarRoomMember }): ReactElement {
  const active = useTerminalActivityStore((s) => s.active[member.terminalId] ?? false)
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${MEMBER_DRAG_PREFIX}${member.terminalId}`
  })
  const template = templateById(member.agentId ?? DEFAULT_TEMPLATE_ID)
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      tabIndex={-1}
      className={cn(
        'flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-xs',
        isDragging && 'opacity-40'
      )}
      title={member.cwd}
    >
      <AgentIcon template={template} className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-40 truncate">{member.name}</span>
      {member.agentId === null && (
        <span
          className="rounded bg-muted px-1 text-[10px] text-muted-foreground"
          title={
            'No agent CLI detected in this pane. To connect one manually, point its MCP ' +
            'config at $SWARMTERM_MCP_URL with header "Authorization: Bearer $SWARMTERM_SESSION" ' +
            '(both are set in this terminal\'s environment).'
          }
        >
          manual
        </span>
      )}
      <span
        className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-yellow-400' : 'bg-muted-foreground/40')}
        aria-label={active ? 'busy' : 'idle'}
      />
      <button
        data-no-dnd
        onClick={() => void warRoomLeave(member.terminalId)}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Remove ${member.name} from the War Room`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function WarRoomPanel(): ReactElement {
  const members = useWarRoomStore((s) => s.members)
  const transcript = useWarRoomStore((s) => s.transcript)
  const { setNodeRef, isOver } = useDroppable({ id: WAR_ROOM_DROP_ID })

  // Auto-follow the transcript: only snap to the new bottom when the user was
  // already there, so scrolling up to re-read history isn't yanked away.
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)

  function handleScroll(): void {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [transcript.length])

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden',
        isOver && 'ring-2 ring-inset ring-[#f97316]'
      )}
    >
      <div className="shrink-0 border-b border-border p-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Swords className="h-3.5 w-3.5" />
          Members — {members.length}
        </div>
        {members.length === 0 ? (
          <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Drag terminal panes here. Their agents can then message each other,
            debate, and hand tasks over — drag a member out to revoke access.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <MemberChip key={m.terminalId} member={m} />
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
        {transcript.map((e) => {
          const row = formatEvent(e)
          return (
            <div key={row.seq} className="mb-1.5">
              <div
                className={cn(
                  'font-medium',
                  row.icon === 'execute' ? 'text-[#f97316]' : 'text-muted-foreground'
                )}
              >
                {row.headline}
              </div>
              {row.body !== undefined && (
                <div className="whitespace-pre-wrap break-words text-foreground">{row.body}</div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
