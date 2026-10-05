// Which fields of an action's payload or result are a group grading's own
// (GroupGradeField shows them): each member's adjustment, each member's
// grade from a group grade, one adjustment, and who a group's work is of.
import { isObject } from './actionText'

export type GroupGradeFieldKind = 'adjustments' | 'memberGrades' | 'adjustment' | 'adjustKind' | 'memberList'

const MEMBER_LISTS = new Set(['submission.set_members', 'grade.submit', 'grade.regrade'])

export function groupGradeField(
  name: string,
  value: unknown,
  actionType: string | null | undefined,
): GroupGradeFieldKind | null {
  if (name === 'adjustments' && Array.isArray(value)) return 'adjustments'
  if (name === 'member_grades' && Array.isArray(value)) return 'memberGrades'
  if (name === 'adjustment' && (isObject(value) || value === null)) return 'adjustment'
  if (name === 'kind' && actionType === 'grade.adjust' && typeof value === 'string') return 'adjustKind'
  const strings = Array.isArray(value) && value.every((x) => typeof x === 'string')
  if (strings && (name === 'members' || name === 'add' || name === 'remove') && MEMBER_LISTS.has(actionType ?? ''))
    return 'memberList'
  return null
}

/** The fields grade.adjust's payload says in its kind's line: not said again on their own. */
export const ADJUST_PAYLOAD_SKIP = ['points', 'reason']
