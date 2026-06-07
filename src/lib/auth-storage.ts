import { saveAuthSession, loadAuthSession, clearAuthSession } from '@/tauri/auth'
import type { SupportedStorage } from '@supabase/supabase-js'

export const authStorageAdapter: SupportedStorage = {
  getItem: (key: string) => loadAuthSession(key),
  setItem: (key: string, value: string) => saveAuthSession(key, value),
  removeItem: (key: string) => clearAuthSession(key),
}
