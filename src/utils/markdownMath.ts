// TeX in Markdown, typeset by KaTeX: $…$ inline, and $$…$$ for a display
// equation (on one line, or with the delimiters on lines of their own).
//
// The delimiters follow Pandoc's rules, so that prices and the like stay text:
// an opening $ is not followed by a space, a closing $ is not preceded by one
// nor followed by a digit ("it costs $5 and $10" has no math in it), and \$
// is a dollar sign. Inside `code` nothing is math.
//
// KaTeX runs with trust off (no \href, \url, \includegraphics or \html…
// commands) and never throws: TeX it cannot read is shown as it was written,
// marked as an error. What it makes is sanitised with the rest of the page
// (utils/markdown.ts).
import katex from 'katex'
import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it'

const DOLLAR = 0x24
const BACKSLASH = 0x5c

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a
}
function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39
}

/** Whether the $ at pos may open (followed by no space) or close (preceded by no space, followed by no digit) math. */
function delimiter(src: string, pos: number, max: number): { canOpen: boolean; canClose: boolean } {
  const prev = pos > 0 ? src.charCodeAt(pos - 1) : -1
  const next = pos + 1 < max ? src.charCodeAt(pos + 1) : -1
  return {
    canOpen: next !== -1 && !isSpace(next),
    canClose: prev !== -1 && !isSpace(prev) && !isDigit(next),
  }
}

// Where a search for a closing delimiter found none, from which point on:
// a later opening one will not find one either, so it is not searched for
// again (a text of many lone $ would otherwise take time in their square).
// A link's text is read with a nearer end, so the end is part of the key.
type Unclosed = Map<string, number>
const noInlineClose = new WeakMap<StateInline, Unclosed>()
const noBlockClose = new WeakMap<StateBlock, Unclosed>()

function unclosedFrom<S extends object>(memo: WeakMap<S, Unclosed>, state: S, key: string): number | undefined {
  return memo.get(state)?.get(key)
}
function markUnclosed<S extends object>(memo: WeakMap<S, Unclosed>, state: S, key: string, from: number) {
  if (!memo.has(state)) memo.set(state, new Map())
  memo.get(state)!.set(key, from)
}

/** Whether the character at pos is escaped: preceded by an odd run of backslashes after `from`. */
function escaped(src: string, pos: number, from: number): boolean {
  let slashes = 0
  for (let i = pos - 1; i > from && src.charCodeAt(i) === BACKSLASH; i--) slashes++
  return slashes % 2 === 1
}

/** $…$, or $$…$$ inside a paragraph (typeset as a display, on its own line). */
function mathInline(state: StateInline, silent: boolean): boolean {
  const { src, posMax } = state
  const start = state.pos
  if (src.charCodeAt(start) !== DOLLAR) return false
  const display = src.charCodeAt(start + 1) === DOLLAR
  const key = `${display ? 2 : 1}:${posMax}`
  const none = unclosedFrom(noInlineClose, state, key)
  const literal = () => {
    // Not math: the dollar sign(s) as text.
    if (!silent) state.pending += display ? '$$' : '$'
    state.pos = start + (display ? 2 : 1)
    return true
  }
  if (!display && !delimiter(src, start, posMax).canOpen) return false
  if (none !== undefined && start > none) return literal()
  const open = start + (display ? 2 : 1)
  let end = open
  for (;;) {
    end = src.indexOf(display ? '$$' : '$', end)
    if (end === -1 || end >= posMax) {
      markUnclosed(noInlineClose, state, key, start)
      return literal()
    }
    if (!escaped(src, end, start) && (display || delimiter(src, end, posMax).canClose)) break
    end++
  }
  const content = src.slice(open, end)
  if (!content.trim()) return literal()
  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.markup = display ? '$$' : '$'
    token.content = content
    token.meta = { display }
  }
  state.pos = end + (display ? 2 : 1)
  return true
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  // Four spaces in, it is an indented code block.
  if (state.sCount[startLine] - state.blkIndent >= 4) return false
  let pos = state.bMarks[startLine] + state.tShift[startLine]
  let max = state.eMarks[startLine]
  if (pos + 2 > max || state.src.slice(pos, pos + 2) !== '$$') return false
  pos += 2
  const first = state.src.slice(pos, max).trim()

  let body: string
  let line = startLine
  if (first.length >= 2 && first.endsWith('$$')) {
    // $$ … $$ on one line.
    body = first.slice(0, -2)
  } else {
    // Up to the line that ends in $$; with none, this is no math block.
    const where = `${endLine}:${state.blkIndent}`
    const none = unclosedFrom(noBlockClose, state, where)
    if (none !== undefined && startLine > none) return false
    const lines: string[] = first ? [first] : []
    let closed = false
    while (++line < endLine) {
      pos = state.bMarks[line] + state.tShift[line]
      max = state.eMarks[line]
      // A line less indented than the block (out of a list item, say) ends it.
      if (pos < max && state.sCount[line] < state.blkIndent) break
      const text = state.src.slice(pos, max)
      if (text.trimEnd().endsWith('$$')) {
        lines.push(text.trimEnd().slice(0, -2))
        closed = true
        break
      }
      lines.push(text)
    }
    if (!closed) {
      markUnclosed(noBlockClose, state, where, startLine)
      return false
    }
    body = lines.join('\n')
  }
  if (!body.trim()) return false
  if (silent) return true
  state.line = line + 1
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = body
  token.markup = '$$'
  token.map = [startLine, state.line]
  return true
}

/** The TeX typeset, or, where KaTeX fails in a way it does not report itself, the TeX as text. */
export function typeset(tex: string, displayMode: boolean, escape: (s: string) => string): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      output: 'htmlAndMathml',
      // Bounds on what one formula may make, so that a text cannot hang the page.
      maxSize: 50,
      maxExpand: 500,
      // TeX it cannot read, in the page's own colour for errors (light or dark).
      errorColor: 'var(--el-color-danger)',
    })
  } catch {
    return `<code class="md-math-error">${escape(tex)}</code>`
  }
}

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline)
  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
  md.renderer.rules.math_inline = (tokens, idx) =>
    typeset(tokens[idx].content, !!tokens[idx].meta?.display, md.utils.escapeHtml)
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="md-math">${typeset(tokens[idx].content, true, md.utils.escapeHtml)}</div>\n`
}
