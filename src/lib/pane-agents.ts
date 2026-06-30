import { DEFAULT_TEMPLATE_ID } from '@/lib/templates'

/** Resize a per-pane agent array to `count`: keep the first `count` entries,
 *  pad any new slots with DEFAULT_TEMPLATE_ID ('terminal'). Never mutates input. */
export function resizePaneAgents(agents: string[], count: number): string[] {
  if (agents.length >= count) return agents.slice(0, count)
  return [
    ...agents,
    ...Array.from({ length: count - agents.length }, () => DEFAULT_TEMPLATE_ID)
  ]
}
