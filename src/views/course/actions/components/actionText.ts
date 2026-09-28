// What the action pages share: an action's words (its kind, its target), the
// error or decision stored in its result, where an id leads, and whether the
// caller may decide or review it.
import type { RouteLocationRaw } from 'vue-router'
import type { ActionFull, Decimal, Preset } from '@/api/types'
import { i18n } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { formatDecimal } from '@/utils/format'
import { useMyAgents } from './myAgents'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})
const te = (key: string): boolean => (i18n.global as unknown as { te: (k: string) => boolean }).te(key)

/** An action as every action read tool returns it. */
export type ActionRow = ActionFull

export interface StoredError {
  code: string
  message: string
  details?: Record<string, unknown>
}

/** "grade.submit" → "Enter a grade"; an unknown kind as Core names it. */
export function typeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  const key = `actions.types.${type}`
  return te(key) ? t(key) : type
}

export function targetTypeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  const key = `actions.targetType.${type}`
  return te(key) ? t(key) : type
}

/** A field of a payload or result, in words. */
export function fieldLabel(name: string): string {
  const key = `actions.fields.${name}`
  return te(key) ? t(key) : name
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** The payload as an object (it is one for every tool Core has). */
export function payloadOf(a: Pick<ActionRow, 'payload'>): Record<string, unknown> {
  return isObject(a.payload) ? a.payload : {}
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/**
 * The error stored with a failed, denied or cancelled action: its result is
 * {"error": …}. Which it is follows from the status, never from the shape.
 */
export function storedError(a: Pick<ActionRow, 'status' | 'result'>): StoredError | null {
  if (a.status !== 'failed' && a.status !== 'denied' && a.status !== 'cancelled') return null
  const r = a.result
  if (isObject(r) && isObject(r.error)) {
    const e = r.error
    return {
      code: String(e.code ?? ''),
      message: String(e.message ?? ''),
      details: isObject(e.details) ? e.details : undefined,
    }
  }
  return null
}

/**
 * A rejected proposal's result: {"decision": {decision, reason, by_action_id,
 * by_owner}}; by_owner when the owner of the agent that proposed it rejected it.
 */
export function storedDecision(
  a: Pick<ActionRow, 'status' | 'result'>,
): { reason?: string; byActionId?: string; byOwner?: boolean } | null {
  if (a.status !== 'rejected') return null
  const r = a.result
  if (isObject(r) && isObject(r.decision)) {
    return {
      reason: str(r.decision.reason),
      byActionId: str(r.decision.by_action_id),
      byOwner: r.decision.by_owner === true,
    }
  }
  return {}
}

/** Why a proposal was cancelled or an attempt refused, in words, where Core said. */
export function reasonText(e: StoredError | null | undefined): string | null {
  if (!e?.details) return null
  const parts: string[] = []
  const reason = str(e.details.reason)
  if (reason === 'withdrawn' && e.details.by_owner === true) {
    // Taken back by the owner of the agent that proposed it.
    parts.push(t('actions.cancelReason.withdrawn_by_owner'))
  } else if (reason) {
    const k1 = `actions.cancelReason.${reason}`
    const k2 = `actions.denyReason.${reason}`
    parts.push(te(k1) ? t(k1) : te(k2) ? t(k2) : reason)
  }
  // A cancellation may say more of why: on a record from before owners were
  // fixed, that the agent's owner changed while its request waited.
  const why = str(e.details.why)
  if (why) {
    const k = `actions.cancelWhy.${why}`
    if (te(k)) parts.push(t(k))
  }
  const authz = str(e.details.authz_reason)
  if (authz) {
    const k = `actions.denyReason.${authz}`
    parts.push(te(k) ? t(k) : authz)
  }
  return parts.length ? parts.join(' ') : null
}

/**
 * The page an id of a given kind is shown on, if there is one. An action is
 * opened with action.get, which needs action_decide, or found among the
 * caller's own (action.list_mine); an action id met anywhere else names
 * someone else's, so it leads somewhere only for a decider. Link to one's
 * own actions by route name.
 */
export function routeFor(courseId: string, kind: string, id: string | null | undefined): RouteLocationRaw | null {
  if (!id) return null
  switch (kind) {
    case 'submission':
    case 'submission_id':
      return { name: 'course-submission', params: { courseId, submissionId: id } }
    case 'grade':
    case 'grade_id':
      return { name: 'course-grade', params: { courseId, gradeId: id } }
    case 'assignment':
    case 'assignment_id':
      return { name: 'course-assignment', params: { courseId, assignmentId: id } }
    case 'document':
    case 'document_id':
    case 'instructions_document_id':
    case 'rubric_document_id':
      return { name: 'course-document', params: { courseId, documentId: id } }
    case 'course_member':
    case 'member_id':
    case 'student_member_id':
      return { name: 'course-member', params: { courseId, memberId: id } }
    case 'action':
    case 'action_id':
    case 'by_action_id':
      return useCourseStore().can('action_decide') ? { name: 'course-action', params: { courseId, actionId: id } } : null
    case 'grade_component':
    case 'component_id':
      return { name: 'course-scheme', params: { courseId } }
    case 'course':
      return { name: 'course-overview', params: { courseId } }
    case 'conversation':
    case 'conversation_id':
      return { name: 'course-conversations', params: { courseId, conversationId: id } }
  }
  return null
}

/**
 * After a decision carried something out: forget the course's look-ups that
 * it may have changed (who is seated, which assignments there are).
 */
export function invalidateAfter(type: string | null | undefined) {
  const course = useCourseStore()
  const group = (type ?? '').split('.')[0]
  if (group === 'member') course.invalidate('members')
  else if (group === 'assignment') course.invalidate('assignments')
  else if (group === 'action') course.invalidate('all')
}

/** A decision or review: an action about another action. */
export function isAboutAction(a: Pick<ActionRow, 'action_type'>): boolean {
  return a.action_type === 'action.decide' || a.action_type === 'action.review'
}

/**
 * The start of a message as one line of plain text, for a summary: Markdown's
 * marks taken off (it is shown in full, rendered, elsewhere).
 */
export function excerpt(text: unknown, max = 80): string | undefined {
  if (typeof text !== 'string') return undefined
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return undefined
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}

export type Block =
  | 'own'
  | 'ownAgent'
  | 'ownAgentLevel'
  | 'ownReview'
  | 'ownRemove'
  | 'ownEscalation'
  | 'closesOwnEscalation'
  | 'archived'
  | 'waiting'
  | null

/**
 * Why the caller may not decide (or review) this, as far as can be told here.
 * Core has the last word: it also compares every seat the caller has held.
 *
 * A person and their agents are one party, and nobody decides their own
 * party's action; but the owner of an agent decides what it did where they
 * could have done it themselves without anyone's confirmation — their own
 * level for it autonomous, its target within their reach — and then as their
 * own doing of it, whatever they hold of action_decide (by_owner). The queues
 * say which are the caller's to decide (yours_to_decide); elsewhere Core's
 * refusal says it (owner_not_autonomous).
 */
export function useJudgeRules() {
  const course = useCourseStore()
  const session = useSessionStore()
  const myAgents = useMyAgents()
  // Whose seat is whose agent is read from the member list, and from the
  // caller's own agents where that list cannot be read.
  void course.ensureMembers()
  void myAgents.ensure()
  function isMine(a: { member_id?: string | null; actor_id?: string } | null | undefined): boolean {
    if (!a) return false
    return (!!a.member_id && a.member_id === course.myMemberId) || (!!a.actor_id && a.actor_id === session.me?.id)
  }
  /**
   * Whether an action is one of the caller's own agents': an agent they own
   * (agent.list), or a seat whose principal is theirs (the member list). A
   * person without action_decide is shown no one else's but their own in the
   * queues and by action.get, so what such a caller is deciding is their
   * agent's.
   */
  function isOwnAgent(a: { member_id?: string | null; actor_id?: string } | null | undefined): boolean {
    if (!a || isMine(a)) return false
    if (myAgents.has(a.actor_id)) return true
    const seat = a.member_id ? course.members.get(a.member_id) : undefined
    if (seat) {
      return (
        (!!seat.owner_actor_id && seat.owner_actor_id === session.me?.id) ||
        (!!course.myMemberId && seat.principal_member_id === course.myMemberId)
      )
    }
    return course.level('action_decide') === 'denied'
  }
  /**
   * Whether the owner of the agent that did it decided (or reviewed) it, as
   * their own doing (Core's by_owner). A rejection records it; otherwise the
   * seat that decided tells it: the proposer's principal is its owner's seat,
   * read from the member list, or, for the caller's own agent, their own.
   */
  function byOwner(
    a: Pick<ActionRow, 'member_id' | 'actor_id' | 'status' | 'result' | 'decided_by_member_id' | 'reviewed_by_member_id'>,
    what: 'decided' | 'reviewed',
  ): boolean {
    const by = what === 'decided' ? a.decided_by_member_id : a.reviewed_by_member_id
    if (!by) return false
    if (what === 'decided' && storedDecision(a)?.byOwner) return true
    const principal = a.member_id ? course.members.get(a.member_id)?.principal_member_id : undefined
    if (principal) return principal === by
    return isOwnAgent(a) && by === course.myMemberId
  }
  /**
   * Whether an action is the caller's own or their party's: a person, the
   * agents they own, and those agents among themselves are one party, and
   * nobody decides or reviews their own party's actions (Core refuses it).
   * Told from the seat that acted, where the member list is readable; the
   * approval and review queues say it outright (yours_to_decide), which
   * block() takes first.
   */
  function isOwnParty(a: { member_id?: string | null; actor_id?: string } | null | undefined): boolean {
    if (!a) return false
    if (isMine(a)) return true
    const me = course.myMemberId
    const seat = a.member_id ? course.members.get(a.member_id) : undefined
    // The caller's principal, when the caller is someone's agent.
    if (a.member_id && course.principalMemberId && a.member_id === course.principalMemberId) return true
    if (!seat) return false
    if (me && seat.principal_member_id === me) return true
    if (seat.owner_actor_id && seat.owner_actor_id === session.me?.id) return true
    // Another agent of the caller's own owner.
    const mine = me ? course.members.get(me) : undefined
    return !!mine?.owner_actor_id && seat.owner_actor_id === mine.owner_actor_id
  }
  function block(
    a: ActionRow,
    mode: 'decide' | 'review',
    about?: { member_id?: string | null; actor_id?: string } | null,
  ): Block {
    if (!course.writable) return 'archived'
    if (isMine(a)) return mode === 'decide' ? 'own' : 'ownReview'
    // The queues say whose it is to decide (yours_to_decide); elsewhere
    // (action.get) it is told from the member list. The caller's own agent's
    // is theirs where they could have done it themselves: said so by the
    // queue, or else left for Core to say.
    if (a.yours_to_decide === false) return isOwnAgent(a) ? 'ownAgentLevel' : 'ownAgent'
    if (a.yours_to_decide !== true && isOwnParty(a) && !isOwnAgent(a)) return 'ownAgent'
    if (isAboutAction(a) && isOwnParty(about)) return 'ownRemove'
    if (mode === 'review' && a.review_state === 'escalated' && a.reviewed_by_member_id && a.reviewed_by_member_id === course.myMemberId)
      return 'ownEscalation'
    return null
  }
  /**
   * Approving a review that would close an escalation the caller raised is
   * refused (rejecting it is not): an escalation is for someone else.
   */
  function approveBlock(
    a: ActionRow,
    about?: { review_state?: string; reviewed_by_member_id?: string | null } | null,
  ): Block {
    if (a.action_type !== 'action.review' || !about) return null
    if (about.review_state === 'escalated' && !!about.reviewed_by_member_id && about.reviewed_by_member_id === course.myMemberId)
      return 'closesOwnEscalation'
    return null
  }
  return { isMine, isOwnAgent, isOwnParty, byOwner, block, approveBlock }
}

/**
 * A decimal exactly as it was sent. Elsewhere a score is shown rounded; a
 * proposal is approved for the value it holds, so that is what is shown.
 */
export function exactDecimal(v: Decimal | null | undefined): string {
  if (typeof v === 'string') {
    const s = v.trim()
    const n = Number(s)
    // Digits a number cannot hold are shown as they were written.
    if (s === '' || !Number.isFinite(n) || plainDigits(n) !== canonicalDecimal(s)) return s || '—'
    return formatDecimal(n, 20)
  }
  return formatDecimal(v, 20)
}

function plainDigits(n: number): string {
  return canonicalDecimal(n.toLocaleString('en-US', { maximumFractionDigits: 20, useGrouping: false }))
}

/** "+012.500" → "12.5": the same number written the one way. */
function canonicalDecimal(s: string): string {
  let x = s.replace(/^\+/, '')
  const neg = x.startsWith('-')
  if (neg) x = x.slice(1)
  const [whole, frac = ''] = x.split('.')
  const i = whole.replace(/^0+(?=\d)/, '') || '0'
  const f = frac.replace(/0+$/, '')
  const out = f ? `${i}.${f}` : i
  return neg && out !== '0' ? `-${out}` : out
}

/**
 * The preset a member.add names, as Core finds it: by id, or by name — the
 * department's own of that name first, then the built-in.
 */
export function presetOf(presets: Preset[] | null | undefined, payload: Record<string, unknown>): Preset | undefined {
  if (!presets) return undefined
  const id = str(payload.preset_id)
  if (id) return presets.find((p) => p.id === id)
  const name = str(payload.preset)
  if (!name) return undefined
  return presets.find((p) => p.name === name && !!p.dept_id) ?? presets.find((p) => p.name === name && !p.dept_id)
}

/** Result fields that name something made or changed, in the order they are worth showing. */
export const RESULT_ID_FIELDS = [
  'grade_id',
  'submission_id',
  'document_id',
  'version_id',
  'assignment_id',
  'member_id',
  'action_id',
  'id',
]
