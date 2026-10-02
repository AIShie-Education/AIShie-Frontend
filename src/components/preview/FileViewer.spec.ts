import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h, nextTick } from 'vue'
import type { TextVersion } from '@/api/types'

// Each file's bytes, by the URL the viewer is handed for it.
const bytes = new Map<string, Blob>()
const fetched: string[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    fetchBlob: vi.fn(async (url: string) => {
      fetched.push(url)
      const b = bytes.get(url)
      if (!b) throw new real.ApiError({ status: 403, code: 'download_failed', message: 'download failed: HTTP 403' })
      return b
    }),
  }
})
// pdf.js is not run here: the PDF view stands in, saying what it was handed.
vi.mock('./PdfView.vue', () => ({
  __esModule: true,
  default: defineComponent({
    props: { data: { type: Object, required: true }, name: { type: String, required: true } },
    setup: (props) => () =>
      h('div', { class: 'pdf-stub' }, `${props.name}: ${(props.data as Uint8Array).length} bytes`),
  }),
}))
// Whether the runtime's transcriber is on, as GET /info says.
let transcription = true
let runtimeAsked = 0
vi.mock('@/composables/useRuntime', async () => {
  const { computed, ref } = await import('vue')
  return {
    useRuntime: () => (
      runtimeAsked++,
      {
        info: computed(() => ({ features: { transcription } })),
        available: computed(() => true),
        checked: ref(true),
      }
    ),
  }
})
const printed: Record<string, any>[] = []
vi.mock('@/utils/printLayout', async (orig) => {
  const real = await orig<typeof import('@/utils/printLayout')>()
  return { ...real, printDocument: vi.fn(async (src: Record<string, any>) => void printed.push(src)) }
})

const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { default: FileViewer } = await import('./FileViewer.vue')
const { closePreview, openPreview, previewState } = await import('./viewer')
const { ApiError } = await import('@/api/http')
type PreviewFile = import('./viewer').PreviewFile

let made = 0
const revoked: string[] = []
const downloads: string[] = []
beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
  bytes.clear()
  transcription = true
  runtimeAsked = 0
  fetched.length = 0
  printed.length = 0
  downloads.length = 0
  made = 0
  revoked.length = 0
  URL.createObjectURL = vi.fn(() => `blob:local/${++made}`)
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u))
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})
afterEach(async () => {
  closePreview()
  await flushPromises()
  document.body.innerHTML = ''
})
enableAutoUnmount(afterEach)

/** A file whose bytes are `body`, served at a URL of its own. */
function file(
  filename: string,
  contentType: string,
  body: BlobPart | null,
  over: Partial<PreviewFile> = {},
): PreviewFile {
  const url = `https://store.test/${encodeURIComponent(filename)}`
  const blob = body === null ? null : new Blob([body], { type: contentType })
  if (blob) bytes.set(url, blob)
  return {
    key: filename,
    filename,
    contentType,
    byteSize: blob?.size ?? 0,
    url: vi.fn(async () => url),
    download: vi.fn(async () => void downloads.push(filename)),
    ...over,
  }
}

const done = (body: string): { text: TextVersion; body: string } => ({
  text: { status: 'done', revision: 2, bytes: body.length, updated_at: '2026-09-30T00:00:00Z' } as TextVersion,
  body,
})

function viewer() {
  return mount(FileViewer, {
    global: { plugins: [i18n, ElementPlus], components: icons },
    attachTo: document.body,
  })
}
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel)
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]

async function open(files: PreviewFile[], index = 0, extra: { title?: string; courseId?: string } = {}) {
  const w = viewer()
  openPreview({ files, index, ...extra })
  await flushPromises()
  await nextTick()
  await flushPromises()
  return w
}

describe('FileViewer', () => {
  it('names the file, what it is and its size, and what it is of, with its download under its name', async () => {
    const f = file('notes.txt', 'text/plain', 'Line one\nLine two\n')
    await open([f], 0, { title: 'Week 3 — Loops' })
    const dialog = $('[role="dialog"]')!
    const title = $('.file-viewer__name')!
    expect(title.textContent!.trim()).toBe('notes.txt')
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id)
    expect($('.file-viewer__meta')!.textContent).toMatch(/Text · 18 B\s*·\s*Week 3 — Loops/)
    const download = $('.file-viewer__download')!
    expect(download.getAttribute('aria-label')).toBe('Download “notes.txt”')
    download.click()
    await flushPromises()
    expect(downloads).toEqual(['notes.txt'])
    // One file: nothing to step through.
    expect($('.file-viewer__nav')).toBeNull()
  })

  it('shows plain text as it is, its lines kept, fetched from a fresh URL', async () => {
    const f = file('notes.txt', 'text/plain', '遞迴\n  indented <b>not bold</b>\n')
    await open([f])
    expect(f.url).toHaveBeenCalledTimes(1)
    expect(fetched).toEqual(['https://store.test/notes.txt'])
    const pre = $('.text-view__pre')!
    expect(pre.textContent).toBe('遞迴\n  indented <b>not bold</b>\n')
    expect(pre.querySelector('b')).toBeNull()
  })

  it('renders Markdown as the app renders it, with no raw HTML', async () => {
    await open([
      file(
        'notes.md',
        'text/markdown',
        '# Recursion\n\nA **function** that calls itself.\n\n<script>alert(1)</script>\n',
      ),
    ])
    expect($('.text-view__paper h1')!.textContent).toBe('Recursion')
    expect($('.text-view__paper strong')!.textContent).toBe('function')
    expect($('.text-view__paper script')).toBeNull()
  })

  it('shows code in its language, highlighted', async () => {
    await open([file('fact.py', 'text/x-python', 'def fact(n):\n    return 1 if n < 2 else n * fact(n - 1)\n')])
    expect($('.text-view__code .md-code__lang')!.textContent).toBe('python')
    expect($('.text-view__code .hljs-keyword')!.textContent).toBe('def')
  })

  it('shows a CSV file as a table, its first row the head', async () => {
    await open([file('marks.csv', 'text/csv', 'name,mark\n"Chan, Tai Man",87\nLee,92\n')])
    expect($$('.text-view__table thead th').map((th) => th.textContent)).toEqual(['', 'name', 'mark'])
    expect(
      $$('.text-view__table tbody tr').map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)),
    ).toEqual([
      ['2', 'Chan, Tai Man', '87'],
      ['3', 'Lee', '92'],
    ])
    expect($('.text-view__cut')).toBeNull()
  })

  it('says a CSV file is cut to its first rows', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => `${i},x`).join('\n')
    await open([file('big.csv', 'text/csv', rows)])
    expect($$('.text-view__table tbody tr')).toHaveLength(999)
    expect($('.text-view__cut')!.textContent).toContain(
      'Showing the first 1,000 rows. Download the file to see them all.',
    )
  })

  it('says a file named as text that holds none is not text', async () => {
    await open([file('photo.txt', 'text/plain', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))])
    expect($('.file-viewer__note-title')!.textContent).toBe('This file holds no text to show')
    expect($('.file-viewer__note-download')).not.toBeNull()
  })

  it('fetches nothing of a file too large to preview, and offers its download', async () => {
    const f = file('huge.txt', 'text/plain', 'x', { byteSize: 3 << 20 })
    await open([f])
    expect(f.url).not.toHaveBeenCalled()
    expect(fetched).toEqual([])
    expect($('.file-viewer__note-title')!.textContent).toBe('Too large to preview')
    expect($('.file-viewer__note-text')!.textContent).toBe('Files up to 2 MB are shown here. Download it to open it.')
    $('.file-viewer__note-download')!.click()
    await flushPromises()
    expect(downloads).toEqual(['huge.txt'])
  })

  it('says a kind it cannot show, and offers its download', async () => {
    const f = file('project.zip', 'application/zip', 'PK')
    await open([f])
    expect(f.url).not.toHaveBeenCalled()
    expect($('.file-viewer__note-title')!.textContent).toBe('No preview for this kind of file')
  })

  it('says why a file could not be fetched, and tries again', async () => {
    const f = file('gone.md', 'text/markdown', null)
    await open([f])
    expect($('.file-viewer__note-title')!.textContent).toBe('The file could not be loaded')
    expect($('.file-viewer__note-text')!.textContent).toContain('HTTP 403')
    bytes.set('https://store.test/gone.md', new Blob(['# Back']))
    $$('.file-viewer__note-actions button')
      .find((b) => b.textContent!.includes('Retry'))!
      .click()
    await flushPromises()
    await flushPromises()
    expect($('.text-view__paper h1')!.textContent).toBe('Back')
  })

  it('hands a PDF’s bytes to the PDF view', async () => {
    await open([file('slides.pdf', 'application/pdf', '%PDF-1.4 tiny')])
    await flushPromises()
    expect($('.pdf-stub')!.textContent).toBe('slides.pdf: 13 bytes')
    // Not shown from an object URL.
    expect(made).toBe(0)
  })

  it('shows an image from an object URL of its bytes, typed as an image, an SVG as an <img> alone', async () => {
    const svg = file(
      'diagram.svg',
      'application/octet-stream',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>',
    )
    await open([svg])
    const img = $('.image-view__img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('blob:local/1')
    expect(img.getAttribute('alt')).toBe('diagram.svg')
    const made1 = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Blob
    expect(made1.type).toBe('image/svg+xml')
    expect($('.image-view__stage svg')).toBeNull()
  })

  it('revokes the object URL of what it showed as soon as another file is shown, and all of them as it closes', async () => {
    const files = [
      file('a.png', 'image/png', 'png-a'),
      file('b.png', 'image/png', 'png-b'),
      file('c.mp3', 'audio/mpeg', 'mp3'),
    ]
    await open(files)
    expect($('.image-view__img')!.getAttribute('src')).toBe('blob:local/1')
    expect($('.file-viewer__position')!.textContent!.trim()).toBe('1 of 3')
    $('.file-viewer__next')!.click()
    await flushPromises()
    await flushPromises()
    expect(revoked).toEqual(['blob:local/1'])
    expect($('.image-view__img')!.getAttribute('src')).toBe('blob:local/2')
    $('.file-viewer__next')!.click()
    await flushPromises()
    await flushPromises()
    expect(revoked).toEqual(['blob:local/1', 'blob:local/2'])
    expect($('.file-viewer__media audio')!.getAttribute('src')).toBe('blob:local/3')
    expect(($('.file-viewer__next') as HTMLButtonElement).disabled).toBe(true)
    closePreview()
    await flushPromises()
    expect(revoked).toEqual(['blob:local/1', 'blob:local/2', 'blob:local/3'])
  })

  it('goes to the previous and the next file by the arrow keys, but not from a field', async () => {
    const files = [file('a.txt', 'text/plain', 'a'), file('b.txt', 'text/plain', 'b'), file('c.txt', 'text/plain', 'c')]
    await open(files, 1)
    const state = previewState()
    const key = (target: EventTarget, k: string) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    const body = $('.file-viewer__body')!
    key(body, 'ArrowRight')
    expect(state.index).toBe(2)
    key(body, 'ArrowRight')
    expect(state.index).toBe(2)
    key(body, 'ArrowLeft')
    key(body, 'ArrowLeft')
    expect(state.index).toBe(0)
    const field = document.createElement('input')
    $('.file-viewer__head')!.appendChild(field)
    key(field, 'ArrowRight')
    expect(state.index).toBe(0)
  })

  it('shows an Office file’s text version where it is done, read afresh, saying what a text version is', async () => {
    const readText = vi.fn(async () => done('## 第 1 頁\n\nThe essay, as text.'))
    const f = file('essay.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'PK', {
      readText,
    })
    await open([f])
    expect(readText).toHaveBeenCalledTimes(1)
    // Its bytes are not fetched: no browser shows it.
    expect(f.url).not.toHaveBeenCalled()
    expect($('.file-viewer__text-note')!.textContent).toContain('This is the file’s text version (文字版)')
    expect($('.file-viewer__paper h2')!.textContent).toBe('第 1 頁')
  })

  it('says an Office file with no text version has no preview yet, and offers its download', async () => {
    const pending = vi.fn(async () => ({ text: { status: 'pending', revision: 1 } as TextVersion, body: '' }))
    await open([
      file('slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PK', {
        readText: pending,
      }),
      file('sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'PK'),
    ])
    expect($('.file-viewer__note-title')!.textContent).toBe('No preview available yet')
    expect($('.file-viewer__note-text')!.textContent).toContain('Its text version (文字版) is still being made')
    $('.file-viewer__next')!.click()
    await flushPromises()
    await flushPromises()
    expect($('.file-viewer__note-text')!.textContent).toBe(
      'A preview of Word, PowerPoint and Excel files is not available yet. Download it to open it.',
    )
    $('.file-viewer__note-download')!.click()
    await flushPromises()
    expect(downloads).toEqual(['sheet.xlsx'])
  })

  it('asks whether anything transcribes only once an Office file is shown', async () => {
    await open([
      file('notes.txt', 'text/plain', 'x'),
      file('essay.docx', 'application/msword', 'x', { readText: async () => done('The essay.') }),
    ])
    expect(runtimeAsked).toBe(0)
    $('.file-viewer__next')!.click()
    await flushPromises()
    await flushPromises()
    expect(runtimeAsked).toBe(1)
  })

  it('says a text version waiting for a transcriber that is off is none', async () => {
    transcription = false
    const pending = vi.fn(async () => ({ text: { status: 'pending', revision: 1 } as TextVersion, body: '' }))
    await open([file('slides.pptx', 'application/vnd.ms-powerpoint', 'PK', { readText: pending })])
    expect($('.file-viewer__note-text')!.textContent).toBe(
      'A preview of Word, PowerPoint and Excel files is not available yet. Download it to open it.',
    )
  })

  it('downloads a text file as a PDF, through the print window: titled by its name, under its course and date', async () => {
    useSessionStore().memberships = [
      { course_id: 'k1', code: 'CS101', title: 'Programming', status: 'active' } as never,
    ]
    await open([file('notes.md', 'text/markdown', '# Recursion', { date: '2026-09-30T08:00:00Z' })], 0, {
      title: 'Week 3',
      courseId: 'k1',
    })
    const button = $('.file-viewer__actions .print-button__button')!
    expect(button.textContent!.trim()).toBe('Download as PDF')
    expect(document.getElementById(button.getAttribute('aria-describedby')!)!.textContent).toBe(
      'In the print window, choose “Save as PDF”',
    )
    button.click()
    await flushPromises()
    expect(printed).toEqual([
      {
        title: 'notes.md',
        lines: ['Week 3', 'CS101 · Programming', expect.stringMatching(/2026/)],
        body: { markdown: '# Recursion' },
        lang: 'en',
      },
    ])
  })

  it('downloads code as a PDF in a monospaced face, an Office file’s text version under its name, and no CSV or image', async () => {
    await open([
      file('fact.py', 'text/x-python', 'print(1)\n'),
      file('essay.docx', 'application/msword', 'x', { readText: async () => done('The essay.') }),
      file('marks.csv', 'text/csv', 'a,b\n'),
      file('a.png', 'image/png', 'png'),
    ])
    $('.file-viewer__actions .print-button__button')!.click()
    await flushPromises()
    expect(printed[0]).toMatchObject({ title: 'fact.py', body: { text: 'print(1)\n', mono: true } })
    $('.file-viewer__next')!.click()
    await flushPromises()
    await flushPromises()
    $('.file-viewer__actions .print-button__button')!.click()
    await flushPromises()
    expect(printed[1]).toMatchObject({ title: 'essay.docx — text version', body: { markdown: 'The essay.' } })
    $('.file-viewer__next')!.click()
    await flushPromises()
    await flushPromises()
    expect($('.file-viewer__actions .print-button__button')).toBeNull()
    $('.file-viewer__next')!.click()
    await flushPromises()
    await flushPromises()
    expect($('.file-viewer__actions .print-button__button')).toBeNull()
  })
})

describe('FileViewer: an Office file shown as its PDF rendition', () => {
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  type Rendition = NonNullable<PreviewFile['rendition']>
  const PDF_URL = 'https://store.test/renditions/essay.pdf'
  const doneRendition: Rendition = {
    state: 'done',
    page_count: 12,
    byte_size: 13,
    download_url: PDF_URL,
    download_expires_at: '2026-10-01T09:15:00Z',
  }
  const refused = (status: number, code: string, reason: string) =>
    new ApiError({ status, code, message: `refused: ${reason}`, details: { reason } })

  /** An Office file Core converts, whose rendition reads as `reads` says, one after another (the last kept). */
  function office(reads: (Rendition | null | Error)[], over: Partial<PreviewFile> = {}, listed?: Rendition) {
    const queue = [...reads]
    const readRendition = vi.fn(async () => {
      const next = queue.length > 1 ? queue.shift()! : queue[0]!
      if (next instanceof Error) throw next
      return next
    })
    return file('essay.docx', DOCX, 'PK original', {
      rendition: listed ?? { state: 'queued' },
      readRendition,
      ...over,
    })
  }
  const notifications = () => $$('.el-notification').map((n) => n.textContent ?? '')
  const messages = () => $$('.el-message').map((n) => n.textContent ?? '')

  let saved: { href: string; download: string }[] = []
  beforeEach(() => {
    bytes.set(PDF_URL, new Blob(['%PDF-1.7 tiny'], { type: 'application/pdf' }))
    saved = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ href: this.href, download: this.download })
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the PDF, fetched from the fresh URL read as it opens, with “Download PDF” beside its own download', async () => {
    const f = office([doneRendition], {}, { state: 'done', page_count: 12, byte_size: 13 })
    await open([f])
    await flushPromises()
    expect(f.readRendition).toHaveBeenCalledTimes(1)
    // The PDF's bytes, never the original's.
    expect(f.url).not.toHaveBeenCalled()
    expect(fetched).toEqual([PDF_URL])
    expect($('.pdf-stub')!.textContent).toBe('essay.docx: 13 bytes')
    expect($('.file-viewer__body')!.dataset.rendition).toBe('done')
    expect($('.file-viewer__meta')!.textContent).toContain('Document · 11 B · PDF of 12 pages')
    expect($('.file-viewer__download')!.getAttribute('aria-label')).toBe('Download “essay.docx”')
    const pdf = $('.file-viewer__download-pdf')!
    expect(pdf.textContent!.trim()).toBe('Download PDF')
    expect(pdf.getAttribute('aria-label')).toBe('Download PDF “essay.pdf”')

    // Saved under the PDF's name, from a URL read afresh.
    pdf.click()
    await flushPromises()
    await flushPromises()
    expect(f.readRendition).toHaveBeenCalledTimes(2)
    expect(fetched).toEqual([PDF_URL, PDF_URL])
    expect(saved).toEqual([{ href: expect.stringMatching(/^blob:local\//), download: 'essay.pdf' }])
    // And the original, under its own.
    $('.file-viewer__download')!.click()
    await flushPromises()
    expect(downloads).toEqual(['essay.docx'])
  })

  it('says it is being converted, with a spinner, asking again 2 s after, then twice as long each time, until it is done', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = office([{ state: 'queued' }, { state: 'claimed' }, { state: 'claimed' }, doneRendition])
    await open([f])
    expect(f.readRendition).toHaveBeenCalledTimes(1)
    expect($('.file-viewer__note-title')!.textContent).toBe('Converting to PDF…')
    expect($('.file-viewer__note-words')!.getAttribute('role')).toBe('status')
    expect($('.file-viewer__note-icon.is-waiting .is-loading')).not.toBeNull()
    expect($('.file-viewer__note-text')!.textContent).toContain('It appears by itself once it is ready')
    // The original meanwhile, and no PDF to download yet.
    expect($('.file-viewer__note-download')).not.toBeNull()
    expect($('.file-viewer__download-pdf')).toBeNull()
    expect($('.file-viewer__note-retry')).toBeNull()

    await vi.advanceTimersByTimeAsync(1_999)
    expect(f.readRendition).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.readRendition).toHaveBeenCalledTimes(2)
    expect($('.file-viewer__body')!.dataset.rendition).toBe('claimed')
    expect($('.file-viewer__note-title')!.textContent).toBe('Converting to PDF…')
    await vi.advanceTimersByTimeAsync(3_999)
    expect(f.readRendition).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.readRendition).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(f.readRendition).toHaveBeenCalledTimes(4)
    await flushPromises()
    expect($('.pdf-stub')!.textContent).toBe('essay.docx: 13 bytes')
    expect($('.file-viewer__download-pdf')).not.toBeNull()
    // Done: nothing is asked again.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(f.readRendition).toHaveBeenCalledTimes(4)
  })

  it('waits no longer than 30 s between two asks', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = office([{ state: 'queued' }])
    await open([f])
    // 2, 4, 8, 16, then 30, 30: six more asks in 90 s.
    await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000 + 16_000 + 30_000 + 30_000)
    expect(f.readRendition).toHaveBeenCalledTimes(7)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(f.readRendition).toHaveBeenCalledTimes(7)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.readRendition).toHaveBeenCalledTimes(8)
  })

  it('stops asking once it is closed, or another file is shown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const first = office([{ state: 'queued' }])
    const second = office([{ state: 'claimed' }], { key: 'slides.pptx', filename: 'slides.pptx' })
    await open([first, second])
    await vi.advanceTimersByTimeAsync(2_000)
    expect(first.readRendition).toHaveBeenCalledTimes(2)
    // Another file: the first is asked no more, and the second from the start.
    $('.file-viewer__next')!.click()
    await flushPromises()
    await flushPromises()
    expect(second.readRendition).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(first.readRendition).toHaveBeenCalledTimes(2)
    const asked = (second.readRendition as ReturnType<typeof vi.fn>).mock.calls.length
    expect(asked).toBeGreaterThan(1)
    // Closed: nothing at all.
    closePreview()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(first.readRendition).toHaveBeenCalledTimes(2)
    expect(second.readRendition).toHaveBeenCalledTimes(asked)
  })

  it('keeps asking through a moment with no answer, and says why when the file is gone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = office([
      { state: 'queued' },
      new ApiError({ status: 0, code: 'network', message: 'no answer' }),
      refused(404, 'not_found', 'not_found'),
    ])
    await open([f])
    await vi.advanceTimersByTimeAsync(2_000)
    expect($('.file-viewer__note-title')!.textContent).toBe('Converting to PDF…')
    await vi.advanceTimersByTimeAsync(4_000)
    await flushPromises()
    expect(f.readRendition).toHaveBeenCalledTimes(3)
    expect($('.file-viewer__note-title')!.textContent).toBe('The file could not be loaded')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.readRendition).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['skipped', 'password_protected', 'The file is protected by a password.'],
    ['skipped', 'unsupported', 'The file could not be read as an Office document.'],
    ['skipped', 'too_large', 'Its PDF would be too large to keep.'],
    ['failed', 'conversion_failed', 'The conversion failed.'],
    ['failed', 'timeout', 'The conversion took too long, and was stopped.'],
    ['failed', 'attempts_exhausted', 'It was tried several times, and never finished.'],
    ['failed', 'something_new', 'There is no PDF of it.'],
    ['expired', null, 'There is no PDF of it.'],
  ])('says why there is no PDF (%s, %s), with the file’s own download', async (state, reason, words) => {
    const f = office([{ state, reason }])
    await open([f])
    expect($('.file-viewer__note-title')!.textContent).toBe('It could not be converted to PDF')
    expect($('.file-viewer__note-text')!.textContent).toBe(`${words} Download the file to open it.`)
    expect($('.file-viewer__download-pdf')).toBeNull()
    // Not for this caller to send back.
    expect($('.file-viewer__note-retry')).toBeNull()
    $('.file-viewer__note-download')!.click()
    await flushPromises()
    expect(downloads).toEqual(['essay.docx'])
  })

  it('in Chinese too', async () => {
    setLocale('zh-Hant')
    await open([office([{ state: 'skipped', reason: 'password_protected' }])])
    expect($('.file-viewer__note-title')!.textContent).toBe('無法轉換為 PDF')
    expect($('.file-viewer__note-text')!.textContent).toBe('這個檔案設有密碼保護。 請下載檔案開啟。')
    closePreview()
    await flushPromises()
    await open([office([{ state: 'queued' }])])
    expect($('.file-viewer__note-title')!.textContent).toBe('正在轉換為 PDF…')
    closePreview()
    await flushPromises()
    setLocale('zh-Hans')
    await open([office([doneRendition])])
    expect($('.file-viewer__download-pdf')!.textContent!.trim()).toBe('下载 PDF')
    expect($('.file-viewer__meta')!.textContent).toContain('PDF，共12页')
  })

  it('sends one that failed back where the caller may, says it waits again, and shows the PDF once it is done', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const retryRendition = vi.fn(async () => ({
      status: 'executed' as const,
      actionId: 'a1',
      reviewState: 'none' as const,
      replayed: false,
      result: { changed: true, rendition_id: 'r1', state: 'queued' },
    }))
    const f = office([{ state: 'failed', reason: 'timeout' }, doneRendition], { retryRendition })
    await open([f])
    const retry = $('.file-viewer__note-retry')!
    expect(retry.textContent!.trim()).toBe('Try again')
    retry.click()
    await flushPromises()
    expect(retryRendition).toHaveBeenCalledTimes(1)
    expect(messages().join()).toContain('It will be converted to PDF again.')
    expect($('.file-viewer__note-title')!.textContent).toBe('Converting to PDF…')
    expect($('.file-viewer__body')!.dataset.rendition).toBe('queued')
    expect(f.readRendition).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()
    expect(f.readRendition).toHaveBeenCalledTimes(2)
    expect($('.pdf-stub')!.textContent).toBe('essay.docx: 13 bytes')
  })

  it('reads it again where Core says it is done already', async () => {
    const retryRendition = vi.fn(async () => {
      throw refused(422, 'failed_precondition', 'rendition_done')
    })
    const f = office([{ state: 'failed', reason: 'conversion_failed' }, doneRendition], { retryRendition })
    await open([f])
    $('.file-viewer__note-retry')!.click()
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(f.readRendition).toHaveBeenCalledTimes(2)
    expect($('.pdf-stub')!.textContent).toBe('essay.docx: 13 bytes')
    expect(notifications()).toEqual([])
    expect(messages()).toEqual([])
  })

  it('says, in its words, why Core refused to send it back, and stays as it was', async () => {
    const retryRendition = vi.fn(async () => {
      throw refused(403, 'forbidden', 'not_your_message')
    })
    const f = office([{ state: 'skipped', reason: 'unsupported' }], { retryRendition })
    await open([f])
    $('.file-viewer__note-retry')!.click()
    await flushPromises()
    await flushPromises()
    expect(messages().join()).toContain(
      'It could not be sent to be converted again: Only whoever sent the file, and staff who decide for the one who asked, may have it converted again.',
    )
    expect($('.file-viewer__note-title')!.textContent).toBe('It could not be converted to PDF')
    expect(f.readRendition).toHaveBeenCalledTimes(1)
  })

  it('says a retry that needs someone’s confirmation waits for it', async () => {
    const retryRendition = vi.fn(async () => ({
      status: 'proposed' as const,
      actionId: 'a2',
      reviewState: 'none' as const,
      replayed: false,
    }))
    const f = office([{ state: 'failed', reason: 'timeout' }], { retryRendition })
    await open([f])
    $('.file-viewer__note-retry')!.click()
    await flushPromises()
    expect(notifications().join()).toContain('Sent for approval')
    expect($('.file-viewer__note-title')!.textContent).toBe('It could not be converted to PDF')
  })

  it('offers a PDF too large to show to download, beside the file’s own', async () => {
    await open([office([{ ...doneRendition, byte_size: 200 << 20 }])])
    expect(fetched).toEqual([])
    expect($('.file-viewer__note-title')!.textContent).toBe('Too large to preview')
    expect($('.file-viewer__download-pdf')).not.toBeNull()
  })

  it('from a Core without renditions (none listed), shows the text version as before, asking nothing of a PDF', async () => {
    const f = file('essay.docx', DOCX, 'PK', {
      readText: async () => done('The essay, as text.'),
      readRendition: vi.fn(async () => null),
    })
    await open([f])
    expect(f.readRendition).not.toHaveBeenCalled()
    expect($('.file-viewer__paper')!.textContent).toContain('The essay, as text.')
    expect($('.file-viewer__download-pdf')).toBeNull()
    expect($('.file-viewer__body')!.dataset.rendition).toBeUndefined()
  })

  it('where the rendition listed is gone when read, falls back to what an Office file is shown as', async () => {
    const f = office([null], { readText: async () => done('The essay, as text.') })
    await open([f])
    expect(f.readRendition).toHaveBeenCalledTimes(1)
    expect($('.file-viewer__paper')!.textContent).toContain('The essay, as text.')
  })
})
