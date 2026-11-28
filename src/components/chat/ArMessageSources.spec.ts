import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const reads: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push({ tool, args })
      if (tool === 'document.text') return { text: 'Part', parts: 1, revision: 1 }
      if (tool !== 'document.get') throw new Error(`unexpected ${tool}`)
      return {
        title: 'Resolved title',
        version: {
          id: 'v1',
          created_at: '2026-11-27T00:00:00Z',
          files: [{ id: 'f1', position: 0, filename: 'week.pdf', content_type: 'application/pdf', byte_size: 10 }],
        },
      }
    }),
  }
})

const { i18n } = await import('@/i18n')
const { default: ArMessageSources } = await import('./ArMessageSources.vue')
const { closePreview, previewState } = await import('@/components/preview/viewer')
const View = { render: () => null }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: View },
    { path: '/courses/:courseId/documents/:documentId', name: 'course-document', component: View },
  ],
})
const global = { plugins: [i18n, ElementPlus, router], components: icons }

afterEach(() => {
  reads.length = 0
  closePreview()
})
enableAutoUnmount(afterEach)

describe('ArMessageSources', () => {
  it('shows only a safe location until clicked, then resolves the document and opens its slide', async () => {
    const w = mount(ArMessageSources, {
      props: { courseId: 'k1', sources: [{ document_id: 'private-id', version_id: 'v1', file_id: 'f1', slide: 3 }] },
      global,
    })
    const button = w.get('button')
    expect(button.text()).toBe('Course material · slide 3')
    expect(w.text()).not.toContain('private-id')
    expect(reads).toEqual([])
    await button.trigger('click')
    await flushPromises()
    expect(reads.map((r) => r.tool)).toEqual(['document.get'])
    expect(previewState().open).toBe(true)
    expect(previewState().index).toBe(0)
    expect(previewState().page).toBe(3)
  })

  it('resolves a text part with document.text before opening the document’s text tab', async () => {
    const w = mount(ArMessageSources, {
      props: { courseId: 'k1', sources: [{ document_id: 'd1', version_id: 'v1', file_id: 'f1', part: 2 }] },
      global,
    })
    await w.get('button').trigger('click')
    await flushPromises()
    expect(reads.map((r) => r.tool)).toEqual(['document.get', 'document.text'])
    expect(reads[1]!.args).toMatchObject({ document_id: 'd1', version_id: 'v1', file_id: 'f1', part: 2 })
    expect(router.currentRoute.value.name).toBe('course-document')
    expect(router.currentRoute.value.query).toMatchObject({ version: 'v1', tab: 'text', file: 'f1' })
  })
})
