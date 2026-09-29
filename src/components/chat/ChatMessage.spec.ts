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
})
