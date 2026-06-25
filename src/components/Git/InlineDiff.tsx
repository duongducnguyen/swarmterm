// src/components/Git/InlineDiff.tsx
import type { ReactElement } from 'react'
import { parseDiff } from '@/lib/git-diff'

interface InlineDiffProps {
  raw: string
}

/**
 * Fixed-width line-number cell. Non-selectable so copying the diff body does not
 * drag the gutter numbers along. Blank when the number is absent (added lines
 * have no old number; removed lines have no new number) — the cell keeps its
 * width to keep the two gutter columns aligned.
 */
function Gutter({ n }: { n?: number }): ReactElement {
  return (
    <span className="w-10 shrink-0 select-none pr-2 text-right tabular-nums text-muted-foreground/50 pointer-events-none">
      {n ?? ''}
    </span>
  )
}

export function InlineDiff({ raw }: InlineDiffProps): ReactElement {
  const lines = parseDiff(raw)

  if (lines.length === 0) {
    return (
      <div className="px-3 py-2 text-xs italic text-muted-foreground">
        No diff available
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border-l-2 border-[#4ec994] bg-canvas py-1 font-mono text-xs">
      {lines.map((line, i) => {
        if (line.type === 'hunk') {
          // Hunk header spans the full width — no gutter cells.
          return (
            <div key={i} className="px-3 py-0.5 text-muted-foreground">
              {line.content}
            </div>
          )
        }
        if (line.type === 'added') {
          return (
            <div key={i} className="flex w-max min-w-full bg-[rgba(78,201,78,0.1)] text-[#4ec94e]">
              <Gutter n={line.oldLineNo} />
              <Gutter n={line.newLineNo} />
              <span className="whitespace-pre">+{line.content}</span>
            </div>
          )
        }
        if (line.type === 'removed') {
          return (
            <div key={i} className="flex w-max min-w-full bg-[rgba(241,76,76,0.1)] text-[#f14c4c]">
              <Gutter n={line.oldLineNo} />
              <Gutter n={line.newLineNo} />
              <span className="whitespace-pre">-{line.content}</span>
            </div>
          )
        }
        // context
        return (
          <div key={i} className="flex w-max min-w-full text-muted-foreground">
            <Gutter n={line.oldLineNo} />
            <Gutter n={line.newLineNo} />
            <span className="whitespace-pre">{line.content || ' '}</span>
          </div>
        )
      })}
    </div>
  )
}
