// What the grades views share: names and points for what a grade is for, the
// shapes a grade's breakdown can take, and decimals shown exactly as Core
// holds them.
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ApiError, read } from '@/api/http'
import type { Decimal, GradeSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { formatDecimal, formatPct as percentOfFraction } from '@/utils/format'
import type { BreakdownRow } from '@/views/course/submissions/components/BreakdownEditor.vue'
import { isNonNegativeDecimal } from '@/views/course/submissions/components/decimal'

type Translate = (key: string, args?: Record<string, unknown>) => string

/** A grade as far as naming it goes: grade.get and grade.list rows alike. */
export type GradeLike = Pick<GradeSummary, 'assignment_id' | 'component_id' | 'origin'>

/**
 * The course's grading scheme (component.tree, gated by grade_read) and the
 * assignments, for saying what a grade is for and what it is out of.
 */
export function useGradeLookups(courseId: () => string) {
  const course = useCourseStore()
  void course.ensureAssignments()
  // A seat known not to hold grade_read would only be refused: say so without asking.
  const tree = useAsync(async () => {
    if (course.level('grade_read') === 'denied') {
      throw new ApiError({ status: 403, code: 'forbidden', message: 'not permitted' })
    }
    return read('component.tree', { course_id: courseId() })
  })

  const list = computed(() => tree.data.value?.components ?? [])
  const components = computed(() => new Map(list.value.map((c) => [c.id, c])))
  const childCount = computed(() => {
    const m = new Map<string, number>()
    for (const c of list.value) if (c.parent_id) m.set(c.parent_id, (m.get(c.parent_id) ?? 0) + 1)
    return m
  })
  const holdingAssignments = computed(
    () => new Set([...course.assignments.values()].map((a) => a.component_id).filter((x): x is string => !!x)),
  )
  /**
   * Components that take a grade of their own (grade.submit with
   * component_id): points of their own, no sub-components, no assignments.
   * Core checks this again; an assignment the caller cannot see may still
   * hang there.
   */
  const directComponents = computed(() =>
    list.value.filter(
      (c) =>
        c.points_possible !== null &&
        c.points_possible !== undefined &&
        !childCount.value.get(c.id) &&
        !holdingAssignments.value.has(c.id),
    ),
  )

  function isRoot(componentId: string | null | undefined): boolean {
    if (!componentId) return false
    const c = components.value.get(componentId)
    return !!c && !c.parent_id
  }

  function componentName(componentId: string | null | undefined, t: Translate): string | null {
    if (!componentId) return null
    const c = components.value.get(componentId)
    if (!c) return null
    return c.parent_id ? c.name : t('grades.courseTotal')
  }

  /** The assignment's title or the component's name, or null when it cannot be known. */
  function what(g: GradeLike, t: Translate): string | null {
    if (g.assignment_id) return course.assignmentTitle(g.assignment_id)
    return componentName(g.component_id, t)
  }

  /**
   * The points a grade's score is out of. A computed total is a percentage.
   * Points possible no longer change once a grade has been entered on the
   * work, so what the work is worth now is what the score was given out of.
   */
  function outOf(g: GradeLike): Decimal | null {
    if (g.origin === 'computed') return 100
    if (g.assignment_id) return course.assignments.get(g.assignment_id)?.points_possible ?? null
    if (g.component_id) return components.value.get(g.component_id)?.points_possible ?? null
    return null
  }

  return { tree, components, directComponents, isRoot, componentName, what, outOf }
}

// ---------------------------------------------------------------------------
// Breakdown and working
// ---------------------------------------------------------------------------

/** One criterion of an entered grade's breakdown, as Core stores it. */
export interface BreakdownItem {
  criterion: string
  points: Decimal
  max: Decimal
  comment?: string | null
}

/** An entered grade's breakdown, or null when it has none (or is not one). */
export function parseBreakdown(v: unknown): BreakdownItem[] | null {
  if (!Array.isArray(v)) return null
  const out: BreakdownItem[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    out.push({
      criterion: String(r.criterion ?? ''),
      points: (r.points as Decimal) ?? 0,
      max: (r.max as Decimal) ?? 0,
      comment: typeof r.comment === 'string' ? r.comment : null,
    })
  }
  return out.length ? out : null
}

/** One line of a rolled-up component's working (gradecalc.Item). */
export interface WorkingItem {
  id: string
  kind: 'assignment' | 'component' | string
  fraction: Decimal | null
  /** The child's weight, or the assignment's points. */
  weight: Decimal
  dropped?: boolean
}

/** What a computed total's breakdown holds: the working and the policy it was worked out under. */
export interface Working {
  fraction: Decimal | null
  complete: boolean
  items: WorkingItem[]
  ungradedAsZero: boolean
}

export function parseWorking(v: unknown): Working | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (!('complete' in r) && !('items' in r)) return null
  const items = Array.isArray(r.items) ? (r.items as WorkingItem[]) : []
  return {
    fraction: (r.fraction as Decimal | null) ?? null,
    complete: !!r.complete,
    items,
    ungradedAsZero: !!r.ungraded_as_zero,
  }
}

export function toBreakdownRows(items: BreakdownItem[] | null): BreakdownRow[] {
  let key = Date.now()
  return (items ?? []).map((b) => ({
    key: key++,
    criterion: b.criterion,
    points: plainDecimal(b.points) ?? String(b.points),
    max: plainDecimal(b.max) ?? String(b.max),
    comment: b.comment ?? '',
  }))
}

/** Every line needs a criterion and non-negative points and max, as Core asks. */
export function breakdownValid(rows: BreakdownRow[]): boolean {
  return rows.every((r) => !!r.criterion.trim() && isNonNegativeDecimal(r.points) && isNonNegativeDecimal(r.max))
}

/** The lines as Core takes them, or undefined for none. */
export function breakdownForApi(rows: BreakdownRow[]): BreakdownItem[] | undefined {
  if (!rows.length) return undefined
  return rows.map((r) => ({
    criterion: r.criterion.trim(),
    points: r.points.trim(),
    max: r.max.trim(),
    comment: r.comment.trim() || undefined,
  }))
}

// ---------------------------------------------------------------------------
// Exact decimals
//
// Core keeps scores, points and weights as exact decimals and sends them as
// JSON numbers, whose shortest form is the decimal Core wrote. They are shown
// with every place they have: 9.125 is never 9.13, save in the class's
// gradebook, whose cells have no room for them: there a score is given to two
// places (shortScore), with every place beside it. Percentages are rounded
// to two places, half away from zero, as Core rounds the totals it writes
// down (gradecalc.Percent), so a percentage worked out here reads the same as
// one Core stored.
// ---------------------------------------------------------------------------

/** A decimal as plain digits ("9.125", "0.0000001", never "1e-7"), or null if it is not one. */
export function plainDecimal(v: Decimal | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const m = /^([-+]?)(\d*)(?:\.(\d*))?(?:e([-+]?\d+))?$/i.exec(String(v).trim())
  if (!m || (!m[2] && !m[3])) return null
  const [, sign, int = '', frac = '', exp = '0'] = m
  let digits = int + frac
  let point = int.length + Number(exp)
  if (point < 0) {
    digits = '0'.repeat(-point) + digits
    point = 0
  }
  digits = digits.padEnd(point, '0')
  const whole = digits.slice(0, point).replace(/^0+/, '') || '0'
  const part = digits.slice(point).replace(/0+$/, '')
  const out = part ? `${whole}.${part}` : whole
  return sign === '-' && out !== '0' ? `-${out}` : out
}

/** A value as an integer and a power of ten: n / 10^scale. */
function scaled(v: Decimal | null | undefined): { n: bigint; scale: number } | null {
  const s = plainDecimal(v)
  if (s === null) return null
  const [whole, part = ''] = s.replace(/^-/, '').split('.')
  const n = BigInt(whole + part)
  return { n: s.startsWith('-') ? -n : n, scale: part.length }
}

/** n / d rounded to an integer, half away from zero. */
function divRound(n: bigint, d: bigint): bigint {
  const neg = n < 0n !== d < 0n
  const a = n < 0n ? -n : n
  const b = d < 0n ? -d : d
  const q = (2n * a + b) / (2n * b)
  return neg ? -q : q
}

/** n / 10^scale as plain digits. */
function unscale(n: bigint, scale: number): string {
  const neg = n < 0n
  const digits = (neg ? -n : n).toString().padStart(scale + 1, '0')
  return plainDecimal(
    `${neg ? '-' : ''}${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`,
  )!
}

/** a × b, rounded to places (half away from zero). */
export function mulDecimals(a: Decimal | null | undefined, b: Decimal | null | undefined, places = 10): string | null {
  const x = scaled(a)
  const y = scaled(b)
  if (!x || !y) return null
  return unscale(divRound(x.n * y.n * 10n ** BigInt(places), 10n ** BigInt(x.scale + y.scale)), places)
}

/**
 * A score out of from, as a score out of to, to four decimal places, half
 * away from zero, as Core rescales one (existing_grades rescale): 45 of 50 is
 * 90 of 100. Null when a value is not a decimal or from is zero, which has
 * nothing to rescale from.
 */
export function rescaleScore(
  score: Decimal | null | undefined,
  from: Decimal | null | undefined,
  to: Decimal | null | undefined,
): string | null {
  const s = scaled(score)
  const f = scaled(from)
  const t = scaled(to)
  if (!s || !f || !t || f.n === 0n) return null
  // score × to ÷ from, in ten-thousandths: s·t·10^4 / f, each brought to a common scale.
  const n = s.n * t.n * 10n ** BigInt(f.scale) * 10000n
  const d = f.n * 10n ** BigInt(s.scale + t.scale)
  return unscale(divRound(n, d), 4)
}

/** Compares two decimals exactly: -1, 0 or 1; null when one is not a decimal. */
export function compareDecimals(a: Decimal | null | undefined, b: Decimal | null | undefined): -1 | 0 | 1 | null {
  const x = scaled(a)
  const y = scaled(b)
  if (!x || !y) return null
  const l = x.n * 10n ** BigInt(y.scale)
  const r = y.n * 10n ** BigInt(x.scale)
  return l < r ? -1 : l > r ? 1 : 0
}

/** A score, points or weight: every decimal place it has, none added. */
export function formatScore(v: Decimal | null | undefined): string {
  const s = plainDecimal(v)
  if (s === null) return formatDecimal(v)
  return formatDecimal(s, Math.min(s.split('.')[1]?.length ?? 0, 20))
}

/**
 * A score to at most two decimal places, as plain digits (72.3333 →
 * "72.33"), half away from zero, for where there is no room for every
 * place: the class's gradebook, whose table's cells are 104 px. Wherever it
 * is shown, the score with every place goes beside it, in the tooltip and
 * for a screen reader. Null where it has no more places than that, and is
 * shown as it is.
 */
export function shortScore(v: Decimal | null | undefined): string | null {
  const x = scaled(v)
  if (!x || x.scale <= 2) return null
  return unscale(divRound(x.n * 100n, 10n ** BigInt(x.scale)), 2)
}

/**
 * A score as the class's gradebook shows it, a total's as a percentage: to
 * two decimal places at most (text), and with every place (full) where that
 * is shorter, to go beside it.
 */
export function classFigure(v: Decimal | null | undefined, percent = false): { text: string; full: string | null } {
  const format = percent ? formatPct : formatScore
  const short = shortScore(v)
  return short === null ? { text: format(v), full: null } : { text: format(short), full: format(v) }
}

/** A percentage Core already worked out (a computed total, gradebook percent): "91.25%", every decimal place kept. */
export function formatPct(v: Decimal | null | undefined): string {
  const s = plainDecimal(v)
  if (s === null) return '—'
  return percentOfFraction(Number(s) / 100, Math.min(s.split('.')[1]?.length ?? 0, 20))
}

/** score out of outOf as a percentage to two places, or "—". */
export function percentOf(score: Decimal | null | undefined, outOf: Decimal | null | undefined): string {
  const s = scaled(score)
  const p = scaled(outOf)
  if (!s || !p || p.n === 0n) return '—'
  // Hundredths of a percent: s × 100 × 100 / p.
  const hundredths = divRound(s.n * 10n ** BigInt(p.scale) * 10000n, p.n * 10n ** BigInt(s.scale))
  return formatPct(unscale(hundredths, 2))
}

/** A fraction (0.9125) as a percentage to two places ("91.25%"), or "—". */
export function fractionPercent(f: Decimal | null | undefined): string {
  return percentOf(f, 1)
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/**
 * Each item's part in its component's result, by id, as gradecalc weighs
 * them: only what counted shares it — weighted above zero, with a result (a
 * grade, or zero for a final grade), not dropped — and the rest
 * re-normalised. Null for what did not count.
 */
export function shares(
  items: readonly Pick<WorkingItem, 'id' | 'weight' | 'fraction' | 'dropped'>[],
): Map<string, number | null> {
  const counts = (i: (typeof items)[number]) =>
    Number(i.weight) > 0 && !i.dropped && i.fraction !== null && i.fraction !== undefined
  const total = items.filter(counts).reduce((s, i) => s + Number(i.weight), 0)
  return new Map(items.map((i) => [i.id, counts(i) && total > 0 ? Number(i.weight) / total : null]))
}

/** A draft grade about to be posted, as the post dialog lists it. */
export interface PostRow {
  id: string
  studentMemberId: string
  label: string
  score: Decimal
  outOf: Decimal | null
}

// ---------------------------------------------------------------------------
// Final grades
// ---------------------------------------------------------------------------

/**
 * Asks before posting or regrading with treat_ungraded_as_zero: once a
 * student's totals are written that way they stay final. Resolves true to go
 * ahead.
 */
export async function confirmFinal(t: Translate): Promise<boolean> {
  try {
    await ElMessageBox.confirm(t('grades.final.confirm'), t('grades.final.confirmTitle'), {
      type: 'warning',
      confirmButtonText: t('grades.final.confirmButton'),
      cancelButtonText: t('common.actions.cancel'),
    })
    return true
  } catch {
    return false
  }
}
