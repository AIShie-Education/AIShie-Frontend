// The course being looked at: the course itself, the caller's seat in it, and
// what that seat may do.
//
// Core tells every member what their seat may do now: me.memberships carries
// each seat's effective levels (its own, capped by its principal's when the
// caller is someone's delegate; all denied while the seat does not count).
// Those are exact. A Core from before that field is handled as before: a
// member who may read the member list (member_read) reads their own seat and
// knows its levels exactly; anyone else is judged by the built-in preset
// their roster role suggests — a guess, since any value on a seat can be
// overridden — or not at all. Views use can() to decide what to offer, never
// to decide what is allowed: Core decides that, and a refusal is shown as such.
//
// A person who decides nothing in a course (no action_decide) may still own
// an agent that holds or held a seat there, and then decides what it proposed
// wherever they could have done it themselves: Core shows them their own
// agents' proposals and reviews in the course's queues, and nobody else's.
// Whether that is so is asked of the queue itself (ownsAgentHere), whose gate
// is that very rule.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, read } from '@/api/http'
import {
  AUTONOMY_LEVELS,
  PERMS,
  type AssignmentSummary,
  type AutonomyLevel,
  type BuiltinPreset,
  type Course,
  type Member,
  type MemberSummary,
  type Membership,
  type Perm,
  type PermLevels,
} from '@/api/types'
import { useSessionStore } from './session'

export type PermsSource = 'exact' | 'preset' | 'unknown'

const PAGE = 200
/** How old the caller's memberships may be when a course is opened, before they are read again. */
const MEMBERSHIPS_FRESH_MS = 5_000

function toError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError({ status: 0, code: 'internal', message: String(e) })
}

/**
 * The seat's effective levels as me.memberships gives them, or null from a
 * Core that does not (the field arrived with delegate seats). Any permission
 * missing from what Core sent is denied.
 */
export function effectivePerms(m: Pick<Membership, 'perms'> | null | undefined): PermLevels | null {
  const p = m?.perms as Record<string, string | undefined> | null | undefined
  if (!p || typeof p !== 'object') return null
  const out: PermLevels = {}
  for (const k of PERMS) {
    const v = p[k]
    out[k] = v && (AUTONOMY_LEVELS as string[]).includes(v) ? (v as AutonomyLevel) : 'denied'
  }
  return out
}

/**
 * The built-in preset a seat's roster facts suggest, when its levels cannot
 * be read: the preset named after its role, for people. Agents are seated as
 * assistants; the two built-in agent presets of old are told apart by their
 * scope (a grader is listed to assignments, a tutor to students). A delegate
 * (a seat with a principal) is never guessed: whatever preset it was seated
 * with, it is capped by its principal's seat, which cannot be seen from here.
 */
export function guessPreset(
  m: Pick<Membership, 'role' | 'student_scope' | 'assignment_scope'> & { principal_member_id?: string | null },
): BuiltinPreset | null {
  if (m.principal_member_id) return null
  switch (m.role) {
    case 'student':
    case 'ta':
    case 'instructor':
    case 'observer':
      return m.role
    case 'assistant':
      if (m.assignment_scope === 'listed' && m.student_scope === 'all') return 'grader'
      if (m.student_scope === 'listed' && m.assignment_scope === 'all') return 'tutor'
  }
  return null
}

export const useCourseStore = defineStore('course', () => {
  const courseId = ref<string | null>(null)
  const course = ref<Course | null>(null)
  const membership = ref<Membership | null>(null)
  const seat = ref<Member | null>(null)
  const perms = ref<PermLevels>({})
  const permsSource = ref<PermsSource>('unknown')
  /** The built-in preset perms were guessed from, when permsSource is 'preset'. */
  const guessedPreset = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  /**
   * For a person whose seat holds no action_decide: whether they own an agent
   * that holds or held a seat in the course, so that its proposals and
   * reviews are theirs to find (and, where they could have done the same
   * themselves, to decide). Null until known, and wherever it does not
   * matter: a seat that decides anyway, an agent's, levels not known.
   */
  const ownsAgentHere = ref<boolean | null>(null)

  // Look-ups for showing names instead of ids. Loaded on demand.
  const members = ref<Map<string, MemberSummary>>(new Map())
  const membersState = ref<'idle' | 'loading' | 'loaded' | 'forbidden' | 'error'>('idle')
  const assignments = ref<Map<string, AssignmentSummary>>(new Map())
  const assignmentsState = ref<'idle' | 'loading' | 'loaded' | 'forbidden' | 'error'>('idle')
  const membersError = ref<ApiError | null>(null)
  const assignmentsError = ref<ApiError | null>(null)
  let membersPromise: Promise<void> | null = null
  let assignmentsPromise: Promise<void> | null = null
  /**
   * Bumped whenever what is held is dropped (another course, another caller).
   * Anything asked for before then is stale when it comes back, even for the
   * same course id, and must not be written into what is held now.
   */
  let epoch = 0

  const myMemberId = computed(() => membership.value?.member_id ?? null)
  const role = computed(() => membership.value?.role ?? null)
  /**
   * When the caller is someone's delegate (an agent seated by its owner, as
   * when a person signs in here with their agent's token), the principal's
   * seat: the caller then holds nothing that seat does not. Null for a seat
   * of one's own, which every person's is.
   */
  const principalMemberId = computed(() => membership.value?.principal_member_id ?? null)
  const isDelegate = computed(() => !!principalMemberId.value)
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
      (seat.value ?? membership.value)?.student_scope === 'all' &&
      (seat.value ?? membership.value)?.assignment_scope === 'all',
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
    epoch++
    course.value = null
    membership.value = null
    seat.value = null
    perms.value = {}
    permsSource.value = 'unknown'
    guessedPreset.value = null
    error.value = null
    ownsAgentHere.value = null
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

  /** Whether what was asked for course id in the given epoch still belongs to what is held. */
  function current(id: string, e: number): boolean {
    return courseId.value === id && epoch === e
  }

  async function open(id: string, force = false) {
    if (!force && courseId.value === id && course.value) return
    if (courseId.value !== id) reset()
    courseId.value = id
    const e = epoch
    loading.value = true
    error.value = null
    const session = useSessionStore()
    try {
      // The seat's levels come with the memberships, and change when someone
      // changes the seat: read them afresh for each course opened, unless
      // they were read a moment ago (signing in reads them too); what was
      // held stands in if Core cannot be asked.
      await session.loadMemberships(force ? {} : { maxAgeMs: MEMBERSHIPS_FRESH_MS }).catch(() => undefined)
      if (!current(id, e)) return
      const m = session.membershipFor(id) ?? null
      membership.value = m
      const [c] = await Promise.all([read('course.get', { course_id: id }), loadPerms(id, m, e)])
      if (!current(id, e)) return
      course.value = c
      void probeOwnAgents(id, e)
    } catch (err) {
      if (!current(id, e)) return
      error.value = toError(err)
    } finally {
      if (current(id, e)) loading.value = false
    }
  }

  /**
   * Forgets the open course altogether, as when the caller changes: the next
   * open() of any course, the same one included, starts again from nothing.
   */
  function close() {
    reset()
    courseId.value = null
    loading.value = false
  }

  /**
   * Works out the seat's permissions. Every write is checked against the
   * course and epoch it was asked for: a late answer about a course left
   * behind must not land in the one open now.
   */
  async function loadPerms(id: string, m: Membership | null, e: number) {
    if (!m) {
      if (current(id, e)) setPermsSource('unknown')
      return
    }
    const effective = effectivePerms(m)
    if (effective) {
      // Exact, from Core. The seat itself (its stored levels, lists and
      // expiry, which the member pages compare grants with) is read too
      // where the seat may read the member list; nothing is asked that is
      // sure to be refused.
      perms.value = effective
      setPermsSource('exact')
      if (effective.member_read === 'denied' || !effective.member_read) return
      try {
        const s = await read('member.get', { course_id: id, member_id: m.member_id })
        if (current(id, e)) seat.value = s
      } catch (err) {
        // The levels are known either way: a seat that cannot be read only
        // leaves the member pages without it to compare grants with.
        if (current(id, e) && err instanceof ApiError && err.isForbidden) {
          refused.value = new Set([...refused.value, 'member_read'])
        }
      }
      return
    }
    try {
      const s = await read('member.get', { course_id: id, member_id: m.member_id })
      if (!current(id, e)) return
      seat.value = s
      perms.value = (s.perms ?? {}) as PermLevels
      setPermsSource('exact')
      return
    } catch (err) {
      if (!(err instanceof ApiError) || !(err.isForbidden || err.isNotFound)) throw err
      if (!current(id, e)) return
      // member.get is gated by member_read and nothing else, so a refusal
      // means the seat does not hold it (or is not live, which refuses all).
      if (err.isForbidden) refused.value = new Set([...refused.value, 'member_read'])
    }
    const presetName = guessPreset(m)
    if (!presetName) {
      setPermsSource('unknown')
      return
    }
    try {
      const out = await read('preset.list', {})
      if (!current(id, e)) return
      const p = (out.presets ?? []).find((x) => x.name === presetName && !x.dept_id)
      if (p) {
        perms.value = (p.perms ?? {}) as PermLevels
        setPermsSource('preset', presetName)
      } else {
        setPermsSource('unknown')
      }
    } catch {
      if (current(id, e)) setPermsSource('unknown')
    }
  }

  /**
   * Whether a person who decides nothing here owns an agent seated here, now
   * or before: Core lets such a caller read the approval queue (their own
   * agents' proposals alone) and refuses anyone else without action_decide,
   * so one item of it is asked for. Only a refusal says no; anything else
   * leaves it unknown.
   */
  async function probeOwnAgents(id: string, e: number) {
    if (useSessionStore().me?.kind !== 'human') return
    if (permsSource.value !== 'exact' || level('action_decide') !== 'denied') return
    try {
      await read('action.list_proposed', { course_id: id, limit: 1 })
      if (current(id, e)) ownsAgentHere.value = true
    } catch (err) {
      if (current(id, e) && err instanceof ApiError && err.isForbidden) ownsAgentHere.value = false
    }
  }

  /** Where perms came from, and the preset's name when they were guessed from one. */
  function setPermsSource(source: PermsSource, preset: string | null = null) {
    permsSource.value = source
    guessedPreset.value = source === 'preset' ? preset : null
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
    const e = epoch
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
        if (!current(id, e)) return
        members.value = map
        membersState.value = 'loaded'
      } catch (err) {
        if (!current(id, e)) return
        membersError.value = toError(err)
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
    const e = epoch
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
        if (!current(id, e)) return
        assignments.value = map
        assignmentsState.value = 'loaded'
      } catch (err) {
        if (!current(id, e)) return
        assignmentsError.value = toError(err)
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
    guessedPreset,
    loading,
    error,
    members,
    membersState,
    membersError,
    assignments,
    assignmentsState,
    assignmentsError,
    refused,
    ownsAgentHere,
    seesAllGrades,
    levelOfAll,
    canAll,
    needsApprovalAll,
    myMemberId,
    role,
    principalMemberId,
    isDelegate,
    archived,
    writable,
    level,
    can,
    needsApproval,
    open,
    close,
    reset,
    ensureMembers,
    ensureAssignments,
    invalidate,
    memberName,
    assignmentTitle,
  }
})
