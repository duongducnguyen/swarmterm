// Discord-style War Room panel: a Members tab (roster + status) and a
// Discussion tab (grouped chat). The one expressive element is the member
// identity color (avatar ring → name → header), derived from terminalId so it
// survives renames and re-joins; everything else stays in the app's VS Code
// palette. The whole panel is the drop zone.
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { LogIn, LogOut, Plug, Swords, Trash2, X } from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { useWarRoomStore, type WarRoomMember } from '@/store/war-room-store'
import { useTerminalActivityStore } from '@/store/terminal-activity-store'
import { warRoomLeave } from '@/tauri/warroom'
import { MEMBER_DRAG_PREFIX, WAR_ROOM_DROP_ID } from '@/lib/war-room-drop'
import {
  formatTime,
  groupTranscript,
  type TranscriptItem,
  type TranscriptMessage
} from '@/lib/war-room-transcript'
import { memberColor } from '@/lib/war-room-identity'
import { tokenizeMarkdown } from '@/lib/war-room-markdown'
import { focusTerminal } from '@/lib/terminal-registry'
import { templateById, DEFAULT_TEMPLATE_ID } from '@/lib/templates'
import { AgentIcon } from '@/components/AgentIcon'
import { cn } from '@/lib/utils'

const MANUAL_HINT =
  'No agent CLI detected in this pane. To connect one manually, point its MCP ' +
  'config at $SWARMTERM_MCP_URL with header "Authorization: Bearer $SWARMTERM_SESSION" ' +
  "(both are set in this terminal's environment)."

/** Jump to the member's pane: activate its workspace, focus its terminal. */
function jumpToTerminal(terminalId: string): void {
  useAppStore.getState().revealTerminal(terminalId)
  focusTerminal(terminalId)
}

function Avatar({
  terminalId,
  agentId,
  size = 'md',
  onClick
}: {
  terminalId: string
  agentId: string | null
  size?: 'sm' | 'md'
  onClick?: () => void
}): ReactElement {
  const template = templateById(agentId ?? DEFAULT_TEMPLATE_ID)
  const color = memberColor(terminalId)
  return (
    <button
      data-no-dnd
      tabIndex={-1}
      onClick={onClick}
      title="Go to this terminal"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'md' ? 'h-6 w-6' : 'h-4 w-4',
        onClick && 'cursor-pointer'
      )}
      style={{ backgroundColor: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}` }}
    >
      <AgentIcon template={template} className={size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'} />
    </button>
  )
}

// --- Members tab ----------------------------------------------------------

function MemberRow({ member }: { member: WarRoomMember }): ReactElement {
  const active = useTerminalActivityStore((s) => s.active[member.terminalId] ?? false)
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${MEMBER_DRAG_PREFIX}${member.terminalId}`
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      tabIndex={-1}
      onClick={() => jumpToTerminal(member.terminalId)}
      title={member.cwd}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40',
        isDragging && 'opacity-40'
      )}
    >
      <Avatar terminalId={member.terminalId} agentId={member.agentId} />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-xs font-medium"
          style={{ color: memberColor(member.terminalId) }}
        >
          {member.name}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">{member.cwd}</div>
      </div>
      {member.connected ? (
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            active ? 'bg-yellow-400' : 'bg-[#57f287]'
          )}
          title={active ? 'Working' : 'Connected, idle'}
        />
      ) : (
        <span
          className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-amber-400"
          title={
            'Waiting for the agent inside this pane to make its first war_room call. ' +
            'Until then peers cannot message it.' +
            (member.agentId === null ? ` ${MANUAL_HINT}` : '')
          }
        >
          pending
        </span>
      )}
      <button
        data-no-dnd
        onClick={(e) => {
          e.stopPropagation() // row click would jump to the pane being removed
          void warRoomLeave(member.terminalId)
        }}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label={`Remove ${member.name} from the War Room`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function MembersTab({ members }: { members: WarRoomMember[] }): ReactElement {
  if (members.length === 0) {
    return (
      <div className="m-2 rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
        Drag terminal panes here. Their agents can then message each other, debate, and
        hand tasks over — drag a member out to revoke access.
      </div>
    )
  }
  return (
    <div className="p-1">
      {members.map((m) => (
        <MemberRow key={m.terminalId} member={m} />
      ))}
    </div>
  )
}

// --- Discussion tab -------------------------------------------------------

function Markdown({ text }: { text: string }): ReactElement {
  return (
    <>
      {tokenizeMarkdown(text).map((tok, i) => {
        if (tok.t === 'bold') return <strong key={i}>{tok.v}</strong>
        if (tok.t === 'code')
          return (
            <code key={i} className="rounded bg-muted px-1 font-mono text-[11px]">
              {tok.v}
            </code>
          )
        if (tok.t === 'codeblock')
          return (
            <pre
              key={i}
              className="my-1 overflow-x-auto rounded border border-border bg-muted/50 p-2 font-mono text-[11px]"
            >
              {tok.v}
            </pre>
          )
        return <span key={i}>{tok.v}</span>
      })}
    </>
  )
}

const COLLAPSE_OVER_CHARS = 700

function MessageBody({ message }: { message: TranscriptMessage }): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const long = message.content.length > COLLAPSE_OVER_CHARS
  const shown = long && !expanded ? message.content.slice(0, COLLAPSE_OVER_CHARS) : message.content

  const body = (
    <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
      {message.toName !== null && message.mode === 'probe' && (
        <span className="mr-1 text-[10px] text-muted-foreground">→ {message.toName}</span>
      )}
      <Markdown text={shown} />
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-[10px] text-[#00b0f4] hover:underline"
        >
          {expanded ? 'Show less' : `Show more (${message.content.length - COLLAPSE_OVER_CHARS} chars)`}
        </button>
      )}
    </div>
  )

  if (message.mode === 'execute') {
    return (
      <div className="my-0.5 rounded-r border-l-2 border-[#f97316] bg-[#f97316]/10 py-1 pl-2 pr-1">
        <div className="text-[10px] font-semibold text-[#f97316]">
          ⚡ EXECUTE{message.toName !== null ? ` → ${message.toName}` : ''}
        </div>
        {body}
      </div>
    )
  }
  return body
}

const SYSTEM_ICONS = {
  join: LogIn,
  leave: LogOut,
  connected: Plug
} as const

function SystemLine({ item }: { item: Extract<TranscriptItem, { kind: 'system' }> }): ReactElement {
  const Icon = SYSTEM_ICONS[item.icon]
  return (
    <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-muted-foreground">
      <Icon className={cn('h-3 w-3', item.icon === 'connected' && 'text-[#57f287]')} />
      {item.text}
    </div>
  )
}

function MessageGroup({ item }: { item: Extract<TranscriptItem, { kind: 'group' }> }): ReactElement {
  // The sender may have left — colors derive from the id, so history keeps
  // its identity; the agent icon falls back via the (possibly gone) roster.
  const agentId = useWarRoomStore(
    (s) => s.members.find((m) => m.terminalId === item.fromId)?.agentId ?? null
  )
  return (
    <div className="rounded px-1 py-1 hover:bg-muted/30">
      <div className="flex items-center gap-2">
        <Avatar
          terminalId={item.fromId}
          agentId={agentId}
          onClick={() => jumpToTerminal(item.fromId)}
        />
        <button
          data-no-dnd
          tabIndex={-1}
          onClick={() => jumpToTerminal(item.fromId)}
          className="truncate text-xs font-semibold hover:underline"
          style={{ color: memberColor(item.fromId) }}
        >
          {item.fromName}
        </button>
        <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(item.firstTs)}</span>
      </div>
      <div className="ml-8 flex flex-col gap-0.5">
        {item.messages.map((m) => (
          <MessageBody key={m.seq} message={m} />
        ))}
      </div>
    </div>
  )
}

function ClearButton(): ReactElement {
  const [arming, setArming] = useState(false)
  useEffect(() => {
    if (!arming) return
    const t = setTimeout(() => setArming(false), 3000)
    return () => clearTimeout(t)
  }, [arming])
  if (arming) {
    return (
      <button
        onClick={() => {
          useWarRoomStore.getState().clearTranscript()
          setArming(false)
        }}
        className="rounded bg-[#ed4245]/20 px-1.5 py-0.5 text-[10px] font-medium text-[#ed4245]"
      >
        Clear all?
      </button>
    )
  }
  return (
    <button
      onClick={() => setArming(true)}
      className="text-muted-foreground hover:text-foreground"
      title="Clear the discussion history (members stay)"
      aria-label="Clear discussion"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function DiscussionTab({ items }: { items: TranscriptItem[] }): ReactElement {
  // Auto-follow: only snap to the new bottom when the user was already there,
  // so scrolling up to re-read history isn't yanked away.
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const last = items[items.length - 1]
  const lastSeq =
    last === undefined
      ? undefined
      : last.kind === 'group'
        ? last.messages[last.messages.length - 1]?.seq
        : last.seq

  function handleScroll(): void {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lastSeq])

  if (items.length === 0) {
    return (
      <div className="m-2 rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
        No messages yet. Once connected agents start talking, the whole
        conversation shows up here.
      </div>
    )
  }
  return (
    <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto p-1">
      {items.map((item) =>
        item.kind === 'system' ? (
          <SystemLine key={item.seq} item={item} />
        ) : (
          <MessageGroup key={item.firstSeq} item={item} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  )
}

// --- Panel ----------------------------------------------------------------

export function WarRoomPanel(): ReactElement {
  const members = useWarRoomStore((s) => s.members)
  const transcript = useWarRoomStore((s) => s.transcript)
  const [tab, setTab] = useState<'members' | 'discussion'>('discussion')
  const { setNodeRef, isOver } = useDroppable({ id: WAR_ROOM_DROP_ID })

  const subTab = (key: 'members' | 'discussion', label: string): ReactElement => (
    <button
      onClick={() => setTab(key)}
      className={cn(
        'rounded px-2 py-0.5 text-xs transition-colors',
        tab === key
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground'
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
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <Swords className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
        {subTab('members', `Members · ${members.length}`)}
        {subTab('discussion', 'Discussion')}
        <div className="ml-auto flex items-center">
          {tab === 'discussion' && <ClearButton />}
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
