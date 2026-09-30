import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'

// Core's documents, by id: a submitted file of several files, and one of one.
const docs: Record<string, unknown> = {}
const reads: string[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: { document_id: string }) => {
      reads.push(`${tool} ${args.document_id}`)
      if (tool !== 'document.get' || !docs[args.document_id]) throw new Error(`no answer for ${tool}`)
      return docs[args.document_id]
    }),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { default: DocumentFiles, forgetDocumentFiles } = await import('./DocumentFiles.vue')

const pdf = (id: string, position: number, filename: string) => ({
  id,
  position,
  filename,
  content_type: 'application/pdf',
  byte_size: 1_024,
})

beforeEach(() => {
  reads.length = 0
  forgetDocumentFiles()
  docs['d-many'] = {
    id: 'd-many',
    title: 'Lab report',
    kind: 'submission',
    version: { id: 'v-1', seq: 1, files: [pdf('f-1', 1, 'report.pdf'), pdf('f-2', 2, 'data.csv'), pdf('f-3', 3, 'plot.png')] },
  }
  docs['d-one'] = { id: 'd-one', title: 'essay', kind: 'submission', version: { id: 'v-2', seq: 1, files: [pdf('f-9', 1, 'essay.pdf')] } }
  setActivePinia(createPinia())
  setLocale('en')
})
enableAutoUnmount(afterEach)

function files(documentId: string, title: string) {
  return mount(DocumentFiles, {
    props: { courseId: 'c-1', documentId, title },
    global: { plugins: [createPinia(), i18n, ElementPlus], components: icons },
  })
}

describe('DocumentFiles', () => {
  it('shows every file a submitted document holds, under its title', async () => {
    const w = files('d-many', 'Lab report')
    await flushPromises()
    expect(w.find('.doc-files__title').text()).toContain('Lab report')
    expect(w.find('.doc-files__count').text()).toBe('3 files')
    expect(w.findAll('.version-file').map((r) => r.attributes('data-file'))).toEqual(['report.pdf', 'data.csv', 'plot.png'])
  })

  it('is its one file alone where the file is named as the document is', async () => {
    const w = files('d-one', 'essay')
    await flushPromises()
    expect(w.find('.doc-files__title').exists()).toBe(false)
    expect(w.findAll('.version-file').map((r) => r.attributes('data-file'))).toEqual(['essay.pdf'])
  })

  it('reads each document once for the page', async () => {
    files('d-many', 'Lab report')
    files('d-many', 'Lab report')
    await flushPromises()
    expect(reads).toEqual(['document.get d-many'])
  })
})
