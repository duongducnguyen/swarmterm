import { useEffect, useState, type ReactElement } from 'react'
import { useAppStore } from '@/store/app-store'
import { Navbar } from '@/components/Navbar/Navbar'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { Workspace } from '@/components/Workspace/Workspace'
import { WorkspaceSetup } from '@/components/WorkspaceSetup/WorkspaceSetup'
import { WorkspaceTabs } from '@/components/WorkspaceTabs/WorkspaceTabs'
import { showWindow } from '@/tauri/window'

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
