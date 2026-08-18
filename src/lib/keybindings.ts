export interface Shortcut {
  description: string
  /** Each element is one keycap token: 'Ctrl', 'Shift', 'B', '+ Click', etc. */
  keys: string[]
}

export interface KeybindingGroup {
  id: string
  label: string
  entries: Shortcut[]
}

/** Window-level app shortcuts App.tsx listens for. */
export type AppShortcutAction = 'toggle-navbar' | 'toggle-broadcast' | 'find-in-terminal'

/** The subset of a KeyboardEvent the matcher needs, kept pure for unit tests. */
export interface ShortcutKeyEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Match the window-level app shortcuts. macOS uses Cmd (meta) per platform
 * convention — which also leaves Ctrl+B free for the terminal (tmux prefix);
 * other platforms use Ctrl. The opposite modifier and Alt must be off so
 * mixed combos fall through to the terminal untouched.
 */
export function matchAppShortcut(
  event: ShortcutKeyEvent,
  isMac: boolean
): AppShortcutAction | null {
  const modifier = isMac ? event.metaKey : event.ctrlKey
  const opposite = isMac ? event.ctrlKey : event.metaKey
  if (!modifier || opposite || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'b') return event.shiftKey ? 'toggle-broadcast' : 'toggle-navbar'
  // No shifted variant exists for find, so Shift+F falls through untouched
  // (returns null) rather than claiming a binding nothing implements.
  if (key === 'f' && !event.shiftKey) return 'find-in-terminal'
  return null
}

// If you change a binding in App.tsx, update this list to match.
export function getShortcutGroups(isMac: boolean): KeybindingGroup[] {
  const mod = isMac ? '⌘' : 'Ctrl'
  const alt = isMac ? '⌥' : 'Alt'
  return [
    {
      id: 'broadcast',
      label: 'Broadcast',
      entries: [
        { description: 'Toggle broadcast mode',      keys: [mod, 'Shift', 'B'] },
        { description: 'Exit broadcast mode',        keys: ['Esc'] },
        { description: 'Add/remove pane from group', keys: [alt, '+ Click'] },
      ],
    },
    {
      id: 'window',
      label: 'Window',
      entries: [
        { description: 'Toggle sidebar',   keys: [mod, 'B'] },
        { description: 'Find in terminal', keys: [mod, 'F'] },
        { description: 'Close find',       keys: ['Esc'] },
        { description: 'Close Settings',   keys: ['Esc'] },
      ],
    },
  ]
}
