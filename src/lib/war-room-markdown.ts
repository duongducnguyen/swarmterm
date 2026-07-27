/**
 * Minimal markdown tokenizer for War Room chat bodies. Agents write
 * markdown-flavored prose (bold, inline code, fenced blocks); rendering the
 * raw asterisks reads as noise. A full markdown pipeline (react-markdown +
 * remark) is overkill for chat snippets, so this covers exactly the three
 * constructs agents actually emit and leaves everything else as literal text.
 */

export type MarkdownToken =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'code'; v: string }
  | { t: 'codeblock'; v: string }

const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`/g

function pushInline(segment: string, out: MarkdownToken[]): void {
  let last = 0
  INLINE.lastIndex = 0
  for (let m = INLINE.exec(segment); m !== null; m = INLINE.exec(segment)) {
    if (m.index > last) out.push({ t: 'text', v: segment.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'bold', v: m[1] })
    else out.push({ t: 'code', v: m[2] })
    last = m.index + m[0].length
  }
  if (last < segment.length) out.push({ t: 'text', v: segment.slice(last) })
}

export function tokenizeMarkdown(text: string): MarkdownToken[] {
  const out: MarkdownToken[] = []
  // Fenced blocks first — their contents must never be inline-parsed. An
  // unterminated fence still renders as a block (agents get cut off mid-fence).
  const segments = text.split('```')
  segments.forEach((segment, i) => {
    if (i % 2 === 1) {
      // Drop a leading language tag line ("ts\n...") — chat has no highlighting.
      out.push({ t: 'codeblock', v: segment.replace(/^[\w-]*\n/, '') })
    } else if (segment !== '') {
      pushInline(segment, out)
    }
  })
  return out
}
