/** One pure rule for how room events read in the Discussion tab, so the
 *  panel components stay markup-only. `formatEvent` gives the flat row text;
 *  `groupTranscript` folds consecutive messages from one sender into a
 *  Discord-style group (one avatar/header, many bodies). */
import type { WarRoomEvent, WarRoomMode } from '@/tauri/warroom'

export interface TranscriptRow {
  seq: number
  icon: 'join' | 'leave' | 'connected' | 'probe' | 'execute'
  headline: string
  body?: string
}

export function formatEvent(e: WarRoomEvent): TranscriptRow {
  switch (e.kind) {
    case 'join':
      return { seq: e.seq, icon: 'join', headline: `${e.name} joined the War Room`, body: undefined }
    case 'leave':
      return { seq: e.seq, icon: 'leave', headline: `${e.name} left the War Room`, body: undefined }
    case 'connected':
      return { seq: e.seq, icon: 'connected', headline: `${e.name} connected`, body: undefined }
    case 'message': {
      const target = e.toName ?? 'everyone'
      if (e.mode === 'execute') {
        return { seq: e.seq, icon: 'execute', headline: `${e.fromName} ran a prompt in ${target}`, body: e.content }
      }
      return { seq: e.seq, icon: 'probe', headline: `${e.fromName} → ${target}`, body: e.content }
    }
  }
}

/** Messages from one sender within this window collapse under one header —
 *  Discord's grouping heuristic. */
export const GROUP_WINDOW_MS = 5 * 60_000

export interface TranscriptMessage {
  seq: number
  content: string
  mode: WarRoomMode
  toName: string | null
  ts: number
}

export type TranscriptItem =
  | { kind: 'system'; seq: number; icon: 'join' | 'leave' | 'connected'; text: string }
  | {
      kind: 'group'
      fromId: string
      fromName: string
      firstSeq: number
      firstTs: number
      messages: TranscriptMessage[]
    }

export function groupTranscript(events: WarRoomEvent[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  for (const e of events) {
    if (e.kind !== 'message') {
      const row = formatEvent(e)
      items.push({
        kind: 'system',
        seq: e.seq,
        icon: row.icon as 'join' | 'leave' | 'connected',
        text: row.headline
      })
      continue
    }
    const last = items[items.length - 1]
    const message: TranscriptMessage = {
      seq: e.seq,
      content: e.content,
      mode: e.mode,
      toName: e.toName,
      ts: e.ts
    }
    // A system line between two messages breaks the group on purpose — the
    // membership change is context the reader must not scroll past.
    if (
      last !== undefined &&
      last.kind === 'group' &&
      last.fromId === e.fromId &&
      e.ts - last.messages[last.messages.length - 1].ts <= GROUP_WINDOW_MS
    ) {
      last.messages.push(message)
    } else {
      items.push({
        kind: 'group',
        fromId: e.fromId,
        fromName: e.fromName,
        firstSeq: e.seq,
        firstTs: e.ts,
        messages: [message]
      })
    }
  }
  return items
}

/** "HH:MM" in the viewer's locale — Discord shows compact times in-line. */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
