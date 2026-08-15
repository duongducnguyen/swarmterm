/**
 * Detection rules for codex, ported to TypeScript from herdr's
 * src/detect/manifests/codex.toml (manifest version 2026.08.09.1).
 * herdr is licensed under the Apache License 2.0; this derived file is
 * modified from the original. See THIRD-PARTY-NOTICES.md at the repo root.
 *
 * Regex translation from Rust `regex` syntax: `\x{2733}` → `\u{2733}` with
 * the `u` flag; inline `(?i)`/`(?m)` → RegExp flags; `\A` → `^` (no `m`).
 * NEVER add the `g` flag — RegExp.test with `g` is stateful.
 */
import type { Manifest } from '@/lib/agent-state/types'

const CODEX_SPINNER = /(?:^| )[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?: |$)/

export const codexManifest: Manifest = {
  id: 'codex',
  herdrVersion: '2026.08.09.1',
  rules: [
    {
      id: 'osc_title_blocked',
      state: 'blocked',
      priority: 1100,
      region: 'osc_title',
      visibleBlocker: true,
      contains: ['Action Required']
    },
    {
      id: 'osc_title_working',
      state: 'working',
      priority: 1050,
      region: 'osc_title',
      visibleWorking: true,
      regex: [CODEX_SPINNER]
    },
    {
      id: 'transcript_viewer',
      state: 'unknown',
      priority: 1000,
      region: 'after_last_prompt_marker',
      skipStateUpdate: true,
      contains: ['↑/↓ to scroll', 'pgup/pgdn to', 'home/end to jump', 'q to quit'],
      any: [{ contains: ['esc to edit prev'] }, { contains: ['esc/← to edit prev'] }]
    },
    {
      id: 'trust_directory',
      state: 'blocked',
      priority: 950,
      region: { topNonEmptyLines: 20 },
      visibleBlocker: true,
      all: [
        { regex: [/^> You are in [^\r\n]+(?:\r?\n|$)/] },
        { regex: [/Do\s+you\s+trust\s+the\s+contents\s+of\s+this\s+directory\?/] }
      ]
    },
    {
      id: 'live_strong_blocker',
      state: 'blocked',
      priority: 900,
      region: 'after_last_prompt_marker',
      visibleBlocker: true,
      any: [
        { contains: ['press enter to confirm or esc to cancel'] },
        { contains: ['enter to submit answer'] },
        { contains: ['enter to submit all'] },
        { contains: ['allow command?'] }
      ]
    },
    {
      id: 'weak_blocker',
      state: 'blocked',
      priority: 600,
      region: 'whole_recent',
      any: [
        { contains: ['[y/n]'] },
        { contains: ['yes (y)'] },
        { contains: ['do you want to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] },
        { contains: ['would you like to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] }
      ]
    },
    {
      id: 'screen_working_fallback',
      state: 'working',
      priority: 500,
      region: { bottomNonEmptyLines: 3 },
      visibleWorking: true,
      lineRegex: [/^[•◦]\s+Working \([^)]*esc to interrupt\)(?: · .*)?$/],
      not: [{ contains: ['■ Conversation interrupted'] }]
    },
    {
      id: 'osc_title_idle',
      state: 'idle',
      priority: 100,
      region: 'osc_title',
      visibleIdle: true,
      regex: [/\S/],
      not: [{ regex: [CODEX_SPINNER] }, { contains: ['Action Required'] }]
    }
  ]
}
