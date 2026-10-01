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
const { i18n, setLocale } = await import('@/i18n')
const { default: FileViewer } = await import('./FileViewer.vue')
const { closePreview, openPreview, previewState } = await import('./viewer')
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
})
