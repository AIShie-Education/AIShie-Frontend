import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { ConversationMessage } from '@/api/types'

const { i18n, setLocale } = await import('@/i18n')
const { default: ChatMessage } = await import('./ChatMessage.vue')

const global = { plugins: [i18n, ElementPlus], components: icons }

function msg(over: Partial<ConversationMessage> = {}): ConversationMessage {
  return { id: 'm1', seq: 1, author_member_id: 'tutor', body: 'hello', created_at: '2026-09-26T11:59:00Z', ...over }
}
const agent = (over: Partial<ConversationMessage> = {}, props: Record<string, unknown> = {}) =>
  mount(ChatMessage, {
    props: {
      message: msg(over),
      authorName: 'Course tutor',
      fromOpener: false,
      mine: false,
      myMemberId: 'me',
      ...props,
    },
    global,
  })
const person = (over: Partial<ConversationMessage> = {}, props: Record<string, unknown> = {}) =>
  mount(ChatMessage, {
    props: {
      message: msg({ author_member_id: 'me', ...over }),
      authorName: 'You',
      fromOpener: true,
      mine: true,
      myMemberId: 'me',
      ...props,
    },
    global,
  })

let copied: string[] = []
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  setActivePinia(createPinia())
  setLocale('en')
  copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (s: string) => void copied.push(s)) },
  })
})
enableAutoUnmount(afterEach)

describe('ChatMessage', () => {
  it('sets the agent’s words across the width as Markdown, named over them, with no bubble', () => {
    const w = agent({ body: '## Steps\n\n1. **Read** it\n2. Try `x`' })
    expect(w.classes()).toContain('is-agent')
    expect(w.find('.chat-msg__author').text()).toBe('Course tutor')
    expect(w.find('.chat-prose h2').text()).toBe('Steps')
    expect(w.find('.chat-prose ol li strong').text()).toBe('Read')
    expect(w.find('.chat-prose code').text()).toBe('x')
    expect(w.find('.chat-msg__text').exists()).toBe(false)
  })

  it('shows the person’s words as typed, in a bubble on the right, without their own name', () => {
    const w = person({ body: 'line one\nline two **not bold**' })
    expect(w.classes()).toEqual(expect.arrayContaining(['is-person', 'is-mine']))
    expect(w.find('.chat-msg__text').text()).toBe('line one\nline two **not bold**')
    expect(w.find('.chat-msg__author').exists()).toBe(false)
    // Someone else's words (a staff member reading), named.
    const other = person({}, { mine: false, authorName: 'Chan Tai Man' })
    expect(other.find('.chat-msg__author').text()).toBe('Chan Tai Man')
  })

  it('says the name once for a run of messages', () => {
    expect(agent({}, { grouped: true }).find('.chat-msg__head').exists()).toBe(false)
    expect(agent({}, { grouped: true }).classes()).toContain('is-grouped')
  })

  it('puts the code in a box with its language and a button that copies it', async () => {
    const w = agent({ body: 'Try:\n\n```python\nprint("hi")\n```\n' })
    const box = w.find('.md-code')
    expect(box.find('.md-code__lang').text()).toBe('python')
    const button = box.find('button.md-code__copy')
    expect(button.text()).toBe('Copy')
    await button.trigger('click')
    await flushPromises()
    expect(copied).toEqual(['print("hi")\n'])
    expect(button.text()).toBe('Copied')
    expect(button.classes()).toContain('is-copied')
  })

  it('copies a message as it was written, Markdown and all, and says so', async () => {
    const w = agent({ body: '**bold** and `code`' })
    const copy = w.get('button.chat-msg__copy')
    expect(copy.attributes('aria-label')).toBe('Copy message')
    await copy.trigger('click')
    await flushPromises()
    expect(copied).toEqual(['**bold** and `code`'])
    expect(w.find('.chat-msg__announce').text()).toBe('Copied')
    const mine = person({ body: 'my question' })
    await mine.get('button.chat-msg__copy').trigger('click')
    await flushPromises()
    expect(copied).toEqual(['**bold** and `code`', 'my question'])
  })

  it('leaves Enter and Space to its buttons, which their tooltips would otherwise take', () => {
    const w = person({}, { canEdit: true })
    for (const button of [w.get('button.chat-msg__copy'), w.get('button.chat-msg__edit')]) {
      for (const [key, code] of [
        ['Enter', 'Enter'],
        [' ', 'Space'],
      ]) {
        const e = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
        button.element.dispatchEvent(e)
        expect(e.defaultPrevented, `${button.classes()} ${key}`).toBe(false)
      }
    }
  })

  it('offers to edit only the question awaiting its answer, and to withdraw where it may', async () => {
    expect(person().find('.chat-msg__edit').exists()).toBe(false)
    const w = person({}, { canEdit: true, canRetract: true })
    const edit = w.get('button.chat-msg__edit')
    expect(edit.attributes('aria-label')).toBe('Edit')
    await edit.trigger('click')
    expect(w.emitted('edit')).toHaveLength(1)
    await w.get('.chat-msg__retract').trigger('click')
    expect(w.emitted('retract')).toHaveLength(1)
  })

  it('shows a retracted message without its text, and nothing to copy', () => {
    const w = person({ body: null, retracted: { at: 'x', by_member_id: 'me', reason: 'typo' } }, { canEdit: true })
    expect(w.classes()).toContain('is-retracted')
    expect(w.text()).toContain('You withdrew this message.')
    expect(w.find('.chat-msg__copy').exists()).toBe(false)
    expect(w.find('.chat-msg__edit').exists()).toBe(false)
  })
  it('lists the files a message carries: the person’s over their bubble, the agent’s under its words', () => {
    const files = [
      {
        id: 'f1',
        filename: 'essay.docx',
        content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        byte_size: 20_480,
        created_at: 'x',
      },
      { id: 'f2', filename: 'data.csv', content_type: 'text/csv', byte_size: 300, created_at: 'x' },
    ]
    const p = person({ attachments: files }, { courseId: 'k1' })
    const list = p.get('.msg-files')
    expect(list.attributes('aria-label')).toBe('Attached files')
    // Before the bubble, in order.
    const children = [...p.get('article').element.children].map((c) => c.classList[0])
    expect(children.indexOf('msg-files')).toBeLessThan(children.indexOf('chat-msg__body'))
    expect(p.findAll('.msg-file__name').map((n) => n.text())).toEqual(['essay.docx', 'data.csv'])
    expect(p.findAll('.msg-file__meta').map((n) => n.text())).toEqual(['Document · 20 KB', 'Spreadsheet · 300 B'])
    expect(p.findAll('.msg-file__icon').map((i) => i.classes()[1])).toEqual(['is-word', 'is-sheet'])
    expect(p.get('.msg-file__open').attributes('aria-label')).toBe('Preview “essay.docx” (Document · 20 KB)')
    expect(p.get('.msg-file__get').attributes('aria-label')).toBe('Download “essay.docx”')

    const a = agent({ attachments: [files[1]!] }, { courseId: 'k1' })
    const kids = [...a.get('article').element.children].map((c) => c.classList[0])
    expect(kids.indexOf('msg-files')).toBeGreaterThan(kids.indexOf('chat-msg__body'))
  })

  it('says under an answer’s words and files that it relied on no course material, where it said so', () => {
    const csv = { id: 'f2', filename: 'data.csv', content_type: 'text/csv', byte_size: 300, created_at: 'x' }
    const w = agent({ sources: [], attachments: [csv] }, { courseId: 'k1' })
    expect(w.get('.chat-sources').text()).toBe('No course material cited')
    const kids = [...w.get('article').element.children].map((c) => c.classList[0])
    expect(kids.slice(-4)).toEqual(['chat-msg__body', 'msg-files', 'chat-sources', 'chat-msg__foot'])
  })

  it.each([
    ['an answer that did not say what it relied on', () => agent({}, { courseId: 'k1' })],
    [
      'a withdrawn answer',
      () =>
        agent(
          { body: null, sources: [], retracted: { at: 'x', by_member_id: 'me', reason: null } },
          { courseId: 'k1' },
        ),
    ],
    ['a question', () => person({ sources: [] }, { courseId: 'k1' })],
  ])('says nothing of sources under %s', (_, render) => {
    expect(render().find('.chat-sources').exists()).toBe(false)
  })

  it('shows no files of a withdrawn message, as it shows no text', () => {
    const w = person(
      {
        body: null,
        retracted: { at: 'x', by_member_id: 'me', reason: null },
        attachments: [
          { id: 'f1', filename: 'essay.pdf', content_type: 'application/pdf', byte_size: 10, created_at: 'x' },
        ],
      },
      { courseId: 'k1' },
    )
    expect(w.find('.msg-files').exists()).toBe(false)
    expect(w.text()).not.toContain('essay.pdf')
  })
})
