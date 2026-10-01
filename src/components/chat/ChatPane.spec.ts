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
    // A conversation's files, uploaded at once (conversation.upload_url, then a PUT); Core takes 5 000 bytes a file.
    uploadFile: vi.fn(async (_course: string, _kind: string, file: File) => ({
      uploadToken: `tok-${file.name}`,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    })),
    uploadLimits: vi.fn(async () => ({ maxBytes: 5_000, maxFiles: 10, maxConversationBytes: 50_000 })),
    uploadLimit: vi.fn(async () => 5_000),
  }
})

// The print window, as "Download as PDF" opens it: what it was asked to lay out.
const printed: Record<string, any>[] = []
vi.mock('@/utils/printLayout', async (orig) => {
  const real = await orig<typeof import('@/utils/printLayout')>()
  return { ...real, printDocument: vi.fn(async (src: Record<string, any>) => void printed.push(src)) }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { default: ChatPane } = await import('./ChatPane.vue')
const { default: ChatComposer } = await import('./ChatComposer.vue')
const { forgetSent } = await import('./chat')
const { forgetAttachments, rememberSent } = await import('./attachments')

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
  hosting: 'runtime',
  answer_level: 'autonomous',
  last_seen_at: '2026-09-26T11:59:30Z',
}

/** Core's refusal of a question to an agent nobody asks in the site now: one with MCP access, or not running. */
const notAskable = (reason: 'mcp_agent' | 'agent_not_hosted' = 'agent_not_hosted') =>
  new ApiError({
    status: 422,
    code: 'failed_precondition',
    message: 'that agent is not asked in the site now',
    details: { reason },
    actionId: 'a7',
    actionStatus: 'failed',
  })
/** What is said of an agent nobody asks here now, when nothing says why. */
const NOTE = 'This agent can’t be asked here just now.'
const NOT_RUNNING = 'This agent isn’t running right now, so it can’t be asked here.'
const MCP = 'This agent is used from its owner’s own tools, and can’t be asked here.'

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
  printed.length = 0
  forgetSent()
  forgetAttachments()
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

const pdf = (name: string, type = 'application/pdf', size = 120) => new File([new Uint8Array(size)], name, { type })
/** A DataTransfer as the browser hands one to a drop (jsdom has none). */
function transfer(files: File[]) {
  return {
    types: ['Files'],
    files,
    items: files.map((f) => ({ kind: 'file', getAsFile: () => f, webkitGetAsEntry: () => ({ isDirectory: false }) })),
    dropEffect: 'none',
  } as unknown as DataTransfer
}
/** Until files added are up (their uploads are answered at once here). */
async function settle() {
  for (let i = 0; i < 6; i++) await flushPromises()
}

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

  it('downloads the conversation as a PDF: each message under who wrote it and when, through the print window', async () => {
    seat('student')
    server.messages = [
      msg(1, 'student', {
        body: 'What is <b>recursion</b>?',
        attachments: [
          { id: 'f1', filename: 'notes.pdf', content_type: 'application/pdf', byte_size: 9, created_at: 'x' },
        ],
      }),
      msg(2, 'tutor', { body: '**A function** that calls itself.' }),
      msg(3, 'student', { body: '', retracted: { at: '2026-09-26T11:59:30Z', by_member_id: 'student' } }),
    ]
    server.view = view({ title: 'Recursion' })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const item = w.findAll('.chat-pane__head [role="menuitem"]').find((b) => b.text() === 'Download as PDF')!
    await item.trigger('click')
    await flushPromises()
    expect(printed).toHaveLength(1)
    const src = printed[0]!
    expect(src.title).toBe('Recursion')
    expect(src.lang).toBe('en')
    expect(src.lines.filter(Boolean)).toEqual([
      'Conversation with Course tutor',
      'CS101 · Programming',
      expect.stringMatching(/2026.*· 3 messages$/),
    ])
    const html = src.body.html as string
    // Who wrote each, in order; the person's words as they are, escaped; the agent's as Markdown.
    const who = [...html.matchAll(/print-entry__who">([^<]*)</g)].map((m) => m[1])
    expect(who).toEqual(['You ', 'Course tutor ', 'You '])
    expect(html).toContain('What is &lt;b&gt;recursion&lt;/b&gt;?')
    expect(html).toContain('<strong>A function</strong> that calls itself.')
    expect(html).toContain('Files: notes.pdf')
    expect(html).toContain('<em>Withdrawn</em>')
  })

  it('lets the one asked only read it: people no longer answer in the chat', async () => {
    seat('tutor', { conversation_answer: 'autonomous' })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.findAll('.chat-msg')).toHaveLength(3)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__notice').text()).toContain('Agents answer questions in the chat now')
    expect(menu(w)).toEqual(['Who can read this', 'Download as PDF'])
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
    expect(menu(w)).toEqual(['Who can read this', 'Download as PDF'])
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
    expect(menu(w)).toEqual(['Who can read this', 'Download as PDF'])
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
      hosting: 'runtime',
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
    expect(menu(w)).toEqual(['Who can read this', 'Download as PDF', 'Each answer waits for approval'])
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

describe('ChatPane, with an agent nobody asks in the site now', () => {
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
    expect(menu(w)).toEqual(['Who can read this', 'Download as PDF'])
  })

  it('tells its owner, too, where to find why', async () => {
    seat('student')
    server.view = view({
      respondent: { ...view().respondent, display_name: 'My helper', is_delegate_of_opener: true },
    })
    server.respondents = []
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const note = w.find('.chat-pane__notice.is-elsewhere')
    expect(note.text()).toContain(`${NOTE} Its page`)
    expect(note.find('.chat-pane__notice-sub').text()).toBe('Its page, under My agents, says why.')
  })

  it('in Traditional and Simplified Chinese too', async () => {
    seat('student')
    server.respondents = []
    setLocale('zh-Hant')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe('目前無法在這裡向這個代理提問。')
    setLocale('zh-Hans')
    await flushPromises()
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe('目前无法在这里向这个智能体提问。')
  })

  it('keeps the composer while the agent is offered', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('textarea').exists()).toBe(true)
    expect(w.find('.chat-pane__notice.is-elsewhere').exists()).toBe(false)
  })

  it('says why a question was refused as asked of an agent not running now, and puts that in place of the composer', async () => {
    seat('student')
    writeAnswer = () => {
      // Its hosting ended since the conversation was read: Core leaves it out now.
      server.respondents = []
      throw notAskable('agent_not_hosted')
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.find('.chat-pane__presence').text()).toBe('Online')
    const ta = await type(w, 'One more question')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes.map((x) => x.tool)).toEqual(['conversation.ask'])
    expect(document.querySelector('.el-notification')?.textContent).toContain(NOT_RUNNING)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe(NOT_RUNNING)
    // Nor is it said to be online: it was seen moments ago, but nobody can ask it here now.
    expect(w.find('.chat-pane__presence').exists()).toBe(false)
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('says a question to an agent with MCP access is never asked here', async () => {
    seat('student')
    writeAnswer = () => {
      server.respondents = []
      throw notAskable('mcp_agent')
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    const ta = await type(w, 'One more question')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.querySelector('.el-notification')?.textContent).toContain(MCP)
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe(MCP)
    setLocale('zh-Hant')
    await flushPromises()
    expect(w.find('.chat-pane__notice.is-elsewhere').text()).toBe('這個代理由擁有者自己的工具使用，無法在這裡向它提問。')
  })

  it('says so when a new conversation is refused because the agent is not running now', async () => {
    seat('student')
    writeAnswer = () => {
      throw notAskable('agent_not_hosted')
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', respondent: tutorOffered }, global })
    await flushPromises()
    const ta = await type(w, 'What is due Friday?')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.querySelector('.el-notification')?.textContent).toContain(NOT_RUNNING)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.chat-pane__notice').text()).toBe(NOT_RUNNING)
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
    expect(w.text()).not.toContain('can’t be asked here')
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
  // --- Files ------------------------------------------------------------------------

  it('sends a question with the files dropped on it, by their tokens and names in order, and empties the chips', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global, attachTo: document.body })
    await flushPromises()
    // While dragged over it, it says where they go.
    const dt = transfer([pdf('notes.pdf'), pdf('plot.png', 'image/png')])
    await w.trigger('dragenter', { dataTransfer: dt })
    expect(w.find('.chat-pane__drop').text()).toBe('Drop to attach to your message')
    await w.trigger('drop', { dataTransfer: dt })
    await settle()
    expect(w.find('.chat-pane__drop').exists()).toBe(false)
    expect(w.findAll('.chat-chip.is-done').map((c) => c.find('.chat-chip__name').text())).toEqual([
      'notes.pdf',
      'plot.png',
    ])
    const ta = await type(w, 'Are these right?')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'conversation.ask',
        args: {
          course_id: 'k1',
          conversation_id: 'c1',
          body: 'Are these right?',
          attachments: [
            { upload_token: 'tok-notes.pdf', filename: 'notes.pdf' },
            { upload_token: 'tok-plot.png', filename: 'plot.png' },
          ],
        },
      },
    ])
    expect(w.findAll('.chat-chip')).toHaveLength(0)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('opens a new conversation with its first message’s files', async () => {
    seat('student')
    writeAnswer = () => executed({ conversation_id: 'c2', message_id: 'm1' })
    const w = mount(ChatPane, { props: { courseId: 'k1', respondent: tutorOffered }, global })
    await flushPromises()
    ;(w.vm as unknown as { takeFiles: (f: File[]) => void }).takeFiles([pdf('essay.pdf')])
    await settle()
    const ta = await type(w, 'Is my essay on topic?')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes[0]).toEqual({
      tool: 'conversation.open',
      args: {
        course_id: 'k1',
        respondent_member_id: 'tutor',
        body: 'Is my essay on topic?',
        attachments: [{ upload_token: 'tok-essay.pdf', filename: 'essay.pdf' }],
        title: 'Is my essay on topic?',
      },
    })
    expect(w.emitted('opened')?.[0]).toEqual(['c2'])
  })

  it('sends nothing with files and no words, and asks for a line to go with them', async () => {
    seat('student')
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    ;(w.vm as unknown as { takeFiles: (f: File[]) => void }).takeFiles([pdf('notes.pdf')])
    await settle()
    expect(w.find('textarea').attributes('placeholder')).toBe('What would you like Course tutor to do with this file?')
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(writes).toEqual([])
    expect(w.find('.chat-composer__file-line').text()).toContain('Add a line to go with the file')
  })

  it('says a refusal because of its files under the chips, and keeps the words and the files to send again', async () => {
    seat('student')
    writeAnswer = () => {
      throw new ApiError({
        status: 422,
        code: 'failed_precondition',
        message: 'the file is 4000 bytes; a message carries files of at most 3000',
        details: { reason: 'file_too_large', byte_size: 4000, max_bytes: 3000 },
        actionId: 'a5',
        actionStatus: 'failed',
      })
    }
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    ;(w.vm as unknown as { takeFiles: (f: File[]) => void }).takeFiles([
      pdf('small.pdf'),
      pdf('big.pdf', 'application/pdf', 4000),
    ])
    await settle()
    const ta = await type(w, 'Here they are')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(w.find('.chat-composer__file-line').text()).toBe(
      'A file is larger than a message may carry (2.9 KB): remove it, or attach a smaller one.',
    )
    expect(w.findAll('.chat-chip').map((c) => c.classes().find((k) => k.startsWith('is-')))).toEqual([
      'is-done',
      'is-failed',
    ])
    expect(w.find('.chat-chips__error').text()).toBe(
      '“big.pdf” was not uploaded: Too large to upload: it is 3.9 KB, and a file can be at most 2.9 KB.',
    )
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('Here they are')
    // Said there, not in a box of its own.
    expect(document.body.querySelector('.el-notification')).toBeNull()
  })

  it('keeps the names of the files of a question that waits for approval', async () => {
    seat('student')
    writeAnswer = () => ({ status: 'proposed', actionId: 'a9', reviewState: 'none', replayed: false })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    ;(w.vm as unknown as { takeFiles: (f: File[]) => void }).takeFiles([pdf('notes.pdf')])
    await settle()
    const ta = await type(w, 'Is this allowed?')
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(w.find('.chat-pane__held-files').text()).toBe('With 1 file: notes.pdf')
    expect(w.findAll('.chat-chip')).toHaveLength(0)
  })

  it('takes no files where the caller only reads', async () => {
    seat('staff', { action_decide: 'autonomous' })
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1', oversee: true }, global })
    await flushPromises()
    const dt = transfer([pdf('notes.pdf')])
    await w.trigger('dragenter', { dataTransfer: dt })
    expect(w.find('.chat-pane__drop').exists()).toBe(false)
    await w.trigger('drop', { dataTransfer: dt })
    await settle()
    expect(w.findAll('.chat-chip')).toHaveLength(0)
    expect((w.vm as unknown as { canTakeFiles: boolean }).canTakeFiles).toBe(false)
  })

  it('brings a question’s files back with it to the composer, uploaded again, where they were sent from here', async () => {
    seat('student')
    server.messages = [
      msg(1, 'student'),
      msg(2, 'tutor', { body: 'answer' }),
      msg(3, 'student', {
        body: 'Look at this',
        attachments: [
          { id: 'f1', filename: 'notes.pdf', content_type: 'application/pdf', byte_size: 120, created_at: 'x' },
        ],
      }),
    ]
    rememberSent('m3', [pdf('notes.pdf')])
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    expect(w.findAll('.chat-msg').at(-1)!.find('.msg-file').text()).toContain('notes.pdf')
    writeAnswer = () => executed({ ok: true })
    await w.find('.chat-msg__edit').trigger('click')
    await settle()
    // Withdrawn: shown without its text or its file; both back in the box.
    expect(w.find('.chat-msg.is-retracted .msg-file').exists()).toBe(false)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('Look at this')
    expect(w.findAll('.chat-chip').map((c) => c.find('.chat-chip__name').text())).toEqual(['notes.pdf'])
    expect(document.body.querySelector('.el-message')?.textContent).toContain(
      'Its files are back in the box, uploading again.',
    )
  })

  it('says to attach a question’s files again where they were not sent from here', async () => {
    seat('student')
    server.messages = [
      msg(3, 'student', {
        body: 'Look at this',
        attachments: [
          { id: 'f1', filename: 'notes.pdf', content_type: 'application/pdf', byte_size: 120, created_at: 'x' },
        ],
      }),
    ]
    const w = mount(ChatPane, { props: { courseId: 'k1', conversationId: 'c1' }, global })
    await flushPromises()
    writeAnswer = () => executed({ ok: true })
    await w.find('.chat-msg__edit').trigger('click')
    await settle()
    expect(w.findAll('.chat-chip')).toHaveLength(0)
    expect(document.body.querySelector('.el-message')?.textContent).toContain(
      'Its files were withdrawn with it: attach them again to send them.',
    )
  })
})
