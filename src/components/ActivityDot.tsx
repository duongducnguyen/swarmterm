import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'

/**
 * A small solid yellow dot marking a terminal (or a workspace containing one)
 * that is actively producing output. No animation — a steady dot reads as a
 * status, and the tracker's debounce already prevents flicker.
 */
export function ActivityDot({ className }: { className?: string }): ReactElement {
  return (
    <span
      aria-label="Working"
      title="Working"
      className={cn('h-2 w-2 shrink-0 rounded-full bg-activity', className)}
    />
  )
}
