// Browser chat belongs to AIshie Agent Runtime (AR), not Core. These are the
// canonical DTOs and routes from ARCHITECTURE-AMENDMENT-2026-11-27.md. Every
// call goes through runtime.ts's assertion transport: no Core session cookie,
// no redirect with a bearer, and no Core conversation tool is involved.
import { newIdempotencyKey, queryString, type UploadKind, type UploadedFile, type UploadOptions } from './http'
import { RuntimeError, runtimeFetch, runtimePath, runtimeRequest } from './runtime'
import { safeFileName } from '@/utils/files'

export interface ChatAgent {
  agent_id: string
  display_name: string
  /** Explicit Core grant relationship; never inferred from answers_course. */
  is_my_delegate: boolean
  answers_course: boolean
  answer_level: string
}

export type ChatConversationState = 'queued' | 'answering' | 'answered' | 'reply_pending_approval' | 'failed' | 'closed'

export interface ChatConversation {
  id: string
  course_id: string
  /** The agent's Core actor id, not a Core conversation id. */
  agent_id: string
  title: string
  state: ChatConversationState
  revision: number
  created_at: string
  updated_at: string
  last_activity_at: string
  close_reason?: string
}

export interface ChatSource {
  document_id: string
  version_id?: string
  file_id?: string
  page?: number
  slide?: number
  part?: number
}

export interface ChatUsage {
  input: number
  output: number
  reasoning: number
  cache_read: number
  cache_write: number
}

export interface ChatAttachment {
  id: string
  filename: string
  media_type: string
  size: number
  created_at?: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  seq: number
  role: 'user' | 'assistant'
  status: 'posted' | 'pending' | 'retracted' | 'failed'
  /** Empty once retracted. */
  body: string
  created_at: string
  attachments?: ChatAttachment[]
  sources?: ChatSource[]
  sources_stated?: boolean
  usage?: ChatUsage
  finish_reason?: string
  error?: { kind: string; retryable: boolean }
  retracted_at?: string
  retracted_reason?: string
}

export interface ChatDraft {
  version: number
  text: string
  steps: { kind: string; target?: string; state: 'running' | 'done' }[]
  updated_at: string
}

export interface ChatSubmission {
  status: 'executed' | 'proposed'
  approval_id?: string
  review_state: 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'reviewed' | null
}

export interface ChatApproval {
  id: string
  course_id: string
  conversation_id: string
  subject: 'question' | 'answer'
  message_id: string
  state: 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'reviewed' | 'cancelled'
  reason?: string
  created_at: string
  decided_at?: string
}

export interface ChatSnapshot {
  conversation: ChatConversation
  /** The newest page, in ascending seq order. */
  messages: ChatMessage[]
  more: boolean
  draft: ChatDraft | null
}

export interface ChatList {
  conversations: ChatConversation[]
  next: string | null
}

export interface ChatCreateInput {
  agent_id: string
  title?: string
  body: string
  attachment_ids?: string[]
  idempotency_key: string
}

export interface ChatAskInput {
  body: string
  attachment_ids?: string[]
  idempotency_key: string
}

export type ChatCreateResult = ChatSnapshot & { message: ChatMessage; submission?: ChatSubmission }
export type ChatAskResult = ChatSnapshot & { submission?: ChatSubmission }
export type ChatWithdrawResult = ChatSnapshot & { retracted: ChatMessage }

export interface ChatStreamEvent<T = unknown> {
  event: 'snapshot' | 'message' | 'draft' | 'retracted' | 'state' | 'error' | string
  data: T
}

export interface ChatStreamOptions {
  signal?: AbortSignal
  onOpen?: () => void
  onEvent: (event: ChatStreamEvent) => void | Promise<void>
}

const routes = {
  agents: '/courses/{course_id}/chat/agents',
  conversations: '/courses/{course_id}/conversations',
  conversation: '/courses/{course_id}/conversations/{conversation_id}',
  messages: '/courses/{course_id}/conversations/{conversation_id}/messages',
  withdraw: '/courses/{course_id}/conversations/{conversation_id}/withdraw',
  close: '/courses/{course_id}/conversations/{conversation_id}/close',
  stream: '/courses/{course_id}/conversations/{conversation_id}/stream',
  attachments: '/courses/{course_id}/attachments',
  attachment: '/courses/{course_id}/attachments/{attachment_id}',
  approvals: '/chat/approvals',
  approval: '/chat/approvals/{approval_id}',
  approvalAttachment: '/chat/approvals/{approval_id}/attachments/{attachment_id}',
  decision: '/chat/approvals/{approval_id}/decision',
  review: '/chat/approvals/{approval_id}/review',
} as const

type ChatRoute = (typeof routes)[keyof typeof routes]
function path(route: ChatRoute, courseId: string, conversationId?: string, attachmentId?: string): string {
  const params: Record<string, string> = { course_id: courseId }
  if (conversationId !== undefined) params.conversation_id = conversationId
  if (attachmentId !== undefined) params.attachment_id = attachmentId
  return runtimePath(route, params)
}

function invalidStream(message: string): RuntimeError {
  return new RuntimeError({ status: 200, code: 'invalid_response', reason: 'invalid_response', message: `AR chat stream: ${message}` })
}

/**
 * Reads AR's assertion-authenticated SSE one line at a time. Comments such as
 * `: connected` and `: ping` are deliberately not events. CRLF may be split
 * between chunks, and several data lines are joined as SSE requires before
 * their JSON is decoded. Normal EOF resolves; the caller decides whether to
 * reconnect. No Core polling fallback exists for AR-owned conversations.
 */
export async function streamChat(courseId: string, conversationId: string, opts: ChatStreamOptions): Promise<void> {
  const res = await runtimeFetch(path(routes.stream, courseId, conversationId), {
    headers: { Accept: 'text/event-stream' },
    signal: opts.signal,
  })
  const type = (res.headers.get('Content-Type') ?? '').toLowerCase()
  if (!type.startsWith('text/event-stream')) throw invalidStream('the runtime did not answer with text/event-stream')
  if (!res.body || typeof ReadableStream === 'undefined') throw invalidStream('this browser cannot read a response stream')
  opts.onOpen?.()

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'
  let data: string[] = []

  async function dispatch() {
    if (!data.length) {
      event = 'message'
      return
    }
    const text = data.join('\n')
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw invalidStream('an event did not carry JSON')
    }
    const current = event
    event = 'message'
    data = []
    await opts.onEvent({ event: current, data: parsed })
  }

  async function line(text: string) {
    if (!text) return dispatch()
    if (text.startsWith(':')) return
    const colon = text.indexOf(':')
    const field = colon < 0 ? text : text.slice(0, colon)
    let value = colon < 0 ? '' : text.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value || 'message'
    else if (field === 'data') data.push(value)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      for (;;) {
        const match = /\r\n|\n|\r/.exec(buffer)
        if (!match) break
        // A CR at a chunk's end may be half of CRLF: wait for the next chunk.
        if (!done && match[0] === '\r' && match.index + 1 === buffer.length) break
        const text = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        await line(text)
      }
      if (done) break
    }
    if (buffer) await line(buffer)
    await dispatch()
  } finally {
    reader.releaseLock()
  }
}

/** AR's fixed attachment rules; unlike documents, chat accepts only images and plain text. */
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const CHAT_TEXT_MAX_BYTES = 32 * 1024
export const CHAT_ATTACHMENT_MAX_FILES = 4

export function chatAttachmentLimit(file: Pick<File, 'type'>): number | null {
  const type = file.type.toLowerCase().split(';')[0]!.trim()
  if (type.startsWith('image/')) return CHAT_IMAGE_MAX_BYTES
  if (type.startsWith('text/')) return CHAT_TEXT_MAX_BYTES
  return null
}

/** Stages one file owned by the assertion's actor; its id is what a message binds. */
export async function uploadChatAttachment(
  courseId: string,
  _kind: UploadKind,
  file: File,
  opts: UploadOptions = {},
): Promise<UploadedFile> {
  const filename = safeFileName(file.name)
  const limit = chatAttachmentLimit(file)
  if (limit === null) {
    throw new RuntimeError({
      status: 422,
      code: 'unsupported_media_type',
      reason: 'unsupported_media_type',
      message: 'chat attachments accept images and plain text alone',
      details: { reason: 'unsupported_media_type', media_type: file.type },
    })
  }
  if (file.size > limit) {
    throw new RuntimeError({
      status: 422,
      code: 'file_too_large',
      reason: 'file_too_large',
      message: 'the attachment is larger than AR takes',
      details: { reason: 'file_too_large', size: file.size, byte_size: file.size, max_bytes: limit },
    })
  }
  const progress = (phase: 'preparing' | 'sending' | 'finishing', loaded: number) =>
    opts.onProgress?.({
      phase,
      loaded,
      total: file.size,
      fraction: file.size ? loaded / file.size : phase === 'finishing' ? 1 : 0,
      bytesPerSecond: null,
      secondsLeft: null,
      attempt: 1,
    })
  progress('preparing', 0)
  progress('sending', 0)
  const res = await runtimeFetch(path(routes.attachments, courseId) + queryString({ filename }), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
    signal: opts.signal,
  })
  const out = (await res.json()) as { attachment: ChatAttachment }
  progress('finishing', file.size)
  return {
    uploadToken: out.attachment.id,
    fileName: out.attachment.filename,
    contentType: out.attachment.media_type,
    size: out.attachment.size,
  }
}

export interface DownloadedChatAttachment {
  blob: Blob
  filename: string
  contentType: string
}

function downloadedName(header: string | null, fallback: string): string {
  if (!header) return fallback
  const encoded = /(?:^|;)\s*filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)?.[1]?.trim()
  if (encoded) {
    try {
      return safeFileName(decodeURIComponent(encoded.replace(/^"|"$/g, '')))
    } catch {
      // Fall through to the ordinary filename.
    }
  }
  const plain = /(?:^|;)\s*filename="((?:[^"\\]|\\.)*)"|(?:^|;)\s*filename=([^;]+)/i.exec(header)
  return safeFileName((plain?.[1] ?? plain?.[2] ?? fallback).replace(/\\"/g, '"').trim())
}

/** Downloads one's own AR attachment with the assertion, never a Core signed URL. */
export async function downloadChatAttachmentBytes(
  courseId: string,
  attachmentId: string,
  opts: { signal?: AbortSignal; filename?: string } = {},
): Promise<DownloadedChatAttachment> {
  const res = await runtimeFetch(path(routes.attachment, courseId, undefined, attachmentId), { signal: opts.signal })
  return {
    blob: await res.blob(),
    filename: downloadedName(res.headers.get('Content-Disposition'), safeFileName(opts.filename || attachmentId)),
    contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
  }
}

/**
 * Downloads an attachment as its approval's authorized reviewer. This route
 * checks the reviewer and the attachment's binding again; the owner-only
 * course attachment route is neither interchangeable nor a fallback on 404.
 */
export async function downloadChatApprovalAttachmentBytes(
  approvalId: string,
  attachmentId: string,
  opts: { signal?: AbortSignal; filename?: string } = {},
): Promise<DownloadedChatAttachment> {
  const res = await runtimeFetch(
    runtimePath(routes.approvalAttachment, { approval_id: approvalId, attachment_id: attachmentId }),
    { signal: opts.signal },
  )
  return {
    blob: await res.blob(),
    filename: downloadedName(res.headers.get('Content-Disposition'), safeFileName(opts.filename || attachmentId)),
    contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
  }
}

/** Canonical AR chat calls. Mutable create/ask calls carry the caller's key and may be retried under it. */
export const runtimeChat = {
  agents: async (courseId: string, opts: { signal?: AbortSignal } = {}) =>
    (await runtimeRequest<{ agents: ChatAgent[] }>('GET', path(routes.agents, courseId), opts)).data,
  list: async (
    courseId: string,
    opts: { limit?: number; after?: string; signal?: AbortSignal } = {},
  ): Promise<ChatList> =>
    (
      await runtimeRequest<ChatList>('GET', path(routes.conversations, courseId), {
        query: { limit: opts.limit, after: opts.after },
        signal: opts.signal,
      })
    ).data,
  get: async (courseId: string, conversationId: string, opts: { signal?: AbortSignal } = {}) =>
    (
      await runtimeRequest<{ conversation: ChatConversation }>(
        'GET',
        path(routes.conversation, courseId, conversationId),
        opts,
      )
    ).data.conversation,
  messages: async (
    courseId: string,
    conversationId: string,
    opts: { limit?: number; before_seq?: number; signal?: AbortSignal } = {},
  ): Promise<ChatSnapshot> =>
    (
      await runtimeRequest<ChatSnapshot>('GET', path(routes.messages, courseId, conversationId), {
        query: { limit: opts.limit, before_seq: opts.before_seq },
        signal: opts.signal,
      })
    ).data,
  create: async (courseId: string, input: ChatCreateInput): Promise<ChatCreateResult> =>
    (
      await runtimeRequest<ChatCreateResult>('POST', path(routes.conversations, courseId), {
        body: input,
        retry: true,
      })
    ).data,
  ask: async (courseId: string, conversationId: string, input: ChatAskInput): Promise<ChatAskResult> =>
    (
      await runtimeRequest<ChatSnapshot>('POST', path(routes.messages, courseId, conversationId), {
        body: input,
        retry: true,
      })
    ).data,
  withdraw: async (courseId: string, conversationId: string, messageId: string): Promise<ChatWithdrawResult> =>
    (
      await runtimeRequest<ChatWithdrawResult>('POST', path(routes.withdraw, courseId, conversationId), {
        body: { message_id: messageId },
        retry: false,
      })
    ).data,
  close: async (courseId: string, conversationId: string) =>
    (
      await runtimeRequest<{ conversation: ChatConversation; draft: null }>(
        'POST',
        path(routes.close, courseId, conversationId),
        { body: {}, retry: false },
      )
    ).data,
  approvals: async (
    courseId: string,
    opts: { state?: string; limit?: number; after?: string; signal?: AbortSignal } = {},
  ) =>
    (
      await runtimeRequest<{ approvals: ChatApproval[]; next: string | null }>('GET', routes.approvals, {
        query: { course_id: courseId, state: opts.state, limit: opts.limit, after: opts.after },
        signal: opts.signal,
      })
    ).data,
  approval: async (approvalId: string, opts: { signal?: AbortSignal } = {}) =>
    (await runtimeRequest<{ approval: ChatApproval; snapshot: ChatSnapshot }>(
        'GET',
        runtimePath(routes.approval, { approval_id: approvalId }),
        opts,
      ))
      .data,
  decide: async (
    approvalId: string,
    input: { decision: 'approve' | 'reject' | 'changes_requested'; reason?: string; idempotency_key: string },
  ) =>
    (
      await runtimeRequest<{ approval: ChatApproval; snapshot: ChatSnapshot }>(
        'POST',
        runtimePath(routes.decision, { approval_id: approvalId }),
        { body: input, retry: true },
      )
    ).data,
  review: async (approvalId: string, input: { idempotency_key: string }) =>
    (
      await runtimeRequest<{ approval: ChatApproval; snapshot: ChatSnapshot }>('POST', runtimePath(routes.review, { approval_id: approvalId }), {
        body: input,
        retry: true,
      })
    ).data,
  stream: streamChat,
}

/** One key for an intended create/ask; runtimeChat sends it unchanged on every transport retry. */
export function chatIdempotencyKey(): string {
  return newIdempotencyKey()
}
