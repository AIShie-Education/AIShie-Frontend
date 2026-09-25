// Small, cached look-ups for describing what an action is about: whose
// submission, which document, which action a decision is about. Each is asked
// for once per page load, a few at a time, and only where the caller's seat
// can read it; anything that cannot be looked up is shown by its id instead.
import { computed, reactive, watch, type ComputedRef } from 'vue'
import { ApiError, read } from '@/api/http'
import type { Perm } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'

export interface Entry<T> {
  state: 'loading' | 'ok' | 'error'
  value?: T
  error?: ApiError
}

const entries = reactive(new Map<string, Entry<unknown>>())

const MAX_AT_ONCE = 4
let running = 0
const waiting: (() => void)[] = []
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_AT_ONCE) await new Promise<void>((r) => waiting.push(r))
  running++
  try {
    return await fn()
  } finally {
    running--
    waiting.shift()?.()
  }
}

function ensure<T>(key: string, loader: () => Promise<T>) {
  if (entries.has(key)) return
  entries.set(key, { state: 'loading' })
  limited(loader).then(
    (v) => {
      const e = entries.get(key)
      if (e) Object.assign(e, { state: 'ok', value: v })
    },
    (err) => {
      const e = entries.get(key)
      if (e) Object.assign(e, { state: 'error', error: err instanceof ApiError ? err : undefined })
    },
  )
}

/** Forgets what was looked up under a prefix (an action whose state has changed, say). */
export function forget(prefix: string) {
  for (const k of [...entries.keys()]) if (k.startsWith(prefix)) entries.delete(k)
}

export interface Spec<T> {
  key: string
  load: () => Promise<T>
}

/** A look-up that follows its source: null asks for nothing. */
export function useLookup<T>(src: () => Spec<T> | null | undefined): ComputedRef<Entry<T> | undefined> {
  watch(
    () => src()?.key,
    () => {
      const s = src()
      if (s) ensure(s.key, s.load)
    },
    { immediate: true },
  )
  return computed(() => {
    const s = src()
    return s ? (entries.get(s.key) as Entry<T> | undefined) : undefined
  })
}

/** The look-ups there are, each gated by what reading it needs. */
export function useSpecs() {
  const course = useCourseStore()
  const session = useSessionStore()
  const may = (p: Perm) => course.can(p)
  return {
    submission(courseId: string, id: string | null | undefined) {
      if (!id || !may('submission_read')) return null
      return {
        key: `${courseId}:submission:${id}`,
        load: () => read('submission.get', { course_id: courseId, submission_id: id }),
      }
    },
    grade(courseId: string, id: string | null | undefined) {
      if (!id || !may('grade_read')) return null
      return { key: `${courseId}:grade:${id}`, load: () => read('grade.get', { course_id: courseId, grade_id: id }) }
    },
    document(courseId: string, id: string | null | undefined) {
      if (!id || !may('document_read')) return null
      return {
        key: `${courseId}:document:${id}`,
        load: () => read('document.get', { course_id: courseId, document_id: id }),
      }
    },
    action(courseId: string, id: string | null | undefined) {
      if (!id || !may('action_decide')) return null
      return { key: `${courseId}:action:${id}`, load: () => read('action.get', { course_id: courseId, action_id: id }) }
    },
    components(courseId: string) {
      if (!may('grade_read')) return null
      return {
        key: `${courseId}:components`,
        load: () => read('component.tree', { course_id: courseId }).then((o) => o.components ?? []),
      }
    },
    actor(id: string | null | undefined) {
      if (!id || !session.isAdmin) return null
      return { key: `actor:${id}`, load: () => read('actor.get', { actor_id: id }) }
    },
  }
}
