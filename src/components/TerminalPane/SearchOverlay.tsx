import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { CaseSensitive, WholeWord, Regex, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTerminalSearchStore } from '@/store/terminal-search-store'
import {
  clearTerminalSearch,
  focusTerminal,
  onTerminalSearchResults,
  terminalSearchNext,
  terminalSearchPrevious,
  type TerminalSearchOptions
} from '@/lib/terminal-registry'
import { cn } from '@/lib/utils'

interface SearchOverlayProps {
  terminalId: string
}

/** The three match modifiers, tracked apart from the query text itself. */
interface SearchToggles {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

const NO_TOGGLES: SearchToggles = { caseSensitive: false, wholeWord: false, regex: false }

/**
 * "k of n" / "No results" summary. xterm's SearchAddon reports `resultIndex:
 * -1` once the match count exceeds its internal highlight cap (1000 by
 * default — see `ISearchResultChangeEvent`) instead of a real 0-based index,
 * so that case renders the bare total rather than a nonsensical "0 of n".
 */
function matchSummary(query: string, resultIndex: number, resultCount: number): string {
  if (query === '') return ''
  if (resultCount === 0) return 'No results'
  if (resultIndex < 0) return `${resultCount} results`
  return `${resultIndex + 1} of ${resultCount}`
}

/**
 * VS Code-style find widget for one terminal pane. `TerminalPane` mounts this
 * only while `terminal-search-store`'s `openFor` names this terminal, so every
 * piece of state below (query, toggles, match count) is naturally fresh on
 * each open — there is nothing to reset explicitly when the overlay closes.
 */
export function SearchOverlay({ terminalId }: SearchOverlayProps): ReactElement {
  const close = useTerminalSearchStore((s) => s.close)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [toggles, setToggles] = useState<SearchToggles>(NO_TOGGLES)
  const [resultIndex, setResultIndex] = useState(-1)
  const [resultCount, setResultCount] = useState(0)

  // Autofocus on mount, and again for every later Cmd/Ctrl+F while this
  // overlay stays mounted: App.tsx calls `open(terminalId)` again with the
  // SAME id (e.g. after the user clicked back into the terminal), which the
  // store's selector hook won't turn into a re-render since the selected
  // value didn't change — a raw subscription is what actually observes the
  // repeat call.
  useEffect(() => {
    const focusAndSelect = (): void => {
      const el = inputRef.current
      el?.focus()
      el?.select()
    }
    focusAndSelect()
    return useTerminalSearchStore.subscribe((s) => {
      if (s.openFor === terminalId) focusAndSelect()
    })
  }, [terminalId])

  // Match-count feed from the addon.
  useEffect(() => {
    return onTerminalSearchResults(terminalId, (r) => {
      setResultIndex(r.resultIndex)
      setResultCount(r.resultCount)
    })
  }, [terminalId])

  /** Empty query clears; otherwise re-runs the search with the given options. */
  function runSearch(q: string, opts: SearchToggles, direction: 'next' | 'previous', incremental: boolean): void {
    if (q === '') {
      clearTerminalSearch(terminalId)
      // clearDecorations() does not fire onDidChangeResults, so the count has
      // to be reset here rather than left to the subscription above.
      setResultIndex(-1)
      setResultCount(0)
      return
    }
    const searchOpts: TerminalSearchOptions = { ...opts, incremental }
    if (direction === 'next') terminalSearchNext(terminalId, q, searchOpts)
    else terminalSearchPrevious(terminalId, q, searchOpts)
  }

  function handleQueryChange(next: string): void {
    setQuery(next)
    runSearch(next, toggles, 'next', true)
  }

  function handleToggle(key: keyof SearchToggles): void {
    const next = { ...toggles, [key]: !toggles[key] }
    setToggles(next)
    runSearch(query, next, 'next', true)
    // Toggle buttons steal DOM focus on click; hand it straight back so
    // typing resumes without a click into the input (terminal-focus.ts
    // stands down for inputs, so nothing else would do this for us).
    inputRef.current?.focus()
  }

  function handleStep(direction: 'next' | 'previous'): void {
    runSearch(query, toggles, direction, false)
    inputRef.current?.focus()
  }

  function handleClose(): void {
    clearTerminalSearch(terminalId)
    close()
    focusTerminal(terminalId)
  }

  return (
    // Hard-coded VS Code dark-widget colors on purpose: this floats over the
    // terminal, whose palette is fixed Dark Modern regardless of app theme
    // (see VSCODE_DARK_THEME) — theme tokens like bg-card sit at the same
    // lightness as the terminal background and the widget disappears into it.
    <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-[#454545] bg-[#2d2d30] px-1.5 py-1 text-xs text-[#cccccc] shadow-[0_4px_12px_rgba(0,0,0,0.55)]">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={(e) => {
          // Owns Enter/Shift+Enter/Esc outright: stop them bubbling past this
          // input to any ancestor keydown listener (this input isn't inside
          // the terminal's own `host` element, so it was never reachable by
          // xterm's listener there — this guards against anything else on
          // the way up, e.g. a future document-level shortcut).
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            handleStep(e.shiftKey ? 'previous' : 'next')
          } else if (e.key === 'Escape') {
            e.preventDefault()
            handleClose()
          }
        }}
        placeholder="Find"
        aria-label="Find in terminal"
        className="h-6 w-40 rounded border border-transparent bg-[#3c3c3c] px-1.5 text-[#cccccc] placeholder:text-[#8c8c8c] outline-none focus:border-[#0078d4]"
      />
      <span className="min-w-[3.5rem] shrink-0 whitespace-nowrap px-1 text-center text-[#a0a0a0]">
        {matchSummary(query, resultIndex, resultCount)}
      </span>
      <ToggleButton label="Match case" pressed={toggles.caseSensitive} onClick={() => handleToggle('caseSensitive')}>
        <CaseSensitive className="h-3.5 w-3.5" />
      </ToggleButton>
      <ToggleButton label="Match whole word" pressed={toggles.wholeWord} onClick={() => handleToggle('wholeWord')}>
        <WholeWord className="h-3.5 w-3.5" />
      </ToggleButton>
      <ToggleButton label="Use regular expression" pressed={toggles.regex} onClick={() => handleToggle('regex')}>
        <Regex className="h-3.5 w-3.5" />
      </ToggleButton>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        onClick={() => handleStep('previous')}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Next match (Enter)"
        aria-label="Next match"
        onClick={() => handleStep('next')}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon-sm" title="Close (Esc)" aria-label="Close find" onClick={handleClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

interface ToggleButtonProps {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}

function ToggleButton({ label, pressed, onClick, children }: ToggleButtonProps): ReactElement {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(pressed && 'bg-accent text-accent-foreground')}
    >
      {children}
    </Button>
  )
}
