import { invoke } from '@tauri-apps/api/core'

/** Backend probe result for one agent CLI. `available === false` ⇒ disable in UI. */
export interface AgentAvailability {
  id: string
  available: boolean
  detectedPath?: string
}

export const listAvailableAgents = (): Promise<AgentAvailability[]> =>
  invoke('list_available_agents')
