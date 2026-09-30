import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { UploadedFile, UploadOptions } from '@/api/http'

// Every upload is done at once; every write is kept, and executed.
const writes: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    knownUploadLimits: () => null,
    uploadLimits: vi.fn(async () => ({
      maxBytes: 1_000_000,
      maxFiles: 20,
      maxConversationBytes: null,
      maxVersionBytes: 200_000_000,
    })),
    uploadFile: vi.fn(async (_c: string, _k: string, file: File, _o: UploadOptions): Promise<UploadedFile> => ({
      uploadToken: `tok-${file.name}`,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    })),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      const n = writes.length
      return {
        status: 'executed',
        actionId: `act-${n}`,
        reviewState: 'none',
        result: { document_id: `doc-${n}`, version_id: `ver-${n}` },
        replayed: false,
      }
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const { i18n, setLocale } = await import('@/i18n')
const { default: MaterialCreateDialog } = await import('./MaterialCreateDialog.vue')

beforeEach(() => {
  writes.length = 0
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
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const file = (name: string) => new File(['x'.repeat(10)], name, { type: 'application/pdf' })

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
          upload_token: 'tok-Week 5 — Trees.pdf',
          body_md: '## Reading guide\n\nStart with **section 2**.',
        },
      },
    ])
    expect(w.emitted('created')).toEqual([[['doc-1']]])
  })

  it('makes one material of each of several files, without text, which it says goes with one file', async () => {
    const w = await dialog([file('a.pdf'), file('b.pdf')])
    expect($('.doc-text')).toBeNull()
    expect(document.body.textContent).toContain('A text note goes with a single file')
    buttonNamed('Create 2 materials')!.click()
    await flushPromises()
    expect(writes.map((x) => [x.args.title, x.args.sort_order, x.args.upload_token, x.args.body_md])).toEqual([
      ['a', 5, 'tok-a.pdf', undefined],
      ['b', 6, 'tok-b.pdf', undefined],
    ])
    expect(w.emitted('created')).toEqual([[['doc-1', 'doc-2']]])
  })

  it('keeps text written while there were several files, and uses it once one is left', async () => {
    await dialog([file('a.pdf')])
    buttonNamed('Add a text note (optional)')!.click()
    await flushPromises()
    await typeText('Notes for a.')
    await drop([file('b.pdf')])
    expect(document.body.textContent).toContain('The text written goes with a single file')
    ;($('[aria-label="Remove “b.pdf”"]') as HTMLButtonElement).click()
    await flushPromises()
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes.map((x) => [x.args.title, x.args.body_md])).toEqual([['a', 'Notes for a.']])
  })

  it('writes material that is text alone, and takes its title and text to a file dropped then', async () => {
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
    // A file dropped while writing: the file comes first again, and the
    // title and text go with it.
    await drop([file('ch5.pdf')])
    expect(($('[aria-label="Title for “ch5.pdf”"]') as HTMLInputElement).value).toBe('Week 5 — Reading')
    expect($('.doc-text__editor')!.style.display).toBe('')
    buttonNamed('Create')!.click()
    await flushPromises()
    expect(writes.map((x) => [x.args.title, x.args.upload_token, x.args.body_md])).toEqual([
      ['Week 5 — Reading', 'tok-ch5.pdf', 'Read chapter 5.'],
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
