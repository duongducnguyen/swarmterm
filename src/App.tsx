import { useEffect, useState, type ReactElement } from 'react'
import { useAppStore, type Workspace as WorkspaceModel } from '@/store/app-store'
import { useNavbarVisibilityStore } from '@/store/navbar-visibility-store'
import { collectLeaves } from '@/lib/layout-tree'
import { disposeOrphanTerminals } from '@/lib/terminal-registry'
import { Navbar } from '@/components/Navbar/Navbar'
import { SettingsView } from '@/components/Settings/SettingsView'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { Workspace } from '@/components/Workspace/Workspace'
import { WorkspaceSetup } from '@/components/WorkspaceSetup/WorkspaceSetup'
import { WorkspaceTabs } from '@/components/WorkspaceTabs/WorkspaceTabs'
import { showWindow } from '@/tauri/window'

/** Terminal ids referenced by any workspace's layout — the ones to keep alive. */
function liveTerminalIds(workspaces: WorkspaceModel[]): Set<string> {
  const ids = new Set<string>()
  for (const ws of workspaces) {
    for (const leaf of collectLeaves(ws.layout)) ids.add(leaf.terminalId)
  }
  return ids
}

export default function App(): ReactElement {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const noWorkspaces = workspaces.length === 0
  // The setup wizard is forced open (and uncancellable) whenever none exist.
  const setupOpen = wizardOpen || noWorkspaces

  useEffect(() => {
    void showWindow()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        useNavbarVisibilityStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // Kill a terminal's pty only when its leaf is gone from every layout (an
  // actual close), not when a pane merely remounts as the split tree changes.
  useEffect(
    () =>
      useAppStore.subscribe((state) =>
        disposeOrphanTerminals(liveTerminalIds(state.workspaces))
      ),
    []
  )

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Navbar
          onNewWorkspace={() => setWizardOpen(true)}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* Workspaces stay mounted whether Settings is open or not, so their
              terminals (and PTYs) survive a Settings detour. */}
          <div
            className="flex min-h-0 flex-1 flex-col"
            style={{ display: settingsOpen ? 'none' : 'flex' }}
          >
            <WorkspaceTabs onNewWorkspace={() => setWizardOpen(true)} />

            <div className="relative min-h-0 flex-1">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="absolute inset-0"
                  style={{ display: ws.id === activeWorkspaceId ? 'block' : 'none' }}
                >
                  <Workspace workspace={ws} />
                </div>
              ))}
            </div>

            <WorkspaceSetup
              open={setupOpen}
              required={noWorkspaces}
              onCreate={(config) => {
                createWorkspace(config)
                setWizardOpen(false)
              }}
              onCancel={() => setWizardOpen(false)}
            />
          </div>

          {settingsOpen && (
            <div className="absolute inset-0">
              <SettingsView onClose={() => setSettingsOpen(false)} />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
