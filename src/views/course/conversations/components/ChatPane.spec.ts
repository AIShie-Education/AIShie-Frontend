import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h } from 'vue'
import type { ConversationMessage, ConversationView, Respondent } from '@/api/types'

let server: { messages: ConversationMessage[]; view: ConversationView }
const writes: { tool: string; args: Record<string, unknown> }[] = []
let writeAnswer: (tool: string) => unknown

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool === 'conversation.get') return { ...server.view, visible_to: ['participants'] }
      if (tool === 'conversation.messages') return { messages: server.messages, conversation: server.view, more: false }
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return writeAnswer(tool)
    }),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { useCourseStore } = await import('@/stores/course')
const { default: ChatPane } = await import('./ChatPane.vue')
const { default: ChatComposer } = await import('./ChatComposer.vue')

const Passthrough = (name: string) =>
  defineComponent({
    name,
    setup:
      (_, { slots }) =>
      () =>
        h('span', slots.default?.() ?? slots.reference?.()),
  })
const global = {
  plugins: [i18n, ElementPlus],
  components: icons,
  stubs: {
    ElTooltip: Passthrough('ElTooltip'),
    ElPopover: Passthrough('ElPopover'),
    RouterLink: Passthrough('RouterLink'),
  },
}

function msg(seq: number, author: string, over: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: `m${seq}`,
    seq,
    author_member_id: author,
    body: `message ${seq}`,
    created_at: '2026-09-26T11:59:00Z',
    ...over,
  }
}
function view(over: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'c1',
    status: 'open',
    state: 'awaiting_answer',
    created_at: '2026-09-26T11:00:00Z',
    opener: { member_id: 'student', display_name: 'Chan Tai Man', kind: 'human' },
    respondent: {
      member_id: 'tutor',
      display_name: 'Course tutor',
      kind: 'agent',
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
      last_seen_at: '2026-09-26T11:59:30Z',
    },
    latest_opener_message_id: 'm3',
    ...over,
  }
}

function seat(memberId: string) {
  const course = useCourseStore()
  course.courseId = 'k1'
  course.course = { id: 'k1', status: 'active' } as never
  course.membership = { member_id: memberId, course_id: 'k1', role: 'student' } as never
  course.permsSource = 'exact'
  course.perms = { conversation_ask: 'autonomous', conversation_answer: 'autonomous', document_read: 'autonomous' }
}

const executed = (result: unknown) => ({
  status: 'executed',
  actionId: 'a1',
  reviewState: 'none',
  result,
  replayed: false,
})

beforeEach(() => {
  // A desktop: a fine pointer, where Enter sends.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  setActivePinia(createPinia())
  setLocale('en')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
  writes.length = 0
  server = {
    messages: [
      msg(1, 'student'),
      msg(2, 'tutor', { body: '**bold** answer' }),
      msg(3, 'student', { body: 'line one\nline two' }),
    ],
    view: view(),
  }
  writeAnswer = () => executed({ message_id: 'm4' })
})
afterEach(() => vi.useRealTimers())
enableAutoUnmount(afterEach)

async function type(wrapper: ReturnType<typeof mount>, text: string) {
  const ta = wrapper.find('textarea')
  await ta.setValue(text)
  return ta
}

describe('ChatPane', () => {
  it('shows the opener’s words as typed and the respondent’s as Markdown, and the respondent at work', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const texts = w.findAll('.chat-msg__text')
    expect(texts.map((t) => t.text())).toEqual(['message 1', 'line one\nline two'])
    expect(w.find('.chat-msg__markdown strong').text()).toBe('bold')
    expect(w.find('.chat-pane__typing').text()).toContain('Waiting for Course tutor')
  })

  it('asks in the opener’s conversation when Enter is pressed, not while composing', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const ta = await type(w, '還有一個問題')
    await ta.trigger('compositionstart')
    await ta.trigger('keydown', { key: 'Enter', isComposing: true })
    await ta.trigger('compositionend')
    await ta.trigger('keydown', { key: 'Enter', keyCode: 229 })
    await ta.trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()
    expect(writes).toHaveLength(0)
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes).toEqual([
      { tool: 'conversation.ask', args: { course_id: 'k1', conversation_id: 'c1', body: '還有一個問題' } },
    ])
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('answers the opener’s latest message when the caller is the respondent', async () => {
    seat('tutor')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('.chat-pane__notice').text()).toContain('Chan Tai Man is waiting for your answer')
    const ta = await type(w, 'Here is the answer')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes[0]).toEqual({
      tool: 'conversation.answer',
      args: { course_id: 'k1', conversation_id: 'c1', in_reply_to_message_id: 'm3', body: 'Here is the answer' },
    })
  })

  it('keeps a question that waits for approval on screen, marked so', async () => {
    seat('student')
    writeAnswer = () => ({ status: 'proposed', actionId: 'a9', reviewState: 'none', replayed: false })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const ta = await type(w, 'Is this allowed?')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(w.find('.chat-pane__held').text()).toContain('Is this allowed?')
    expect(w.find('.chat-pane__held').text()).toContain('Waiting for approval')
  })

  it('shows a closed conversation read-only, with why, and offers a new one', async () => {
    seat('student')
    server.view = view({ status: 'closed', state: 'closed', closed_reason: 'seat_removed' })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__closed').text()).toContain('A participant left the course')
    await w.find('.chat-pane__closed button').trigger('click')
    expect(w.emitted('start')?.[0]?.[0]).toMatchObject({ member_id: 'tutor', display_name: 'Course tutor' })
  })

  it('shows a retracted message without its text', async () => {
    seat('student')
    server.messages = [
      msg(1, 'student', { body: null, retracted: { at: 'x', by_member_id: 'staff', reason: 'Off topic' } }),
    ]
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('.chat-msg.is-retracted').text()).toContain('Course staff withdrew this message.')
    expect(w.find('.chat-msg.is-retracted').text()).toContain('Off topic')
  })

  it('opens a new conversation with its first message, and warns when nothing runs the agent', async () => {
    seat('student')
    writeAnswer = () => executed({ conversation_id: 'c2', message_id: 'm1' })
    const respondent: Respondent = {
      member_id: 'tutor',
      display_name: 'Course tutor',
      kind: 'agent',
      role: 'assistant',
      is_my_delegate: false,
      answers_course: true,
      answer_level: 'autonomous',
      last_seen_at: null,
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', respondent }, global })
    await flushPromises()
    expect(w.find('.chat-pane__notice').text()).toContain('never connected')
    const ta = await type(w, 'What is due Friday?')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes[0]).toEqual({
      tool: 'conversation.open',
      args: { course_id: 'k1', respondent_member_id: 'tutor', body: 'What is due Friday?' },
    })
    expect(w.emitted('opened')?.[0]).toEqual(['c2'])
  })
})

describe('ChatComposer', () => {
  it('sends on Enter only when there is something to send and it may be sent', async () => {
    const w = mount(ChatComposer, { props: { modelValue: '   ' }, global })
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('send')).toBeUndefined()
    await w.setProps({ modelValue: 'hello', disabled: true })
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('send')).toBeUndefined()
    await w.setProps({ disabled: false })
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('send')).toHaveLength(1)
  })

  it('shows the count as the draft nears Core’s limit', async () => {
    const w = mount(ChatComposer, { props: { modelValue: 'x'.repeat(19_500) }, global })
    expect(w.find('.chat-composer__count').text()).toContain('19500 / 20000')
    await w.setProps({ modelValue: 'x'.repeat(20_001) })
    expect(w.find('.chat-composer__count').classes()).toContain('is-over')
  })
})
