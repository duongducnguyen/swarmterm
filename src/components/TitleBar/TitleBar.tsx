import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import {
  Copy,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  Square,
  SquareTerminal,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { useNavbarVisibilityStore } from '@/store/navbar-visibility-store'
import { useBrowserStore } from '@/store/browser-store'
import { minimize, toggleMaximize, closeWindow, onMaximizedChanged } from '@/tauri/window'
import { isMacPlatform } from '@/lib/platform'
import { HeaderRecentSearch } from './HeaderRecentSearch'

// On macOS the OS draws native traffic lights over this header (titleBarStyle
// Overlay — see tauri.macos.conf.json): hide the custom window buttons and
// inset the left cluster so it clears the lights. Platform never changes at
// runtime, so a module-level constant is fine.
const isMac = isMacPlatform()
// Tooltip hints must match the platform binding (mac convention: ⇧ before ⌘).
const navbarHint = isMac ? '⌘B' : 'Ctrl+B'
const broadcastHint = isMac ? '⇧⌘B' : 'Ctrl+Shift+B'

/**
 * Custom window title bar for the frameless window. Left cluster:
 * [sidebar toggle] [app icon] [app name]. Centre: a read-only pill showing the
 * active workspace's name. Right: minimize / maximize / close window controls
 * on Windows/Linux; on macOS those are hidden — the OS overlays native
 * traffic lights at the left instead (see tauri.macos.conf.json).
 */
export function TitleBar(): ReactElement {
  const [isMaximized, setIsMaximized] = useState(false)
  const visible = useNavbarVisibilityStore((s) => s.visible)
  const toggleNavbar = useNavbarVisibilityStore((s) => s.toggle)
  const browserTabs = useBrowserStore((s) => s.tabs)
  const browserVisible = useBrowserStore((s) => s.visible)
  const toggleBrowser = useBrowserStore((s) => s.toggleVisible)
  const activeWorkspaceName = useAppStore((s) => {
    const active = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
    return active?.name
  })
  // Home view = Welcome focused, or no workspaces yet (matches App's showWelcome).
  const onHome = useAppStore((s) => s.welcomeFocused || s.workspaces.length === 0)
  const broadcastActive = useAppStore((s) => {
    const active = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
    return active?.broadcastActive ?? false
  })
  const toggleBroadcast = useAppStore((s) => s.toggleBroadcast)

  useEffect(() => {
    if (isMac) return // maximize icon swap only exists on the custom buttons
    let unlisten: (() => void) | undefined
    onMaximizedChanged(setIsMaximized).then((un) => (unlisten = un))
    return () => unlisten?.()
  }, [])

  return (
    <div
      data-tauri-drag-region
      className={cn(
        'flex h-9 shrink-0 items-center justify-between border-b border-border bg-card pl-1.5',
        isMac && 'pl-20'
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-tauri-drag-region="false"
          aria-label={visible ? `Hide sidebar (${navbarHint})` : `Show sidebar (${navbarHint})`}
          title={visible ? `Hide sidebar (${navbarHint})` : `Show sidebar (${navbarHint})`}
          onClick={toggleNavbar}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {visible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <SquareTerminal className="h-4 w-4" />
        <span className="text-xs font-semibold">Swarmterm</span>
      </div>

      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center justify-center px-2"
      >
        {onHome ? (
          <HeaderRecentSearch />
        ) : (
          activeWorkspaceName !== undefined && (
            <div className="inline-flex h-[22px] max-w-[40vw] items-center rounded border border-border bg-muted px-3 text-xs text-muted-foreground">
              <span className="truncate">{activeWorkspaceName}</span>
            </div>
          )
        )}
      </div>

      <div className="flex h-full items-center">
        {!onHome && (
          <button
            type="button"
            data-tauri-drag-region="false"
            aria-label={`Toggle broadcast input (${broadcastHint})`}
            aria-pressed={broadcastActive}
            title={`Broadcast input to selected terminals (${broadcastHint})`}
            onClick={toggleBroadcast}
            className={cn(
              'mr-1 flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground',
              broadcastActive ? 'text-broadcast' : 'text-muted-foreground'
            )}
          >
            <Radio className="h-4 w-4" />
          </button>
        )}
        {browserTabs.length > 0 && (
          <button
            type="button"
            data-tauri-drag-region="false"
            aria-label="Bật/tắt cột Browser"
            aria-pressed={browserVisible}
            title="Bật/tắt cột Browser"
            onClick={toggleBrowser}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground mr-1"
          >
            {browserVisible ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        )}
        {!isMac && (
          <>
            <TitleBarButton label="Minimize" onClick={() => minimize()}>
              <Minus className="h-4 w-4" />
            </TitleBarButton>
            <TitleBarButton
              label={isMaximized ? 'Restore' : 'Maximize'}
              onClick={() => toggleMaximize()}
            >
              {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </TitleBarButton>
            <TitleBarButton
              label="Close"
              onClick={() => closeWindow()}
              className="hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-4 w-4" />
            </TitleBarButton>
          </>
        )}
      </div>
    </div>
  )
}

interface TitleBarButtonProps {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}

/** A single window-control button: full-height, fixed width, hover-highlighted. */
function TitleBarButton({
  label,
  onClick,
  className,
  children
}: TitleBarButtonProps): ReactElement {
  return (
    <button
      type="button"
      data-tauri-drag-region="false"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}
