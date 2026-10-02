// What a course's card on the home page says beyond its name, read for each
// course the caller has a seat in, after the page is shown: its term, the
// next assignment due, and what waits for the caller there (proposals to
// decide: their own agents' where they decide nothing else). Each is read as
// the caller may read it and left out where it may not be, or cannot be,
// read; none holds the page up. Who teaches a course is not among them: a
// student may not read the member list, and Core says it nowhere else.
import { reactive, watch, type Ref } from 'vue'
import { read } from '@/api/http'
import type { ListItem } from '@/api/types'

export type Membership = ListItem<'me.memberships', 'memberships'>

export interface CourseFacts {
  /** The term's name. */
  term?: string
  /** The published assignment due soonest from now. */
  next?: { id: string; title: string; dueAt: string }
  /** Proposals waiting for the caller's decision: n, and whether there may be more. */
  waiting?: { n: number; more: boolean; agentsOnly: boolean }
}

/** At most this many courses' facts are read: past it, the page is a list to filter, not to read. */
export const FACTS_FOR = 12
const PAGE = 100
const QUEUE = 50

const allowed = (m: Membership, perm: string) => {
  const level = m.perms?.[perm]
  return !!level && level !== 'denied'
}

/** The next published assignment due after `now`, of those listed. */
export function nextDue(
  assignments: { id: string; title: string; due_at?: string | null; published_at?: string | null }[],
  now: number,
): CourseFacts['next'] {
  let best: CourseFacts['next']
  for (const a of assignments) {
    if (!a.due_at || !a.published_at) continue
    const at = Date.parse(a.due_at)
    if (!Number.isFinite(at) || at <= now) continue
    if (!best || at < Date.parse(best.dueAt)) best = { id: a.id, title: a.title, dueAt: a.due_at }
  }
  return best
}

/** Reads one course's facts; each part is left out where it cannot be read. */
export async function readCourseFacts(m: Membership, terms: Promise<Map<string, string>>, now = Date.now()) {
  const id = m.course_id
  const live = m.course_status !== 'archived' && m.status === 'active'
  const [course, assignments, queue, names] = await Promise.allSettled([
    read('course.get', { course_id: id }),
    allowed(m, 'document_read') ? read('assignment.list', { course_id: id, limit: PAGE }) : Promise.reject(),
    // The queue shows a person who decides nothing here their own agents' proposals, or refuses them.
    live ? read('action.list_proposed', { course_id: id, limit: QUEUE }) : Promise.reject(),
    terms,
  ])
  const out: CourseFacts = {}
  if (course.status === 'fulfilled' && names.status === 'fulfilled') {
    const term = names.value.get(course.value.term_id)
    if (term) out.term = term
  }
  if (assignments.status === 'fulfilled') {
    const next = nextDue(assignments.value.assignments ?? [], now)
    if (next) out.next = next
  }
  if (queue.status === 'fulfilled') {
    // Counted as the course's overview counts them (AttentionCard): every proposal the queue shows the caller.
    const n = (queue.value.actions ?? []).length
    out.waiting = { n, more: !!queue.value.next, agentsOnly: !allowed(m, 'action_decide') }
  }
  return out
}

/** The facts of the courses listed, read once each as they come into the list. */
export function useCourseFacts(courses: Ref<Membership[]>) {
  const facts = reactive(new Map<string, CourseFacts>())
  let terms: Promise<Map<string, string>> | null = null
  const termNames = () =>
    (terms ??= read('term.list', {})
      .then((o) => new Map((o.terms ?? []).map((t) => [t.id, t.name] as [string, string])))
      .catch(() => new Map<string, string>()))
  watch(
    () => courses.value.slice(0, FACTS_FOR).map((m) => m.course_id),
    (ids) => {
      for (const m of courses.value.filter((c) => ids.includes(c.course_id))) {
        if (facts.has(m.course_id)) continue
        facts.set(m.course_id, {})
        void readCourseFacts(m, termNames()).then((f) => facts.set(m.course_id, f))
      }
    },
    { immediate: true },
  )
  return facts
}
