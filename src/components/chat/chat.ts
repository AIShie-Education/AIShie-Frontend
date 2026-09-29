// What the chat works out for itself from what Core sends: the order of
// messages, whose turn it is, what to tell the person about the one they are
// talking to, and which key sends. Only for display: Core decides who may
// write what, and refuses the rest.
import { CLOSED_SEAT_REMOVED, CONVERSATION_STATES, CONVERSATIONS_ARE_WITH_AGENTS } from '@/api/types'
import type { ConversationMessage, ConversationState, ConversationView } from '@/api/types'
import { presenceOf, ONLINE_WITHIN_MS } from '@/utils/presence'

/** The longest message Core takes, in characters (code points, as Postgres counts them). */
export const BODY_MAX = 20_000
/** The longest title conversation.open takes. */
export const TITLE_MAX = 200
/** The longest reason conversation.close and conversation.retract take. */
export const REASON_MAX = 500

/** Characters as Core counts them: code points, so an emoji is one, not two. */
export function charCount(s: string | null | undefined): number {
  if (!s) return 0
  let n = 0
  // Counting without building an array: a 20 000-character draft is counted on every key.
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) i++
    }
    n++
  }
  return n
}

/**
 * What is sent of a draft: without blank lines before it or white space
 * after it. Indentation inside is kept (code, lists).
 */
export function cleanBody(s: string): string {
  return s.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd()
}

/**
 * The title a new conversation is given, from its first message: its first
 * line with anything on it, trimmed, cut to TITLE_MAX characters (counted as
 * Core counts them) with an ellipsis when it is longer. The history lists it
 * by that. Empty only for a message with nothing in it, which is not sent.
 */
export function titleFrom(body: string): string {
  const line =
    body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l) ?? ''
  if (charCount(line) <= TITLE_MAX) return line
  return (
    Array.from(line)
      .slice(0, TITLE_MAX - 1)
      .join('')
      .trimEnd() + '…'
  )
}

export type BodyProblem = 'empty' | 'tooLong'

/** Why a draft cannot be sent as it is, or null when it can. */
export function bodyProblem(s: string): BodyProblem | null {
  const body = cleanBody(s)
  if (!body.trim()) return 'empty'
  if (charCount(body) > BODY_MAX) return 'tooLong'
  return null
}

// --- Messages -------------------------------------------------------------------

/**
 * Messages merged with a page of them, in the order they were written (seq).
 * A message read again replaces the copy held (it may have been retracted
 * since), whichever page brought it; two held under one seq are one message,
 * the newer copy kept. Pages overlap freely: polling after the last seq, a
 * page of older ones, the newest read again.
 */
export function mergeMessages(
  have: readonly ConversationMessage[],
  page: readonly ConversationMessage[] | null | undefined,
): ConversationMessage[] {
  if (!page?.length) return have.slice()
  const bySeq = new Map<number, ConversationMessage>()
  const seqOfId = new Map<string, number>()
  const put = (m: ConversationMessage) => {
    const old = seqOfId.get(m.id)
    if (old !== undefined && old !== m.seq) bySeq.delete(old)
    const there = bySeq.get(m.seq)
    if (there && there.id !== m.id) seqOfId.delete(there.id)
    bySeq.set(m.seq, m)
    seqOfId.set(m.id, m.seq)
  }
  have.forEach(put)
  page.forEach(put)
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

/** The seq to poll after: the newest held, or null when none is. */
export function lastSeq(ms: readonly ConversationMessage[]): number | null {
  return ms.length ? ms[ms.length - 1]!.seq : null
}

/** The seq to read older messages before: the oldest held, or null. */
export function firstSeq(ms: readonly ConversationMessage[]): number | null {
  return ms.length ? ms[0]!.seq : null
}

/** Whether two copies of the messages say the same (so nothing moved on the screen). */
export function sameMessages(a: readonly ConversationMessage[], b: readonly ConversationMessage[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (x.id !== y.id || x.seq !== y.seq || !!x.retracted !== !!y.retracted) return false
  }
  return true
}

// --- The conversation ---------------------------------------------------------------

/**
 * The caller's part in a conversation: who opened it, who is asked, or staff
 * reading it. Only agents are asked: a person asked in a conversation from
 * before, which Core has closed since (conversations_are_with_agents), only
 * reads it, as staff do.
 */
export type ChatRole = 'opener' | 'respondent' | 'overseer'

export function roleIn(
  view: { opener: { member_id: string }; respondent: { member_id: string } },
  myMemberId: string | null | undefined,
): ChatRole {
  if (myMemberId && view.opener.member_id === myMemberId) return 'opener'
  if (myMemberId && view.respondent.member_id === myMemberId) return 'respondent'
  return 'overseer'
}

/** The state as one of the four Core names; anything else Core may say later reads as answered. */
export function stateOf(view: Pick<ConversationView, 'state' | 'status'>): ConversationState {
  if (view.status === 'closed') return 'closed'
  return (CONVERSATION_STATES as string[]).includes(view.state) ? (view.state as ConversationState) : 'answered'
}

/**
 * Whether the one asked can be expected to answer, as far as can be told:
 * gone (their seat was removed or ran out), paused, notAnswering (they may
 * not answer now), or for an agent whether anything is running it (never
 * connected, offline, online); a person is simply a person.
 */
export type Availability = 'gone' | 'paused' | 'notAnswering' | 'never' | 'offline' | 'online' | 'human'

export function availabilityOf(
  r: { kind: string; last_seen_at?: string | null; answer_level?: string | null; seat_status?: string | null },
  now: number = Date.now(),
): Availability {
  if (r.seat_status === 'removed' || r.seat_status === 'expired') return 'gone'
  if (r.seat_status === 'paused') return 'paused'
  if (r.answer_level === 'denied') return 'notAnswering'
  if (r.kind !== 'agent') return 'human'
  const p = presenceOf(r.last_seen_at, now, ONLINE_WITHIN_MS)
  return p === 'seen' ? 'offline' : p
}

/** Core's codes for why a conversation was closed, which the app has words for (enums.closedReason). */
export const CLOSED_REASON_CODES = [CLOSED_SEAT_REMOVED, CONVERSATIONS_ARE_WITH_AGENTS] as const
export type ClosedReasonCode = (typeof CLOSED_REASON_CODES)[number]

/** Why a conversation was closed: a code the app has words for, or the closer's own words. */
export type ClosedReason = { code: ClosedReasonCode } | { text: string }

export function closedReasonOf(reason: string | null | undefined): ClosedReason | null {
  const r = reason?.trim()
  if (!r) return null
  const code = CLOSED_REASON_CODES.find((c) => c === r)
  return code ? { code } : { text: r }
}

// --- Only agents are asked ---------------------------------------------------------

/**
 * What an agent one may ask is to the caller: their own personal assistant
 * (seated as their delegate), or the course's (anyone else's that answers
 * them: a course agent, or an agent the course seated itself).
 */
export function agentPurpose(r: { is_my_delegate: boolean }): 'personal' | 'course' {
  return r.is_my_delegate ? 'personal' : 'course'
}

// --- Site chat ---------------------------------------------------------------------

/**
 * Core's reason (details.reason) for refusing a new question, conversation.open's
 * or conversation.ask's, to an agent that takes no conversations in the site:
 * it is operated from an external tool (Claude through MCP, say), and nothing
 * that answers questions here runs it.
 */
export const AGENT_ANSWERS_ELSEWHERE = 'agent_answers_elsewhere'

/** Whether Core refused a question because the agent asked takes no conversations in the site. */
export function answersElsewhere(e: { details?: Record<string, unknown> | null } | null | undefined): boolean {
  return e?.details?.reason === AGENT_ANSWERS_ELSEWHERE
}

/**
 * Whether the caller may ask a member here now, by conversation.respondents:
 * true when it lists them, false when it does not, null while it has not been
 * read (or could not be). The list leaves out every agent that takes no
 * conversations in the site, whoever else the caller may address.
 */
export function offeredIn(respondents: readonly { member_id: string }[] | null | undefined, memberId: string) {
  if (!respondents) return null
  return respondents.some((r) => r.member_id === memberId)
}

/**
 * What the line above the composer says. waiting: the caller asked and the
 * agent has not answered (with how likely an answer is); pendingApproval: an
 * answer waits for someone's approval; start: nothing asked yet; elsewhere:
 * the agent asked takes no conversations in the site, and nothing more is
 * asked of it here; readOnly: the caller is not the one asking (staff, or the
 * one asked), and reads it.
 */
export type Notice =
  | { kind: 'closed'; reason: ClosedReason | null }
  | { kind: 'waiting'; availability: Availability; approval: boolean }
  | { kind: 'unavailable'; availability: 'gone' | 'paused' | 'notAnswering' }
  | { kind: 'elsewhere' }
  | { kind: 'pendingApproval' }
  | { kind: 'start' }
  | { kind: 'overseeing' }
  | { kind: 'readOnly' }

/** Why the caller cannot write here now; null when they can. */
export type WriteBlock = 'closed' | 'overseer' | 'respondent' | 'unavailable' | 'elsewhere'

export interface ChatStatus {
  state: ConversationState
  role: ChatRole
  /** Show the agent "typing": a question waits for it and it may answer it. */
  typing: boolean
  notice: Notice | null
  block: WriteBlock | null
}

/**
 * Everything the pane shows about where a conversation stands, for the caller.
 * Only its opener writes in it, to its agent (one with a person, from before,
 * Core has closed). offered: whether the caller may ask its agent now
 * (offeredIn), or null when that is not known; an agent they may not, whose
 * seat is there and which may answer, takes no conversations in the site. It
 * is asked nothing more here; what was written stays readable, and it may
 * still answer.
 */
export function chatStatus(
  view: ConversationView,
  myMemberId: string | null | undefined,
  opts: { now?: number; empty?: boolean; offered?: boolean | null } = {},
): ChatStatus {
  const role = roleIn(view, myMemberId)
  const state = stateOf(view)
  const base = { state, role, typing: false }
  if (state === 'closed') {
    return { ...base, notice: { kind: 'closed', reason: closedReasonOf(view.closed_reason) }, block: 'closed' }
  }
  if (role !== 'opener') {
    const block = role === 'overseer' ? 'overseer' : 'respondent'
    if (state === 'reply_pending_approval') return { ...base, notice: { kind: 'pendingApproval' }, block }
    return { ...base, notice: { kind: role === 'overseer' ? 'overseeing' : 'readOnly' }, block }
  }
  const availability = availabilityOf(view.respondent, opts.now)
  if (availability === 'gone' || availability === 'paused' || availability === 'notAnswering') {
    return { ...base, notice: { kind: 'unavailable', availability }, block: 'unavailable' }
  }
  if (opts.offered === false) return { ...base, notice: { kind: 'elsewhere' }, block: 'elsewhere' }
  if (state === 'reply_pending_approval') return { ...base, notice: { kind: 'pendingApproval' }, block: null }
  if (state === 'awaiting_answer') {
    return {
      ...base,
      typing: true,
      notice: { kind: 'waiting', availability, approval: view.respondent.answer_level === 'confirm_required' },
      block: null,
    }
  }
  return { ...base, notice: opts.empty ? { kind: 'start' } : null, block: null }
}

// --- Refusals -------------------------------------------------------------------------

/**
 * Whether Core refused a question as a conflict because the conversation is
 * closed (details.reason closed): it was closed since it was read.
 */
export function closedConflict(
  e: { code?: string; details?: Record<string, unknown> | null } | null | undefined,
): boolean {
  return !!e && e.code === 'conflict' && e.details?.reason === 'closed'
}

// --- Who can read it -------------------------------------------------------------------

/** The readers conversation.get names, by the chat's words for them. */
export type VisibleToKey = 'participants' | 'overseers' | 'actionRecord' | 'respondentAnswersOthers'
export type VisibleToLine = { key: VisibleToKey } | { text: string }

// Core says who can read a conversation as codes (visible_to), by what the
// chat calls them. respondent_answers_others: the one answering answers other
// members too, holds what each writes, and may repeat it to them.
const VISIBLE_TO: Record<string, VisibleToKey> = {
  participants: 'participants',
  overseers: 'overseers',
  action_record: 'actionRecord',
  respondent_answers_others: 'respondentAnswersOthers',
}
/** What Core says of every conversation, for one not read yet (or not yet started). */
export const DEFAULT_VISIBLE_TO: VisibleToKey[] = ['participants', 'overseers', 'actionRecord']

/**
 * Who can read a conversation, in lines to show: the codes Core sends that
 * the app has words for are translated, any other is shown as Core sent it.
 * Before Core has said (a conversation not read yet, or not started), what it
 * says of every conversation, with the respondent's answering others when it
 * is known that it does (Core says so of every respondent that is not the
 * opener's own agent).
 */
export function visibleToLines(
  list: readonly string[] | null | undefined,
  opts: { answersOthers?: boolean } = {},
): VisibleToLine[] {
  if (!list?.length) {
    const keys: VisibleToKey[] = [...DEFAULT_VISIBLE_TO]
    if (opts.answersOthers) keys.push('respondentAnswersOthers')
    return keys.map((key) => ({ key }))
  }
  return list.map((s) => {
    const key = VISIBLE_TO[s.trim().toLowerCase()]
    return key ? { key } : { text: s }
  })
}

// --- Polling -------------------------------------------------------------------------

/** How often the pane asks for new messages while an answer is expected. */
export const POLL_MS = 3_000

/**
 * How long to leave between reads of a conversation: every few seconds while
 * an answer is expected; less often the longer nothing happens once it has
 * been answered; not at all once it is closed.
 */
export function pollDelayMs(state: ConversationState, quietPolls: number): number | null {
  switch (state) {
    case 'closed':
      return null
    case 'awaiting_answer':
    case 'reply_pending_approval':
      return POLL_MS
  }
  if (quietPolls < 5) return POLL_MS
  if (quietPolls < 15) return 10_000
  return 30_000
}

// --- Lists ---------------------------------------------------------------------------

/** When a conversation last moved: its last message, or its start. */
export function activityAt(c: Pick<ConversationView, 'last_message_at' | 'created_at'>): number {
  const t = Date.parse(c.last_message_at ?? c.created_at)
  return Number.isNaN(t) ? 0 : t
}

/** Conversations with the latest activity first (Core lists them oldest first). */
export function byActivity<T extends Pick<ConversationView, 'last_message_at' | 'created_at' | 'id'>>(
  list: readonly T[],
): T[] {
  return list.slice().sort((a, b) => activityAt(b) - activityAt(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}

// --- The composer ---------------------------------------------------------------------

export interface SendKeyEvent {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  isComposing?: boolean
  keyCode?: number
}

/**
 * Whether a key press sends the draft. Enter sends and Shift+Enter starts a
 * new line; Ctrl/⌘+Enter always sends (also where Enter is a new line, on a
 * touch keyboard). Never while an input method is composing: the Enter that
 * picks a candidate (Chinese, Japanese…) is the IME's, which browsers mark
 * with isComposing, keyCode 229 (Safari), or only by the composition events
 * around it (composing).
 */
export function isSendKey(e: SendKeyEvent, opts: { composing?: boolean; enterSends?: boolean } = {}): boolean {
  if (e.key !== 'Enter') return false
  if (e.isComposing || opts.composing || e.keyCode === 229) return false
  if (e.shiftKey || e.altKey) return false
  if (e.ctrlKey || e.metaKey) return true
  return opts.enterSends !== false
}

/**
 * Who withdrew a message, as the reader is told: themselves, its author, or
 * course staff (someone who decides actions for the opener).
 */
export function retractedBy(
  m: Pick<ConversationMessage, 'author_member_id' | 'retracted'>,
  myMemberId: string | null | undefined,
): 'you' | 'author' | 'staff' | null {
  if (!m.retracted) return null
  const by = m.retracted.by_member_id
  if (by && myMemberId && by === myMemberId) return 'you'
  if (!by || by === m.author_member_id) return 'author'
  return 'staff'
}

// --- Drafts ------------------------------------------------------------------------

// What the caller has typed and not sent, by conversation (or by whom a new
// one is for), so that looking at another conversation, or closing the chat,
// loses nothing. Kept for this page's life only: signing out loads the page
// afresh (docs/CONVENTIONS.md).
const drafts = new Map<string, string>()

export function draftKey(
  courseId: string,
  conversationId: string | null | undefined,
  respondentId?: string | null,
): string {
  return conversationId ? `${courseId}:c:${conversationId}` : `${courseId}:to:${respondentId ?? ''}`
}
export function getDraft(key: string): string {
  return drafts.get(key) ?? ''
}
export function setDraft(key: string, text: string) {
  if (text) drafts.set(key, text)
  else drafts.delete(key)
}
