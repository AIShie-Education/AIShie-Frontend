import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

// Course material, submissions and feedback are Markdown written by people
// and by agents. Raw HTML in it is not rendered, and what markdown-it makes
// is sanitised again before it reaches the page.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })

// Links open elsewhere, and do not hand this page to what they open.
const defaultLink = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer nofollow')
  return defaultLink(tokens, idx, options, env, self)
}

export function renderMarkdown(src: string | null | undefined): string {
  if (!src) return ''
  return DOMPurify.sanitize(md.render(src), { ADD_ATTR: ['target'] })
}
