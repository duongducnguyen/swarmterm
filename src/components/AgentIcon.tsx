import { TerminalSquare } from 'lucide-react'
import type { WorkspaceTemplate } from '@/lib/templates'
import { cn } from '@/lib/utils'

interface AgentIconProps {
  template: WorkspaceTemplate
  className?: string
}

/**
 * The brand logo for an agent template, or a generic terminal glyph for the
 * plain shell (and any template without a bundled logo). `object-contain`
 * normalises the differing logo aspect ratios into a uniform square box.
 */
export function AgentIcon({ template, className }: AgentIconProps): React.ReactElement {
  if (template.icon) {
    return (
      <img
        src={template.icon}
        alt=""
        aria-hidden="true"
        className={cn('rounded-[3px] object-contain', className)}
      />
    )
  }
  return <TerminalSquare aria-hidden="true" className={cn('text-muted-foreground', className)} />
}
