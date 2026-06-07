import { useEffect, useState, type ReactElement } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { LoginModal } from '@/components/Account/LoginModal'

interface Subscription {
  plan_id: string
  status: string
}

export function AccountPanel(): ReactElement {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const [showLogin, setShowLogin] = useState(false)
  const [sub, setSub] = useState<Subscription | null>(null)

  const isAuthenticated = status === 'authenticated'
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Account'

  useEffect(() => {
    if (!isAuthenticated) return
    void supabase
      .from('subscriptions')
      .select('plan_id, status')
      .maybeSingle()
      .then(({ data }) => setSub(data as Subscription | null))
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Account</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Sign in to unlock sync and subscription features.
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowLogin(true)}>
          Sign in
        </Button>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </div>
    )
  }

  const planLabel = sub?.plan_id ?? 'free'
  const planDisplay = planLabel.charAt(0).toUpperCase() + planLabel.slice(1)

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-foreground">Account</h3>

      <div className="mb-6 flex items-center gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-medium text-foreground">
            {(displayName[0] ?? '?').toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <div className="mb-6">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Plan
        </p>
        <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground">
          {planDisplay}
        </span>
      </div>

      <Button variant="outline" size="sm" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  )
}
