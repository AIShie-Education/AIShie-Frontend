import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { ConversationView } from '@/api/types'

let lists: Record<string, ConversationView[] | Error> = {}
const reads: { tool: string; args: Record<string, unknown> }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push({ tool, args })
      if (tool === 'conversation.list') {
        const l = lists[args.course_id as string]
        if (l instanceof Error) throw l
        return { conversations: l ?? [] }
      }
      throw new Error(`no answer for ${tool}`)
    }),
  }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { useChatStore } = await import('@/stores/chat')
const { default: ChatHistory } = await import('./ChatHistory.vue')

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
  over: Partial<ConversationView> = {},
  kind = 'agent',
): ConversationView {
  return {
    id,
    status: 'open',
    state: 'answered',
    title: `About ${id}`,
    created_at: '2026-09-01T00:00:00Z',
    last_message_at: at,
    last_author_member_id: `me-${courseId}`,
    opener: { member_id: `me-${courseId}`, display_name: 'Ada', kind: 'human' },
    respondent: {
      member_id: `${agent}-seat`,
      display_name: agent,
      kind,
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
    },
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

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  setLocale('en')
  reads.length = 0
  // What this browser kept for Ada: it has kept track since September.
  localStorage.clear()
  localStorage.setItem(
    'aishiteru.chat.ada',
    JSON.stringify({ since: '2026-09-01T00:00:00Z', seen: { c3: '2026-09-24T00:00:00Z' }, pending: {}, course: null }),
  )
  lists = {
    k1: [
      conv('c1', 'k1', 'Course tutor', '2026-09-20T00:00:00Z'),
      // Answered since Ada last looked.
      conv('c3', 'k1', 'Lab helper', '2026-09-25T00:00:00Z', { last_author_member_id: 'Lab helper-seat' }),
      // A person asked before the chat was only for agents: not listed.
      conv('c4', 'k1', 'Ms Wong', '2026-09-26T00:00:00Z', {}, 'human'),
    ],
    k2: [conv('c2', 'k2', 'Maths tutor', '2026-09-22T00:00:00Z', { state: 'awaiting_answer' })],
    k3: new ApiError({ status: 500, code: 'internal', message: 'boom' }),
  }
})
enableAutoUnmount(afterEach)

describe('ChatHistory', () => {
  it('lists the conversations with agents in the course asked in, each as course · agent, newest first', async () => {
    const { w } = setup()
    await flushPromises()
    expect(reads.map((r) => r.args)).toEqual([{ course_id: 'k1', as: 'opener', limit: 200 }])
    const rows = w.findAll('.hist-row')
    expect(rows.map((r) => r.find('.hist-row__where').text().replace(/\s+/g, ' '))).toEqual([
      'CS101 · Lab helper',
      'CS101 · Course tutor',
    ])
    expect(rows[0]!.find('.hist-row__title').text()).toBe('About c3')
    expect(rows[1]!.text()).toContain('Answered')
    expect(w.text()).not.toContain('Ms Wong')
  })

  it('marks an answer not read yet', async () => {
    const { w, chat } = setup()
    await flushPromises()
    const [unread, read] = w.findAll('.hist-row')
    expect(unread!.classes()).toContain('is-unread')
    expect(unread!.find('.hist-row__unread').text()).toBe('New answer')
    expect(unread!.find('.hist-row__dot').exists()).toBe(true)
    expect(read!.classes()).not.toContain('is-unread')
    expect(chat.unreadCount).toBe(1)
  })

  it('lists every course where the caller may ask, read side by side, and names one that could not be read', async () => {
    const { w, chat } = setup()
    await flushPromises()
    chat.historyScope = 'all'
    await flushPromises()
    expect(reads.map((r) => r.args.course_id).sort()).toEqual(['k1', 'k2', 'k3'])
    const rows = w.findAll('.hist-row')
    expect(rows.map((r) => r.find('.hist-row__where').text().replace(/\s+/g, ' '))).toEqual([
      'CS101 · Lab helper',
      'MA201 · Maths tutor',
      'CS101 · Course tutor',
    ])
    expect(rows[1]!.text()).toContain('Awaiting an answer')
    expect(w.find('.chat-history__note').text()).toContain('Could not read your conversations in PH110.')

    // Tried again, it can be read.
    lists.k3 = [conv('c5', 'k3', 'Physics tutor', '2026-09-10T00:00:00Z')]
    await w.find('.chat-history__note button').trigger('click')
    await flushPromises()
    expect(w.find('.chat-history__note').exists()).toBe(false)
    expect(w.findAll('.hist-row').at(-1)!.find('.hist-row__where').text().replace(/\s+/g, ' ')).toBe(
      'PH110 · Physics tutor',
    )
  })

  it('opens the one chosen, in its course', async () => {
    const { w } = setup()
    await flushPromises()
    await w.findAll('.hist-row')[1]!.trigger('click')
    expect(w.emitted('open')?.[0]).toEqual(['k1', 'c1'])
  })

  it('names a course by its section too, where two of the caller’s share a code', async () => {
    const { w } = setup()
    useSessionStore().memberships = [membership('k1', 'CS101', 'A'), membership('k2', 'CS101', 'B')]
    await flushPromises()
    expect(w.findAll('.hist-row')[0]!.find('.hist-row__course').text()).toBe('CS101 (A)')
  })

  it('says so when there is nothing yet', async () => {
    lists.k1 = []
    const { w } = setup()
    await flushPromises()
    expect(w.text()).toContain('You have not asked an agent anything in this course yet.')
  })
})
