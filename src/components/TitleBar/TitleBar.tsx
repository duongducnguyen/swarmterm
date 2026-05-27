import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import {
  Copy,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Square,
  SquareTerminal,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { useNavbarVisibilityStore } from '@/store/navbar-visibility-store'
import { minimize, toggleMaximize, closeWindow, onMaximizedChanged } from '@/tauri/window'

/**
 * Custom window title bar for the frameless window. Left cluster:
 * [sidebar toggle] [app icon] [app name]. Centre: a read-only pill showing the
 * active workspace's name. Right: minimize / maximize / close window controls.
 */
export function TitleBar(): ReactElement {
  const [isMaximized, setIsMaximized] = useState(false)
  const visible = useNavbarVisibilityStore((s) => s.visible)
  const toggleNavbar = useNavbarVisibilityStore((s) => s.toggle)
  const activeWorkspaceName = useAppStore((s) => {
    const active = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
    return active?.name
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    onMaximizedChanged(setIsMaximized).then((un) => (unlisten = un))
    return () => unlisten?.()
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card pl-1.5"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-tauri-drag-region="false"
          aria-label={visible ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
          title={visible ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
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
        {activeWorkspaceName !== undefined && (
          <div className="inline-flex h-[22px] max-w-[40vw] items-center rounded border border-border bg-muted px-3 text-xs text-muted-foreground">
            <span className="truncate">{activeWorkspaceName}</span>
          </div>
        )}
      </div>

      <div className="flex h-full">
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
