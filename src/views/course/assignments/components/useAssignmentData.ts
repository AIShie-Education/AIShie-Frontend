// Loaders the assignment pages share: the grading scheme's buckets (where an
// assignment can hang), the documents an assignment can point at, and "every
// page of" a list Core pages by cursor.
import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { read } from '@/api/http'
import type { Component, DocumentSummary, GradeSummary, SubmissionSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'

const PAGE = 200
/** A safety stop for "read every page": 40 pages of 200. */
const MAX_PAGES = 40

/** Reads every page of a cursor-paged list. */
export async function readAll<T>(
  page: (after: string | undefined) => Promise<{ items: T[] | null | undefined; next?: string | null }>,
): Promise<T[]> {
  const all: T[] = []
  let after: string | undefined
  for (let i = 0; i < MAX_PAGES; i++) {
    const out = await page(after)
    all.push(...(out.items ?? []))
    if (!out.next) break
    after = out.next
  }
  return all
}

export function allSubmissions(
  courseId: string,
  filter: { assignment_id?: string; student_member_id?: string },
): Promise<SubmissionSummary[]> {
  return readAll((after) =>
    read('submission.list', { course_id: courseId, ...filter, limit: PAGE, after }).then((o) => ({
      items: o.submissions,
      next: o.next,
    })),
  )
}

export function allGrades(
  courseId: string,
  filter: { assignment_id?: string; student_member_id?: string },
): Promise<GradeSummary[]> {
  return readAll((after) =>
    read('grade.list', { course_id: courseId, ...filter, limit: PAGE, after }).then((o) => ({
      items: o.grades,
      next: o.next,
    })),
  )
}

export function allDocuments(courseId: string, kind: 'instructions' | 'rubric'): Promise<DocumentSummary[]> {
  return readAll((after) =>
    read('document.list', { course_id: courseId, kind, limit: PAGE, after }).then((o) => ({
      items: o.documents,
      next: o.next,
    })),
  )
}

/** One student's submissions → the newest attempt at each assignment. */
export function latestByAssignment(subs: SubmissionSummary[]): Map<string, SubmissionSummary> {
  const m = new Map<string, SubmissionSummary>()
  for (const s of subs) {
    const cur = m.get(s.assignment_id)
    if (!cur || s.attempt > cur.attempt) m.set(s.assignment_id, s)
  }
  return m
}

export interface Bucket {
  id: string
  /** The path from below the course total, e.g. "Coursework › Labs". */
  label: string
}

/**
 * The course's grading scheme, where it can be read (it takes grade_read,
 * which an observer, say, does not hold). Unreadable, it is simply absent and
 * the pages say less about where an assignment counts.
 */
export function useScheme(courseId: Ref<string> | (() => string), opts: { immediate?: boolean } = {}) {
  const course = useCourseStore()
  const id = typeof courseId === 'function' ? courseId : () => courseId.value
  const state = useAsync<Component[] | null>(
    async () => {
      if (!course.can('grade_read')) return null
      try {
        const out = await read('component.tree', { course_id: id() })
        return out.components ?? []
      } catch {
        return null
      }
    },
    { immediate: opts.immediate, keepData: true },
  )
  const components = computed(() => state.data.value ?? [])
  const readable = computed(() => state.data.value !== null && state.data.value !== undefined)
  const byId = computed(() => new Map(components.value.map((c) => [c.id, c])))

  function path(cid: string): string {
    const names: string[] = []
    let c = byId.value.get(cid)
    while (c) {
      // The root is the course total: it names the whole, not a place in it,
      // unless it is the only component there is.
      if (c.parent_id || names.length === 0) names.unshift(c.name)
      c = c.parent_id ? byId.value.get(c.parent_id) : undefined
      if (c && !c.parent_id) break
    }
    return names.join(' › ')
  }

  /** Where an assignment can hang: a component with no children and no points of its own. */
  const buckets = computed<Bucket[]>(() => {
    const parents = new Set(components.value.map((c) => c.parent_id).filter((p): p is string => !!p))
    return components.value
      .filter((c) => !parents.has(c.id) && (c.points_possible === null || c.points_possible === undefined))
      .map((c) => ({ id: c.id, label: path(c.id) }))
  })

  function componentName(cid: string | null | undefined): string | null {
    if (!cid) return null
    return byId.value.has(cid) ? path(cid) : null
  }

  return { loading: state.loading, readable, components, buckets, componentName, reload: state.reload }
}

/** Whether the viewport is phone-narrow; follows it as it changes. */
export function useNarrow(query = '(max-width: 640px)') {
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null
  const narrow = ref(!!mq?.matches)
  const on = (e: MediaQueryListEvent) => (narrow.value = e.matches)
  mq?.addEventListener('change', on)
  onScopeDispose(() => mq?.removeEventListener('change', on))
  return narrow
}
