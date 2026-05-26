import { type ReactElement } from 'react'
import { Check } from 'lucide-react'
import { useAppearanceStore } from '@/store/appearance-store'
import type { Style } from '@/lib/appearance'
import { cn } from '@/lib/utils'

interface StyleOption {
  id: Style
  label: string
  description: string
}

const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Phong cách mặc định của ứng dụng.'
  }
]

/** The "Appearance" settings category — currently a single Style picker. */
export function AppearancePanel(): ReactElement {
  const style = useAppearanceStore((s) => s.style)
  const setStyle = useAppearanceStore((s) => s.setStyle)

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tùy chỉnh giao diện hiển thị.</p>
      </header>

      <section>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Style</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Phong cách giao diện hiển thị trong toàn ứng dụng.
          </p>
        </div>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {STYLE_OPTIONS.map((opt) => (
            <StyleCard
              key={opt.id}
              option={opt}
              active={opt.id === style}
              onSelect={() => setStyle(opt.id)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

interface StyleCardProps {
  option: StyleOption
  active: boolean
  onSelect: () => void
}

function StyleCard({ option, active, onSelect }: StyleCardProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-ring bg-accent'
          : 'border-border hover:border-ring/50 hover:bg-accent/40'
      )}
    >
      <StylePreview />
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">{option.label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{option.description}</div>
        </div>
        {active && <Check className="h-4 w-4 shrink-0 text-foreground" />}
      </div>
    </button>
  )
}

/** A small visual preview of the current theme palette — three chips + a sample line. */
function StylePreview(): ReactElement {
  return (
    <div className="flex h-24 flex-col gap-2 rounded-md border border-border bg-background p-2">
      <div className="flex gap-1">
        <span className="h-3 w-3 rounded-sm bg-foreground" />
        <span className="h-3 w-3 rounded-sm bg-muted-foreground" />
        <span className="h-3 w-3 rounded-sm bg-accent-foreground" />
      </div>
      <code className="mt-auto font-mono text-[11px] text-foreground">$ swarmterm</code>
    </div>
  )
}
