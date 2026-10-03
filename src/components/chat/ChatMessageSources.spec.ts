import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { MessageSource } from '@/api/types'

const reads: { tool: string; args: Record<string, unknown> }[] = []
let readAnswer: (tool: string, args: Record<string, unknown>) => unknown

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push({ tool, args })
      return readAnswer(tool, args)
    }),
  }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { default: ChatMessageSources } = await import('./ChatMessageSources.vue')
const { closePreview, previewState } = await import('@/components/preview/viewer')

const View = defineComponent({ render: () => null })
function routerAt() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View },
      { path: '/courses/:courseId/documents/:documentId', name: 'course-document', component: View },
    ],
  })
}
let router = routerAt()
function sources(list: MessageSource[]) {
  return mount(ChatMessageSources, {
    props: { courseId: 'k1', sources: list },
    global: { plugins: [i18n, ElementPlus, router], components: icons },
  })
}

/** A source the reader may open whole: page 3 of lecture2.pdf in version 2 of Week 2, the published one. */
const whole = (over: Partial<MessageSource> = {}): MessageSource => ({
  document_id: 'd2',
  kind: 'material',
  title: 'Week 2 — Variables',
  version_id: 'v2',
  seq: 2,
  published: true,
  file_id: 'f2',
  filename: 'lecture2.pdf',
  page: 3,
  ...over,
})
/** A version the reader may not open: older than the published one, or newer (a draft, or one published before an older one was again). */
const other: MessageSource = { document_id: 'd1', kind: 'material', title: 'Week 1 — Setup', other_version: true }
const restricted: MessageSource = { restricted: true }

const pdf = (id: string, position: number, filename: string) => ({
  id,
  position,
  filename,
  content_type: 'application/pdf',
  byte_size: 2048,
})
/** document.get of version 2: a cover, then the lecture. */
const version2 = (files = [pdf('f1', 1, 'cover.pdf'), pdf('f2', 2, 'lecture2.pdf')]) => ({
  id: 'd2',
  kind: 'material',
  title: 'Week 2 — Variables',
  status: 'active',
  created_at: '2026-09-28T09:00:00Z',
  version: { id: 'v2', seq: 2, created_at: '2026-09-29T09:00:00Z', files },
})

beforeEach(async () => {
  setLocale('en')
  reads.length = 0
  readAnswer = () => version2()
  router = routerAt()
  await router.push('/')
  document.querySelectorAll('.el-notification, .el-message').forEach((n) => n.remove())
})
afterEach(() => closePreview())
enableAutoUnmount(afterEach)

describe('ChatMessageSources', () => {
  it('names one source on the line, and opens its file in the viewer at the page it named, among the version’s files', async () => {
    const w = sources([whole()])
    expect(w.get('.chat-sources').text()).toBe('Based on: “Week 2 — Variables” · lecture2.pdf · page 3')
    expect(w.find('.chat-sources__summary').exists()).toBe(false)
    expect(reads).toEqual([])
    await w.get('button.chat-source__link').trigger('click')
    await flushPromises()
    expect(reads).toEqual([{ tool: 'document.get', args: { course_id: 'k1', document_id: 'd2', version_id: 'v2' } }])
    const state = previewState()
    expect(state.open).toBe(true)
    expect(state.files.map((f) => f.filename)).toEqual(['cover.pdf', 'lecture2.pdf'])
    expect(state.index).toBe(1)
    expect(state.page).toBe(3)
    expect(state.title).toBe('Week 2 — Variables')
    expect(state.courseId).toBe('k1')
  })

  it('opens a slide it named at that page of the file’s PDF', async () => {
    const w = sources([whole({ page: null, slide: 4, filename: 'lecture2.pptx' })])
    expect(w.get('.chat-sources').text()).toBe('Based on: “Week 2 — Variables” · lecture2.pptx · slide 4')
    await w.get('button.chat-source__link').trigger('click')
    await flushPromises()
    expect(previewState().page).toBe(4)
  })

  it('links a source with no file to its version, named by its number where it is not the published one', () => {
    const w = sources([
      whole({ file_id: null, filename: null, page: null, version_id: 'v1', seq: 1, published: false }),
    ])
    const link = w.get('a.chat-source__link')
    expect(link.attributes('href')).toBe('/courses/k1/documents/d2?version=v1')
    expect(link.text()).toBe('“Week 2 — Variables” · version 1')
    expect(link.attributes('title')).toBe('Open this version of the material')
  })

  it('goes to the version’s page where the file it named is no longer among its files', async () => {
    readAnswer = () => version2([pdf('f1', 1, 'cover.pdf')])
    const w = sources([whole()])
    await w.get('button.chat-source__link').trigger('click')
    await flushPromises()
    expect(previewState().open).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/courses/k1/documents/d2?version=v2')
  })

  it('says why the file cannot be opened, by the material’s title', async () => {
    readAnswer = () => {
      throw new ApiError({ status: 403, code: 'forbidden', message: 'you may not read this version' })
    }
    const w = sources([whole()])
    await w.get('button.chat-source__link').trigger('click')
    await flushPromises()
    expect(previewState().open).toBe(false)
    expect(document.body.textContent).toContain('“Week 2 — Variables”')
  })

  it('sums several up by the first it names, and opens to list each as the reader may open it', async () => {
    const w = sources([restricted, other, whole({ file_id: null, filename: null, page: null })])
    const summary = w.get('button.chat-sources__summary')
    expect(summary.text()).toBe('Based on: “Week 1 — Setup” · 3 items')
    expect(summary.attributes('aria-expanded')).toBe('false')
    expect(w.find('.chat-sources__list').exists()).toBe(false)

    await summary.trigger('click')
    expect(summary.attributes('aria-expanded')).toBe('true')
    const list = w.get('.chat-sources__list')
    expect(summary.attributes('aria-controls')).toBe(list.attributes('id'))
    expect(list.attributes('aria-label')).toBe('Course materials this answer relied on')
    const items = list.findAll('li')
    expect(items.map((i) => i.text())).toEqual([
      'a course material you cannot open',
      '“Week 1 — Setup” · another version (opens it as it is now)',
      '“Week 2 — Variables”',
    ])
    // Not to be opened: no link, nothing to click, no title.
    expect(items[0]!.find('a, button').exists()).toBe(false)
    expect(items[0]!.get('.chat-source').classes()).toContain('is-restricted')
    // Another version: the document as it is now, which is said beside the link, not only in its tooltip.
    const link = items[1]!.get('a')
    expect(link.attributes('href')).toBe('/courses/k1/documents/d1')
    expect(link.text()).toBe('“Week 1 — Setup” · another version')
    expect(link.attributes('title')).toBe(
      'The answer relied on another version of this material, one you cannot open: this opens the material as it is now.',
    )
    expect(items[1]!.get('.chat-source__note').text()).toBe('(opens it as it is now)')
    expect(items[2]!.get('a').attributes('href')).toBe('/courses/k1/documents/d2?version=v2')
  })

  it('never calls a version the reader may not open earlier: it may be newer', () => {
    const w = sources([other])
    expect(w.get('.chat-sources').text()).toBe('Based on: “Week 1 — Setup” · another version (opens it as it is now)')
    expect(w.text()).not.toMatch(/earlier/i)
  })

  it('says only how many it relied on where the reader may open none of them', () => {
    const w = sources([restricted, restricted])
    expect(w.get('.chat-sources__summary').text()).toBe('Based on: 2 course materials you cannot open')
  })

  it('says one it relied on cannot be opened, with no link', () => {
    const w = sources([restricted])
    expect(w.get('.chat-sources').text()).toBe('Based on: a course material you cannot open')
    expect(w.find('a, button').exists()).toBe(false)
  })

  it.each([
    ['en', 'No course material cited'],
    ['zh-Hant', '未引用課程教材'],
    ['zh-Hans', '未引用课程教材'],
  ] as const)('shows a neutral pill where the answer relied on no course material (%s)', (locale, text) => {
    setLocale(locale)
    const w = sources([])
    const pill = w.get('.chat-sources__none')
    expect(pill.classes()).toContain('el-tag--info')
    expect(pill.text()).toBe(text)
    expect(w.find('.chat-sources__summary').exists()).toBe(false)
  })

  it('says that the agent said it relied on none when the pill takes focus, as a tap gives it, not only on hover', async () => {
    const w = sources([])
    const pill = w.get('.chat-sources__none')
    expect(pill.attributes('tabindex')).toBe('0')
    expect(pill.attributes('title')).toBeUndefined()
    const tip = 'The agent said this answer relied on no course material.'
    expect(document.body.textContent).not.toContain(tip)
    await pill.trigger('focus')
    await vi.waitFor(() => expect(document.body.textContent).toContain(tip))
    expect(pill.attributes('aria-describedby')).toBe(document.querySelector('.el-popper.app-tip-wrap')?.id)
  })

  it.each([
    [
      'zh-Hant',
      '依據：《Week 2 — Variables》· 3項',
      '《Week 2 — Variables》· lecture2.pdf · 第3頁',
      '一份你無法開啟的課程教材',
      '《Week 1 — Setup》· 另一個版本（開啟的是目前的版本）',
    ],
    [
      'zh-Hans',
      '依据：《Week 2 — Variables》· 3项',
      '《Week 2 — Variables》· lecture2.pdf · 第3页',
      '一份你无法打开的课程教材',
      '《Week 1 — Setup》· 另一个版本（打开的是当前的版本）',
    ],
  ] as const)('says what it relied on in %s', async (locale, line, first, second, third) => {
    setLocale(locale)
    const w = sources([whole(), restricted, other])
    const summary = w.get('.chat-sources__summary')
    expect(summary.text()).toBe(line)
    await summary.trigger('click')
    expect(w.findAll('.chat-sources__item').map((i) => i.text())).toEqual([first, second, third])
  })
})
