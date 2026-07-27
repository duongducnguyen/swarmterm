import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** Payloads mirror src-tauri/src/warroom.rs — camelCase on the wire. */
export type WarRoomMode = 'probe' | 'execute'

export type WarRoomEvent =
  | { kind: 'join'; seq: number; terminalId: string; name: string; agentId: string | null; cwd: string; connected: boolean; ts: number }
  | { kind: 'leave'; seq: number; terminalId: string; name: string; ts: number }
  | { kind: 'connected'; seq: number; terminalId: string; name: string; ts: number }
  | {
      kind: 'message'
      seq: number
      fromId: string
      fromName: string
      toId: string | null
      toName: string | null
      content: string
      mode: WarRoomMode
      ts: number
    }

export interface WarRoomDeliver {
  toId: string
  fromName: string
  mode: WarRoomMode
  /** Full prompt for execute; null for probe (body stays in the MCP inbox). */
  content: string | null
}

export function warRoomJoin(opts: {
  terminalId: string
  agentId?: string
  cwd: string
  displayName: string
}): Promise<void> {
  return invoke('war_room_join', opts)
}

export const warRoomLeave = (terminalId: string): Promise<void> =>
  invoke('war_room_leave', { terminalId })

/** Rust-side room snapshot — membership outlives frontend reloads. */
export interface WarRoomMemberInfo {
  terminalId: string
  name: string
  agentId: string | null
  cwd: string
  connected: boolean
}

export const warRoomMembers = (): Promise<WarRoomMemberInfo[]> => invoke('war_room_members')

export function onWarRoomEvent(handler: (e: WarRoomEvent) => void): Promise<UnlistenFn> {
  return listen<WarRoomEvent>('warroom:event', (event) => handler(event.payload))
}

export function onWarRoomDeliver(handler: (d: WarRoomDeliver) => void): Promise<UnlistenFn> {
  return listen<WarRoomDeliver>('warroom:deliver', (event) => handler(event.payload))
}
