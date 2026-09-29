import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import type { ConversationView, MyConversation, Respondent } from '@/api/types'

let respondents: Respondent[] = []
/** The caller's conversations (me.conversations), and whether each is unread. */
let mine: MyConversation[] = []
const reads: { tool: string; args: Record<string, unknown> }[] = []
const writes: { tool: string; args: Record<string, unknown> }[] = []

/** Conversation c1, as conversation.get and conversation.messages give it: the tutor has answered. */
const c1: ConversationView = {
  id: 'c1',
  status: 'open',
  state: 'answered',
  created_at: '2026-09-26T11:00:00Z',
  last_message_at: '2026-09-26T11:01:00Z',
  last_author_member_id: 'tutor',
  opener: { member_id: 'me-k1', display_name: 'Ada', kind: 'human' },
  respondent: {
    member_id: 'tutor',
    display_name: 'Course tutor',
    kind: 'agent',
    role: 'assistant',
    seat_status: 'active',
    is_delegate_of_opener: false,
    answer_level: 'autonomous',
  },
}

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push({ tool, args })
      if (tool === 'conversation.respondents') return { respondents }
      if (tool === 'agent.list') return { agents: [] }
      if (tool === 'me.conversations') {
        return { conversations: mine.filter((c) => !args.course_id || c.course.course_id === args.course_id) }
      }
      if (tool === 'conversation.get') return { ...c1, unread: mine.some((c) => c.unread), visible_to: [] }
      if (tool === 'conversation.messages') {
        return {
          conversation: c1,
          more: false,
          messages: [
            { id: 'm1', seq: 1, author_member_id: 'me-k1', body: 'When is it due?', created_at: c1.created_at },
            { id: 'm2', seq: 2, author_member_id: 'tutor', body: 'On Friday.', created_at: c1.created_at },
          ],
        }
      }
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      if (tool !== 'conversation.mark_read') throw new Error(`no answer for ${tool}`)
      mine = mine.map((c) => (c.conversation_id === args.conversation_id ? { ...c, unread: false } : c))
      return {
        status: 'executed',
        actionId: 'a1',
        reviewState: 'none',
        replayed: false,
        result: { read_up_to_seq: 2, unread: false },
      }
    }),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { useChatStore, UNREAD_PAGE } = await import('@/stores/chat')
const { UNREAD_POLL_MS } = await import('./panel')
const { default: ChatPanel } = await import('./ChatPanel.vue')

const Passthrough = (name: string) =>
  defineComponent({
    name,
    setup:
      (_, { slots }) =>
      () =>
        h('span', slots.default?.()),
  })
const View = { render: () => null }

const tutor: Respondent = {
  member_id: 'tutor',
  display_name: 'Course tutor',
  kind: 'agent',
  role: 'assistant',
  is_my_delegate: false,
  answers_course: true,
  answer_level: 'autonomous',
  last_seen_at: null,
}

function membership(
  courseId: string,
  code: string,
  perms: Record<string, string> = { conversation_ask: 'autonomous' },
) {
  return {
    member_id: `me-${courseId}`,
    course_id: courseId,
    code,
    section: '',
    title: `${code} course`,
    role: 'student',
    status: 'active',
    course_status: 'active',
    perms,
  } as never
}

/** A phone's width or not: whether the panel is a sheet. */
function screen(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: phone && query.includes('max-width'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

async function setup(opts: { at?: string; phone?: boolean; width?: number } = {}) {
  screen(!!opts.phone)
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: opts.width ?? 1400 })
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = { id: 'ada', kind: 'human', display_name: 'Ada' } as never
  session.memberships = [
    membership('k1', 'CS101'),
    membership('k2', 'CS202'),
    // No asking here: never offered.
    membership('k3', 'CS303', { conversation_ask: 'denied' }),
  ]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View },
      { path: '/courses/:courseId', name: 'course-overview', component: View },
      { path: '/courses/:courseId/grades', name: 'course-grades', component: View },
    ],
  })
  await router.push(opts.at ?? '/')
  const w = mount(ChatPanel, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, i18n, ElementPlus],
      components: icons,
      stubs: { ElTooltip: Passthrough('ElTooltip'), RouterLink: Passthrough('RouterLink') },
    },
  })
  await flushPromises()
  return { w, router, chat: useChatStore() }
}

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}
const frame = () => JSON.parse(localStorage.getItem('aishiteru.chatPanel') ?? 'null')
/** A pointer event as a mouse makes it (jsdom has no PointerEvent). */
async function pointer(el: { element: Element }, type: string, clientX: number) {
  el.element.dispatchEvent(new MouseEvent(type, { clientX, button: 0, bubbles: true, cancelable: true }))
  await flushPromises()
}

/** One of Ada's conversations as me.conversations lists it. */
function myConversation(id: string, unread: boolean): MyConversation {
  return {
    conversation_id: id,
    member_id: 'me-k1',
    course: { course_id: 'k1', code: 'CS101', section: '', title: 'CS101 course' },
    respondent: { member_id: 'tutor', actor_id: 'tutor-actor', display_name: 'Course tutor', kind: 'agent' },
    status: 'open',
    state: 'answered',
    created_at: '2026-09-26T11:00:00Z',
    last_activity_at: '2026-09-26T11:01:00Z',
    unread,
    may_ask: true,
  }
}

beforeEach(() => {
  localStorage.clear()
  setLocale('en')
  reads.length = 0
  writes.length = 0
  respondents = [tutor]
  mine = []
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChatPanel', () => {
  it('opens and closes with Ctrl/⌘+J and its close button, and remembers which', async () => {
    const { w, chat } = await setup()
    expect(w.find('#chat-panel').exists()).toBe(false)

    press('j', { ctrlKey: true })
    await flushPromises()
    expect(chat.open).toBe(true)
    expect(w.find('#chat-panel').exists()).toBe(true)
    expect(frame()).toMatchObject({ open: true })

    await w.find('.chat-panel__close').trigger('click')
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
    expect(frame()).toMatchObject({ open: false })

    press('j', { metaKey: true })
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(true)
    press('j', { ctrlKey: true })
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
    // Other keys do nothing.
    press('j')
    press('k', { ctrlKey: true })
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
  })

  it('gives focus back to the button that opens it (the rail’s, or on a phone the floating one) when it closes', async () => {
    const { w } = await setup()
    // AppLayout's button, wherever it is.
    const toggle = document.createElement('button')
    toggle.id = 'chat-panel-toggle'
    document.body.appendChild(toggle)
    press('j', { ctrlKey: true })
    await flushPromises()
    expect(w.find('#chat-panel').element.contains(document.activeElement)).toBe(true)
    await w.find('.chat-panel__close').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(toggle)
    // And after Ctrl/⌘+J.
    press('j', { ctrlKey: true })
    await flushPromises()
    press('j', { metaKey: true })
    await flushPromises()
    expect(document.activeElement).toBe(toggle)
  })

  it('opens as this browser left it, open and as wide', async () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true, width: 480 }))
    const { w } = await setup()
    const panel = w.find('#chat-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('style')).toContain('width: 480px')
    expect(w.find('[role="separator"]').attributes('aria-valuenow')).toBe('480')
  })

  it('is docked beside the page, and resized by its edge within its bounds, with the keys or by dragging', async () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true, width: 400 }))
    const { w, chat } = await setup({ width: 1400 })
    const edge = w.find('[role="separator"]')
    expect(w.find('#chat-panel').classes()).not.toContain('is-sheet')
    expect(w.find('#chat-panel').attributes('role')).toBe('complementary')
    expect(edge.attributes('aria-orientation')).toBe('vertical')
    expect(edge.attributes('aria-valuemin')).toBe('320')
    expect(edge.attributes('aria-valuemax')).toBe('700')
    expect(edge.attributes('tabindex')).toBe('0')

    await edge.trigger('keydown', { key: 'ArrowLeft' })
    expect(edge.attributes('aria-valuenow')).toBe('416')
    await edge.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(edge.attributes('aria-valuenow')).toBe('352')
    await edge.trigger('keydown', { key: 'End' })
    expect(edge.attributes('aria-valuenow')).toBe('700')
    await edge.trigger('keydown', { key: 'Home' })
    expect(edge.attributes('aria-valuenow')).toBe('320')
    await edge.trigger('keydown', { key: 'ArrowRight' })
    expect(edge.attributes('aria-valuenow')).toBe('320')
    expect(frame()).toEqual({ open: true, width: 320 })

    // Dragged far past half the window: half the window.
    await pointer(edge, 'pointerdown', 1000)
    await pointer(edge, 'pointermove', 100)
    expect(edge.attributes('aria-valuenow')).toBe('700')
    expect(document.body.classList.contains('is-resizing-chat')).toBe(true)
    await pointer(edge, 'pointerup', 100)
    expect(chat.width).toBe(700)
    expect(frame()).toEqual({ open: true, width: 700 })
    expect(document.body.classList.contains('is-resizing-chat')).toBe(false)
    // And narrower than the least: the least.
    await pointer(edge, 'pointerdown', 700)
    await pointer(edge, 'pointermove', 1390)
    await pointer(edge, 'pointerup', 1390)
    expect(chat.width).toBe(320)
  })

  it('asks in the course of the page it is on, and elsewhere in the course last used', async () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true, width: 400 }))
    // Kept in this browser for Ada, as it is: not what she has read, which Core keeps.
    localStorage.setItem('aishiteru.chatCourse.ada', 'k2')
    const home = await setup({ at: '/' })
    expect(home.chat.courseId).toBe('k2')
    expect(home.w.find('.chat-panel__course input').element.getAttribute('aria-label')).toBe('Course')
    // Only the courses where the caller may ask are offered.
    expect(home.chat.courses.map((m) => m.course_id)).toEqual(['k1', 'k2'])
    home.w.unmount()

    const onCourse = await setup({ at: '/courses/k1' })
    expect(onCourse.chat.courseId).toBe('k1')
    expect(onCourse.w.find('.chat-panel__hint').text()).toContain('CS101')
    expect(reads.filter((r) => r.tool === 'conversation.respondents').map((r) => r.args.course_id)).toContain('k1')
    await onCourse.router.push('/courses/k2/grades')
    await flushPromises()
    expect(onCourse.chat.courseId).toBe('k2')
    // Leaving the course pages keeps the course.
    await onCourse.router.push('/')
    await flushPromises()
    expect(onCourse.chat.courseId).toBe('k2')
  })

  it('offers the course’s agents, and writes to the one chosen', async () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true, width: 400 }))
    const { w, chat } = await setup({ at: '/courses/k1' })
    const row = w.find('button.resp-row')
    expect(row.text()).toContain('Course tutor')
    await row.trigger('click')
    await flushPromises()
    expect(chat.draft).toMatchObject({ courseId: 'k1', agent: { member_id: 'tutor' } })
    expect(w.find('.chat-pane__name-row').text()).toMatch(/^CS101\s*·\s*Course tutor/)
    expect(w.find('.chat-pane__title-input').exists()).toBe(true)
    expect(w.find('textarea').exists()).toBe(true)
    // New chat goes back to choosing an agent.
    await w.find('.chat-panel__new').trigger('click')
    expect(chat.draft).toBeNull()
    expect(w.find('button.resp-row').exists()).toBe(true)
  })

  it('shows the history and back, from its toggle', async () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true, width: 400 }))
    const { w, chat } = await setup({ at: '/courses/k1' })
    const toggle = w.findAll('.chat-panel__icon').find((b) => b.attributes('aria-label') === 'History')!
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    await flushPromises()
    expect(chat.screen).toBe('history')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(w.find('.chat-history').exists()).toBe(true)
    // The course's history, from the caller's conversations in every course.
    expect(reads.filter((r) => r.tool === 'me.conversations' && r.args.course_id).map((r) => r.args)).toEqual([
      { course_id: 'k1', limit: 50 },
    ])
    await toggle.trigger('click')
    expect(chat.screen).toBe('new')
  })

  it('is a sheet over the whole screen on a phone, which closes with its button or Escape', async () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true, width: 400 }))
    const { w, chat, router } = await setup({ phone: true, width: 390 })
    const panel = w.find('#chat-panel')
    expect(panel.classes()).toContain('is-sheet')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')
    expect(panel.attributes('style')).toBeUndefined()
    expect(w.find('[role="separator"]').exists()).toBe(false)
    press('Escape')
    await flushPromises()
    expect(chat.open).toBe(false)

    chat.setOpen(true)
    await flushPromises()
    await w.find('.chat-panel__close').trigger('click')
    expect(chat.open).toBe(false)

    // A link followed from it leads to its page, which the sheet gives way to.
    chat.setOpen(true)
    await router.push('/courses/k1/grades')
    await flushPromises()
    expect(chat.open).toBe(false)
  })

  it('counts what is unread from the newest of the caller’s conversations, read again every 30 seconds, open or not', async () => {
    vi.useFakeTimers()
    try {
      mine = [myConversation('c1', true), myConversation('c2', false)]
      const { chat } = await setup()
      expect(chat.open).toBe(false)
      expect(reads.filter((r) => r.tool === 'me.conversations').map((r) => r.args)).toEqual([{ limit: UNREAD_PAGE }])
      expect(chat.unreadCount).toBe(1)
      // Read elsewhere: counted no more once read again.
      mine = [myConversation('c1', false), myConversation('c2', true), myConversation('c3', true)]
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS - 1000)
      expect(chat.unreadCount).toBe(1)
      await vi.advanceTimersByTimeAsync(1000)
      expect(chat.unreadCount).toBe(2)
      expect(reads.filter((r) => r.tool === 'me.conversations')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks for nothing unread where the caller may ask in no course', async () => {
    vi.useFakeTimers()
    try {
      const { chat } = await setup()
      reads.length = 0
      useSessionStore().memberships = [membership('k3', 'CS303', { conversation_ask: 'denied' })]
      await flushPromises()
      expect(chat.courses).toEqual([])
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 3)
      expect(reads.filter((r) => r.tool === 'me.conversations')).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('marks a conversation read once it is shown, and counts it no more', async () => {
    mine = [myConversation('c1', true)]
    const { w, chat } = await setup()
    expect(chat.unreadCount).toBe(1)
    chat.showConversation('k1', 'c1', { open: true })
    await flushPromises()
    expect(w.text()).toContain('On Friday.')
    expect(writes).toEqual([
      { tool: 'conversation.mark_read', args: { course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm2' } },
    ])
    // Not counted, with it shown or once the panel is closed.
    expect(chat.unreadCount).toBe(0)
    chat.setOpen(false)
    await flushPromises()
    expect(chat.unreadCount).toBe(0)
  })

  it('says so where the caller may ask in no course', async () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true, width: 400 }))
    const { w, chat } = await setup()
    useSessionStore().memberships = [membership('k3', 'CS303', { conversation_ask: 'denied' })]
    await flushPromises()
    expect(chat.courses).toEqual([])
    expect(w.text()).toContain('None of your courses lets you ask agents questions.')
    // Nor is the shortcut taken once it is closed.
    chat.setOpen(false)
    press('j', { ctrlKey: true })
    await flushPromises()
    expect(chat.open).toBe(false)
  })
})
