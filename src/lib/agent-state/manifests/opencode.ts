/**
 * Detection rules for opencode, ported to TypeScript from herdr's
 * src/detect/manifests/opencode.toml (manifest version 2026.06.10.1).
 * herdr is licensed under the Apache License 2.0; this derived file is
 * modified from the original. See THIRD-PARTY-NOTICES.md at the repo root.
 *
 * Regex translation from Rust `regex` syntax: `\x{2733}` → `\u{2733}` with
 * the `u` flag; inline `(?i)`/`(?m)` → RegExp flags; `\A` → `^` (no `m`).
 * NEVER add the `g` flag — RegExp.test with `g` is stateful.
 */
import type { Manifest } from '@/lib/agent-state/types'

export const opencodeManifest: Manifest = {
  id: 'opencode',
  herdrVersion: '2026.06.10.1',
  rules: [
    {
      id: 'permission_required',
      state: 'blocked',
      priority: 300,
      region: 'whole_recent',
      visibleBlocker: true,
      any: [
        { contains: ['△ Permission required'] },
        {
          contains: ['esc dismiss'],
          any: [{ contains: ['enter confirm'] }, { contains: ['enter submit'] }, { contains: ['enter toggle'] }],
          all: [{ any: [{ contains: ['↑↓ select'] }, { contains: ['⇆ tab'] }] }]
        }
      ]
    },
    {
      id: 'interrupt_hint_working',
      state: 'working',
      priority: 110,
      region: 'whole_recent',
      visibleWorking: true,
      any: [
        { contains: ['esc to interrupt'] },
        { contains: ['ctrl+c to interrupt'] },
        { contains: ['press esc to interrupt'] },
        { lineRegex: [/.*opencode.*esc (again to )?interrupt/i] }
      ]
    },
    {
      id: 'progress_bar_working',
      state: 'working',
      priority: 100,
      region: 'whole_recent',
      visibleWorking: true,
      regex: [/(■|⬝){4,}/]
    }
  ]
}
