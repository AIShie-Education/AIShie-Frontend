import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { ConversationDraft, DraftStep } from './draft'

const { i18n, setLocale } = await import('@/i18n')
const { default: ChatDraft } = await import('./ChatDraft.vue')
const { default: ChatDraftSteps } = await import('./ChatDraftSteps.vue')

const global = { plugins: [i18n, ElementPlus], components: icons }

const READ: DraftStep[] = [
  { kind: 'thinking', state: 'done' },
  { kind: 'reading_document', target: 'HW1.pdf', state: 'done' },
  { kind: 'reading_assignment', target: 'HW1 — Temperature converter', state: 'done' },
  { kind: 'listing_documents', state: 'done' },
]
function draft(over: Partial<ConversationDraft> = {}): ConversationDraft {
  return { attempt: 'a1', version: 3, updated_at: '2026-09-26T12:00:00Z', steps: READ, ...over }
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  setActivePinia(createPinia())
  setLocale('zh-Hant')
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-09-26T12:00:12Z'))
})
afterEach(() => vi.useRealTimers())
enableAutoUnmount(afterEach)

const texts = (w: ReturnType<typeof mount>) => w.findAll('.chat-steps__text').map((s) => s.text())

describe('ChatDraftSteps', () => {
  it('lists each step, done with a tick, the running one with the turning glyph', () => {
    const w = mount(ChatDraftSteps, {
      props: { steps: [...READ, { kind: 'searching_memory', state: 'running' }] },
      global,
    })
    expect(texts(w)).toEqual([
      '已思考',
      '已閱讀《HW1.pdf》',
      '已閱讀作業《HW1 — Temperature converter》',
      '已查看教材列表',
      '正在搜尋記憶…',
    ])
    const steps = w.findAll('.chat-steps__step')
    expect(steps.at(-1)!.classes()).toContain('is-running')
    expect(steps.at(-1)!.find('.chat-spinner').exists()).toBe(true)
    expect(steps[1]!.find('.chat-spinner').exists()).toBe(false)
    expect(steps[1]!.find('.chat-steps__state').text()).toBe('已完成')
    expect(w.get('ol').attributes('aria-label')).toBe('代理正在做的事')
  })

  it('sums up what was consulted in one line once collapsed, which opens to list them again', async () => {
    const w = mount(ChatDraftSteps, { props: { steps: READ, collapsed: true }, global })
    const summary = w.get('button.chat-steps__summary')
    expect(summary.text()).toBe('已查閱3項')
    expect(summary.attributes('aria-expanded')).toBe('false')
    expect(w.find('.chat-steps__step').exists()).toBe(false)
    await summary.trigger('click')
    expect(summary.attributes('aria-expanded')).toBe('true')
    expect(texts(w)).toHaveLength(4)
    setLocale('en')
    await flushPromises()
    expect(summary.text()).toBe('Consulted 3 items')
  })
})

describe('ChatDraft', () => {
  it('shows the steps and the working line, counting from the question, before any text', () => {
    const w = mount(ChatDraft, {
      props: { draft: draft(), authorName: 'Course tutor', since: Date.parse('2026-09-26T12:00:00Z') },
      global,
    })
    expect(w.get('.chat-msg__author').text()).toBe('Course tutor')
    expect(w.attributes('aria-busy')).toBe('true')
    expect(texts(w)).toHaveLength(4)
    expect(w.get('.chat-status__label').text()).toBe('思考中…')
    expect(w.get('.chat-status__time').text()).toBe('12s')
    expect(w.find('.is-streaming').exists()).toBe(false)
  })

  it('streams the text as Markdown with a caret, the steps done summed up above it', () => {
    const w = mount(ChatDraft, {
      props: {
        draft: draft({
          steps: [...READ, { kind: 'writing', state: 'running' }],
          text: '溫度換算：\n\n```python\nc = (f - 32) * 5 / 9\n```\n\n先把 **華氏**',
        }),
        authorName: 'Course tutor',
      },
      global,
    })
    expect(w.get('.chat-steps__summary').text()).toBe('已查閱3項')
    // Writing is what the caret says: not listed.
    expect(w.find('.chat-steps__step').exists()).toBe(false)
    const text = w.get('.chat-draft__text .markdown-body')
    expect(text.classes()).toEqual(expect.arrayContaining(['chat-prose', 'is-streaming']))
    expect(text.find('.md-code__lang').text()).toBe('python')
    expect(text.find('p:last-child strong').text()).toBe('華氏')
    expect(w.find('.chat-status').exists()).toBe(false)
    expect(w.find('.chat-draft__hidden').exists()).toBe(false)
  })

  it('shows only the steps, and that the answer shows once confirmed, where its text is hidden', () => {
    const w = mount(ChatDraft, {
      props: {
        draft: draft({
          text_hidden: true,
          text: 'never shown',
          steps: [...READ, { kind: 'writing', state: 'running' }],
        }),
        authorName: 'Course tutor',
      },
      global,
    })
    expect(w.text()).not.toContain('never shown')
    expect(w.find('.chat-draft__text').exists()).toBe(false)
    expect(texts(w).at(-1)).toBe('正在撰寫回答…')
    expect(w.get('.chat-draft__hidden').text()).toBe('答案需經確認後才會顯示。')
  })
})
