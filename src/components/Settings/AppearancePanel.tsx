import { type ReactElement } from 'react'
import { Check, Palette } from 'lucide-react'
import { useAppearanceStore } from '@/store/appearance-store'
import type { Style } from '@/lib/appearance'
import { cn } from '@/lib/utils'

interface StyleOption {
  id: Style
  label: string
  tag: string
}

const STYLE_OPTIONS: StyleOption[] = [
  { id: 'default', label: 'Default', tag: 'solid backdrop' }
]

/** The "Appearance" settings category — currently a single Style picker. */
export function AppearancePanel(): ReactElement {
  const style = useAppearanceStore((s) => s.style)
  const setStyle = useAppearanceStore((s) => s.setStyle)
  const activeOption = STYLE_OPTIONS.find((o) => o.id === style) ?? STYLE_OPTIONS[0]

  return (
    <div className="space-y-10">
      <section className="grid items-start gap-8 md:grid-cols-[1fr_auto]">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Palette className="h-3 w-3" />
            Appearance
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground">
            Make it yours.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Chọn phong cách giao diện áp dụng cho toàn bộ ứng dụng — sidebar, terminal và
            workspace.
          </p>
        </div>

        <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-muted/30 p-5 md:w-80">
          <span className="absolute right-4 top-4 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
            Active
          </span>
          <WindowMockup variant="hero" />
          <div className="mt-4 text-right">
            <div className="text-sm font-semibold text-foreground">{activeOption.label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Dark · {activeOption.id}</div>
          </div>
        </div>
      </section>

      <div className="border-t border-border" />

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Theme
          </span>
        </div>

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
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
        'group relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-muted/30 p-4 text-left transition-all',
        active
          ? 'border-primary/50 ring-2 ring-primary/20'
          : 'border-border hover:border-border/80 hover:bg-muted/50'
      )}
    >
      {active && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </div>
      )}
      <WindowMockup variant="card" />
      <div>
        <div className="text-sm font-semibold text-foreground">{option.label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{option.tag}</div>
      </div>
    </button>
  )
}

interface WindowMockupProps {
  variant: 'hero' | 'card'
}

/** A tiny window mockup — traffic lights, content bars, and an accent button. */
function WindowMockup({ variant }: WindowMockupProps): ReactElement {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-background',
        variant === 'hero' ? 'h-32' : 'h-24'
      )}
    >
      <div className="flex items-center gap-1 border-b border-border bg-muted/60 px-2.5 py-2">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <div className="h-1.5 w-3/4 rounded-full bg-muted-foreground/30" />
        <div className="h-1.5 w-1/2 rounded-full bg-muted-foreground/20" />
        <div className="mt-1 flex items-center justify-between">
          <div className="h-1.5 w-1/3 rounded-full bg-muted-foreground/30" />
          <div className="h-4 w-12 rounded-md bg-primary/80" />
        </div>
      </div>
    </div>
  )
}
