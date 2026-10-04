// Deleting an assignment for good (assignment.delete, AIShie-Core #73): what
// the pages share of it. Core counts what goes with it first
// (assignment.delete_preview) and takes those counts back, unchanged, as its
// confirmation: if more would go by then, it refuses (confirm_stale), so that
// nobody deletes more than they were shown. Afterwards every call naming the
// assignment is told it was deleted (not_found, reason deleted).
import { ApiError, read } from '@/api/http'
import type { DeletionCounts } from '@/api/types'
import { formatList } from '@/utils/format'

/** The counts Core takes back as confirm, in the order the dialog lists them. */
export const COUNT_KEYS = [
  'submissions',
  'handed_in',
  'drafts',
  'missing',
  'grades',
  'posted',
  'files',
  'proposals',
  'totals',
] as const satisfies readonly (keyof DeletionCounts)[]

/** Core's answer about an assignment deleted for good: not found, because it was deleted. */
export function isDeletedError(e: unknown): boolean {
  return e instanceof ApiError && e.isNotFound && e.details?.reason === 'deleted'
}

/** When it was deleted, where Core says (details.deleted_at). */
export function deletedAt(e: ApiError | null | undefined): string | null {
  const at = e?.details?.deleted_at
  return typeof at === 'string' && at ? at : null
}

/**
 * Someone has started on it: a submission of any kind (a draft, or work
 * recorded as missing, among them) or a grade. Its title is then typed to
 * confirm, and an agent may not delete it (people_only).
 */
export function hasWork(c: Pick<DeletionCounts, 'submissions' | 'grades'> | null | undefined): boolean {
  return !!c && c.submissions + c.grades > 0
}

/** The reader's words for a key, with its named values, and the count its plural goes by where it has one (vue-i18n's t). */
export type CountWords = (key: string, named: Record<string, unknown>, plural?: number) => string

/**
 * What goes with it, a line for each count that is not nought, in the
 * reader's words (assignments.delete.*): the submissions and the grades each
 * broken down into their parts that are not nought, each part pluralised on
 * its own. The dialog lists them before deleting it, and a deletion waiting
 * for approval lists them where it is approved (DeletionAtStake).
 */
export function goesLines(c: DeletionCounts, t: CountWords): string[] {
  const out: string[] = []
  const parts = (pairs: [number, string][]) =>
    formatList(pairs.filter(([n]) => n > 0).map(([n, key]) => t(key, { n }, n)))
  if (c.submissions > 0) {
    out.push(
      t('assignments.delete.submissions', {
        n: c.submissions,
        parts: parts([
          [c.handed_in, 'assignments.delete.handedIn'],
          [c.drafts, 'assignments.delete.drafts'],
          [c.missing, 'assignments.delete.missing'],
        ]),
      }),
    )
  }
  if (c.grades > 0) {
    out.push(
      t('assignments.delete.grades', {
        n: c.grades,
        parts: parts([
          [c.posted, 'assignments.delete.posted'],
          [c.grades - c.posted, 'assignments.delete.unposted'],
        ]),
      }),
    )
  }
  if (c.files > 0) out.push(t('assignments.delete.files', { n: c.files }))
  if (c.proposals > 0) out.push(t('assignments.delete.proposals', { n: c.proposals }))
  if (c.totals > 0) out.push(t('assignments.delete.totals', { n: c.totals }, c.totals))
  return out
}

/** Nothing at all goes with it but the assignment. */
export function nothingGoes(c: DeletionCounts | null | undefined): boolean {
  return !!c && COUNT_KEYS.every((k) => !c[k])
}

/**
 * A title as it reads on the page, which is what is typed to confirm: in
 * Unicode's compatibility form (NFKC: a full-width letter or space is its
 * ordinary one), with the characters that show nothing taken out (a
 * zero-width space, a soft hyphen: Unicode's format characters), and every
 * run of white space of any kind (spaces, a line break, a tab, a no-break
 * or an ideographic space) one space, as HTML draws it; none at either end.
 */
export function titleAsRead(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * The title typed to confirm is the assignment's as the page shows it
 * (titleAsRead): what is seen on the page, typed or copied from it, matches,
 * whatever white space the title was saved with.
 */
export function titleMatches(typed: string, title: string): boolean {
  const t = titleAsRead(typed)
  return t !== '' && t === titleAsRead(title)
}

/**
 * Whether more would go now than `was` says: any count larger, which Core
 * refuses as confirm_stale. A smaller one (a draft deleted meanwhile) is no
 * reason to refuse, as Core holds.
 */
export function countsGrown(was: Partial<DeletionCounts> | null | undefined, now: DeletionCounts): boolean {
  return COUNT_KEYS.some((k) => now[k] > (typeof was?.[k] === 'number' ? (was[k] as number) : 0))
}

/** The counts an assignment.delete call was confirmed with, from its payload, where they are all there. */
export function confirmOf(payload: unknown): DeletionCounts | null {
  if (!payload || typeof payload !== 'object') return null
  const c = (payload as { confirm?: unknown }).confirm
  if (!c || typeof c !== 'object') return null
  const out: Partial<DeletionCounts> = {}
  for (const k of COUNT_KEYS) {
    const v = (c as Record<string, unknown>)[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    out[k] = v
  }
  return out as DeletionCounts
}

/**
 * Whether an assignment a page was asked to filter by was deleted for good:
 * asked of Core only for one the course's list does not have, and true only
 * when Core says it was deleted (one the caller may not see stays a filter).
 */
export async function wasDeleted(courseId: string, assignmentId: string): Promise<boolean> {
  try {
    await read('assignment.get', { course_id: courseId, assignment_id: assignmentId })
    return false
  } catch (e) {
    return isDeletedError(e)
  }
}
