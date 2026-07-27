import { describe, expect, it } from 'vitest'
import { tokenizeMarkdown } from './war-room-markdown'

describe('tokenizeMarkdown', () => {
  it('passes plain text through as one token', () => {
    expect(tokenizeMarkdown('hello world')).toEqual([{ t: 'text', v: 'hello world' }])
  })

  it('extracts bold and inline code', () => {
    expect(tokenizeMarkdown('the **API contract** uses `created_at` now')).toEqual([
      { t: 'text', v: 'the ' },
      { t: 'bold', v: 'API contract' },
      { t: 'text', v: ' uses ' },
      { t: 'code', v: 'created_at' },
      { t: 'text', v: ' now' }
    ])
  })

  it('extracts fenced blocks and strips the language tag line', () => {
    expect(tokenizeMarkdown('before\n```ts\nconst x = 1\n```\nafter')).toEqual([
      { t: 'text', v: 'before\n' },
      { t: 'codeblock', v: 'const x = 1\n' },
      { t: 'text', v: '\nafter' }
    ])
  })

  it('never inline-parses inside a fenced block', () => {
    const [block] = tokenizeMarkdown('```\n**not bold** `not code`\n```')
    expect(block).toEqual({ t: 'codeblock', v: '**not bold** `not code`\n' })
  })

  it('treats an unterminated fence as a block', () => {
    expect(tokenizeMarkdown('x ```py\ncut off')).toEqual([
      { t: 'text', v: 'x ' },
      { t: 'codeblock', v: 'cut off' }
    ])
  })

  it('returns nothing for empty input', () => {
    expect(tokenizeMarkdown('')).toEqual([])
  })
})
