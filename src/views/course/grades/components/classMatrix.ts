// The whole class's gradebook as a matrix: the students the seat may see as
// rows, the published assignments it may see (and the scheme's directly
// graded components and totals, for a seat that spans every assignment) as
// columns. Everything here is worked out from what Core already gives the
// seat (grade.list, submission.list, assignment.list, component.tree and the
// member list); nothing is computed that Core computes: a total is the one
// written down at posting (an `origin: computed` grade), the number the
// student was shown, with a person's override counted in its place.
//
// Pure functions, so that the matrix of a class of hundreds is built once
// per answer and filtered, sorted and exported without asking Core again.
import type { AssignmentSummary, Component, Decimal, GradeSummary, MemberSummary } from '@/api/types'
import { plainDecimal } from './grading'

/** What a submission says of where a student stands on an assignment. */
export interface SubmissionLite {
  id: string
  assignment_id: string
  student_member_id: string
  attempt: number
  state: string
}

export interface MatrixStudent {
  id: string
  /** null where the member list cannot be read: the caller names them by id. */
  name: string | null
  loginId: string | null
  /** active, paused or removed; unknown where the member list cannot be read. */
  status: string
}

/**
 * assignment: an assignment's grades; direct: a component graded directly
 * (an exam); total: a rolled-up component's total, the course total at the
 * root.
 */
export type ColumnKind = 'assignment' | 'direct' | 'total'

export interface MatrixColumn {
  key: string
  kind: ColumnKind
  id: string
  /** The assignment's title or the component's name; null for the course total, which the page names. */
  title: string | null
  /** The component it counts toward, where that is not the course total itself. */
  group: string | null
  /** Points it is out of; null for a total, which is a percentage. */
  outOf: Decimal | null
  isRoot: boolean
  /** False for practice work, which counts toward nothing. */
  counted: boolean
}

/**
 * posted: a posted grade counts; draft: a grade not posted yet (only those
 * who grade see one), newer than any posted; missing: recorded as handed in
 * nothing; submitted: handed in, not graded yet; none: nothing at all.
 */
export type CellState = 'posted' | 'draft' | 'missing' | 'submitted' | 'none'

export interface MatrixCell {
  state: CellState
  /** The score shown: the posted one, or the draft's; a total's percentage, its override where there is one. */
  score: Decimal | null
  /** The grade shown, to open. */
  gradeId: string | null
  /** For a draft, the posted score it would replace. */
  postedScore?: Decimal | null
  /** For a total, a person's override counts in place of what was worked out. */
  overridden?: boolean
  /** What sorting goes by: the score, or the percentage. */
  value: number | null
}

export interface MatrixRow {
  student: MatrixStudent
  /** By column key; a column with nothing for the student is left out (state none). */
  cells: Record<string, MatrixCell>
  /** How many cells are drafts, missing or waiting to be graded, for filtering. */
  drafts: number
  missing: number
  toGrade: number
}

export const NO_CELL: MatrixCell = Object.freeze({ state: 'none', score: null, gradeId: null, value: null })

export function cellOf(row: MatrixRow, col: MatrixColumn): MatrixCell {
  return row.cells[col.key] ?? NO_CELL
}

// ---------------------------------------------------------------------------
// Who: the rows
// ---------------------------------------------------------------------------

/** The part of the caller's seat that says which students it reaches. */
export interface SeatScope {
  member_id?: string | null
  student_scope?: string | null
  /** Known where the seat itself could be read (member.get). */
  listed_students?: string[] | null
}

/**
 * The students the seat may see, from the member list: those whose roster
 * role is student, within its student scope. A seat listed to some students
 * whose list is not known is given those Core showed it work or grades of
 * (`seen`), since Core scopes those. Removed students only when asked for.
 */
export function visibleStudents(
  members: Iterable<MemberSummary>,
  seat: SeatScope | null | undefined,
  opts: { includeRemoved?: boolean; seen?: ReadonlySet<string> } = {},
): MatrixStudent[] {
  const scope = seat?.student_scope ?? 'all'
  const listed = seat?.listed_students ? new Set(seat.listed_students) : null
  const out: MatrixStudent[] = []
  for (const m of members) {
    if (m.role !== 'student') continue
    if (m.status === 'removed' && !opts.includeRemoved) continue
    if (scope === 'self' && m.id !== seat?.member_id) continue
    if (scope === 'listed') {
      if (listed ? !listed.has(m.id) : !opts.seen?.has(m.id)) continue
    }
    out.push({ id: m.id, name: m.display_name, loginId: m.login_id ?? null, status: m.status })
  }
  return out
}

/** Every student Core showed grades or work of, by id: the rows where the member list cannot be read. */
export function studentsSeen(grades: readonly GradeSummary[], submissions: readonly SubmissionLite[] | null): string[] {
  const ids = new Set<string>()
  for (const g of grades) ids.add(g.student_member_id)
  for (const s of submissions ?? []) ids.add(s.student_member_id)
  return [...ids]
}

// ---------------------------------------------------------------------------
// What: the columns
// ---------------------------------------------------------------------------

const bySortOrder = (a: Component, b: Component) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
const byDue = (a: AssignmentSummary, b: AssignmentSummary) => {
  if (a.due_at && b.due_at && a.due_at !== b.due_at) return a.due_at < b.due_at ? -1 : 1
  if (!!a.due_at !== !!b.due_at) return a.due_at ? -1 : 1
  return a.title.localeCompare(b.title)
}

/**
 * The columns in the scheme's order: the course total first, then each
 * component's work, its assignments by due date, a component graded
 * directly on its own, and the component's total after what it adds up;
 * practice work last. Only published assignments: the gradebook counts no
 * other, and nothing can be handed in for one. A seat limited to listed
 * assignments sees no component's grades (Core gives it none): it gets
 * the assignments alone.
 */
export function buildColumns(
  components: readonly Component[],
  assignments: Iterable<AssignmentSummary>,
  opts: { spansAssignments: boolean },
): MatrixColumn[] {
  const published = [...assignments].filter((a) => !!a.published_at)
  const byComponent = new Map<string, AssignmentSummary[]>()
  const ids = new Set(components.map((c) => c.id))
  const practice: AssignmentSummary[] = []
  for (const a of published) {
    if (a.component_id && ids.has(a.component_id)) {
      const list = byComponent.get(a.component_id) ?? []
      list.push(a)
      byComponent.set(a.component_id, list)
    } else practice.push(a)
  }
  const children = new Map<string, Component[]>()
  for (const c of components) {
    if (!c.parent_id) continue
    const list = children.get(c.parent_id) ?? []
    list.push(c)
    children.set(c.parent_id, list)
  }
  for (const list of children.values()) list.sort(bySortOrder)
  for (const list of byComponent.values()) list.sort(byDue)

  const out: MatrixColumn[] = []
  const assignmentColumn = (a: AssignmentSummary, group: string | null, counted: boolean): MatrixColumn => ({
    key: `a:${a.id}`,
    kind: 'assignment',
    id: a.id,
    title: a.title,
    group,
    outOf: a.points_possible,
    isRoot: false,
    counted,
  })
  const seen = new Set<string>()
  function walk(c: Component, group: string | null) {
    if (seen.has(c.id)) return
    seen.add(c.id)
    const kids = children.get(c.id) ?? []
    const work = byComponent.get(c.id) ?? []
    const direct = c.points_possible !== null && c.points_possible !== undefined && !kids.length && !work.length
    if (direct) {
      if (opts.spansAssignments)
        out.push({
          key: `c:${c.id}`,
          kind: 'direct',
          id: c.id,
          title: c.name,
          group,
          outOf: c.points_possible ?? null,
          isRoot: false,
          counted: true,
        })
      return
    }
    const name = c.parent_id ? c.name : null
    for (const a of work) out.push(assignmentColumn(a, name, true))
    for (const k of kids) walk(k, name)
    if (opts.spansAssignments && c.parent_id)
      out.push({
        key: `t:${c.id}`,
        kind: 'total',
        id: c.id,
        title: c.name,
        group,
        outOf: null,
        isRoot: false,
        counted: true,
      })
  }
  const roots = components.filter((c) => !c.parent_id).sort(bySortOrder)
  for (const r of roots) {
    if (opts.spansAssignments)
      out.push({
        key: `t:${r.id}`,
        kind: 'total',
        id: r.id,
        title: null,
        group: null,
        outOf: null,
        isRoot: true,
        counted: true,
      })
    walk(r, null)
  }
  for (const a of practice.sort(byDue)) out.push(assignmentColumn(a, null, false))
  return out
}

// ---------------------------------------------------------------------------
// The cells
// ---------------------------------------------------------------------------

function num(v: Decimal | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = Number(plainDecimal(v) ?? NaN)
  return Number.isFinite(n) ? n : null
}

interface Live {
  posted: GradeSummary | null
  postedRank: number
  draft: GradeSummary | null
  draftRank: number
}

/**
 * Which of two live grades on an assignment is the later: the one on the
 * higher attempt, as Core counts the highest attempt with a posted grade;
 * where the attempts are not known, the one made later.
 */
function rank(g: GradeSummary, attempts: ReadonlyMap<string, number>): number {
  const attempt = g.submission_id ? (attempts.get(g.submission_id) ?? 0) : 0
  return attempt * 1e13 + (Date.parse(g.created_at) || 0)
}

/**
 * The matrix: a row for each student, a cell for each column that has
 * something for them. An assignment's cell is the posted grade on the
 * highest attempt that has one (the one Core counts), or a newer draft
 * where there is one; failing a grade, what its latest submission says:
 * recorded missing, or handed in and waiting to be graded. A total is the
 * one written down at posting, with an override in its place; one written
 * with nothing beneath it (no_total) is none.
 */
export function buildMatrix(input: {
  students: readonly MatrixStudent[]
  columns: readonly MatrixColumn[]
  grades: readonly GradeSummary[]
  submissions?: readonly SubmissionLite[] | null
}): MatrixRow[] {
  const attempts = new Map<string, number>()
  // The latest attempt's state, by student and assignment.
  const latest = new Map<string, SubmissionLite>()
  for (const s of input.submissions ?? []) {
    attempts.set(s.id, s.attempt)
    const k = `${s.student_member_id}|${s.assignment_id}`
    const was = latest.get(k)
    if (!was || s.attempt > was.attempt) latest.set(k, s)
  }

  const live = new Map<string, Live>()
  const totals = new Map<string, GradeSummary>()
  for (const g of input.grades) {
    if (g.state === 'superseded' || g.superseded_by) continue
    if (g.origin === 'computed') {
      if (g.state !== 'posted' || !g.component_id) continue
      const k = `${g.student_member_id}|t:${g.component_id}`
      const was = totals.get(k)
      if (!was || (g.posted_at ?? g.created_at) > (was.posted_at ?? was.created_at)) totals.set(k, g)
      continue
    }
    const target = g.assignment_id ? `a:${g.assignment_id}` : g.component_id ? `c:${g.component_id}` : null
    if (!target) continue
    const k = `${g.student_member_id}|${target}`
    const l = live.get(k) ?? { posted: null, postedRank: -Infinity, draft: null, draftRank: -Infinity }
    const r = rank(g, attempts)
    if (g.state === 'posted') {
      if (r > l.postedRank) Object.assign(l, { posted: g, postedRank: r })
    } else if (g.state === 'draft') {
      if (r > l.draftRank) Object.assign(l, { draft: g, draftRank: r })
    }
    live.set(k, l)
  }

  return input.students.map((student) => {
    const cells: Record<string, MatrixCell> = {}
    let drafts = 0
    let missing = 0
    let toGrade = 0
    for (const col of input.columns) {
      let cell: MatrixCell | null = null
      if (col.kind === 'total') {
        const g = totals.get(`${student.id}|${col.key}`)
        if (g && !g.no_total) {
          const score = g.override?.score ?? g.score
          cell = { state: 'posted', score, gradeId: g.id, overridden: !!g.override, value: num(score) }
        }
      } else {
        const l = live.get(`${student.id}|${col.key}`)
        if (l?.draft && (!l.posted || l.draftRank > l.postedRank)) {
          cell = {
            state: 'draft',
            score: l.draft.score,
            gradeId: l.draft.id,
            postedScore: l.posted?.score ?? null,
            value: num(l.draft.score),
          }
        } else if (l?.posted) {
          cell = { state: 'posted', score: l.posted.score, gradeId: l.posted.id, value: num(l.posted.score) }
        } else if (col.kind === 'assignment') {
          const s = latest.get(`${student.id}|${col.id}`)
          if (s?.state === 'missing') cell = { state: 'missing', score: null, gradeId: null, value: null }
          else if (s?.state === 'submitted' || s?.state === 'late')
            cell = { state: 'submitted', score: null, gradeId: null, value: null }
        }
      }
      if (!cell) continue
      cells[col.key] = cell
      if (cell.state === 'draft') drafts++
      else if (cell.state === 'missing') missing++
      else if (cell.state === 'submitted') toGrade++
    }
    return { student, cells, drafts, missing, toGrade }
  })
}

// ---------------------------------------------------------------------------
// Filtering and sorting
// ---------------------------------------------------------------------------

export type RowFilter = 'all' | 'drafts' | 'missing' | 'toGrade'

const fold = (s: string) => s.normalize('NFKC').toLocaleLowerCase()

/** The rows whose student's name or login ID holds what was typed, and that have what the filter asks for. */
export function filterRows(rows: readonly MatrixRow[], query: string, filter: RowFilter = 'all'): MatrixRow[] {
  const q = fold(query.trim())
  return rows.filter((r) => {
    if (filter === 'drafts' && !r.drafts) return false
    if (filter === 'missing' && !r.missing) return false
    if (filter === 'toGrade' && !r.toGrade) return false
    if (!q) return true
    return (
      (r.student.name !== null && fold(r.student.name).includes(q)) ||
      (r.student.loginId !== null && fold(r.student.loginId).includes(q)) ||
      r.student.id.toLowerCase().startsWith(q) ||
      r.student.id.replace(/-/g, '').toLowerCase().endsWith(q)
    )
  })
}

export interface SortBy {
  /** name, loginId, or a column's key. */
  key: string
  dir: 'asc' | 'desc'
}

/**
 * Sorted by a column: by the value shown, those with nothing for it last
 * whichever way; ties, and the name column, by name in the reader's
 * language, then by id, so that the order is the same every time.
 */
export function sortRows(
  rows: readonly MatrixRow[],
  by: SortBy,
  nameOf: (s: MatrixStudent) => string,
  locale?: string,
): MatrixRow[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const names = new Map(rows.map((r) => [r.student.id, nameOf(r.student)]))
  const byName = (a: MatrixRow, b: MatrixRow) =>
    collator.compare(names.get(a.student.id)!, names.get(b.student.id)!) || (a.student.id < b.student.id ? -1 : 1)
  const sign = by.dir === 'desc' ? -1 : 1
  const out = [...rows]
  if (by.key === 'name') return out.sort((a, b) => sign * byName(a, b))
  if (by.key === 'loginId') {
    return out.sort((a, b) => {
      const x = a.student.loginId
      const y = b.student.loginId
      if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1
      return sign * collator.compare(x, y) || byName(a, b)
    })
  }
  return out.sort((a, b) => {
    const x = a.cells[by.key]?.value ?? null
    const y = b.cells[by.key]?.value ?? null
    if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1
    return sign * (x - y) || byName(a, b)
  })
}

// ---------------------------------------------------------------------------
// The class's averages
// ---------------------------------------------------------------------------

export interface ColumnSummary {
  /** The mean of the posted scores (a total's percentages), or null where none is posted. */
  mean: number | null
  posted: number
  drafts: number
}

/** For each column, over the rows shown: the mean of what is posted, and how many are posted and drafts. */
export function summarise(rows: readonly MatrixRow[], columns: readonly MatrixColumn[]): Map<string, ColumnSummary> {
  const out = new Map<string, ColumnSummary>()
  for (const col of columns) {
    let sum = 0
    let posted = 0
    let drafts = 0
    for (const r of rows) {
      const c = r.cells[col.key]
      if (!c) continue
      if (c.state === 'posted' && c.value !== null) {
        sum += c.value
        posted++
      } else if (c.state === 'draft') drafts++
    }
    out.set(col.key, { mean: posted ? sum / posted : null, posted, drafts })
  }
  return out
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** The words the export is written in: the reader's own. */
export interface CsvWords {
  student: string
  loginId: string
  memberId: string
  /** A column's heading. */
  column: (col: MatrixColumn) => string
  /** A draft score, marked as one ("7 (draft)"). */
  draft: (score: string) => string
  missing: string
  toGrade: string
  /** A student with no name to give (the member list cannot be read). */
  unnamed: (s: MatrixStudent) => string
}

/**
 * A cell of text as CSV holds it (RFC 4180): quoted where it holds a comma,
 * a quote or a line break, or begins or ends with a space. Text that a
 * spreadsheet would take for a formula (=, +, -, @, a tab or a carriage
 * return first) is written after an apostrophe, so that a name never runs
 * as one; numbers are written as they are.
 */
export function csvText(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * The rows shown as CSV, as a spreadsheet opens it: UTF-8 with a byte-order
 * mark (Excel reads Chinese names right only with one), lines ending CRLF.
 * Scores are written with every place Core holds, a total as its
 * percentage; a draft is marked as one, so that it is never read as posted.
 */
export function matrixCsv(columns: readonly MatrixColumn[], rows: readonly MatrixRow[], words: CsvWords): string {
  const lines: string[] = []
  lines.push([words.student, words.loginId, words.memberId, ...columns.map(words.column)].map(csvText).join(','))
  for (const r of rows) {
    const cells = [csvText(r.student.name ?? words.unnamed(r.student)), csvText(r.student.loginId ?? ''), r.student.id]
    for (const col of columns) {
      const c = r.cells[col.key]
      const score = plainDecimal(c?.score) ?? ''
      if (!c || c.state === 'none') cells.push('')
      else if (c.state === 'posted') cells.push(score)
      else if (c.state === 'draft') cells.push(csvText(words.draft(score)))
      else if (c.state === 'missing') cells.push(csvText(words.missing))
      else cells.push(csvText(words.toGrade))
    }
    lines.push(cells.join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}
