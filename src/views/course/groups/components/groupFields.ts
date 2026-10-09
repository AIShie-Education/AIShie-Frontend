// How an action about groups' fields are shown on its page (FieldsView: what
// was asked, what came of it, and why it was refused), in words: a set and a
// group by name, never by id; who goes where; the groups a split made, left
// alone or filled; how it split and whom it dealt. Fields that mean something
// else elsewhere (by, from, groups, id) are read so only in an action about
// groups; the work a refusal names (group_has_work) wherever it is met.
import { isObject } from '@/views/course/actions/components/actionText'
import { isGroupAction } from './groupEvents'

export type GroupFieldKind =
  'set' | 'group' | 'groups' | 'newGroups' | 'placements' | 'moves' | 'made' | 'kept' | 'splitBy' | 'splitFrom' | 'work'

const listOf = (v: unknown, key: string): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => isObject(x) && typeof x[key] === 'string')

/** How a field of an action about groups is shown, or null for one shown as any other. */
export function groupFieldKind(
  key: string,
  value: unknown,
  actionType: string | null | undefined,
): GroupFieldKind | null {
  // The work a refusal names (group_has_work, your_group_has_work), whatever action met it.
  if (
    key === 'work' &&
    Array.isArray(value) &&
    value.length &&
    listOf(value, 'group_id') &&
    listOf(value, 'assignment_id')
  )
    return 'work'
  if (!isGroupAction(actionType)) return null
  switch (key) {
    case 'set_id':
      return typeof value === 'string' ? 'set' : null
    case 'id':
      // What group_set.create made.
      return actionType === 'group_set.create' && typeof value === 'string' ? 'set' : null
    case 'group_id':
    case 'left_group_id':
    case 'from_group_id':
      return typeof value === 'string' ? 'group' : null
    case 'group_ids':
    case 'over_capacity':
      return Array.isArray(value) && value.every((x) => typeof x === 'string') ? 'groups' : null
    case 'groups':
      return listOf(value, 'name') ? 'newGroups' : null
    case 'placements':
    case 'placed':
      return listOf(value, 'student_member_id') ? 'placements' : null
    case 'moved':
      return listOf(value, 'student_member_id') ? 'moves' : null
    case 'created':
      return listOf(value, 'group_id') && listOf(value, 'name') ? 'made' : null
    case 'kept':
      return listOf(value, 'group_id') ? 'kept' : null
    case 'by':
      return actionType === 'group.split' && typeof value === 'string' ? 'splitBy' : null
    case 'from':
      return actionType === 'group.split' && typeof value === 'string' ? 'splitFrom' : null
  }
  return null
}

/** The label of a field of an action about groups where it is not the field's own (actions.fields.*). */
export function groupFieldLabel(key: string, actionType: string | null | undefined): string | null {
  if (key === 'work') return 'groups.fields.work'
  if (!isGroupAction(actionType)) return null
  if (key === 'id' && actionType === 'group_set.create') return 'actions.fields.set_id'
  if (key === 'created' && actionType === 'group.split') return 'groups.proposal.newGroups'
  if (key === 'groups' && actionType === 'group.create') return 'groups.proposal.newGroups'
  if (key === 'group_ids' && actionType === 'group.create') return 'groups.fields.made'
  if (key === 'group_id' && actionType === 'group.sign_up') return 'groups.fields.joined'
  return null
}

/** The ids of sets and groups a value names, to read their names before it is shown. */
export function groupIdsIn(value: unknown): string[] {
  const out: string[] = []
  const add = (v: unknown) => {
    if (typeof v === 'string') out.push(v)
  }
  if (!isObject(value)) return out
  for (const [k, v] of Object.entries(value)) {
    if (k === 'set_id' || k === 'group_id' || k === 'left_group_id' || k === 'from_group_id' || k === 'id') add(v)
    else if (Array.isArray(v))
      for (const x of v) {
        if (typeof x === 'string') add(x)
        else if (isObject(x)) {
          add(x.group_id)
          add(x.from_group_id)
        }
      }
  }
  return out
}
