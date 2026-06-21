import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@/tauri/opener'
export { onAuthCallback } from '@/tauri/deeplink'

export { openUrl }

export const saveAuthSession = (account: string, value: string): Promise<void> =>
  invoke('save_auth_session', { account, value })

export const loadAuthSession = (account: string): Promise<string | null> =>
  invoke('load_auth_session', { account })

export const clearAuthSession = (account: string): Promise<void> =>
  invoke('clear_auth_session', { account })
