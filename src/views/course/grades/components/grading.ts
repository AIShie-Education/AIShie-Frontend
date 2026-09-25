// What the grades views share: names and points for what a grade is for, the
// shapes a grade's breakdown can take, and exact decimal sums.
import { computed, onScopeDispose, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { read } from '@/api/http'
import type { Decimal, GradeSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'

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
  const tree = useAsync(() => read('component.tree', { course_id: courseId() }))

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

/** A breakdown row being edited: every field a string. */
export interface BreakdownDraft {
  criterion: string
  points: string
  max: string
  comment: string
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

export function toBreakdownDrafts(items: BreakdownItem[] | null): BreakdownDraft[] {
  return (items ?? []).map((b) => ({
    criterion: b.criterion,
    points: String(b.points),
    max: String(b.max),
    comment: b.comment ?? '',
  }))
}

/** Rows with anything in them, for sending; empty rows are dropped. */
export function breakdownForApi(rows: BreakdownDraft[]): BreakdownItem[] | undefined {
  const used = rows.filter((r) => r.criterion.trim() || r.points.trim() || r.max.trim() || r.comment.trim())
  if (!used.length) return undefined
  return used.map((r) => ({
    criterion: r.criterion.trim(),
    points: r.points.trim(),
    max: r.max.trim(),
    comment: r.comment.trim() || undefined,
  }))
}

// ---------------------------------------------------------------------------
// Exact decimals
// ---------------------------------------------------------------------------

/** Sums decimals exactly (no float noise), as a plain decimal string. */
export function addDecimals(values: (Decimal | null | undefined)[]): string {
  const parts = values
    .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
    .filter((s) => /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s))
  const scale = Math.max(0, ...parts.map((s) => (s.split('.')[1] ?? '').length))
  let sum = 0n
  for (const s of parts) {
    const neg = s.startsWith('-')
    const body = s.replace(/^[-+]/, '')
    const [int, frac = ''] = body.split('.')
    const n = BigInt((int || '0') + frac.padEnd(scale, '0'))
    sum += neg ? -n : n
  }
  const neg = sum < 0n
  const abs = (neg ? -sum : sum).toString().padStart(scale + 1, '0')
  let out = scale ? `${abs.slice(0, -scale)}.${abs.slice(-scale)}` : abs
  if (scale) out = out.replace(/0+$/, '').replace(/\.$/, '')
  return (neg && out !== '0' ? '-' : '') + out
}

/** a > b, for decimals as Core sends them. */
export function decimalGreater(a: Decimal | null | undefined, b: Decimal | null | undefined): boolean {
  const x = Number(a)
  const y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) && x > y
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

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Whether the screen is phone-narrow, kept up to date as it changes. */
export function useNarrow(query = '(max-width: 640px)') {
  const narrow = ref(false)
  if (typeof window === 'undefined' || !window.matchMedia) return narrow
  const mq = window.matchMedia(query)
  narrow.value = mq.matches
  const on = (e: MediaQueryListEvent) => (narrow.value = e.matches)
  mq.addEventListener('change', on)
  onScopeDispose(() => mq.removeEventListener('change', on))
  return narrow
}
