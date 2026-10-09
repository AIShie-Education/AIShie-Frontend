// A student's own peer evaluation as they fill it in (PeerTaskPanel): one
// entry for each member they evaluate (every other member of their group's
// circle, and themselves with self-evaluation on), each a rating of every
// criterion or a share of 100 points, the shares adding up to exactly 100;
// what keeps it from being sent; and what peer_review.submit is sent.
import { criteriaOf, isRating, type FormLike, type PeerSheet, type PeerTask } from './peer'

export const SHARE_TOTAL = 100
export const MAX_SHEET_COMMENT = 2000
export const MAX_ENTRY_COMMENT = 1000

export interface EntryDraft {
  memberId: string
  /** A share form's points, as typed. */
  share: string
  /** A rating form's rating of each criterion, by its key. */
  ratings: Record<string, number | undefined>
  comment: string
}

export interface SheetDraft {
  entries: EntryDraft[]
  comment: string
}

/**
 * Whom the sheet covers, in the circle's order (by name), the student
 * themselves last where they evaluate themselves too.
 */
export function evaluatedIn(task: Pick<PeerTask, 'circle' | 'to_evaluate'>, me: string | null | undefined): string[] {
  const want = new Set(task.to_evaluate ?? [])
  const ordered = (task.circle ?? []).map((c) => c.member_id).filter((id) => want.has(id))
  // Anyone Core names that the circle's list does not (it never should), after.
  for (const id of task.to_evaluate ?? []) if (!ordered.includes(id)) ordered.push(id)
  return [...ordered.filter((id) => id !== me), ...ordered.filter((id) => id === me)]
}

/** The sheet to fill in: the student's current one where they have written it, or an empty one. */
export function sheetFrom(form: FormLike, task: PeerTask, me: string | null | undefined): SheetDraft {
  const sheet = task.sheet ?? null
  const given = new Map((sheet?.entries ?? []).map((e) => [e.student_member_id, e]))
  const keys = criteriaOf(form).map((c) => c.key)
  return {
    comment: sheet?.comment ?? '',
    entries: evaluatedIn(task, me).map((memberId) => {
      const e = given.get(memberId)
      const ratings: Record<string, number | undefined> = {}
      for (const k of keys) ratings[k] = e?.ratings?.[k] ?? undefined
      return {
        memberId,
        share: e?.share === null || e?.share === undefined ? '' : String(e.share),
        ratings,
        comment: e?.comment ?? '',
      }
    }),
  }
}

/** A share as typed: a whole number from 0 to 100, or null. */
export function parseShare(s: string): number | null {
  const t = s.trim()
  if (!/^\d{1,3}$/.test(t)) return null
  const n = Number(t)
  return n <= SHARE_TOTAL ? n : null
}

/** What the shares typed so far add up to, those that are whole numbers from 0 to 100. */
export function shareTotal(d: SheetDraft): number {
  return d.entries.reduce((sum, e) => sum + (parseShare(e.share) ?? 0), 0)
}

/** 100 split as evenly as whole numbers allow among n: 3 → 34, 33, 33. */
export function evenShares(n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(SHARE_TOTAL / n)
  const extra = SHARE_TOTAL - base * n
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0))
}

export type SheetProblem =
  | { kind: 'shareMissing'; memberId: string }
  | { kind: 'shareInvalid'; memberId: string }
  | { kind: 'shareTotal'; total: number }
  | { kind: 'ratingMissing'; memberId: string; criterion: string }
  | { kind: 'commentTooLong'; memberId?: string }

/** Everything that keeps a sheet from being sent; nothing for one Core would take. */
export function sheetProblems(form: FormLike, d: SheetDraft): SheetProblem[] {
  const out: SheetProblem[] = []
  if (isRating(form)) {
    const keys = criteriaOf(form).map((c) => c.key)
    const min = form.scale_min ?? 0
    const max = form.scale_max ?? 10
    for (const e of d.entries)
      for (const k of keys) {
        const r = e.ratings[k]
        if (r === undefined || !Number.isInteger(r) || r < min || r > max)
          out.push({ kind: 'ratingMissing', memberId: e.memberId, criterion: k })
      }
  } else {
    let anyBad = false
    for (const e of d.entries) {
      if (!e.share.trim()) {
        out.push({ kind: 'shareMissing', memberId: e.memberId })
        anyBad = true
      } else if (parseShare(e.share) === null) {
        out.push({ kind: 'shareInvalid', memberId: e.memberId })
        anyBad = true
      }
    }
    const total = shareTotal(d)
    if (!anyBad && total !== SHARE_TOTAL) out.push({ kind: 'shareTotal', total })
  }
  for (const e of d.entries)
    if ([...e.comment].length > MAX_ENTRY_COMMENT) out.push({ kind: 'commentTooLong', memberId: e.memberId })
  if ([...d.comment].length > MAX_SHEET_COMMENT) out.push({ kind: 'commentTooLong' })
  return out
}

/** What peer_review.submit is sent for a sheet. */
export function submitArgs(courseId: string, assignmentId: string, form: FormLike, d: SheetDraft) {
  const rating = isRating(form)
  const keys = criteriaOf(form).map((c) => c.key)
  return {
    course_id: courseId,
    assignment_id: assignmentId,
    comment: d.comment.trim() ? d.comment.trim() : undefined,
    entries: d.entries.map((e) => {
      const entry: {
        student_member_id: string
        share?: number
        ratings?: Record<string, number>
        comment?: string
      } = { student_member_id: e.memberId }
      if (rating) {
        const ratings: Record<string, number> = {}
        for (const k of keys) ratings[k] = e.ratings[k] as number
        entry.ratings = ratings
      } else entry.share = parseShare(e.share) ?? 0
      if (e.comment.trim()) entry.comment = e.comment.trim()
      return entry
    }),
  }
}

/** Whether the sheet says what the one written says: nothing to send again. */
export function sameAsSheet(form: FormLike, sheet: PeerSheet | null | undefined, d: SheetDraft): boolean {
  if (!sheet) return false
  if ((sheet.comment ?? '').trim() !== d.comment.trim()) return false
  const given = new Map((sheet.entries ?? []).map((e) => [e.student_member_id, e]))
  if (given.size !== d.entries.length) return false
  const keys = criteriaOf(form).map((c) => c.key)
  return d.entries.every((e) => {
    const g = given.get(e.memberId)
    if (!g || (g.comment ?? '').trim() !== e.comment.trim()) return false
    if (isRating(form)) return keys.every((k) => g.ratings?.[k] === e.ratings[k])
    return g.share === parseShare(e.share)
  })
}
