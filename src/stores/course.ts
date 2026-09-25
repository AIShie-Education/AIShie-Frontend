// The course being looked at: the course itself, the caller's seat in it, and
// what that seat may do.
//
// Core does not tell a member their own permissions directly. A member who
// may read the member list (member_read) reads their own seat and knows them
// exactly. Anyone else is judged by the built-in preset their roster role
// suggests — a guess, since any value on a seat can be overridden — or not at
// all. Views therefore use can() to decide what to offer, never to decide
// what is allowed: Core decides that, and a refusal is shown as such.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, read } from '@/api/http'
import type {
  AssignmentSummary,
  AutonomyLevel,
  Course,
  Member,
  MemberSummary,
  Membership,
  Perm,
  PermLevels,
} from '@/api/types'
import { useSessionStore } from './session'

export type PermsSource = 'exact' | 'preset' | 'unknown'

const PAGE = 200

function toError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError({ status: 0, code: 'internal', message: String(e) })
}

export const useCourseStore = defineStore('course', () => {
  const courseId = ref<string | null>(null)
  const course = ref<Course | null>(null)
  const membership = ref<Membership | null>(null)
  const seat = ref<Member | null>(null)
  const perms = ref<PermLevels>({})
  const permsSource = ref<PermsSource>('unknown')
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  // Look-ups for showing names instead of ids. Loaded on demand.
  const members = ref<Map<string, MemberSummary>>(new Map())
  const membersState = ref<'idle' | 'loading' | 'loaded' | 'forbidden' | 'error'>('idle')
  const assignments = ref<Map<string, AssignmentSummary>>(new Map())
  const assignmentsState = ref<'idle' | 'loading' | 'loaded' | 'forbidden' | 'error'>('idle')
  const membersError = ref<ApiError | null>(null)
  const assignmentsError = ref<ApiError | null>(null)
  let membersPromise: Promise<void> | null = null
  let assignmentsPromise: Promise<void> | null = null

  const myMemberId = computed(() => membership.value?.member_id ?? null)
  const role = computed(() => membership.value?.role ?? null)
  const archived = computed(() => course.value?.status === 'archived')
  /** Writes are refused in an archived course, from everyone. */
  const writable = computed(() => !archived.value)

  /**
   * Levels learnt from Core's own refusals, whatever else is known: a seat
   * whose read of its own membership was refused does not hold member_read.
   */
  const refused = ref<Set<Perm>>(new Set())

  /** The caller's level for a permission, or null when it cannot be known. */
  function level(p: Perm): AutonomyLevel | null {
    if (refused.value.has(p)) return 'denied'
    if (permsSource.value === 'unknown') return null
    return perms.value[p] ?? 'denied'
  }

  /**
   * The level a tool gated by several permissions runs at: the lowest of
   * them (regrading is grade_submit and grade_post). Null if any is unknown
   * and none is known to be denied.
   */
  function levelOfAll(ps: Perm[]): AutonomyLevel | null {
    const levels = ps.map(level)
    if (levels.includes('denied')) return 'denied'
    if (levels.includes(null)) return null
    const order: AutonomyLevel[] = ['denied', 'confirm_required', 'pending_review', 'autonomous']
    return levels.reduce<AutonomyLevel>((lo, l) => (order.indexOf(l!) < order.indexOf(lo) ? l! : lo), 'autonomous')
  }

  function canAll(ps: Perm[]): boolean {
    return levelOfAll(ps) !== 'denied'
  }

  function needsApprovalAll(ps: Perm[]): boolean {
    return levelOfAll(ps) === 'confirm_required'
  }

  /**
   * Whether the caller sees every grade in the course, drafts included: needs
   * a grading permission and a scope that reaches every student and every
   * assignment. Only known for certain when the seat was read exactly.
   */
  const seesAllGrades = computed(
    () =>
      permsSource.value === 'exact' &&
      (can('grade_submit') || can('grade_post')) &&
      seat.value?.student_scope === 'all' &&
      seat.value?.assignment_scope === 'all',
  )

  /**
   * Whether to offer something gated by p. Unknown counts as yes: Core will
   * say no if it is no, and the view shows that.
   */
  function can(p: Perm): boolean {
    const l = level(p)
    return l === null || l !== 'denied'
  }

  /** Whether doing p will become a proposal that waits for approval. */
  function needsApproval(p: Perm): boolean {
    return level(p) === 'confirm_required'
  }

  function reset() {
    course.value = null
    membership.value = null
    seat.value = null
    perms.value = {}
    permsSource.value = 'unknown'
    error.value = null
    refused.value = new Set()
    members.value = new Map()
    membersState.value = 'idle'
    membersError.value = null
    assignments.value = new Map()
    assignmentsState.value = 'idle'
    assignmentsError.value = null
    membersPromise = null
    assignmentsPromise = null
  }

  async function open(id: string, force = false) {
    if (!force && courseId.value === id && course.value) return
    if (courseId.value !== id) reset()
    courseId.value = id
    loading.value = true
    error.value = null
    const session = useSessionStore()
    try {
      if (!session.membershipFor(id)) await session.loadMemberships().catch(() => undefined)
      membership.value = session.membershipFor(id) ?? null
      const [c] = await Promise.all([read('course.get', { course_id: id }), loadPerms(id)])
      if (courseId.value !== id) return
      course.value = c
    } catch (e) {
      if (courseId.value !== id) return
      error.value = e instanceof ApiError ? e : new ApiError({ status: 0, code: 'internal', message: String(e) })
    } finally {
      if (courseId.value === id) loading.value = false
    }
  }

  async function loadPerms(id: string) {
    const m = membership.value
    if (!m) {
      permsSource.value = 'unknown'
      return
    }
    try {
      const s = await read('member.get', { course_id: id, member_id: m.member_id })
      if (courseId.value !== id) return
      seat.value = s
      perms.value = (s.perms ?? {}) as PermLevels
      permsSource.value = 'exact'
      return
    } catch (e) {
      if (!(e instanceof ApiError) || !(e.isForbidden || e.isNotFound)) throw e
      // member.get is gated by member_read and nothing else, so a refusal
      // means the seat does not hold it (or is not live, which refuses all).
      if (e.isForbidden) refused.value = new Set([...refused.value, 'member_read'])
    }
    // Not allowed to read the member list: guess from the built-in preset
    // named after the roster role, where there is one. Agents are seated as
    // assistants; the two built-in agent presets are told apart by their
    // scope (a grader is listed to assignments, a tutor to students).
    const byRole: Record<string, string | undefined> = {
      student: 'student',
      ta: 'ta',
      instructor: 'instructor',
      observer: 'observer',
    }
    let presetName = byRole[m.role]
    if (m.role === 'assistant') {
      if (m.assignment_scope === 'listed' && m.student_scope === 'all') presetName = 'grader'
      else if (m.student_scope === 'listed' && m.assignment_scope === 'all') presetName = 'tutor'
    }
    if (!presetName) {
      permsSource.value = 'unknown'
      return
    }
    try {
      const out = await read('preset.list', {})
      const p = (out.presets ?? []).find((x) => x.name === presetName && !x.dept_id)
      if (courseId.value !== id) return
      if (p) {
        perms.value = (p.perms ?? {}) as PermLevels
        permsSource.value = 'preset'
      } else {
        permsSource.value = 'unknown'
      }
    } catch {
      permsSource.value = 'unknown'
    }
  }

  /** Loads every member (removed ones included) for name look-ups. */
  function ensureMembers(): Promise<void> {
    const id = courseId.value
    if (!id || membersState.value === 'loaded' || membersState.value === 'forbidden') return Promise.resolve()
    if (membersPromise) return membersPromise
    if (level('member_read') === 'denied') {
      // Asking would only be refused.
      membersState.value = 'forbidden'
      return Promise.resolve()
    }
    membersState.value = 'loading'
    membersError.value = null
    membersPromise = (async () => {
      const map = new Map<string, MemberSummary>()
      let after: string | undefined
      try {
        for (;;) {
          const out = await read('member.list', { course_id: id, include_removed: true, limit: PAGE, after })
          for (const m of out.members ?? []) map.set(m.id, m)
          if (!out.next) break
          after = out.next
        }
        if (courseId.value !== id) return
        members.value = map
        membersState.value = 'loaded'
      } catch (e) {
        if (courseId.value !== id) return
        membersError.value = toError(e)
        membersState.value = membersError.value.isForbidden ? 'forbidden' : 'error'
        if (membersError.value.isForbidden) refused.value = new Set([...refused.value, 'member_read'])
        membersPromise = null
      }
    })()
    return membersPromise
  }

  function ensureAssignments(): Promise<void> {
    const id = courseId.value
    if (!id || assignmentsState.value === 'loaded' || assignmentsState.value === 'forbidden') return Promise.resolve()
    if (assignmentsPromise) return assignmentsPromise
    if (level('document_read') === 'denied') {
      assignmentsState.value = 'forbidden'
      return Promise.resolve()
    }
    assignmentsState.value = 'loading'
    assignmentsError.value = null
    assignmentsPromise = (async () => {
      const map = new Map<string, AssignmentSummary>()
      let after: string | undefined
      try {
        for (;;) {
          const out = await read('assignment.list', { course_id: id, limit: PAGE, after })
          for (const a of out.assignments ?? []) map.set(a.id, a)
          if (!out.next) break
          after = out.next
        }
        if (courseId.value !== id) return
        assignments.value = map
        assignmentsState.value = 'loaded'
      } catch (e) {
        if (courseId.value !== id) return
        assignmentsError.value = toError(e)
        assignmentsState.value = assignmentsError.value.isForbidden ? 'forbidden' : 'error'
        assignmentsPromise = null
      }
    })()
    return assignmentsPromise
  }

  /** Forgets the look-ups, after something that changes them. */
  function invalidate(what: 'members' | 'assignments' | 'all' = 'all') {
    if (what === 'members' || what === 'all') {
      membersState.value = 'idle'
      membersPromise = null
    }
    if (what === 'assignments' || what === 'all') {
      assignmentsState.value = 'idle'
      assignmentsPromise = null
    }
  }

  function memberName(id: string | null | undefined): string | null {
    if (!id) return null
    if (id === myMemberId.value) return useSessionStore().me?.display_name ?? null
    return members.value.get(id)?.display_name ?? null
  }

  function assignmentTitle(id: string | null | undefined): string | null {
    if (!id) return null
    return assignments.value.get(id)?.title ?? null
  }

  return {
    courseId,
    course,
    membership,
    seat,
    perms,
    permsSource,
    loading,
    error,
    members,
    membersState,
    membersError,
    assignments,
    assignmentsState,
    assignmentsError,
    refused,
    seesAllGrades,
    levelOfAll,
    canAll,
    needsApprovalAll,
    myMemberId,
    role,
    archived,
    writable,
    level,
    can,
    needsApproval,
    open,
    reset,
    ensureMembers,
    ensureAssignments,
    invalidate,
    memberName,
    assignmentTitle,
  }
})
