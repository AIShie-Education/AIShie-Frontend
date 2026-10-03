// "Download as PDF" (下載為 PDF): a text, Markdown or plain, laid out for
// paper and handed to the browser's own print window, where "Save as PDF"
// makes the file. The browser sets it in the fonts the page already has, its
// Chinese among them, so the PDF reads right in Chinese without the
// megabytes of a Chinese font sent to make one in the page.
//
// The layout is a page of its own (printLayoutHtml): the title, the lines
// that say what it is (the course, the document, the date), then the text,
// rendered as the app renders Markdown (renderMarkdown: sanitised, images
// from this origin alone) or, for plain text, as it is, its lines kept. It
// is set by the app's own style sheets, copied into it, in the light theme
// and the reader's language, with print rules over them: A4 or Letter as the
// printer has it, margins, headings kept with what follows them, and the
// page's number at its foot where the browser draws margin boxes.
//
// printDocument opens it in a hidden frame of this origin (srcdoc), waits
// for its fonts and images, and calls the frame's print(); the frame goes
// once the print window closes, and the focus goes back where it was. Its
// title is the PDF's file name.
import { i18n } from '@/i18n'
import { renderMarkdown } from './markdown'

/** What is laid out: the text, and what is said above it. */
export interface PrintSource {
  /** The heading, and the name the browser gives the PDF. */
  title: string
  /** Lines under the title: the course, what the text is of, the date. */
  lines?: (string | null | undefined | false)[]
  /** The language it is read in (<html lang>), which picks its fonts. */
  lang: string
  /** Markdown, rendered; plain text, as it is (monospaced for code); or HTML the app made of sanitised parts. */
  body: { markdown: string } | { text: string; mono?: boolean } | { html: string }
  /** A line at the end (where it came from). */
  footer?: string | null
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text made safe to put in HTML, as text or in an attribute. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]!)
}

/**
 * The body as HTML: Markdown rendered (its images loaded at once, not when
 * scrolled to, since nothing is scrolled in a print), plain text escaped in
 * a block that keeps its lines.
 */
export function printBodyHtml(body: PrintSource['body']): string {
  if ('markdown' in body) {
    const html = renderMarkdown(body.markdown).replace(/ loading="lazy"/g, '')
    return `<div class="markdown-body print-body">${html}</div>`
  }
  if ('text' in body) {
    return `<pre class="print-body print-text${body.mono ? ' is-mono' : ''}">${escapeHtml(body.text)}</pre>`
  }
  return `<div class="print-body">${body.html}</div>`
}

/** One message of a conversation, as a transcript lays it out. */
export interface PrintEntry {
  /** Who wrote it. */
  who: string
  /** When, as it is to be read. */
  when?: string | null
  /** What it says: Markdown (an agent's answer), plain text (a person's question), or a note in its place (withdrawn). */
  markdown?: string | null
  text?: string | null
  note?: string | null
  /** The files it carried, said in a line. */
  files?: string | null
}

/** A conversation's messages as HTML, one after another, each under who wrote it and when. */
export function entriesHtml(entries: PrintEntry[]): string {
  return entries
    .map((e) => {
      // The dot before when is the language's (common.sep), its spaces with it.
      const when = e.when
        ? `<span class="print-entry__when">${escapeHtml(i18n.global.t('common.sep') + e.when)}</span>`
        : ''
      const body = e.note
        ? `<p class="print-entry__note"><em>${escapeHtml(e.note)}</em></p>`
        : e.markdown
          ? `<div class="markdown-body">${renderMarkdown(e.markdown).replace(/ loading="lazy"/g, '')}</div>`
          : `<pre class="print-text">${escapeHtml(e.text ?? '')}</pre>`
      const files = e.files ? `<p class="print-entry__files">${escapeHtml(e.files)}</p>` : ''
      return `<section class="print-entry"><p class="print-entry__who">${escapeHtml(e.who)}${when}</p>${body}${files}</section>`
    })
    .join('\n')
}

/** The print rules, over the app's style sheets. */
export const PRINT_CSS = `
@page {
  margin: 18mm 16mm 20mm;
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: var(--app-font-sans, sans-serif);
    font-size: 9pt;
    color: #707070;
  }
}
html, body {
  margin: 0;
  padding: 0;
  background: #fff !important;
  color: #16181d !important;
  color-scheme: light;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  font-family: var(--app-font-sans);
  font-size: 11pt;
  line-height: 1.7;
}
.print-head {
  margin: 0 0 16pt;
  padding: 0 0 10pt;
  border-bottom: 1px solid #c8c8c8;
}
.print-title {
  margin: 0 0 6pt;
  font-family: var(--app-font-serif);
  font-weight: var(--app-heading-weight, 700);
  font-size: 18pt;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.print-line {
  margin: 0;
  font-size: 9.5pt;
  line-height: 1.6;
  color: #555;
}
.print-body.markdown-body {
  font-size: 11pt;
  line-height: 1.75;
}
.print-body pre,
.print-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow: visible;
}
.print-text {
  margin: 0;
  font-family: var(--app-font-sans);
  font-size: 11pt;
  line-height: 1.75;
}
.print-text.is-mono {
  font-family: var(--app-font-mono);
  font-size: 9.5pt;
  line-height: 1.55;
}
.print-body table {
  display: table;
  overflow: visible;
}
.print-body h1, .print-body h2, .print-body h3, .print-body h4 {
  break-after: avoid;
  page-break-after: avoid;
}
.print-body pre, .print-body blockquote, .print-body tr, .print-body img, .print-body .katex-display {
  break-inside: avoid;
}
.print-body img {
  max-width: 100%;
}
.print-body a {
  color: inherit;
  text-decoration: underline;
}
.print-body .md-code__copy {
  display: none;
}
.print-entry {
  margin: 0 0 14pt;
  break-inside: avoid-page;
}
.print-entry__who {
  margin: 0 0 3pt;
  font-size: 9.5pt;
  font-weight: 600;
  color: #333;
}
.print-entry__when {
  font-weight: 400;
  color: #777;
}
.print-entry__note {
  margin: 0;
  color: #666;
}
.print-entry .markdown-body {
  font-size: 10.5pt;
}
.print-entry__files {
  margin: 4pt 0 0;
  font-size: 9pt;
  color: #555;
}
.print-foot {
  margin: 18pt 0 0;
  padding-top: 8pt;
  border-top: 1px solid #dedede;
  font-size: 8.5pt;
  color: #777;
}
@media screen {
  body { padding: 24px; }
}
`

/**
 * The print layout, a whole page: the app's style sheets (`styles`, their
 * <link> and <style> elements), the print rules, the title and its lines,
 * and the body.
 */
export function printLayoutHtml(src: PrintSource, styles = ''): string {
  const lines = (src.lines ?? []).filter((l): l is string => !!l && !!l.trim())
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(src.lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(src.title)}</title>`,
    styles,
    `<style>${PRINT_CSS}</style>`,
    '</head>',
    '<body class="print-layout">',
    '<header class="print-head">',
    `<h1 class="print-title">${escapeHtml(src.title)}</h1>`,
    ...lines.map((l) => `<p class="print-line">${escapeHtml(l)}</p>`),
    '</header>',
    '<main>',
    printBodyHtml(src.body),
    '</main>',
    src.footer ? `<footer class="print-foot">${escapeHtml(src.footer)}</footer>` : '',
    '</body>',
    '</html>',
  ].join('\n')
}

/** The app's style sheets as they are in this page now (its own, the fonts', Markdown's), to copy into the layout. */
export function pageStyles(doc: Document = document): string {
  return [...doc.head.querySelectorAll('link[rel="stylesheet"], style')].map((el) => el.outerHTML).join('\n')
}

/** How long the layout waits for its fonts and images before it is printed as it is. */
export const PRINT_WAIT_MS = 4000

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Resolves once every image in the document has loaded or failed, or after `ms`. */
function imagesSettled(doc: Document, ms: number): Promise<unknown> {
  const pending = [...doc.images].filter((img) => !img.complete)
  if (!pending.length) return Promise.resolve()
  return Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
      ),
    ),
    wait(ms),
  ])
}

/** The frame the last layout was printed from, until its print window closes. */
let lastFrame: HTMLIFrameElement | null = null

/**
 * Lays the source out and opens the browser's print window on it, from a
 * hidden frame. Resolves once the window has been asked for (in most browsers
 * once it has closed again). Rejects where the frame cannot be printed.
 */
export async function printDocument(src: PrintSource): Promise<void> {
  // Focus goes back where it was once the print window closes: left in the frame, the page would take no keys.
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null
  lastFrame?.remove()
  const frame = document.createElement('iframe')
  lastFrame = frame
  frame.className = 'app-print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.title = src.title
  // Out of sight, but laid out, so that its fonts are fetched.
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }))
  frame.srcdoc = printLayoutHtml(src, pageStyles())
  document.body.appendChild(frame)
  await Promise.race([loaded, wait(PRINT_WAIT_MS)])
  const win = frame.contentWindow
  const doc = frame.contentDocument
  if (!win || !doc) throw new Error('the print layout could not be opened')
  // Its text laid out, its fonts fetched for what it says, its images in.
  void doc.body?.offsetHeight
  await Promise.race([Promise.all([doc.fonts?.ready, imagesSettled(doc, PRINT_WAIT_MS)]), wait(PRINT_WAIT_MS)])
  const refocus = () => {
    if (back?.isConnected) back.focus({ preventScroll: true })
  }
  const done = () => {
    if (lastFrame === frame) lastFrame = null
    frame.remove()
    refocus()
  }
  win.addEventListener('afterprint', () => setTimeout(done, 0), { once: true })
  // Not focused first: a frame's print() prints the frame, and focus sent into it does not come back by itself.
  win.print()
  // Most browsers hold print() until their print window closes; the page has the keys again.
  refocus()
  setTimeout(refocus, 0)
}
