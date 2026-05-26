import { type ReactElement } from 'react'
import { Check } from 'lucide-react'
import { useAppearanceStore } from '@/store/appearance-store'
import type { Style } from '@/lib/appearance'
import { cn } from '@/lib/utils'

interface StyleOption {
  id: Style
  label: string
  variant: 'dark' | 'light'
  surface: string
}

const STYLE_OPTIONS: StyleOption[] = [
  { id: 'default', label: 'default', variant: 'dark', surface: 'solid backdrop' }
]

/** The "Appearance" settings category — currently a single Style picker. */
export function AppearancePanel(): ReactElement {
  const style = useAppearanceStore((s) => s.style)
  const setStyle = useAppearanceStore((s) => s.setStyle)

  return (
    <div className="space-y-12">
      <section>
        <div className="font-mono text-xs text-muted-foreground">
          <span>swarmterm</span>
          <span className="mx-1.5 text-muted-foreground/40">›</span>
          <span>config</span>
          <span className="mx-1.5 text-muted-foreground/40">›</span>
          <span className="text-foreground">appearance</span>
        </div>
        <h1 className="mt-4 font-mono text-5xl font-bold tracking-tight text-foreground">
          appearance<span className="text-muted-foreground/40">/</span>
        </h1>
        <p className="mt-4 max-w-2xl font-mono text-sm leading-relaxed text-muted-foreground">
          <span className="text-muted-foreground/50">#</span> tùy chỉnh cách Command
          Center hiển thị — áp dụng cho sidebar, workspace tabs, và toàn bộ terminal panes.
        </p>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">themes</span>
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
            {STYLE_OPTIONS.length} available
          </span>
        </div>

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {STYLE_OPTIONS.map((opt) => (
            <ThemeCard
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

interface ThemeCardProps {
  option: StyleOption
  active: boolean
  onSelect: () => void
}

function ThemeCard({ option, active, onSelect }: ThemeCardProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'group flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-primary/50 bg-muted/20 ring-2 ring-primary/15'
          : 'border-border hover:border-border/80 hover:bg-muted/20'
      )}
    >
      <TerminalPreview active={active} />
      <div className="flex items-end justify-between gap-2 px-0.5">
        <div>
          <div className="font-mono text-sm font-medium text-foreground">{option.label}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {option.variant} · {option.surface}
          </div>
        </div>
        {active && (
          <span className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground">
            <Check className="h-2.5 w-2.5" />
            active
          </span>
        )}
      </div>
    </button>
  )
}

/** A miniature terminal pane showing what swarmterm looks like in this style. */
function TerminalPreview({ active }: { active: boolean }): ReactElement {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/70">workspace 1</span>
      </div>
      <div className="flex flex-col gap-1 px-3 py-3 font-mono text-[10px] leading-tight">
        <div>
          <span className="text-muted-foreground/60">$</span>
          <span className="ml-1.5 text-foreground/85">swarmterm</span>
        </div>
        <div className="text-muted-foreground">
          <span className="text-foreground/70">●</span> session ready
        </div>
        <div className="text-muted-foreground">
          <span className="text-muted-foreground/70">→</span> 3 panes active
        </div>
        <div className="flex items-center pt-0.5">
          <span className="text-muted-foreground/60">$</span>
          <span
            className={cn(
              'ml-1.5 inline-block h-2.5 w-1.5 bg-foreground/80',
              active && 'animate-pulse'
            )}
            aria-hidden
          />
        </div>
      </div>
    </div>
  )
}
