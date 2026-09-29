import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { MyConversation } from '@/api/types'

// The caller's conversations as Core lists them (me.conversations): the
// latest activity first, a page at a time, after an opaque cursor, of one
// course when asked.
let mine: MyConversation[] = []
let fail: Error | null = null
const reads: { tool: string; args: Record<string, unknown> }[] = []
/** Holds the answer to the next read until released. */
let hold: Promise<void> | null = null
/** Happens once a read has been answered (a conversation moving between two pages). */
let between: (() => void) | null = null

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push({ tool, args })
      if (tool !== 'me.conversations') throw new Error(`no answer for ${tool}`)
      const snapshot = mine.map((c) => ({ ...c }))
      if (hold) await hold
      if (fail) throw fail
      const list = snapshot.filter((c) => !args.course_id || c.course.course_id === args.course_id)
      const from = args.after ? Number(String(args.after).slice(1)) : 0
      const limit = (args.limit as number) ?? 50
      const page = list.slice(from, from + limit)
      const then = between
      between = null
      then?.()
      return {
        conversations: page,
        ...(from + limit < list.length ? { next: `p${from + limit}` } : {}),
      }
    }),
  }
})

const { ApiError } = await import('@/api/http')
const { useSessionStore } = await import('./session')
const { useChatStore, historyKey, HISTORY_PAGE, UNREAD_PAGE } = await import('./chat')

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

function item(id: string, courseId: string, over: Partial<MyConversation> = {}): MyConversation {
  return {
    conversation_id: id,
    member_id: `me-${courseId}`,
    course: { course_id: courseId, code: courseId.toUpperCase(), section: '', title: courseId },
    respondent: { member_id: 'tutor', actor_id: 'tutor-actor', display_name: 'Course tutor', kind: 'agent' },
    title: `About ${id}`,
    status: 'open',
    state: 'answered',
    created_at: '2026-09-26T11:00:00Z',
    last_activity_at: '2026-09-26T11:01:00Z',
    unread: false,
    may_ask: true,
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
  mine = []
  fail = null
  hold = null
  between = null
  reads.length = 0
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
    // The course last used is kept in this browser for the caller, as it is.
    expect(localStorage.getItem('aishiteru.chatCourse.ada')).toBe('k1')
  })

  it('asks in the course the caller last used, kept for them alone, and takes it once from what earlier versions kept', () => {
    localStorage.setItem('aishiteru.chatCourse.ada', 'k2')
    expect(signIn().courseId).toBe('k2')

    // Someone else, whose course an earlier version kept with what they had read.
    setActivePinia(createPinia())
    localStorage.setItem(
      'aishiteru.chat.bo',
      JSON.stringify({
        since: '2026-09-01T00:00:00Z',
        seen: { c1: '2026-09-02T00:00:00Z' },
        pending: {},
        course: 'k2',
      }),
    )
    const chat = signIn('bo')
    expect(chat.courseId).toBe('k2')
    chat.selectCourse('k1')
    expect(localStorage.getItem('aishiteru.chatCourse.bo')).toBe('k1')
    expect(localStorage.getItem('aishiteru.chat.bo')).toBeNull()
  })

  it('asks in the first course where storage is refused', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      const chat = signIn()
      expect(chat.courseId).toBe('k1')
      chat.selectCourse('k2')
      expect(chat.courseId).toBe('k2')
    } finally {
      get.mockRestore()
      set.mockRestore()
    }
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
})

describe('what is unread', () => {
  it('counts the conversations Core says the agent has written in since the caller read them, from the newest page', async () => {
    const chat = signIn()
    mine = [
      item('c1', 'k1', { unread: true }),
      item('c2', 'k2', { unread: true }),
      item('c3', 'k1'),
      // A conversation from before, with a person, closed since: never counted.
      item('p1', 'k1', {
        unread: true,
        status: 'closed',
        state: 'closed',
        closed_reason: 'conversations_are_with_agents',
        respondent: { member_id: 'ta', actor_id: 'ta-actor', display_name: 'Ms Wong', kind: 'human' },
      }),
    ]
    await chat.pollUnread()
    expect(reads).toEqual([{ tool: 'me.conversations', args: { limit: UNREAD_PAGE } }])
    expect(chat.unreadCount).toBe(2)
    expect([...chat.unreadIds].sort()).toEqual(['c1', 'c2'])

    // Read on another device: the next read says so.
    mine[0] = item('c1', 'k1', { unread: false })
    await chat.pollUnread()
    expect(chat.unreadCount).toBe(1)
  })

  it('stops counting one the moment it is marked read here, whatever a list asked for before then says', async () => {
    const chat = signIn()
    mine = [item('c1', 'k1', { unread: true })]
    await chat.pollUnread()
    expect(chat.unreadCount).toBe(1)

    // A read asked for before the mark, answered after it, as it stood before.
    let release!: () => void
    hold = new Promise((r) => (release = r))
    const early = chat.pollUnread()
    hold = null
    chat.markedRead('c1')
    expect(chat.unreadCount).toBe(0)
    release()
    await early
    expect(chat.unreadCount).toBe(0)

    // The agent writes again, and a read asked for since says so.
    await chat.pollUnread()
    expect(chat.unreadCount).toBe(1)
  })

  it('does not count the conversation on screen, whose answers are read as they come', async () => {
    const chat = signIn()
    mine = [item('c1', 'k1', { unread: true }), item('c2', 'k1', { unread: true })]
    await chat.pollUnread()
    chat.showConversation('k1', 'c1', { open: true })
    expect([...chat.unreadIds]).toEqual(['c2'])
    chat.setOpen(false)
    expect(chat.unreadCount).toBe(2)
  })
})

describe('the history', () => {
  it('reads the caller’s conversations with agents, newest first, of one course or of all', async () => {
    const chat = signIn()
    mine = [
      item('c2', 'k2', { last_activity_at: '2026-09-27T00:00:00Z' }),
      item('c1', 'k1'),
      item('p1', 'k1', { respondent: { member_id: 'ta', actor_id: 'x', display_name: 'Ms Wong', kind: 'human' } }),
    ]
    const course = historyKey('course', 'k1')!
    await chat.loadHistory(course)
    expect(reads.at(-1)!.args).toEqual({ course_id: 'k1', limit: HISTORY_PAGE })
    expect(chat.histories[course]!.items.map((c) => c.conversation_id)).toEqual(['c1'])
    expect(chat.histories[course]!.loaded).toBe(true)

    await chat.loadHistory('all')
    expect(reads.at(-1)!.args).toEqual({ limit: HISTORY_PAGE })
    expect(chat.histories.all!.items.map((c) => c.conversation_id)).toEqual(['c2', 'c1'])
    expect(historyKey('course', null)).toBeNull()
  })

  it('reads a page more on request, all of them again from the top, where a conversation that moved is listed once', async () => {
    const chat = signIn()
    mine = Array.from({ length: HISTORY_PAGE + 5 }, (_, i) =>
      item(`c${i}`, 'k1', { last_activity_at: new Date(Date.UTC(2026, 8, 26) - i * 60_000).toISOString() }),
    )
    await chat.loadHistory('all')
    expect(chat.histories.all!.items).toHaveLength(HISTORY_PAGE)
    expect(chat.histories.all!.hasMore).toBe(true)

    reads.length = 0
    await chat.loadMoreHistory('all')
    expect(reads.map((r) => r.args)).toEqual([
      { limit: HISTORY_PAGE },
      { limit: HISTORY_PAGE, after: `p${HISTORY_PAGE}` },
    ])
    expect(chat.histories.all!.items).toHaveLength(HISTORY_PAGE + 5)
    expect(chat.histories.all!.hasMore).toBe(false)
    expect(chat.histories.all!.loadingMore).toBe(false)

    // The last one is answered, and moves to the top once the first page is read:
    // the second then starts with one the first had.
    const moved = mine.at(-1)!
    between = () => {
      mine.pop()
      mine.unshift({ ...moved, last_activity_at: '2026-09-28T00:00:00Z', unread: true })
    }
    await chat.loadHistory('all', { quiet: true })
    let ids = chat.histories.all!.items.map((c) => c.conversation_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(HISTORY_PAGE + 4)
    // Read again from the top, it is first.
    await chat.loadHistory('all', { quiet: true })
    ids = chat.histories.all!.items.map((c) => c.conversation_id)
    expect(ids[0]).toBe(moved.conversation_id)
    expect(ids).toHaveLength(HISTORY_PAGE + 5)
    expect(chat.unreadIds.has(moved.conversation_id)).toBe(true)
  })

  it('says it could not be read, and is read again on retry; read again quietly, it keeps what it shows', async () => {
    const chat = signIn()
    fail = new ApiError({ status: 500, code: 'internal', message: 'boom' })
    await chat.loadHistory('all')
    expect(chat.histories.all!.error?.code).toBe('internal')
    expect(chat.histories.all!.loaded).toBe(false)

    fail = null
    mine = [item('c1', 'k1')]
    await chat.loadHistory('all')
    expect(chat.histories.all!.error).toBeNull()
    expect(chat.histories.all!.items).toHaveLength(1)

    fail = new ApiError({ status: 0, code: 'network', message: 'down' })
    await expect(chat.loadHistory('all', { quiet: true })).rejects.toBe(fail)
    expect(chat.histories.all!.error).toBeNull()
    expect(chat.histories.all!.items).toHaveLength(1)
  })

  it('says a page more could not be read, and keeps the pages it has', async () => {
    const chat = signIn()
    mine = Array.from({ length: HISTORY_PAGE + 1 }, (_, i) => item(`c${i}`, 'k1'))
    await chat.loadHistory('all')
    fail = new ApiError({ status: 0, code: 'network', message: 'down' })
    await chat.loadMoreHistory('all')
    expect(chat.histories.all!.moreError?.code).toBe('network')
    expect(chat.histories.all!.loadingMore).toBe(false)
    expect(chat.histories.all!.items).toHaveLength(HISTORY_PAGE)
    // Tried again, it reads the page it could not.
    fail = null
    await chat.loadMoreHistory('all')
    expect(chat.histories.all!.items).toHaveLength(HISTORY_PAGE + 1)
    expect(chat.histories.all!.moreError).toBeNull()
  })
})

describe('a new caller', () => {
  it('forgets what it held of the one before', async () => {
    const chat = signIn()
    mine = [item('c1', 'k1', { unread: true })]
    await chat.pollUnread()
    await chat.loadHistory('all')
    chat.showConversation('k1', 'c1')
    signIn('bo')
    expect(chat.unreadCount).toBe(0)
    expect(chat.histories).toEqual({})
    expect(chat.conversation).toBeNull()
  })

  it('drops what a read for the one before brings, once another has signed in', async () => {
    const chat = signIn()
    mine = [item('c1', 'k1', { unread: true })]
    let release!: () => void
    hold = new Promise((r) => (release = r))
    const late = chat.pollUnread()
    hold = null
    signIn('bo')
    release()
    await late
    expect(chat.unreadCount).toBe(0)
  })
})
