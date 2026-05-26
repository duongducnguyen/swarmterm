import { useEffect, useState, type ReactElement } from 'react'
import { Palette, Settings, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AppearancePanel } from './AppearancePanel'

type CategoryId = 'appearance'

interface Category {
  id: CategoryId
  label: string
  icon: LucideIcon
}

const CATEGORIES: Category[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette }
]

interface SettingsViewProps {
  onClose: () => void
}

/**
 * Full-screen Settings view that replaces the workspace content area. A left
 * nav rail picks the active category; the right pane renders its panel.
 */
export function SettingsView({ onClose }: SettingsViewProps): ReactElement {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('appearance')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="relative flex h-full bg-background">
      <nav className="flex w-60 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-3 border-b border-border px-4 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Settings className="h-5 w-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Settings</div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Command Center
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {CATEGORIES.map((cat) => {
            const active = cat.id === activeCategory
            const Icon = cat.icon
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{cat.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close settings"
          title="Close (Esc)"
          className="absolute right-4 top-4 z-10 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-10 py-10">
            {activeCategory === 'appearance' && <AppearancePanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
