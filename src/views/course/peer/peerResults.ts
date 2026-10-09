// Peer evaluation's results as those who grade read them
// (peer_review.results): who has not written an evaluation, what Core flags,
// what counting it in grades would write (grade.apply_peer), and the
// results as CSV. A member alone in their group's circle, with
// self-evaluation off, has nobody to evaluate: no evaluation of theirs is
// missing, though Core flags it so (aloneInCircle).
import type { Decimal } from '@/api/types'
import { csvText } from '@/views/course/grades/components/classMatrix'
import {
  criteriaOf,
  formCounts,
  isOwnAdjustment,
  isRating,
  num,
  type FormLike,
  type PeerGroupResult,
  type PeerMemberResult,
  type PeerResults,
} from './peer'

export function membersOf(g: Pick<PeerGroupResult, 'members'>): PeerMemberResult[] {
  return g.members ?? []
}

/**
 * Whether a group's circle is one member, with self-evaluation off: they
 * have nobody to evaluate (their task names nobody, and Core takes no sheet
 * of nobody), so no evaluation of theirs is missing, whatever Core's flag
 * says, and their factor is an even share: their score is the group's.
 */
export function aloneInCircle(g: Pick<PeerGroupResult, 'members'>, form: Pick<FormLike, 'self_evaluation'>): boolean {
  return !form.self_evaluation && membersOf(g).length === 1
}

/** A member's flags, Core's, less "missing" for one who has nobody to evaluate (alone). */
export function flagsOf(m: Pick<PeerMemberResult, 'flags'>, alone = false): string[] {
  const flags = m.flags ?? []
  return alone ? flags.filter((f) => f !== 'missing') : flags
}

/** The members of a group's circle who have written no evaluation, and had someone to evaluate. */
export function missingIn(g: PeerGroupResult, form: Pick<FormLike, 'self_evaluation'>): PeerMemberResult[] {
  if (aloneInCircle(g, form)) return []
  return membersOf(g).filter((m) => !m.submitted)
}

/** Whether a group has anything Core flags: a member's or a rater's flag, or the group's own. */
export function flaggedGroup(g: PeerGroupResult, form: Pick<FormLike, 'self_evaluation'>): boolean {
  const alone = aloneInCircle(g, form)
  return (g.flags ?? []).length > 0 || membersOf(g).some((m) => flagsOf(m, alone).length > 0)
}

/** How many raters rated a member, themselves left out. */
export function peerRaters(m: Pick<PeerMemberResult, 'rated_by' | 'member_id'>): number {
  return (m.rated_by ?? []).filter((r) => r !== m.member_id).length
}

/**
 * Whether a member rated themselves where it counts (self-evaluation on):
 * Core's factor for them then counts it as one rater's, beside their peers'.
 */
export function ratedSelf(m: Pick<PeerMemberResult, 'rated_by' | 'member_id'>): boolean {
  return (m.rated_by ?? []).includes(m.member_id)
}

/** What counting peer evaluation in grades would do to a member's grade now. */
export type ApplyOutcome =
  /** Written again with another score. */
  | 'changes'
  /** Written again, if at all, with the score it has. */
  | 'same'
  /** A grader adjusted it: their adjustment wins, and it is left as it is. */
  | 'kept'
  /** Not graded yet: counted when it is. */
  | 'ungraded'

export interface ApplyRow {
  groupId: string
  groupName: string
  memberId: string
  name: string
  /** The member's live grade's score, and whether it is posted. */
  before: Decimal | null
  posted: boolean
  /** What it would be: the group's score moved by what they received, at the form's weight. */
  after: Decimal | null
  outcome: ApplyOutcome
}

/**
 * What grade.apply_peer would write, member by member, as the results say
 * now: where the form counts, each graded member's score worked out from
 * their factor at the form's weight (Core's score for them); where it no
 * longer counts, the group's score, every peer adjustment taken away. A
 * grade a grader adjusted is left as it is.
 */
export function applyPreview(r: Pick<PeerResults, 'form' | 'groups'>): ApplyRow[] {
  const counts = formCounts(r.form)
  const rows: ApplyRow[] = []
  for (const g of r.groups ?? []) {
    for (const m of membersOf(g)) {
      const base = { groupId: g.group_id, groupName: g.name, memberId: m.member_id, name: m.display_name }
      const grade = m.grade
      if (!grade) {
        rows.push({ ...base, before: null, posted: false, after: null, outcome: 'ungraded' })
        continue
      }
      const posted = grade.state === 'posted'
      if (isOwnAdjustment(grade.adjustment_kind)) {
        rows.push({ ...base, before: grade.score, posted, after: grade.score, outcome: 'kept' })
        continue
      }
      const after = counts ? (m.score ?? g.group_score ?? null) : (g.group_score ?? null)
      const same = after === null || num(after) === num(grade.score)
      rows.push({
        ...base,
        before: grade.score,
        posted,
        after: after ?? grade.score,
        outcome: same ? 'same' : 'changes',
      })
    }
  }
  return rows
}

/** The words the CSV is written in (the page's language). */
export interface PeerCsvWords {
  group: string
  member: string
  wrote: string
  wroteAt: string
  raters: string
  /** A share form's column: the average of what each peer gave them. */
  averageShare: string
  /** A rating form's column of averages on one criterion. */
  criterion: (label: string) => string
  /** What they gave themselves, against an even share. */
  self: string
  factor: string
  /** The factor's column with self-evaluation on, where it counts what they gave themselves. */
  factorSelf: string
  /** With self-evaluation on, their factor from their peers alone. */
  peerFactor: string
  /** The score's column, at the form's weight; left out at a weight of 0, where it is the group's. */
  score: string
  groupScore: string
  grade: string
  flags: string
  yes: string
  no: string
  /** Whether they wrote one, for a member with nobody to evaluate (aloneInCircle). */
  alone: string
  flag: (flag: string) => string
  /** Words in a list, as the language writes one (formatList). */
  list: (items: string[]) => string
  /** A grade now: its score, drafted or posted, or adjusted by a grader, which counting peer evaluation leaves as it is. */
  gradeNow: (score: string, state: string, own: boolean) => string
}

/** A decimal as CSV holds it: as Core wrote it, never formatted. */
function plain(v: Decimal | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const n = num(v)
  return Number.isFinite(n) ? String(n) : csvText(String(v))
}

/** The average of what each peer gave a member on a share form, to two places; empty when nobody did. */
export function averageShare(m: Pick<PeerMemberResult, 'shares'>): number | null {
  const s = m.shares ?? []
  if (!s.length) return null
  return Math.round((s.reduce((sum, x) => sum + x.share, 0) / s.length) * 100) / 100
}

/**
 * The results as a spreadsheet opens them: a row for each member of each
 * group, whether they wrote an evaluation, how many peers rated them and
 * what they received (their average on each criterion, or the average share
 * their peers gave them), what they gave themselves against an even share,
 * their factor (with self-evaluation on, said to count what they gave
 * themselves, beside their factor from peers alone), the score it would give
 * (left out at a weight of 0, where it is the group's), their grade now and
 * Core's flags; UTF-8 with a byte-order mark and CRLF lines, as the class's
 * gradebook's CSV is, and no cell a spreadsheet would run as a formula. What
 * raters wrote in comments is read on the page, not exported.
 */
export function peerCsv(r: Pick<PeerResults, 'form' | 'groups'>, w: PeerCsvWords): string {
  const form: FormLike = r.form
  const rating = isRating(form)
  const criteria = criteriaOf(form)
  const self = !!form.self_evaluation
  const scored = Number(form.weight) > 0
  const head = [w.group, w.member, w.wrote, w.wroteAt, w.raters]
  if (rating) head.push(...criteria.map((c) => w.criterion(c.label)))
  else head.push(w.averageShare)
  if (self) head.push(w.self, w.factorSelf, w.peerFactor)
  else head.push(w.factor)
  if (scored) head.push(w.score)
  head.push(w.groupScore, w.grade, w.flags)
  const lines = [head.map(csvText).join(',')]
  for (const g of r.groups ?? []) {
    const alone = aloneInCircle(g, form)
    for (const m of membersOf(g)) {
      const cells = [
        csvText(g.name),
        csvText(m.display_name),
        csvText(m.submitted ? w.yes : alone ? w.alone : w.no),
        m.submitted_at ?? '',
        String(peerRaters(m)),
      ]
      if (rating) cells.push(...criteria.map((c) => plain(m.averages?.[c.key])))
      else cells.push(plain(averageShare(m)))
      if (self) cells.push(plain(m.self_factor), plain(m.factor), plain(m.peer_factor))
      else cells.push(plain(m.factor))
      if (scored) cells.push(plain(m.score))
      const grade = m.grade
      cells.push(
        plain(g.group_score),
        grade ? csvText(w.gradeNow(plain(grade.score), grade.state, isOwnAdjustment(grade.adjustment_kind))) : '',
        csvText(w.list(flagsOf(m, alone).map(w.flag))),
      )
      lines.push(cells.join(','))
    }
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}
