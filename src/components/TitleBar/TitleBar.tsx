import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Copy, Minus, Square, SquareTerminal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { minimize, toggleMaximize, closeWindow, onMaximizedChanged } from '@/tauri/window'

/**
 * Custom window title bar for the frameless window: app branding on the left,
 * a draggable region in the middle, and minimize / maximize / close controls.
 */
export function TitleBar(): ReactElement {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    onMaximizedChanged(setIsMaximized).then((un) => (unlisten = un))
    return () => unlisten?.()
  }, [])

  return (
    <div data-tauri-drag-region className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card pl-3">
      <div className="flex items-center gap-2">
        <SquareTerminal className="h-4 w-4" />
        <span className="text-xs font-semibold">Command Center</span>
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
