// Where each group stands on a group assignment (submission.roster's
// groups, on its first page): each group of the set that is not archived and
// has a member the caller's scope reaches, its members now, and its latest
// work's state, handed in when and by whom. Its students (the roster's rows)
// say each one's group now and the state of the work they are part of, or
// no_group for a student in no group of the set, who hands nothing in and is
// not recorded as missing. A group that has not started, with someone in
// it, can be recorded as having handed in nothing (submission.record_missing
// with group_id), for its members now less those another group's work names
// already (as Core records it), by someone whose seat reaches every one of
// them: a seat listed to some students is shown only those of each group's
// members, and the group's size, from its set, says whether that is all of
// them. A group whose members are all part of other work has nobody to
// record it for.
import type { RosterGroup, WorkMember } from '@/views/course/assignments/components/groupWork'
import { countByState, type MarkContext, type RosterEntry, type StateCount } from './roster'

export type { RosterGroup }

/** The roster's state for a student in no group of the assignment's set. */
export const NO_GROUP = 'no_group'

/** The groups whose members include the student the page is filtered to; all of them otherwise. */
export function groupsFor(groups: readonly RosterGroup[], studentId: string | null | undefined): RosterGroup[] {
  if (!studentId) return [...groups]
  return groups.filter((g) => (g.members ?? []).some((m) => m.member_id === studentId))
}

/**
 * What the roster by group shows: the groups (of the student the page is
 * filtered to, or all) and of those the ones in the chosen state, with the
 * counts by state that filter them (none where one student is chosen:
 * there is nothing left to filter); and the students in no group.
 */
export function groupRosterView(
  groups: readonly RosterGroup[],
  rows: readonly RosterEntry[],
  studentId: string | null | undefined,
  state: string,
): {
  summary: { total: number; counts: StateCount[] } | null
  visible: RosterGroup[]
  noGroup: RosterEntry[]
} {
  const shown = groupsFor(groups, studentId)
  const noGroup = rows.filter((r) => r.state === NO_GROUP && (!studentId || r.student_member_id === studentId))
  if (studentId) return { summary: null, visible: shown, noGroup }
  return {
    summary: countByState(shown),
    visible: state ? shown.filter((g) => g.state === state) : shown,
    noGroup,
  }
}

/**
 * How far the caller's seat reaches into the groups: the roster names only
 * the members their student scope reaches. Null where it reaches every
 * student (and, a delegate's, so does its principal's), so that the members
 * named are all of them; else each group's size now, as its set gives it
 * (an empty map while that is not known).
 */
export type GroupReach = ReadonlyMap<string, number> | null

/**
 * How many of a group's members now the roster does not name, the caller's
 * seat not reaching them; 0 where it names them all, or that is not known.
 */
export function unreachedMembers(g: Pick<RosterGroup, 'group_id' | 'members'>, reach: GroupReach): number {
  const size = reach?.get(g.group_id)
  return size === undefined ? 0 : Math.max(0, size - (g.members ?? []).length)
}

/**
 * Whether the caller's seat reaches every member of the group now: Core
 * records a group missing only for someone who reaches each one it is
 * recorded for (scope over all its members, as grading it is).
 */
export function reachesWholeGroup(g: Pick<RosterGroup, 'group_id' | 'members'>, reach: GroupReach): boolean {
  if (reach === null) return true
  const size = reach.get(g.group_id)
  return size !== undefined && size === (g.members ?? []).length
}

/** The states of work handed in, or recorded missing: work that names whose it is. */
const NAMING = new Set(['submitted', 'late', 'missing'])

/**
 * Of a group with no work, its members (as the roster names them) whom
 * another group's work for the assignment names already, handed in or
 * recorded missing: their rows name that work, the group having none of its
 * own. Recording the group missing leaves them out, as Core does (a student
 * is part of one group's work for an assignment). None where the group has
 * work, or a member's row is not read yet.
 */
export function inOtherWork(
  g: Pick<RosterGroup, 'state' | 'members'>,
  rows: readonly Pick<RosterEntry, 'student_member_id' | 'submission_id' | 'state'>[],
): WorkMember[] {
  if (g.state !== 'not_started') return []
  const named = new Set(rows.filter((r) => !!r.submission_id && NAMING.has(r.state)).map((r) => r.student_member_id))
  return (g.members ?? []).filter((m) => named.has(m.member_id))
}

/** Whom recording a group missing is for: its members now, less those another group's work names (inOtherWork). */
export function missingFor(
  g: Pick<RosterGroup, 'state' | 'members'>,
  rows: readonly Pick<RosterEntry, 'student_member_id' | 'submission_id' | 'state'>[],
): WorkMember[] {
  const out = new Set(inOtherWork(g, rows).map((m) => m.member_id))
  return (g.members ?? []).filter((m) => !out.has(m.member_id))
}

/**
 * Whether to offer recording a group as missing: one with no work at all
 * (not even a draft) and someone in it it would be recorded for (with the
 * roster's rows, someone another group's work does not name already), every
 * one of whom the caller's seat reaches, for a published assignment, by
 * someone who may enter grades, in a course that can still change.
 */
export function mayMarkGroupMissing(
  g: Pick<RosterGroup, 'group_id' | 'state' | 'members'>,
  ctx: MarkContext & {
    reach?: GroupReach
    rows?: readonly Pick<RosterEntry, 'student_member_id' | 'submission_id' | 'state'>[]
  },
): boolean {
  return (
    g.state === 'not_started' &&
    (ctx.rows ? missingFor(g, ctx.rows) : (g.members ?? [])).length > 0 &&
    reachesWholeGroup(g, ctx.reach ?? null) &&
    ctx.canGrade &&
    ctx.writable &&
    ctx.published !== false &&
    !ctx.proposed
  )
}

/** A key for recording a group missing from this page: one group, on one assignment, in one course. */
export function groupProposalKey(courseId: string, assignmentId: string, groupId: string): string {
  return `${courseId}:${assignmentId}:group:${groupId}`
}

/** Groups by name, their numbers in order (Group 2 before Group 10). */
export function byGroupName(a: Pick<RosterGroup, 'name'>, b: Pick<RosterGroup, 'name'>): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true })
}

/**
 * Whose a group's latest work is, where it was handed in or recorded missing
 * for others than its members now (one has moved to another group since,
 * say): the students the roster says are part of it, their rows naming that
 * submission. Null where they are its members now, or the roster does not
 * say (its pages are not all read).
 */
export function workMembersIfOthers(
  g: Pick<RosterGroup, 'submission_id' | 'state' | 'members'>,
  rows: readonly RosterEntry[],
): { member_id: string; display_name?: string | null }[] | null {
  if (!g.submission_id || g.state === 'draft' || g.state === 'not_started') return null
  const of = rows.filter((r) => r.submission_id === g.submission_id && r.state !== NO_GROUP)
  if (!of.length) return null
  const now = new Set((g.members ?? []).map((m) => m.member_id))
  const same = of.length === now.size && of.every((r) => now.has(r.student_member_id))
  return same ? null : of.map((r) => ({ member_id: r.student_member_id, display_name: r.display_name }))
}

/** A group a student's row may name as the one whose work it is. */
export type WorkGroup = Pick<RosterGroup, 'group_id' | 'name'>

/**
 * The group whose work a student's row is about, where it is not the group
 * they are in now: the listed group whose latest work it is. 'unknown' where
 * no listed group's latest is that work, and their own group's is not
 * either: the work's group has another attempt since (or is not listed to
 * the reader), or it is an earlier attempt of their own group's (moved out
 * and back), which only the work itself says (submission.get). Null where
 * it is their own group's latest, or they have none.
 */
export function workGroupIfOther(
  row: Pick<RosterEntry, 'submission_id' | 'group_id'>,
  groups: readonly Pick<RosterGroup, 'group_id' | 'submission_id' | 'name'>[],
): WorkGroup | 'unknown' | null {
  if (!row.submission_id) return null
  const g = groups.find((x) => x.submission_id === row.submission_id)
  if (g) return g.group_id !== row.group_id ? g : null
  return 'unknown'
}

/**
 * The group a work whose group the roster does not say (workGroupIfOther's
 * 'unknown') is of, from the work itself, where it is not the row's group
 * now; null where it is.
 */
export function workGroupFrom(
  row: Pick<RosterEntry, 'group_id'>,
  work: { group_id?: string | null; group_name?: string | null },
): WorkGroup | null {
  if (!work.group_id || work.group_id === row.group_id) return null
  return { group_id: work.group_id, name: work.group_name ?? '' }
}
