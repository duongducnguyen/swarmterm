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

// If you change a binding in App.tsx, update this list to match.
export const SHORTCUT_GROUPS = [
  {
    id: 'broadcast',
    label: 'Broadcast',
    entries: [
      { description: 'Toggle broadcast mode',      keys: ['Ctrl', 'Shift', 'B'] },
      { description: 'Exit broadcast mode',        keys: ['Esc'] },
      { description: 'Add/remove pane from group', keys: ['Alt', '+ Click'] },
    ],
  },
  {
    id: 'window',
    label: 'Window',
    entries: [
      { description: 'Toggle sidebar',              keys: ['Ctrl', 'B'] },
      { description: 'Close Settings',              keys: ['Esc'] },
      { description: 'Exit web preview fullscreen', keys: ['Esc'] },
    ],
  },
] as const satisfies readonly KeybindingGroup[]
