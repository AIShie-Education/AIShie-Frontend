import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

// Course material, submissions and feedback are Markdown written by people
// and by agents. Raw HTML in it is not rendered, and what markdown-it makes
// is sanitised again before it reaches the page.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })

const LINK_REL = 'noopener noreferrer nofollow'

// Links open elsewhere, and do not hand this page to what they open.
const defaultLink = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', LINK_REL)
  return defaultLink(tokens, idx, options, env, self)
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

export function renderMarkdown(src: string | null | undefined): string {
  if (!src) return ''
  return DOMPurify.sanitize(md.render(src), { ADD_ATTR: ['target', 'loading', 'referrerpolicy'] })
}
