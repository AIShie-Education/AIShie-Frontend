import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { UploadedFile, UploadOptions } from '@/api/http'
import type { DocChoice } from './types'

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
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { default: DocChoiceField } = await import('./DocChoiceField.vue')

beforeEach(() => {
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
afterEach(() => vi.unstubAllGlobals())

function field(choice: Partial<DocChoice> = {}) {
  const w = mount(DocChoiceField, {
    props: {
      modelValue: { mode: 'new', title: '', body: '', files: [], publish: false, ...choice } as DocChoice,
      'onUpdate:modelValue': (v: DocChoice) => w.setProps({ modelValue: v }),
      courseId: 'c-1',
      kind: 'instructions' as const,
      options: [],
      allowNone: true,
      canCreate: true,
    },
    global: { plugins: [createPinia(), i18n, ElementPlus], components: icons },
  })
  return w
}
const choice = (w: ReturnType<typeof field>) => w.props('modelValue') as DocChoice

describe('a new instructions document', () => {
  it('is a file first, and a text note under it, which it holds both of', async () => {
    const w = field()
    await flushPromises()
    const zone = w.find('.file-drop__zone')
    const text = w.find('.doc-text')
    expect(zone.exists()).toBe(true)
    expect(zone.element.compareDocumentPosition(text.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(w.find('.doc-text__toggle').text()).toBe('Add a text note (optional)')

    const f = new File(['%PDF'], 'HW2 brief.pdf', { type: 'application/pdf' })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [f], items: [] } })
    zone.element.dispatchEvent(drop)
    await flushPromises()
    // Named from the file, having no title yet.
    expect(choice(w).title).toBe('HW2 brief')
    expect(choice(w).files.map((x) => x.uploadToken)).toEqual(['tok-HW2 brief.pdf'])

    await w.find('.doc-text__toggle').trigger('click')
    await w.find('.doc-text textarea').setValue('Hand in by Friday.')
    expect(choice(w)).toMatchObject({ body: 'Hand in by Friday.', files: [{ uploadToken: 'tok-HW2 brief.pdf' }] })
  })

  it('shows its text open where it has some', () => {
    const w = field({ body: 'Written already.' })
    expect((w.find('.doc-text__editor').element as HTMLElement).style.display).not.toBe('none')
    expect(w.find('.doc-text__toggle').text()).toBe('Text note (16 characters)')
  })
})
