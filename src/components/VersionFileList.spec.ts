import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { DocumentFile, TextVersion } from '@/api/types'

// document.file answers with a fresh URL on Core's own store, named as the file; the Word
// file's with its PDF rendition too, done, with a URL that shows it.
const asked: Record<string, unknown>[] = []
const written: Record<string, unknown>[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      asked.push({ tool, ...args })
      if (tool !== 'document.file') throw new Error(`no answer for ${tool}`)
      return {
        id: args.file_id,
        filename: `${args.file_id}-name`,
        download_url: `${window.location.origin}/v1/blobs/get-${args.file_id}?sig=x`,
        expires_at: '2026-09-30T00:15:00Z',
        ...(args.file_id === 'f-2'
          ? {
              rendition: {
                state: 'done',
                page_count: 3,
                byte_size: 9_000,
                download_url: `${window.location.origin}/v1/blobs/pdf-f-2?sig=y`,
              },
            }
          : {}),
      }
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      written.push({ tool, ...args })
      return {
        status: 'executed',
        actionId: 'a1',
        reviewState: 'none',
        replayed: false,
        result: { changed: true, rendition_id: 'r', state: 'queued' },
      }
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const { i18n, setLocale } = await import('@/i18n')
const { default: VersionFileList } = await import('./VersionFileList.vue')
const { closePreview, previewState } = await import('./preview/viewer')

beforeEach(() => {
  asked.length = 0
  written.length = 0
  setActivePinia(createPinia())
  setLocale('en')
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const text = (status: string): TextVersion => ({ status, revision: 1, bytes: 0, updated_at: '2026-09-30T00:00:00Z' })
const FILES: DocumentFile[] = [
  { id: 'f-1', position: 1, filename: 'week3-slides.pdf', content_type: 'application/pdf', byte_size: 2_048_000, text: text('done') },
  {
    id: 'f-2',
    position: 2,
    filename: 'handout.docx',
    content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    byte_size: 30_000,
    text: text('pending'),
    rendition: { state: 'done' },
  },
  { id: 'f-3', position: 3, filename: 'loops.py', content_type: 'text/x-python', byte_size: 120, checksum: 'sha256:44c38a1b2c3d4e5f' },
]

function list(props: Record<string, unknown> = {}) {
  return mount(VersionFileList, {
    props: { courseId: 'c-1', documentId: 'd-1', versionId: 'v-1', files: FILES, ...props },
    global: { plugins: [createPinia(), i18n, ElementPlus], components: icons },
    attachTo: document.body,
  })
}

describe('VersionFileList', () => {
  it('lists the files in order, each with an icon by its type, its name, what it is and its size', () => {
    const w = list()
    const rows = w.findAll('.version-file')
    expect(rows.map((r) => r.attributes('data-file'))).toEqual(['week3-slides.pdf', 'handout.docx', 'loops.py'])
    expect(rows.map((r) => r.find('.version-file__icon').classes())).toEqual([
      expect.arrayContaining(['is-pdf']),
      expect.arrayContaining(['is-word']),
      expect.arrayContaining(['is-text']),
    ])
    expect(rows[0]!.find('.version-file__meta').text()).toBe('PDF · 2 MB')
    expect(rows[1]!.find('.version-file__meta > span').text()).toBe('Document · 29.3 KB')
    expect(rows[2]!.find('.version-file__open').attributes('aria-label')).toBe('Preview “loops.py” (Text · 120 B)')
    expect(rows[2]!.find('.version-file__open').attributes('title')).toContain('sha256 44c38a1b2c3d')
    expect(rows[2]!.find('.version-file__get').attributes('aria-label')).toBe('Download “loops.py”')
    // Nothing of text versions unless asked.
    expect(w.find('.version-file__status').exists()).toBe(false)
  })

  it('downloads each under its name, from a fresh URL asked for on the click', async () => {
    const clicked: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download })
    })
    const w = list()
    await w.findAll('.version-file__get')[1]!.trigger('click')
    await flushPromises()
    expect(asked).toEqual([{ tool: 'document.file', course_id: 'c-1', document_id: 'd-1', file_id: 'f-2' }])
    expect(clicked).toEqual([{ href: '/v1/blobs/get-f-2?sig=x', download: 'f-2-name' }])
  })

  it('opens a file in the viewer, among the version’s others, which asks for a fresh URL only as it shows one', async () => {
    const w = list({ docTitle: 'Week 3 — Loops', date: '2026-09-30T08:00:00Z' })
    await w.findAll('.version-file__open')[2]!.trigger('click')
    const state = previewState()
    expect(state.open).toBe(true)
    expect(state.index).toBe(2)
    expect(state.title).toBe('Week 3 — Loops')
    expect(state.courseId).toBe('c-1')
    expect(state.files.map((f) => f.filename)).toEqual(['week3-slides.pdf', 'handout.docx', 'loops.py'])
    expect(state.files[0]!.date).toBe('2026-09-30T08:00:00Z')
    // A file of material has a text version to read; nothing is asked for until the viewer shows one.
    expect(state.files[1]!.readText).toBeTypeOf('function')
    expect(state.files[2]!.readText).toBeUndefined()
    expect(asked).toEqual([])
    expect(await state.files[2]!.url()).toBe(`${window.location.origin}/v1/blobs/get-f-3?sig=x`)
    expect(asked).toEqual([{ tool: 'document.file', course_id: 'c-1', document_id: 'd-1', file_id: 'f-3' }])
    closePreview()
  })

  it('says where each file’s text version stands, and opens it, where the tab is shown', async () => {
    const w = list({ textStatus: true, transcriptionOn: true, openText: true })
    const chips = w.findAll('.version-file').map((r) => r.find('.version-file__status'))
    expect(chips.map((c) => (c.exists() ? c.text() : null))).toEqual(['Done', 'Queued', null])
    await w.findAll('.version-file__text-link')[0]!.trigger('click')
    expect(w.emitted('text')?.[0]?.[0]).toMatchObject({ id: 'f-1' })
    // A text waiting for a transcriber that is off is not said to be waiting.
    await w.setProps({ transcriptionOn: false })
    expect(w.findAll('.version-file__status').map((c) => c.text())).toEqual(['Done'])
  })

  it('marks a file whose PDF the server has made, and none other', () => {
    const w = list()
    const tags = w.findAll('.version-file').map((r) => r.find('.version-file__pdf'))
    expect(tags.map((t) => t.exists())).toEqual([false, true, false])
    expect(tags[1]!.text()).toBe('PDF')
    expect(tags[1]!.attributes('title')).toBe('Previewed as the PDF the server made of it')
    expect(w.findAll('.version-file__open')[1]!.attributes('aria-label')).toBe(
      'Preview “handout.docx” (Document · 29.3 KB · PDF)',
    )
    // One waiting, or failed, is not marked: the viewer says where it stands.
    const waiting = list({ files: [{ ...FILES[1]!, rendition: { state: 'queued' } }] })
    expect(waiting.find('.version-file__pdf').exists()).toBe(false)
  })

  it('reads a file’s rendition afresh from document.file, and sends it back only where the caller may write', async () => {
    const w = list()
    await w.findAll('.version-file__open')[1]!.trigger('click')
    let state = previewState()
    const handout = state.files[1]!
    expect(handout.rendition).toEqual({ state: 'done' })
    expect(asked).toEqual([])
    expect(await handout.readRendition!()).toMatchObject({
      state: 'done',
      page_count: 3,
      download_url: `${window.location.origin}/v1/blobs/pdf-f-2?sig=y`,
    })
    expect(asked).toEqual([{ tool: 'document.file', course_id: 'c-1', document_id: 'd-1', file_id: 'f-2' }])
    // None for the PDF: Core converts it not.
    expect(await state.files[0]!.readRendition!()).toBeNull()
    expect(state.files[0]!.rendition).toBeNull()
    // Not the caller's to send back.
    expect(handout.retryRendition).toBeUndefined()
    closePreview()

    await w.setProps({ retryRenditions: true })
    await w.findAll('.version-file__open')[1]!.trigger('click')
    state = previewState()
    // Only a file that has a rendition is sent back.
    expect(state.files[0]!.retryRendition).toBeUndefined()
    const out = await state.files[1]!.retryRendition!()
    expect(out.status).toBe('executed')
    expect(written).toEqual([
      { tool: 'document.rendition_retry', course_id: 'c-1', document_id: 'd-1', file_id: 'f-2' },
    ])
    closePreview()
  })
})
