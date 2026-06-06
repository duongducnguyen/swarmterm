import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useAppStore, type Workspace as WorkspaceModel } from '@/store/app-store'
import { useNavbarVisibilityStore } from '@/store/navbar-visibility-store'
import { collectLeaves } from '@/lib/layout-tree'
import { disposeOrphanTerminals } from '@/lib/terminal-registry'
import { BrowserColumn } from '@/components/Browser/BrowserColumn'
import { Navbar } from '@/components/Navbar/Navbar'
import { SettingsView } from '@/components/Settings/SettingsView'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { Workspace } from '@/components/Workspace/Workspace'
import { Welcome } from '@/components/Welcome/Welcome'
import { WorkspaceTabs } from '@/components/WorkspaceTabs/WorkspaceTabs'
import { useBrowserStore } from '@/store/browser-store'
import { useRecentsStore } from '@/store/recents-store'
import { onPreviewOpen } from '@/tauri/deeplink'
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
  const welcomeFocused = useAppStore((s) => s.welcomeFocused)
  const openWelcome = useAppStore((s) => s.openWelcome)
  const closeWelcome = useAppStore((s) => s.closeWelcome)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const browserVisible = useBrowserStore((s) => s.visible)
  const browserFullscreen = useBrowserStore((s) => s.fullscreen)

  const noWorkspaces = workspaces.length === 0
  // Welcome shows when explicitly focused, or forced (uncloseable) when none exist.
  const showWelcome = welcomeFocused || noWorkspaces
  const welcomeClosable = !noWorkspaces

  useEffect(() => {
    void showWindow()
    useRecentsStore.getState().hydrate()
  }, [])

  // Esc closes the Welcome page when it's closeable and Settings isn't covering it.
  useEffect(() => {
    if (!showWelcome || !welcomeClosable || settingsOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeWelcome()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showWelcome, welcomeClosable, settingsOpen, closeWelcome])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Esc exits browser fullscreen first — before any other handler.
      if (e.key === 'Escape' && useBrowserStore.getState().fullscreen) {
        e.preventDefault()
        useBrowserStore.getState().setFullscreen(false)
        return
      }
      // Esc also exits broadcast mode (which clears the group).
      if (e.key === 'Escape') {
        const st = useAppStore.getState()
        const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
        if (ws?.broadcastActive) {
          e.preventDefault()
          st.toggleBroadcast()
          return
        }
      }
      // Ctrl+Shift+B toggles broadcast mode for the active workspace.
      // If this binding changes, update src/lib/keybindings.ts.
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        useAppStore.getState().toggleBroadcast()
        return
      }
      // Ctrl+B (no shift) toggles the navbar.
      // If this binding changes, update src/lib/keybindings.ts.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        useNavbarVisibilityStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // Kill orphaned PTYs and close browser tabs when terminals leave all layouts.
  useEffect(
    () =>
      useAppStore.subscribe((state) => {
        const live = liveTerminalIds(state.workspaces)
        disposeOrphanTerminals(live)
        const close = useBrowserStore.getState().closeTabsForTerminal
        for (const tab of useBrowserStore.getState().tabs) {
          if (!live.has(tab.terminalId)) close(tab.terminalId)
        }
      }),
    []
  )

  // Wire deep-link preview:open events to browser tabs.
  useEffect(() => {
    const open = useBrowserStore.getState().openTab
    const unlisten = onPreviewOpen((e) => open({ terminalId: e.terminalId, url: e.url }))
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  /** Index of a terminal within the ordered set of live terminal ids (0 if not found). */
  const terminalIndexOf = useCallback(
    (terminalId: string): number => {
      const ids = [...liveTerminalIds(workspaces)]
      const i = ids.indexOf(terminalId)
      return i < 0 ? 0 : i
    },
    [workspaces]
  )

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />

      <div className="relative flex min-h-0 flex-1">
        <Navbar
          onNewWorkspace={openWelcome}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* Workspaces stay mounted and visible whether Settings is open or
              not — the Settings modal dims them behind its backdrop, and their
              terminals (and PTYs) survive a Settings detour. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <WorkspaceTabs onNewWorkspace={openWelcome} />

            <div className="relative min-h-0 flex-1 bg-canvas">
              {browserFullscreen ? (
                /* Fullscreen: BrowserColumn fills the entire content area. */
                <div className="absolute inset-0">
                  <BrowserColumn terminalIndexOf={terminalIndexOf} />
                </div>
              ) : (
                /* Normal split: workspace(s) left, browser column right (when visible). */
                <Group
                  key={browserVisible ? 'split' : 'solo'}
                  orientation="horizontal"
                  className="h-full w-full"
                  defaultLayout={browserVisible ? { 'app-workspace': 58, 'app-browser': 42 } : { 'app-workspace': 100 }}
                >
                  <Panel id="app-workspace" minSize="20%" className="relative h-full w-full overflow-hidden">
                    {workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className="absolute inset-0"
                        style={{ display: ws.id === activeWorkspaceId ? 'block' : 'none' }}
                      >
                        <Workspace workspace={ws} />
                      </div>
                    ))}
                  </Panel>

                  {browserVisible && (
                    <>
                      <Separator
                        className="w-1 shrink-0 cursor-col-resize bg-canvas transition-colors hover:bg-ring data-[separator]:bg-canvas"
                      />
                      <Panel id="app-browser" minSize="20%" className="h-full w-full overflow-hidden">
                        <BrowserColumn terminalIndexOf={terminalIndexOf} />
                      </Panel>
                    </>
                  )}
                </Group>
              )}

              {showWelcome && (
                <div className="absolute inset-0 z-20 overflow-y-auto bg-canvas">
                  <Welcome />
                </div>
              )}
            </div>
          </div>

        </main>

        {settingsOpen && <SettingsView onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  )
}
