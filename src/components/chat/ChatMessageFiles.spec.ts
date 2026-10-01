import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { MessageAttachment } from '@/api/types'

const reads: { tool: string; args: Record<string, unknown> }[] = []
const writes: { tool: string; args: Record<string, unknown> }[] = []
let readAnswer: (tool: string, args: Record<string, unknown>) => unknown
const fetched: string[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push({ tool, args })
      return readAnswer(tool, args)
    }),
    fetchBlob: vi.fn(async (url: string) => {
      fetched.push(url)
      return new Blob(['png'], { type: 'image/png' })
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return {
        status: 'executed',
        actionId: 'a1',
        reviewState: 'none',
        replayed: false,
        result: { changed: true, rendition_id: 'r1', state: 'queued' },
      }
    }),
  }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { default: ChatMessageFiles } = await import('./ChatMessageFiles.vue')
const { forgetThumbnails } = await import('./attachments')
const { closePreview, previewState } = await import('@/components/preview/viewer')

const global = { plugins: [i18n, ElementPlus], components: icons }

const file = (over: Partial<MessageAttachment> = {}): MessageAttachment => ({
  id: 'f1',
  filename: 'notes.pdf',
  content_type: 'application/pdf',
  byte_size: 1_536,
  created_at: '2026-09-30T10:00:00Z',
  ...over,
})
/** conversation.attachment's answer: the file, and a short-lived URL on Core's own store. */
const attachment = (args: Record<string, unknown>, filename = 'notes.pdf') => ({
  id: args.attachment_id,
  filename,
  content_type: 'application/pdf',
  byte_size: 1_536,
  created_at: 'x',
  conversation_id: 'c1',
  message_id: 'm1',
  message_seq: 1,
  author_member_id: 'me',
  download_url: `http://core.test/v1/blobs/get-${args.attachment_id}`,
  expires_at: 'x',
})

let urls = 0
beforeEach(() => {
  setLocale('en')
  reads.length = 0
  writes.length = 0
  fetched.length = 0
  readAnswer = (_tool, args) => attachment(args)
  urls = 0
  URL.createObjectURL = vi.fn(() => `blob:local/${++urls}`)
  URL.revokeObjectURL = vi.fn()
  document.querySelectorAll('.el-notification, .el-message').forEach((n) => n.remove())
})
afterEach(() => forgetThumbnails())
enableAutoUnmount(afterEach)

describe('ChatMessageFiles', () => {
  it('downloads a file from a fresh URL asked for on the click, under its name, without leaving the page', async () => {
    const clicks: { href: string; download: string; target: string }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download, target: this.target })
    })
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files: [file()] }, global })
    expect(reads).toEqual([])
    const get = w.get('.msg-file__get')
    expect(get.attributes('aria-label')).toBe('Download “notes.pdf”')
    await get.trigger('click')
    await flushPromises()
    expect(reads).toEqual([{ tool: 'conversation.attachment', args: { course_id: 'k1', attachment_id: 'f1' } }])
    // Core's own store, through this origin: the download attribute names it, and no tab is opened.
    expect(clicks).toEqual([{ href: `${window.location.origin}/v1/blobs/get-f1`, download: 'notes.pdf', target: '' }])
    expect(document.querySelector('a[href$="/v1/blobs/get-f1"]')).toBeNull()
    click.mockRestore()
  })

  it('opens an object store’s URL in a tab of its own, which saves it under the name the store gives', async () => {
    readAnswer = (_t, args) => ({
      ...attachment(args),
      download_url: 'https://bucket.example/att/f1?X-Amz-Signature=s',
    })
    const clicks: { href: string; target: string; rel: string }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, target: this.target, rel: this.rel })
    })
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files: [file()] }, global })
    await w.get('.msg-file__get').trigger('click')
    await flushPromises()
    expect(clicks).toEqual([
      { href: 'https://bucket.example/att/f1?X-Amz-Signature=s', target: '_blank', rel: 'noopener' },
    ])
    click.mockRestore()
  })

  it('says why a file cannot be had: withdrawn with its message', async () => {
    readAnswer = () => {
      throw new ApiError({ status: 404, code: 'not_found', message: 'retracted', details: { reason: 'retracted' } })
    }
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files: [file()] }, global })
    await w.get('.msg-file__get').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('This file was withdrawn with its message.')
  })

  it('opens a file in the viewer, among the message’s others, fetched from a fresh URL only once it is shown', async () => {
    const files = [file(), file({ id: 'f2', filename: 'data.csv', content_type: 'text/csv', byte_size: 12 })]
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files }, global })
    const open = w.findAll('.msg-file__open')
    expect(open[1]!.attributes('aria-label')).toBe('Preview “data.csv” (Spreadsheet · 12 B)')
    await open[1]!.trigger('click')
    await flushPromises()
    const state = previewState()
    expect(state.open).toBe(true)
    expect(state.index).toBe(1)
    expect(state.courseId).toBe('k1')
    expect(state.files.map((f) => [f.filename, f.contentType, f.byteSize])).toEqual([
      ['notes.pdf', 'application/pdf', 1_536],
      ['data.csv', 'text/csv', 12],
    ])
    // Nothing is asked for until the viewer asks for it; then a fresh URL, each time.
    expect(reads).toEqual([])
    expect(await state.files[1]!.url()).toBe('http://core.test/v1/blobs/get-f2')
    expect(reads).toEqual([{ tool: 'conversation.attachment', args: { course_id: 'k1', attachment_id: 'f2' } }])
    closePreview()
  })

  it('marks an Office file whose PDF is made, reads its rendition afresh, and sends it back where the caller may', async () => {
    const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    const files = [
      file({ id: 's1', filename: 'slides.pptx', content_type: PPTX, rendition: { state: 'done', page_count: 4 } }),
      file({ id: 's2', filename: 'draft.pptx', content_type: PPTX, rendition: { state: 'failed', reason: 'timeout' } }),
      file(),
    ]
    readAnswer = (_tool, args) => ({
      ...attachment(args, 'slides.pptx'),
      rendition: { state: 'done', page_count: 4, download_url: 'http://core.test/v1/blobs/pdf-s1' },
    })
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files }, global })
    const tags = w.findAll('.msg-file').map((f) => f.find('.msg-file__pdf'))
    expect(tags.map((t) => t.exists())).toEqual([true, false, false])
    expect(w.findAll('.msg-file__open')[0]!.attributes('aria-label')).toBe(
      'Preview “slides.pptx” (Slides · 1.5 KB · PDF)',
    )

    await w.findAll('.msg-file__open')[1]!.trigger('click')
    let state = previewState()
    expect(state.files[1]!.rendition).toEqual({ state: 'failed', reason: 'timeout' })
    expect(state.files[2]!.rendition).toBeNull()
    expect(await state.files[0]!.readRendition!()).toMatchObject({ state: 'done', page_count: 4 })
    expect(reads).toEqual([{ tool: 'conversation.attachment', args: { course_id: 'k1', attachment_id: 's1' } }])
    // Not the caller's message to send back.
    expect(state.files[1]!.retryRendition).toBeUndefined()
    closePreview()

    await w.setProps({ retryRenditions: true })
    await w.findAll('.msg-file__open')[1]!.trigger('click')
    state = previewState()
    expect(state.files[2]!.retryRendition).toBeUndefined()
    await state.files[1]!.retryRendition!()
    expect(writes).toEqual([{ tool: 'conversation.rendition_retry', args: { course_id: 'k1', attachment_id: 's2' } }])
    closePreview()
  })

  it('shows a small image as a thumbnail, from an object URL of its bytes, and a large one by its icon', async () => {
    const files = [
      file({ id: 'p1', filename: 'plot.png', content_type: 'image/png', byte_size: 40_000 }),
      file({ id: 'p2', filename: 'scan.jpg', content_type: 'image/jpeg', byte_size: 30 << 20 }),
      file({ id: 'd1' }),
    ]
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files }, global })
    await flushPromises()
    await flushPromises()
    // Only the small image is fetched, once, from a fresh URL; the page's policy allows blob: images.
    expect(reads).toEqual([{ tool: 'conversation.attachment', args: { course_id: 'k1', attachment_id: 'p1' } }])
    expect(fetched).toEqual(['http://core.test/v1/blobs/get-p1'])
    const imgs = w.findAll('img.msg-file__thumb')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]!.attributes('src')).toBe('blob:local/1')
    expect(imgs[0]!.attributes('alt')).toBe('')
    expect(w.findAll('.msg-file')[1]!.find('.msg-file__icon.is-image').exists()).toBe(true)
    expect(w.findAll('.msg-file')[0]!.find('.msg-file__icon').exists()).toBe(false)

    // Shown again (the message scrolled back, another pane): not fetched again.
    const again = mount(ChatMessageFiles, { props: { courseId: 'k1', files: [files[0]!] }, global })
    await flushPromises()
    expect(fetched).toHaveLength(1)
    expect(again.get('img').attributes('src')).toBe('blob:local/1')
  })

  it('keeps the icon where the thumbnail cannot be had', async () => {
    readAnswer = () => {
      throw new ApiError({ status: 404, code: 'not_found', message: 'retracted', details: { reason: 'retracted' } })
    }
    const w = mount(ChatMessageFiles, {
      props: { courseId: 'k1', files: [file({ id: 'p1', filename: 'plot.png', content_type: 'image/png' })] },
      global,
    })
    await flushPromises()
    await flushPromises()
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('.msg-file__icon.is-image').exists()).toBe(true)
  })
})
