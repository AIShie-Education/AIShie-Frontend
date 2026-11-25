import { describe, expect, it } from 'vitest'
import type { CourseFacts, Membership } from './courseFacts'
import { formatWeekRange, weekBounds, weekSummary } from './week'

const NOW = Date.parse('2026-10-03T08:00:00Z') // Saturday
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

function course(id: string, extra: Partial<Membership> = {}): Membership {
  return {
    course_id: id,
    member_id: `m-${id}`,
    code: id.toUpperCase(),
    section: id === 'c1' ? 'A' : '',
    title: id,
    role: 'student',
    status: 'active',
    course_status: 'active',
    answers_course: false,
    assignment_scope: 'all',
    student_scope: 'own',
    perms: {},
    perm_ceilings: {},
    ...extra,
  } as Membership
}

function facts(over: Partial<CourseFacts> = {}): CourseFacts {
  return {
    courseRead: true,
    instructors: [],
    assignments: [],
    waiting: { n: 0, more: false, agentsOnly: true },
    ...over,
  }
}

describe('the home page week', () => {
  it('uses Monday–Sunday on the school’s clock, not a UTC week', () => {
    const bounds = weekBounds(NOW, 'Asia/Hong_Kong')
    expect(new Date(bounds.start).toISOString()).toBe('2026-09-27T16:00:00.000Z')
    expect(new Date(bounds.end).toISOString()).toBe('2026-10-04T16:00:00.000Z')
    expect([bounds.from.toISOString().slice(0, 10), bounds.to.toISOString().slice(0, 10)]).toEqual([
      '2026-09-28',
      '2026-10-04',
    ])
  })

  it('formats the placeholder dates in UTC so a negative-offset school keeps Monday–Sunday', () => {
    // The Monday placeholder is 2026-09-28T00:00Z. Formatting it in New York
    // would wrongly show Sunday 27 September; these are calendar placeholders.
    const bounds = weekBounds(Date.parse('2026-09-30T12:00:00Z'), 'America/New_York')
    const range = formatWeekRange(bounds, 'en')
    expect(range).toContain('Sep 28')
    expect(range).toContain('Oct 4')
    expect(range).not.toContain('Sep 27')
    expect(range).not.toContain('Oct 5')
  })

  it('keeps the two week boundaries correct across a daylight-saving change', () => {
    const bounds = weekBounds(Date.parse('2026-10-30T12:00:00Z'), 'America/New_York')
    expect(new Date(bounds.start).toISOString()).toBe('2026-10-26T04:00:00.000Z')
    expect(new Date(bounds.end).toISOString()).toBe('2026-11-02T05:00:00.000Z')
  })

  it('counts published work still due before next Monday and sums waiting lower bounds', () => {
    const courses = [course('c1'), course('c2')]
    const map = new Map<string, CourseFacts>([
      [
        'c1',
        facts({
          instructors: ['Ada Lovelace', 'Grace Hopper'],
          assignments: [
            { id: 'past', title: 'Past', due_at: iso(NOW - DAY), published_at: iso(NOW - 2 * DAY) },
            { id: 'now', title: 'Now', due_at: iso(NOW), published_at: iso(NOW - DAY) },
            { id: 'next', title: 'Lab 3', due_at: iso(NOW + DAY), published_at: iso(NOW - DAY) },
            { id: 'later', title: 'Later', due_at: iso(NOW + 10 * DAY), published_at: iso(NOW - DAY) },
            { id: 'draft', title: 'Draft', due_at: iso(NOW + 2 * DAY), published_at: null },
          ],
          waiting: { n: 2, more: true, agentsOnly: true },
        }),
      ],
      ['c2', facts({ waiting: { n: 1, more: false, agentsOnly: false } })],
    ])
    expect(weekSummary(courses, map, NOW, 'Asia/Hong_Kong')).toMatchObject({
      due: 1,
      waiting: 3,
      waitingMore: true,
      partial: false,
      next: { title: 'Lab 3', dueAt: iso(NOW + DAY), course: 'C1 · A' },
    })
  })

  it('is a truthful empty week only when all current courses have answered', () => {
    expect(weekSummary([course('c1')], new Map([['c1', facts()]]), NOW, 'Asia/Hong_Kong')).toMatchObject({
      due: 0,
      waiting: 0,
      partial: false,
    })
    expect(weekSummary([course('c1')], new Map(), NOW, 'Asia/Hong_Kong')).toBeNull()
  })

  it('marks refused, failed, or incomplete facts partial instead of claiming zero', () => {
    const map = new Map([
      ['c1', facts({ courseRead: false, instructorsUnavailable: true, assignments: undefined, waiting: undefined })],
    ])
    expect(weekSummary([course('c1')], map, NOW, 'Asia/Hong_Kong')).toMatchObject({
      due: 0,
      waiting: 0,
      partial: true,
    })
  })

  it('leaves archived and paused seats out of the summary', () => {
    expect(
      weekSummary(
        [course('c1', { course_status: 'archived' }), course('c2', { status: 'paused' })],
        new Map(),
        NOW,
        'Asia/Hong_Kong',
      ),
    ).toBeNull()
  })
})
