import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authStorageAdapter } from '@/lib/auth-storage'

let client: SupabaseClient | undefined

function getClient(): SupabaseClient {
  if (client) return client

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing required env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      storage: authStorageAdapter,
      // Don't try to read auth code from webview URL — we handle it via deep link.
      detectSessionInUrl: false,
    },
  })
  return client
}

// Lazy on purpose. This module is reachable from main.tsx's import graph, so
// constructing (or validating config for) the client at module scope makes a
// missing env var throw *before* ReactDOM.createRoot runs — the bundle dies,
// nothing mounts, and the app is an unexplained black window with no devtools
// in a release build. Deferring behind a proxy keeps the failure local to the
// auth code path, where it surfaces as a normal, catchable error.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => {
    // Resolve against the client itself — never forward the proxy as the
    // receiver, or SupabaseClient's prototype getters (`functions`, …) would
    // run with `this` pointing at the proxy. Methods are bound for the same
    // reason: they must survive being pulled off the client.
    const instance = getClient()
    const value = Reflect.get(instance, prop)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
