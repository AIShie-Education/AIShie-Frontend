// Adapters between AR's canonical chat DTOs and the pane's established view
// models. Only the shapes cross this boundary; every read and write beneath
// them is runtimeChat's. No Core conversation tool is called.
import type {
  ChatAgent,
  ChatConversation,
  ChatDraft,
  ChatMessage,
  ChatSnapshot,
  ChatSource,
} from '@/api/runtimeChat'
import type {
  ConversationMessage,
  ConversationState,
  ConversationView,
  Membership,
  MyConversation,
  Respondent,
} from '@/api/types'
import type { ConversationDraft } from './draft'

/** AR's work states are the pane's awaiting-answer state; terminal failure leaves the question visible. */
export function chatConversationState(c: Pick<ChatConversation, 'state'>): ConversationState {
  switch (c.state) {
    case 'queued':
    case 'answering':
      return 'awaiting_answer'
    case 'failed':
      // Failed is terminal: its assistant error stays visible and another question may be sent.
      return 'answered'
    case 'reply_pending_approval':
      return 'reply_pending_approval'
    case 'closed':
      return 'closed'
    default:
      return 'answered'
  }
}

/** An agent AR offers in this course, in the picker's established shape. */
export function chatAgentView(a: ChatAgent): Respondent {
  return {
    actor_id: a.agent_id,
    member_id: a.agent_id,
    display_name: a.display_name,
    kind: 'agent',
    role: 'assistant',
    is_my_delegate: a.is_my_delegate,
    answers_course: a.answers_course,
    hosting: 'runtime',
    answer_level: a.answer_level,
    last_seen_at: null,
    // AR's positive check_ask/list result is the availability signal; it has
    // no Core last_seen_at. This flag is intentionally not added to legacy DTOs.
    available: a.answer_level !== 'denied',
  } as Respondent & { available?: boolean }
}

/** AR conversations are one's own: the synthetic local opener id keeps author/role display independent of Core seats. */
export function chatConversationView(c: ChatConversation, agent?: ChatAgent): ConversationView {
  const respondent = agent
    ? chatAgentView(agent)
    : ({
        actor_id: c.agent_id,
        member_id: c.agent_id,
        display_name: c.agent_id,
        kind: 'agent',
        role: 'assistant',
        is_my_delegate: false,
        answers_course: true,
        hosting: 'runtime',
        answer_level: 'autonomous',
        last_seen_at: null,
      } as Respondent)
  return {
    id: c.id,
    title: c.title,
    state: chatConversationState(c),
    status: c.state === 'closed' ? 'closed' : 'open',
    closed_reason: c.close_reason ?? null,
    created_at: c.created_at,
    last_message_at: c.last_activity_at,
    opener: { member_id: 'user', display_name: 'You', kind: 'human' },
    respondent: {
      actor_id: respondent.actor_id,
      member_id: respondent.member_id,
      display_name: respondent.display_name,
      kind: 'agent',
      role: respondent.role,
      is_delegate_of_opener: respondent.is_my_delegate,
      answer_level: respondent.answer_level ?? 'autonomous',
      hosting: respondent.hosting ?? 'runtime',
      last_seen_at: respondent.last_seen_at ?? null,
      owner_name: null,
      seat_status: 'active',
    },
    unread: false,
  } as ConversationView
}

export function chatDraftView(d: ChatDraft | null | undefined): ConversationDraft | null {
  if (!d) return null
  return {
    // AR versions increase for the conversation, so this stable synthetic id is for the view model alone.
    attempt: 'ar',
    version: d.version,
    updated_at: d.updated_at,
    steps: d.steps ?? [],
    text: d.text,
  }
}

export function chatMessageView(m: ChatMessage, conversation: ConversationView): ConversationMessage {
  const retracted = m.status === 'retracted'
  const attachments = retracted
    ? undefined
    : (m.attachments ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        content_type: a.media_type,
        byte_size: a.size,
        created_at: a.created_at ?? m.created_at,
      }))
  return {
    id: m.id,
    seq: m.seq,
    author_member_id: m.role === 'user' ? conversation.opener.member_id : conversation.respondent.member_id,
    body: retracted || (m.status === 'pending' && m.role === 'assistant') ? null : m.body,
    created_at: m.created_at,
    attachments,
    // Minimal AR source locations are not Core SourceView objects. Keep them
    // apart for the lazy, safe resolver in ArMessageSources.vue.
    sources: m.sources_stated && (m.sources ?? []).length === 0 ? [] : undefined,
    ar_sources: m.sources ?? [],
    ar_sources_stated: m.sources_stated,
    ar_status: m.status,
    ar_error: m.error ?? null,
    retracted: retracted
      ? {
          at: m.retracted_at ?? m.created_at,
          by_member_id: conversation.opener.member_id,
          reason: m.retracted_reason ?? null,
        }
      : undefined,
  } as ConversationMessage
}

/** Applies a snapshot's message-derived standing to its conversation and returns the pane's page. */
export function chatSnapshotView(snapshot: ChatSnapshot, agent?: ChatAgent) {
  const conversation = chatConversationView(snapshot.conversation, agent)
  const messages = (snapshot.messages ?? []).map((m) => chatMessageView(m, conversation))
  const latestUser = [...messages].reverse().find((m) => m.author_member_id === conversation.opener.member_id)
  // A proposed question is successfully accepted for review, not still generating.
  if (latestUser && arMessageMeta(latestUser).status === 'pending' && conversation.state !== 'closed') {
    conversation.state = 'answered'
  }
  const last = messages.at(-1)
  const retractions = messages.map((m) => m.retracted?.at).filter((x): x is string => !!x)
  conversation.latest_opener_message_id = latestUser?.id ?? null
  conversation.last_author_member_id = last?.author_member_id ?? null
  if (retractions.length) conversation.last_retracted_at = retractions.sort().at(-1) ?? null
  return { conversation, messages, more: snapshot.more, draft: chatDraftView(snapshot.draft) }
}

/** AR-only message facts kept beside the established message view, without pretending its sources are Core's. */
export function arMessageMeta(m: ConversationMessage): {
  status: ChatMessage['status'] | null
  sources: ChatSource[]
  sourcesStated: boolean
  error: { kind: string; retryable: boolean } | null
} {
  const raw = m as ConversationMessage & {
    ar_status?: ChatMessage['status']
    ar_sources?: ChatSource[]
    ar_sources_stated?: boolean
    ar_error?: { kind: string; retryable: boolean } | null
  }
  return {
    status: raw.ar_status ?? null,
    sources: raw.ar_sources ?? [],
    sourcesStated: raw.ar_sources_stated ?? false,
    error: raw.ar_error ?? null,
  }
}

/** A history row, with course facts from the existing membership list rather than duplicated in AR's DTO. */
export function chatHistoryView(
  c: ChatConversation,
  membership: Membership,
  agent: ChatAgent | undefined,
  unread: boolean,
): MyConversation {
  return {
    conversation_id: c.id,
    course: {
      course_id: membership.course_id,
      code: membership.code,
      section: membership.section,
      title: membership.title,
    },
    created_at: c.created_at,
    last_activity_at: c.last_activity_at,
    may_ask: membership.status === 'active' && membership.course_status !== 'archived',
    member_id: membership.member_id,
    respondent: {
      actor_id: c.agent_id,
      member_id: c.agent_id,
      display_name: agent?.display_name ?? c.agent_id,
      kind: 'agent',
    },
    state: chatConversationState(c),
    status: c.state === 'closed' ? 'closed' : 'open',
    title: c.title,
    closed_reason: c.close_reason ?? null,
    unread,
  } as MyConversation
}
