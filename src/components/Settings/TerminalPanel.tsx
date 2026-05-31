import { useEffect, useState, type ReactElement } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { KNOWN_SHELLS, type ShellId, type ShellMeta } from '@/lib/terminal-pref'
import {
  MONO_FONTS,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  customFontStack,
  primaryFamily,
  type TerminalTextPref
} from '@/lib/terminal-text'
import { useTerminalPrefStore } from '@/store/terminal-pref-store'
import { useTerminalTextStore } from '@/store/terminal-text-store'
import { listAvailableShells, type AvailableShell } from '@/tauri/shell'
import { Button } from '@/components/ui/button'
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
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Terminal
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Choose which shell each new terminal pane starts with. Only affects new
          panes — already-running terminals keep their current shell.
        </p>
      </section>

      <TextSettings />

      {staleId && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          The shell <span className="font-mono font-semibold">{staleId}</span> isn't
          available anymore. Switched to <span className="font-semibold">Default</span>.
        </div>
      )}

      <section>
        <h2 className="mb-4 text-sm font-semibold text-foreground">Shell</h2>

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
        'flex flex-col gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
        !detected && 'cursor-not-allowed opacity-50',
        detected && active && 'border-primary/50 ring-2 ring-primary/15',
        detected && !active && 'border-pane-border hover:border-pane-border/80 hover:bg-muted/40',
        !detected && 'border-pane-border'
      )}
    >
      <div className="relative">
        <ShellPreview promptSample={meta.promptSample} active={active} />
        {active && detected && (
          <span
            aria-hidden
            className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <div className="text-sm font-medium text-foreground">{meta.label}</div>
        {detected ? (
          <>
            <div className="mt-0.5 text-xs text-muted-foreground">{meta.family}</div>
            {detectedPath && (
              <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
                {detectedPath}
              </div>
            )}
          </>
        ) : (
          <div className="mt-0.5 text-xs text-muted-foreground/70">Not installed</div>
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
    <div className="overflow-hidden rounded-md border border-border bg-canvas">
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

/** The "Text" settings group: font, size, line height, ligatures + preview. */
function TextSettings(): ReactElement {
  const text = useTerminalTextStore((s) => s.text)
  const setFontFamily = useTerminalTextStore((s) => s.setFontFamily)
  const setFontSize = useTerminalTextStore((s) => s.setFontSize)
  const setLineHeight = useTerminalTextStore((s) => s.setLineHeight)
  const setLigatures = useTerminalTextStore((s) => s.setLigatures)
  const reset = useTerminalTextStore((s) => s.reset)

  const matched = MONO_FONTS.find((f) => f.stack === text.fontFamily)
  const [customMode, setCustomMode] = useState(!matched)
  const [customDraft, setCustomDraft] = useState(matched ? '' : primaryFamily(text.fontFamily))
  const isCustom = customMode || !matched
  const selectValue = isCustom ? 'custom' : matched!.id

  function onSelectFont(id: string): void {
    if (id === 'custom') {
      setCustomMode(true)
      setCustomDraft(primaryFamily(text.fontFamily))
      return
    }
    setCustomMode(false)
    const font = MONO_FONTS.find((f) => f.id === id)
    if (font) setFontFamily(font.stack)
  }

  function onCustomChange(value: string): void {
    setCustomDraft(value)
    setFontFamily(customFontStack(value))
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Text</h2>
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset to default
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Font</span>
            <select
              value={selectValue}
              onChange={(e) => onSelectFont(e.target.value)}
              className="w-full rounded-md border border-pane-border bg-card px-2.5 py-1.5 text-sm text-foreground"
            >
              {MONO_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} · {f.platform}
                  {f.ligatures ? ' · ligatures' : ''}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>

          {isCustom && (
            <input
              type="text"
              value={customDraft}
              placeholder="Font family name"
              onChange={(e) => onCustomChange(e.target.value)}
              className="w-full rounded-md border border-pane-border bg-card px-2.5 py-1.5 text-sm text-foreground"
            />
          )}

          <Stepper
            label="Size"
            value={`${text.fontSize} px`}
            onDec={() => setFontSize(text.fontSize - 1)}
            onInc={() => setFontSize(text.fontSize + 1)}
            atMin={text.fontSize <= FONT_SIZE_MIN}
            atMax={text.fontSize >= FONT_SIZE_MAX}
          />

          <Stepper
            label="Line height"
            value={text.lineHeight.toFixed(1)}
            onDec={() => setLineHeight(text.lineHeight - 0.1)}
            onInc={() => setLineHeight(text.lineHeight + 0.1)}
            atMin={text.lineHeight <= LINE_HEIGHT_MIN}
            atMax={text.lineHeight >= LINE_HEIGHT_MAX}
          />

          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="block text-xs font-medium text-muted-foreground">Ligatures</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/70">
                Needs a ligature font (Cascadia Code, JetBrains Mono, Fira Code).
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={text.ligatures}
              aria-label="Toggle ligatures"
              onClick={() => setLigatures(!text.ligatures)}
              className={cn(
                'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
                text.ligatures ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform',
                  text.ligatures ? 'left-0.5 translate-x-4' : 'left-0.5'
                )}
              />
            </button>
          </div>
        </div>

        <TextPreview text={text} />
      </div>
    </section>
  )
}

interface StepperProps {
  label: string
  value: string
  onDec: () => void
  onInc: () => void
  atMin: boolean
  atMax: boolean
}

function Stepper({ label, value, onDec, onInc, atMin, atMax }: StepperProps): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={onDec} disabled={atMin} aria-label={`Decrease ${label}`}>
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-14 text-center text-sm tabular-nums text-foreground">{value}</span>
        <Button variant="outline" size="icon-sm" onClick={onInc} disabled={atMax} aria-label={`Increase ${label}`}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

/** Live sample of the chosen text settings, rendered via inline style. */
function TextPreview({ text }: { text: TerminalTextPref }): ReactElement {
  const sampleCode = 'const ok = (a >= b) => a !== b;'
  const sampleGlyphs = '// 0O 1lI -> |> == === !='
  return (
    <div className="overflow-hidden rounded-md border border-border bg-canvas">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/70">preview</span>
      </div>
      <div
        className="flex flex-col gap-1 px-3 py-3"
        style={{
          fontFamily: text.fontFamily,
          fontSize: `${text.fontSize}px`,
          lineHeight: text.lineHeight,
          fontFeatureSettings: text.ligatures ? '"liga" 1, "calt" 1' : 'normal'
        }}
      >
        <span className="text-foreground/85">{sampleCode}</span>
        <span className="text-muted-foreground">{sampleGlyphs}</span>
      </div>
    </div>
  )
}
