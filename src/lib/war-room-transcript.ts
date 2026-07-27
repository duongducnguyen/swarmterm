/** One pure rule for how a room event reads in the transcript, so the panel
 *  row component stays markup-only. */
import type { WarRoomEvent } from '@/tauri/warroom'

export interface TranscriptRow {
  seq: number
  icon: 'join' | 'leave' | 'probe' | 'execute'
  headline: string
  body?: string
}

export function formatEvent(e: WarRoomEvent): TranscriptRow {
  switch (e.kind) {
    case 'join':
      return { seq: e.seq, icon: 'join', headline: `${e.name} joined the War Room`, body: undefined }
    case 'leave':
      return { seq: e.seq, icon: 'leave', headline: `${e.name} left the War Room`, body: undefined }
    case 'message': {
      const target = e.toName ?? 'everyone'
      if (e.mode === 'execute') {
        return { seq: e.seq, icon: 'execute', headline: `${e.fromName} ran a prompt in ${target}`, body: e.content }
      }
      return { seq: e.seq, icon: 'probe', headline: `${e.fromName} → ${target}`, body: e.content }
    }
  }
}
