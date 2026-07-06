import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useAppStore, type Workspace as WorkspaceModel } from '@/store/app-store'
import { useNavbarVisibilityStore } from '@/store/navbar-visibility-store'
import { matchAppShortcut } from '@/lib/keybindings'
import { collectLeaves, findLeaf } from '@/lib/layout-tree'
import { isMacPlatform } from '@/lib/platform'
import { disposeOrphanTerminals } from '@/lib/terminal-registry'
import { RightPanel } from '@/components/RightPanel/RightPanel'
import { Navbar } from '@/components/Navbar/Navbar'
import { SettingsView } from '@/components/Settings/SettingsView'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { Workspace } from '@/components/Workspace/Workspace'
import { Welcome } from '@/components/Welcome/Welcome'
import { WorkspaceTabs } from '@/components/WorkspaceTabs/WorkspaceTabs'
import { useBrowserStore } from '@/store/browser-store'
import { useGitStore } from '@/store/git-store'
import { useRecentsStore } from '@/store/recents-store'
import { useAuthStore } from '@/store/auth-store'
import { useAgentAvailabilityStore } from '@/store/agent-availability-store'
import { useTerminalTitleStore } from '@/store/terminal-title-store'
import { onPreviewOpen, onAuthCallback, onTerminalTitle } from '@/tauri/deeplink'
import { onWorktreeSpawn, onWorktreeRemoved } from '@/tauri/worktree'
import { showWindow } from '@/tauri/window'
import type { CategoryId } from '@/components/Settings/SettingsView'

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
  const [settingsTab, setSettingsTab] = useState<CategoryId>('appearance')

  const openAccountSettings = useCallback(() => {
    setSettingsTab('account')
    setSettingsOpen(true)
  }, [])

  const gitPanelOpen = useGitStore((s) => s.panelOpen)

  const rightPanelVisible = gitPanelOpen

  const noWorkspaces = workspaces.length === 0
  // Welcome shows when explicitly focused, or forced (uncloseable) when none exist.
  const showWelcome = welcomeFocused || noWorkspaces
  const welcomeClosable = !noWorkspaces

  useEffect(() => {
    void showWindow()
    useRecentsStore.getState().hydrate()
    void useAuthStore.getState().hydrate()
    void useAgentAvailabilityStore.getState().refresh()
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
    const isMac = isMacPlatform()
    const onKeyDown = (e: KeyboardEvent): void => {
      // Esc exits broadcast mode (which clears the group).
      if (e.key === 'Escape') {
        const st = useAppStore.getState()
        const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
        if (ws?.broadcastActive) {
          e.preventDefault()
          st.toggleBroadcast()
          return
        }
      }
      // Cmd+B / Cmd+Shift+B on mac, Ctrl+B / Ctrl+Shift+B elsewhere.
      // If these bindings change, update src/lib/keybindings.ts.
      const action = matchAppShortcut(e, isMac)
      if (action === 'toggle-broadcast') {
        e.preventDefault()
        useAppStore.getState().toggleBroadcast()
        return
      }
      if (action === 'toggle-navbar') {
        e.preventDefault()
        useNavbarVisibilityStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // Kill orphaned PTYs and close previews when terminals leave all layouts.
  useEffect(
    () =>
      useAppStore.subscribe((state) => {
        const live = liveTerminalIds(state.workspaces)
        disposeOrphanTerminals(live)
        const { previews, closePreview } = useBrowserStore.getState()
        for (const terminalId of Object.keys(previews)) {
          if (!live.has(terminalId)) closePreview(terminalId)
        }
      }),
    []
  )

  // Wire MCP preview:open events to the per-terminal preview. Background
  // terminals update silently — the panel is only revealed when the event
  // belongs to the terminal the user is looking at.
  useEffect(() => {
    const unlisten = onPreviewOpen((e) => {
      useBrowserStore.getState().openPreview(e.terminalId, e.url)
      const st = useAppStore.getState()
      const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
      const focused = ws ? findLeaf(ws.layout, ws.focusedLeafId)?.terminalId : undefined
      if (focused === e.terminalId) useGitStore.getState().setMode('browser')
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  // Wire MCP terminal:title events to the per-terminal title store. The header
  // reads titles by terminalId, so no focus/workspace lookup is needed here.
  useEffect(() => {
    const unlisten = onTerminalTitle((e) => {
      useTerminalTitleStore.getState().setTitle(e.terminalId, e.title)
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  // Wire deep-link OAuth callback to auth store handler.
  useEffect(() => {
    const unlisten = onAuthCallback((code) => {
      void useAuthStore.getState().handleCallback(code)
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  // Wire MCP worktree tool events to store actions: spawn opens a worker pane,
  // removed clears the binding and relocates the pane back to the workspace folder.
  useEffect(() => {
    const unSpawn = onWorktreeSpawn((e) => {
      useAppStore.getState().spawnWorktreePane({
        requesterTerminalId: e.requesterTerminalId,
        path: e.path,
        branch: e.branch,
        agentId: e.agent ?? undefined,
        prompt: e.prompt
      })
    })
    const unRemoved = onWorktreeRemoved((e) => {
      useAppStore.getState().clearWorktreeBinding(e.path)
    })
    return () => {
      void unSpawn.then((f) => f())
      void unRemoved.then((f) => f())
    }
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />

      <div className="relative flex min-h-0 flex-1">
        <Navbar
          onNewWorkspace={openWelcome}
          settingsOpen={settingsOpen}
          onToggleSettings={() => {
            setSettingsTab('appearance')
            setSettingsOpen((open) => !open)
          }}
          onOpenAccountSettings={openAccountSettings}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* Workspaces stay mounted and visible whether Settings is open or
              not — the Settings modal dims them behind its backdrop, and their
              terminals (and PTYs) survive a Settings detour. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <WorkspaceTabs onNewWorkspace={openWelcome} />

            <div className="relative min-h-0 flex-1 bg-canvas">
              {/* Workspace(s) left, right panel (Preview/Git) when toggled on. */}
              <Group
                key={rightPanelVisible ? 'split' : 'solo'}
                orientation="horizontal"
                className="h-full w-full"
                defaultLayout={rightPanelVisible ? { 'app-workspace': 70, 'app-browser': 30 } : { 'app-workspace': 100 }}
              >
                <Panel id="app-workspace" minSize="30%" className="relative h-full w-full overflow-hidden">
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

                {rightPanelVisible && (
                  <>
                    <Separator
                      className="w-1 shrink-0 cursor-col-resize bg-canvas transition-colors hover:bg-ring data-[separator]:bg-canvas"
                    />
                    <Panel id="app-browser" minSize="20%" maxSize="50%" className="h-full w-full overflow-hidden">
                      <RightPanel />
                    </Panel>
                  </>
                )}
              </Group>

              {showWelcome && (
                <div className="absolute inset-0 z-20 overflow-y-auto bg-canvas">
                  <Welcome />
                </div>
              )}
            </div>
          </div>

        </main>

        {settingsOpen && (
          <SettingsView
            key={settingsTab}
            onClose={() => setSettingsOpen(false)}
            initialCategory={settingsTab}
          />
        )}
      </div>
    </div>
  )
}
