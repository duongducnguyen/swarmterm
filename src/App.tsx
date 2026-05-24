import { useEffect } from 'react'
import type React from 'react'
import { useAppStore } from '@/store/app-store'
import { Workspace } from '@/components/Workspace/Workspace'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { showWindow } from '@/tauri/window'

export default function App(): React.ReactElement {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeId = useAppStore((s) => s.activeWorkspaceId)
  const active = workspaces.find((w) => w.id === activeId)

  useEffect(() => {
    void showWindow()
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <TitleBar />
      <div className="min-h-0 flex-1">
        {active ? <Workspace workspace={active} /> : <div className="p-4">No workspace</div>}
      </div>
    </div>
  )
}
