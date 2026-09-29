// Which answers the caller has not read yet. Core keeps no record of what
// anyone has read, so this browser does: for each conversation, when the
// caller last had it on screen. What the caller keeps here is theirs alone
// (under their actor id), and small: conversation ids and times, the
// conversations still waiting for an answer, and the course they last asked
// in. Kept across sign-ins, so that what was read stays read.
import type { ConversationView } from '@/api/types'
import { activityAt, stateOf } from './chat'

const PREFIX = 'aishiteru.chat.'
/** At most this many conversations are remembered as read; the oldest are forgotten first. */
export const SEEN_MAX = 500
/** At most this many conversations waiting for an answer are watched. */
export const PENDING_MAX = 20

export interface ChatMemory {
  /**
   * When this browser started keeping track for the caller: an answer from
   * before then counts as read, so that the first time nothing old is new.
   */
  since: string
  /** By conversation id: the activity (last message) the caller has seen. */
  seen: Record<string, string>
  /** Conversations of the caller's waiting for an answer, by id: their course. */
  pending: Record<string, string>
  /** The course the caller last asked in, or looked at. */
  course: string | null
}

export function freshMemory(now = Date.now()): ChatMemory {
  return { since: new Date(now).toISOString(), seen: {}, pending: {}, course: null }
}

function isRecord(v: unknown): v is Record<string, string> {
  return !!v && typeof v === 'object' && Object.values(v).every((x) => typeof x === 'string')
}

/** What was kept for a caller, or a fresh start: nothing kept, storage refused, or something unreadable. */
export function loadMemory(actorId: string, now = Date.now()): ChatMemory {
  try {
    const raw = localStorage.getItem(PREFIX + actorId)
    if (!raw) return freshMemory(now)
    const v = JSON.parse(raw) as Partial<ChatMemory>
    if (typeof v.since !== 'string' || Number.isNaN(Date.parse(v.since))) return freshMemory(now)
    return {
      since: v.since,
      seen: isRecord(v.seen) ? v.seen : {},
      pending: isRecord(v.pending) ? v.pending : {},
      course: typeof v.course === 'string' ? v.course : null,
    }
  } catch {
    return freshMemory(now)
  }
}

/** Keeps it, trimmed to its limits; without storage it lasts for this page only. */
export function saveMemory(actorId: string, m: ChatMemory) {
  const seen = Object.entries(m.seen)
  const pending = Object.entries(m.pending)
  const trimmed: ChatMemory = {
    ...m,
    seen:
      seen.length > SEEN_MAX
        ? Object.fromEntries(seen.sort((a, b) => Date.parse(b[1]) - Date.parse(a[1])).slice(0, SEEN_MAX))
        : m.seen,
    pending: pending.length > PENDING_MAX ? Object.fromEntries(pending.slice(-PENDING_MAX)) : m.pending,
  }
  try {
    localStorage.setItem(PREFIX + actorId, JSON.stringify(trimmed))
  } catch {
    /* no storage: kept for this page only */
  }
}

type View = Pick<
  ConversationView,
  'id' | 'opener' | 'respondent' | 'last_author_member_id' | 'last_message_at' | 'created_at' | 'state' | 'status'
>

/**
 * Whether a conversation holds an answer the caller has not seen: they
 * opened it, the one asked wrote last, and that was after both what they saw
 * of it and when this browser started keeping track.
 */
export function isUnread(v: View, myMemberId: string | null | undefined, memory: Pick<ChatMemory, 'since' | 'seen'>) {
  if (!myMemberId || v.opener.member_id !== myMemberId) return false
  if (!v.last_author_member_id || v.last_author_member_id !== v.respondent.member_id) return false
  const at = activityAt(v)
  const seen = memory.seen[v.id]
  return at > Date.parse(memory.since) && (!seen || at > Date.parse(seen))
}

/** Whether a conversation of the caller's waits for an answer: asked, or an answer waiting for approval. */
export function awaitsAnswer(v: View, myMemberId: string | null | undefined): boolean {
  if (!myMemberId || v.opener.member_id !== myMemberId) return false
  const s = stateOf(v)
  return s === 'awaiting_answer' || s === 'reply_pending_approval'
}
