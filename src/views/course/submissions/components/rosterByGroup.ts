// Where each group stands on a group assignment (submission.roster's
// groups, on its first page): each group of the set that is not archived and
// has a member the caller's scope reaches, its members now, and its latest
// work's state, handed in when and by whom. Its students (the roster's rows)
// say each one's group now and the state of the work they are part of, or
// no_group for a student in no group of the set, who hands nothing in and is
// not recorded as missing. A group that has not started, with someone in
// it, can be recorded as having handed in nothing (submission.record_missing
// with group_id), for its members now, by someone whose seat reaches every
// one of them: a seat listed to some students is shown only those of each
// group's members, and the group's size, from its set, says whether that is
// all of them.
import type { RosterGroup } from '@/views/course/assignments/components/groupWork'
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

/**
 * Whether to offer recording a group as missing: one with no work at all
 * (not even a draft) and someone in it, every one of whom the caller's seat
 * reaches, for a published assignment, by someone who may enter grades, in a
 * course that can still change.
 */
export function mayMarkGroupMissing(
  g: Pick<RosterGroup, 'group_id' | 'state' | 'members'>,
  ctx: MarkContext & { reach?: GroupReach },
): boolean {
  return (
    g.state === 'not_started' &&
    (g.members ?? []).length > 0 &&
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

/** The group whose work a student's row is about, where it is not the group they are in now. */
export function workGroupIfOther(
  row: Pick<RosterEntry, 'submission_id' | 'group_id'>,
  groups: readonly Pick<RosterGroup, 'group_id' | 'submission_id' | 'name'>[],
): Pick<RosterGroup, 'group_id' | 'submission_id' | 'name'> | null {
  if (!row.submission_id) return null
  const g = groups.find((x) => x.submission_id === row.submission_id)
  return g && g.group_id !== row.group_id ? g : null
}
