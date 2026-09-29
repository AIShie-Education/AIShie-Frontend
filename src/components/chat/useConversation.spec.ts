import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { ConversationMessage, ConversationView } from '@/api/types'

// A conversation as a Core would hold it, answering conversation.messages
// and conversation.get the way Core does (tail, after_seq, before_seq), and
// keeping what the opener has read (conversation.mark_read).
let server: {
  messages: ConversationMessage[]
  view: ConversationView
  fail: boolean
  /** The seq the opener has read up to. */
  readUpTo: number
  /** What conversation.mark_read throws, if anything. */
  markFails?: Error
}
const calls: { tool: string; args: Record<string, unknown> }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args })
      if (server.fail) throw new real.ApiError({ status: 0, code: 'network', message: 'down', network: true } as never)
      if (tool === 'conversation.get') {
        const unread = server.messages.some((m) => m.seq > server.readUpTo && m.author_member_id === 'agent')
        return { ...server.view, unread, visible_to: ['participants'] }
      }
      if (tool !== 'conversation.messages') throw new Error(`no answer for ${tool}`)
      const limit = (args.limit as number) ?? 50
      const all = server.messages
      let page: ConversationMessage[]
      if (typeof args.after_seq === 'number') {
        page = all.filter((m) => m.seq > (args.after_seq as number)).slice(0, limit)
      } else {
        const before = typeof args.before_seq === 'number' ? (args.before_seq as number) : Infinity
        page = all.filter((m) => m.seq < before).slice(-limit)
      }
      return { messages: page.map((m) => ({ ...m })), conversation: { ...server.view }, more: page.length === limit }
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args })
      if (tool !== 'conversation.mark_read') throw new Error(`no answer for ${tool}`)
      if (server.markFails) throw server.markFails
      const upTo = server.messages.find((m) => m.id === args.up_to_message_id)!.seq
      server.readUpTo = Math.max(server.readUpTo, upTo)
      const unread = server.messages.some((m) => m.seq > server.readUpTo && m.author_member_id === 'agent')
      return {
        status: 'executed',
        actionId: 'a1',
        reviewState: 'none',
        replayed: false,
        result: { read_up_to_seq: server.readUpTo, unread },
      }
    }),
  }
})

const { ApiError } = await import('@/api/http')
const { useConversation } = await import('./useConversation')

function msg(seq: number, over: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: `m${seq}`,
    seq,
    author_member_id: seq % 2 ? 'opener' : 'agent',
    body: `message ${seq}`,
    created_at: '2026-09-26T12:00:00Z',
    ...over,
  }
}
function view(over: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'c1',
    status: 'open',
    state: 'answered',
    created_at: '2026-09-26T11:00:00Z',
    opener: { member_id: 'opener', display_name: 'Chan', kind: 'human' },
    respondent: {
      member_id: 'agent',
      display_name: 'Tutor',
      kind: 'agent',
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
    },
    ...over,
  }
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i))

let clock = 0
function start(active = ref(true), reader = ref<string | null>(null)) {
  const scope = effectScope()
  const read: unknown[] = []
  const c = scope.run(() =>
    useConversation({
      courseId: 'k1',
      conversationId: 'c1',
      active,
      reader,
      onRead: (out) => read.push(out),
      now: () => clock,
    }),
  )!
  return { c, active, reader, read, dispose: () => scope.stop() }
}
/** Moves the page's clock and the timers together. */
async function advance(ms: number) {
  clock += ms
  await vi.advanceTimersByTimeAsync(ms)
}
const messageCalls = () => calls.filter((c) => c.tool === 'conversation.messages')
const marks = () => calls.filter((c) => c.tool === 'conversation.mark_read').map((c) => c.args)
let visibility: DocumentVisibilityState = 'visible'
function setVisibility(v: DocumentVisibilityState) {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  clock = 1_000_000
  calls.length = 0
  server = { messages: range(1, 4), view: view({ state: 'awaiting_answer' }), fail: false, readUpTo: 4 }
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useConversation', () => {
  it('reads the newest messages first, with the conversation and who can read it', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(messageCalls()[0]!.args).toEqual({ course_id: 'k1', conversation_id: 'c1', limit: 50 })
    expect(c.messages.value.map((m) => m.seq)).toEqual([1, 2, 3, 4])
    expect(c.view.value?.state).toBe('awaiting_answer')
    expect(c.hasOlder.value).toBe(false)
    expect(c.loaded.value).toBe(true)
    expect(c.visibleTo.value).toEqual(['participants'])
    dispose()
  })

  it('polls after the last seq held, every few seconds, and adds only what is new', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    server.messages = range(1, 6)
    server.view = view({ state: 'answered' })
    await advance(3000)
    const last = messageCalls().at(-1)!
    expect(last.args).toMatchObject({ after_seq: 4 })
    expect(c.messages.value.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(c.view.value?.state).toBe('answered')
    // The same page again adds nothing twice.
    await advance(3000)
    expect(messageCalls().at(-1)!.args).toMatchObject({ after_seq: 6 })
    expect(c.messages.value).toHaveLength(6)
    dispose()
  })

  it('reads on at once when a poll brings a full page', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    server.messages = range(1, 250)
    await advance(3000)
    expect(c.messages.value.at(-1)!.seq).toBe(250)
    expect(
      messageCalls()
        .slice(1)
        .map((x) => x.args.after_seq),
    ).toEqual([4, 104, 204])
    dispose()
  })

  it('reads older messages before the first seq held, keeping the order', async () => {
    server.messages = range(1, 120)
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.messages.value[0]!.seq).toBe(71)
    expect(c.hasOlder.value).toBe(true)
    await c.loadOlder()
    expect(messageCalls().at(-1)!.args).toMatchObject({ before_seq: 71, limit: 50 })
    expect(c.messages.value[0]!.seq).toBe(21)
    expect(c.hasOlder.value).toBe(true)
    await c.loadOlder()
    expect(c.messages.value.map((m) => m.seq)).toEqual(range(1, 120).map((m) => m.seq))
    expect(c.hasOlder.value).toBe(false)
    dispose()
  })

  it('stops polling once the conversation is closed', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    server.view = view({ status: 'closed', state: 'closed', closed_reason: 'seat_removed' })
    await advance(3000)
    expect(c.view.value?.status).toBe('closed')
    const n = messageCalls().length
    await advance(60_000)
    expect(messageCalls()).toHaveLength(n)
    dispose()
  })

  it('polls only while on screen', async () => {
    const active = ref(false)
    const { dispose } = start(active)
    await vi.advanceTimersByTimeAsync(0)
    await advance(30_000)
    expect(messageCalls()).toHaveLength(1)
    active.value = true
    await nextTick()
    await advance(3000)
    // Back on screen: what came after, and nothing read again while nothing was retracted.
    expect(
      messageCalls()
        .slice(1)
        .map((x) => x.args.after_seq),
    ).toEqual([4])
    dispose()
  })

  it('slows down while an answered conversation stays quiet, and speeds up after the caller writes', async () => {
    server.view = view({ state: 'answered' })
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 5; i++) await advance(3000)
    const afterFive = messageCalls().length
    expect(afterFive).toBe(6)
    // Five quiet polls: now every ten seconds.
    await advance(3000)
    await advance(3000)
    expect(messageCalls()).toHaveLength(afterFive)
    await advance(3000)
    await advance(3000)
    expect(messageCalls()).toHaveLength(afterFive + 1)
    // Something written: read now, whatever the schedule.
    server.messages = range(1, 5)
    await c.refresh()
    expect(c.messages.value).toHaveLength(5)
    dispose()
  })

  it('reads the messages held again when last_retracted_at moves, and only then', async () => {
    server.messages = range(1, 150)
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    await c.loadOlder()
    await c.loadOlder()
    expect(c.messages.value).toHaveLength(150)
    // A retraction adds no message: nothing is read again until the view says one happened.
    server.messages = server.messages.map((m) =>
      m.seq === 3 ? { ...m, body: null, retracted: { at: 'x', by_member_id: 'staff' } } : m,
    )
    await advance(3000)
    expect(c.messages.value[2]!.retracted).toBeFalsy()
    const before = messageCalls().length
    server.view = view({ state: 'awaiting_answer', last_retracted_at: '2026-09-26T12:05:00Z' })
    await advance(3000)
    expect(c.messages.value[2]!.retracted).toBeTruthy()
    expect(c.messages.value[2]!.body).toBeNull()
    // The poll, then the held messages from the oldest, a page of 100 at a time.
    const reads = messageCalls().slice(before)
    expect(reads.map((r) => r.args.after_seq)).toEqual([150, 0, 100])
    // Once read again, not again until it moves.
    const after = messageCalls().length
    await advance(3000)
    expect(messageCalls().length - after).toBe(1)
    dispose()
  })

  it('marks a message retracted at once when the caller retracts it', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    c.markRetracted('m1', 'opener', 'wrong course')
    expect(c.messages.value[0]!).toMatchObject({
      body: null,
      retracted: { by_member_id: 'opener', reason: 'wrong course' },
    })
    dispose()
  })

  it('shows a first read that failed, and backs off polls that fail', async () => {
    server.fail = true
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.error.value).toBeTruthy()
    expect(c.loaded.value).toBe(false)
    server.fail = false
    await c.load()
    expect(c.loaded.value).toBe(true)
    server.fail = true
    await advance(3000)
    expect(c.failures.value).toBe(1)
    const n = messageCalls().length
    await advance(3000) // the wait doubled after one failure
    expect(messageCalls()).toHaveLength(n)
    await advance(3000)
    expect(messageCalls()).toHaveLength(n + 1)
    // What was shown stays.
    expect(c.messages.value).toHaveLength(4)
    dispose()
  })
})

describe('useConversation, marking what is read', () => {
  const opener = () => ref<string | null>('opener')

  it('marks it read on opening, up to the newest message held, when Core says the agent has written since', async () => {
    server.readUpTo = 1
    const { read, dispose } = start(ref(true), opener())
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toEqual([{ course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm4' }])
    expect(read).toEqual([{ read_up_to_seq: 4, unread: false }])
    // Nothing new: not marked again.
    await advance(3000)
    expect(marks()).toHaveLength(1)
    dispose()
  })

  it('marks nothing on opening when nothing is unread, and then each answer that comes while it is shown', async () => {
    const { read, dispose } = start(ref(true), opener())
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toEqual([])
    // The opener writes (5), and the agent answers (6).
    server.messages = range(1, 6)
    await advance(3000)
    expect(marks()).toEqual([{ course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm6' }])
    expect(read).toHaveLength(1)
    // What the opener writes themselves is never unread to them.
    server.messages = range(1, 7)
    await advance(3000)
    expect(marks()).toHaveLength(1)
    dispose()
  })

  it('marks nothing for staff reading it, nor while it is off screen or the page hidden, and does once it is shown', async () => {
    server.readUpTo = 1
    const reader = ref<string | null>(null)
    const { c, dispose } = start(ref(true), reader)
    await vi.advanceTimersByTimeAsync(0)
    await advance(3000)
    expect(marks()).toEqual([])

    setVisibility('hidden')
    reader.value = 'opener'
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toEqual([])
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toEqual([{ course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm4' }])

    // An answer read while the page is hidden is marked once it is shown again.
    setVisibility('hidden')
    server.messages = range(1, 6)
    await c.refresh()
    expect(c.messages.value).toHaveLength(6)
    expect(marks()).toHaveLength(1)
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(marks().at(-1)).toEqual({ course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm6' })
    dispose()
  })

  it('tries again after a failure Core never answered, and never after a refusal', async () => {
    server.readUpTo = 1
    server.markFails = new ApiError({ status: 0, code: 'network', message: 'down', network: true } as never)
    const { read, dispose } = start(ref(true), opener())
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toHaveLength(1)
    expect(read).toEqual([])
    server.markFails = undefined
    await advance(3000)
    expect(marks()).toHaveLength(2)
    expect(read).toEqual([{ read_up_to_seq: 4, unread: false }])
    dispose()

    calls.length = 0
    server.readUpTo = 1
    server.markFails = new ApiError({
      status: 403,
      code: 'forbidden',
      message: 'only the two who take part in a conversation mark it read',
      details: { reason: 'not_a_participant' },
    })
    const again = start(ref(true), opener())
    await vi.advanceTimersByTimeAsync(0)
    server.messages = range(1, 6)
    await advance(3000)
    await advance(3000)
    expect(marks()).toHaveLength(1)
    again.dispose()
  })
})
