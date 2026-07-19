import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// createClient is mocked so these tests exercise *when* the client is built,
// not what it does — a real GoTrue client spins background refresh timers that
// call into Tauri's `invoke` and blow up under the node test environment.
// Shaped like the real SupabaseClient: `functions` is a prototype getter and
// the methods read `this`, so the proxy below has to resolve both against the
// underlying client rather than against itself.
const createClient = vi.hoisted(() => {
  class FakeClient {
    url = 'https://example.supabase.co'
    auth = { id: 'client' }
    get functions(): { url: string } {
      return { url: this.url }
    }
    describe(): string {
      return this.url
    }
  }
  return vi.fn(() => new FakeClient())
})
vi.mock('@supabase/supabase-js', () => ({ createClient }))

// The client must never be constructed at import time: this module sits in
// main.tsx's import graph, so a top-level throw here kills the whole bundle
// before React mounts and the app renders as a blank window with no clue.
beforeEach(() => {
  vi.resetModules()
  createClient.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('supabase', () => {
  it('imports cleanly, and builds nothing, when the env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    await expect(import('@/lib/supabase')).resolves.toBeDefined()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('throws a named error only once the client is touched', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { supabase } = await import('@/lib/supabase')
    expect(() => supabase.auth).toThrow(/VITE_SUPABASE_URL/)
  })

  it('defers construction until first access when the env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const { supabase } = await import('@/lib/supabase')
    expect(createClient).not.toHaveBeenCalled()

    expect(supabase.auth).toBeDefined()
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({ auth: expect.objectContaining({ flowType: 'pkce' }) })
    )
  })

  it('builds the client once and reuses it', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const { supabase } = await import('@/lib/supabase')
    expect(supabase.auth).toBe(supabase.auth)
    expect(createClient).toHaveBeenCalledOnce()
  })

  it('resolves prototype getters against the real client, not the proxy', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const { supabase } = await import('@/lib/supabase')
    // @ts-expect-error — FakeClient's shape, narrower than SupabaseClient.
    expect(supabase.functions.url).toBe('https://example.supabase.co')
  })

  it('keeps `this` bound to the real client for methods', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const { supabase } = await import('@/lib/supabase')
    // @ts-expect-error — FakeClient's shape, narrower than SupabaseClient.
    const { describe: detach } = supabase
    expect(detach()).toBe('https://example.supabase.co')
  })
})
