import { type ReactElement } from 'react'
import { Check } from 'lucide-react'
import { useAppearanceStore } from '@/store/appearance-store'
import type { Style } from '@/lib/appearance'
import { cn } from '@/lib/utils'

interface StyleOption {
  id: Style
  label: string
  variant: 'Dark' | 'Light'
  surface: string
}

const STYLE_OPTIONS: StyleOption[] = [
  { id: 'vscode-dark', label: 'VS Code Dark', variant: 'Dark', surface: 'Modern' }
]

/** The "Appearance" settings category — currently a single Style picker. */
export function AppearancePanel(): ReactElement {
  const style = useAppearanceStore((s) => s.style)
  const setStyle = useAppearanceStore((s) => s.setStyle)

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Appearance
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Customise how Swarmterm looks — applied across the sidebar, workspace tabs,
          and every terminal pane.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-foreground">Theme</h2>

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
        'flex flex-col gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
        active
          ? 'border-primary/50 ring-2 ring-primary/15'
          : 'border-pane-border hover:border-pane-border/80 hover:bg-muted/40'
      )}
    >
      <div className="relative">
        <TerminalPreview active={active} />
        {active && (
          <span
            aria-hidden
            className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="px-0.5">
        <div className="text-sm font-medium text-foreground">{option.label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {option.variant} · {option.surface}
        </div>
      </div>
    </button>
  )
}

/** A miniature terminal pane showing what swarmterm looks like in this style. */
function TerminalPreview({ active }: { active: boolean }): ReactElement {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-canvas">
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
