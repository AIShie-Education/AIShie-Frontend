import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { highlightCode } from './markdownCode'
import { mathPlugin } from './markdownMath'

// Course material, submissions and feedback are Markdown written by people
// and by agents. Raw HTML in it is not rendered, and what markdown-it makes
// is sanitised again before it reaches the page. TeX between dollar signs is
// typeset (utils/markdownMath.ts) and fenced code in a language named after
// the fence is highlighted (utils/markdownCode.ts); both only add markup of
// their own, which is sanitised with the rest.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false, highlight: highlightCode })
md.use(mathPlugin)

const LINK_REL = 'noopener noreferrer nofollow'

// Links open elsewhere, and do not hand this page to what they open.
const defaultLink =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', LINK_REL)
  return defaultLink(tokens, idx, options, env, self)
}

// Fenced code, where the page asks for it (renderMarkdown's code option): in
// a box with a bar over it naming its language and a button to copy it, as
// an editor's agent chat shows code. The button is the page's to work
// (MarkdownView copies the code under it); its words come in the options, in
// the reader's language.
export interface CodeTools {
  /** The copy button's words. */
  copy: string
}
const defaultFence =
  md.renderer.rules.fence ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const html = defaultFence(tokens, idx, options, env, self)
  const tools = (env as { code?: CodeTools } | undefined)?.code
  if (!tools) return html
  const lang = tokens[idx]!.info.trim().split(/\s+/)[0] ?? ''
  const esc = md.utils.escapeHtml
  const label = lang ? `<span class="md-code__lang">${esc(lang)}</span>` : '<span class="md-code__lang"></span>'
  return (
    `<div class="md-code">` +
    `<div class="md-code__bar">${label}` +
    `<button type="button" class="md-code__copy" data-md-copy="">${esc(tools.copy)}</button></div>` +
    `${html}</div>\n`
  )
}

/**
 * Whether an image may be loaded where it is shown: one from this origin, or
 * one carried in the text itself (markdown-it lets through only data: URLs of
 * raster images). An image from anywhere else would tell its host who opened
 * the text, when and from where (a student's submission, an agent's proposed
 * feedback), and could pass off a picture of text as part of the page.
 */
function loadable(src: string): boolean {
  if (/^data:image\//i.test(src)) return true
  if (typeof window === 'undefined') return false
  try {
    return new URL(src, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

/** Whether token idx of an inline run sits inside a link. */
function insideLink(tokens: { type: string }[], idx: number): boolean {
  let depth = 0
  for (let i = idx - 1; i >= 0; i--) {
    if (tokens[i].type === 'link_close') depth--
    else if (tokens[i].type === 'link_open' && ++depth > 0) return true
  }
  return false
}

// Images from elsewhere are shown as a link to them, named by their alt text,
// and loaded only if the reader follows it. Those kept load lazily and send
// no referrer.
const defaultImage = md.renderer.rules.image!
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = String(token.attrGet('src') ?? '')
  if (loadable(src)) {
    token.attrSet('loading', 'lazy')
    token.attrSet('referrerpolicy', 'no-referrer')
    return defaultImage(tokens, idx, options, env, self)
  }
  const alt = self.renderInlineAsText(token.children ?? [], options, env).trim()
  const text = md.utils.escapeHtml(alt || src)
  if (insideLink(tokens, idx)) return `<span class="md-image-link">${text}</span>`
  const href = md.utils.escapeHtml(src)
  return `<a href="${href}" target="_blank" rel="${LINK_REL}" class="md-image-link" title="${href}">${text}</a>`
}

// A text version's pages and slides (文字版: a file transcribed, one heading
// a page), where the page asks for it (renderMarkdown's anchors option): each
// second-level heading that is exactly a page's or a slide's, as the
// transcriber writes them (## 第 3 頁, ## 投影片 3; 第 3 页, 幻灯片 3, Page 3
// and Slide 3 as well), is given an id made of the prefix, its kind and its
// number alone (text-page-3), never of what the heading says; a second
// heading of the same page gets -2, and so on. pageHeadings lists them.
const PAGE_HEADING =
  /^(?:第\s*(\d{1,6})\s*[頁页]|(?:投影片|幻灯片|幻燈片)\s*(\d{1,6})|page\s+(\d{1,6})|slide\s+(\d{1,6}))$/i

/** A page's or a slide's heading in a text version, and the id it is given. */
export interface PageHeading {
  kind: 'page' | 'slide'
  n: number
  id: string
  /** The heading as written. */
  text: string
}

/** The kind and number of a heading's text when it is a page's or a slide's, else null. */
export function pageHeadingOf(text: string): { kind: 'page' | 'slide'; n: number } | null {
  const m = PAGE_HEADING.exec(text.trim())
  if (!m) return null
  const page = m[1] ?? m[3]
  return page !== undefined ? { kind: 'page', n: Number(page) } : { kind: 'slide', n: Number(m[2] ?? m[4]) }
}

interface AnchorEnv {
  anchors?: string
  pages?: PageHeading[]
}

md.core.ruler.push('page_anchors', (state) => {
  const env = state.env as AnchorEnv | undefined
  const prefix = env?.anchors
  if (!prefix) return
  const seen = new Map<string, number>()
  const pages: PageHeading[] = []
  const tokens = state.tokens
  for (let i = 0; i < tokens.length - 1; i++) {
    const open = tokens[i]!
    if (open.type !== 'heading_open' || open.tag !== 'h2') continue
    const text = tokens[i + 1]!.content
    const h = pageHeadingOf(text)
    if (!h) continue
    const base = `${prefix}${h.kind}-${h.n}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    const id = count === 1 ? base : `${base}-${count}`
    open.attrSet('id', id)
    pages.push({ ...h, id, text: text.trim() })
  }
  env.pages = pages
})

/** The pages' and slides' headings of a text, with the ids renderMarkdown gives them under this prefix. */
export function pageHeadings(src: string | null | undefined, prefix: string): PageHeading[] {
  if (!src) return []
  const env: AnchorEnv = { anchors: prefix }
  md.parse(src, env as Record<string, unknown>)
  return env.pages ?? []
}

// The sanitiser's defaults keep what KaTeX and highlight.js make (class and
// style attributes, SVG, MathML) and let through, beyond them, only the link
// and image attributes set above. MathML's <semantics> and <annotation> are
// not allowed by default: the first is unwrapped, keeping the formula, and
// the second, KaTeX's copy of the TeX, goes with its text (else the TeX would
// be read out after the formula).
const PURIFY = { ADD_ATTR: ['target', 'loading', 'referrerpolicy'], ADD_FORBID_CONTENTS: ['annotation'] }

export function renderMarkdown(
  src: string | null | undefined,
  opts: { code?: CodeTools; anchors?: string } = {},
): string {
  if (!src) return ''
  const env: AnchorEnv & { code?: CodeTools } = {}
  if (opts.code) env.code = opts.code
  if (opts.anchors) env.anchors = opts.anchors
  return DOMPurify.sanitize(md.render(src, env as Record<string, unknown>), PURIFY)
}
