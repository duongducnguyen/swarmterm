import { createClient } from '@supabase/supabase-js'
import { authStorageAdapter } from '@/lib/auth-storage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

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
