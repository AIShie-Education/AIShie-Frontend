// The caller's seat in the course a conversation is in, as the chat needs it.
// The chat is beside every page, not only a course's, so it reads the seat
// from the caller's memberships (me.memberships, which says what each seat may
// do now) rather than from the course the page shows. Only for what to offer:
// Core decides what is allowed, and refuses the rest.
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { Membership, Perm } from '@/api/types'
import { effectivePerms } from '@/stores/course'
import { useSessionStore } from '@/stores/session'

export interface ChatSeat {
  /** The caller's member id in the course, or null when they have no seat there. */
  memberId: string | null
  /** Whether to offer what p gates: a level other than denied, or not known (an older Core). */
  can: (p: Perm) => boolean
  /** Writes are refused in an archived course. */
  writable: boolean
}

/** A seat as the chat reads it; nothing is offered where there is none. */
export function seatIn(m: Membership | null | undefined): ChatSeat {
  if (!m || m.status === 'removed') return { memberId: null, can: () => false, writable: false }
  const perms = effectivePerms(m)
  return {
    memberId: m.member_id,
    can: (p) => (perms ? perms[p] !== 'denied' : true),
    writable: m.course_status !== 'archived',
  }
}

/** The caller's seat in a course, kept up to date with their memberships. */
export function useChatSeat(courseId: MaybeRefOrGetter<string | null | undefined>) {
  const session = useSessionStore()
  return computed(() => {
    const id = toValue(courseId)
    return seatIn(id ? session.membershipFor(id) : null)
  })
}

/**
 * The courses where the caller may ask agents now: a seat that counts
 * (active), in a course that is not archived, holding conversation_ask. In
 * the order the navigation lists courses.
 */
export function askableCourses(memberships: readonly Membership[]): Membership[] {
  return memberships
    .filter((m) => m.status === 'active' && m.course_status !== 'archived' && seatIn(m).can('conversation_ask'))
    .sort((a, b) => `${a.code}${a.section}`.localeCompare(`${b.code}${b.section}`))
}

/**
 * How a course is named beside an agent (history rows, a conversation's head):
 * its code, with its section when another of the caller's courses has the
 * same code.
 */
export function courseLabel(m: Pick<Membership, 'course_id' | 'code' | 'section'>, all: readonly Membership[] = []) {
  const twin = all.some((o) => o.course_id !== m.course_id && o.code === m.code)
  return twin && m.section ? `${m.code} (${m.section})` : m.code
}
