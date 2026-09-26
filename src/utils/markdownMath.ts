// TeX in Markdown, typeset by KaTeX: $…$ inline, and $$…$$ for a display
// equation (on one line, or with the delimiters on lines of their own).
//
// The delimiters follow Pandoc's rules, so that prices and the like stay text:
// an opening $ is not followed by a space, a closing $ is not preceded by one
// nor followed by a digit ("it costs $5 and $10" has no math in it), the first
// $ after an opening one closes it or the opening one is text, and \$ is a
// dollar sign. A display ($$ on lines of its own) does not span a blank line
// or a code fence. Inside `code` nothing is math, and a closing $ past a
// backtick is not taken ("$HOME and `$PATH`").
//
// KaTeX runs with trust off (no \href, \url, \includegraphics or \html…
// commands) and never throws: TeX it cannot read is shown as it was written,
// marked as an error. What it makes is sanitised with the rest of the page
// (utils/markdown.ts).
import katex from 'katex'
import type { Env, MarkdownIt, StateBlock, StateInline } from 'markdown-it'

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
// For a display: the lines an opener's search covered without a close (it
// stops at a blank line, a fence or a line out of the block). An opener
// strictly inside that span would search the same lines to the same stop.
const noBlockClose = new WeakMap<StateBlock, Map<string, { from: number; to: number }>>()

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
  // The first unescaped delimiter after the opening one closes it, or the
  // opening one is text (as in Pandoc: in "$5 and $10, where $x$", the $ before
  // 10 cannot close, so $5 opens nothing and $x$ is the math).
  let end = open
  for (;;) {
    end = src.indexOf(display ? '$$' : '$', end)
    if (end === -1 || end >= posMax) {
      markUnclosed(noInlineClose, state, key, start)
      return literal()
    }
    if (!escaped(src, end, start)) break
    end++
  }
  if (!display && !delimiter(src, end, posMax).canClose) return literal()
  const content = src.slice(open, end)
  // A backtick in between may open a code span that holds the closer ("$HOME
  // and `$PATH`"): code spans come first, and TeX has little use for backticks.
  // As the search stopped at the first delimiter, no other opening one lies in
  // between, so this refusal is not met again.
  if (!content.trim() || content.includes('`')) return literal()
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
  // "$$a$$ and $$b$$", "$$a$$ and so on": displays within a paragraph, for the inline rule.
  if ((first.endsWith('$$') ? first.slice(0, -2) : first).includes('$$')) return false

  let body: string
  let line = startLine
  if (first.length >= 2 && first.endsWith('$$')) {
    // $$ … $$ on one line.
    body = first.slice(0, -2)
  } else {
    // Up to the line that ends in $$; with none, this is no math block.
    const where = `${endLine}:${state.blkIndent}`
    const none = noBlockClose.get(state)?.get(where)
    if (none && none.from < startLine && startLine < none.to) return false
    const lines: string[] = first ? [first] : []
    let closed = false
    while (++line < endLine) {
      // As in Pandoc, a display does not span a blank line, nor a code fence.
      if (state.isEmpty(line)) break
      pos = state.bMarks[line] + state.tShift[line]
      max = state.eMarks[line]
      // A line less indented than the block (out of a list item, say) ends it.
      if (state.sCount[line] < state.blkIndent) break
      const text = state.src.slice(pos, max)
      if (/^(```|~~~)/.test(text)) break
      if (text.trimEnd().endsWith('$$')) {
        lines.push(text.trimEnd().slice(0, -2))
        closed = true
        break
      }
      lines.push(text)
    }
    if (!closed) {
      if (!noBlockClose.has(state)) noBlockClose.set(state, new Map())
      noBlockClose.get(state)!.set(where, { from: startLine, to: line })
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

// KaTeX's maxExpand counts expansions, not what they make: a macro defined in
// the text (\def\a{…}\a\a…) is expanded up to 500 times whatever its length,
// so a formula of a few hundred characters could make megabytes and take
// seconds. A formula that defines one, or calls KaTeX's internal @-named
// macros (\tag{…} and \color{…} store what they are given in \df@tag and
// \current@color), or a very long one, is shown as written.
const DEFINES = /\\(?:[gex]?def|let|futurelet|global|long|(?:re)?newcommand|providecommand)(?![A-Za-z@])|\\[A-Za-z]*@/
const MAX_TEX = 4000
// What the formulas of one text may make in all; beyond it they are shown as written.
const MAX_HTML = 2_000_000
// The largest size, in em, KaTeX lets a formula ask for (\rule, \kern, \raisebox…).
const MAX_SIZE = 50

/**
 * Whether a formula reaches further than KaTeX's bounds intend. KaTeX caps a
 * size only from above (Math.min(size, maxSize)): \rule[-3000em], \raisebox{-…}
 * or a negative \kern in any unit is taken as written, and would make the page
 * as tall or as wide as it says. Lengths are read from style attributes only
 * (\sqrt's SVG is 400em wide by design), however KaTeX writes the number
 * (1e+23em, Infinityem). A derivation of many lines may be tall, so the bound
 * is 2·maxSize or 1em per character of TeX, whichever is larger.
 */
function oversized(html: string, tex: string): boolean {
  const limit = Math.max(2 * MAX_SIZE, tex.length)
  for (const [, style] of html.matchAll(/style="([^"]*)"/g))
    for (const [, n] of style.matchAll(/(-?(?:\d+(?:\.\d+)?(?:e[+-]?\d+)?|Infinity))em/g))
      if (Math.abs(Number(n)) > limit) return true
  return false
}

/**
 * The TeX typeset, or the TeX as written where KaTeX fails in a way it does
 * not report itself, or where the formula could make too much. `env` is
 * markdown-it's, one per text: it keeps what the text's formulas made so far.
 */
export function typeset(tex: string, displayMode: boolean, escape: (s: string) => string, env?: Env): string {
  const asWritten = `<code class="md-math-error">${escape(tex)}</code>`
  if (tex.length > MAX_TEX || DEFINES.test(tex)) return asWritten
  const made = Number(env?.mathHtml ?? 0)
  if (made >= MAX_HTML) return asWritten
  try {
    const html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      output: 'htmlAndMathml',
      // Bounds on sizes and on the number of macro expansions; they do not
      // bound what a formula makes (see DEFINES, MAX_TEX, MAX_HTML, oversized).
      maxSize: MAX_SIZE,
      maxExpand: 500,
      // TeX it cannot read, in the page's own colour for errors (light or dark).
      errorColor: 'var(--el-color-danger)',
    })
    if (env) env.mathHtml = made + html.length
    return oversized(html, tex) ? asWritten : html
  } catch {
    return asWritten
  }
}

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline)
  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
  // md.render() makes a new env for each text, so the output budget is per text.
  md.renderer.rules.math_inline = (tokens, idx, _options, env) =>
    typeset(tokens[idx].content, !!tokens[idx].meta?.display, md.utils.escapeHtml, env)
  md.renderer.rules.math_block = (tokens, idx, _options, env) =>
    `<div class="md-math">${typeset(tokens[idx].content, true, md.utils.escapeHtml, env)}</div>\n`
}
