import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { UploadedFile, UploadLimits, UploadOptions } from '@/api/http'

// Every upload is done at once, unless it is larger than Core takes; every
// write is kept, and answered as the test says (executed by default).
const writes: { tool: string; args: Record<string, unknown> }[] = []
const uploads: string[] = []
let limits: UploadLimits
let answer: (tool: string, args: Record<string, unknown>, n: number) => unknown
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    knownUploadLimits: () => null,
    uploadLimits: vi.fn(async () => limits),
    uploadFile: vi.fn(async (_c: string, _k: string, file: File, _o: UploadOptions): Promise<UploadedFile> => {
      uploads.push(file.name)
      return {
        uploadToken: `tok-${file.name}-${uploads.length}`,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      }
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      const out = answer(tool, args, writes.length)
      if (out instanceof Error) throw out
      return out
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { ElMessage } = await import('element-plus')
const { default: MaterialCreateDialog } = await import('./MaterialCreateDialog.vue')

const executed = (n: number) => ({
  status: 'executed',
  actionId: `act-${n}`,
  reviewState: 'none',
  result: { document_id: `doc-${n}`, version_id: `ver-${n}` },
  replayed: false,
})

beforeEach(() => {
  writes.length = 0
  uploads.length = 0
  limits = { maxBytes: 1_000_000, maxFiles: 20, maxConversationBytes: null, maxVersionBytes: 200_000_000 }
  answer = (_tool, _args, n) => executed(n)
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
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

const file = (name: string, size = 10, type = 'application/pdf') => new File(['x'.repeat(size)], name, { type })

async function dialog(files: File[] = []) {
  const w = mount(MaterialCreateDialog, {
    props: { modelValue: true, courseId: 'c-1', suggestedOrder: 5, files },
    global: { plugins: [createPinia(), i18n, ElementPlus], components: icons },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel)
const buttonNamed = (name: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name)
const rowNames = () => [...document.body.querySelectorAll('.file-drop__item')].map((li) => li.getAttribute('data-file'))

async function drop(files: File[]) {
  const e = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'dataTransfer', {
    value: { types: ['Files'], files, items: files.map((f) => ({ kind: 'file', getAsFile: () => f })) },
  })
  $('.file-drop__zone')!.dispatchEvent(e)
  await flushPromises()
}

async function typeText(text: string) {
  const area = $('.doc-text textarea') as HTMLTextAreaElement
  area.value = text
  area.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function typeTitle(text: string) {
  const input = $('#create-dialog-title') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('New material', () => {
  it('makes one material of a file and the text written under it', async () => {
    const w = await dialog()
    await drop([file('Week 5 — Trees.pdf')])
    // The text is folded away under the file until it is wanted.
    expect($('.doc-text__editor')!.style.display).toBe('none')
    buttonNamed('Add a text note (optional)')!.click()
    await flushPromises()
    await typeText('## Reading guide\n\nStart with **section 2**.')
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'document.create',
        args: {
          course_id: 'c-1',
          kind: 'material',
          title: 'Week 5 — Trees',
          sort_order: 5,
          files: [{ upload_token: 'tok-Week 5 — Trees.pdf-1', filename: 'Week 5 — Trees.pdf' }],
          body_md: '## Reading guide\n\nStart with **section 2**.',
        },
      },
    ])
    expect(w.emitted('created')).toEqual([[['doc-1']]])
  })

  it('makes one material of several files, in the order listed, with the text, titled after the first', async () => {
    const w = await dialog([file('slides.pdf'), file('handout.docx'), file('loops.py', 10, 'text/x-python')])
    expect(rowNames()).toEqual(['slides.pdf', 'handout.docx', 'loops.py'])
    expect(document.body.textContent).toContain('The files all go into this one material, in the order listed')
    expect(($('#create-dialog-title') as HTMLInputElement).value).toBe('slides')
    expect(document.body.textContent).toContain('Named after the first file until you change it.')
    // The text note goes with them all.
    buttonNamed('Add a text note (optional)')!.click()
    await flushPromises()
    await typeText('Read the slides first.')
    // Put in another order: the program first, then the handout taken off.
    ;($('[aria-label="Move “loops.py” up"]') as HTMLButtonElement).click()
    await flushPromises()
    ;($('[aria-label="Move “loops.py” up"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(rowNames()).toEqual(['loops.py', 'slides.pdf', 'handout.docx'])
    ;($('[aria-label="Remove “handout.docx”"]') as HTMLButtonElement).click()
    await flushPromises()
    // The title follows the first file, until it is written.
    expect(($('#create-dialog-title') as HTMLInputElement).value).toBe('loops')
    await typeTitle('Week 3 — Loops')
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes.map((x) => x.args)).toEqual([
      {
        course_id: 'c-1',
        kind: 'material',
        title: 'Week 3 — Loops',
        sort_order: 5,
        files: [
          { upload_token: 'tok-loops.py-3', filename: 'loops.py' },
          { upload_token: 'tok-slides.pdf-1', filename: 'slides.pdf' },
        ],
        body_md: 'Read the slides first.',
      },
    ])
    expect(w.emitted('created')).toEqual([[['doc-1']]])
  })

  it('publishes the one material once it is created, when asked', async () => {
    await dialog([file('a.pdf'), file('b.pdf')])
    ;(
      [...document.body.querySelectorAll('.el-checkbox')].find((c) =>
        c.textContent?.includes('Publish at once'),
      ) as HTMLElement
    ).click()
    await flushPromises()
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes.map((x) => x.tool)).toEqual(['document.create', 'document.publish'])
    expect(writes[1]!.args).toEqual({ course_id: 'c-1', document_id: 'doc-1', version_id: 'ver-1' })
  })

  it('uploads no file a version has no room for, and says why', async () => {
    limits = { maxBytes: 1_000, maxFiles: 2, maxConversationBytes: null, maxVersionBytes: 1_500 }
    await dialog([file('a.pdf', 900), file('b.pdf', 900), file('c.pdf', 400), file('d.pdf', 10), file('e.pdf', 2_000)])
    expect(uploads).toEqual(['a.pdf', 'c.pdf'])
    const text = (name: string) => $(`[data-file="${name}"]`)!.textContent
    expect(text('b.pdf')).toContain('the files would come to more than a version holds in all (1.5 KB)')
    expect(text('d.pdf')).toContain('Not uploaded: a version holds at most 2 files.')
    expect(text('e.pdf')).toContain('Too large to upload')
    expect(document.body.textContent).toContain('3 files were not uploaded')
    expect(document.body.querySelector('.file-drop__zone')!.textContent).toContain(
      'Up to 2 files, 1,000 B each, 1.5 KB in all',
    )
    // What was let in is created, without the rest.
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes[0]!.args.files).toEqual([
      { upload_token: 'tok-a.pdf-1', filename: 'a.pdf' },
      { upload_token: 'tok-c.pdf-2', filename: 'c.pdf' },
    ])
  })

  it('says Core’s refusal of a version too large in words, and learns the limit it names', async () => {
    answer = (_tool, _args, n) =>
      n === 1
        ? new ApiError({
            status: 422,
            code: 'failed_precondition',
            message: 'too large',
            details: { reason: 'version_too_large', byte_size: 30, max_version_bytes: 25 },
            actionStatus: 'failed',
          })
        : executed(n)
    const w = await dialog([file('a.pdf'), file('b.pdf'), file('c.pdf')])
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(vi.mocked(ElMessage).mock.calls.map((c) => (c[0] as { message: string }).message)).toContain(
      'The files come to 30 B, and a version holds at most 25 B in all: take some off the list, and save again.',
    )
    // Too much now: Create waits until one is taken off.
    expect(document.body.querySelector('.create-dialog__why')!.textContent).toContain(
      'These files come to 30 B, and a version holds at most 25 B in all',
    )
    ;($('[aria-label="Remove “c.pdf”"]') as HTMLButtonElement).click()
    await flushPromises()
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes).toHaveLength(2)
    expect((writes[1]!.args.files as unknown[]).length).toBe(2)
    expect(w.emitted('created')).toEqual([[['doc-2']]])
  })

  it('uploads again what Core no longer takes as uploaded, to create once it is up', async () => {
    answer = (_tool, _args, n) =>
      n === 1
        ? new ApiError({
            status: 422,
            code: 'failed_precondition',
            message: 'not uploaded',
            details: { reason: 'not_uploaded' },
            actionStatus: 'failed',
          })
        : executed(n)
    await dialog([file('a.pdf'), file('b.pdf')])
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(vi.mocked(ElMessage).mock.calls.map((c) => (c[0] as { message: string }).message)).toContain(
      'A file had not finished uploading.',
    )
    // Both went up again, at fresh URLs.
    expect(uploads).toEqual(['a.pdf', 'b.pdf', 'a.pdf', 'b.pdf'])
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes[1]!.args.files).toEqual([
      { upload_token: 'tok-a.pdf-3', filename: 'a.pdf' },
      { upload_token: 'tok-b.pdf-4', filename: 'b.pdf' },
    ])
  })

  it('writes material that is text alone, and takes its title and text to files dropped then', async () => {
    await dialog()
    buttonNamed('Write text instead')!.click()
    await flushPromises()
    const title = $('input[placeholder="e.g. Week 3 — Loops"]') as HTMLInputElement
    title.value = 'Week 5 — Reading'
    title.dispatchEvent(new Event('input'))
    const area = $('textarea') as HTMLTextAreaElement
    area.value = 'Read chapter 5.'
    area.dispatchEvent(new Event('input'))
    await flushPromises()
    // Files dropped while writing: they come first again, and the title and
    // text go with them.
    await drop([file('ch5.pdf'), file('ch5-exercises.pdf')])
    expect(($('#create-dialog-title') as HTMLInputElement).value).toBe('Week 5 — Reading')
    expect($('.doc-text__editor')!.style.display).toBe('')
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes.map((x) => [x.args.title, x.args.files, x.args.body_md])).toEqual([
      [
        'Week 5 — Reading',
        [
          { upload_token: 'tok-ch5.pdf-1', filename: 'ch5.pdf' },
          { upload_token: 'tok-ch5-exercises.pdf-2', filename: 'ch5-exercises.pdf' },
        ],
        'Read chapter 5.',
      ],
    ])
  })

  it('writes material that is text alone, with no file', async () => {
    await dialog()
    buttonNamed('Write text instead')!.click()
    await flushPromises()
    const title = $('input[placeholder="e.g. Week 3 — Loops"]') as HTMLInputElement
    title.value = 'Week 5 — Reading'
    title.dispatchEvent(new Event('input'))
    const area = $('textarea') as HTMLTextAreaElement
    area.value = 'Read chapter 5.'
    area.dispatchEvent(new Event('input'))
    await flushPromises()
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes.map((x) => x.args)).toEqual([
      { course_id: 'c-1', kind: 'material', title: 'Week 5 — Reading', sort_order: 5, body_md: 'Read chapter 5.' },
    ])
  })
})
