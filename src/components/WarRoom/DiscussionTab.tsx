import { useEffect, useRef, useState, type ReactElement } from 'react'
import { LogIn, LogOut, Plug, Trash2 } from 'lucide-react'
import { useWarRoomStore } from '@/store/war-room-store'
import {
  formatTime,
  type TranscriptItem,
  type TranscriptMessage
} from '@/lib/war-room-transcript'
import { memberColor } from '@/lib/war-room-identity'
import { tokenizeMarkdown } from '@/lib/war-room-markdown'
import { cn } from '@/lib/utils'
import { Avatar, jumpToTerminal } from './Avatar'
import { ModeratorComposer } from './ModeratorComposer'

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
    (s) =>
      Object.values(s.membersByRoom)
        .flat()
        .find((m) => m.terminalId === item.fromId)?.agentId ?? null
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

export function ClearButton({ roomId }: { roomId: string }): ReactElement {
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
          useWarRoomStore.getState().clearTranscript(roomId)
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

export function DiscussionTab({ items }: { items: TranscriptItem[] }): ReactElement {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {items.length === 0 ? (
        <div className="m-2 flex-1 rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          No messages yet. Send one below as Moderator, or drag panes in and let their
          agents talk.
        </div>
      ) : (
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
      )}
      <ModeratorComposer />
    </div>
  )
}
