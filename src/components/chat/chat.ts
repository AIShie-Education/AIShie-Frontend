// What the chat works out for itself from what Core sends: the order of
// messages, whose turn it is, what to tell the person about the one they are
// talking to, and which key sends. Only for display: Core decides who may
// write what, and refuses the rest.
import { shallowRef } from 'vue'
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

/** Messages by the same author this close together are one run: the name is said once, over the first. */
export const GROUP_MS = 5 * 60_000

/**
 * Whether a message follows the one before it in a run: the same author,
 * written within GROUP_MS of it.
 */
export function groupedWith(
  prev: Pick<ConversationMessage, 'author_member_id' | 'created_at'> | null | undefined,
  m: Pick<ConversationMessage, 'author_member_id' | 'created_at'>,
): boolean {
  if (!prev || prev.author_member_id !== m.author_member_id) return false
  const a = Date.parse(prev.created_at)
  const b = Date.parse(m.created_at)
  return Number.isFinite(a) && Number.isFinite(b) && b - a >= 0 && b - a <= GROUP_MS
}

/**
 * Whether the question awaiting an answer was withdrawn: the opener wrote
 * last, and retracted it. Nothing waits for an answer then: Core leaves it
 * out of the agent's inbox and refuses an answer to it, and a runtime stops
 * the answer it was writing. Core says the conversation is answered (since
 * AIShie-Core #42; before it, that an answer is still awaited).
 */
export function questionWithdrawn(
  messages: readonly Pick<ConversationMessage, 'author_member_id' | 'retracted'>[],
  openerMemberId: string | null | undefined,
): boolean {
  const last = messages.at(-1)
  return !!last && !!openerMemberId && last.author_member_id === openerMemberId && !!last.retracted
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
 * Core's reasons (details.reason) for refusing a new question,
 * conversation.open's or conversation.ask's, to an agent nobody asks in the
 * site now: mcp_agent, it has MCP access, used from its owner's own tools,
 * and is never asked here; agent_not_hosted, it is hosted on AIshie but the
 * site's runtime does not run it just now.
 */
export const NOT_ASKABLE_REASONS = ['mcp_agent', 'agent_not_hosted'] as const
export type NotAskableReason = (typeof NOT_ASKABLE_REASONS)[number]

/** Why Core refused a question because the agent asked is asked nothing in the site now, or null for another refusal. */
export function notAskableReason(
  e: { details?: Record<string, unknown> | null } | null | undefined,
): NotAskableReason | null {
  const r = e?.details?.reason
  return (NOT_ASKABLE_REASONS as readonly unknown[]).includes(r) ? (r as NotAskableReason) : null
}

/**
 * Whether the caller may ask a member here now, by conversation.respondents:
 * true when it lists them, false when it does not, null while it has not been
 * read (or could not be). The list leaves out every agent nobody asks in the
 * site now (one with MCP access, or one the site's runtime does not run),
 * whoever else the caller may address.
 */
export function offeredIn(respondents: readonly { member_id: string }[] | null | undefined, memberId: string) {
  if (!respondents) return null
  return respondents.some((r) => r.member_id === memberId)
}

/**
 * What the line above the composer says. waiting: the caller asked and the
 * agent has not answered (with how likely an answer is); pendingApproval: an
 * answer waits for someone's approval; start: nothing asked yet; elsewhere:
 * the agent asked is asked nothing in the site now (MCP access, or not
 * running), and nothing more is asked of it here; withdrawn: the opener took back the question waiting
 * for its answer, which no agent answers; readOnly: the caller is not the
 * one asking (staff, or the one asked), and reads it.
 */
export type Notice =
  | { kind: 'closed'; reason: ClosedReason | null }
  | { kind: 'waiting'; availability: Availability; approval: boolean }
  | { kind: 'unavailable'; availability: 'gone' | 'paused' | 'notAnswering' }
  | { kind: 'elsewhere' }
  | { kind: 'pendingApproval' }
  | { kind: 'withdrawn' }
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
 * seat is there and which may answer, is asked nothing in the site now (MCP
 * access, or the site's runtime does not run it). It is asked nothing more
 * here; what was written stays readable, and it may still answer.
 * withdrawn: the question awaiting its answer was retracted
 * (questionWithdrawn): nothing is awaited.
 */
export function chatStatus(
  view: ConversationView,
  myMemberId: string | null | undefined,
  opts: { now?: number; empty?: boolean; offered?: boolean | null; withdrawn?: boolean } = {},
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
  if (opts.withdrawn && (state === 'awaiting_answer' || view.last_author_member_id === view.opener.member_id)) {
    // Answered by the respondent since (the messages not yet read again), it is as ever.
    return { ...base, notice: { kind: 'withdrawn' }, block: null }
  }
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
export type VisibleToKey = 'participants' | 'overseers' | 'actionRecord' | 'respondentAnswersOthers' | 'auditExport'
export type VisibleToLine = { key: VisibleToKey } | { text: string }

// Core says who can read a conversation as codes (visible_to), by what the
// chat calls them. respondent_answers_others: the one answering answers other
// members too, holds what each writes, and may repeat it to them.
// audit_export, last of every list: the site's administrators, and those of
// the course's department, may export it for audit (conversation.export),
// withdrawn messages with their text.
const VISIBLE_TO: Record<string, VisibleToKey> = {
  participants: 'participants',
  overseers: 'overseers',
  action_record: 'actionRecord',
  respondent_answers_others: 'respondentAnswersOthers',
  audit_export: 'auditExport',
}
/** What Core says of every conversation, for one not read yet (or not yet started), but for its last line. */
export const DEFAULT_VISIBLE_TO: VisibleToKey[] = ['participants', 'overseers', 'actionRecord']
/** What Core says last of every conversation, after the rest. */
export const DEFAULT_VISIBLE_TO_LAST: VisibleToKey[] = ['auditExport']

/**
 * Who can read a conversation, in lines to show: the codes Core sends that
 * the app has words for are translated, any other is shown as Core sent it.
 * Before Core has said (a conversation not read yet, or not started), what it
 * says of every conversation, with the respondent's answering others when it
 * is known that it does (Core says so of every respondent that is not the
 * opener's own agent), and last that administrators may export it for audit.
 */
export function visibleToLines(
  list: readonly string[] | null | undefined,
  opts: { answersOthers?: boolean } = {},
): VisibleToLine[] {
  if (!list?.length) {
    const keys: VisibleToKey[] = [...DEFAULT_VISIBLE_TO]
    if (opts.answersOthers) keys.push('respondentAnswersOthers')
    keys.push(...DEFAULT_VISIBLE_TO_LAST)
    return keys.map((key) => ({ key }))
  }
  return list.map((s) => {
    const key = VISIBLE_TO[s.trim().toLowerCase()]
    return key ? { key } : { text: s }
  })
}

// --- Polling -------------------------------------------------------------------------

// The pane long-polls the conversation on screen: it reads what comes after
// the last message held with wait_s, and Core holds the read until there is
// something new (a message, the conversation in another state than
// seen_state, a message retracted) and answers within a few milliseconds of
// it, or with nothing after WAIT_S. It then reads again at once. Where Core
// does not wait (too many of the caller's reads wait already, it is shutting
// down, or it is from before wait_s and refuses it), the pane reads on its
// schedule (pollDelayMs) for NO_WAIT_MS, then asks to wait again.

/** How long a read waits for news (conversation.messages' wait_s): the most Core waits. */
export const WAIT_S = 25
/**
 * A read that waits is given up after this long, as a network failure: Core
 * answers it by WAIT_S, and one whose connection was dropped on the way
 * would otherwise hang for as long as the browser lets it.
 */
export const WAIT_TIMEOUT_MS = (WAIT_S + 15) * 1000
/** An answer to a read that waited, bringing nothing, sooner than this means Core did not wait. */
export const EARLY_MS = (WAIT_S * 1000) / 2
/** After Core did not wait, the pane reads on its schedule for this long before it asks to wait again. */
export const NO_WAIT_MS = 60_000
/**
 * A read waits only when the one before it answered less than this long
 * ago, so that what it compares with is what Core had then: after a pause
 * (the page hidden, the pane off screen, a failure) the pane reads at once.
 */
export const FRESH_MS = 1_000

/**
 * Whether Core refused a read because it asked to wait (wait_s, seen_state,
 * seen_draft_version):
 * a Core from before waiting refuses any argument it does not know
 * (invalid_argument, naming it).
 */
export function refusesWaiting(e: { status?: number; code?: string; message?: string } | null | undefined): boolean {
  return !!e && e.code === 'invalid_argument' && /\b(wait_s|seen_state|seen_draft_version)\b/.test(e.message ?? '')
}

/**
 * Whether a conversation stands as it did, as Core judges it for a read
 * that waits: in the same state, the same answer waiting for approval,
 * nothing retracted since, and closed (if it is) for the same reason. A read
 * that waited answers early without a message only when one of these moved.
 */
export function sameStanding(
  a: Pick<ConversationView, 'state' | 'status' | 'pending_reply_action_id' | 'last_retracted_at' | 'closed_reason'>,
  b: Pick<ConversationView, 'state' | 'status' | 'pending_reply_action_id' | 'last_retracted_at' | 'closed_reason'>,
): boolean {
  return (
    a.state === b.state &&
    a.status === b.status &&
    (a.pending_reply_action_id ?? null) === (b.pending_reply_action_id ?? null) &&
    (a.last_retracted_at ?? null) === (b.last_retracted_at ?? null) &&
    (a.closed_reason ?? null) === (b.closed_reason ?? null)
  )
}

/** How often the pane asks for new messages while an answer is expected, where Core does not wait. */
export const POLL_MS = 3_000

/**
 * How long to leave between reads of a conversation where Core does not
 * wait: every few seconds while an answer is expected; less often the
 * longer nothing happens once it has been answered; not at all once it is
 * closed.
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

/** Where the history lists a conversation, by its last activity: today, yesterday, this week, or earlier. */
export type HistoryGroup = 'today' | 'yesterday' | 'week' | 'earlier'
export const HISTORY_GROUPS: readonly HistoryGroup[] = ['today', 'yesterday', 'week', 'earlier']

/**
 * The history's group for a time, by this browser's calendar: the same day
 * as now, the day before, earlier this week (which begins on Monday), or
 * before that. A time after now (a clock a little behind Core's) is today.
 */
export function historyGroup(at: string | number, now: number): HistoryGroup {
  const t = typeof at === 'number' ? at : Date.parse(at)
  if (!Number.isFinite(t)) return 'earlier'
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const today = day.getTime()
  if (t >= today) return 'today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (t >= yesterday.getTime()) return 'yesterday'
  const monday = new Date(today)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  if (t >= monday.getTime()) return 'week'
  return 'earlier'
}

/** Whether a conversation's title, or its agent's name, holds what is searched for (any case). */
export function historyMatches(c: { title?: string | null; respondent: { display_name: string } }, query: string) {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return true
  return (c.title ?? '').toLocaleLowerCase().includes(q) || c.respondent.display_name.toLocaleLowerCase().includes(q)
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

// What the caller sent last from this page, for ↑ in an empty box to bring
// back (as drafts, for this page's life only).
const lastSentBody = shallowRef<string | null>(null)
export function noteSent(body: string) {
  if (body.trim()) lastSentBody.value = body
}
export function lastSent(): string | null {
  return lastSentBody.value
}
/** Forgets it (tests). */
export function forgetSent() {
  lastSentBody.value = null
}
