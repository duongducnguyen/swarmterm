import { type ReactElement } from 'react'
import { SHORTCUT_GROUPS } from '@/lib/keybindings'

export function KeyboardShortcutsPanel(): ReactElement {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Keyboard Shortcuts
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Default keybindings for Swarmterm. Shortcuts cannot be rebound yet.
        </p>
      </section>

      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.id}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            {group.label}
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-1.5 pr-8 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Action
                </th>
                <th className="pb-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Keybinding
                </th>
              </tr>
            </thead>
            <tbody>
              {group.entries.map((entry) => (
                <tr
                  key={entry.description}
                  className="border-b border-border/50 transition-colors hover:bg-accent/30"
                >
                  <td className="py-2 pr-8 text-foreground/90">{entry.description}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-1">
                      {entry.keys.map((token, i) => (
                        token.startsWith('+')
                          ? <span key={i} className="text-xs text-muted-foreground">{token}</span>
                          : <kbd
                              key={i}
                              className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground shadow-[0_1px_0_0_hsl(var(--border))]"
                            >
                              {token}
                            </kbd>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
