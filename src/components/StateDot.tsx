import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'

/**
 * Agent-state dot: red demands input, green waits to be looked at, yellow is
 * the same "busy" the ActivityDot shows. Colors are VS Code Dark Modern ANSI
 * (brightRed / brightGreen) so the chrome matches the terminal interior.
 * idle/unknown render nothing — callers decide fallbacks via paneDot().
 */
const DOT: Record<'blocked' | 'done' | 'working', { className: string; label: string }> = {
  blocked: { className: 'bg-[#F14C4C]', label: 'Blocked — needs your input' },
  done: { className: 'bg-[#23D18B]', label: 'Done — finished while you were away' },
  working: { className: 'bg-activity', label: 'Working' }
}

export function StateDot({
  state,
  className
}: {
  state: 'blocked' | 'done' | 'working'
  className?: string
}): ReactElement {
  const { className: color, label } = DOT[state]
  return (
    <span
      aria-label={label}
      title={label}
      className={cn('h-2 w-2 shrink-0 rounded-full', color, className)}
    />
  )
}
