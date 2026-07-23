/**
 * What actually happens when a terminal link is followed. Side effects arrive as
 * injected deps rather than direct `@/tauri/links` imports, so the branching —
 * which editor, what happens when there is none, what happens when the launch
 * fails — is unit-testable without a Tauri runtime.
 */
import { buildEditorCommand, EDITOR_PRIORITY, type EditorId } from '@/lib/editor-command'
import { parseFileUrl } from '@/lib/file-url'
import type { LinkKind } from '@/lib/terminal-links'

export interface LinkActionDeps {
  findAvailableEditor: (candidates: readonly string[]) => Promise<string | null>
  openInEditor: (bin: string, args: string[]) => Promise<void>
  revealInFileManager: (path: string) => Promise<void>
}

/**
 * Sort an OSC 8 hyperlink target into one of the two kinds we act on. xterm only
 * hands us non-http schemes when `linkHandler.allowNonHttpProtocols` is set, so
 * this is where that permission is paid for: everything except http(s) and file
 * is refused, and `file:` is reduced to a plain path before it can reach an
 * opener.
 */
export function classifyOscLink(text: string): { kind: LinkKind; target: string } | null {
  if (/^https?:\/\//i.test(text)) return { kind: 'url', target: text }
  const path = parseFileUrl(text)
  return path === null ? null : { kind: 'path', target: path }
}

function isEditorId(value: string): value is EditorId {
  return (EDITOR_PRIORITY as readonly string[]).includes(value)
}

/**
 * Open a resolved file at a location. Falls back to revealing it in the file
 * manager whenever the editor route is unavailable or fails — never to the OS
 * default application, which is what would make a misclick on a script execute
 * it.
 */
export async function openPathLocation(
  deps: LinkActionDeps,
  resolved: string,
  line?: number,
  col?: number
): Promise<void> {
  const found = await deps.findAvailableEditor(EDITOR_PRIORITY)
  if (found !== null && isEditorId(found)) {
    const { bin, args } = buildEditorCommand(found, resolved, line, col)
    try {
      await deps.openInEditor(bin, args)
      return
    } catch {
      // Editor found on PATH but refused to start — fall through to reveal.
    }
  }
  await deps.revealInFileManager(resolved)
}
