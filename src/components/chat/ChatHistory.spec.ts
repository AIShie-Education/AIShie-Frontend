import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { MyConversation } from '@/api/types'

// The caller's conversations as Core lists them (me.conversations): the
// latest activity first, a page at a time, of one course when asked.
let mine: MyConversation[] = []
let fail: Error | null = null
const reads: { tool: string; args: Record<string, unknown> }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push({ tool, args })
      if (tool !== 'me.conversations') throw new Error(`no answer for ${tool}`)
      if (fail) throw fail
      const list = mine.filter((c) => !args.course_id || c.course.course_id === args.course_id)
      const from = args.after ? Number(String(args.after).slice(1)) : 0
      const limit = (args.limit as number) ?? 50
      return {
        conversations: list.slice(from, from + limit),
        ...(from + limit < list.length ? { next: `p${from + limit}` } : {}),
      }
    }),
  }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { useChatStore, HISTORY_PAGE } = await import('@/stores/chat')
const { LIST_POLL_MS } = await import('./useConversationList')
const { default: ChatHistory } = await import('./ChatHistory.vue')

const COURSES: Record<string, [string, string]> = { k1: ['CS101', ''], k2: ['MA201', ''], k3: ['PH110', ''] }

function membership(courseId: string, code: string, section = '') {
  return {
    member_id: `me-${courseId}`,
    course_id: courseId,
    code,
    section,
    title: `${code} course`,
    role: 'student',
    status: 'active',
    course_status: 'active',
    perms: { conversation_ask: 'autonomous' },
  } as never
}

function conv(
  id: string,
  courseId: string,
  agent: string,
  at: string,
  over: Partial<MyConversation> = {},
  kind = 'agent',
): MyConversation {
  const [code, section] = COURSES[courseId]!
  return {
    conversation_id: id,
    member_id: `me-${courseId}`,
    course: { course_id: courseId, code, section, title: `${code} course` },
    respondent: { member_id: `${agent}-seat`, actor_id: `${agent}-actor`, display_name: agent, kind },
    title: `About ${id}`,
    status: 'open',
    state: 'answered',
    created_at: '2026-09-01T00:00:00Z',
    last_activity_at: at,
    unread: false,
    may_ask: true,
    ...over,
  }
}

function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = { id: 'ada', kind: 'human', display_name: 'Ada' } as never
  session.memberships = [membership('k1', 'CS101'), membership('k2', 'MA201'), membership('k3', 'PH110')]
  const chat = useChatStore()
  chat.followPage('k1')
  const w = mount(ChatHistory, { global: { plugins: [pinia, i18n, ElementPlus], components: icons } })
  return { w, chat }
}

const where = (w: ReturnType<typeof setup>['w']) =>
  w.findAll('.hist-row').map((r) => r.find('.hist-row__where').text().replace(/\s+/g, ' '))

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  setLocale('en')
  reads.length = 0
  fail = null
  localStorage.clear()
  // Newest first, as Core lists them.
  mine = [
    // A person asked before the chat was only for agents, closed since: not listed.
    conv(
      'c4',
      'k1',
      'Ms Wong',
      '2026-09-26T00:00:00Z',
      { status: 'closed', state: 'closed', closed_reason: 'conversations_are_with_agents', unread: true },
      'human',
    ),
    // Answered since Ada last read it.
    conv('c3', 'k1', 'Lab helper', '2026-09-25T00:00:00Z', { unread: true }),
    conv('c2', 'k2', 'Maths tutor', '2026-09-22T00:00:00Z', { state: 'awaiting_answer' }),
    conv('c1', 'k1', 'Course tutor', '2026-09-20T00:00:00Z'),
    conv('c5', 'k3', 'Physics tutor', '2026-09-10T00:00:00Z'),
  ]
})
enableAutoUnmount(afterEach)
afterEach(() => vi.useRealTimers())

describe('ChatHistory', () => {
  it('lists the conversations with agents in the course asked in, each as course · agent, newest first', async () => {
    const { w } = setup()
    await flushPromises()
    expect(reads).toEqual([{ tool: 'me.conversations', args: { course_id: 'k1', limit: HISTORY_PAGE } }])
    expect(where(w)).toEqual(['CS101 · Lab helper', 'CS101 · Course tutor'])
    const rows = w.findAll('.hist-row')
    expect(rows[0]!.find('.hist-row__title').text()).toBe('About c3')
    expect(rows[1]!.text()).toContain('Answered')
    expect(w.text()).not.toContain('Ms Wong')
  })

  it('marks an answer Core says is not read yet', async () => {
    const { w, chat } = setup()
    await flushPromises()
    const [unread, read] = w.findAll('.hist-row')
    expect(unread!.classes()).toContain('is-unread')
    expect(unread!.find('.hist-row__unread').text()).toBe('New answer')
    expect(unread!.find('.hist-row__dot').exists()).toBe(true)
    expect(read!.classes()).not.toContain('is-unread')
    expect(chat.unreadCount).toBe(1)

    // Read here: at once no longer marked.
    chat.markedRead('c3')
    await flushPromises()
    expect(w.find('.hist-row.is-unread').exists()).toBe(false)
  })

  it('lists every course’s in one call, newest first, and one course’s again on the way back', async () => {
    const { w, chat } = setup()
    await flushPromises()
    chat.historyScope = 'all'
    await flushPromises()
    expect(reads.at(-1)).toEqual({ tool: 'me.conversations', args: { limit: HISTORY_PAGE } })
    expect(where(w)).toEqual([
      'CS101 · Lab helper',
      'MA201 · Maths tutor',
      'CS101 · Course tutor',
      'PH110 · Physics tutor',
    ])
    expect(w.findAll('.hist-row')[1]!.text()).toContain('Awaiting an answer')

    chat.historyScope = 'course'
    await flushPromises()
    expect(reads.at(-1)!.args).toEqual({ course_id: 'k1', limit: HISTORY_PAGE })
    expect(where(w)).toEqual(['CS101 · Lab helper', 'CS101 · Course tutor'])
  })

  it('reads a page more on request, and offers none past the last', async () => {
    mine = Array.from({ length: HISTORY_PAGE + 3 }, (_, i) =>
      conv(`c${i}`, 'k1', 'Course tutor', new Date(Date.UTC(2026, 8, 26) - i * 60_000).toISOString()),
    )
    const { w } = setup()
    await flushPromises()
    expect(w.findAll('.hist-row')).toHaveLength(HISTORY_PAGE)
    const more = w.find('.load-more button')
    expect(more.text()).toBe('Load more')
    await more.trigger('click')
    await flushPromises()
    expect(reads.at(-1)!.args).toEqual({ course_id: 'k1', limit: HISTORY_PAGE, after: `p${HISTORY_PAGE}` })
    expect(w.findAll('.hist-row')).toHaveLength(HISTORY_PAGE + 3)
    expect(w.find('.load-more').exists()).toBe(false)
  })

  it('says it could not be read, with a retry that reads it', async () => {
    fail = new ApiError({ status: 500, code: 'internal', message: 'boom' })
    const { w } = setup()
    await flushPromises()
    expect(w.findAll('.hist-row')).toHaveLength(0)
    expect(w.text()).toContain('Something went wrong')
    fail = null
    const retry = w.findAll('button').find((b) => b.text() === 'Retry')!
    await retry.trigger('click')
    await flushPromises()
    expect(where(w)).toEqual(['CS101 · Lab helper', 'CS101 · Course tutor'])
  })

  it('reads again while it is shown, keeping what it shows when that fails', async () => {
    vi.useFakeTimers()
    const { w } = setup()
    await vi.advanceTimersByTimeAsync(0)
    mine.unshift(conv('c9', 'k1', 'Course tutor', '2026-09-27T00:00:00Z', { unread: true }))
    await vi.advanceTimersByTimeAsync(LIST_POLL_MS)
    expect(where(w)[0]).toBe('CS101 · Course tutor')
    expect(w.findAll('.hist-row')).toHaveLength(3)
    fail = new ApiError({ status: 0, code: 'network', message: 'down' })
    await vi.advanceTimersByTimeAsync(LIST_POLL_MS)
    expect(w.findAll('.hist-row')).toHaveLength(3)
    expect(w.text()).not.toContain('Something went wrong')
  })

  it('opens the one chosen, in its course', async () => {
    const { w } = setup()
    await flushPromises()
    await w.findAll('.hist-row')[1]!.trigger('click')
    expect(w.emitted('open')?.[0]).toEqual(['k1', 'c1'])
  })

  it('names a course by its section too, where two of the caller’s share a code', async () => {
    COURSES.k2 = ['CS101', 'B']
    try {
      mine = [
        conv('c1', 'k1', 'Course tutor', '2026-09-20T00:00:00Z'),
        conv('c2', 'k2', 'Tutor B', '2026-09-19T00:00:00Z'),
      ]
      const { w, chat } = setup()
      const session = useSessionStore()
      session.memberships = [membership('k1', 'CS101', 'A'), membership('k2', 'CS101', 'B')]
      mine[0]!.course.section = 'A'
      chat.historyScope = 'all'
      await flushPromises()
      expect(w.findAll('.hist-row__course').map((c) => c.text())).toEqual(['CS101 (A)', 'CS101 (B)'])
    } finally {
      COURSES.k2 = ['MA201', '']
    }
  })

  it('says so when there is nothing yet', async () => {
    mine = []
    const { w } = setup()
    await flushPromises()
    expect(w.text()).toContain('You have not asked an agent anything in this course yet.')
  })
})
