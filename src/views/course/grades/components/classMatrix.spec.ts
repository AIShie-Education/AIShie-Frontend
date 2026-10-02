import { describe, expect, it } from 'vitest'
import type { AssignmentSummary, Component, GradeSummary, MemberSummary } from '@/api/types'
import {
  buildColumns,
  buildMatrix,
  cellOf,
  csvText,
  filterRows,
  matrixCsv,
  slimGrade,
  sortRows,
  studentsSeen,
  summarise,
  visibleStudents,
  type CsvWords,
  type MatrixColumn,
  type MatrixStudent,
  type SubmissionLite,
} from './classMatrix'

// A scheme as the e2e course has it: the course total, an Assignments bucket
// (HW1, HW2, and HW3 not yet published) and a Midterm graded directly; a
// practice quiz counting toward nothing.
const ROOT: Component = { id: 'root', name: 'Course', weight: 1, drop_lowest: 0, sort_order: 0, parent_id: null }
const HW: Component = { id: 'hw', name: 'Assignments', weight: 60, drop_lowest: 0, sort_order: 1, parent_id: 'root' }
const MID: Component = {
  id: 'mid',
  name: 'Midterm',
  weight: 40,
  drop_lowest: 0,
  sort_order: 2,
  parent_id: 'root',
  points_possible: 100,
}
const PUB = '2026-09-01T00:00:00Z'
const assignment = (id: string, title: string, extra: Partial<AssignmentSummary> = {}): AssignmentSummary => ({
  id,
  title,
  points_possible: 10,
  component_id: 'hw',
  published_at: PUB,
  ...extra,
})
const HW1 = assignment('a1', 'HW1', { due_at: '2026-09-10T00:00:00Z' })
const HW2 = assignment('a2', 'HW2', { due_at: '2026-09-20T00:00:00Z', points_possible: 20 })
const HW3 = assignment('a3', 'HW3', { published_at: null })
const QUIZ = assignment('q', 'Practice quiz', { component_id: null })

const member = (id: string, name: string, extra: Partial<MemberSummary> = {}): MemberSummary =>
  ({
    id,
    actor_id: `actor-${id}`,
    display_name: name,
    kind: 'human',
    role: 'student',
    status: 'active',
    student_scope: 'self',
    assignment_scope: 'all',
    perms: {},
    created_at: PUB,
    answers_course: false,
    ...extra,
  }) as MemberSummary

let seq = 0
function grade(g: Partial<GradeSummary> & Pick<GradeSummary, 'student_member_id' | 'score'>): GradeSummary {
  seq++
  return {
    id: `g${seq}`,
    origin: 'entered',
    grader_member_id: 'ta',
    created_by_action_id: `act${seq}`,
    state: 'posted',
    created_at: `2026-09-${String(10 + seq).padStart(2, '0')}T00:00:00Z`,
    ...g,
  } as GradeSummary
}

const cols = (spans = true) => buildColumns([ROOT, MID, HW], [QUIZ, HW2, HW3, HW1], { spansAssignments: spans })
const keys = (c: MatrixColumn[]) => c.map((x) => x.key)
const students: MatrixStudent[] = [
  { id: 'yuki', name: 'Yuki Tanaka', loginId: 's1001', status: 'active' },
  { id: 'ken', name: 'Ken Wong', loginId: 's1002', status: 'active' },
  { id: 'mei', name: 'Mei Chan', loginId: 's1003', status: 'active' },
]

describe('buildColumns', () => {
  it('puts the course total first, then the scheme in order, a bucket’s total after its work, practice last', () => {
    const c = cols()
    expect(keys(c)).toEqual(['t:root', 'a:a1', 'a:a2', 't:hw', 'c:mid', 'a:q'])
    expect(c[0]).toMatchObject({ kind: 'total', isRoot: true, title: null, outOf: null })
    expect(c[1]).toMatchObject({ kind: 'assignment', group: 'Assignments', outOf: 10, counted: true })
    expect(c[4]).toMatchObject({ kind: 'direct', title: 'Midterm', outOf: 100, group: null })
    expect(c[5]).toMatchObject({ counted: false, group: null })
  })

  it('leaves out what is not published: nothing can be handed in or graded for it', () => {
    expect(keys(cols())).not.toContain('a:a3')
  })

  it('gives a seat listed to some assignments those alone: no component’s grade or total is in its scope', () => {
    expect(keys(cols(false))).toEqual(['a:a1', 'a:a2', 'a:q'])
  })

  it('without a scheme to read, still lists the assignments', () => {
    const c = buildColumns([], [HW1, HW2], { spansAssignments: true })
    expect(keys(c)).toEqual(['a:a1', 'a:a2'])
    expect(c.every((x) => !x.counted)).toBe(true)
  })

  it('orders sub-components by sort order, each total after its own work', () => {
    const labs: Component = { id: 'labs', name: 'Labs', weight: 1, drop_lowest: 0, sort_order: 0, parent_id: 'hw' }
    const lab1 = assignment('l1', 'Lab 1', { component_id: 'labs' })
    const c = buildColumns([ROOT, HW, labs, MID], [HW1, lab1], { spansAssignments: true })
    expect(keys(c)).toEqual(['t:root', 'a:a1', 'a:l1', 't:labs', 't:hw', 'c:mid'])
    expect(c.find((x) => x.key === 'a:l1')?.group).toBe('Labs')
    expect(c.find((x) => x.key === 't:labs')?.group).toBe('Assignments')
  })
})

describe('buildMatrix', () => {
  const subs: SubmissionLite[] = [
    { id: 's-yuki-1', assignment_id: 'a1', student_member_id: 'yuki', attempt: 1, state: 'submitted' },
    { id: 's-yuki-2', assignment_id: 'a1', student_member_id: 'yuki', attempt: 2, state: 'submitted' },
    { id: 's-ken-1', assignment_id: 'a1', student_member_id: 'ken', attempt: 1, state: 'late' },
    { id: 's-mei-1', assignment_id: 'a1', student_member_id: 'mei', attempt: 1, state: 'missing' },
    { id: 's-mei-2', assignment_id: 'a2', student_member_id: 'mei', attempt: 1, state: 'submitted' },
  ]
  function matrix(grades: GradeSummary[], submissions: SubmissionLite[] | null = subs) {
    const columns = cols()
    const rows = buildMatrix({ students, columns, grades, submissions })
    const at = (student: string, key: string) =>
      cellOf(
        rows.find((r) => r.student.id === student)!,
        columns.find((c) => c.key === key)!,
      )
    return { rows, at }
  }

  it('counts the posted grade on the highest attempt that has one, as Core does, whatever was graded last', () => {
    const { at } = matrix([
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-2', score: 6 }),
      // Graded later, but on the first attempt.
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 9 }),
    ])
    expect(at('yuki', 'a:a1')).toMatchObject({ state: 'posted', score: 6, value: 6 })
  })

  it('shows a draft newer than the posted grade as a draft, with the posted score it would replace', () => {
    const posted = grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 5 })
    const draft = grade({
      student_member_id: 'yuki',
      assignment_id: 'a1',
      submission_id: 's-yuki-2',
      score: 8,
      state: 'draft',
    })
    const { at, rows } = matrix([posted, draft])
    expect(at('yuki', 'a:a1')).toMatchObject({ state: 'draft', score: 8, postedScore: 5, gradeId: draft.id })
    expect(rows[0].drafts).toBe(1)
  })

  it('keeps the posted grade where a draft is on an earlier attempt', () => {
    const { at } = matrix([
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-2', score: 7 }),
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 3, state: 'draft' }),
    ])
    expect(at('yuki', 'a:a1')).toMatchObject({ state: 'posted', score: 7 })
  })

  it('never shows a superseded grade', () => {
    const { at } = matrix([
      grade({ student_member_id: 'ken', assignment_id: 'a1', submission_id: 's-ken-1', score: 2, state: 'superseded' }),
    ])
    expect(at('ken', 'a:a1').state).toBe('submitted')
  })

  it('tells work recorded missing from work waiting to be graded and from nothing at all', () => {
    const { at, rows } = matrix([])
    expect(at('mei', 'a:a1').state).toBe('missing')
    expect(at('ken', 'a:a1').state).toBe('submitted')
    expect(at('mei', 'a:a2').state).toBe('submitted')
    expect(at('ken', 'a:a2').state).toBe('none')
    const mei = rows.find((r) => r.student.id === 'mei')!
    expect([mei.missing, mei.toGrade, mei.drafts]).toEqual([1, 1, 0])
  })

  it('says work handed in after a posted grade waits to be graded, beside the grade that counts', () => {
    // A resubmission: attempt 1 graded 6 and posted, attempt 2 handed in.
    const { at, rows } = matrix([
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 6 }),
    ])
    expect(at('yuki', 'a:a1')).toMatchObject({ state: 'posted', score: 6, waiting: true })
    expect(rows.find((r) => r.student.id === 'yuki')!.toGrade).toBe(1)
    expect(filterRows(rows, '', 'toGrade').map((r) => r.student.id)).toContain('yuki')
  })

  it('says late work after a graded missing row waits to be graded, the missing row keeping its zero', () => {
    const { at, rows } = matrix(
      [grade({ student_member_id: 'mei', assignment_id: 'a1', submission_id: 's-mei-1', score: 0 })],
      [
        ...subs,
        // Core makes the work a new attempt, the missing row keeping its grade.
        { id: 's-mei-1b', assignment_id: 'a1', student_member_id: 'mei', attempt: 2, state: 'late' },
      ],
    )
    expect(at('mei', 'a:a1')).toMatchObject({ state: 'posted', score: 0, waiting: true })
    const mei = rows.find((r) => r.student.id === 'mei')!
    // HW1 behind its zero, HW2 handed in and not graded.
    expect([mei.missing, mei.toGrade]).toEqual([0, 2])
  })

  it('says nothing waits where the newest attempt handed in is the one graded, in whichever order it was graded', () => {
    const { at, rows } = matrix([
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-2', score: 8 }),
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 5 }),
    ])
    expect(at('yuki', 'a:a1')).toMatchObject({ state: 'posted', score: 8 })
    expect(at('yuki', 'a:a1').waiting).toBeUndefined()
    expect(rows.find((r) => r.student.id === 'yuki')!.toGrade).toBe(0)
  })

  it('counts a draft on the newest attempt as the grading of it, and work newer than a draft as waiting', () => {
    const graded = matrix([
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 5 }),
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-2', score: 7, state: 'draft' }),
    ])
    expect(graded.at('yuki', 'a:a1')).toMatchObject({ state: 'draft', score: 7 })
    expect(graded.at('yuki', 'a:a1').waiting).toBeUndefined()
    const behind = matrix([
      grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 7, state: 'draft' }),
    ])
    expect(behind.at('yuki', 'a:a1')).toMatchObject({ state: 'draft', score: 7, waiting: true })
    expect(behind.rows.find((r) => r.student.id === 'yuki')).toMatchObject({ drafts: 1, toGrade: 1 })
  })

  it('looks past a draft attempt opened after work was handed in', () => {
    const withDraft: SubmissionLite[] = [
      ...subs,
      { id: 's-ken-2', assignment_id: 'a1', student_member_id: 'ken', attempt: 2, state: 'draft' },
      { id: 's-yuki-3', assignment_id: 'a1', student_member_id: 'yuki', attempt: 3, state: 'draft' },
    ]
    // Nothing graded: attempt 1 is handed in, whatever attempt 2 is.
    const none = matrix([], withDraft)
    expect(none.at('ken', 'a:a1').state).toBe('submitted')
    expect(none.rows.find((r) => r.student.id === 'ken')!.toGrade).toBe(1)
    // Attempt 1 graded, attempt 2 handed in, attempt 3 a draft: attempt 2 waits.
    const graded = matrix(
      [grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 6 })],
      withDraft,
    )
    expect(graded.at('yuki', 'a:a1')).toMatchObject({ state: 'posted', score: 6, waiting: true })
    // Ken's attempt 1 graded, attempt 2 a draft: nothing waits.
    const kenGraded = matrix(
      [grade({ student_member_id: 'ken', assignment_id: 'a1', submission_id: 's-ken-1', score: 4 })],
      withDraft,
    )
    expect(kenGraded.at('ken', 'a:a1').waiting).toBeUndefined()
  })

  it('without submissions to read, a cell without a grade is none', () => {
    const { at } = matrix([], null)
    expect(at('mei', 'a:a1').state).toBe('none')
  })

  it('takes a directly graded component’s entered grade, draft or posted', () => {
    const { at } = matrix([
      grade({ student_member_id: 'mei', component_id: 'mid', score: 78, state: 'draft' }),
      grade({ student_member_id: 'yuki', component_id: 'mid', score: 91 }),
    ])
    expect(at('mei', 'c:mid')).toMatchObject({ state: 'draft', score: 78 })
    expect(at('yuki', 'c:mid')).toMatchObject({ state: 'posted', score: 91 })
  })

  it('gives totals as written down at posting, an override in place of the figure worked out', () => {
    const { at } = matrix([
      grade({ student_member_id: 'yuki', component_id: 'root', origin: 'computed', score: '87.5', posted_at: PUB }),
      grade({
        student_member_id: 'ken',
        component_id: 'root',
        origin: 'computed',
        score: 40,
        posted_at: PUB,
        override: { score: 55, at: PUB },
      }),
      grade({
        student_member_id: 'mei',
        component_id: 'hw',
        origin: 'computed',
        score: 0,
        no_total: true,
        posted_at: PUB,
      }),
    ])
    expect(at('yuki', 't:root')).toMatchObject({ state: 'posted', score: '87.5', value: 87.5, overridden: false })
    expect(at('ken', 't:root')).toMatchObject({ score: 55, value: 55, overridden: true })
    // Written with nothing beneath it: no total at all, not 0%.
    expect(at('mei', 't:hw').state).toBe('none')
  })

  it('grows with the class, not its square: 300 students × 30 assignments cost about four times 75', () => {
    function input(n: number) {
      const as = Array.from({ length: 30 }, (_, i) => assignment(`a${i}`, `HW${i}`))
      const ss = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `S${i}`, loginId: null, status: 'active' }))
      const gs: GradeSummary[] = []
      const sub: SubmissionLite[] = []
      for (const s of ss)
        for (const a of as) {
          sub.push({
            id: `${s.id}${a.id}`,
            assignment_id: a.id,
            student_member_id: s.id,
            attempt: 1,
            state: 'submitted',
          })
          gs.push(grade({ student_member_id: s.id, assignment_id: a.id, submission_id: `${s.id}${a.id}`, score: 7 }))
        }
      const columns = buildColumns([ROOT, HW], as, { spansAssignments: true })
      return { students: ss, columns, grades: gs, submissions: sub }
    }
    const small = input(75)
    const large = input(300)
    expect(buildMatrix(large)).toHaveLength(300)
    // About 4 where the work grows with the class, 16 with its square; the middle of three rounds.
    expect(
      growth(
        () => buildMatrix(small),
        () => buildMatrix(large),
      ),
    ).toBeLessThan(8)
  })
})

// The tests run in Node, whose process this is (the app's types leave Node's out).
type CpuUsage = { user: number; system: number }
const node = (globalThis as unknown as { process: { threadCpuUsage?: () => CpuUsage; cpuUsage: () => CpuUsage } })
  .process
/** The CPU time this thread has spent, in ms: unlike the wall clock, it stands still while other work has the CPU. */
function cpuTime(): number {
  const used = node.threadCpuUsage?.() ?? node.cpuUsage()
  return (used.user + used.system) / 1000
}
/** How many times more CPU time large takes than small, as src/utils/markdown.spec.ts measures it. */
function growth(small: () => unknown, large: () => unknown): number {
  const ratios: number[] = []
  for (let round = 0; round < 3; round++) {
    const [s, l] = [small, large].map((f) => {
      const started = cpuTime()
      // Each a few times over, so that a run is long enough to measure.
      for (let i = 0; i < 4; i++) f()
      return cpuTime() - started
    })
    ratios.push(l! / Math.max(s!, 0.001))
  }
  return ratios.sort((a, b) => a - b)[1]!
}

describe('slimGrade', () => {
  it('keeps what the matrix needs of a live grade, and nothing of a superseded one', () => {
    const g = grade({
      student_member_id: 'yuki',
      component_id: 'root',
      origin: 'computed',
      score: 80,
      posted_at: PUB,
      feedback: 'Long feedback',
      breakdown: { lines: [1, 2, 3] },
      override: { score: 85, at: PUB, reason: 'Make-up exam' },
    } as Partial<GradeSummary> & Pick<GradeSummary, 'student_member_id' | 'score'>)
    const kept = slimGrade(g)!
    expect(kept).not.toHaveProperty('feedback')
    expect(kept).not.toHaveProperty('breakdown')
    expect(kept.override).toEqual({ score: 85 })
    expect(slimGrade({ ...g, state: 'superseded' })).toBeNull()
    expect(slimGrade({ ...g, superseded_by: 'g-next' })).toBeNull()
  })
})

describe('who is a row', () => {
  const members = [
    member('yuki', 'Yuki Tanaka', { login_id: 's1001' }),
    member('ken', 'Ken Wong'),
    member('gone', 'Gone Student', { status: 'removed' }),
    member('ta', 'Lee Ka Man', { role: 'ta' }),
    member('mei', 'Mei Chan', { status: 'paused' }),
  ]
  const ids = (s: MatrixStudent[]) => s.map((x) => x.id)

  it('is every student of the course, paused included, removed only when asked for', () => {
    expect(ids(visibleStudents(members, { student_scope: 'all' }))).toEqual(['yuki', 'ken', 'mei'])
    expect(ids(visibleStudents(members, { student_scope: 'all' }, { includeRemoved: true }))).toEqual([
      'yuki',
      'ken',
      'gone',
      'mei',
    ])
    expect(visibleStudents(members, null)[0]).toEqual({
      id: 'yuki',
      name: 'Yuki Tanaka',
      loginId: 's1001',
      status: 'active',
    })
  })

  it('is, for a seat listed to some students, those alone', () => {
    expect(ids(visibleStudents(members, { student_scope: 'listed', listed_students: ['ken'] }))).toEqual(['ken'])
  })

  it('is, for a listed seat whose list is not known, the students Core showed it work or grades of', () => {
    const seen = new Set(studentsSeen([grade({ student_member_id: 'mei', score: 1 })], null))
    expect(ids(visibleStudents(members, { student_scope: 'listed' }, { seen }))).toEqual(['mei'])
  })

  it('is, for a seat that sees only its own, itself', () => {
    expect(ids(visibleStudents(members, { student_scope: 'self', member_id: 'ken' }))).toEqual(['ken'])
  })
})

describe('filtering and sorting', () => {
  const columns = cols()
  const rows = buildMatrix({
    students,
    columns,
    grades: [
      grade({ student_member_id: 'yuki', assignment_id: 'a1', score: 9 }),
      grade({ student_member_id: 'ken', assignment_id: 'a1', score: 4, state: 'draft' }),
      grade({ student_member_id: 'yuki', component_id: 'root', origin: 'computed', score: 90, posted_at: PUB }),
      grade({ student_member_id: 'mei', component_id: 'root', origin: 'computed', score: 70, posted_at: PUB }),
    ],
    submissions: [{ id: 's', assignment_id: 'a2', student_member_id: 'mei', attempt: 1, state: 'missing' }],
  })
  const names = (rs: { student: MatrixStudent }[]) => rs.map((r) => r.student.name)
  const nameOf = (s: MatrixStudent) => s.name ?? s.id

  it('finds a student by name or login ID, in any case and width', () => {
    expect(names(filterRows(rows, 'KEN'))).toEqual(['Ken Wong'])
    expect(names(filterRows(rows, 's1003'))).toEqual(['Mei Chan'])
    expect(names(filterRows(rows, 'ｙｕｋｉ'))).toEqual(['Yuki Tanaka'])
    expect(filterRows(rows, '  ')).toHaveLength(3)
  })

  it('finds a named student by member ID only where the whole of it, or its short form, is typed', () => {
    const ID = '01a0d79f-1111-70da-a7cc-a4d5ab6d027c'
    const byId = buildMatrix({
      students: [
        { id: ID, name: 'Ken Wong', loginId: null, status: 'active' },
        { id: '01a0d79f-2222-70da-a7cc-f009b1efe423', name: null, loginId: null, status: 'unknown' },
      ],
      columns,
      grades: [],
    })
    const found = (q: string) => filterRows(byId, q).map((r) => r.student.id)
    // Every ID of a class begins alike; a part of one is no search.
    expect(found('01')).toEqual([])
    expect(found('01a0d79f')).toEqual([])
    expect(found('c')).toEqual([])
    expect(found(ID)).toEqual([ID])
    expect(found(ID.replace(/-/g, ''))).toEqual([ID])
    expect(found('027c')).toEqual([])
    expect(found('ab6d027c')).toEqual([ID])
    // A student with no name to show ("Student b1efe423") is found by a part
    // of what is shown in its place, or by the whole of their ID.
    expect(found('b1ef')).toEqual(['01a0d79f-2222-70da-a7cc-f009b1efe423'])
    expect(found('b1efe423')).toEqual(['01a0d79f-2222-70da-a7cc-f009b1efe423'])
    expect(found('01a0d79f-2222-70da-a7cc-f009b1efe423')).toEqual(['01a0d79f-2222-70da-a7cc-f009b1efe423'])
  })

  it('keeps those with drafts, missing work or work to grade', () => {
    expect(names(filterRows(rows, '', 'drafts'))).toEqual(['Ken Wong'])
    expect(names(filterRows(rows, '', 'missing'))).toEqual(['Mei Chan'])
    expect(filterRows(rows, '', 'toGrade')).toEqual([])
  })

  it('sorts by a column either way, those with nothing for it last', () => {
    expect(names(sortRows(rows, { key: 't:root', dir: 'desc' }, nameOf))).toEqual([
      'Yuki Tanaka',
      'Mei Chan',
      'Ken Wong',
    ])
    expect(names(sortRows(rows, { key: 't:root', dir: 'asc' }, nameOf))).toEqual([
      'Mei Chan',
      'Yuki Tanaka',
      'Ken Wong',
    ])
    expect(names(sortRows(rows, { key: 'a:a1', dir: 'asc' }, nameOf))).toEqual(['Ken Wong', 'Yuki Tanaka', 'Mei Chan'])
  })

  it('sorts by name and by login ID, numbers in order', () => {
    expect(names(sortRows(rows, { key: 'name', dir: 'asc' }, nameOf))).toEqual(['Ken Wong', 'Mei Chan', 'Yuki Tanaka'])
    expect(names(sortRows(rows, { key: 'loginId', dir: 'desc' }, nameOf))).toEqual([
      'Mei Chan',
      'Ken Wong',
      'Yuki Tanaka',
    ])
  })

  it('averages what is posted alone, and counts the drafts beside it', () => {
    const s = summarise(rows, columns)
    expect(s.get('t:root')).toEqual({ mean: 80, posted: 2, drafts: 0 })
    expect(s.get('a:a1')).toEqual({ mean: 9, posted: 1, drafts: 1 })
    expect(s.get('c:mid')).toEqual({ mean: null, posted: 0, drafts: 0 })
  })

  it('still averages a posted grade with a newer draft over it, and counts the draft too', () => {
    const over = buildMatrix({
      students,
      columns,
      grades: [
        grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-1', score: 6 }),
        grade({ student_member_id: 'yuki', assignment_id: 'a1', submission_id: 's-yuki-2', score: 8, state: 'draft' }),
        grade({ student_member_id: 'ken', assignment_id: 'a1', score: 9 }),
        // A draft with nothing posted under it: counted as a draft alone.
        grade({ student_member_id: 'mei', assignment_id: 'a1', score: 2, state: 'draft' }),
      ],
      submissions: [
        { id: 's-yuki-1', assignment_id: 'a1', student_member_id: 'yuki', attempt: 1, state: 'submitted' },
        { id: 's-yuki-2', assignment_id: 'a1', student_member_id: 'yuki', attempt: 2, state: 'submitted' },
      ],
    })
    expect(over.find((r) => r.student.id === 'yuki')!.cells['a:a1']).toMatchObject({ state: 'draft', postedScore: 6 })
    expect(summarise(over, columns).get('a:a1')).toEqual({ mean: 7.5, posted: 2, drafts: 2 })
  })

  it('leaves removed students, shown when asked for, out of the averages', () => {
    const withRemoved = rows.map((r) =>
      r.student.id === 'mei' ? { ...r, student: { ...r.student, status: 'removed' } } : r,
    )
    expect(summarise(withRemoved, columns).get('t:root')).toEqual({ mean: 90, posted: 1, drafts: 0 })
  })
})

describe('CSV', () => {
  const words: CsvWords = {
    student: 'Student',
    loginId: 'Login ID',
    memberId: 'Member ID',
    status: 'Status',
    statusOf: (s) => (s.status === 'removed' ? 'Removed' : ''),
    column: (c) => (c.isRoot ? 'Course total (%)' : `${c.title} (${c.outOf ?? '%'})`),
    draft: (s) => `${s} (draft)`,
    overridden: (s) => `${s} (overridden)`,
    waiting: (s) => `${s} (newer work to grade)`,
    missing: 'Missing',
    toGrade: 'To grade',
    unnamed: (s) => `Student ${s.id}`,
  }

  it('is UTF-8 with a byte-order mark and CRLF lines, drafts, overrides, missing and waiting work marked', () => {
    const columns = buildColumns([ROOT, HW], [HW1], { spansAssignments: true })
    const rows = buildMatrix({
      students: [
        { id: 'm1', name: '陳大文', loginId: '20261234', status: 'active' },
        { id: 'm2', name: 'Ken "KW" Wong, Jr', loginId: null, status: 'active' },
        { id: 'm3', name: null, loginId: null, status: 'unknown' },
        { id: 'm4', name: 'Ada', loginId: null, status: 'removed' },
      ],
      columns,
      grades: [
        grade({ student_member_id: 'm1', assignment_id: 'a1', score: '9.125' }),
        grade({ student_member_id: 'm1', component_id: 'root', origin: 'computed', score: '91.25', posted_at: PUB }),
        grade({ student_member_id: 'm2', assignment_id: 'a1', score: 7, state: 'draft' }),
        grade({ student_member_id: 'm4', assignment_id: 'a1', submission_id: 's4', score: 6 }),
        grade({
          student_member_id: 'm4',
          component_id: 'root',
          origin: 'computed',
          score: 60,
          posted_at: PUB,
          override: { score: 95, at: PUB },
        }),
      ],
      submissions: [
        { id: 's', assignment_id: 'a1', student_member_id: 'm3', attempt: 1, state: 'missing' },
        { id: 's4', assignment_id: 'a1', student_member_id: 'm4', attempt: 1, state: 'submitted' },
        { id: 's4b', assignment_id: 'a1', student_member_id: 'm4', attempt: 2, state: 'submitted' },
      ],
    })
    const csv = matrixCsv(columns, rows, words)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Student,Login ID,Member ID,Status,Course total (%),HW1 (10),Assignments (%)',
      '陳大文,20261234,m1,,91.25,9.125,',
      '"Ken ""KW"" Wong, Jr",,m2,,,7 (draft),',
      'Student m3,,m3,,,Missing,',
      'Ada,,m4,Removed,95 (overridden),6 (newer work to grade),',
      '',
    ])
  })

  it('never lets a name run as a formula', () => {
    expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvText('+1')).toBe("'+1")
    expect(csvText('@me')).toBe("'@me")
    expect(csvText('Plain')).toBe('Plain')
  })
})
