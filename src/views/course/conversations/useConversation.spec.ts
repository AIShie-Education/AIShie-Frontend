import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { ConversationMessage, ConversationView } from '@/api/types'

// A conversation as a Core would hold it, answering conversation.messages
// and conversation.get the way Core does (tail, after_seq, before_seq).
let server: { messages: ConversationMessage[]; view: ConversationView; fail: boolean }
const calls: { tool: string; args: Record<string, unknown> }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args })
      if (server.fail) throw new real.ApiError({ status: 0, code: 'network', message: 'down', network: true } as never)
      if (tool === 'conversation.get') return { ...server.view, visible_to: ['participants'] }
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
  }
})

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
function start(active = ref(true)) {
  const scope = effectScope()
  const c = scope.run(() => useConversation({ courseId: 'k1', conversationId: 'c1', active, now: () => clock }))!
  return { c, active, dispose: () => scope.stop() }
}
/** Moves the page's clock and the timers together. */
async function advance(ms: number) {
  clock += ms
  await vi.advanceTimersByTimeAsync(ms)
}
const messageCalls = () => calls.filter((c) => c.tool === 'conversation.messages')

beforeEach(() => {
  vi.useFakeTimers()
  clock = 1_000_000
  calls.length = 0
  server = { messages: range(1, 4), view: view({ state: 'awaiting_answer' }), fail: false }
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
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
