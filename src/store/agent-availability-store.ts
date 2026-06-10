import { create } from 'zustand'
import { listAvailableAgents } from '@/tauri/agents'
import type { AgentAvailabilityMap } from '@/lib/templates'

/**
 * Which agent CLIs are installed, per the backend probe. Starts as an empty
 * map, which `isTemplateAvailable` reads as "everything available" — so a
 * slow or failed probe never locks out a working CLI. `refresh()` re-probes;
 * call it whenever UI that offers agents opens (app mount, Welcome mount,
 * pane agent dropdown open) so a CLI installed while the app is running is
 * picked up without a restart.
 */
interface AgentAvailabilityState {
  availability: AgentAvailabilityMap
  refresh: () => Promise<void>
}

export const useAgentAvailabilityStore = create<AgentAvailabilityState>((set) => ({
  availability: {},
  refresh: async () => {
    try {
      const entries = await listAvailableAgents()
      const next: AgentAvailabilityMap = {}
      for (const e of entries) next[e.id] = e.available
      set({ availability: next })
    } catch {
      // Probe failure ⇒ keep the previous (optimistic) map rather than disabling anything.
    }
  }
}))
