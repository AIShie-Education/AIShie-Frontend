// Grading a group's work: one group grade every member of the work is given,
// each member's own score moved from it by an adjustment where the grader
// gave one (a score of their own, or plus or minus the group's, with a
// reason), or by peer evaluation where its form counts. Pure functions, so
// that what a form will write is worked out (and tested) apart from the form.
//
// What the member table shows is what is written: every member's adjustment
// is sent, those shown with none as `none`, so that nothing Core would carry
// from an earlier grade is written unseen. Where a member's grade is not
// shown (the work's grades cannot be read, or the caller's seat may not reach
// them), their line is kept as their grade has it (`keep`), which is not
// sent, so that Core carries it: only a line the grader sets is written.
import type { Decimal, GradeSummary, Submission } from '@/api/types'
import { isDecimal } from '@/utils/format'
import { decimalAbove, isNonNegativeDecimal, sumDecimals } from './decimal'

/** A member's adjustment as Core gives it with their grade (grade.get, grade.list, and what writes return). */
export type Adjustment = NonNullable<NonNullable<GradeSummary['group']>['adjustment']>

/** What a grader may set: the group's score, a score of their own, or plus or minus. */
export type AdjustKind = 'none' | 'replace' | 'delta'
export const ADJUST_KINDS: readonly AdjustKind[] = ['none', 'replace', 'delta']

/**
 * A member's line: what a grader may set, or kept as their grade has it now
 * where the work's grades cannot be read (and so cannot be shown): Core
 * carries it from their earlier grade, if they have one.
 */
export type LineKind = AdjustKind | 'keep'

/** Core takes a reason of 1 to 500 characters. */
export const REASON_MAX = 500

/** One member's line of the table, as typed. */
export interface AdjustRow {
  memberId: string
  kind: LineKind
  /** replace: their score; delta: what is added to the group's, below zero to take away. */
  points: string
  reason: string
  /**
   * Peer evaluation's adjustment on their grade now, which no grader set:
   * shown, never sent. It is worked out again as the grade is written.
   */
  peer: Adjustment | null
  /**
   * Their grade is not shown to the caller: the work's grades cannot be read,
   * or the caller's seat may not reach them. The line starts kept as their
   * grade has it (`keep`), and may be put back so.
   */
  unseen?: boolean
}

/** A grader's own adjustment (replace or delta), as against none or peer evaluation's. */
export function isGraderAdjustment(a: Adjustment | null | undefined): boolean {
  return !!a && (a.kind === 'replace' || a.kind === 'delta')
}

/** A member's line as their grade has it now: a grader's adjustment carried, anything else as none. */
export function rowFrom(memberId: string, adjustment: Adjustment | null | undefined): AdjustRow {
  if (adjustment && isGraderAdjustment(adjustment)) {
    return {
      memberId,
      kind: adjustment.kind as AdjustKind,
      points: String(adjustment.points),
      reason: adjustment.reason ?? '',
      peer: null,
    }
  }
  return { memberId, kind: 'none', points: '', reason: '', peer: adjustment?.kind === 'peer' ? adjustment : null }
}

/**
 * Each member's live grade on a piece of work: a draft where they have one
 * (a group's drafts all come before anything is posted), else their posted
 * grade. Superseded grades are history.
 */
export function liveByMember(grades: readonly GradeSummary[], submissionId: string): Map<string, GradeSummary> {
  const out = new Map<string, GradeSummary>()
  for (const g of grades) {
    if (g.submission_id !== submissionId || g.state === 'superseded' || g.superseded_by) continue
    const was = out.get(g.student_member_id)
    const newer = !!was && g.state === was.state && Date.parse(g.created_at) > Date.parse(was.created_at)
    if (!was || (g.state === 'draft' && was.state !== 'draft') || newer) out.set(g.student_member_id, g)
  }
  return out
}

/**
 * The lines for every member of the work, each as their live grade has it
 * now; or, where their grade is not known, kept as it is, unseen: every one
 * where the work's grades are not known (they cannot be read, or could not
 * be), and a member with no grade shown whom the caller's seat is not known
 * to reach (`reached` not true), since Core gives a seat the grades only of
 * the students it reaches, and a grade it was not given would read as none.
 */
export function rowsFor(
  memberIds: readonly string[],
  live: ReadonlyMap<string, GradeSummary> | null,
  reached: (id: string) => boolean | null,
): AdjustRow[] {
  const kept = (memberId: string): AdjustRow => ({
    memberId,
    kind: 'keep',
    points: '',
    reason: '',
    peer: null,
    unseen: true,
  })
  if (!live) return memberIds.map(kept)
  return memberIds.map((id) => {
    const g = live.get(id)
    return !g && reached(id) !== true ? kept(id) : rowFrom(id, g?.group?.adjustment)
  })
}

/** The members a group's submission is the work of, by id, in the order Core lists them. */
export function workMemberIds(s: Pick<Submission, 'members'>): string[] {
  return (s.members ?? []).map((m) => m.member_id)
}

/**
 * A member's score from the group's score G as the line says: G, their own
 * score, or G plus or minus. Null while what it needs is not a number yet.
 */
export function memberScore(groupScore: string, row: Pick<AdjustRow, 'kind' | 'points'>): string | null {
  const g = groupScore.trim()
  const p = row.points.trim()
  // Kept as their grade has it, unseen: what it comes to is not known.
  if (row.kind === 'keep') return null
  if (row.kind === 'replace') return isDecimal(p) ? (sumDecimals([p]) ?? p) : null
  if (!isDecimal(g)) return null
  if (row.kind === 'delta') return isDecimal(p) ? sumDecimals([g, p]) : null
  return sumDecimals([g])
}

export type RowProblem = 'points' | 'negative' | 'reason' | 'reasonLong' | 'belowZero' | 'abovePoints' | null

/**
 * What is wrong with a line, if anything: points that are not a number (or a
 * score of their own below zero), a reason missing or too long, or a score
 * that comes out below zero or above the points possible (unless extra is
 * allowed). A line of none is always right.
 */
export function rowProblem(
  row: AdjustRow,
  groupScore: string,
  pointsPossible: Decimal | null | undefined,
  allowExtra: boolean,
): RowProblem {
  if (row.kind === 'none' || row.kind === 'keep') return null
  const p = row.points.trim()
  if (!isDecimal(p)) return 'points'
  if (row.kind === 'replace' && !isNonNegativeDecimal(p)) return 'negative'
  const reason = row.reason.trim()
  if (!reason) return 'reason'
  if ([...reason].length > REASON_MAX) return 'reasonLong'
  const score = memberScore(groupScore, row)
  if (score === null) return null
  if (score.startsWith('-')) return 'belowZero'
  if (!allowExtra && decimalAbove(score, pointsPossible ?? null)) return 'abovePoints'
  return null
}

/** Whether any line would give a score above the points possible: the form then offers extra. */
export function anyAbove(rows: readonly AdjustRow[], groupScore: string, pointsPossible: Decimal | null | undefined) {
  return rows.some((r) => {
    const s = memberScore(groupScore, r)
    return s !== null && decimalAbove(s, pointsPossible ?? null)
  })
}

export interface AdjustmentArg {
  student_member_id: string
  kind: AdjustKind
  points?: string
  reason?: string
}

/**
 * Every member's adjustment as it will be written: none where the line has
 * none. A line kept as it is is left out, for Core to carry; with none
 * written at all, there is nothing to send (undefined).
 */
export function adjustmentsArg(rows: readonly AdjustRow[]): AdjustmentArg[] | undefined {
  const out: AdjustmentArg[] = []
  for (const r of rows) {
    if (r.kind === 'keep') continue
    out.push(
      r.kind === 'none'
        ? { student_member_id: r.memberId, kind: 'none' }
        : { student_member_id: r.memberId, kind: r.kind, points: r.points.trim(), reason: r.reason.trim() },
    )
  }
  const allKept = rows.length > 0 && !out.length
  return allKept ? undefined : out
}

/** Whether two sets of lines would write the same: to tell a form changed from one as it was read. */
export function sameRows(a: readonly AdjustRow[], b: readonly AdjustRow[]): boolean {
  return JSON.stringify(adjustmentsArg(a)) === JSON.stringify(adjustmentsArg(b))
}

/** A decimal's size without its sign, as written: "-10" → "10". */
export function magnitude(v: Decimal): string {
  return String(v).trim().replace(/^[-+]/, '')
}

/** Whether a decimal is below zero. */
export function isNegative(v: Decimal | null | undefined): boolean {
  if (v === null || v === undefined) return false
  const s = String(v).trim()
  return s.startsWith('-') && Number(s) !== 0
}

// ---------------------------------------------------------------------------
// Whose work it is, against the group now
// ---------------------------------------------------------------------------

/** A stay in a group of the set, as group_set.get's history gives it. */
export interface Stay {
  member_id: string
  group_id: string
  joined_at: string
  left_at?: string | null
  left_how?: string | null
}

// ---------------------------------------------------------------------------
// Whom the caller's seat reaches
// ---------------------------------------------------------------------------

/**
 * Whether the caller's seat reaches every member of a work: all of them;
 * some only (it is known not to reach one); or not known (where its list of
 * students cannot be read, say). Core shows a seat a group's work if it
 * reaches any member, but grades it (grade.*), corrects its members and its
 * lateness only for a seat that reaches every one; and it gives such a seat
 * the grades, the group's members and their history only of those it
 * reaches.
 */
export type WorkReach = 'all' | 'some' | 'unknown'

export function workReach(memberIds: readonly string[], reaches: (id: string) => boolean | null): WorkReach {
  let all = true
  for (const id of memberIds) {
    const r = reaches(id)
    if (r === false) return 'some'
    if (r !== true) all = false
  }
  return all ? 'all' : 'unknown'
}

/**
 * Where a person stands against the work, for those who grade it:
 * - work: part of it, in the group still;
 * - left: part of it, out of the group since (moved, or left);
 * - outside: part of it, never in the group (added to the work by a
 *   correction, a student never placed, say);
 * - joinedSince: in the group now, joined after the work was handed in or
 *   recorded missing, and so not part of it;
 * - notPart: in the group now, joined before, but not part of it (part of
 *   another group's work for the assignment, or taken off it);
 * - unreached: part of it, a student the caller's seat does not reach, whom
 *   Core shows nothing more of: whether they are in the group now is not
 *   known.
 */
export type MemberStanding = 'work' | 'left' | 'outside' | 'joinedSince' | 'notPart' | 'unreached'

export interface MemberLine {
  memberId: string
  standing: MemberStanding
  /** When they left the group (left), or joined it (joinedSince, notPart), where the history says. */
  at: string | null
}

/**
 * The work's members, each marked against the group's members now, and
 * after them those in the group now who are not part of the work. Without
 * the group's members (they cannot be read), the work's members alone,
 * unmarked. A member the caller's seat does not reach is marked so, never
 * as out of the group (Core leaves them out of the group's members and its
 * history); one it may not reach (not known) is left unmarked, unless the
 * group's members name them.
 */
export function memberLines(input: {
  workMembers: readonly string[]
  groupId: string | null | undefined
  /** When the work was handed in (or recorded missing: when it was made). */
  frozenAt: string | null | undefined
  /** The group's members now, by id; null where they cannot be read. */
  groupNow: readonly { member_id: string; joined_at?: string | null }[] | null
  history?: readonly Stay[] | null
  /** Whether the caller's seat reaches a student; not given, it reaches every one. */
  reaches?: (id: string) => boolean | null
}): MemberLine[] {
  const now = input.groupNow ? new Map(input.groupNow.map((m) => [m.member_id, m])) : null
  const stays = (input.history ?? []).filter((h) => h.group_id === input.groupId)
  const lastLeft = (id: string) =>
    stays
      .filter((h) => h.member_id === id && h.left_at)
      .map((h) => h.left_at!)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1) ?? null
  const work = new Set(input.workMembers)
  const everIn = (id: string) => stays.some((h) => h.member_id === id)
  const out: MemberLine[] = input.workMembers.map((id) => {
    if (!now || now.has(id)) return { memberId: id, standing: 'work', at: null }
    const reached = input.reaches ? input.reaches(id) : true
    if (reached === false) return { memberId: id, standing: 'unreached', at: null }
    if (reached !== true) return { memberId: id, standing: 'work', at: null }
    // Without the history, one not in the group now is taken to have left it.
    if (input.history && !everIn(id)) return { memberId: id, standing: 'outside', at: null }
    return { memberId: id, standing: 'left', at: lastLeft(id) }
  })
  if (!now) return out
  for (const m of now.values()) {
    if (work.has(m.member_id)) continue
    const joined = m.joined_at ?? null
    const since = !!joined && !!input.frozenAt && Date.parse(joined) > Date.parse(input.frozenAt)
    out.push({ memberId: m.member_id, standing: since ? 'joinedSince' : 'notPart', at: joined })
  }
  return out
}
