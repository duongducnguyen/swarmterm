import type { ReactElement } from 'react'
import { X } from 'lucide-react'
import { useBrowserStore, type WebTab } from '@/store/browser-store'
import { cn } from '@/lib/utils'

/** Short label for a tab: host:port of its url, falling back to the raw url. */
function tabLabel(tab: WebTab, terminalIndex: number): string {
  let host = tab.url
  try {
    host = new URL(tab.url).host
  } catch {
    /* keep raw url */
  }
  return `${host} ·T${terminalIndex + 1}`
}

interface TabStripProps {
  terminalIndexOf: (terminalId: string) => number
}

export function TabStrip({ terminalIndexOf }: TabStripProps): ReactElement {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const setActiveTab = useBrowserStore((s) => s.setActiveTab)
  const closeTab = useBrowserStore((s) => s.closeTab)

  return (
    <div className="flex items-end gap-0.5 overflow-x-auto bg-muted/40 px-1 pt-1">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTabId}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            'flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-t px-2 py-1 text-xs',
            tab.id === activeTabId ? 'bg-background text-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          <span>{tabLabel(tab, terminalIndexOf(tab.terminalId))}</span>
          <button
            type="button"
            aria-label="Đóng tab"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            className="rounded p-0.5 hover:bg-foreground/10"
          >
            <X aria-hidden className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
