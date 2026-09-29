import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { ConversationMessage, ConversationView } from '@/api/types'
import type { ConversationDraft } from './draft'

// A conversation as a Core would hold it, answering conversation.messages
// and conversation.get the way Core does (tail, after_seq, before_seq), and
// keeping what the opener has read (conversation.mark_read). A read of what
// comes after after_seq with wait_s waits, as Core does since 2c1fe1b, while
// there is nothing new (no message after it, the state seen_state, the
// conversation standing as it did): until something is committed (commit(),
// as Core's notification on commit wakes it) or its time is up. Or, as a test
// says, Core answers it at once all the same (too many of the caller's reads
// wait already), or refuses it (a Core from before waiting).
let server: {
  messages: ConversationMessage[]
  view: ConversationView
  fail: boolean
  /** The seq the opener has read up to. */
  readUpTo: number
  /** What conversation.mark_read throws, if anything. */
  markFails?: Error
  /** How Core takes wait_s: waits for news, answers at once all the same, or refuses it. */
  waits: 'wait' | 'at once' | 'refuse'
  /** The answer being written, as a Core with drafts sends it (null for none); left out by a Core without. */
  draft?: ConversationDraft | null
}
interface Call {
  tool: string
  args: Record<string, unknown>
  opts?: { signal?: AbortSignal; timeoutMs?: number }
  /** When it was made, by the page's clock. */
  at: number
}
const calls: Call[] = []
/** Reads waiting for news: each looks again when something is committed. */
const waiting = new Set<() => void>()
/** Something was committed in the conversation: whatever waits on it looks again. */
function commit() {
  for (const look of [...waiting]) look()
}
const standing = (v: ConversationView) =>
  JSON.stringify([
    v.state,
    v.status,
    v.pending_reply_action_id ?? null,
    v.last_retracted_at ?? null,
    v.closed_reason ?? null,
  ])
const aborted = () => new DOMException('The operation was aborted.', 'AbortError')

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  function page(args: Record<string, unknown>) {
    const limit = (args.limit as number) ?? 50
    const all = server.messages
    let page: ConversationMessage[]
    if (typeof args.after_seq === 'number') {
      page = all.filter((m) => m.seq > (args.after_seq as number)).slice(0, limit)
    } else {
      const before = typeof args.before_seq === 'number' ? (args.before_seq as number) : Infinity
      page = all.filter((m) => m.seq < before).slice(-limit)
    }
    return {
      messages: page.map((m) => ({ ...m })),
      conversation: { ...server.view },
      more: page.length === limit,
      ...(server.draft !== undefined ? { draft: server.draft && { ...server.draft } } : {}),
    }
  }
  /** Waits, as Core does, while there is nothing new for this read; rejects as fetch does when aborted. */
  function waitForNews(args: Record<string, unknown>, signal?: AbortSignal) {
    const first = standing(server.view)
    const nothing = () =>
      !server.messages.some((m) => m.seq > (args.after_seq as number)) &&
      (args.seen_state == null || args.seen_state === server.view.state) &&
      (args.seen_draft_version == null || args.seen_draft_version === (server.draft?.version ?? 0)) &&
      standing(server.view) === first
    if (!nothing()) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const end = () => {
        clearTimeout(timer)
        waiting.delete(look)
        signal?.removeEventListener('abort', abort)
      }
      const look = () => {
        if (nothing()) return
        end()
        resolve()
      }
      const abort = () => {
        end()
        reject(aborted())
      }
      const timer = setTimeout(
        () => {
          end()
          resolve()
        },
        (args.wait_s as number) * 1000,
      )
      waiting.add(look)
      signal?.addEventListener('abort', abort)
    })
  }
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>, opts?: Call['opts']) => {
      calls.push({ tool, args, opts, at: Date.now() })
      if (opts?.signal?.aborted) throw aborted()
      if (server.fail) throw new real.ApiError({ status: 0, code: 'network', message: 'down' })
      if (tool === 'conversation.get') {
        const unread = server.messages.some((m) => m.seq > server.readUpTo && m.author_member_id === 'agent')
        return { ...server.view, unread, visible_to: ['participants'] }
      }
      if (tool !== 'conversation.messages') throw new Error(`no answer for ${tool}`)
      if (args.wait_s !== undefined) {
        if (server.waits === 'refuse') {
          throw new real.ApiError({
            status: 400,
            code: 'invalid_argument',
            message:
              'arguments do not match the schema of conversation.messages: validating root: unexpected additional properties ["seen_state" "wait_s"]',
          })
        }
        if (server.waits === 'wait') await waitForNews(args, opts?.signal)
      }
      return page(args)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args, at: Date.now() })
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

const { ApiError, read } = await import('@/api/http')
const { useConversation } = await import('./useConversation')
const { NO_WAIT_MS, WAIT_TIMEOUT_MS } = await import('./chat')

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
      now: () => Date.now(),
    }),
  )!
  return { c, active, reader, read, dispose: () => scope.stop() }
}
/** Moves the timers, and the page's clock with them. */
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)
/**
 * Lets what is due at once happen: the fake timers run a timer of 0 set
 * while they run others a millisecond later, as a browser does a few
 * milliseconds later.
 */
const soon = () => vi.advanceTimersByTimeAsync(1)
const messageCalls = () => calls.filter((c) => c.tool === 'conversation.messages')
/** The reads that asked Core to wait for news. */
const waits = () => messageCalls().filter((c) => c.args.wait_s !== undefined)
/** The reads after the first that did not. */
const plain = () => messageCalls().filter((c) => c.args.wait_s === undefined && c.args.after_seq !== undefined)
const last = () => messageCalls().at(-1)!
const marks = () => calls.filter((c) => c.tool === 'conversation.mark_read').map((c) => c.args)
let visibility: DocumentVisibilityState = 'visible'
function setVisibility(v: DocumentVisibilityState) {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  calls.length = 0
  waiting.clear()
  server = {
    messages: range(1, 4),
    view: view({ state: 'awaiting_answer' }),
    fail: false,
    readUpTo: 4,
    waits: 'wait',
  }
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

  it('then waits for what comes after the last seq held, saying the state it holds, and gives the wait a limit', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(messageCalls()).toHaveLength(2)
    expect(last().args).toEqual({
      course_id: 'k1',
      conversation_id: 'c1',
      limit: 100,
      after_seq: 4,
      wait_s: 25,
      seen_state: 'awaiting_answer',
    })
    // A connection dropped on the way does not hold it for longer than Core would.
    expect(last().opts?.timeoutMs).toBe(WAIT_TIMEOUT_MS)
    expect(WAIT_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000)
    expect(last().opts?.signal?.aborted).toBe(false)
    expect(c.polling.value).toBe(true)
    // One at a time: nothing else is asked while it waits.
    await advance(20_000)
    expect(messageCalls()).toHaveLength(2)
    dispose()
  })

  it('shows what is written as soon as Core answers, and waits again at once, from there', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    await advance(10_000)
    const t = Date.now()
    server.messages = range(1, 6)
    server.view = view({ state: 'answered' })
    commit()
    // No time passes: no timer between the answer and the next read.
    await vi.advanceTimersByTimeAsync(0)
    expect(c.messages.value.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(c.view.value?.state).toBe('answered')
    expect(waits().map((w) => [w.args.after_seq, w.args.seen_state, w.at])).toEqual([
      [4, 'awaiting_answer', t - 10_000],
      [6, 'answered', t],
    ])
    expect(plain()).toEqual([])
    dispose()
  })

  it('waits again when a wait ends with nothing, which is not taken for Core not waiting', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    await advance(25_000)
    await soon()
    await advance(25_000)
    await soon()
    expect(waits().map((w) => w.args.after_seq)).toEqual([4, 4, 4])
    expect(plain()).toEqual([])
    expect(c.failures.value).toBe(0)
    dispose()
  })

  it('shows a new state that comes without a message (an answer waiting for approval) at once, and waits on it', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    server.view = view({ state: 'reply_pending_approval', pending_reply_action_id: 'a9' })
    commit()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.view.value?.state).toBe('reply_pending_approval')
    expect(waits().map((w) => w.args.seen_state)).toEqual(['awaiting_answer', 'reply_pending_approval'])
    // Answered at once with no message, but with news: Core did wait.
    expect(plain()).toEqual([])
    dispose()
  })

  it('reads on at once, without waiting, when an answer brings a full page', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    server.messages = range(1, 250)
    commit()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.messages.value.at(-1)!.seq).toBe(250)
    expect(
      messageCalls()
        .slice(1)
        .map((x) => [x.args.after_seq, x.args.wait_s]),
    ).toEqual([
      [4, 25],
      [104, undefined],
      [204, undefined],
      [250, 25],
    ])
    dispose()
  })

  it('reads older messages before the first seq held, keeping the order', async () => {
    server.messages = range(1, 120)
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.messages.value[0]!.seq).toBe(71)
    expect(c.hasOlder.value).toBe(true)
    await c.loadOlder()
    expect(last().args).toMatchObject({ before_seq: 71, limit: 50 })
    // Never waiting: wait_s is for what comes after.
    expect(last().args.wait_s).toBeUndefined()
    expect(c.messages.value[0]!.seq).toBe(21)
    expect(c.hasOlder.value).toBe(true)
    await c.loadOlder()
    expect(c.messages.value.map((m) => m.seq)).toEqual(range(1, 120).map((m) => m.seq))
    expect(c.hasOlder.value).toBe(false)
    dispose()
  })

  it('stops once the conversation is closed', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    server.view = view({ status: 'closed', state: 'closed', closed_reason: 'seat_removed' })
    commit()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.view.value?.status).toBe('closed')
    const n = messageCalls().length
    await advance(120_000)
    expect(messageCalls()).toHaveLength(n)
    expect(waiting.size).toBe(0)
    dispose()
  })

  it('never waits on one that is closed already', async () => {
    server.view = view({ status: 'closed', state: 'closed' })
    const { dispose } = start()
    await advance(60_000)
    expect(messageCalls()).toHaveLength(1)
    dispose()
  })

  it('waits only while on screen: the wait is cut short when it goes off, and it reads at once when back', async () => {
    const { active, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    const first = waits()[0]!
    active.value = false
    await nextTick()
    expect(first.opts?.signal?.aborted).toBe(true)
    expect(waiting.size).toBe(0)
    await advance(30_000)
    expect(messageCalls()).toHaveLength(2)
    active.value = true
    await nextTick()
    await soon()
    // Back on screen: what came meanwhile, read at once, then a wait from there.
    expect(
      messageCalls()
        .slice(2)
        .map((x) => [x.args.after_seq, x.args.wait_s]),
    ).toEqual([
      [4, undefined],
      [4, 25],
    ])
    dispose()
  })

  it('reads nothing while it starts off screen', async () => {
    const { dispose } = start(ref(false))
    await advance(30_000)
    expect(messageCalls()).toHaveLength(1)
    dispose()
  })

  it('stops while the page is hidden, cutting the wait short, and reads at once when it is shown, then waits', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    const first = waits()[0]!
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(0)
    expect(first.opts?.signal?.aborted).toBe(true)
    expect(waiting.size).toBe(0)
    // Cut short is no failure.
    expect(c.failures.value).toBe(0)
    server.messages = range(1, 6)
    await advance(60_000)
    expect(messageCalls()).toHaveLength(2)
    expect(c.messages.value).toHaveLength(4)
    setVisibility('visible')
    await soon()
    expect(c.messages.value).toHaveLength(6)
    expect(
      messageCalls()
        .slice(2)
        .map((x) => [x.args.after_seq, x.args.wait_s]),
    ).toEqual([
      [4, undefined],
      [6, 25],
    ])
    dispose()
  })

  it('cuts the wait short when it goes away', async () => {
    const { dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    const first = waits()[0]!
    dispose()
    expect(first.opts?.signal?.aborted).toBe(true)
    expect(waiting.size).toBe(0)
    await advance(60_000)
    expect(messageCalls()).toHaveLength(2)
  })

  it('reads at once, without waiting, when asked (after the caller wrote), cutting the wait short', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    const first = waits()[0]!
    // A question waiting for approval commits nothing Core would wake the wait for.
    server.messages = range(1, 5)
    await c.refresh()
    expect(first.opts?.signal?.aborted).toBe(true)
    expect(c.messages.value).toHaveLength(5)
    expect(c.failures.value).toBe(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(
      messageCalls()
        .slice(2)
        .map((x) => [x.args.after_seq, x.args.wait_s]),
    ).toEqual([
      [4, undefined],
      [5, 25],
    ])
    dispose()
  })

  it('reads on the schedule for a while when Core answers a wait at once with nothing, then waits again', async () => {
    server.waits = 'at once'
    const { dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    const t0 = Date.now()
    expect(waits()).toHaveLength(1)
    // An answer is awaited: every three seconds, without waiting.
    for (let i = 0; i < 19; i++) await advance(3000)
    expect(waits()).toHaveLength(1)
    expect(plain().map((p) => p.at - t0)).toEqual(Array.from({ length: 19 }, (_, i) => (i + 1) * 3000))
    // After NO_WAIT_MS, it asks to wait again: first at once, then waiting.
    server.waits = 'wait'
    await advance(NO_WAIT_MS - 19 * 3000)
    await soon()
    expect(plain().at(-1)!.at - t0).toBe(NO_WAIT_MS)
    expect(waits()).toHaveLength(2)
    expect(last().args.wait_s).toBe(25)
    expect(waiting.size).toBe(1)
    dispose()
  })

  it('reads on the schedule, without a failure, where Core refuses to wait (a Core from before it)', async () => {
    server.waits = 'refuse'
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    // Refused, and read at once without waiting.
    expect(
      messageCalls()
        .slice(1)
        .map((x) => [x.args.after_seq, x.args.wait_s]),
    ).toEqual([
      [4, 25],
      [4, undefined],
    ])
    expect(c.failures.value).toBe(0)
    expect(c.error.value).toBeNull()
    server.messages = range(1, 6)
    server.view = view({ state: 'answered' })
    await advance(3000)
    expect(c.messages.value.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(last().args).toMatchObject({ after_seq: 4 })
    expect(last().args.wait_s).toBeUndefined()
    // The same page again adds nothing twice.
    await advance(3000)
    expect(last().args).toMatchObject({ after_seq: 6 })
    expect(c.messages.value).toHaveLength(6)
    dispose()
  })

  it('on that schedule, slows down while an answered conversation stays quiet, and speeds up after the caller writes', async () => {
    server.waits = 'refuse'
    server.view = view({ state: 'answered' })
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    const t0 = Date.now()
    await advance(40_000)
    // Five quiet reads three seconds apart (the one at once included), then one each ten seconds or so
    // (checked every three).
    expect(plain().map((p) => p.at - t0)).toEqual([0, 3000, 6000, 9000, 12_000, 24_000, 36_000])
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
    commit()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.messages.value[2]!.retracted).toBeFalsy()
    const before = messageCalls().length
    server.view = view({ state: 'awaiting_answer', last_retracted_at: '2026-09-26T12:05:00Z' })
    commit()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.messages.value[2]!.retracted).toBeTruthy()
    expect(c.messages.value[2]!.body).toBeNull()
    // The held messages from the oldest, a page of 100 at a time; then a wait again, as Core did wait.
    const reads = messageCalls().slice(before)
    expect(reads.map((r) => [r.args.after_seq, r.args.wait_s])).toEqual([
      [0, undefined],
      [100, undefined],
      [150, 25],
    ])
    // Once read again, not again until it moves.
    const after = messageCalls().length
    await advance(25_000)
    await soon()
    expect(messageCalls().length - after).toBe(1)
    dispose()
  })

  it('reads the messages held again on the next read when reading them again failed', async () => {
    server.messages = range(1, 150)
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    await c.loadOlder()
    await c.loadOlder()
    server.messages = server.messages.map((m) =>
      m.seq === 3 ? { ...m, body: null, retracted: { at: 'x', by_member_id: 'staff' } } : m,
    )
    server.view = view({ state: 'awaiting_answer', last_retracted_at: '2026-09-26T12:05:00Z' })
    // The wait answers; reading the held messages again fails.
    vi.mocked(read).mockImplementationOnce(async (tool, args) => {
      calls.push({ tool, args: args as Record<string, unknown>, at: Date.now() })
      throw new ApiError({ status: 0, code: 'network', message: 'down' })
    })
    commit()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.messages.value[2]!.retracted).toBeFalsy()
    expect(c.failures.value).toBe(1)
    // The next read, though the view it brings says nothing new, reads them again.
    await advance(6000)
    expect(c.messages.value[2]!.retracted).toBeTruthy()
    expect(c.failures.value).toBe(0)
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

  it('shows a first read that failed, and backs off reads that fail as ever, then waits again', async () => {
    server.fail = true
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.error.value).toBeTruthy()
    expect(c.loaded.value).toBe(false)
    server.fail = false
    await c.load()
    expect(c.loaded.value).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(waits()).toHaveLength(1)
    // The wait under way ends; the next fails, and so does each after it, twice as long apart.
    server.fail = true
    await advance(25_000)
    await soon()
    expect(c.failures.value).toBe(1)
    const failedAt = [last().at]
    for (const wait of [6000, 12_000, 24_000]) {
      const n = messageCalls().length
      await advance(wait - 1)
      expect(messageCalls()).toHaveLength(n)
      await advance(1)
      expect(messageCalls()).toHaveLength(n + 1)
      failedAt.push(last().at)
    }
    expect(c.failures.value).toBe(4)
    // Up to 48 seconds apart at most.
    await advance(48_000)
    expect(c.failures.value).toBe(5)
    // What was shown stays; once a read answers, the next waits.
    expect(c.messages.value).toHaveLength(4)
    server.fail = false
    await advance(48_000)
    await soon()
    expect(c.failures.value).toBe(0)
    expect(last().args.wait_s).toBe(25)
    expect(waiting.size).toBe(1)
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
    await advance(25_000)
    expect(marks()).toHaveLength(1)
    dispose()
  })

  it('marks nothing on opening when nothing is unread, and then each answer as soon as it comes while it is shown', async () => {
    const { read, dispose } = start(ref(true), opener())
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toEqual([])
    // The opener writes (5), and the agent answers (6).
    server.messages = range(1, 6)
    commit()
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toEqual([{ course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm6' }])
    expect(read).toHaveLength(1)
    // What the opener writes themselves is never unread to them.
    server.messages = range(1, 7)
    commit()
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toHaveLength(1)
    dispose()
  })

  it('marks nothing for staff reading it, nor while it is off screen or the page hidden, and does once it is shown', async () => {
    server.readUpTo = 1
    const reader = ref<string | null>(null)
    const { c, dispose } = start(ref(true), reader)
    await vi.advanceTimersByTimeAsync(0)
    await advance(25_000)
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
    server.markFails = new ApiError({ status: 0, code: 'network', message: 'down' })
    const { read, dispose } = start(ref(true), opener())
    await vi.advanceTimersByTimeAsync(0)
    expect(marks()).toHaveLength(1)
    expect(read).toEqual([])
    server.markFails = undefined
    // After the next read, which answers when its wait is up.
    await advance(25_000)
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
    commit()
    await vi.advanceTimersByTimeAsync(0)
    await advance(25_000)
    expect(marks()).toHaveLength(1)
    again.dispose()
  })
})

describe('useConversation, with a Core that keeps drafts', () => {
  const draft = (version: number, over: Partial<ConversationDraft> = {}): ConversationDraft => ({
    attempt: 'a1',
    version,
    updated_at: '2026-09-26T12:00:00Z',
    steps: [{ kind: 'reading_document', target: 'HW1.pdf', state: version > 1 ? 'done' : 'running' }],
    ...over,
  })

  it('holds no draft, and never names one, where Core sends none', async () => {
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.draft.value).toBeNull()
    expect(last().args).not.toHaveProperty('seen_draft_version')
    dispose()
  })

  it('takes the draft its reads carry, and waits naming the version held, 0 for none', async () => {
    server.draft = null
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.draft.value).toBeNull()
    expect(last().args).toMatchObject({ wait_s: 25, seen_state: 'awaiting_answer', seen_draft_version: 0 })
    const waited = waits().length

    // The agent begins: the waiting read answers at once with it, and the next names its version.
    server.draft = draft(1)
    commit()
    await soon()
    expect(c.draft.value?.version).toBe(1)
    expect(c.draft.value?.steps?.[0]?.target).toBe('HW1.pdf')
    expect(waits().length).toBe(waited + 1)
    expect(last().args).toMatchObject({ seen_draft_version: 1 })
    // Its text comes, a version at a time; the wait goes on as before (a draft is news, not Core not waiting).
    server.draft = draft(2, { text: 'Convert with' })
    commit()
    await soon()
    expect(c.draft.value?.text).toBe('Convert with')
    expect(last().args).toMatchObject({ seen_draft_version: 2, wait_s: 25 })
    await advance(NO_WAIT_MS / 2)
    expect(plain()).toHaveLength(0)

    // The answer is posted: the draft goes in the same read, the message in its place.
    server.messages = [...server.messages, msg(6, { author_member_id: 'agent', body: 'Convert with c * 9 / 5 + 32.' })]
    server.view = view({ state: 'answered' })
    server.draft = null
    commit()
    await soon()
    expect(c.draft.value).toBeNull()
    expect(c.messages.value.at(-1)?.body).toBe('Convert with c * 9 / 5 + 32.')
    dispose()
  })

  it('reads on its schedule, as ever, where Core refuses to be asked about drafts', async () => {
    server.draft = null
    const r = vi.mocked(read)
    const real = r.getMockImplementation()!
    r.mockImplementation(async (tool, args, opts) => {
      if ((args as Record<string, unknown>).seen_draft_version !== undefined) {
        calls.push({ tool, args: args as Record<string, unknown>, opts, at: Date.now() })
        throw new ApiError({
          status: 400,
          code: 'invalid_argument',
          message: 'unexpected additional properties ["seen_draft_version"]',
        })
      }
      return real(tool, args, opts)
    })
    const { c, dispose } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(c.loaded.value).toBe(true)
    expect(c.failures.value).toBe(0)
    // Refused once, it is read at once instead, and on the schedule for a while.
    expect(plain().length).toBeGreaterThanOrEqual(1)
    r.mockImplementation(real)
    dispose()
  })
})
