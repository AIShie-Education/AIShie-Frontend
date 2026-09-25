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
  let membersPromise: Promise<void> | null = null
  let assignmentsPromise: Promise<void> | null = null

  const myMemberId = computed(() => membership.value?.member_id ?? null)
  const role = computed(() => membership.value?.role ?? null)
  const archived = computed(() => course.value?.status === 'archived')
  /** Writes are refused in an archived course, from everyone. */
  const writable = computed(() => !archived.value)

  /** The caller's level for a permission, or null when it cannot be known. */
  function level(p: Perm): AutonomyLevel | null {
    if (permsSource.value === 'unknown') return null
    return perms.value[p] ?? 'denied'
  }

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
    members.value = new Map()
    membersState.value = 'idle'
    assignments.value = new Map()
    assignmentsState.value = 'idle'
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
    }
    // Not allowed to read the member list: guess from the built-in preset
    // named after the roster role, where there is one.
    const byRole: Record<string, string | undefined> = {
      student: 'student',
      ta: 'ta',
      instructor: 'instructor',
      observer: 'observer',
    }
    const presetName = byRole[m.role]
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
    membersState.value = 'loading'
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
        membersState.value = e instanceof ApiError && e.isForbidden ? 'forbidden' : 'error'
        membersPromise = null
      }
    })()
    return membersPromise
  }

  function ensureAssignments(): Promise<void> {
    const id = courseId.value
    if (!id || assignmentsState.value === 'loaded' || assignmentsState.value === 'forbidden') return Promise.resolve()
    if (assignmentsPromise) return assignmentsPromise
    assignmentsState.value = 'loading'
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
        assignmentsState.value = e instanceof ApiError && e.isForbidden ? 'forbidden' : 'error'
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
    assignments,
    assignmentsState,
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
