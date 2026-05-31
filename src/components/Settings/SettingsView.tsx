import { useEffect, useState, type ReactElement } from 'react'
import { Palette, Terminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AppearancePanel } from './AppearancePanel'
import { TerminalPanel } from './TerminalPanel'

type CategoryId = 'appearance' | 'terminal'

interface Category {
  id: CategoryId
  label: string
  Icon: typeof Palette
}

const CATEGORIES: Category[] = [
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'terminal', label: 'Terminal', Icon: Terminal }
]

interface SettingsViewProps {
  onClose: () => void
}

/**
 * Centered modal Settings dialog over a dimmed backdrop. A left nav rail picks
 * the active category; the right pane renders its panel. Click the backdrop,
 * press Esc, or click the close button to dismiss.
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
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <nav className="flex w-56 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border px-3 py-3">
            <h2 className="text-sm font-semibold text-foreground">Settings</h2>
          </div>

          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {CATEGORIES.map((cat) => {
              const active = cat.id === activeCategory
              const Icon = cat.Icon
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{cat.label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        <div className="relative flex min-w-0 flex-1 flex-col bg-canvas">
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
            <div className="mx-auto max-w-3xl px-8 py-8">
              {activeCategory === 'appearance' && <AppearancePanel />}
              {activeCategory === 'terminal' && <TerminalPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
