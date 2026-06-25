// src/components/Git/InlineDiff.tsx
import type { ReactElement } from 'react'
import { parseDiff } from '@/lib/git-diff'

interface InlineDiffProps {
  raw: string
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
    <div className="border-l-2 border-[#4ec994] bg-canvas py-1 font-mono text-xs">
      {lines.map((line, i) => {
        if (line.type === 'hunk') {
          return (
            <div key={i} className="px-3 py-0.5 text-muted-foreground">
              {line.content}
            </div>
          )
        }
        if (line.type === 'added') {
          return (
            <div key={i} className="bg-[rgba(78,201,78,0.1)] px-3 text-[#4ec94e]">
              +{line.content}
            </div>
          )
        }
        if (line.type === 'removed') {
          return (
            <div key={i} className="bg-[rgba(241,76,76,0.1)] px-3 text-[#f14c4c]">
              -{line.content}
            </div>
          )
        }
        // context
        return (
          <div key={i} className="px-3 text-muted-foreground">
            {line.content || ' '}
          </div>
        )
      })}
    </div>
  )
}
