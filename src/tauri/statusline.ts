import { invoke } from '@tauri-apps/api/core'

/**
 * Install (or remove) Claude Code's `statusLine` entry in the user-scope
 * settings file. Rejects when the user already owns a custom status line — the
 * backend refuses to overwrite it, which is a legitimate configuration rather
 * than a failure worth surfacing.
 */
export const setClaudeStatusline = (enabled: boolean): Promise<void> =>
  invoke('set_claude_statusline', { enabled })
