import { create } from 'zustand'
import { flushQueue, type PendingDelivery } from '@/lib/war-room-nudge'
import type {
  WarRoomDeliver, WarRoomEvent, WarRoomMemberInfo, WarRoomRoomInfo, WarRoomRoomMeta
} from '@/tauri/warroom'

/** Bounded so a runaway agent debate can't grow renderer memory forever. */
export const TRANSCRIPT_CAP = 500

export interface WarRoomMember {
  terminalId: string
  name: string
  agentId: string | null
  cwd: string
  /** False until the pane's agent completes the MCP handshake (first
   *  war_room call) — a dragged-in bare shell stays pending forever. */
  connected: boolean
}

const toMember = (m: WarRoomMemberInfo): WarRoomMember => ({
  terminalId: m.terminalId, name: m.name, agentId: m.agentId, cwd: m.cwd, connected: m.connected
})

interface WarRoomStore {
  rooms: WarRoomRoomMeta[]
  /** Null only before hydration (boot snapshot hasn't landed yet). */
  activeRoomId: string | null
  membersByRoom: Record<string, WarRoomMember[]>
  transcriptByRoom: Record<string, WarRoomEvent[]>
  /** Pending deliveries per recipient terminalId, flushed on sustained idle. */
  queues: Record<string, PendingDelivery[]>
  /** Terminals whose queue the delivery scheduler is withholding because the
   *  user is typing there. Surfaced by the in-pane pill and the panel badge;
   *  the scheduler owns writing it (see war-room-delivery.ts). */
  held: Record<string, boolean>

  /** Routes a server event into its room's member list / transcript. */
  applyEvent: (e: WarRoomEvent) => void
  /** Reconcile the room list from a `warroom:rooms` push (create/rename/delete). */
  applyRooms: (list: WarRoomRoomMeta[]) => void
  /** Replace rooms + members from the Rust boot snapshot (boot / dev-reload). */
  hydrateRooms: (list: WarRoomRoomInfo[]) => void
  setActiveRoom: (roomId: string) => void
  clearTranscript: (roomId: string) => void
  enqueue: (d: WarRoomDeliver) => void
  /** Queue the join intro as a verbatim paste (execute-shaped: full text + Enter). */
  enqueueIntro: (terminalId: string, text: string) => void
  setHeld: (terminalId: string, held: boolean) => void
  /** Drain a terminal's queue into ordered paste payloads. */
  takeFlush: (terminalId: string) => string[]
  /** Member of ANY room. */
  isMember: (terminalId: string) => boolean
  memberRoomId: (terminalId: string) => string | null
}

export const useWarRoomStore = create<WarRoomStore>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  membersByRoom: {},
  transcriptByRoom: {},
  queues: {},
  held: {},

  applyEvent: (e) =>
    set((s) => {
      // Unknown room = the room was deleted (or hydration hasn't landed yet).
      // Applying anyway would resurrect a phantom membersByRoom/transcriptByRoom
      // slice that isMember — and therefore the delivery scheduler — trusts;
      // revocation must hold even against event reordering (see
      // war-room-delivery.ts's own membership re-check for the same reason).
      // This is safe for delete: war_room_delete emits each member's Leave
      // BEFORE the warroom:rooms snapshot that drops the room, so those
      // Leaves still find the room present and clean up queues/held normally
      // — only events arriving AFTER the snapshot removed the room are
      // dropped here. The boot window is covered separately: hydrateRooms
      // replaces membership wholesale, so nothing needs to survive it.
      if (!s.rooms.some((r) => r.roomId === e.roomId)) return s
      const roomTranscript = [...(s.transcriptByRoom[e.roomId] ?? []), e].slice(-TRANSCRIPT_CAP)
      const transcriptByRoom = { ...s.transcriptByRoom, [e.roomId]: roomTranscript }
      if (e.kind === 'join') {
        const member: WarRoomMember = {
          terminalId: e.terminalId, name: e.name, agentId: e.agentId, cwd: e.cwd, connected: e.connected
        }
        // Belt-and-braces: the server emits the old room's Leave before this
        // Join, but event reordering across threads must never leave one
        // terminal visible in two room slices.
        const membersByRoom = Object.fromEntries(
          Object.entries(s.membersByRoom).map(([rid, ms]) => [
            rid, ms.filter((m) => m.terminalId !== e.terminalId)
          ])
        )
        membersByRoom[e.roomId] = [...(membersByRoom[e.roomId] ?? []), member]
        return { membersByRoom, transcriptByRoom }
      }
      if (e.kind === 'connected') {
        return {
          membersByRoom: {
            ...s.membersByRoom,
            [e.roomId]: (s.membersByRoom[e.roomId] ?? []).map((m) =>
              m.terminalId === e.terminalId ? { ...m, connected: true } : m
            )
          },
          transcriptByRoom
        }
      }
      if (e.kind === 'leave') {
        const queues = { ...s.queues }
        const held = { ...s.held }
        delete queues[e.terminalId]
        delete held[e.terminalId]
        return {
          membersByRoom: {
            ...s.membersByRoom,
            [e.roomId]: (s.membersByRoom[e.roomId] ?? []).filter((m) => m.terminalId !== e.terminalId)
          },
          transcriptByRoom, queues, held
        }
      }
      return { transcriptByRoom }
    }),

  applyRooms: (list) =>
    set((s) => {
      const keep = new Set(list.map((r) => r.roomId))
      const membersByRoom: typeof s.membersByRoom = {}
      const transcriptByRoom: typeof s.transcriptByRoom = {}
      const queues = { ...s.queues }
      const held = { ...s.held }
      for (const [rid, ms] of Object.entries(s.membersByRoom)) {
        if (keep.has(rid)) { membersByRoom[rid] = ms; continue }
        // Room deleted: its members' Leaves were emitted first, but drop any
        // queue that survived reordering — never deliver into a dead room.
        for (const m of ms) { delete queues[m.terminalId]; delete held[m.terminalId] }
      }
      for (const [rid, t] of Object.entries(s.transcriptByRoom)) {
        if (keep.has(rid)) transcriptByRoom[rid] = t
      }
      const activeRoomId =
        s.activeRoomId !== null && keep.has(s.activeRoomId)
          ? s.activeRoomId
          : (list[0]?.roomId ?? null)
      return { rooms: list, activeRoomId, membersByRoom, transcriptByRoom, queues, held }
    }),

  hydrateRooms: (list) =>
    set((s) => ({
      rooms: list.map(({ roomId, name }) => ({ roomId, name })),
      membersByRoom: Object.fromEntries(list.map((r) => [r.roomId, r.members.map(toMember)])),
      activeRoomId:
        s.activeRoomId !== null && list.some((r) => r.roomId === s.activeRoomId)
          ? s.activeRoomId
          : (list[0]?.roomId ?? null)
    })),

  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

  clearTranscript: (roomId) =>
    set((s) => ({ transcriptByRoom: { ...s.transcriptByRoom, [roomId]: [] } })),

  enqueue: (d) =>
    set((s) => ({
      queues: {
        ...s.queues,
        [d.toId]: [
          ...(s.queues[d.toId] ?? []),
          { fromName: d.fromName, mode: d.mode, content: d.content ?? undefined }
        ]
      }
    })),

  enqueueIntro: (terminalId, text) =>
    set((s) => ({
      queues: {
        ...s.queues,
        [terminalId]: [
          ...(s.queues[terminalId] ?? []),
          { fromName: 'War Room', mode: 'execute', content: text }
        ]
      }
    })),

  setHeld: (terminalId, held) =>
    set((s) => {
      if ((s.held[terminalId] ?? false) === held) return s
      const next = { ...s.held }
      // Deleting rather than storing `false` keeps the map small and lets the
      // panel's badge total iterate keys without filtering.
      if (held) next[terminalId] = true
      else delete next[terminalId]
      return { held: next }
    }),

  takeFlush: (terminalId) => {
    const queue = get().queues[terminalId]
    if (!queue || queue.length === 0) return []
    set((s) => {
      const queues = { ...s.queues }
      const held = { ...s.held }
      delete queues[terminalId]
      delete held[terminalId]
      return { queues, held }
    })
    return flushQueue(queue)
  },

  isMember: (terminalId) =>
    Object.values(get().membersByRoom).some((ms) => ms.some((m) => m.terminalId === terminalId)),

  memberRoomId: (terminalId) =>
    Object.entries(get().membersByRoom)
      .find(([, ms]) => ms.some((m) => m.terminalId === terminalId))?.[0] ?? null
}))
