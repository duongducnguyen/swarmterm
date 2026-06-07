import { createClient } from '@supabase/supabase-js'
import { authStorageAdapter } from '@/lib/auth-storage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    storage: authStorageAdapter,
    // Don't try to read auth code from webview URL — we handle it via deep link.
    detectSessionInUrl: false,
  },
})
