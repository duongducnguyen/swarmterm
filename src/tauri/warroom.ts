import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** Payloads mirror src-tauri/src/warroom.rs — camelCase on the wire. */
export type WarRoomMode = 'probe' | 'execute'

export type WarRoomEvent =
  | { kind: 'join'; roomId: string; seq: number; terminalId: string; name: string; agentId: string | null; cwd: string; connected: boolean; ts: number }
  | { kind: 'leave'; roomId: string; seq: number; terminalId: string; name: string; ts: number }
  | { kind: 'connected'; roomId: string; seq: number; terminalId: string; name: string; ts: number }
  | {
      kind: 'message'
      roomId: string
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

export interface WarRoomRoomMeta {
  roomId: string
  name: string
}

export interface WarRoomRoomInfo {
  roomId: string
  name: string
  members: WarRoomMemberInfo[]
}

export function warRoomJoin(opts: {
  roomId: string
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

export const warRoomRooms = (): Promise<WarRoomRoomInfo[]> => invoke('war_room_rooms')

export const warRoomCreate = (name: string): Promise<WarRoomRoomMeta> =>
  invoke('war_room_create', { name })

export const warRoomRename = (roomId: string, name: string): Promise<void> =>
  invoke('war_room_rename', { roomId, name })

export const warRoomDelete = (roomId: string): Promise<void> =>
  invoke('war_room_delete', { roomId })

export function onWarRoomEvent(handler: (e: WarRoomEvent) => void): Promise<UnlistenFn> {
  return listen<WarRoomEvent>('warroom:event', (event) => handler(event.payload))
}

export function onWarRoomDeliver(handler: (d: WarRoomDeliver) => void): Promise<UnlistenFn> {
  return listen<WarRoomDeliver>('warroom:deliver', (event) => handler(event.payload))
}

/** Rooms-list snapshot pushed after every create/rename/delete. */
export function onWarRoomRooms(handler: (rooms: WarRoomRoomMeta[]) => void): Promise<UnlistenFn> {
  return listen<WarRoomRoomMeta[]>('warroom:rooms', (event) => handler(event.payload))
}

/** The human user's seat — mirrors MODERATOR_ID in src-tauri/src/warroom.rs. */
export const MODERATOR_ID = '__moderator__'

/** Send as the Moderator. `to: null` broadcasts. Resolves to the number of
 *  panes that will be typed into — which is not the number of recipients: a
 *  member without an agent CLI still gets the message, it just is never
 *  nudged. Rejects with the room's own error message. */
export function warRoomModeratorSend(opts: {
  roomId: string
  to: string | null
  content: string
  mode: WarRoomMode
}): Promise<number> {
  return invoke('war_room_moderator_send', opts)
}
