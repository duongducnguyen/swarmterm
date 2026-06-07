import { UserRound } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { LoginModal } from '@/components/Account/LoginModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AccountIconProps {
  onOpenAccountSettings: () => void
}

export function AccountIcon({ onOpenAccountSettings }: AccountIconProps): ReactElement {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const [showLoginModal, setShowLoginModal] = useState(false)

  const isAuthenticated = status === 'authenticated'
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Account'

  if (!isAuthenticated) {
    return (
      <>
        <button
          type="button"
          title="Sign in"
          onClick={() => setShowLoginModal(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <UserRound className="h-4 w-4 shrink-0 opacity-50" />
          <span>Sign in</span>
        </button>
        {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
      </>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={displayName}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-4 w-4 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-foreground">
              {(displayName[0] ?? '?').toUpperCase()}
            </span>
          )}
          <span className="truncate">{displayName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-52">
        <div className="border-b border-border px-2 py-2">
          <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
          {user?.email && (
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          )}
        </div>
        <DropdownMenuItem onSelect={onOpenAccountSettings}>Account Settings</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void signOut()}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
