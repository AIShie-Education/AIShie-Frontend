// What the action pages share: an action's words (its kind, its target), the
// error or decision stored in its result, where an id leads, and whether the
// caller may decide or review it.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { ActionFull } from '@/api/types'
import { i18n } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'

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

/** A rejected proposal's result: {"decision": {decision, reason, by_action_id}}. */
export function storedDecision(
  a: Pick<ActionRow, 'status' | 'result'>,
): { reason?: string; byActionId?: string } | null {
  if (a.status !== 'rejected') return null
  const r = a.result
  if (isObject(r) && isObject(r.decision)) {
    return { reason: str(r.decision.reason), byActionId: str(r.decision.by_action_id) }
  }
  return {}
}

/** Why a proposal was cancelled or an attempt refused, in words, where Core said. */
export function reasonText(e: StoredError | null | undefined): string | null {
  if (!e?.details) return null
  const parts: string[] = []
  const reason = str(e.details.reason)
  if (reason) {
    const k1 = `actions.cancelReason.${reason}`
    const k2 = `actions.denyReason.${reason}`
    parts.push(te(k1) ? t(k1) : te(k2) ? t(k2) : reason)
  }
  const authz = str(e.details.authz_reason)
  if (authz) {
    const k = `actions.denyReason.${authz}`
    parts.push(te(k) ? t(k) : authz)
  }
  return parts.length ? parts.join(' ') : null
}

/** The page an id of a given kind is shown on, if there is one. */
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
      return { name: 'course-action', params: { courseId, actionId: id } }
    case 'grade_component':
    case 'component_id':
      return { name: 'course-scheme', params: { courseId } }
    case 'course':
      return { name: 'course-overview', params: { courseId } }
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

export type Block =
  | 'own'
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
 */
export function useJudgeRules() {
  const course = useCourseStore()
  const session = useSessionStore()
  function isMine(a: { member_id?: string | null; actor_id?: string } | null | undefined): boolean {
    if (!a) return false
    return (!!a.member_id && a.member_id === course.myMemberId) || (!!a.actor_id && a.actor_id === session.me?.id)
  }
  function block(
    a: ActionRow,
    mode: 'decide' | 'review',
    about?: { member_id?: string | null; actor_id?: string } | null,
  ): Block {
    if (!course.writable) return 'archived'
    if (isMine(a)) return mode === 'decide' ? 'own' : 'ownReview'
    if (isAboutAction(a) && isMine(about)) return 'ownRemove'
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
  return { isMine, block, approveBlock }
}

/** True below the given width, kept up to date. */
export function useNarrow(px = 768) {
  const narrow = ref(typeof window !== 'undefined' ? window.innerWidth < px : false)
  const on = () => (narrow.value = window.innerWidth < px)
  onMounted(() => window.addEventListener('resize', on))
  onUnmounted(() => window.removeEventListener('resize', on))
  return computed(() => narrow.value)
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
