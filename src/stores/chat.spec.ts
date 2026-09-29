import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ConversationView } from '@/api/types'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn(async () => ({ conversations: [] })) }
})

const { useSessionStore } = await import('./session')
const { useChatStore } = await import('./chat')

function membership(courseId: string, perms: Record<string, string> = { conversation_ask: 'autonomous' }, over = {}) {
  return {
    member_id: `me-${courseId}`,
    course_id: courseId,
    code: courseId.toUpperCase(),
    section: '',
    title: courseId,
    role: 'student',
    status: 'active',
    course_status: 'active',
    perms,
    ...over,
  } as never
}

function view(id: string, courseId: string, over: Partial<ConversationView> = {}): ConversationView {
  return {
    id,
    status: 'open',
    state: 'awaiting_answer',
    created_at: '2026-09-26T11:00:00Z',
    last_message_at: '2026-09-26T11:00:00Z',
    last_author_member_id: `me-${courseId}`,
    opener: { member_id: `me-${courseId}`, display_name: 'Ada', kind: 'human' },
    respondent: {
      member_id: 'tutor',
      display_name: 'Course tutor',
      kind: 'agent',
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
    },
    ...over,
  }
}

function signIn(id = 'ada') {
  const session = useSessionStore()
  session.me = { id, kind: 'human', display_name: id } as never
  session.memberships = [
    membership('k1'),
    membership('k2'),
    membership('k3', { conversation_ask: 'denied' }),
    membership('k4', { conversation_ask: 'autonomous' }, { course_status: 'archived' }),
    membership('k5', { conversation_ask: 'autonomous' }, { status: 'paused' }),
  ]
  return useChatStore()
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    'aishiteru.chat.ada',
    JSON.stringify({ since: '2026-09-01T00:00:00Z', seen: {}, pending: {}, course: null }),
  )
  setActivePinia(createPinia())
})

describe('the chat store', () => {
  it('offers the courses where the caller may ask now, and asks in the first until told otherwise', () => {
    const chat = signIn()
    expect(chat.courseIds).toEqual(['k1', 'k2'])
    expect(chat.courseId).toBe('k1')
    chat.followPage('k3')
    expect(chat.courseId).toBe('k1')
    chat.followPage('k2')
    expect(chat.courseId).toBe('k2')
    chat.selectCourse('k1')
    expect(chat.courseId).toBe('k1')
    expect(JSON.parse(localStorage.getItem('aishiteru.chat.ada')!).course).toBe('k1')
  })

  it('watches a question until it is answered, counts the answer as unread, and not once it is seen', () => {
    const chat = signIn()
    chat.note([{ courseId: 'k1', view: view('c1', 'k1') }])
    expect(chat.pending).toEqual([{ id: 'c1', courseId: 'k1' }])
    expect(chat.unreadCount).toBe(0)

    const answered = view('c1', 'k1', {
      state: 'answered',
      last_message_at: '2026-09-26T11:01:00Z',
      last_author_member_id: 'tutor',
    })
    chat.note([{ courseId: 'k1', view: answered }])
    expect(chat.pending).toEqual([])
    expect(chat.unreadCount).toBe(1)
    expect(chat.unreadIds.has('c1')).toBe(true)

    chat.markSeen(answered)
    expect(chat.unreadCount).toBe(0)
    // Kept in this browser for the caller: a new page knows it.
    const kept = JSON.parse(localStorage.getItem('aishiteru.chat.ada')!)
    expect(kept.seen.c1).toBe('2026-09-26T11:01:00Z')
    expect(kept.pending).toEqual({})
  })

  it('never watches a conversation with a person, nor one that is not the caller’s', () => {
    const chat = signIn()
    chat.note([
      { courseId: 'k1', view: view('p1', 'k1', { respondent: { ...view('x', 'k1').respondent, kind: 'human' } }) },
      {
        courseId: 'k1',
        view: view('o1', 'k1', { opener: { member_id: 'someone', display_name: 'Bo', kind: 'human' } }),
      },
    ])
    expect(chat.pending).toEqual([])
  })

  it('opens on a conversation, in its course, and goes to the history and back', () => {
    const chat = signIn()
    chat.showConversation('k2', 'c9', { open: true })
    expect(chat.open).toBe(true)
    expect(chat.screen).toBe('conversation')
    expect(chat.courseId).toBe('k2')
    chat.toggleHistory()
    expect(chat.screen).toBe('history')
    chat.toggleHistory()
    expect(chat.screen).toBe('conversation')
    chat.selectCourse('k1')
    expect(chat.screen).toBe('new')
  })

  it('keeps the agent chosen for a new conversation with its course', () => {
    const chat = signIn()
    const agent = { member_id: 'tutor', display_name: 'Course tutor', kind: 'agent' } as never
    chat.pickAgent(agent)
    expect(chat.draft).toEqual({ courseId: 'k1', agent })
    // The page moves to another course: what is being written stays.
    chat.followPage('k2')
    expect(chat.draft?.courseId).toBe('k1')
    chat.selectCourse('k2')
    expect(chat.draft).toBeNull()
  })

  it('forgets what it held of one caller when another signs in', () => {
    const chat = signIn()
    chat.note([{ courseId: 'k1', view: view('c1', 'k1') }])
    chat.showConversation('k1', 'c1')
    signIn('bo')
    expect(chat.items.size).toBe(0)
    expect(chat.conversation).toBeNull()
    expect(chat.pending).toEqual([])
    expect(chat.memory.seen).toEqual({})
  })
})
