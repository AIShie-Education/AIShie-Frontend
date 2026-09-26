// Where every student stands on one assignment (submission.roster): each
// current student the caller's scope reaches, with their latest attempt's
// state, including those who have not started, whom submission.list cannot
// show because they have no submission at all. Someone who has not started
// can be recorded as having handed in nothing (submission.record_missing),
// so that it can be graded.
//
// A Core from before the roster answers its route as no route at all (404,
// "no such route"), and something in front of Core may answer 404 or 405 of
// its own. The page then falls back to the list of submissions that exist.
import { reactive } from 'vue'
import { isApiError } from '@/api/http'
import type { ListItem } from '@/api/types'
import { shortId } from '@/utils/format'

/**
 * One student's row. Core sends their name and seat status only to a caller
 * who may read the member list (member_read); a tutor or grader without it
 * gets the member id alone, as submission.list gives. The catalogue this
 * client's types come from is older and has both as always there, so they are
 * made optional here, and every use has to do without them.
 */
export type RosterEntry = Omit<ListItem<'submission.roster', 'students'>, 'display_name' | 'member_status'> & {
  display_name?: string | null
  member_status?: string | null
}

/** The states a roster row can be in: a submission's, or none at all yet. */
export type RosterState = 'not_started' | 'draft' | 'submitted' | 'late' | 'missing'
export const ROSTER_STATES: readonly RosterState[] = ['not_started', 'draft', 'submitted', 'late', 'missing']

/**
 * Whether an error from submission.roster says this Core has no such tool.
 * The tool's own answer that there is no such assignment is a 404 too, with
 * Core's not_found code; a missing route says so in its message.
 */
export function lacksRoster(e: unknown): boolean {
  if (!isApiError(e)) return false
  if (e.status === 405 || e.code === 'method_not_allowed') return true
  return e.status === 404 && (e.code !== 'not_found' || /no such route/i.test(e.message))
}

export interface StateCount {
  state: string
  count: number
}

/**
 * How many students are in each state, in the order work moves through them,
 * leaving out states nobody is in. A state this client does not know yet is
 * counted after the known ones rather than dropped.
 */
export function countByState(rows: readonly Pick<RosterEntry, 'state'>[]): { total: number; counts: StateCount[] } {
  const by = new Map<string, number>()
  for (const r of rows) by.set(r.state, (by.get(r.state) ?? 0) + 1)
  const known = ROSTER_STATES.filter((s) => by.has(s)).map((state) => ({ state, count: by.get(state)! }))
  const other = [...by.entries()]
    .filter(([s]) => !(ROSTER_STATES as readonly string[]).includes(s))
    .map(([state, count]) => ({ state, count }))
  return { total: rows.length, counts: [...known, ...other] }
}

/** The rows for one student, when the page is filtered to them; all of them otherwise. */
export function forStudent<T extends Pick<RosterEntry, 'student_member_id'>>(
  rows: readonly T[],
  studentId: string | null | undefined,
): T[] {
  return studentId ? rows.filter((r) => r.student_member_id === studentId) : [...rows]
}

/**
 * Whether more pages must be read to find the one student the page is
 * filtered to: the roster pages by student, not by name, so they may be on a
 * page not loaded yet.
 */
export function needsMoreFor(
  rows: readonly Pick<RosterEntry, 'student_member_id'>[],
  studentId: string | null | undefined,
  hasMore: boolean,
): boolean {
  return !!studentId && hasMore && !rows.some((r) => r.student_member_id === studentId)
}

export interface MarkContext {
  /** course.can('grade_submit'): unknown counts as yes; Core decides. */
  canGrade: boolean
  /** course.writable: false in an archived course. */
  writable: boolean
  /** Whether the assignment is published; null when that is not known (Core decides). */
  published: boolean | null
  /** Whether marking this student has already been proposed from this page, and waits for approval. */
  proposed?: boolean
}

/**
 * Whether to offer marking a student as missing: only someone with no
 * submission at all (not even a draft), for a published assignment, by
 * someone who may enter grades, in a course that can still change.
 */
export function mayMarkMissing(row: Pick<RosterEntry, 'state'>, ctx: MarkContext): boolean {
  return row.state === 'not_started' && ctx.canGrade && ctx.writable && ctx.published !== false && !ctx.proposed
}

/**
 * A student's name for a row: Core's, else what the page knows of the member
 * (the caller's own seat, the member list), else the end of their id.
 */
export function rosterName(
  row: Pick<RosterEntry, 'student_member_id' | 'display_name'>,
  known: (memberId: string) => string | null | undefined,
): string {
  return row.display_name || known(row.student_member_id) || shortId(row.student_member_id)
}

/** Whether to tag a row with its seat status: a paused student, not an active one, nor one Core did not say. */
export function showsSeatStatus(row: Pick<RosterEntry, 'member_status'>): boolean {
  return !!row.member_status && row.member_status !== 'active'
}

/** A key for a proposal made from this page: one student, on one assignment, in one course. */
export function proposalKey(courseId: string, assignmentId: string, studentId: string): string {
  return `${courseId}:${assignmentId}:${studentId}`
}

// Marking someone missing that became a proposal leaves them "not started"
// until someone approves it. Remembered here rather than in the table, so
// that choosing another assignment and coming back (which mounts the table
// afresh) does not offer the same thing again while the first waits. It is
// the caller's: signing out loads the page afresh, which empties it.
const proposals = reactive(new Set<string>())

/** Notes that marking this student missing has been proposed from this page. */
export function rememberProposal(key: string): void {
  proposals.add(key)
}

/** Whether marking this student missing has been proposed from this page, in this tab. */
export function wasProposed(key: string): boolean {
  return proposals.has(key)
}
