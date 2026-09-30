import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h, inject, provide } from 'vue'
import type { ConversationMessage, ConversationView, Respondent } from '@/api/types'

let server: {
  messages: ConversationMessage[]
  view: ConversationView
  respondents: Respondent[]
  /** The answer being written, as a Core with drafts sends it; left out by one without. */
  draft?: unknown
}
const writes: { tool: string; args: Record<string, unknown> }[] = []
let writeAnswer: (tool: string) => unknown

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool === 'conversation.get') return { ...server.view, visible_to: ['participants'] }
      if (tool === 'conversation.messages')
        return {
          messages: server.messages,
          conversation: server.view,
          more: false,
          ...(server.draft !== undefined ? { draft: server.draft } : {}),
        }
      if (tool === 'conversation.respondents') return { respondents: server.respondents }
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return writeAnswer(tool)
    }),
  }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { default: ChatPane } = await import('./ChatPane.vue')
const { default: ChatComposer } = await import('./ChatComposer.vue')
const { forgetSent } = await import('./chat')

const Passthrough = (name: string) =>
  defineComponent({
    name,
    setup:
      (_, { slots }) =>
      () =>
        h('span', slots.default?.() ?? slots.reference?.()),
  })
/** Element Plus's tooltip, which it opens on hover: its content as an attribute, to be read. */
const Tooltip = defineComponent({
  name: 'ElTooltip',
  props: { content: { type: String, default: '' }, disabled: Boolean },
  setup:
    (props, { slots }) =>
    () =>
      h('span', { class: 'tooltip-stub', 'data-tip': props.disabled ? null : props.content }, slots.default?.()),
})
/**
 * Element Plus's dropdown, whose menu it lays over the page when its trigger
 * is clicked: here the trigger and the menu both, each item a button that
 * gives the dropdown its command, as a click on it does.
 */
const Dropdown = defineComponent({
  name: 'ElDropdown',
  emits: ['command'],
  setup(_, { slots, emit }) {
    provide('stub-dropdown', (c: unknown) => emit('command', c))
    return () =>
      h('div', { class: 'dropdown-stub' }, [slots.default?.(), h('div', { role: 'menu' }, slots.dropdown?.())])
  },
})
const DropdownItem = defineComponent({
  name: 'ElDropdownItem',
  props: { command: { type: String, default: undefined }, disabled: Boolean, divided: Boolean },
  setup(props, { slots }) {
    const command = inject<(c: unknown) => void>('stub-dropdown')
    return () =>
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: 'menu-item',
          disabled: props.disabled,
          onClick: () => props.command && command?.(props.command),
        },
        slots.default?.(),
      )
  },
})
const global = {
  plugins: [i18n, ElementPlus],
  components: icons,
  stubs: {
    ElTooltip: Tooltip,
    ElPopover: Passthrough('ElPopover'),
    ElDropdown: Dropdown,
    ElDropdownMenu: Passthrough('ElDropdownMenu'),
    ElDropdownItem: DropdownItem,
    RouterLink: Passthrough('RouterLink'),
  },
}

/** What the header's ⋯ menu offers, by its items' words. */
const menu = (w: { findAll: (s: string) => { text: () => string }[] }) =>
  w.findAll('.chat-pane__head [role="menuitem"]').map((b) => b.text())

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

/** The course tutor as conversation.respondents lists it, while it takes conversations in the site. */
const tutorOffered: Respondent = {
  member_id: 'tutor',
  display_name: 'Course tutor',
  kind: 'agent',
  role: 'assistant',
  is_my_delegate: false,
  answers_course: true,
  answer_level: 'autonomous',
  last_seen_at: '2026-09-26T11:59:30Z',
}

/** Core's refusal of a question to an agent that takes no conversations in the site. */
const answersElsewhere = () =>
  new ApiError({
    status: 422,
    code: 'failed_precondition',
    message: 'that agent takes no conversations in the site: it is operated from an external tool, and acts there',
    details: { reason: 'agent_answers_elsewhere' },
    actionId: 'a7',
    actionStatus: 'failed',
  })
const NOTE =
  'This agent is operated from an external tool (such as Claude through MCP); it does not take conversations on the site.'

/** The caller's seat in course k1, as me.memberships gives it: the chat reads it from there, on any page. */
function seat(memberId: string, perms: Record<string, string> = {}) {
  const session = useSessionStore()
  session.memberships = [
    {
      member_id: memberId,
      course_id: 'k1',
      code: 'CS101',
      section: '',
      title: 'Programming',
      role: 'student',
      status: 'active',
      course_status: 'active',
      perms: { conversation_ask: 'autonomous', document_read: 'autonomous', ...perms },
    } as never,
  ]
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
  forgetSent()
  server = {
    messages: [
      msg(1, 'student'),
      msg(2, 'tutor', { body: '**bold** answer' }),
      msg(3, 'student', { body: 'line one\nline two' }),
    ],
    view: view(),
    respondents: [tutorOffered],
  }
  writeAnswer = () => executed({ message_id: 'm4' })
  document.querySelectorAll('.el-notification, .el-message').forEach((n) => n.remove())
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
    // The agent at work, in a line of its own, counting the seconds since the question (asked at 11:59:00).
    const line = w.get('.chat-pane__typing .chat-status')
    expect(line.attributes('role')).toBe('status')
    expect(line.find('.chat-status__label').text()).toBe('Thinking…')
    expect(line.find('.chat-status__time').text()).toBe('1m 00s')
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(line.find('.chat-status__time').text()).toBe('1m 05s')
    expect(w.find('.chat-pane__dots').exists()).toBe(false)
  })

  it('shows the answer being written where Core sends it, in place of the working line, until it is posted', async () => {
    seat('student')
    server.draft = {
      attempt: 'a1',
      version: 4,
      updated_at: '2026-09-26T12:00:00Z',
      steps: [
        { kind: 'reading_assignment', target: 'HW1 — Temperature converter', state: 'done' },
        { kind: 'writing', state: 'running' },
      ],
      text: 'Start **here**',
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const draft = w.get('.chat-pane__draft .chat-draft')
    expect(draft.find('.chat-msg__author').text()).toBe('Course tutor')
    expect(draft.find('.chat-steps__summary').text()).toBe('Consulted 1 item')
    expect(draft.find('.is-streaming strong').text()).toBe('here')
    expect(w.find('.chat-pane__typing .chat-status').exists()).toBe(false)
  })

  it('stops the wait with the button that sends, while nothing is written: the question comes back to the box', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const stop = w.get('.chat-composer__stop')
    expect(stop.attributes('aria-label')).toBe('Stop')
    expect(w.find('.chat-composer__send:not(.chat-composer__stop)').exists()).toBe(false)
    // Something written: it sends that instead, as a follow-up.
    await type(w, 'And another thing')
    expect(w.find('.chat-composer__stop').exists()).toBe(false)
    expect(w.get('.chat-composer__send').attributes('aria-label')).toBe('Send')
    await type(w, '')
    writeAnswer = () => {
      server.messages = server.messages.map((m) =>
        m.id === 'm3' ? { ...m, body: null, retracted: { at: 'x', by_member_id: 'student', reason: null } } : m,
      )
      return executed({ ok: true })
    }
    await w.get('.chat-composer__stop').trigger('click')
    await flushPromises()
    expect(writes).toEqual([{ tool: 'conversation.retract', args: { course_id: 'k1', message_id: 'm3' } }])
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('line one\nline two')
    expect(document.body.querySelector('.el-message')?.textContent).toContain('Stopped: your question was withdrawn')
    expect(w.find('.chat-pane__typing').exists()).toBe(false)
    expect(w.find('.chat-composer__stop').exists()).toBe(false)
  })

  it('offers no stop to staff reading it, nor once the question is answered', async () => {
    seat('student')
    server.view = view({ state: 'answered' })
    server.messages = [msg(1, 'student'), msg(2, 'tutor')]
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('.chat-composer__stop').exists()).toBe(false)
    expect(w.find('.chat-msg__edit').exists()).toBe(false)
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

  it('takes the question awaiting its answer back to the composer to edit: withdrawn, which no agent answers', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    // Only the last question, awaiting its answer, may be edited.
    const edits = w.findAll('.chat-msg__edit')
    expect(edits).toHaveLength(1)
    expect(w.findAll('.chat-msg').at(-1)!.find('.chat-msg__edit').exists()).toBe(true)
    writeAnswer = () => {
      server.messages = server.messages.map((m) =>
        m.id === 'm3' ? { ...m, body: null, retracted: { at: 'x', by_member_id: 'student', reason: null } } : m,
      )
      // As Core says since AIShie-Core #42: answered, its opener the last to write.
      server.view = view({
        state: 'answered',
        last_author_member_id: 'student',
        last_retracted_at: '2026-09-26T12:00:00Z',
      })
      return executed({ ok: true })
    }
    await edits[0]!.trigger('click')
    await flushPromises()
    expect(writes).toEqual([{ tool: 'conversation.retract', args: { course_id: 'k1', message_id: 'm3' } }])
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('line one\nline two')
    expect(w.find('.chat-msg.is-retracted').text()).toContain('You withdrew this message.')
    expect(document.body.querySelector('.el-message')?.textContent).toContain(
      'Course tutor does not answer a withdrawn question, and stops an answer it had begun.',
    )
    // Nothing is awaited, and the line says why.
    expect(w.find('.chat-pane__typing').exists()).toBe(false)
    expect(w.find('.chat-pane__notice').text()).toBe('You withdrew your question: Course tutor will not answer it.')
    expect(w.find('.chat-msg__edit').exists()).toBe(false)
  })

  it('groups a run of messages by one author under one name', async () => {
    seat('student')
    server.messages = [
      msg(1, 'student', { created_at: '2026-09-26T11:50:00Z' }),
      msg(2, 'tutor', { created_at: '2026-09-26T11:51:00Z' }),
      msg(3, 'tutor', { created_at: '2026-09-26T11:52:00Z' }),
      msg(4, 'tutor', { created_at: '2026-09-26T11:59:00Z' }),
    ]
    server.view = view({ state: 'answered' })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.findAll('.chat-pane__list > li').map((li) => li.classes().includes('is-grouped'))).toEqual([
      false,
      false,
      true,
      false,
    ])
    expect(w.findAll('.chat-msg__author').map((a) => a.text())).toEqual(['Course tutor', 'Course tutor'])
  })

  it('offers a new conversation a few ways to begin, which fill the box', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', respondent: tutorOffered }, global })
    await flushPromises()
    const chips = w.findAll('.chat-pane__suggestion')
    expect(chips.map((c) => c.text())).toEqual([
      'Explain what this assignment asks for',
      'Check my reasoning',
      'Summarise this week’s materials',
      'Give me a few practice questions',
    ])
    expect(w.get('.chat-pane__suggestions').attributes('role')).toBe('group')
    await chips[1]!.trigger('click')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('Check my reasoning')
    expect(writes).toHaveLength(0)
  })

  it('takes the composer’s /new and /history to the panel, and offers no way to end the conversation', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const composer = w.findComponent(ChatComposer)
    expect((composer.props('commands') as { name: string }[]).map((c) => c.name)).toEqual(['new', 'history'])
    composer.vm.$emit('command', 'new')
    composer.vm.$emit('command', 'history')
    expect(w.emitted('new')).toHaveLength(1)
    expect(w.emitted('history')).toHaveLength(1)
    composer.vm.$emit('command', 'close')
    await flushPromises()
    expect(writes).toHaveLength(0)
    // ↑ brings back what the caller wrote last here; once they send from this page, that.
    expect(composer.props('recall')).toBe('line one\nline two')
    await w.find('textarea').setValue('Sent just now')
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(composer.props('recall')).toBe('Sent just now')
  })

  it('offers /new and /history in a conversation closed before, too', async () => {
    seat('student')
    server.view = view({ status: 'closed', state: 'answered' })
    const w = mount(ChatPane, { props: { courseId: 'k1', respondent: tutorOffered }, global })
    await flushPromises()
    expect((w.findComponent(ChatComposer).props('commands') as { name: string }[]).map((c) => c.name)).toEqual([
      'new',
      'history',
    ])
  })

  it('lets the one asked only read it: people no longer answer in the chat', async () => {
    seat('tutor', { conversation_answer: 'autonomous' })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.findAll('.chat-msg')).toHaveLength(3)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__notice').text()).toContain('Agents answer questions in the chat now')
    expect(menu(w)).toEqual(['Who can read this'])
  })

  it('keeps a conversation from before with a person readable, closed, saying that conversations are with agents', async () => {
    seat('student')
    server.view = view({
      status: 'closed',
      state: 'closed',
      closed_reason: 'conversations_are_with_agents',
      respondent: { ...view().respondent, member_id: 'ta', display_name: 'Ms Wong', kind: 'human', last_seen_at: null },
    })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.findAll('.chat-msg')).toHaveLength(3)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__typing').exists()).toBe(false)
    expect(w.find('.chat-pane__closed').text()).toContain('This conversation is closed.')
    // One line, read as one: that it is closed, and why.
    expect(w.find('.chat-pane__closed-text').element.tagName).toBe('P')
    expect(w.find('.chat-pane__closed-text').element.textContent).toBe(
      'This conversation is closed. It was with a person, and conversations are with agents now',
    )
    expect(w.find('.chat-pane__closed-reason').text()).toBe(
      'It was with a person, and conversations are with agents now',
    )
    // Nothing more to do in it: not closed again, and no new conversation with a person.
    expect(menu(w)).toEqual(['Who can read this'])
    expect(w.find('.chat-pane__closed button').exists()).toBe(false)
    // Its state, closed, is said beside the name, and nobody is said to be online.
    expect(w.find('.chat-pane__name-row').text()).toContain('Closed')
    expect(w.find('.chat-pane__presence').exists()).toBe(false)
    setLocale('zh-Hant')
    await flushPromises()
    expect(w.find('.chat-pane__closed-reason').text()).toBe('這段對話的對象是真人，而現在對話只與代理進行')
  })

  it('marks it read on opening when Core says the agent wrote since the caller last read it, and says so', async () => {
    seat('student')
    server.view = view({ state: 'answered', unread: true })
    server.messages = [msg(1, 'student'), msg(2, 'tutor')]
    writeAnswer = (tool) =>
      tool === 'conversation.mark_read' ? executed({ read_up_to_seq: 2, unread: false }) : executed({})
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(writes).toEqual([
      { tool: 'conversation.mark_read', args: { course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm2' } },
    ])
    expect(w.emitted('read')).toEqual([['c1']])
  })

  it('marks the answer read when it comes while the conversation is shown, and nothing while it is not', async () => {
    seat('student')
    writeAnswer = (tool) =>
      tool === 'conversation.mark_read' ? executed({ read_up_to_seq: 4, unread: false }) : executed({})
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(writes).toEqual([])
    server.messages = [...server.messages, msg(4, 'tutor', { body: 'An answer' })]
    server.view = view({ state: 'answered' })
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(w.text()).toContain('An answer')
    expect(writes.map((x) => x.args)).toEqual([{ course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm4' }])
    expect(w.emitted('read')).toEqual([['c1']])

    // Off screen (the panel closed): an answer read then is not marked until it is shown again.
    await w.setProps({ active: false })
    server.messages = [...server.messages, msg(5, 'student'), msg(6, 'tutor', { body: 'Another' })]
    await vi.advanceTimersByTimeAsync(30_000)
    expect(writes).toHaveLength(1)
    await w.setProps({ active: true })
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(w.text()).toContain('Another')
    expect(writes.map((x) => x.args.up_to_message_id)).toEqual(['m4', 'm6'])
  })

  it('marks nothing read for staff reading it', async () => {
    seat('staff', { action_decide: 'autonomous' })
    server.view = view({ state: 'answered', unread: true })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1', oversee: true }, global })
    await flushPromises()
    server.messages = [...server.messages, msg(4, 'tutor')]
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(writes).toEqual([])
    expect(w.emitted('read')).toBeUndefined()
  })

  it('says a question was refused because the conversation was closed meanwhile, keeps the draft, and reads again', async () => {
    seat('student')
    writeAnswer = () => {
      throw new ApiError({
        status: 409,
        code: 'conflict',
        message: 'the conversation is closed; start a new one',
        details: { reason: 'closed' },
      })
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const reads = (await import('@/api/http')).read as unknown as { mock: { calls: unknown[][] } }
    const before = reads.mock.calls.length
    const ta = await type(w, 'One more thing')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.body.textContent).toContain('This conversation is closed, so nothing more can be written in it.')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('One more thing')
    expect(reads.mock.calls.length).toBeGreaterThan(before)
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('reads a conversation as staff when overseeing it, and offers to withdraw a message where the seat decides', async () => {
    seat('staff', { action_decide: 'autonomous' })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1', oversee: true }, global })
    await flushPromises()
    expect(w.find('.chat-pane__name').text()).toBe('Chan Tai Man → Course tutor')
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__notice').text()).toContain('You are reading this as course staff.')
    expect(w.findAll('.chat-msg__retract').map((b) => b.text())).toEqual(['Withdraw', 'Withdraw', 'Withdraw'])
    expect(menu(w)).toEqual(['Who can read this'])
  })

  it('names the course beside the agent, where it is given', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1', courseLabel: 'CS101' }, global })
    await flushPromises()
    expect(w.find('.chat-pane__name-row').text()).toMatch(/^CS101\s*·\s*Course tutor/)
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

  it('opens a new conversation with its first message, titled by its first line, and says quietly that nothing runs the agent', async () => {
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
    // Beside its name, not in a box of its own; and no title to fill in.
    expect(w.find('.chat-pane__name-row').text()).toMatch(/^Course tutor\s*Never connected$/)
    expect(w.find('.chat-pane__notice').exists()).toBe(false)
    expect(w.find('.el-alert').exists()).toBe(false)
    expect(w.findAll('input')).toHaveLength(0)
    // A course agent answers others too: the opener is told before writing.
    expect(w.find('.chat-pane__shared').text()).toContain('may repeat to them')
    const ta = await type(w, '\n  What is due Friday?  \nAnd how long should it be?')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes[0]).toEqual({
      tool: 'conversation.open',
      args: {
        course_id: 'k1',
        respondent_member_id: 'tutor',
        body: '  What is due Friday?  \nAnd how long should it be?',
        title: 'What is due Friday?',
      },
    })
    expect(w.emitted('opened')?.[0]).toEqual(['c2'])
  })

  it('keeps its header to one row: the agent, whether it runs, and a menu for who can read it, its answers and closing', async () => {
    seat('student')
    server.view = view({
      title: 'Loops',
      respondent: { ...view().respondent, answer_level: 'confirm_required', last_seen_at: '2026-09-26T11:23:00Z' },
    })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const row = w.find('.chat-pane__name-row')
    expect(row.text()).toMatch(/^Course tutor\s*Last seen 37 minutes ago$/)
    expect(row.attributes('title')).toBe('Loops')
    // An open conversation shows no state; nothing but the row and the menu in the header.
    expect(row.find('.status-tag, .el-tag').exists()).toBe(false)
    expect(w.find('.chat-pane__head').text()).not.toContain('Who can read this conversation')
    expect(w.find('.chat-pane__more').attributes('aria-label')).toBe('Conversation options')
    // Nothing ends it: a new question is a new conversation, or more in this one.
    expect(menu(w)).toEqual(['Who can read this', 'Each answer waits for approval'])
    expect(w.find('.chat-pane__head [role="menuitem"][disabled]').text()).toBe('Each answer waits for approval')

    // Who can read it, in a box of its own.
    await w.findAll('.chat-pane__head [role="menuitem"]')[0]!.trigger('click')
    await flushPromises()
    const readers = document.body.querySelector('.chat-pane__readers')!
    expect(readers.textContent).toContain('Who can read this conversation')
    expect(readers.textContent).toContain('The two taking part')
  })

  it('says an answer is awaited in one quiet line, not that the agent thinks when nothing runs it', async () => {
    seat('student')
    server.view = view({ respondent: { ...view().respondent, last_seen_at: '2026-09-26T09:00:00Z' } })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    // Nothing runs it now: it is waited for, not "thinking", and the line above the composer says nothing more.
    expect(w.find('.chat-pane__notice').exists()).toBe(false)
    expect(w.find('.chat-pane__presence').text()).toBe('Last seen 3 hours ago')
    expect(w.find('.chat-pane__typing .chat-status__label').text()).toBe('Waiting for Course tutor…')
    expect(w.find('textarea').exists()).toBe(true)
  })

  it('says in one muted line what stops the caller writing', async () => {
    seat('student')
    server.view = view({ respondent: { ...view().respondent, seat_status: 'paused' } })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const line = w.find('.chat-pane__notice')
    expect(line.element.tagName).toBe('P')
    expect(line.text()).toBe('Course tutor is paused in this course and cannot answer now.')
    expect(w.find('textarea').attributes('disabled')).toBeDefined()
  })
})

describe('ChatPane, with an agent operated from outside', () => {
  it('puts why in place of the composer, and keeps what was written readable', async () => {
    seat('student')
    server.respondents = []
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.findAll('.chat-msg__text').map((t) => t.text())).toEqual(['message 1', 'line one\nline two'])
    expect(w.find('.chat-msg__markdown strong').text()).toBe('bold')
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe(NOTE)
    // Nothing here will answer: nobody is shown at work.
    expect(w.find('.chat-pane__typing').exists()).toBe(false)
    // Nor is it ended from here.
    expect(menu(w)).toEqual(['Who can read this'])
  })

  it('tells its owner, too, how that would change', async () => {
    seat('student')
    server.view = view({
      respondent: { ...view().respondent, display_name: 'My helper', is_delegate_of_opener: true },
    })
    server.respondents = []
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const note = w.find('.chat-pane__notice.is-elsewhere')
    expect(note.text()).toContain(`${NOTE} When`)
    expect(note.find('.chat-pane__notice-sub').text()).toBe(
      'When AIshie’s runtime hosts it, it takes conversations on the site by itself.',
    )
  })

  it('in Traditional and Simplified Chinese too', async () => {
    seat('student')
    server.respondents = []
    setLocale('zh-Hant')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe(
      '這個代理是從外部工具操作的（例如 Claude 透過 MCP），不在站內對話。',
    )
    setLocale('zh-Hans')
    await flushPromises()
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe(
      '这个智能体是从外部工具操作的（例如 Claude 通过 MCP），不在站内对话。',
    )
  })

  it('keeps the composer while the agent is offered', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('textarea').exists()).toBe(true)
    expect(w.find('.chat-pane__notice.is-elsewhere').exists()).toBe(false)
  })

  it('says why a question was refused as asked of such an agent, and puts that in place of the composer', async () => {
    seat('student')
    writeAnswer = () => {
      // Switched off since the conversation was read: Core leaves it out now.
      server.respondents = []
      throw answersElsewhere()
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const ta = await type(w, 'One more question')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes.map((x) => x.tool)).toEqual(['conversation.ask'])
    expect(document.querySelector('.el-notification')?.textContent).toContain(NOTE)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe(NOTE)
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('says so when a new conversation is refused because the agent answers elsewhere now', async () => {
    seat('student')
    writeAnswer = () => {
      throw answersElsewhere()
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', respondent: tutorOffered }, global })
    await flushPromises()
    const ta = await type(w, 'What is due Friday?')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.querySelector('.el-notification')?.textContent).toContain(NOTE)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__notice').text()).toBe(NOTE)
    expect(w.emitted('opened')).toBeUndefined()
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('offers no new conversation after a closed one with such an agent, and says why', async () => {
    seat('student')
    server.view = view({ status: 'closed', state: 'closed', closed_reason: 'Thanks' })
    server.respondents = []
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('.chat-pane__closed button').exists()).toBe(false)
    expect(w.find('.chat-pane__closed-elsewhere').text()).toBe(NOTE)
  })

  it('never says it of an agent that has left the course, which is why it is not offered', async () => {
    seat('student')
    server.view = view({
      status: 'closed',
      state: 'closed',
      closed_reason: 'seat_removed',
      respondent: { ...view().respondent, seat_status: 'removed' },
    })
    server.respondents = []
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('.chat-pane__closed').text()).toContain('A participant left the course')
    expect(w.find('.chat-pane__closed-elsewhere').exists()).toBe(false)
    expect(w.text()).not.toContain('external tool')
    expect(w.find('.chat-pane__closed button').exists()).toBe(false)
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

  it('shows the count, inside the box beside the send button, only as the draft nears Core’s limit', async () => {
    const w = mount(ChatComposer, { props: { modelValue: 'x'.repeat(17_900) }, global })
    expect(w.find('.chat-composer__count').exists()).toBe(false)
    await w.setProps({ modelValue: 'x'.repeat(19_500) })
    expect(w.find('.chat-composer__bar .chat-composer__count').text()).toContain('19500 / 20000')
    await w.setProps({ modelValue: 'x'.repeat(20_001) })
    expect(w.find('.chat-composer__count').classes()).toContain('is-over')
  })

  it('on a touch screen, leaves Enter to the keyboard’s new line and sends with the button, which names no key', async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('coarse'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    const w = mount(ChatComposer, { props: { modelValue: 'hello' }, global })
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('send')).toBeUndefined()
    const send = w.find('.chat-composer__send')
    expect(send.attributes('aria-keyshortcuts')).toBeUndefined()
    expect(w.find('.chat-composer__bar .tooltip-stub').attributes('data-tip')).toBeUndefined()
    await send.trigger('click')
    expect(w.emitted('send')).toHaveLength(1)
  })

  it('is one box: the text, and along its bottom a small send button, with the keys in its tooltip and no hint below', async () => {
    const w = mount(ChatComposer, { props: { modelValue: 'hello', placeholder: 'Ask Course tutor…' }, global })
    const box = w.find('.chat-composer')
    // Nothing before the text, inside the box or beside it.
    expect([...box.element.children].map((c) => c.className.split(' ')[0])).toEqual([
      'el-textarea',
      'chat-composer__bar',
    ])
    expect(box.find('.el-textarea').element.children[0]!.tagName).toBe('TEXTAREA')
    expect(w.find('textarea').attributes('aria-label')).toBe('Ask Course tutor…')
    const send = w.find('.chat-composer__bar .chat-composer__send')
    expect(send.attributes('aria-label')).toBe('Send')
    expect(send.attributes('aria-keyshortcuts')).toBe('Enter')
    expect(send.text()).toBe('')
    expect(w.find('.chat-composer__bar .tooltip-stub').attributes('data-tip')).toBe(
      'Send (Enter) · Shift+Enter for a new line',
    )
    expect(w.text()).not.toContain('Enter to send')
    expect(w.find('.chat-composer__hint').exists()).toBe(false)
    // Nothing to send, or sending: the button says so, and the tooltip is not offered.
    await w.setProps({ modelValue: '' })
    expect(w.find('.chat-composer__send').attributes('disabled')).toBeDefined()
    await w.setProps({ modelValue: 'hello', pending: true })
    expect(w.find('.chat-composer__send').classes()).toContain('is-loading')
    // Disabled, the box is too.
    await w.setProps({ pending: false, disabled: true })
    expect(w.find('.chat-composer').classes()).toContain('is-disabled')
    expect(w.find('textarea').attributes('disabled')).toBeDefined()
  })
})
