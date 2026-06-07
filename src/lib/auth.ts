import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { openUrl } from '@/tauri/auth'

export async function signInWithOAuth(provider: 'google' | 'github'): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: 'swarmterm://auth/callback',
      skipBrowserRedirect: true,
    },
  })
  if (error) throw error
  if (data.url) await openUrl(data.url)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function exchangeCode(code: string): Promise<Session> {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) throw error
  // exchangeCodeForSession always returns a session on success; the null case is
  // guarded by the error check above (supabase-js sets error when session is null).
  return data.session!
}
