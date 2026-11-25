// What a course's card on the home page says beyond its name, read for each
// course the caller has a seat in, after the page is shown: its term, the
// next assignment due, and what waits for the caller there (proposals to
// decide: their own agents' where they decide nothing else). Each is read as
// the caller may read it and left out where it may not be, or cannot be,
// read; none holds the page up. Core's course.get also gives the instructors'
// display names to anyone who may read the course, never requiring member_read.
import { reactive, watch, type Ref } from 'vue'
import { ApiError, read } from '@/api/http'
import type { ListItem } from '@/api/types'
import { QUEUE_PAGE } from '@/views/course/overview/waiting'

export type Membership = ListItem<'me.memberships', 'memberships'>

export interface CourseFacts {
  /** The term's name. */
  term?: string
  /** The published assignment due soonest from now. */
  next?: { id: string; title: string; dueAt: string }
  /** Proposals waiting for the caller's decision: n, and whether there may be more. */
  waiting?: { n: number; more: boolean; agentsOnly: boolean }
  /** Instructor display names from course.get, with no member-list permission required. */
  instructors?: string[]
  /** The course read failed, or an older Core has no instructors field: never mistake this for no instructor. */
  instructorsUnavailable?: boolean
  /** course.get succeeded (its failure also makes the week summary partial). */
  courseRead?: boolean
  /** Every published assignment read, all cursor pages included; absent when refused, failed or truncated. */
  assignments?: { id: string; title: string; due_at?: string | null; published_at?: string | null }[]
}

/** At most this many courses' facts are read: past it, the page is a list to filter, not to read. */
export const FACTS_FOR = 12
const PAGE = 100

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

/** Every assignment page, or a marker that the safety ceiling was reached. */
async function readAssignments(courseId: string) {
  const items: { id: string; title: string; due_at?: string | null; published_at?: string | null }[] = []
  let after: string | undefined
  let complete = false
  for (let page = 0; page < 100; page++) {
    const out = await read('assignment.list', { course_id: courseId, limit: PAGE, after })
    items.push(...(out.assignments ?? []))
    if (!out.next) {
      complete = true
      break
    }
    after = out.next
  }
  return { items, complete }
}

/** Reads one course's facts; each part is left out where it cannot be read. */
export async function readCourseFacts(m: Membership, terms: Promise<Map<string, string>>, now = Date.now()) {
  const id = m.course_id
  const live = m.course_status !== 'archived' && m.status === 'active'
  const [course, assignments, queue, names] = await Promise.allSettled([
    read('course.get', { course_id: id }),
    allowed(m, 'document_read') ? readAssignments(id) : Promise.reject(),
    // The queue shows a person who decides nothing here their own agents' proposals, or refuses them.
    live ? read('action.list_proposed', { course_id: id, limit: QUEUE_PAGE }) : Promise.reject(),
    terms,
  ])
  const out: CourseFacts = { courseRead: course.status === 'fulfilled' }
  if (course.status === 'fulfilled') {
    // An older Core omits this optional field; that is unknown, not no instructor.
    const listed = course.value.instructors
    if (Array.isArray(listed)) {
      out.instructors = [
        ...new Set((listed ?? []).map((person) => person.display_name?.trim()).filter((name): name is string => !!name)),
      ]
    } else out.instructorsUnavailable = true
  } else out.instructorsUnavailable = true
  if (course.status === 'fulfilled' && names.status === 'fulfilled') {
    const term = names.value.get(course.value.term_id)
    if (term) out.term = term
  }
  if (assignments.status === 'fulfilled' && assignments.value.complete) {
    out.assignments = assignments.value.items
    const next = nextDue(assignments.value.items, now)
    if (next) out.next = next
  }
  if (queue.status === 'fulfilled') {
    // Counted as the course's overview counts them (AttentionCard, QUEUE_PAGE): every proposal the
    // queue shows the caller. The overview asks only a seat that decides or owns an agent here; this
    // asks every live seat, as whether one owns an agent is not known here.
    const n = (queue.value.actions ?? []).length
    out.waiting = { n, more: !!queue.value.next, agentsOnly: !allowed(m, 'action_decide') }
  } else if (queue.reason instanceof ApiError && queue.reason.isForbidden) {
    // Core refuses the queue of someone who neither decides nor owns an agent
    // here: that is a real zero, not unknown data or a partial read failure.
    out.waiting = { n: 0, more: false, agentsOnly: true }
  }
  return out
}

/** The facts of the courses listed, read once each as they come into the list. */
export function useCourseFacts(courses: Ref<Membership[]>) {
  const facts = reactive(new Map<string, CourseFacts>())
  // Keep an in-flight marker apart from the data: the week summary appears
  // only once every listed course has answered, never as a false initial zero.
  const reading = new Set<string>()
  let terms: Promise<Map<string, string>> | null = null
  const termNames = () =>
    (terms ??= read('term.list', {})
      .then((o) => new Map((o.terms ?? []).map((t) => [t.id, t.name] as [string, string])))
      .catch(() => new Map<string, string>()))
  watch(
    () => courses.value.slice(0, FACTS_FOR).map((m) => m.course_id),
    (ids) => {
      for (const m of courses.value.filter((c) => ids.includes(c.course_id))) {
        if (facts.has(m.course_id) || reading.has(m.course_id)) continue
        reading.add(m.course_id)
        void readCourseFacts(m, termNames())
          .then((f) => facts.set(m.course_id, f))
          .finally(() => reading.delete(m.course_id))
      }
    },
    { immediate: true },
  )
  return facts
}
