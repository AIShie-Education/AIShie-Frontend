// What the course's feed says of an event about groups (activity's
// EventItem), in words: how a student came to a group (placed, a random
// split, signing up) and from which, how they left one, and what changed of
// a set (its name, sign-up opened or closed, its deadline, archived) or of a
// group (its name, its capacity, archived). Events carry ids and small
// facts alone; anything not recognised is left unsaid.
import { i18n } from '@/i18n'
import type { CourseEvent } from '@/views/course/activity/components/feed'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})
const te = (key: string): boolean => (i18n.global as unknown as { te: (k: string) => boolean }).te(key)

function field(e: CourseEvent, key: string): unknown {
  const p = e.payload
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>)[key] : undefined
}
const text = (e: CourseEvent, key: string) => {
  const v = field(e, key)
  return typeof v === 'string' && v ? v : undefined
}

/** The facts an event about groups carries, in words; none for any other event. */
export function groupEventFacts(
  e: CourseEvent,
  groupName: (id: string | null | undefined) => { name: string } | undefined,
): string[] {
  const out: string[] = []
  const how = text(e, 'how')
  switch (e.type) {
    case 'group.member_added': {
      if (how && te(`groups.event.joined.${how}`)) out.push(t(`groups.event.joined.${how}`))
      const from = groupName(text(e, 'from_group_id'))
      if (from) out.push(t('groups.event.from', { group: from.name }))
      break
    }
    case 'group.member_removed':
      if (how && te(`groups.event.left.${how}`)) out.push(t(`groups.event.left.${how}`))
      break
    case 'group.created':
      if (how === 'split') out.push(t('groups.event.joined.split'))
      break
    case 'group_set.updated':
    case 'group.updated': {
      const changed = field(e, 'changed')
      for (const c of Array.isArray(changed) ? changed : []) {
        if (c === 'archived') out.push(field(e, 'archived') ? t('groups.event.archived') : t('groups.event.restored'))
        else if (c === 'signup_open')
          out.push(field(e, 'signup_open') ? t('groups.event.signupOpened') : t('groups.event.signupClosed'))
        else if (typeof c === 'string' && te(`groups.event.changed.${c}`)) out.push(t(`groups.event.changed.${c}`))
      }
      break
    }
  }
  return out
}

/** Whether an action is one of forming or joining groups (group_set.*, group.*), which GroupProposal says in words. */
export function isGroupAction(type: string | null | undefined): boolean {
  return !!type && (type.startsWith('group.') || type.startsWith('group_set.'))
}
