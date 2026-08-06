import { invoke } from '@tauri-apps/api/core'
import type { AgentSessionEntry } from '@/lib/agent-sessions'

/** Recent resumable sessions recorded for `folder` by the agent CLIs
 *  themselves. Backend is fail-open: errors surface as an empty list. */
export const listAgentSessions = (folder: string): Promise<AgentSessionEntry[]> =>
  invoke('list_agent_sessions', { folder })
