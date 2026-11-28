import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { MessageAttachment } from '@/api/types'

const coreCalls: string[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      coreCalls.push(tool)
      throw new Error(`Core chat attachment call: ${tool}`)
    }),
    write: vi.fn(async (tool: string) => {
      coreCalls.push(tool)
      throw new Error(`Core chat attachment call: ${tool}`)
    }),
  }
})

let bytesError: unknown = null
const byteReads: { courseId: string; id: string; filename?: string }[] = []
vi.mock('@/api/runtimeChat', async (orig) => {
  const real = await orig<typeof import('@/api/runtimeChat')>()
  return {
    ...real,
    downloadChatAttachmentBytes: vi.fn(async (courseId: string, id: string, opts?: { filename?: string }) => {
      byteReads.push({ courseId, id, filename: opts?.filename })
      if (bytesError) throw bytesError
      return {
        blob: new Blob(['AR bytes'], { type: 'image/png' }),
        filename: opts?.filename ?? `${id}.png`,
        contentType: 'image/png',
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
  filename: 'notes.txt',
  content_type: 'text/plain',
  byte_size: 12,
  created_at: '2026-09-30T10:00:00Z',
  ...over,
})

let urls = 0
beforeEach(() => {
  setLocale('en')
  coreCalls.length = 0
  byteReads.length = 0
  bytesError = null
  urls = 0
  URL.createObjectURL = vi.fn(() => `blob:local/${++urls}`)
  URL.revokeObjectURL = vi.fn()
  document.querySelectorAll('.el-notification, .el-message').forEach((n) => n.remove())
})
afterEach(() => forgetThumbnails())
enableAutoUnmount(afterEach)

describe('ChatMessageFiles over AR attachments', () => {
  it('downloads the AR bytes under their safe name without another page or any Core call', async () => {
    const clicks: { href: string; download: string; target: string }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download, target: this.target })
    })
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files: [file()] }, global })
    expect(byteReads).toEqual([])
    const get = w.get('.msg-file__get')
    expect(get.attributes('aria-label')).toBe('Download “notes.txt”')
    await get.trigger('click')
    await flushPromises()
    expect(byteReads).toEqual([{ courseId: 'k1', id: 'f1', filename: 'notes.txt' }])
    expect(clicks).toEqual([{ href: 'blob:local/1', download: 'notes.txt', target: '' }])
    expect(coreCalls).toEqual([])
    await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local/1'))
    click.mockRestore()
  })

  it('says AR’s refusal in the existing attachment words', async () => {
    bytesError = new ApiError({ status: 404, code: 'not_found', message: 'retracted', details: { reason: 'retracted' } })
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files: [file()] }, global })
    await w.get('.msg-file__get').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('This file was withdrawn with its message.')
  })

  it('opens a file in the viewer among the message’s others, resolving its AR object URL only when asked', async () => {
    const files = [file(), file({ id: 'f2', filename: 'data.txt', content_type: 'text/plain', byte_size: 12 })]
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files }, global })
    const open = w.findAll('.msg-file__open')
    expect(open[1]!.attributes('aria-label')).toBe('Preview “data.txt” (Text · 12 B)')
    await open[1]!.trigger('click')
    await flushPromises()
    const state = previewState()
    expect(state.open).toBe(true)
    expect(state.index).toBe(1)
    expect(state.courseId).toBe('k1')
    expect(state.files.map((f) => [f.filename, f.contentType, f.byteSize, f.rendition])).toEqual([
      ['notes.txt', 'text/plain', 12, null],
      ['data.txt', 'text/plain', 12, null],
    ])
    expect(byteReads).toEqual([])
    expect(await state.files[1]!.url()).toBe('blob:local/1')
    expect(byteReads).toEqual([{ courseId: 'k1', id: 'f2', filename: undefined }])
    expect(state.files[1]!.readRendition).toBeUndefined()
    expect(state.files[1]!.retryRendition).toBeUndefined()
    expect(coreCalls).toEqual([])
    closePreview()
  })

  it('shows a small AR image from an object URL once, and leaves a large one as an icon', async () => {
    const files = [
      file({ id: 'p1', filename: 'plot.png', content_type: 'image/png', byte_size: 40_000 }),
      file({ id: 'p2', filename: 'scan.jpg', content_type: 'image/jpeg', byte_size: 30 << 20 }),
      file({ id: 'd1' }),
    ]
    const w = mount(ChatMessageFiles, { props: { courseId: 'k1', files }, global })
    await flushPromises()
    await flushPromises()
    expect(byteReads).toEqual([{ courseId: 'k1', id: 'p1', filename: undefined }])
    const imgs = w.findAll('img.msg-file__thumb')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]!.attributes('src')).toBe('blob:local/1')
    expect(imgs[0]!.attributes('alt')).toBe('')
    expect(w.findAll('.msg-file')[1]!.find('.msg-file__icon.is-image').exists()).toBe(true)

    const again = mount(ChatMessageFiles, { props: { courseId: 'k1', files: [files[0]!] }, global })
    await flushPromises()
    expect(byteReads).toHaveLength(1)
    expect(again.get('img').attributes('src')).toBe('blob:local/1')
  })

  it('keeps the icon where the AR thumbnail cannot be had', async () => {
    bytesError = new ApiError({ status: 404, code: 'not_found', message: 'gone', details: { reason: 'not_found' } })
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
