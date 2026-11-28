import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatApproval, ChatConversation, ChatMessage, ChatSnapshot } from './runtimeChat'

const requests: { method: string; path: string; opts: Record<string, unknown> }[] = []
const fetches: { path: string; opts: Record<string, unknown> }[] = []
let answer: unknown
let fetched: Response

vi.mock('./runtime', async (orig) => {
  const real = await orig<typeof import('./runtime')>()
  return {
    ...real,
    runtimeRequest: vi.fn(async (method: string, path: string, opts: Record<string, unknown> = {}) => {
      requests.push({ method, path, opts })
      return { data: answer, status: 200, etag: null, replayed: false }
    }),
    runtimeFetch: vi.fn(async (path: string, opts: Record<string, unknown> = {}) => {
      fetches.push({ path, opts })
      return fetched
    }),
  }
})

const { RuntimeError } = await import('./runtime')
const {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_TEXT_MAX_BYTES,
  downloadChatApprovalAttachmentBytes,
  downloadChatAttachmentBytes,
  runtimeChat,
  streamChat,
  uploadChatAttachment,
} = await import('./runtimeChat')

const conversation: ChatConversation = {
  id: 'c1',
  course_id: 'k1',
  agent_id: 'agt1',
  title: 'Chat',
  state: 'answering',
  revision: 1,
  created_at: '2026-11-27T00:00:00Z',
  updated_at: '2026-11-27T00:00:00Z',
  last_activity_at: '2026-11-27T00:00:00Z',
}
const message: ChatMessage = {
  id: 'm1',
  conversation_id: 'c1',
  seq: 1,
  role: 'user',
  status: 'posted',
  body: 'Question',
  created_at: '2026-11-27T00:00:00Z',
}
const snapshot: ChatSnapshot = { conversation, messages: [message], more: false, draft: null }

beforeEach(() => {
  requests.length = 0
  fetches.length = 0
  answer = snapshot
  fetched = new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
})

describe('runtimeChat canonical routes', () => {
  it('reads agents, conversations, metadata and message pages', async () => {
    answer = { agents: [] }
    await runtimeChat.agents('k 1')
    answer = { conversations: [conversation], next: null }
    await runtimeChat.list('k 1', { limit: 50, after: 'c 0' })
    answer = { conversation }
    await runtimeChat.get('k 1', 'c 1')
    await runtimeChat.messages('k 1', 'c 1', { limit: 50, before_seq: 9 })
    expect(requests.map((r) => [r.method, r.path, r.opts.query])).toEqual([
      ['GET', '/courses/k%201/chat/agents', undefined],
      ['GET', '/courses/k%201/conversations', { limit: 50, after: 'c 0' }],
      ['GET', '/courses/k%201/conversations/c%201', undefined],
      ['GET', '/courses/k%201/conversations/c%201/messages', { limit: 50, before_seq: 9 }],
    ])
  })

  it('creates and asks with idempotency keys, and withdraws/closes at AR', async () => {
    answer = { ...snapshot, message }
    await runtimeChat.create('k1', { agent_id: 'agt1', body: 'Question', attachment_ids: ['a1'], idempotency_key: 'new-key' })
    await runtimeChat.ask('k1', 'c1', { body: 'Again', idempotency_key: 'ask-key' })
    await runtimeChat.withdraw('k1', 'c1', 'm1')
    answer = { conversation: { ...conversation, state: 'closed' }, draft: null }
    await runtimeChat.close('k1', 'c1')
    expect(requests.map((r) => [r.method, r.path, r.opts.body, r.opts.retry])).toEqual([
      ['POST', '/courses/k1/conversations', { agent_id: 'agt1', body: 'Question', attachment_ids: ['a1'], idempotency_key: 'new-key' }, true],
      ['POST', '/courses/k1/conversations/c1/messages', { body: 'Again', idempotency_key: 'ask-key' }, true],
      ['POST', '/courses/k1/conversations/c1/withdraw', { message_id: 'm1' }, false],
      ['POST', '/courses/k1/conversations/c1/close', {}, false],
    ])
  })

  it('retains a proposed submission on replay and exposes the global AR approval routes', async () => {
    const submission = { status: 'proposed' as const, approval_id: 'ap1', review_state: 'pending' as const }
    answer = { ...snapshot, message: { ...message, status: 'pending' }, submission }
    const created = await runtimeChat.create('k1', { agent_id: 'agt1', body: 'Question', idempotency_key: 'same-key' })
    const asked = await runtimeChat.ask('k1', 'c1', { body: 'Question', idempotency_key: 'same-key' })
    expect(created.submission).toEqual(submission)
    expect(asked.submission).toEqual(submission)
    const approval: ChatApproval = {
      id: 'ap1',
      course_id: 'k1',
      conversation_id: 'c1',
      subject: 'question',
      message_id: 'm1',
      state: 'pending',
      created_at: '2026-11-27T00:00:00Z',
    }
    answer = { approvals: [approval], next: null }
    await runtimeChat.approvals('k1', { state: 'pending', limit: 50, after: 'ap0' })
    answer = { approval, snapshot }
    await runtimeChat.approval('ap1')
    answer = { approval, snapshot }
    await runtimeChat.decide('ap1', { decision: 'approve', idempotency_key: 'decide-key' })
    await runtimeChat.review('ap1', { idempotency_key: 'review-key' })
    expect(requests.slice(-4).map((r) => [r.method, r.path, r.opts.body ?? r.opts.query, r.opts.retry])).toEqual([
      ['GET', '/chat/approvals', { course_id: 'k1', state: 'pending', limit: 50, after: 'ap0' }, undefined],
      ['GET', '/chat/approvals/ap1', undefined, undefined],
      ['POST', '/chat/approvals/ap1/decision', { decision: 'approve', idempotency_key: 'decide-key' }, true],
      ['POST', '/chat/approvals/ap1/review', { idempotency_key: 'review-key' }, true],
    ])
  })
})

describe('AR attachment bytes', () => {
  it('stages an image or text file by raw bytes and a safe filename query', async () => {
    const attachment = { id: 'a1', filename: 'notes.txt', media_type: 'text/plain', size: 3 }
    fetched = new Response(JSON.stringify({ attachment }), { status: 201, headers: { 'Content-Type': 'application/json' } })
    const file = new File(['abc'], 'notes.txt', { type: 'text/plain' })
    const out = await uploadChatAttachment('k1', 'conversation', file)
    expect(out).toEqual({ uploadToken: 'a1', fileName: 'notes.txt', contentType: 'text/plain', size: 3 })
    expect(fetches[0]!.path).toBe('/courses/k1/attachments?filename=notes.txt')
    expect(fetches[0]!.opts).toMatchObject({ method: 'POST', body: file, headers: { 'Content-Type': 'text/plain' } })
  })

  it('refuses non-image/text and over-limit bytes before any request', async () => {
    await expect(
      uploadChatAttachment('k1', 'conversation', new File(['x'], 'x.pdf', { type: 'application/pdf' })),
    ).rejects.toMatchObject({ reason: 'unsupported_media_type' })
    await expect(
      uploadChatAttachment('k1', 'conversation', new File([new Uint8Array(CHAT_TEXT_MAX_BYTES + 1)], 'x.txt', { type: 'text/plain' })),
    ).rejects.toMatchObject({ reason: 'file_too_large', details: { max_bytes: CHAT_TEXT_MAX_BYTES } })
    expect(CHAT_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(fetches).toEqual([])
  })

  it('downloads bytes with the safe Content-Disposition filename', async () => {
    fetched = new Response('abc', {
      headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="safe name.txt"' },
    })
    const out = await downloadChatAttachmentBytes('k1', 'a1')
    expect(out.filename).toBe('safe name.txt')
    expect(out.contentType).toBe('text/plain')
    expect(await out.blob.text()).toBe('abc')
  })

  it('downloads reviewer bytes only through the approval-bound attachment route', async () => {
    const controller = new AbortController()
    fetched = new Response('reviewer bytes', {
      headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="review notes.txt"' },
    })
    const out = await downloadChatApprovalAttachmentBytes('ap 1', 'att 1', {
      filename: 'fallback.txt',
      signal: controller.signal,
    })
    expect(fetches).toEqual([
      { path: '/chat/approvals/ap%201/attachments/att%201', opts: { signal: controller.signal } },
    ])
    expect(fetches[0]!.path).not.toContain('/courses/')
    expect(out.filename).toBe('review notes.txt')
    expect(out.contentType).toBe('text/plain')
    expect(await out.blob.text()).toBe('reviewer bytes')
  })
})

function sse(chunks: string[], type = 'text/event-stream; charset=utf-8'): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': type } })
}

describe('streamChat', () => {
  it('parses SSE line by line across chunks, ignores comments and joins data lines', async () => {
    fetched = sse([
      ': connected\r\n\r\nevent: snapshot\r',
      '\ndata: {"conversation":',
      '\ndata: {"id":"c1"},\r\ndata: "messages":[], "more":false, "draft":null}\r\n\r\n',
      ': ping\n\nevent: draft\ndata: {"conversation_id":"c1","revision":2,"draft":null}\n\n',
    ])
    const events: { event: string; data: unknown }[] = []
    let opened = 0
    await streamChat('k1', 'c1', { onOpen: () => opened++, onEvent: (e) => {
        events.push(e)
      } })
    expect(opened).toBe(1)
    expect(fetches[0]).toMatchObject({ path: '/courses/k1/conversations/c1/stream', opts: { headers: { Accept: 'text/event-stream' } } })
    expect(events).toEqual([
      { event: 'snapshot', data: { conversation: { id: 'c1' }, messages: [], more: false, draft: null } },
      { event: 'draft', data: { conversation_id: 'c1', revision: 2, draft: null } },
    ])
  })

  it('rejects a proxy JSON/page answer rather than treating it as a stream', async () => {
    fetched = sse([], 'application/json')
    await expect(streamChat('k1', 'c1', { onEvent: vi.fn() })).rejects.toBeInstanceOf(RuntimeError)
  })

  it('passes an abort through as an abort, not a server failure', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    fetched = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
    const ctrl = new AbortController()
    const pending = streamChat('k1', 'c1', { signal: ctrl.signal, onEvent: vi.fn() })
    // A real fetch errors its response reader when the signal aborts.
    ctrl.signal.addEventListener('abort', () => stream.error(new DOMException('aborted', 'AbortError')))
    ctrl.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
