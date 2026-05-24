import { useEffect, useState, type ReactElement } from 'react'
import { useAppStore, type Workspace as WorkspaceModel } from '@/store/app-store'
import { collectLeaves } from '@/lib/layout-tree'
import { disposeOrphanTerminals } from '@/lib/terminal-registry'
import { Navbar } from '@/components/Navbar/Navbar'
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

  const noWorkspaces = workspaces.length === 0
  // The setup wizard is forced open (and uncancellable) whenever none exist.
  const setupOpen = wizardOpen || noWorkspaces

  useEffect(() => {
    void showWindow()
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
        <Navbar onNewWorkspace={() => setWizardOpen(true)} />

        <main className="relative flex min-w-0 flex-1 flex-col">
          <WorkspaceTabs onNewWorkspace={() => setWizardOpen(true)} />

          {/* Every workspace stays mounted so its terminals survive switching;
              only the active one is visible. */}
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
        </main>
      </div>
    </div>
  )
}
