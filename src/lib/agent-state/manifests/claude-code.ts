/**
 * Detection rules for claude-code, ported to TypeScript from herdr's
 * src/detect/manifests/claude.toml (manifest version 2026.08.13.1).
 * herdr is licensed under the Apache License 2.0; this derived file is
 * modified from the original. See THIRD-PARTY-NOTICES.md at the repo root.
 *
 * Regex translation from Rust `regex` syntax: `\x{2733}` → `\u{2733}` with
 * the `u` flag; inline `(?i)`/`(?m)` → RegExp flags; `\A` → `^` (no `m`).
 * NEVER add the `g` flag — RegExp.test with `g` is stateful.
 */
import type { Manifest } from '@/lib/agent-state/types'

export const claudeCodeManifest: Manifest = {
  id: 'claude-code',
  herdrVersion: '2026.08.13.1',
  rules: [
    {
      id: 'osc_title_working',
      state: 'working',
      priority: 1100,
      region: 'osc_title',
      visibleWorking: true,
      // Braille covers Claude Code ≤ 2.1.227; half-circles are the 2.1.228 busy spinner.
      regex: [/^[\u{2800}-\u{28FF}\u{25D0}-\u{25D3}] /u]
    },
    {
      id: 'btw_overlay_working',
      state: 'working',
      priority: 975,
      region: { bottomNonEmptyLines: 5 },
      visibleWorking: true,
      lineRegex: [/^\s*\/btw(?:\s|$)/, /esc to close\s*$/i]
    },
    {
      id: 'transcript_viewer',
      state: 'unknown',
      priority: 1000,
      region: { bottomNonEmptyLines: 3 },
      skipStateUpdate: true,
      contains: ['showing detailed transcript'],
      any: [
        { contains: ['ctrl+o', 'to toggle'] },
        { contains: ['ctrl+e', 'show all'] },
        { contains: ['ctrl+e', 'collapse'] },
        { contains: ['↑↓ scroll'] },
        { contains: ['? for shortcuts'] }
      ]
    },
    {
      id: 'live_blocked_form',
      state: 'blocked',
      priority: 980,
      region: 'after_last_horizontal_rule',
      visibleBlocker: true,
      contains: ['esc to cancel'],
      any: [
        { contains: ['enter to confirm'] },
        {
          contains: ['enter to select'],
          any: [
            { contains: ['tab/arrow keys to navigate'] },
            { contains: ['arrow keys to navigate'] },
            { contains: ['arrows to navigate'] },
            { contains: ['↑/↓ to navigate'] },
            { contains: ['↑↓ to navigate'] }
          ]
        }
      ]
    },
    {
      id: 'dynamic_workflow_prompt',
      state: 'blocked',
      priority: 980,
      region: 'whole_recent',
      visibleBlocker: true,
      contains: ['run a dynamic workflow?', 'esc to cancel']
    },
    {
      id: 'live_prompt_box',
      state: 'idle',
      priority: 950,
      region: 'prompt_box_body',
      visibleIdle: true,
      lineRegex: [/^\s*❯/],
      not: [
        { contains: ['enter to select'] },
        { contains: ['esc to cancel'] },
        { contains: ['tab/arrow keys'] },
        { contains: ['arrow keys to navigate'] },
        { contains: ['↑/↓ to navigate'] }
      ]
    },
    {
      id: 'model_picker_menu',
      state: 'unknown',
      priority: 900,
      region: 'whole_recent',
      skipStateUpdate: true,
      contains: ['select model', 'enter to set as default', 'esc to cancel'],
      not: [{ contains: ['do you want to proceed?'] }, { contains: ['enter to select'] }]
    },
    {
      id: 'bash_permission_prompt',
      state: 'blocked',
      priority: 850,
      region: 'whole_recent',
      visibleBlocker: true,
      contains: ['do you want to proceed?'],
      any: [
        { contains: ['bash command'] },
        { contains: ['bash('] },
        { contains: ['contains expansion'] },
        { contains: ['tab to amend'] },
        { contains: ['ctrl+e to explain'] }
      ],
      all: [
        {
          any: [
            { lineRegex: [/^\s*❯?\s*yes\b/i] },
            { lineRegex: [/^\s*1\.\s*yes\b/i] },
            { lineRegex: [/^\s*2\.\s*no\b/i] }
          ]
        }
      ]
    },
    {
      id: 'generic_permission_prompt',
      state: 'blocked',
      priority: 840,
      region: 'after_last_horizontal_rule',
      visibleBlocker: true,
      contains: ['do you want to proceed?', 'esc to cancel'],
      all: [
        {
          any: [
            { lineRegex: [/^\s*❯?\s*1\.\s*yes\b/i] },
            { lineRegex: [/^\s*2\.\s*yes\b/i] },
            { lineRegex: [/^\s*2\.\s*no\b/i] },
            { lineRegex: [/^\s*3\.\s*no\b/i] }
          ]
        }
      ]
    },
    {
      id: 'legacy_no_prompt_blocker',
      state: 'blocked',
      priority: 300,
      region: 'whole_recent',
      any: [
        { contains: ['do you want to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] },
        { contains: ['would you like to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] },
        { contains: ['waiting for permission'] },
        { contains: ['do you want to allow this connection?'] },
        { contains: ['tab to amend'] },
        { contains: ['ctrl+e to explain'] },
        { contains: ['do you want to proceed?', 'esc to cancel'] },
        { contains: ['review your answers'] },
        { contains: ['skip interview and plan immediately'] }
      ],
      not: [{ regex: [/^\s*❯\s*$/m] }]
    },
    {
      id: 'osc_title_idle',
      state: 'idle',
      priority: 250,
      region: 'osc_title',
      visibleIdle: true,
      regex: [/^\u{2733} /u]
    },
    {
      id: 'osc_progress_idle',
      state: 'idle',
      priority: 250,
      region: 'osc_progress',
      regex: [/^4;0/]
    }
  ]
}
