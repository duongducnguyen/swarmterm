import { create } from 'zustand'
import { flushQueue, type PendingDelivery } from '@/lib/war-room-nudge'
import type { WarRoomDeliver, WarRoomEvent } from '@/tauri/warroom'

/** Bounded so a runaway agent debate can't grow renderer memory forever. */
export const TRANSCRIPT_CAP = 500

export interface WarRoomMember {
  terminalId: string
  name: string
  agentId: string | null
  cwd: string
}

interface WarRoomStore {
  members: WarRoomMember[]
  transcript: WarRoomEvent[]
  /** Pending deliveries per recipient terminalId, flushed on sustained idle. */
  queues: Record<string, PendingDelivery[]>

  applyEvent: (e: WarRoomEvent) => void
  enqueue: (d: WarRoomDeliver) => void
  /** Queue the join intro as a verbatim paste (execute-shaped: full text + Enter). */
  enqueueIntro: (terminalId: string, text: string) => void
  /** Drain a terminal's queue into ordered paste payloads. */
  takeFlush: (terminalId: string) => string[]
  isMember: (terminalId: string) => boolean
}

export const useWarRoomStore = create<WarRoomStore>((set, get) => ({
  members: [],
  transcript: [],
  queues: {},

  applyEvent: (e) =>
    set((s) => {
      const transcript = [...s.transcript, e].slice(-TRANSCRIPT_CAP)
      if (e.kind === 'join') {
        const member: WarRoomMember = {
          terminalId: e.terminalId,
          name: e.name,
          agentId: e.agentId,
          cwd: e.cwd
        }
        const members = [...s.members.filter((m) => m.terminalId !== e.terminalId), member]
        return { members, transcript }
      }
      if (e.kind === 'leave') {
        const queues = { ...s.queues }
        delete queues[e.terminalId]
        return {
          members: s.members.filter((m) => m.terminalId !== e.terminalId),
          transcript,
          queues
        }
      }
      return { transcript }
    }),

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

  takeFlush: (terminalId) => {
    const queue = get().queues[terminalId]
    if (!queue || queue.length === 0) return []
    set((s) => {
      const queues = { ...s.queues }
      delete queues[terminalId]
      return { queues }
    })
    return flushQueue(queue)
  },

  isMember: (terminalId) => get().members.some((m) => m.terminalId === terminalId)
}))
