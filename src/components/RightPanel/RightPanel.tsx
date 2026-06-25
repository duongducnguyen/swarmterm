// src/components/RightPanel/RightPanel.tsx
import type { ReactElement } from 'react'
import { useBrowserStore } from '@/store/browser-store'
import { useGitStore } from '@/store/git-store'
import { BrowserColumn } from '@/components/Browser/BrowserColumn'
import { GitPanel } from '@/components/Git/GitPanel'

interface RightPanelProps {
  terminalIndexOf: (terminalId: string) => number
}

export function RightPanel({ terminalIndexOf }: RightPanelProps): ReactElement {
  const mode = useGitStore((s) => s.mode)
  const setMode = useGitStore((s) => s.setMode)
  const setPanelOpen = useGitStore((s) => s.setPanelOpen)
  const setVisible = useBrowserStore((s) => s.setVisible)
  const browserTabs = useBrowserStore((s) => s.tabs)
  const browserVisible = useBrowserStore((s) => s.visible)

  function handleClose(): void {
    setVisible(false)
    setPanelOpen(false)
  }

  function handleBrowserTab(): void {
    setMode('browser')
    setPanelOpen(false)
    // Re-show browser panel if it was hidden but still has tabs.
    if (!browserVisible && browserTabs.length > 0) {
      setVisible(true)
    }
  }

  function handleGitTab(): void {
    setMode('git')
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
          🌐 Browser
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
          🌿 Git
        </button>
        <button
          onClick={handleClose}
          className="ml-auto px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Mode content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {mode === 'browser'
          ? <BrowserColumn terminalIndexOf={terminalIndexOf} />
          : <GitPanel />
        }
      </div>
    </div>
  )
}
