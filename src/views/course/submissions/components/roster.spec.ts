import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/http'
import {
  countByState,
  forStudent,
  lacksRoster,
  mayMarkMissing,
  needsMoreFor,
  proposalKey,
  rememberProposal,
  rosterName,
  rosterView,
  showsSeatStatus,
  wasProposed,
  type MarkContext,
  type RosterEntry,
} from './roster'

const err = (status: number, code: string, message = code) => new ApiError({ status, code, message })

function row(id: string, state: string, extra: Partial<RosterEntry> = {}): RosterEntry {
  return { student_member_id: id, display_name: `Student ${id}`, member_status: 'active', state, ...extra }
}

describe('lacksRoster', () => {
  it('takes a missing route, 405 and method_not_allowed for a Core without the tool', () => {
    expect(lacksRoster(err(404, 'not_found', 'no such route; GET /v1/tools lists what there is'))).toBe(true)
    expect(lacksRoster(err(404, 'unknown', 'HTTP 404'))).toBe(true)
    expect(lacksRoster(err(405, 'method_not_allowed'))).toBe(true)
    expect(lacksRoster(err(400, 'method_not_allowed'))).toBe(true)
  })
  it('does not take the tool’s own answers, or anything that is not an ApiError', () => {
    expect(lacksRoster(err(404, 'not_found', 'no such assignment in this course'))).toBe(false)
    expect(lacksRoster(err(403, 'forbidden'))).toBe(false)
    expect(lacksRoster(err(0, 'network'))).toBe(false)
    expect(lacksRoster(err(500, 'internal'))).toBe(false)
    expect(lacksRoster(new Error('HTTP 405'))).toBe(false)
    expect(lacksRoster(null)).toBe(false)
  })
})

describe('countByState', () => {
  it('counts each state in the order work moves through them, leaving out the empty ones', () => {
    const rows = [
      row('a', 'submitted'),
      row('b', 'not_started'),
      row('c', 'missing'),
      row('d', 'not_started'),
      row('e', 'submitted'),
      row('f', 'submitted'),
    ]
    expect(countByState(rows)).toEqual({
      total: 6,
      counts: [
        { state: 'not_started', count: 2 },
        { state: 'submitted', count: 3 },
        { state: 'missing', count: 1 },
      ],
    })
  })
  it('keeps a state it does not know, after the known ones', () => {
    expect(countByState([row('a', 'excused'), row('b', 'late'), row('c', 'excused')]).counts).toEqual([
      { state: 'late', count: 1 },
      { state: 'excused', count: 2 },
    ])
  })
  it('counts nobody in an empty roster', () => {
    expect(countByState([])).toEqual({ total: 0, counts: [] })
  })
})

describe('forStudent', () => {
  const rows = [row('a', 'draft'), row('b', 'not_started'), row('c', 'late')]
  it('keeps only the student the page is filtered to', () => {
    expect(forStudent(rows, 'b').map((r) => r.student_member_id)).toEqual(['b'])
  })
  it('keeps everyone without a filter, as a copy', () => {
    const all = forStudent(rows, undefined)
    expect(all).toEqual(rows)
    expect(all).not.toBe(rows)
    expect(forStudent(rows, '')).toHaveLength(3)
    expect(forStudent(rows, null)).toHaveLength(3)
  })
  it('finds nobody for a student not on the roster', () => {
    expect(forStudent(rows, 'z')).toEqual([])
  })
})

describe('rosterView', () => {
  const rows = [row('a', 'draft'), row('b', 'not_started'), row('c', 'draft'), row('d', 'submitted')]
  const ids = (v: { visible: RosterEntry[] }) => v.visible.map((r) => r.student_member_id)

  it('counts every row by state, and shows those of the state chosen, or all', () => {
    const all = rosterView(rows, undefined, '')
    expect(all.summary).toEqual({
      total: 4,
      counts: [
        { state: 'not_started', count: 1 },
        { state: 'draft', count: 2 },
        { state: 'submitted', count: 1 },
      ],
    })
    expect(ids(all)).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(rosterView(rows, undefined, 'draft'))).toEqual(['a', 'c'])
  })

  it('each count holds the rows it says: none counts a student the rows do not show', () => {
    for (const { state, count } of rosterView(rows, undefined, '').summary!.counts)
      expect(rosterView(rows, undefined, state).visible, state).toHaveLength(count)
  })

  it('with one student chosen has nothing to filter: no counts, and that student, whatever state was chosen', () => {
    // Counted from every row, the chips read 'All 4 · Not started 1 · Draft 2' over a's one row, and
    // Not started 1 then showed nobody.
    expect(rosterView(rows, 'a', '')).toEqual({ summary: null, visible: [rows[0]] })
    expect(rosterView(rows, 'a', 'not_started')).toEqual({ summary: null, visible: [rows[0]] })
    expect(rosterView(rows, 'z', '')).toEqual({ summary: null, visible: [] })
  })
})

describe('needsMoreFor', () => {
  const rows = [row('a', 'draft'), row('b', 'not_started')]
  it('asks for more while the filtered student is not loaded and there is more', () => {
    expect(needsMoreFor(rows, 'z', true)).toBe(true)
  })
  it('stops once they are found, when the roster is all loaded, or without a filter', () => {
    expect(needsMoreFor(rows, 'b', true)).toBe(false)
    expect(needsMoreFor(rows, 'z', false)).toBe(false)
    expect(needsMoreFor(rows, undefined, true)).toBe(false)
  })
})

describe('mayMarkMissing', () => {
  const ok: MarkContext = { canGrade: true, writable: true, published: true }
  it('offers it for a student who has not started', () => {
    expect(mayMarkMissing(row('a', 'not_started'), ok)).toBe(true)
    expect(mayMarkMissing(row('a', 'not_started', { member_status: 'paused' }), ok)).toBe(true)
  })
  it('never for someone who has a submission of any kind', () => {
    for (const state of ['draft', 'submitted', 'late', 'missing']) {
      expect(mayMarkMissing(row('a', state), ok)).toBe(false)
    }
  })
  it('not without grading, in an archived course, or for an unpublished assignment', () => {
    const r = row('a', 'not_started')
    expect(mayMarkMissing(r, { ...ok, canGrade: false })).toBe(false)
    expect(mayMarkMissing(r, { ...ok, writable: false })).toBe(false)
    expect(mayMarkMissing(r, { ...ok, published: false })).toBe(false)
  })
  it('leaves an assignment whose publication is unknown to Core', () => {
    expect(mayMarkMissing(row('a', 'not_started'), { ...ok, published: null })).toBe(true)
  })
  it('not again while a proposal made here waits for approval', () => {
    expect(mayMarkMissing(row('a', 'not_started'), { ...ok, proposed: true })).toBe(false)
  })
})

describe('rosterName', () => {
  const none = () => null
  it('takes the name Core gives', () => {
    expect(rosterName(row('a', 'draft'), () => 'Someone else')).toBe('Student a')
  })
  it('falls back to what the page knows of the member, when Core gives no name', () => {
    const r = row('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', 'not_started', { display_name: undefined })
    expect(rosterName(r, (id) => (id === r.student_member_id ? 'Ken Wong' : null))).toBe('Ken Wong')
  })
  it('then to the end of their id, never to nothing', () => {
    const r = row('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', 'not_started', { display_name: undefined })
    expect(rosterName(r, none)).toBe('2e3f4a5b')
    expect(rosterName({ ...r, display_name: '' }, none)).toBe('2e3f4a5b')
    expect(rosterName({ ...r, display_name: null }, () => undefined)).toBe('2e3f4a5b')
  })
})

describe('showsSeatStatus', () => {
  it('tags a student whose seat is not active', () => {
    expect(showsSeatStatus(row('a', 'draft', { member_status: 'paused' }))).toBe(true)
  })
  it('not an active one, nor one whose status Core did not give', () => {
    expect(showsSeatStatus(row('a', 'draft'))).toBe(false)
    expect(showsSeatStatus(row('a', 'draft', { member_status: undefined }))).toBe(false)
    expect(showsSeatStatus(row('a', 'draft', { member_status: null }))).toBe(false)
    expect(showsSeatStatus(row('a', 'draft', { member_status: '' }))).toBe(false)
  })
})

describe('proposalKey', () => {
  it('tells the same student on different assignments, and in different courses, apart', () => {
    expect(proposalKey('c1', 'hw1', 'a')).not.toBe(proposalKey('c1', 'hw2', 'a'))
    expect(proposalKey('c1', 'hw1', 'a')).not.toBe(proposalKey('c2', 'hw1', 'a'))
    expect(proposalKey('c1', 'hw1', 'a')).toBe(proposalKey('c1', 'hw1', 'a'))
  })
})

describe('rememberProposal', () => {
  it('remembers a proposal for that student on that assignment only', () => {
    const key = proposalKey('c9', 'hw1', 'a')
    expect(wasProposed(key)).toBe(false)
    rememberProposal(key)
    expect(wasProposed(key)).toBe(true)
    expect(wasProposed(proposalKey('c9', 'hw1', 'b'))).toBe(false)
    expect(wasProposed(proposalKey('c9', 'hw2', 'a'))).toBe(false)
  })
})
