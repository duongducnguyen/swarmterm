import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'

export { openUrl }

export const saveAuthSession = (account: string, value: string): Promise<void> =>
  invoke('save_auth_session', { account, value })

export const loadAuthSession = (account: string): Promise<string | null> =>
  invoke('load_auth_session', { account })

export const clearAuthSession = (account: string): Promise<void> =>
  invoke('clear_auth_session', { account })

export function onAuthCallback(handler: (code: string) => void): Promise<UnlistenFn> {
  return listen<{ code: string }>('auth:callback', (event) => handler(event.payload.code))
}
