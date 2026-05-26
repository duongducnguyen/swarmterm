import { useEffect, useState, type ReactElement } from 'react'
import { Palette, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AppearancePanel } from './AppearancePanel'

type CategoryId = 'appearance'

interface Category {
  id: CategoryId
  label: string
  icon: ReactElement
}

const CATEGORIES: Category[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> }
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
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close settings"
          title="Close settings (Esc)"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-border p-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                cat.id === activeCategory
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              {cat.icon}
              <span className="flex-1 text-left">{cat.label}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            {activeCategory === 'appearance' && <AppearancePanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
