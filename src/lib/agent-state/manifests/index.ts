import { claudeCodeManifest } from '@/lib/agent-state/manifests/claude-code'
import { codexManifest } from '@/lib/agent-state/manifests/codex'
import { opencodeManifest } from '@/lib/agent-state/manifests/opencode'
import type { Manifest } from '@/lib/agent-state/types'

/** Keyed by workspace template id (src/lib/templates.ts), NOT herdr agent id. */
const MANIFESTS: Record<string, Manifest> = {
  'claude-code': claudeCodeManifest,
  codex: codexManifest,
  opencode: opencodeManifest
}

/** undefined for plain 'terminal' panes and unknown ids — no detection. */
export function manifestForAgent(agentId: string | undefined): Manifest | undefined {
  return agentId === undefined ? undefined : MANIFESTS[agentId]
}
