import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { UploadedFile, UploadOptions } from '@/api/http'

interface Call {
  file: File
  opts: UploadOptions
  resolve: (v: UploadedFile) => void
  reject: (e: unknown) => void
}
const calls: Call[] = []
let limit: number | null = 1_000_000
let maxFiles: number | null = null
let maxVersionBytes: number | null = null

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    knownUploadLimits: () => null,
    uploadLimits: vi.fn(async () =>
      limit ? { maxBytes: limit, maxFiles: maxFiles, maxConversationBytes: null, maxVersionBytes: maxVersionBytes } : null,
    ),
    uploadFile: vi.fn(
      (_c: string, _k: string, file: File, opts: UploadOptions) =>
        new Promise<UploadedFile>((resolve, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
          calls.push({ file, opts, resolve, reject })
        }),
    ),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { ElMessage } = await import('element-plus')
const { default: FileDropZone } = await import('./FileDropZone.vue')

let phone = false
beforeEach(() => {
  calls.length = 0
  limit = 1_000_000
  maxFiles = null
  maxVersionBytes = null
  phone = false
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('max-width: 640px') ? phone : false,
    media,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
  setActivePinia(createPinia())
  setLocale('en')
  vi.mocked(ElMessage).mockClear()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const file = (name: string, size = 100) => new File([new Uint8Array(size)], name, { type: 'text/plain' })
const done = (c: Call): UploadedFile => ({
  uploadToken: `tok-${c.file.name}`,
  fileName: c.file.name,
  contentType: 'text/plain',
  size: c.file.size,
})

async function zone(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const w = mount(FileDropZone, {
    slots: slots as never,
    props: {
      courseId: 'c-1',
      kind: 'submission' as const,
      modelValue: [],
      'onUpdate:modelValue': (v: UploadedFile[]) => w.setProps({ modelValue: v }),
      uploading: false,
      'onUpdate:uploading': (v: boolean) => w.setProps({ uploading: v }),
      ...props,
    },
    global: { plugins: [createPinia(), i18n, ElementPlus], components: icons },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}

/** Drops files on an element, as a browser does. */
async function drop(el: Element, files: File[]) {
  const dataTransfer = {
    types: ['Files'],
    files,
    items: files.map((f) => ({ kind: 'file', getAsFile: () => f, webkitGetAsEntry: () => ({ isDirectory: false }) })),
    dropEffect: 'none',
  }
  for (const type of ['dragenter', 'dragover', 'drop']) {
    const e = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'dataTransfer', { value: dataTransfer })
    el.dispatchEvent(e)
  }
  await flushPromises()
}

describe('FileDropZone', () => {
  it('says what it takes, and how large a file may be', async () => {
    const w = await zone({ multiple: true })
    const z = w.find('.file-drop__zone')
    expect(z.attributes('role')).toBe('button')
    expect(z.attributes('tabindex')).toBe('0')
    expect(z.attributes('aria-label')).toContain('Upload files')
    expect(z.text()).toContain('Drop files here, or choose files')
    expect(z.text()).toContain('Up to 976.6 KB each')
  })

  it('uploads what is dropped on it, lists each with its progress, and gives the uploads to v-model', async () => {
    const w = await zone({ multiple: true })
    await drop(w.find('.file-drop__zone').element, [file('a.txt'), file('b.txt')])
    expect(calls.map((c) => c.file.name)).toEqual(['a.txt', 'b.txt'])
    expect(w.props('uploading')).toBe(true)
    expect(w.findAll('.file-drop__item')).toHaveLength(2)

    calls[0]!.opts.onProgress!({
      phase: 'sending',
      loaded: 50,
      total: 100,
      fraction: 0.5,
      bytesPerSecond: 2048,
      secondsLeft: 3,
      attempt: 1,
    })
    await flushPromises()
    expect(w.find('.file-drop__item').text()).toContain('50 % · 50 B of 100 B · 2 KB/s · about 3 s left')

    calls[0]!.resolve(done(calls[0]!))
    calls[1]!.resolve(done(calls[1]!))
    await flushPromises()
    expect((w.props('modelValue') as UploadedFile[]).map((f) => f.uploadToken)).toEqual(['tok-a.txt', 'tok-b.txt'])
    expect(w.props('uploading')).toBe(false)
    expect(w.emitted('uploaded')).toHaveLength(2)
    expect(w.find('[role=status]').text()).toContain('“b.txt” uploaded.')

    // Taking one off the list takes it out of v-model too.
    await w.find('[aria-label="Remove “a.txt”"]').trigger('click')
    expect((w.props('modelValue') as UploadedFile[]).map((f) => f.fileName)).toEqual(['b.txt'])
    // And one the caller takes out of v-model leaves the list.
    await w.setProps({ modelValue: [] })
    await flushPromises()
    expect(w.findAll('.file-drop__item')).toHaveLength(0)
  })

  it('shows what the caller puts beside each file, given its item', async () => {
    const w = await zone(
      { multiple: true },
      {
        item: (p: { item: { name: string; status: string } | null }) =>
          h('span', { class: 'extra' }, `${p.item?.name}: ${p.item?.status}`),
      },
    )
    await drop(w.find('.file-drop__zone').element, [file('a.txt')])
    expect(w.find('.extra').text()).toBe('a.txt: uploading')
  })

  it('fails a file over the limit at once, and says so, without sending it', async () => {
    limit = 150
    const w = await zone({ multiple: true })
    await drop(w.find('.file-drop__zone').element, [file('big.pdf', 1_000), file('small.txt', 100)])
    expect(calls.map((c) => c.file.name)).toEqual(['small.txt'])
    const big = w.find('[data-file="big.pdf"]')
    expect(big.classes()).toContain('is-failed')
    expect(big.text()).toContain('Too large to upload: it is 1,000 B, and a file can be at most 150 B.')
    // No trying again: only taking it off.
    expect(big.find('[aria-label="Upload “big.pdf” again"]').exists()).toBe(false)
    expect(big.find('[aria-label="Remove “big.pdf”"]').exists()).toBe(true)
  })

  it('holds one version’s files to what a version holds, and says so, before any is sent', async () => {
    limit = 1_000
    maxFiles = 2
    maxVersionBytes = 500
    const w = await zone({ multiple: true, version: true, kind: 'material' })
    expect(w.find('.file-drop__zone').text()).toContain('Up to 2 files, 1,000 B each, 500 B in all')
    await drop(w.find('.file-drop__zone').element, [
      file('a.pdf', 300),
      file('b.docx', 300),
      file('c.txt', 100),
      file('d.txt', 100),
    ])
    // a fits; b would make 600 B of 500; c fits (2 files); d is a third.
    expect(calls.map((c) => c.file.name)).toEqual(['a.pdf', 'c.txt'])
    expect(w.find('[data-file="b.docx"]').text()).toContain(
      'Not uploaded: with it, the files would come to more than a version holds in all (500 B).',
    )
    expect(w.find('[data-file="d.txt"]').text()).toContain('Not uploaded: a version holds at most 2 files.')
    // Room is made by taking one off: the one left out can be tried again then.
    for (const c of calls) c.resolve(done(c))
    await flushPromises()
    await w.find('[aria-label="Remove “c.txt”"]').trigger('click')
    await w.find('[aria-label="Upload “d.txt” again"]').trigger('click')
    await flushPromises()
    expect(calls.map((c) => c.file.name)).toEqual(['a.pdf', 'c.txt', 'd.txt'])
  })

  it('numbers the files and moves them up or down, and v-model follows the order listed', async () => {
    const w = await zone({ multiple: true, reorder: true })
    await drop(w.find('.file-drop__zone').element, [file('a.txt'), file('b.txt'), file('c.txt')])
    for (const c of calls) c.resolve(done(c))
    await flushPromises()
    const names = () => w.findAll('.file-drop__item').map((li) => li.attributes('data-file'))
    expect(w.find('.file-drop__list').element.tagName).toBe('OL')
    expect(w.findAll('.file-drop__n').map((n) => n.text())).toEqual(['1', '2', '3'])
    // The first cannot go up, nor the last down.
    expect(w.find('[aria-label="Move “a.txt” up"]').attributes('disabled')).toBeDefined()
    expect(w.find('[aria-label="Move “c.txt” down"]').attributes('disabled')).toBeDefined()

    await w.find('[aria-label="Move “c.txt” up"]').trigger('click')
    await flushPromises()
    expect(names()).toEqual(['a.txt', 'c.txt', 'b.txt'])
    expect((w.props('modelValue') as UploadedFile[]).map((f) => f.fileName)).toEqual(['a.txt', 'c.txt', 'b.txt'])
    expect(w.find('[role=status]').text()).toContain('“c.txt” is file 2 of 3 now.')
    await w.find('[aria-label="Move “a.txt” down"]').trigger('click')
    await flushPromises()
    expect(names()).toEqual(['c.txt', 'a.txt', 'b.txt'])
    expect((w.props('modelValue') as UploadedFile[]).map((f) => f.fileName)).toEqual(['c.txt', 'a.txt', 'b.txt'])
  })

  it('cancels an upload, and tries a failed one again', async () => {
    const w = await zone({ multiple: true })
    await drop(w.find('.file-drop__zone').element, [file('a.txt')])
    await w.find('[aria-label="Cancel uploading “a.txt”"]').trigger('click')
    await flushPromises()
    expect(w.find('.file-drop__item').text()).toContain('Cancelled')
    expect(w.props('uploading')).toBe(false)

    await w.find('[aria-label="Upload “a.txt” again"]').trigger('click')
    await flushPromises()
    expect(calls).toHaveLength(2)
    calls[1]!.reject(new ApiError({ status: 0, code: 'network', message: 'upload failed: network error' }))
    await flushPromises()
    expect(w.find('.file-drop__item').text()).toContain('Cannot reach the server')
    expect(w.find('[role=status]').text()).toContain('“a.txt” was not uploaded')
    await w.find('[aria-label="Upload “a.txt” again"]').trigger('click')
    await flushPromises()
    expect(calls).toHaveLength(3)
  })

  it('takes one file only, without multiple: a new one takes the place of the one there', async () => {
    const w = await zone()
    await drop(w.find('.file-drop__zone').element, [file('a.txt')])
    calls[0]!.resolve(done(calls[0]!))
    await flushPromises()
    await drop(w.find('.file-drop__zone').element, [file('b.txt'), file('c.txt')])
    expect(ElMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Only one file goes here: “b.txt” was taken.' }),
    )
    expect(w.props('modelValue')).toEqual([])
    expect(w.findAll('.file-drop__item').map((li) => li.attributes('data-file'))).toEqual(['b.txt'])
  })

  it('opens the file picker from the keyboard, and takes a file pasted into it', async () => {
    const w = await zone({ multiple: true })
    const input = w.find('input[type=file]').element as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    await w.find('.file-drop__zone').trigger('keydown', { key: 'Enter' })
    expect(click).toHaveBeenCalledTimes(1)
    await w.find('.file-drop__zone').trigger('keydown', { key: ' ' })
    expect(click).toHaveBeenCalledTimes(2)

    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [file('shot.png')] } })
    w.find('.file-drop__zone').element.dispatchEvent(paste)
    await flushPromises()
    expect(paste.defaultPrevented).toBe(true)
    expect(calls.map((c) => c.file.name)).toEqual(['shot.png'])
  })

  it('takes files dropped anywhere on the page, with page-drop', async () => {
    const w = await zone({ multiple: true, pageDrop: true })
    await drop(document.body, [file('anywhere.pdf')])
    expect(calls.map((c) => c.file.name)).toEqual(['anywhere.pdf'])
    expect(w.emitted('added')).toHaveLength(1)
  })

  it('takes nothing while disabled', async () => {
    const w = await zone({ multiple: true, disabled: true, pageDrop: true })
    expect(w.find('.file-drop__zone').attributes('tabindex')).toBe('-1')
    await drop(w.find('.file-drop__zone').element, [file('a.txt')])
    await drop(document.body, [file('b.txt')])
    expect(calls).toHaveLength(0)
  })

  it('is a big button to choose files on a phone', async () => {
    phone = true
    const w = await zone({ multiple: true })
    expect(w.find('.file-drop__zone').exists()).toBe(false)
    const button = w.find('.file-drop__big')
    expect(button.text()).toBe('Choose files')
    const click = vi.spyOn(w.find('input[type=file]').element as HTMLInputElement, 'click')
    await button.trigger('click')
    expect(click).toHaveBeenCalled()
  })
})
