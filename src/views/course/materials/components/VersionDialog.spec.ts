import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { UploadedFile, UploadOptions } from '@/api/http'

// The latest version, as document.get reads it; every write kept, and executed.
let latest: Record<string, unknown>
const writes: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    knownUploadLimit: () => null,
    uploadLimit: vi.fn(async () => 1_000_000),
    uploadFile: vi.fn(async (_c: string, _k: string, file: File, _o: UploadOptions): Promise<UploadedFile> => ({
      uploadToken: `tok-${file.name}`,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    })),
    read: vi.fn(async (tool: string) => {
      if (tool !== 'document.get') throw new Error(`no answer for ${tool}`)
      return { id: 'd-1', title: 'Week 1', kind: 'material', status: 'active', version: latest }
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return {
        status: 'executed',
        actionId: 'act-1',
        reviewState: 'none',
        result: { version_id: 'v-2', seq: 2, published: false },
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
const { default: VersionDialog } = await import('./VersionDialog.vue')

beforeEach(() => {
  writes.length = 0
  latest = { id: 'v-1', seq: 1, body_md: 'Install Python.', content_type: 'application/pdf', byte_size: 10 }
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

async function dialog(files: File[] = []) {
  const w = mount(VersionDialog, {
    props: { modelValue: true, courseId: 'c-1', documentId: 'd-1', kind: 'material', docTitle: 'Week 1', files },
    global: { plugins: [createPinia(), i18n, ElementPlus], components: icons },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel)
const buttonNamed = (name: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name)
const editorShown = () => $('.doc-text__editor')!.style.display !== 'none'

describe('New version', () => {
  it('holds the file dropped and, under it, the latest version’s text, as one version', async () => {
    await dialog([new File(['%PDF'], 'week1-v2.pdf', { type: 'application/pdf' })])
    // The file is first; the text is folded under it, kept from version 1.
    expect(editorShown()).toBe(false)
    expect($('.doc-text__toggle')!.textContent).toContain('Text: version 1’s, as it is (15 characters).')
    $('.doc-text__toggle')!.click()
    await flushPromises()
    const area = $('.doc-text textarea') as HTMLTextAreaElement
    area.value = 'Install Python 3.13.'
    area.dispatchEvent(new Event('input'))
    await flushPromises()
    expect($('.doc-text__toggle')!.textContent).toContain('Text: as written here (20 characters).')
    buttonNamed('Save version')!.click()
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'document.add_version',
        args: {
          course_id: 'c-1',
          document_id: 'd-1',
          body_md: 'Install Python 3.13.',
          upload_token: 'tok-week1-v2.pdf',
        },
      },
    ])
  })

  it('leaves the text out when asked, and puts it back', async () => {
    await dialog([new File(['%PDF'], 'week1-v2.pdf', { type: 'application/pdf' })])
    buttonNamed('Leave the text out')!.click()
    await flushPromises()
    expect($('.doc-text__toggle')!.textContent).toContain('Add a text note (optional)')
    buttonNamed('Keep version 1’s text')!.click()
    await flushPromises()
    buttonNamed('Leave the text out')!.click()
    await flushPromises()
    buttonNamed('Save version')!.click()
    await flushPromises()
    expect(writes.map((x) => x.args)).toEqual([
      { course_id: 'c-1', document_id: 'd-1', body_md: undefined, upload_token: 'tok-week1-v2.pdf' },
    ])
  })

  it('opens on its text where the latest version is text alone, under the drop zone', async () => {
    latest = { id: 'v-1', seq: 1, body_md: 'Install Python.' }
    await dialog()
    expect($('.file-drop__zone')).not.toBeNull()
    expect(editorShown()).toBe(true)
    const area = $('.doc-text textarea') as HTMLTextAreaElement
    area.value = 'Install Python 3.13.'
    area.dispatchEvent(new Event('input'))
    await flushPromises()
    buttonNamed('Save version')!.click()
    await flushPromises()
    expect(writes.map((x) => x.args)).toEqual([
      { course_id: 'c-1', document_id: 'd-1', body_md: 'Install Python 3.13.', upload_token: undefined },
    ])
  })
})
