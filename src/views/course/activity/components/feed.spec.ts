import { describe, expect, it } from 'vitest'
import { isTotalEvent, subjectKind, subjectRoute, type CourseEvent } from './feed'

const COURSE = 'c1'
const reach = { readsMembers: true, decides: false }
const ev = (type: string, subject_type: string, over: Partial<CourseEvent> = {}) =>
  ({ seq: 1, type, occurred_at: '2026-09-28T10:00:00Z', subject_type, subject_id: 'g1', ...over }) as CourseEvent

describe('isTotalEvent', () => {
  it('knows every event about one of a student’s totals', () => {
    for (const t of [
      'grade.total_updated',
      'grade.total_overridden',
      'grade.total_override_cleared',
      'grade.total_commented',
    ])
      expect(isTotalEvent(t)).toBe(true)
    expect(isTotalEvent('grade.regraded')).toBe(false)
  })
})

describe('subjectRoute', () => {
  it('opens a total, overridden or commented on, in the student’s gradebook', () => {
    expect(subjectRoute(ev('grade.total_commented', 'grade', { student_member_id: 's1' }), COURSE, reach)).toEqual({
      name: 'course-gradebook',
      params: { courseId: COURSE, studentMemberId: 's1' },
    })
  })
  it('opens final grades undone in the student’s gradebook', () => {
    const e = ev('grade.ungraded_as_zero_undone', 'gradebook', { subject_id: 's2', student_member_id: 's2' })
    expect(subjectKind(e)).toBe('gradebook')
    expect(subjectRoute(e, COURSE, reach)).toEqual({
      name: 'course-gradebook',
      params: { courseId: COURSE, studentMemberId: 's2' },
    })
  })
})
