import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { ChatConversation, ChatMessage, ChatSnapshot, ChatStreamOptions } from '@/api/runtimeChat'
import type { ConversationMessage } from '@/api/types'

const coreCalls: { kind: string; tool: string }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      coreCalls.push({ kind: 'read', tool })
      throw new Error(`Core must not be called for chat: ${tool}`)
    }),
    write: vi.fn(async (tool: string) => {
      coreCalls.push({ kind: 'write', tool })
      throw new Error(`Core must not be called for chat: ${tool}`)
    }),
  }
})

let current: ChatSnapshot
let agents: { agent_id: string; display_name: string; is_my_delegate: boolean; answers_course: boolean; answer_level: string }[]
const messageReads: { before_seq?: number; limit?: number }[] = []
interface OpenStream {
  opts: ChatStreamOptions
  signal?: AbortSignal
  reject: (e: unknown) => void
}
const streams: OpenStream[] = []

vi.mock('@/api/runtimeChat', async (orig) => {
  const real = await orig<typeof import('@/api/runtimeChat')>()
  return {
    ...real,
    runtimeChat: {
      agents: vi.fn(async () => ({ agents })),
      messages: vi.fn(async (_course: string, _id: string, opts: { before_seq?: number; limit?: number } = {}) => {
        messageReads.push(opts)
        if (opts.before_seq !== undefined) {
          return {
            ...current,
            messages: current.messages.filter((m) => m.seq < opts.before_seq!),
            more: false,
          }
        }
        return current
      }),
      stream: vi.fn((_course: string, _id: string, opts: ChatStreamOptions) => {
        let reject!: (e: unknown) => void
        const promise = new Promise<void>((_, r) => (reject = r))
        const signal = opts.signal
        streams.push({ opts, signal, reject })
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        return promise
      }),
    },
  }
})

const { ApiError } = await import('@/api/http')
const { useConversation, STREAM_RETRY_MS } = await import('./useConversation')

function message(seq: number, role: 'user' | 'assistant' = seq % 2 ? 'user' : 'assistant', over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m${seq}`,
    conversation_id: 'c1',
    seq,
    role,
    status: 'posted',
    body: `message ${seq}`,
    created_at: `2026-09-26T12:00:${String(seq).padStart(2, '0')}Z`,
    ...over,
  }
}
function conversation(over: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'c1',
    course_id: 'k1',
    agent_id: 'agt1',
    title: 'Chat',
    state: 'answering',
    revision: 1,
    created_at: '2026-09-26T11:00:00Z',
    updated_at: '2026-09-26T12:00:00Z',
    last_activity_at: '2026-09-26T12:00:00Z',
    ...over,
  }
}
function snap(over: Partial<ChatSnapshot> = {}): ChatSnapshot {
  return { conversation: conversation(), messages: [message(1)], more: false, draft: null, ...over }
}
function start(active = ref(true), reader = ref<string | null>(null)) {
  const scope = effectScope()
  const reads: unknown[] = []
  const c = scope.run(() =>
    useConversation({
      courseId: 'k1',
      conversationId: 'c1',
      active,
      reader,
      onRead: (out) => reads.push(out ?? 'read'),
      now: () => Date.now(),
    }),
  )!
  return { c, active, reader, reads, dispose: () => scope.stop() }
}
const settle = () => vi.advanceTimersByTimeAsync(0)
async function emit(s: OpenStream, event: string, data: unknown) {
  await s.opts.onEvent({ event, data })
  await settle()
}
let visibility: DocumentVisibilityState = 'visible'
function setVisibility(v: DocumentVisibilityState) {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  coreCalls.length = 0
  messageReads.length = 0
  streams.length = 0
  agents = [{ agent_id: 'agt1', display_name: 'Tutor', is_my_delegate: false, answers_course: true, answer_level: 'autonomous' }]
  current = snap()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => vi.useRealTimers())

describe('useConversation over AR alone', () => {
  it('loads the newest AR page and agent, opens one AR stream, and never calls a Core conversation tool', async () => {
    const { c, dispose } = start()
    await settle()
    expect(c.loaded.value).toBe(true)
    expect(c.messages.value.map((m) => m.seq)).toEqual([1])
    expect(c.view.value?.respondent.display_name).toBe('Tutor')
    expect(c.visibleTo.value).toEqual(['participants'])
    expect(streams).toHaveLength(1)
    expect(coreCalls).toEqual([])
    dispose()
    expect(streams[0]!.signal?.aborted).toBe(true)
  })

  it('merges message/snapshot events, takes drafts, and clears a draft with the final answer', async () => {
    current = snap({ messages: [message(1), message(2)] })
    const { c, dispose } = start()
    await settle()
    const s = streams[0]!
    await emit(s, 'draft', {
      conversation_id: 'c1',
      revision: 2,
      draft: { version: 3, text: 'Working', steps: [{ kind: 'writing', state: 'running' }], updated_at: '2026-09-26T12:01:00Z' },
    })
    expect(c.draft.value?.text).toBe('Working')
    await emit(s, 'message', snap({
      conversation: conversation({ state: 'answered', revision: 3 }),
      messages: [message(2), message(3, 'assistant', { body: 'Done' })],
      draft: null,
    }))
    expect(c.messages.value.map((m) => [m.id, m.body])).toEqual([['m1', 'message 1'], ['m2', 'message 2'], ['m3', 'Done']])
    expect(c.view.value?.state).toBe('answered')
    expect(c.draft.value).toBeNull()
    expect(coreCalls).toEqual([])
    dispose()
  })

  it('applies only newer conversation revisions and draft versions', async () => {
    const { c, dispose } = start()
    await settle()
    const s = streams[0]!
    await emit(s, 'state', { conversation: conversation({ revision: 4, state: 'answering' }) })
    expect(c.view.value?.state).toBe('awaiting_answer')
    await emit(s, 'state', { conversation: conversation({ revision: 2, state: 'closed' }) })
    expect(c.view.value?.state).toBe('awaiting_answer')
    await emit(s, 'draft', { conversation_id: 'c1', revision: 4, draft: { version: 8, text: 'new', steps: [], updated_at: 'x' } })
    await emit(s, 'draft', { conversation_id: 'c1', revision: 4, draft: { version: 7, text: 'old', steps: [], updated_at: 'y' } })
    expect(c.draft.value?.text).toBe('new')
    dispose()
  })

  it('applies a retraction without exposing its old body, files or draft', async () => {
    current = snap({
      messages: [message(1, 'user', { attachments: [{ id: 'a1', filename: 'a.txt', media_type: 'text/plain', size: 3 }] })],
      draft: { version: 1, text: 'draft', steps: [], updated_at: 'x' },
    })
    const { c, dispose } = start()
    await settle()
    await emit(streams[0]!, 'retracted', {
      conversation: conversation({ state: 'answered', revision: 2 }),
      retracted: message(1, 'user', { status: 'retracted', body: '', retracted_at: '2026-09-26T12:02:00Z' }),
      draft: null,
    })
    const m = c.messages.value[0] as ConversationMessage
    expect(m.retracted).toBeTruthy()
    expect(m.body).toBeNull()
    expect(m.attachments).toBeUndefined()
    expect(c.draft.value).toBeNull()
    dispose()
  })

  it('aborts on hidden/off screen/closed, and reads afresh without a Core wait fallback when shown again', async () => {
    const { c, active, dispose } = start()
    await settle()
    expect(streams).toHaveLength(1)
    active.value = false
    await nextTick()
    expect(streams[0]!.signal?.aborted).toBe(true)
    active.value = true
    await nextTick()
    await settle()
    expect(streams).toHaveLength(2)
    setVisibility('hidden')
    await settle()
    expect(streams[1]!.signal?.aborted).toBe(true)
    current = snap({ conversation: conversation({ revision: 2 }), messages: [message(1), message(2)] })
    await c.refresh()
    expect(c.messages.value).toHaveLength(2)
    expect(messageReads.at(-1)).toEqual({ limit: 50 })
    expect(streams).toHaveLength(2)
    setVisibility('visible')
    await settle()
    expect(streams).toHaveLength(3)
    await emit(streams[2]!, 'state', { conversation: conversation({ revision: 3, state: 'closed' }) })
    await nextTick()
    expect(streams[2]!.signal?.aborted).toBe(true)
    expect(coreCalls).toEqual([])
    dispose()
  })

  it('reconnects abnormal EOF with 1/2/4/8/15 second backoff, never by polling Core', async () => {
    const { dispose } = start()
    await settle()
    for (let i = 0; i < STREAM_RETRY_MS.length; i++) {
      const n = streams.length
      streams.at(-1)!.reject(new ApiError({ status: 0, code: 'network', message: 'down' }))
      await settle()
      await vi.advanceTimersByTimeAsync(STREAM_RETRY_MS[i]! - 1)
      expect(streams).toHaveLength(n)
      await vi.advanceTimersByTimeAsync(1)
      expect(streams).toHaveLength(n + 1)
    }
    expect(coreCalls).toEqual([])
    dispose()
  })

  it('reads older AR pages before the first held seq', async () => {
    current = snap({ messages: [message(3), message(4)], more: true })
    const { c, dispose } = start()
    await settle()
    current = snap({ messages: [message(1), message(2)] })
    await c.loadOlder()
    expect(messageReads.at(-1)).toEqual({ limit: 50, before_seq: 3 })
    expect(c.messages.value.map((m) => m.seq)).toEqual([1, 2, 3, 4])
    expect(c.hasOlder.value).toBe(false)
    dispose()
  })

  it('marks read locally on opening and new messages, with no Core mark_read write', async () => {
    const { reads, dispose } = start(ref(true), ref('user'))
    await settle()
    expect(reads).toEqual(['read'])
    await emit(streams[0]!, 'message', snap({ conversation: conversation({ revision: 2 }), messages: [message(2)] }))
    expect(reads).toEqual(['read', 'read'])
    expect(coreCalls).toEqual([])
    dispose()
  })
})
