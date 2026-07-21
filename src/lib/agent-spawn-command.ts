/**
 * Builds the one-line command a worker pane runs at spawn: the agent CLI plus
 * the task brief as a single quoted argument. Quoting is per shell family
 * because the line is typed into the pane's shell (initialCommand), not
 * exec'd directly — PowerShell, POSIX and cmd disagree on quote rules.
 */
import type { ShellId } from '@/lib/terminal-pref'

export type ShellFlavor = 'posix' | 'powershell' | 'cmd'

export function shellFlavor(shellId: ShellId | undefined, windows: boolean): ShellFlavor {
  switch (shellId) {
    case 'git-bash':
    case 'wsl':
    case 'zsh':
    case 'bash':
    case 'fish':
      return 'posix'
    case 'powershell':
    case 'pwsh':
      return 'powershell'
    case 'cmd':
      return 'cmd'
    default:
      // 'default' and undefined follow the platform default shell
      // (pty.rs::default_shell): PowerShell on Windows, $SHELL elsewhere.
      return windows ? 'powershell' : 'posix'
  }
}

export function quoteForShell(text: string, flavor: ShellFlavor): string {
  switch (flavor) {
    case 'posix':
      return `'${text.replace(/'/g, `'\\''`)}'`
    case 'powershell':
      // Single quotes are fully literal in PowerShell; '' is the only escape.
      return `'${text.replace(/'/g, `''`)}'`
    case 'cmd':
      // cmd has no sane inner-quote escape; downgrading to ' keeps the line
      // intact at the cost of fidelity — acceptable for a task brief.
      return `"${text.replace(/"/g, `'`)}"`
  }
}

export function buildAgentSpawnCommand(
  baseCommand: string,
  prompt: string | undefined,
  flavor: ShellFlavor
): string {
  // The pty writes initialCommand as a single line + CR; embedded newlines
  // would submit the command early, so collapse them to spaces.
  const singleLine = (prompt ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim()
  if (singleLine === '') return baseCommand
  return `${baseCommand} ${quoteForShell(singleLine, flavor)}`
}
