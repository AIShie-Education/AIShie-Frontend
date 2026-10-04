// Deleting an assignment for good (assignment.delete, AIShie-Core #73): what
// the pages share of it. Core counts what goes with it first
// (assignment.delete_preview) and takes those counts back, unchanged, as its
// confirmation: if more would go by then, it refuses (confirm_stale), so that
// nobody deletes more than they were shown. Afterwards every call naming the
// assignment is told it was deleted (not_found, reason deleted).
import { ApiError, read } from '@/api/http'
import type { DeletionCounts } from '@/api/types'

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

/** Nothing at all goes with it but the assignment. */
export function nothingGoes(c: DeletionCounts | null | undefined): boolean {
  return !!c && COUNT_KEYS.every((k) => !c[k])
}

/** The title typed to confirm is the assignment's, spaces at either end aside. */
export function titleMatches(typed: string, title: string): boolean {
  return typed.trim() !== '' && typed.trim() === title.trim()
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
