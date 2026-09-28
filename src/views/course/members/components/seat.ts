// What the members pages share: the presets, finding whom to seat, the
// measure of a seat against the caller's own (Core's "nobody hands out more
// than they hold", checked here only to warn — Core decides), and Core's
// refusals put in words.
import { computed, readonly, ref, shallowRef, watch } from 'vue'
import { ApiError, isApiError, read, type ToolIn, type ToolOut } from '@/api/http'
import {
  AUTONOMY_LEVELS,
  PERMS,
  type Actor,
  type AutonomyLevel,
  type Perm,
  type PermLevels,
  type Preset,
} from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { i18n } from '@/i18n'
import { ceilingRefusalText } from '@/utils/ceilings'
import { formatDateTime, shortId } from '@/utils/format'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})
const te = (key: string): boolean => (i18n.global as unknown as { te: (k: string) => boolean }).te(key)

/** Where a level sits on the ladder: denied 0 … autonomous 3. */
export function rank(l: string | null | undefined): number {
  const i = AUTONOMY_LEVELS.indexOf(l as AutonomyLevel)
  return i < 0 ? 0 : i
}

/** A full set of levels, one per permission, from what Core sent (anything missing is denied). */
export function fullPerms(p: Record<string, string | undefined> | null | undefined): Record<Perm, AutonomyLevel> {
  const out = {} as Record<Perm, AutonomyLevel>
  for (const k of PERMS) out[k] = (p?.[k] as AutonomyLevel | undefined) ?? 'denied'
  return out
}

/** A seat whose expiry has passed is as good as removed, whether or not the sweep has got to it. */
export function isExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() <= now
}

/**
 * A preset's name as a reader should see it: a built-in's in the reader's
 * language, a department's own as its author wrote it (the same rule as the
 * platform set-up pages' presetLabel). A preset given by name alone is taken
 * for a built-in.
 */
export function presetLabel(p: Pick<Preset, 'name'>): string {
  const key = `members.presetNames.${p.name}`
  const deptId = (p as Partial<Pick<Preset, 'dept_id'>>).dept_id
  return !deptId && te(key) ? t(key) : p.name
}

/** A built-in preset's description in the reader's language; a department's own as its author wrote it. */
export function presetDescription(p: Pick<Preset, 'name' | 'dept_id' | 'description'>): string {
  const key = `members.presetHelp.${p.name}`
  if (!p.dept_id && te(key)) return t(key)
  return p.description ?? ''
}

/** The built-in presets and the course's department's own. */
export function usePresets() {
  const course = useCourseStore()
  const presets = shallowRef<Preset[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  async function load() {
    loading.value = true
    error.value = null
    try {
      const out = await read('preset.list', { dept_id: course.course?.dept_id ?? undefined })
      presets.value = out.presets ?? []
    } catch (e) {
      error.value = e instanceof ApiError ? e : new ApiError({ status: 0, code: 'internal', message: String(e) })
    } finally {
      loading.value = false
    }
  }
  watch(
    () => course.course?.dept_id,
    () => void load(),
    { immediate: true },
  )
  const byId = computed(() => new Map(presets.value.map((p) => [p.id, p])))
  const builtIn = computed(() => presets.value.filter((p) => !p.dept_id))
  const department = computed(() => presets.value.filter((p) => !!p.dept_id))
  return { presets, byId, builtIn, department, loading, error, reload: load }
}

// ---------------------------------------------------------------------------
// Finding whom to seat
// ---------------------------------------------------------------------------
//
// Whoever seats members can ask Core whom a whole email address, or an actor
// ID they were given, names, and whether they already have a seat here
// (member.lookup_actor). It lists nobody: a piece of an address finds no one.
//
// A Core from before the tool answers its route as no route at all (404, "no
// such route"), and something in front of Core may answer 404 or 405 of its
// own. That is a fact about the Core, not about who asks, so it is noted once
// for the page's life, and the form falls back to what it did before: an ID,
// pasted in.

/** Whom an email address or an actor ID names, with their seat here if they have one. */
export type SeatCandidate = ToolOut<'member.lookup_actor'>

/**
 * Whether an error from member.lookup_actor says this Core has no such tool.
 * The tool's own answer that nobody has that email or ID is a 404 too, with
 * Core's not_found code; a missing route says so in its message.
 */
export function lacksLookup(e: unknown): boolean {
  if (!isApiError(e)) return false
  if (e.status === 405 || e.code === 'method_not_allowed') return true
  return e.status === 404 && (e.code !== 'not_found' || /no such route/i.test(e.message))
}

/** Whether an error from member.lookup_actor is its answer that nobody is registered with that email or ID. */
export function foundNobody(e: unknown): boolean {
  return isApiError(e) && e.isNotFound && !lacksLookup(e)
}

/**
 * The address to look someone up by, trimmed, when it looks like a whole one
 * (something@somewhere); null for empty text or a piece of one, which Core
 * would not match: it finds by the whole address only, in any case.
 */
export function wholeEmail(text: string | null | undefined): string | null {
  const s = (text ?? '').trim()
  return /^[^\s@]+@[^\s@]+$/.test(s) ? s : null
}

/** What the directory (actor.get, actor.list) says of an actor, as a lookup would: with no word on a seat. */
export function candidateFrom(
  a: Pick<Actor, 'id' | 'display_name' | 'kind' | 'status'> & {
    owner_actor_id?: string | null
    owner_name?: string | null
  },
): SeatCandidate {
  const out: SeatCandidate = { actor_id: a.id, display_name: a.display_name, kind: a.kind, status: a.status }
  if (a.owner_actor_id) {
    out.owner_actor_id = a.owner_actor_id
    out.owner_name = a.owner_name ?? null
  }
  return out
}

/**
 * For an agent a person owns, that person (their name, or '' when it is not
 * given): such an agent is not seated with member.add. Only its owner brings
 * it in, as their delegate. Null for anyone else.
 */
export function ownedBy(c: Pick<SeatCandidate, 'owner_actor_id' | 'owner_name'> | null | undefined): string | null {
  if (!c?.owner_actor_id) return null
  return c.owner_name ?? ''
}

const lookupKnown = ref<boolean | null>(null)

/** Whether this Core has member.lookup_actor: null until a call has said. */
export const hasLookup = readonly(lookupKnown)

/** member.lookup_actor, noting on the way whether this Core has it. */
export async function lookupActor(args: ToolIn<'member.lookup_actor'>): Promise<SeatCandidate> {
  try {
    const out = await read('member.lookup_actor', args)
    lookupKnown.value = true
    return out
  } catch (e) {
    if (lacksLookup(e)) lookupKnown.value = false
    else if (foundNobody(e)) lookupKnown.value = true
    throw e
  }
}

let probing: Promise<void> | null = null

/**
 * Asks Core whom the caller's own actor ID names, so that a form can offer
 * finding by email before anyone types. Once a call has said whether this
 * Core has the tool, it asks nothing; a failure that says nothing about the
 * tool (the network, a refusal) leaves it unknown, for the next probe or
 * lookup.
 */
export function probeLookup(courseId: string, selfId: string | null | undefined): Promise<void> {
  if (lookupKnown.value !== null || !selfId) return Promise.resolve()
  probing ??= lookupActor({ course_id: courseId, actor_id: selfId })
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => (probing = null))
  return probing
}

// ---------------------------------------------------------------------------
// A seat, measured against the caller's own
// ---------------------------------------------------------------------------

/** What a seat amounts to: levels, held over a reach, for a time. */
export interface Shape {
  perms: PermLevels
  studentScope: string
  students: string[]
  assignmentScope: string
  assignments: string[]
  expiresAt: string | null
  /** A new student's seat with an empty list will list itself. */
  listsItself?: boolean
}

function opens(fromKind: string, from: string[], toKind: string, to: string[]): boolean {
  if (fromKind === 'all') return false
  if (toKind === 'all') return true
  const had = new Set(from)
  return to.some((id) => !had.has(id))
}

/** Whether after reaches anything before did not: a grant, measured like one. Anything else is a narrowing. */
export function widens(before: Shape, after: Shape): boolean {
  for (const p of PERMS) if (rank(after.perms[p]) > rank(before.perms[p])) return true
  if (opens(before.studentScope, before.students, after.studentScope, after.students)) return true
  if (opens(before.assignmentScope, before.assignments, after.assignmentScope, after.assignments)) return true
  if (before.expiresAt) {
    if (!after.expiresAt) return true
    if (new Date(after.expiresAt).getTime() > new Date(before.expiresAt).getTime()) return true
  }
  return false
}

/**
 * The permissions a seat would hold above the caller's own, each with a short
 * note for its row in a PermEditor; empty when the caller's seat is not known
 * exactly. Only a warning: Core is the one that decides.
 */
export function permsAbove(perms: PermLevels): Partial<Record<Perm, string>> {
  const course = useCourseStore()
  const mine = course.seat
  if (course.permsSource !== 'exact' || !mine) return {}
  const held = fullPerms(mine.perms)
  const out: Partial<Record<Perm, string>> = {}
  for (const p of PERMS) {
    if (rank(perms[p]) > rank(held[p])) out[p] = t('members.grant.rowAbove', { held: t(`enums.level.${held[p]}`) })
  }
  return out
}

/**
 * Why Core would refuse to hand out this seat, as sentences, when the
 * caller's own seat is known exactly; empty when it looks fine or cannot be
 * told. Only a warning: Core is the one that decides.
 */
export function grantProblems(after: Shape): string[] {
  const course = useCourseStore()
  const mine = course.seat
  if (course.permsSource !== 'exact' || !mine) return []
  const out: string[] = []
  const held = fullPerms(mine.perms)
  for (const p of PERMS) {
    const want = (after.perms[p] ?? 'denied') as AutonomyLevel
    if (rank(want) > rank(held[p])) {
      out.push(
        t('members.grant.permAbove', {
          perm: t(`enums.perm.${p}`),
          held: t(`enums.level.${held[p]}`),
          wanted: t(`enums.level.${want}`),
        }),
      )
    }
  }
  if (mine.student_scope === 'listed') {
    const myList = new Set(mine.listed_students ?? [])
    if (after.studentScope !== 'listed') out.push(t('members.grant.studentsAll'))
    else if (after.listsItself) out.push(t('members.grant.newStudent'))
    else if (after.students.some((s) => !myList.has(s))) out.push(t('members.grant.studentsOutside'))
  }
  if (mine.assignment_scope === 'listed') {
    const myList = new Set(mine.listed_assignments ?? [])
    if (after.assignmentScope !== 'listed') out.push(t('members.grant.assignmentsAll'))
    else if (after.assignments.some((a) => !myList.has(a))) out.push(t('members.grant.assignmentsOutside'))
  }
  if (mine.expires_at) {
    const mineEnds = new Date(mine.expires_at).getTime()
    if (!after.expiresAt || new Date(after.expiresAt).getTime() > mineEnds) {
      out.push(t('members.grant.outlives', { t: formatDateTime(mine.expires_at) }))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Core's refusals, explained
// ---------------------------------------------------------------------------

function levelName(l: string): string {
  return te(`enums.level.${l}`) ? t(`enums.level.${l}`) : l
}
function permName(p: string): string {
  return te(`enums.perm.${p}`) ? t(`enums.perm.${p}`) : p
}

const EXPLAIN: [RegExp, (m: RegExpMatchArray) => string][] = [
  [
    /you hold (\w+) at (\w+) and cannot grant it at (\w+)/,
    (m) => t('members.refusal.permAbove', { perm: permName(m[1]!), held: levelName(m[2]!), wanted: levelName(m[3]!) }),
  ],
  [/student scope is a list; you cannot grant the whole class/, () => t('members.refusal.studentsAll')],
  [/new student's seat reaches that student/, () => t('members.refusal.newStudent')],
  [/reaches students who are in your own scope/, () => t('members.refusal.studentsOutside')],
  [/assignment scope is a list; you cannot grant every assignment/, () => t('members.refusal.assignmentsAll')],
  [/list assignments that are in your own scope/, () => t('members.refusal.assignmentsOutside')],
  [
    /your own membership ends at (\S+); you cannot give one that lasts longer/,
    (m) => t('members.refusal.outlives', { t: formatDateTime(m[1]!) }),
  ],
  [/not on your own membership/, () => t('members.refusal.ownSeat')],
  [/not on the membership you are a delegate of/, () => t('members.refusal.ownPrincipal')],
  [/the agent belongs to someone: its owner brings it in/, () => t('members.refusal.ownedAgent')],
  [
    /the delegate's principal holds (\w+) at (\w+), so the delegate cannot hold it at (\w+)/,
    (m) =>
      t('members.refusal.principalCap', { perm: permName(m[1]!), held: levelName(m[2]!), wanted: levelName(m[3]!) }),
  ],
  [/a delegate reaches no further than its principal/, () => t('members.refusal.principalScope')],
  [
    /a delegate lasts no longer than its principal, whose membership ends at (\S+)/,
    (m) => t('members.refusal.principalExpiry', { t: formatDateTime(m[1]!) }),
  ],
  [/a delegate never holds (\w+)/, (m) => t('members.refusal.delegateNever', { perm: permName(m[1]!) })],
  [/already has a seat in this course/, () => t('members.refusal.alreadySeated')],
  [/no such actor/, () => t('members.refusal.noActor')],
  [/the actor is suspended/, () => t('members.refusal.suspended')],
  [/system actor is not seated/, () => t('members.refusal.systemActor')],
  [/listed_students must all be current students/, () => t('members.refusal.notStudents')],
  [/listed_assignments must all be assignments/, () => t('members.refusal.notAssignments')],
  [/expires_at is in the past/, () => t('members.refusal.pastExpiry')],
  [/member has (already )?been removed/, () => t('members.refusal.removed')],
  [/no such preset/, () => t('members.refusal.noPreset')],
  [/preset belongs to another department/, () => t('members.refusal.otherDept')],
  [/the member is (\w+), not (\w+)/, () => t('members.refusal.wrongStatus')],
  [/perms is empty/, () => t('members.refusal.nothing')],
]

/** Core's refusal of a change to a seat, in the reader's words; null when there is nothing to add to Core's own. */
export function explainRefusal(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null
  // Above what the seat may hold at all: which permission, how far, and why.
  // A change to many seats at once names the one it stopped at.
  const ceiling = ceilingRefusalText(e.details)
  if (ceiling) {
    const id = typeof e.details?.member_id === 'string' ? e.details.member_id : null
    if (!id) return ceiling
    return t('members.refusal.onSeat', { text: ceiling, name: useCourseStore().memberName(id) ?? shortId(id) })
  }
  if (e.actionStatus === 'denied') {
    const reason = e.details?.reason
    if (reason === 'permission_denied') return t('members.refusal.noManage')
    if (reason === 'membership_not_active') return t('members.refusal.callerNotLive')
    if (reason === 'course_archived') return t('common.archivedCourse')
    return null
  }
  for (const [re, say] of EXPLAIN) {
    const m = e.message.match(re)
    if (m) return say(m)
  }
  return null
}
