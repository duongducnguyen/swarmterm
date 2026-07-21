import { create } from 'zustand'
import { listAvailableShells } from '@/tauri/shell'
import type { ShellAvailabilityMap } from '@/lib/terminal-pref'
import { useTerminalPrefStore } from '@/store/terminal-pref-store'

/**
 * Which shells the backend probe found, keyed by id. The probe is compiled per
 * OS, so this map is also what keeps platform-foreign shells out of the UI:
 * a macOS build never reports `powershell`, so it never renders.
 *
 * Unlike the agent probe, an empty map is read pessimistically (`visibleShells`
 * falls back to Default alone) — an optimistic default would flash the Windows
 * catalog on macOS, which is the bug this store was added to fix. `refresh()`
 * is therefore called at app mount, not lazily on menu open.
 */
interface ShellAvailabilityState {
  availability: ShellAvailabilityMap
  refresh: () => Promise<void>
}

export const useShellAvailabilityStore = create<ShellAvailabilityState>((set) => ({
  availability: {},
  refresh: async () => {
    try {
      const entries = await listAvailableShells()
      const next: ShellAvailabilityMap = {}
      for (const e of entries) next[e.id] = e.available
      set({ availability: next })

      // A preference persisted on another OS (or for a since-uninstalled shell)
      // silently falls back to the platform default in `pty::spawn_terminal`.
      // Reset it here so the header label matches the shell actually running,
      // instead of claiming "PowerShell" over a zsh pane on macOS.
      const { shellId, setShellId } = useTerminalPrefStore.getState()
      if (shellId !== 'default' && next[shellId] !== true) setShellId('default')
    } catch {
      // Probe failure ⇒ keep the previous map. The initial empty map already
      // degrades to "Default only", which is safe on every platform.
    }
  }
}))
