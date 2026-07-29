/**
 * Horizontal room strip: click activates, drop joins/moves into that room,
 * double-click renames inline, hover ✕ deletes (two-step confirm, disabled on
 * the last room — the server enforces the same rule). The strip scrolls
 * horizontally; 2–4 rooms is the expected population.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Plus, X } from 'lucide-react'
import { ROOM_DROP_PREFIX } from '@/lib/war-room-drop'
import { warRoomCreate, warRoomDelete, warRoomRename, type WarRoomRoomMeta } from '@/tauri/warroom'
import { useWarRoomStore } from '@/store/war-room-store'
import { cn } from '@/lib/utils'

function NameInput(props: {
  initial: string
  placeholder: string
  onCommit: (name: string) => void
  onCancel: () => void
}): ReactElement {
  const [value, setValue] = useState(props.initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // select() implies focus in Chromium/WebKit, but that pairing is
    // guaranteed nowhere — call focus() explicitly so the caret and
    // keystrokes reliably land in the input regardless of engine quirks.
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      value={value}
      placeholder={props.placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim() !== '') props.onCommit(value.trim())
        else if (e.key === 'Escape') props.onCancel()
      }}
      onBlur={props.onCancel}
      className="w-24 rounded border border-border bg-card px-1 py-0.5 text-[11px] text-foreground outline-none focus:border-[#00b0f4]"
    />
  )
}

function RoomTab(props: {
  room: WarRoomRoomMeta
  active: boolean
  heldCount: number
  memberCount: number
  deletable: boolean
  onSelect: () => void
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: `${ROOM_DROP_PREFIX}${props.room.roomId}` })
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Two-step delete disarms itself — a forgotten armed ✕ must not fire later.
  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  if (renaming) {
    return (
      <NameInput
        initial={props.room.name}
        placeholder="Room name"
        onCommit={(name) => {
          setRenaming(false)
          void warRoomRename(props.room.roomId, name).catch((e) => console.warn('rename failed:', e))
        }}
        onCancel={() => setRenaming(false)}
      />
    )
  }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors',
        props.active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        isOver && 'ring-2 ring-inset ring-[#f97316]'
      )}
    >
      <button
        tabIndex={-1}
        onClick={props.onSelect}
        onDoubleClick={() => setRenaming(true)}
        title={props.room.name}
        className="max-w-[8rem] truncate"
      >
        {props.room.name}
      </button>
      {props.heldCount > 0 && <span className="text-[#f97316]">⏸{props.heldCount}</span>}
      {props.deletable && (
        <button
          tabIndex={-1}
          aria-label={confirmDelete ? 'Confirm delete room' : 'Delete room'}
          title={
            confirmDelete
              ? props.memberCount > 0
                ? `Click again to delete — ${props.memberCount} member(s) will be disconnected`
                : 'Click again to delete the empty room'
              : 'Delete room'
          }
          onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return }
            void warRoomDelete(props.room.roomId).catch((e) => console.warn('delete failed:', e))
          }}
          className={cn(
            'rounded p-px opacity-0 transition-opacity group-hover:opacity-100',
            confirmDelete ? 'text-[#ed4245] opacity-100' : 'hover:text-foreground'
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

export function RoomTabs(props: {
  rooms: WarRoomRoomMeta[]
  activeRoomId: string | null
  heldByRoom: Record<string, number>
  memberCountByRoom: Record<string, number>
  onSelect: (roomId: string) => void
}): ReactElement {
  const [creating, setCreating] = useState(false)
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1">
      {props.rooms.map((r) => (
        <RoomTab
          key={r.roomId}
          room={r}
          active={r.roomId === props.activeRoomId}
          heldCount={props.heldByRoom[r.roomId] ?? 0}
          memberCount={props.memberCountByRoom[r.roomId] ?? 0}
          deletable={props.rooms.length > 1}
          onSelect={() => props.onSelect(r.roomId)}
        />
      ))}
      {creating ? (
        <NameInput
          initial=""
          placeholder="New room"
          onCommit={(name) => {
            setCreating(false)
            void warRoomCreate(name)
              .then((meta) => useWarRoomStore.getState().setActiveRoom(meta.roomId))
              .catch((e) => console.warn('create failed:', e))
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          tabIndex={-1}
          aria-label="New room"
          title="New room"
          onClick={() => setCreating(true)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
