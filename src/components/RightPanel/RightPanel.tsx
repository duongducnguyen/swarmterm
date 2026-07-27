// src/components/RightPanel/RightPanel.tsx
import type { ReactElement } from 'react'
import { Eye, GitBranch, RotateCw, Swords, X } from 'lucide-react'
import { useGitStore } from '@/store/git-store'
import { BrowserColumn } from '@/components/Browser/BrowserColumn'
import { GitPanel } from '@/components/Git/GitPanel'
import { WarRoomPanel } from '@/components/WarRoom/WarRoomPanel'

function RefreshButton(): ReactElement {
  const refresh = useGitStore((s) => s.refresh)
  return (
    <button
      onClick={refresh}
      className="ml-auto flex items-center px-2 text-muted-foreground hover:text-foreground"
      aria-label="Refresh"
      title="Refresh git"
    >
      <RotateCw className="h-3.5 w-3.5" />
    </button>
  )
}

export function RightPanel(): ReactElement {
  const mode = useGitStore((s) => s.mode)
  const setMode = useGitStore((s) => s.setMode)
  const setPanelOpen = useGitStore((s) => s.setPanelOpen)

  function handleClose(): void {
    setPanelOpen(false)
  }

  function handleBrowserTab(): void {
    setMode('browser')
  }

  function handleGitTab(): void {
    setMode('git')
  }

  function handleWarRoomTab(): void {
    setMode('warroom')
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-background">
      {/* Mode tab strip */}
      <div className="flex shrink-0 items-stretch border-b border-border bg-muted/30">
        <button
          onClick={handleBrowserTab}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            mode === 'browser'
              ? 'border-b-2 border-[#0ea5e9] bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          onClick={handleGitTab}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            mode === 'git'
              ? 'border-b-2 border-[#4ec994] bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Git
        </button>
        <button
          onClick={handleWarRoomTab}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            mode === 'warroom'
              ? 'border-b-2 border-[#f97316] bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <Swords className="h-3.5 w-3.5" />
          War Room
        </button>
        {mode === 'git' && <RefreshButton />}
        <button
          onClick={handleClose}
          className="flex items-center px-2 text-muted-foreground hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mode content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {mode === 'browser' && <BrowserColumn />}
        {mode === 'git' && <GitPanel />}
        {mode === 'warroom' && <WarRoomPanel />}
      </div>
    </div>
  )
}
