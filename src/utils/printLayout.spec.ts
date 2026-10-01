import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  entriesHtml,
  escapeHtml,
  pageStyles,
  printBodyHtml,
  printDocument,
  printLayoutHtml,
  type PrintSource,
} from './printLayout'

const SOURCE: PrintSource = {
  title: 'Week 5 — Recursion <draft>',
  lines: ['CS101 · Introduction to Programming', null, '', 'Version 2 · 30 Sept 2026'],
  lang: 'zh-Hant',
  body: {
    markdown: '## 第 1 頁\n\n遞迴是**呼叫自己**的函式。\n\n![plot](/v1/blobs/plot.png)\n\n<script>alert(1)</script>',
  },
}

/** The layout, as a page, to be read. */
function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('the print layout', () => {
  it('is a page in the reader’s language, titled as the PDF is to be named', () => {
    const doc = parse(printLayoutHtml(SOURCE))
    expect(doc.documentElement.getAttribute('lang')).toBe('zh-Hant')
    expect(doc.title).toBe('Week 5 — Recursion <draft>')
    expect(doc.querySelector('meta[charset]')!.getAttribute('charset')).toBe('utf-8')
  })

  it('heads the text with its title and the lines given, in order, the empty ones left out', () => {
    const doc = parse(printLayoutHtml(SOURCE))
    expect(doc.querySelector('.print-head h1.print-title')!.textContent).toBe('Week 5 — Recursion <draft>')
    expect([...doc.querySelectorAll('.print-line')].map((p) => p.textContent)).toEqual([
      'CS101 · Introduction to Programming',
      'Version 2 · 30 Sept 2026',
    ])
  })

  it('renders Markdown as the app does: sanitised, no raw HTML, its images loaded at once', () => {
    const doc = parse(printLayoutHtml(SOURCE))
    const body = doc.querySelector('main .markdown-body.print-body')!
    expect(body.querySelector('h2')!.textContent).toBe('第 1 頁')
    expect(body.querySelector('strong')!.textContent).toBe('呼叫自己')
    expect(body.querySelector('script')).toBeNull()
    expect(doc.querySelector('script')).toBeNull()
    const img = body.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/v1/blobs/plot.png')
    expect(img.hasAttribute('loading')).toBe(false)
  })

  it('keeps plain text as it is, its lines and spaces, escaped; code in a monospaced face', () => {
    expect(printBodyHtml({ text: 'a < b\n  indented' })).toBe(
      '<pre class="print-body print-text">a &lt; b\n  indented</pre>',
    )
    expect(printBodyHtml({ text: 'x', mono: true })).toBe('<pre class="print-body print-text is-mono">x</pre>')
    const doc = parse(printLayoutHtml({ ...SOURCE, body: { text: '第一行\n<b>第二行</b>' } }))
    const pre = doc.querySelector('pre.print-text')!
    expect(pre.textContent).toBe('第一行\n<b>第二行</b>')
    expect(pre.querySelector('b')).toBeNull()
  })

  it('sets the page for paper: margins, the page’s number at its foot, headings kept with what follows, tables whole', () => {
    const doc = parse(printLayoutHtml(SOURCE))
    const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    expect(css).toMatch(/@page\s*{\s*margin: 18mm 16mm 20mm;/)
    expect(css).toContain('@bottom-center')
    expect(css).toContain('content: counter(page) " / " counter(pages)')
    expect(css).toMatch(/break-after: avoid/)
    expect(css).toMatch(/\.print-body table \{\s*display: table;/)
    // In the light theme, whatever the reader's.
    expect(css).toContain('background: #fff !important')
  })

  it('carries the app’s style sheets, before its own rules', () => {
    const html = printLayoutHtml(SOURCE, '<link rel="stylesheet" href="/assets/index.css"><style>.x{}</style>')
    expect(html.indexOf('/assets/index.css')).toBeLessThan(html.indexOf('@page'))
    document.head.insertAdjacentHTML(
      'beforeend',
      '<link rel="stylesheet" href="/assets/a.css"><style id="s">.y{}</style>',
    )
    expect(pageStyles()).toContain('<link rel="stylesheet" href="/assets/a.css">')
    expect(pageStyles()).toContain('<style id="s">.y{}</style>')
  })

  it('ends with a line where one is given', () => {
    const doc = parse(printLayoutHtml({ ...SOURCE, footer: 'A text version is the file’s words.' }))
    expect(doc.querySelector('footer.print-foot')!.textContent).toBe('A text version is the file’s words.')
    expect(parse(printLayoutHtml(SOURCE)).querySelector('footer')).toBeNull()
  })

  it('lays a conversation out a message after another, under who wrote each and when', () => {
    const html = entriesHtml([
      { who: 'Chan Tai Man', when: '30 Sept 2026 10:00', text: 'What is <recursion>?', files: 'Files: notes.pdf' },
      { who: 'Course tutor', when: '30 Sept 2026 10:01', markdown: 'A **function** that calls itself.' },
      { who: 'Chan Tai Man', note: 'Withdrawn' },
    ])
    const doc = parse(`<main>${html}</main>`)
    const entries = [...doc.querySelectorAll('.print-entry')]
    expect(entries.map((e) => e.querySelector('.print-entry__who')!.textContent)).toEqual([
      'Chan Tai Man · 30 Sept 2026 10:00',
      'Course tutor · 30 Sept 2026 10:01',
      'Chan Tai Man',
    ])
    expect(entries[0]!.querySelector('pre')!.textContent).toBe('What is <recursion>?')
    expect(entries[0]!.querySelector('.print-entry__files')!.textContent).toBe('Files: notes.pdf')
    expect(entries[1]!.querySelector('strong')!.textContent).toBe('function')
    expect(entries[2]!.querySelector('em')!.textContent).toBe('Withdrawn')
  })

  it('escapes what it is given as text', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
})

describe('printDocument', () => {
  afterEach(() => {
    document.querySelectorAll('iframe').forEach((f) => f.remove())
    vi.restoreAllMocks()
  })

  it('opens the print window from a hidden frame holding the layout, which goes once printing is done', async () => {
    const printed: string[] = []
    // jsdom draws nothing and prints nothing: the frame's print() is watched instead.
    const append = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      const out = append(node)
      if (node instanceof HTMLIFrameElement) {
        const win = node.contentWindow!
        win.print = () => void printed.push(node.srcdoc)
        setTimeout(() => node.dispatchEvent(new Event('load')), 0)
      }
      return out
    })
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    await printDocument(SOURCE)
    // The focus is back on what had it, not left in the frame.
    expect(document.activeElement).toBe(button)
    const frame = document.querySelector<HTMLIFrameElement>('iframe.app-print-frame')!
    expect(frame.getAttribute('aria-hidden')).toBe('true')
    expect(frame.style.visibility).toBe('hidden')
    expect(printed).toHaveLength(1)
    expect(printed[0]).toContain('<h1 class="print-title">Week 5 — Recursion &lt;draft&gt;</h1>')
    expect(printed[0]).toContain('<strong>呼叫自己</strong>')
    frame.contentWindow!.dispatchEvent(new Event('afterprint'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.querySelector('iframe.app-print-frame')).toBeNull()
  })

  it('takes the frame of a print before away as another is printed', async () => {
    vi.spyOn(document.body, 'appendChild').mockImplementation(function <T extends Node>(this: HTMLElement, node: T): T {
      HTMLElement.prototype.appendChild.call(document.body, node)
      if (node instanceof HTMLIFrameElement) {
        node.contentWindow!.print = () => {}
        setTimeout(() => node.dispatchEvent(new Event('load')), 0)
      }
      return node
    })
    await printDocument(SOURCE)
    await printDocument({ ...SOURCE, title: 'Again' })
    expect([...document.querySelectorAll<HTMLIFrameElement>('iframe.app-print-frame')].map((f) => f.title)).toEqual([
      'Again',
    ])
  })
})
