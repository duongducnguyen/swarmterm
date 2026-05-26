import { useEffect, useState, type ReactElement } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AppearancePanel } from './AppearancePanel'
import { TerminalPanel } from './TerminalPanel'

type CategoryId = 'appearance' | 'terminal'

interface Category {
  id: CategoryId
  label: string
}

const CATEGORIES: Category[] = [
  { id: 'appearance', label: 'appearance' },
  { id: 'terminal', label: 'terminal' }
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
      <nav className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="border-b border-border px-4 py-5">
          <div className="font-mono text-xs text-foreground">
            <span className="text-muted-foreground/70">~/</span>settings
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
            command center
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-px overflow-y-auto p-2">
          {CATEGORIES.map((cat) => {
            const active = cat.id === activeCategory
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'group flex items-center gap-2 rounded px-2 py-1.5 font-mono text-sm transition-colors',
                  active
                    ? 'bg-muted/60 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'w-3 text-primary transition-opacity',
                    active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
                  )}
                  aria-hidden
                >
                  ▸
                </span>
                <span>{cat.label}</span>
              </button>
            )
          })}
        </div>

        <div className="border-t border-border px-4 py-3 font-mono text-[10px] text-muted-foreground/60">
          <span className="text-muted-foreground/40">›</span> esc to close
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
            {activeCategory === 'terminal' && <TerminalPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
