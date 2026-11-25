// The useful summary above the home page's course grid: work still due this
// week, decisions waiting, and the next cut-off. The week is Monday–Sunday on
// the school's clock when Core gives one, otherwise the reader's.
import { nextDue, type CourseFacts, type Membership } from './courseFacts'
import { pickerWallTimeToISO } from '@/utils/schoolTime'
import { courseCodeText } from '@/utils/parts'

const DAY = 86_400_000

interface WallDate {
  year: number
  month: number
  day: number
}

function wallDate(at: number, timeZone: string): WallDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** A wall date's first instant in this zone, including dates whose midnight is in a DST gap. */
function startOfDate(date: WallDate, timeZone: string): number {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${date.year}-${pad(date.month)}-${pad(date.day)}`
  // Use the app's strict wall-time parser. A rare midnight gap or fold moves
  // to the first unambiguous hour, rather than inventing a UTC midnight.
  for (let hour = 0; hour < 24; hour++) {
    try {
      return Date.parse(pickerWallTimeToISO(`${day}T${pad(hour)}:00`, timeZone))
    } catch {
      // Try the next wall hour when this one has no single instant.
    }
  }
  throw new Error(`No valid start of ${day} in ${timeZone}`)
}

export interface WeekBounds {
  /** Instant of Monday 00:00 in the chosen zone. */
  start: number
  /** Instant of next Monday 00:00 in the chosen zone (exclusive). */
  end: number
  /** Calendar dates for locale-aware formatRange; their UTC fields are placeholders, never reader-local dates. */
  from: Date
  to: Date
}

export function weekBounds(now: number, timeZone: string): WeekBounds {
  const today = wallDate(now, timeZone)
  const todayUTC = Date.UTC(today.year, today.month - 1, today.day)
  const mondayUTC = todayUTC - ((new Date(todayUTC).getUTCDay() + 6) % 7) * DAY
  const sundayUTC = mondayUTC + 6 * DAY
  const from = new Date(mondayUTC)
  const to = new Date(sundayUTC)
  const start = startOfDate({ year: from.getUTCFullYear(), month: from.getUTCMonth() + 1, day: from.getUTCDate() }, timeZone)
  const end = startOfDate(
    { year: to.getUTCFullYear(), month: to.getUTCMonth() + 1, day: to.getUTCDate() + 1 },
    timeZone,
  )
  return { start, end, from, to }
}

/** Format the calendar-date placeholders as UTC; applying the school zone here would shift a negative-offset week's dates back a day. */
export function formatWeekRange(bounds: WeekBounds, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).formatRange(
    bounds.from,
    bounds.to,
  )
}

export interface WeekSummary {
  bounds: WeekBounds
  due: number
  waiting: number
  waitingMore: boolean
  /** Some course's data was refused, failed, or incomplete: no zero here claims to be complete. */
  partial: boolean
  next?: { title: string; dueAt: string; course: string }
}

/**
 * Summarise every active course once every one's facts have answered. Draft,
 * archived, paused and removed seats do not invent work for the caller.
 */
export function weekSummary(
  courses: readonly Membership[],
  facts: ReadonlyMap<string, CourseFacts>,
  now: number,
  timeZone: string,
): WeekSummary | null {
  const live = courses.filter((m) => m.course_status === 'active' && m.status === 'active')
  if (!live.length || !live.every((m) => facts.has(m.course_id))) return null
  const bounds = weekBounds(now, timeZone)
  let due = 0
  let waiting = 0
  let waitingMore = false
  let partial = false
  const assignments: {
    id: string
    title: string
    due_at?: string | null
    published_at?: string | null
    course: string
  }[] = []
  for (const m of live) {
    const f = facts.get(m.course_id)!
    if (f.courseRead === false || f.instructorsUnavailable) partial = true
    if (f.assignments) {
      for (const a of f.assignments) {
        const at = a.due_at ? Date.parse(a.due_at) : NaN
        if (a.published_at && Number.isFinite(at) && at > now && at < bounds.end) due++
        assignments.push({ ...a, course: courseCodeText(m.code, m.section) })
      }
    } else partial = true
    if (f.waiting) {
      waiting += f.waiting.n
      waitingMore ||= f.waiting.more
    } else partial = true
  }
  const next = nextDue(assignments, now)
  return {
    bounds,
    due,
    waiting,
    waitingMore,
    partial,
    ...(next ? { next: { title: next.title, dueAt: next.dueAt, course: assignments.find((a) => a.id === next.id)!.course } } : {}),
  }
}
