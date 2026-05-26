import { useEffect, useState, type ReactElement } from 'react'
import { Check } from 'lucide-react'
import { KNOWN_SHELLS, type ShellId, type ShellMeta } from '@/lib/terminal-pref'
import { useTerminalPrefStore } from '@/store/terminal-pref-store'
import { listAvailableShells, type AvailableShell } from '@/tauri/shell'
import { cn } from '@/lib/utils'

/** The "Terminal" settings category — pick the shell new panes spawn with. */
export function TerminalPanel(): ReactElement {
  const shellId = useTerminalPrefStore((s) => s.shellId)
  const setShellId = useTerminalPrefStore((s) => s.setShellId)
  const [available, setAvailable] = useState<AvailableShell[] | null>(null)
  const [staleId, setStaleId] = useState<ShellId | null>(null)

  useEffect(() => {
    let cancelled = false
    listAvailableShells()
      .then((list) => {
        if (cancelled) return
        setAvailable(list)
        const match = list.find((s) => s.id === shellId)
        if (!match || !match.available) {
          setStaleId(shellId)
          setShellId('default')
        } else {
          // The persisted shell is valid — drop the banner from any previous run
          // in this session so it doesn't outlive its trigger condition.
          setStaleId(null)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[TerminalPanel] listAvailableShells failed', err)
        setAvailable([])
      })
    return () => {
      cancelled = true
    }
  }, [shellId, setShellId])

  return (
    <div className="space-y-12">
      <section>
        <div className="font-mono text-xs text-muted-foreground">
          <span>swarmterm</span>
          <span className="mx-1.5 text-muted-foreground/40">›</span>
          <span>config</span>
          <span className="mx-1.5 text-muted-foreground/40">›</span>
          <span className="text-foreground">terminal</span>
        </div>
        <h1 className="mt-4 font-mono text-5xl font-bold tracking-tight text-foreground">
          terminal<span className="text-muted-foreground/40">/</span>
        </h1>
        <p className="mt-4 max-w-2xl font-mono text-sm leading-relaxed text-muted-foreground">
          <span className="text-muted-foreground/50">#</span> choose which shell each
          new terminal pane starts with. only affects new panes — already-running
          terminals keep their current shell.
        </p>
      </section>

      {staleId && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 font-mono text-xs text-amber-200">
          selected shell <span className="font-semibold">'{staleId}'</span> is no
          longer detected — falling back to <span className="font-semibold">default</span>.
        </div>
      )}

      <section>
        <div className="mb-5 flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">shells</span>
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
            {KNOWN_SHELLS.length} known
          </span>
        </div>

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {KNOWN_SHELLS.map((meta) => {
            const probe = available?.find((s) => s.id === meta.id)
            const detected = probe?.available ?? meta.id === 'default'
            return (
              <ShellCard
                key={meta.id}
                meta={meta}
                detected={detected}
                detectedPath={probe?.detectedPath}
                active={meta.id === shellId}
                onSelect={() => detected && setShellId(meta.id)}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}

interface ShellCardProps {
  meta: ShellMeta
  detected: boolean
  detectedPath?: string
  active: boolean
  onSelect: () => void
}

function ShellCard({
  meta,
  detected,
  detectedPath,
  active,
  onSelect
}: ShellCardProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!detected}
      aria-pressed={active}
      aria-disabled={!detected}
      className={cn(
        'group flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors',
        !detected && 'cursor-not-allowed opacity-50',
        detected && active && 'border-primary/50 bg-muted/20 ring-2 ring-primary/15',
        detected && !active && 'border-border hover:border-border/80 hover:bg-muted/20',
        !detected && 'border-border'
      )}
    >
      <ShellPreview promptSample={meta.promptSample} active={active} />
      <div className="flex items-end justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="font-mono text-sm font-medium text-foreground">{meta.label}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {detected
              ? detectedPath
                ? `${meta.family} · ${detectedPath}`
                : meta.family
              : 'not detected'}
          </div>
        </div>
        {active && detected && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground">
            <Check className="h-2.5 w-2.5" />
            active
          </span>
        )}
      </div>
    </button>
  )
}

interface ShellPreviewProps {
  promptSample: string
  active: boolean
}

function ShellPreview({ promptSample, active }: ShellPreviewProps): ReactElement {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/70">shell</span>
      </div>
      <div className="flex flex-col gap-1 px-3 py-3 font-mono text-[10px] leading-tight">
        <div className="text-foreground/85">{promptSample}</div>
        <div className="flex items-center pt-0.5">
          <span className="text-muted-foreground/60">{promptSample.slice(0, 1) || '$'}</span>
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
