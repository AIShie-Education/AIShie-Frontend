import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { MyConversation } from '@/api/types'

// The caller's conversations as Core lists them (me.conversations): the
// latest activity first, a page at a time, after an opaque cursor, of one
// course when asked.
let mine: MyConversation[] = []
let fail: Error | null = null
const reads: { tool: string; args: Record<string, unknown> }[] = []
const coreCalls: string[] = []
/** Holds the answer to the next read until released. */
let hold: Promise<void> | null = null
/** Happens once a read has been answered (a conversation moving between two pages). */
let between: (() => void) | null = null

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      coreCalls.push(tool)
      throw new Error(`Core chat call: ${tool}`)
    }),
  }
})

vi.mock('@/api/runtimeChat', async (orig) => {
  const real = await orig<typeof import('@/api/runtimeChat')>()
  return {
    ...real,
    runtimeChat: {
      agents: vi.fn(async (courseId: string) => ({
        agents: [
          {
            agent_id: 'tutor-actor',
            display_name: mine.find((c) => c.course.course_id === courseId)?.respondent.display_name ?? 'Course tutor',
            answers_course: true,
            answer_level: 'autonomous',
          },
        ],
      })),
      list: vi.fn(async (courseId: string, args: { limit?: number; after?: string } = {}) => {
        reads.push({ tool: 'ar.list', args: { course_id: courseId, ...args } })
        const snapshot = mine.map((c) => ({ ...c }))
        if (hold) await hold
        if (fail) throw fail
        const list = snapshot.filter((c) => c.course.course_id === courseId && c.respondent.kind === 'agent')
        const from = args.after ? list.findIndex((c) => c.conversation_id === args.after) + 1 : 0
        const limit = args.limit ?? 50
        const page = list.slice(from, from + limit)
        const then = between
        between = null
        then?.()
        return {
          conversations: page.map((c) => ({
            id: c.conversation_id,
            course_id: courseId,
            agent_id: c.respondent.actor_id,
            title: c.title ?? '',
            state: c.state === 'closed' ? ('closed' as const) : ('answered' as const),
            revision: 1,
            created_at: c.created_at,
            updated_at: c.last_activity_at,
            last_activity_at: c.last_activity_at,
            close_reason: c.closed_reason ?? undefined,
          })),
          next: list[from + limit]?.conversation_id ?? null,
        }
      }),
    },
  }
})

const { ApiError } = await import('@/api/http')
const { useSessionStore } = await import('./session')
const { useChatStore, historyKey, HISTORY_PAGE } = await import('./chat')

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
  coreCalls.length = 0
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
    expect(localStorage.getItem('aishie.chatCourse.ada')).toBe('k1')
  })

  it('asks in the course the caller last used, kept for them alone, and takes it once from what earlier versions kept', () => {
    localStorage.setItem('aishie.chatCourse.ada', 'k2')
    expect(signIn().courseId).toBe('k2')

    // Someone else, whose course an earlier version kept with what they had read.
    setActivePinia(createPinia())
    localStorage.setItem(
      'aishie.chat.bo',
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
    expect(localStorage.getItem('aishie.chatCourse.bo')).toBe('k1')
    expect(localStorage.getItem('aishie.chat.bo')).toBeNull()
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

  it('opens again on what it showed once minimized, and on a new conversation in its course once closed', () => {
    const chat = signIn()
    chat.showConversation('k2', 'c9', { open: true })
    chat.setOpen(false)
    chat.setOpen(true)
    expect(chat.screen).toBe('conversation')
    expect(chat.conversation).toEqual({ courseId: 'k2', id: 'c9' })
    chat.pickAgent({ member_id: 'tutor', display_name: 'Course tutor', kind: 'agent' } as never)
    chat.close()
    expect(chat.open).toBe(false)
    expect(chat.screen).toBe('new')
    expect(chat.conversation).toBeNull()
    expect(chat.draft).toBeNull()
    // Still asking in the course it was in; and back from the history, a new conversation.
    expect(chat.courseId).toBe('k2')
    chat.toggleHistory()
    chat.toggleHistory()
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
  it('counts new answers as AR activity moves, from the newest page of every course', async () => {
    const chat = signIn()
    mine = [item('c1', 'k1'), item('c2', 'k2'), item('c3', 'k1')]
    await chat.pollUnread()
    expect(reads.filter((r) => r.tool === 'ar.list')).toHaveLength(5)
    expect(chat.unreadCount).toBe(0)
    mine[0] = item('c1', 'k1', { last_activity_at: '2026-09-26T11:02:00Z' })
    mine[1] = item('c2', 'k2', { last_activity_at: '2026-09-26T11:02:00Z' })
    await chat.pollUnread()
    expect(chat.unreadCount).toBe(2)
    expect([...chat.unreadIds].sort()).toEqual(['c1', 'c2'])
    expect(coreCalls).toEqual([])
  })

  it('stops counting one the moment it is marked read here, whatever a list asked for before then says', async () => {
    const chat = signIn()
    mine = [item('c1', 'k1')]
    await chat.pollUnread()
    mine = [item('c1', 'k1', { last_activity_at: '2026-09-26T11:02:00Z' })]
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
    mine = [item('c1', 'k1', { last_activity_at: '2026-09-26T11:03:00Z' })]
    await chat.pollUnread()
    expect(chat.unreadCount).toBe(1)
  })

  it('does not count the conversation on screen, whose answers are read as they come', async () => {
    const chat = signIn()
    mine = [item('c1', 'k1'), item('c2', 'k1')]
    await chat.pollUnread()
    mine = [
      item('c1', 'k1', { last_activity_at: '2026-09-26T11:02:00Z' }),
      item('c2', 'k1', { last_activity_at: '2026-09-26T11:02:00Z' }),
    ]
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
    expect(reads.at(-1)!.args).toMatchObject({ course_id: 'k1', limit: HISTORY_PAGE })
    expect(chat.histories[course]!.items.map((c) => c.conversation_id)).toEqual(['c1'])
    expect(chat.histories[course]!.loaded).toBe(true)

    await chat.loadHistory('all')
    expect(reads.filter((r) => r.args.course_id === 'k2').at(-1)!.args).toMatchObject({ limit: HISTORY_PAGE })
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
    expect(reads.filter((r) => r.args.course_id === 'k1').map((r) => r.args)).toEqual([
      { course_id: 'k1', limit: HISTORY_PAGE * 2 },
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
    expect(ids).toHaveLength(HISTORY_PAGE + 5)
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
