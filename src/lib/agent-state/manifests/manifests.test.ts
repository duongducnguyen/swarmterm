import { describe, expect, it } from 'vitest'
import { evaluateManifest } from '@/lib/agent-state/engine'
import { claudeCodeManifest } from '@/lib/agent-state/manifests/claude-code'
import { codexManifest } from '@/lib/agent-state/manifests/codex'
import { opencodeManifest } from '@/lib/agent-state/manifests/opencode'
import { manifestForAgent } from '@/lib/agent-state/manifests'

const input = (screen: string, oscTitle = '', oscProgress = ''): Parameters<typeof evaluateManifest>[1] => ({
  screen,
  oscTitle,
  oscProgress
})

describe('manifestForAgent', () => {
  it('maps agent template ids and refuses plain terminals', () => {
    expect(manifestForAgent('claude-code')?.id).toBe('claude-code')
    expect(manifestForAgent('codex')?.id).toBe('codex')
    expect(manifestForAgent('opencode')?.id).toBe('opencode')
    expect(manifestForAgent('terminal')).toBeUndefined()
    expect(manifestForAgent(undefined)).toBeUndefined()
  })
})

describe('claude-code manifest', () => {
  it('braille or half-circle spinner in the OSC title means working', () => {
    expect(evaluateManifest(claudeCodeManifest, input('anything', '⠹ Reticulating…')).state).toBe('working')
    expect(evaluateManifest(claudeCodeManifest, input('anything', '◐ Thinking…')).state).toBe('working')
  })
  it('✳ in the OSC title means idle', () => {
    const v = evaluateManifest(claudeCodeManifest, input('anything', '✳ Ready'))
    expect(v.state).toBe('idle')
    expect(v.visibleIdle).toBe(true)
  })
  it('a bash permission prompt is blocked', () => {
    const screen = [
      'Bash command',
      '',
      '  rm -rf node_modules',
      '',
      'Do you want to proceed?',
      '❯ 1. Yes',
      '  2. No, and tell Claude what to do differently (esc)'
    ].join('\n')
    const v = evaluateManifest(claudeCodeManifest, input(screen))
    expect(v.state).toBe('blocked')
    expect(v.visibleBlocker).toBe(true)
  })
  it('a confirm form after the last rule is blocked', () => {
    const screen = ['───', 'Create file src/foo.ts?', '', 'enter to confirm · esc to cancel'].join('\n')
    expect(evaluateManifest(claudeCodeManifest, input(screen)).state).toBe('blocked')
  })
  it('the ❯ prompt box is PROVEN idle; a menu open inside it only falls back to idle', () => {
    const idleScreen = ['some output', '───', ' ❯ ', '───'].join('\n')
    const idle = evaluateManifest(claudeCodeManifest, input(idleScreen))
    expect(idle.state).toBe('idle')
    expect(idle.visibleIdle).toBe(true)
    // A menu inside the box trips the rule's not-gates, so nothing matches and
    // the verdict is the idle FALLBACK (visibleIdle=false) — herdr semantics:
    // the debounce treats proven idle and fallback idle differently.
    const menu = evaluateManifest(claudeCodeManifest, input(menuScreen()))
    expect(menu.visibleIdle).toBe(false)

    function menuScreen(): string {
      return ['some output', '───', ' ❯ pick one — enter to select · tab/arrow keys to navigate', '───'].join('\n')
    }
  })
  it('the transcript viewer freezes state (skip)', () => {
    const screen = ['big transcript', 'Showing detailed transcript', 'ctrl+o to toggle · ↑↓ scroll'].join('\n')
    expect(evaluateManifest(claudeCodeManifest, input(screen)).skip).toBe(true)
  })
  it('OSC 9 progress cleared (4;0) reads idle', () => {
    expect(evaluateManifest(claudeCodeManifest, input('anything', '', '4;0')).state).toBe('idle')
  })
})

describe('codex manifest', () => {
  it('"Action Required" title beats the working spinner title', () => {
    const v = evaluateManifest(codexManifest, input('screen', '⠙ Action Required'))
    expect(v.state).toBe('blocked')
  })
  it('braille spinner title means working', () => {
    expect(evaluateManifest(codexManifest, input('screen', '⠙ codex')).state).toBe('working')
  })
  it('a non-spinner title means idle', () => {
    const v = evaluateManifest(codexManifest, input('screen', 'codex — ready'))
    expect(v.state).toBe('idle')
    expect(v.visibleIdle).toBe(true)
  })
  it('the trust-directory prompt is blocked', () => {
    const screen = ['> You are in /work/repo', '', 'Do you trust the contents of this directory?'].join('\n')
    expect(evaluateManifest(codexManifest, input(screen)).state).toBe('blocked')
  })
  it('a strong blocker after the › prompt marker is blocked', () => {
    const screen = ['done stuff', '› ', 'Allow command? Press enter to confirm or esc to cancel'].join('\n')
    expect(evaluateManifest(codexManifest, input(screen)).state).toBe('blocked')
  })
  it('the • Working footer means working', () => {
    const screen = ['output', '• Working (3s · esc to interrupt)'].join('\n')
    expect(evaluateManifest(codexManifest, input(screen)).state).toBe('working')
  })
  it('the transcript viewer freezes state', () => {
    const screen = ['history', '› ', '↑/↓ to scroll · pgup/pgdn to page · home/end to jump · q to quit · esc to edit prev'].join('\n')
    expect(evaluateManifest(codexManifest, input(screen)).skip).toBe(true)
  })
})

describe('opencode manifest', () => {
  it('△ Permission required is blocked', () => {
    const v = evaluateManifest(opencodeManifest, input('stuff\n△ Permission required'))
    expect(v.state).toBe('blocked')
    expect(v.visibleBlocker).toBe(true)
  })
  it('the dialog footer variant is blocked', () => {
    const screen = 'question\n↑↓ select · enter confirm · esc dismiss'
    expect(evaluateManifest(opencodeManifest, input(screen)).state).toBe('blocked')
  })
  it('esc-to-interrupt hint means working', () => {
    expect(evaluateManifest(opencodeManifest, input('thinking… esc to interrupt')).state).toBe('working')
  })
  it('a progress bar run means working', () => {
    expect(evaluateManifest(opencodeManifest, input('■■■■■□□')).state).toBe('working')
  })
  it('a quiet screen falls back to idle', () => {
    expect(evaluateManifest(opencodeManifest, input('$ ready')).state).toBe('idle')
  })
})
