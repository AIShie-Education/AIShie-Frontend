// The course's event feed (event.list), read the only way Core offers it:
// forward from a cursor, oldest first, filtered to what the caller may know.
//
// A page is "everything after since_seq, up to limit events". seq is one
// sequence for the whole platform, not per course, so a course's events are
// spread thinly along it and there is no "last page" to ask for. To show the
// newest events first, newestWindow() looks for a cursor with a
// window's worth of the caller's events after it (at least `want`, fewer than
// `limit`) and reads that one page. It gallops forward from a guess and then
// bisects: each probe is one page read, and the number of visible events
// after a cursor falls by at most one per seq, so such a cursor always exists
// between one that is too early (a full page) and one that is too late (too
// few events). A course with fewer than `limit` events is one call from 0.
// Should the search ever fail to settle (events appearing as it runs, say) it
// falls back to reading forward to the end and keeping the tail.

import type { RouteLocationRaw } from 'vue-router'
import { read } from '@/api/http'
import type { CourseEvent } from '@/api/types'
import type { useCourseStore } from '@/stores/course'

export type { CourseEvent }

/** Core's largest page. */
export const MAX_PAGE = 500

interface Page {
  events: CourseEvent[]
  more: boolean
  nextSeq: number
}

async function page(courseId: string, since: number, limit: number): Promise<Page> {
  const out = await read('event.list', { course_id: courseId, since_seq: since, limit })
  return { events: out.events ?? [], more: !!out.more, nextSeq: out.next_seq ?? since }
}

export interface FeedWindow {
  /** Oldest first. */
  events: CourseEvent[]
  /**
   * The cursor the window was read from: every event the caller may see
   * after it (and up to the ceiling) is in `events`. 0 means there is
   * nothing older.
   */
  floor: number
  /** Where to read on from for news (without a ceiling: the head). */
  head: number
}

// Where the last search for a course's head settled, per window size: the
// next search of that size starts there and is usually one call. And, per
// course, the head last seen and how thinly the course's events lie along
// the sequence, for a first guess at a window of another size.
const hints = new Map<string, number>()
const shape = new Map<string, { head: number; perEvent: number }>()

function learn(courseId: string, events: CourseEvent[], head: number) {
  if (events.length < 2) return
  const perEvent = (events[events.length - 1].seq - events[0].seq) / (events.length - 1)
  shape.set(courseId, { head, perEvent: Math.max(1, perEvent) })
}

function firstGuess(courseId: string, key: string, want: number, limit: number): number {
  const exact = hints.get(key)
  if (exact !== undefined) return exact
  const s = shape.get(courseId)
  // Aimed early rather than late: a guess too early costs a hop forward, one
  // too late a search back from the start.
  return s ? Math.max(0, Math.floor(s.head - s.perEvent * (want + limit))) : 0
}

/**
 * The newest events the caller may see, at or below `ceiling` (the whole feed
 * when it is null): at least `want` of them where there are that many, and
 * fewer than `limit`.
 */
export async function newestWindow(
  courseId: string,
  opts: { want: number; limit: number; ceiling?: number | null; guess?: number },
): Promise<FeedWindow> {
  const limit = Math.min(Math.max(Math.floor(opts.limit), 2), MAX_PAGE)
  const want = Math.min(Math.max(Math.floor(opts.want), 1), limit - 1)
  const ceiling = opts.ceiling ?? null
  if (ceiling !== null && ceiling <= 0) return { events: [], floor: 0, head: 0 }
  const key = `${courseId}|${limit}|${want}`

  // lo: the latest cursor known to have a full page (or more) after it.
  // hi: the earliest known to have fewer than `want` after it.
  let lo = -1
  let hi = ceiling ?? Number.POSITIVE_INFINITY
  let since = Math.max(0, Math.floor(opts.guess ?? (ceiling === null ? firstGuess(courseId, key, want, limit) : 0)))
  if (ceiling !== null) since = Math.min(since, ceiling - 1)
  let stride = 0

  for (let probes = 0; probes < 64; probes++) {
    const p = await page(courseId, since, limit)
    const last = p.events.length ? p.events[p.events.length - 1].seq : since
    const inside = ceiling === null ? p.events : p.events.filter((e) => e.seq <= ceiling)
    // Every event in (since, ceiling] is on this page when the page did not
    // fill, or when it runs past the ceiling.
    const complete = !p.more || (ceiling !== null && last > ceiling)

    let next: number
    if (!complete) {
      lo = since
      if (hi === Number.POSITIVE_INFINITY) {
        // Nothing known beyond: jump ahead by what this page spanned, twice
        // as far each time.
        stride = stride ? stride * 2 : Math.max(1, last - since)
        next = last + stride
      } else {
        next = Math.floor((lo + hi) / 2)
      }
    } else if (inside.length < want && since > 0) {
      hi = since
      // With nothing earlier known, the start is tried first: one read says
      // whether everything there is fits in one window (it usually does
      // near the beginning of a course).
      next = lo < 0 ? 0 : Math.floor((lo + hi) / 2)
    } else {
      if (ceiling === null) {
        hints.set(key, since)
        learn(courseId, inside, p.nextSeq)
      }
      return { events: inside, floor: since, head: ceiling === null ? p.nextSeq : ceiling }
    }
    // A probe must land strictly between what is known.
    if (next <= lo || next >= hi) break
    since = next
  }
  return tail(courseId, Math.max(lo, 0), ceiling, limit)
}

/**
 * The window of events just older than those loaded (newest first), whose
 * earliest cursor is `floor`. The first probe is aimed where `want` or so
 * older events should start, going by how thinly the loaded events lie along
 * the platform-wide sequence.
 */
export function olderWindow(
  courseId: string,
  loaded: CourseEvent[],
  floor: number,
  opts: { want: number; limit: number },
): Promise<FeedWindow> {
  let guess = 0
  if (loaded.length >= 2) {
    const perEvent = (loaded[0].seq - loaded[loaded.length - 1].seq) / (loaded.length - 1)
    guess = Math.max(0, Math.floor(floor - perEvent * opts.want * 2))
  }
  return newestWindow(courseId, { ...opts, ceiling: floor, guess })
}

/** Reads forward from `from` to the end (or the ceiling) and keeps the newest `keep`. */
async function tail(courseId: string, from: number, ceiling: number | null, keep: number): Promise<FeedWindow> {
  let since = from
  let kept: CourseEvent[] = []
  let floor = from
  let head = from
  for (let i = 0; i < 10_000; i++) {
    const p = await page(courseId, since, MAX_PAGE)
    const inside = ceiling === null ? p.events : p.events.filter((e) => e.seq <= ceiling)
    kept = kept.concat(inside)
    if (kept.length > keep) {
      const drop = kept.length - keep
      floor = kept[drop - 1].seq
      kept = kept.slice(drop)
    }
    head = p.nextSeq
    if (!p.more || inside.length < p.events.length) break
    since = p.nextSeq
  }
  if (ceiling === null) learn(courseId, kept, head)
  return { events: kept, floor, head: ceiling ?? head }
}

// The seq of the first event the caller may see in a course: once written,
// an event stays, so this is asked once per course.
const firsts = new Map<string, Promise<number | null>>()

/** The seq of the earliest event the caller may see, or null when there is none. */
export function firstEventSeq(courseId: string): Promise<number | null> {
  let p = firsts.get(courseId)
  if (!p) {
    p = page(courseId, 0, 1).then((r) => r.events[0]?.seq ?? null)
    p.catch(() => firsts.delete(courseId))
    firsts.set(courseId, p)
  }
  return p
}

/**
 * Whether anything the caller may see lies at or before `floor`. A window's
 * floor says only that everything after it is in hand; this settles whether
 * there is anything before it, so as not to offer older activity that is not
 * there.
 */
export async function hasOlder(courseId: string, floor: number): Promise<boolean> {
  if (floor <= 0) return false
  const first = await firstEventSeq(courseId)
  return first !== null && first <= floor
}

/**
 * Everything the caller may see after `since`, for news. Reads at most
 * maxPages full pages; `more` says there is still more to read.
 */
export async function eventsSince(
  courseId: string,
  since: number,
  maxPages = 10,
): Promise<{ events: CourseEvent[]; head: number; more: boolean }> {
  const events: CourseEvent[] = []
  let cursor = since
  let more = false
  for (let i = 0; i < maxPages; i++) {
    const p = await page(courseId, cursor, MAX_PAGE)
    events.push(...p.events)
    cursor = Math.max(cursor, p.nextSeq)
    more = p.more
    if (!p.more) break
  }
  return { events, head: cursor, more }
}

// ---------------------------------------------------------------------------
// What an event is about
// ---------------------------------------------------------------------------

export type Category =
  'grades' | 'submissions' | 'assignments' | 'documents' | 'members' | 'actions' | 'course' | 'other'
export const CATEGORIES: Category[] = [
  'grades',
  'submissions',
  'assignments',
  'documents',
  'members',
  'actions',
  'course',
]

export const CATEGORY_ICON: Record<Category, string> = {
  grades: 'Medal',
  submissions: 'Files',
  assignments: 'EditPen',
  documents: 'Reading',
  members: 'UserFilled',
  actions: 'Stamp',
  course: 'School',
  other: 'Bell',
}

/** The event's family, by the first part of its type. The grading scheme counts with grades. */
export function categoryOf(type: string): Category {
  switch (type.split('.')[0]) {
    case 'grade':
    case 'component':
      return 'grades'
    case 'submission':
      return 'submissions'
    case 'assignment':
      return 'assignments'
    case 'document':
      return 'documents'
    case 'member':
      return 'members'
    case 'action':
      return 'actions'
    case 'course':
      return 'course'
  }
  return 'other'
}

/** One field of an event's payload, which is a small JSON object of ids and facts. */
export function payloadField(e: CourseEvent, key: string): unknown {
  const p = e.payload
  if (!p || typeof p !== 'object' || Array.isArray(p)) return undefined
  return (p as Record<string, unknown>)[key]
}

export function payloadString(e: CourseEvent, key: string): string | undefined {
  const v = payloadField(e, key)
  return typeof v === 'string' && v ? v : undefined
}

export function payloadNumber(e: CourseEvent, key: string): number | undefined {
  const v = payloadField(e, key)
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function payloadBool(e: CourseEvent, key: string): boolean | undefined {
  const v = payloadField(e, key)
  return typeof v === 'boolean' ? v : undefined
}

/** What the event's subject is, for the words and the link beside it. */
export type SubjectKind =
  | 'assignment'
  | 'submission'
  | 'grade'
  | 'material'
  | 'submissionFile'
  | 'feedbackFile'
  | 'member'
  | 'action'
  | 'component'
  | 'course'
  | 'other'

export function subjectKind(e: CourseEvent): SubjectKind {
  switch (e.subject_type) {
    case 'assignment':
      return 'assignment'
    case 'submission':
      return 'submission'
    case 'grade':
      return 'grade'
    case 'course_member':
      return 'member'
    case 'action':
      return 'action'
    case 'grade_component':
      return 'component'
    case 'course':
      return 'course'
    case 'document': {
      const kind = payloadString(e, 'kind')
      if (kind === 'submission' || e.type.startsWith('submission.')) return 'submissionFile'
      if (kind === 'feedback' || e.type.startsWith('grade.feedback')) return 'feedbackFile'
      return 'material'
    }
  }
  return 'other'
}

type CourseStore = ReturnType<typeof useCourseStore>

/** What the caller's seat is known to reach, for choosing where links go. */
export interface Reach {
  /** May read the member list (and so open a member). */
  readsMembers: boolean
  /** May read the action log (and so open anyone's action). */
  decides: boolean
}

/**
 * From the course store's levels, which count what Core has already refused
 * (a seat refused its own member.get does not hold member_read). A seat
 * whose levels are unknown is not taken to decide: it is sent only to what
 * it is sure to be let into.
 */
export function reachOf(course: CourseStore): Reach {
  return {
    readsMembers: course.can('member_read'),
    decides: course.level('action_decide') !== null && course.can('action_decide'),
  }
}

/** Where the event's subject can be looked at, if anywhere. */
export function subjectRoute(e: CourseEvent, courseId: string, reach: Reach): RouteLocationRaw | null {
  const id = e.subject_id
  const query: Record<string, string> = {}
  if (e.assignment_id) query.assignment = e.assignment_id
  if (e.student_member_id) query.student = e.student_member_id
  switch (subjectKind(e)) {
    case 'assignment':
      return id ? { name: 'course-assignment', params: { courseId, assignmentId: id } } : null
    case 'submission':
      return id ? { name: 'course-submission', params: { courseId, submissionId: id } } : null
    case 'grade':
      // A computed total is read in the gradebook, with the rest of the student's standing.
      if (e.type === 'grade.total_updated' && e.student_member_id) {
        return { name: 'course-gradebook', params: { courseId, studentMemberId: e.student_member_id } }
      }
      return id ? { name: 'course-grade', params: { courseId, gradeId: id } } : null
    case 'material':
      return id ? { name: 'course-document', params: { courseId, documentId: id } } : null
    case 'submissionFile':
      // A handed-in file is read with its submission, which the event does
      // not name; its student and assignment find it.
      return { name: 'course-submissions', params: { courseId }, query }
    case 'feedbackFile':
      return { name: 'course-grades', params: { courseId }, query }
    case 'member':
      return id && reach.readsMembers ? { name: 'course-member', params: { courseId, memberId: id } } : null
    case 'action':
      // A seat without action_decide sees action events only for its own
      // actions, and the action page shows one's own from action.list_mine.
      return id ? { name: 'course-action', params: { courseId, actionId: id } } : null
    case 'component':
      return { name: 'course-scheme', params: { courseId } }
  }
  return null
}

/**
 * Whether b continues a's run: the same thing happening again to the same
 * subject, for the same student and assignment (an assignment edited forty
 * times over). A list shows a run as one row that opens to show them all.
 */
export function sameRun(a: CourseEvent, b: CourseEvent): boolean {
  return (
    a.type === b.type &&
    a.subject_type === b.subject_type &&
    (a.subject_id ?? null) === (b.subject_id ?? null) &&
    (a.student_member_id ?? null) === (b.student_member_id ?? null) &&
    (a.assignment_id ?? null) === (b.assignment_id ?? null)
  )
}

export interface Run {
  /** The seq of its first (in list order) event. */
  key: number
  events: CourseEvent[]
}

/** Consecutive events of the same run, together. `apart` keeps two events out of one run. */
export function runsOf(list: CourseEvent[], apart?: (a: CourseEvent, b: CourseEvent) => boolean): Run[] {
  const out: Run[] = []
  for (const e of list) {
    const run = out[out.length - 1]
    if (run && sameRun(run.events[0], e) && !apart?.(run.events[0], e)) run.events.push(e)
    else out.push({ key: e.seq, events: [e] })
  }
  return out
}

/** Newest first, without duplicates. */
export function mergeNewestFirst(a: CourseEvent[], b: CourseEvent[]): CourseEvent[] {
  const bySeq = new Map<number, CourseEvent>()
  for (const e of a) bySeq.set(e.seq, e)
  for (const e of b) bySeq.set(e.seq, e)
  return [...bySeq.values()].sort((x, y) => y.seq - x.seq)
}
