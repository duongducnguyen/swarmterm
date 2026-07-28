import { create } from 'zustand'
import { flushQueue, type PendingDelivery } from '@/lib/war-room-nudge'
import type { WarRoomDeliver, WarRoomEvent, WarRoomMemberInfo } from '@/tauri/warroom'

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

interface WarRoomStore {
  members: WarRoomMember[]
  transcript: WarRoomEvent[]
  /** Pending deliveries per recipient terminalId, flushed on sustained idle. */
  queues: Record<string, PendingDelivery[]>
  /** Terminals whose queue the delivery scheduler is withholding because the
   *  user is typing there. Surfaced by the in-pane pill and the panel badge;
   *  the scheduler owns writing it (see war-room-delivery.ts). */
  held: Record<string, boolean>

  applyEvent: (e: WarRoomEvent) => void
  /** Replace members from the Rust snapshot (boot / dev-reload hydration). */
  hydrateMembers: (list: WarRoomMemberInfo[]) => void
  clearTranscript: () => void
  enqueue: (d: WarRoomDeliver) => void
  /** Queue the join intro as a verbatim paste (execute-shaped: full text + Enter). */
  enqueueIntro: (terminalId: string, text: string) => void
  setHeld: (terminalId: string, held: boolean) => void
  /** Drain a terminal's queue into ordered paste payloads. */
  takeFlush: (terminalId: string) => string[]
  isMember: (terminalId: string) => boolean
}

export const useWarRoomStore = create<WarRoomStore>((set, get) => ({
  members: [],
  transcript: [],
  queues: {},
  held: {},

  applyEvent: (e) =>
    set((s) => {
      const transcript = [...s.transcript, e].slice(-TRANSCRIPT_CAP)
      if (e.kind === 'join') {
        const member: WarRoomMember = {
          terminalId: e.terminalId,
          name: e.name,
          agentId: e.agentId,
          cwd: e.cwd,
          connected: e.connected
        }
        const members = [...s.members.filter((m) => m.terminalId !== e.terminalId), member]
        return { members, transcript }
      }
      if (e.kind === 'connected') {
        return {
          members: s.members.map((m) =>
            m.terminalId === e.terminalId ? { ...m, connected: true } : m
          ),
          transcript
        }
      }
      if (e.kind === 'leave') {
        const queues = { ...s.queues }
        const held = { ...s.held }
        delete queues[e.terminalId]
        delete held[e.terminalId]
        return {
          members: s.members.filter((m) => m.terminalId !== e.terminalId),
          transcript,
          queues,
          held
        }
      }
      return { transcript }
    }),

  hydrateMembers: (list) =>
    set({
      members: list.map((m) => ({
        terminalId: m.terminalId,
        name: m.name,
        agentId: m.agentId,
        cwd: m.cwd,
        connected: m.connected
      }))
    }),

  clearTranscript: () => set({ transcript: [] }),

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

  isMember: (terminalId) => get().members.some((m) => m.terminalId === terminalId)
}))
