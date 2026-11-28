// Read-only access to conversations retained by Core v0.2.1.
//
// This module is deliberately separate from runtimeChat: an id accepted here
// is a Core conversation id and is never passed to AR. Core remains the only
// authorization boundary (me.conversations, conversation.list/messages and
// conversation.attachment); this client adds no seats, scope checks or cached
// grants. There are no open/ask/draft/retract/mark-read methods, and message
// reads never long-poll or expose Core's live draft payload.
import { read, type ReadOptions } from './http'
import type {
  ConversationAttachment,
  ConversationMessage,
  ConversationMessagesPage,
  ConversationView,
  MyConversation,
} from './types'

export const LEGACY_CONVERSATION_PAGE = 50
export const LEGACY_MESSAGE_PAGE = 50

export interface LegacyConversationList {
  conversations: MyConversation[]
  next: string | null
}

export interface LegacyOverseerList {
  conversations: ConversationView[]
  next: string | null
}

/** A finite, historical page. Unlike Core's wire result, it has no live draft. */
export interface LegacyMessagePage {
  conversation: ConversationMessagesPage['conversation']
  messages: ConversationMessage[]
  more: boolean
}

export interface LegacyListOptions extends ReadOptions {
  courseId?: string | null
  after?: string | null
  limit?: number
}

export interface LegacyOverseerListOptions extends ReadOptions {
  respondentMemberId: string
  after?: string | null
  limit?: number
}

export interface LegacyMessagesOptions extends ReadOptions {
  /** Read older history, never changes after a sequence (which could be live). */
  beforeSeq?: number | null
  limit?: number
}

/**
 * The complete Core surface available to the legacy view. Keeping this
 * interface read-only makes accidental use as an AR conversation adapter a
 * type error as well as an architectural one.
 */
export interface LegacyConversationReader {
  list(opts?: LegacyListOptions): Promise<LegacyConversationList>
  overseerList(courseId: string, opts: LegacyOverseerListOptions): Promise<LegacyOverseerList>
  messages(courseId: string, conversationId: string, opts?: LegacyMessagesOptions): Promise<LegacyMessagePage>
  attachment(courseId: string, attachmentId: string, opts?: ReadOptions): Promise<ConversationAttachment>
}

export const legacyConversation: LegacyConversationReader = Object.freeze({
  async list(opts: LegacyListOptions = {}): Promise<LegacyConversationList> {
    const out = await read(
      'me.conversations',
      {
        course_id: opts.courseId || undefined,
        after: opts.after || undefined,
        limit: opts.limit ?? LEGACY_CONVERSATION_PAGE,
      },
      { signal: opts.signal },
    )
    return { conversations: out.conversations ?? [], next: out.next ?? null }
  },

  async overseerList(courseId: string, opts: LegacyOverseerListOptions): Promise<LegacyOverseerList> {
    const out = await read(
      'conversation.list',
      {
        course_id: courseId,
        as: 'overseer',
        respondent_member_id: opts.respondentMemberId,
        after: opts.after || undefined,
        limit: opts.limit ?? LEGACY_CONVERSATION_PAGE,
      },
      { signal: opts.signal },
    )
    return { conversations: out.conversations ?? [], next: out.next ?? null }
  },

  async messages(
    courseId: string,
    conversationId: string,
    opts: LegacyMessagesOptions = {},
  ): Promise<LegacyMessagePage> {
    const out = await read(
      'conversation.messages',
      {
        course_id: courseId,
        conversation_id: conversationId,
        before_seq: opts.beforeSeq ?? undefined,
        limit: opts.limit ?? LEGACY_MESSAGE_PAGE,
      },
      { signal: opts.signal },
    )
    return {
      conversation: out.conversation,
      messages: out.messages ?? [],
      more: out.more,
      // out.draft is intentionally not carried across this boundary.
    }
  },

  async attachment(courseId: string, attachmentId: string, opts: ReadOptions = {}): Promise<ConversationAttachment> {
    return read('conversation.attachment', { course_id: courseId, attachment_id: attachmentId }, { signal: opts.signal })
  },
})
