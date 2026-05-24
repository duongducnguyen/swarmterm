import type React from 'react'
import { useAppStore } from '@/store/app-store'
import { Workspace } from '@/components/Workspace/Workspace'

export default function App(): React.ReactElement {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeId = useAppStore((s) => s.activeWorkspaceId)
  const active = workspaces.find((w) => w.id === activeId)
  return (
    <div className="h-screen w-screen bg-background text-foreground">
      {active ? <Workspace workspace={active} /> : <div className="p-4">No workspace</div>}
    </div>
  )
}
