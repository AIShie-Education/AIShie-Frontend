// Small, cached look-ups for describing what an action is about: whose
// submission, which document, which action a decision is about. Each is asked
// for once per page load, a few at a time, and only where the caller's seat
// can read it; anything that cannot be looked up is shown by its id instead.
import { computed, reactive, watch, type ComputedRef } from 'vue'
import { ApiError, read } from '@/api/http'
import type { Perm, Preset } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'

export interface Entry<T> {
  state: 'loading' | 'ok' | 'error'
  value?: T
  error?: ApiError
}

const entries = reactive(new Map<string, Entry<unknown>>())
/** How each entry is loaded, to look again (refresh). */
const loaders = new Map<string, () => Promise<unknown>>()
/** The latest load of each entry: an older answer that arrives late is dropped. */
const generations = new Map<string, number>()

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

function run(key: string) {
  const loader = loaders.get(key)
  if (!loader) return
  const gen = (generations.get(key) ?? 0) + 1
  generations.set(key, gen)
  limited(loader).then(
    (v) => {
      const e = entries.get(key)
      if (e && generations.get(key) === gen) Object.assign(e, { state: 'ok', value: v, error: undefined })
    },
    (err) => {
      const e = entries.get(key)
      if (e && generations.get(key) === gen)
        Object.assign(e, { state: 'error', value: undefined, error: err instanceof ApiError ? err : undefined })
    },
  )
}

function ensure<T>(key: string, loader: () => Promise<T>) {
  if (entries.has(key)) return
  loaders.set(key, loader)
  entries.set(key, { state: 'loading' })
  run(key)
}

/**
 * Looks again at what was looked up under a prefix (an action whose state
 * has changed, say), keeping what is known on show until the answer comes.
 */
export function refresh(prefix: string) {
  for (const k of [...entries.keys()]) if (k.startsWith(prefix)) run(k)
}

/**
 * After a decision or a review: the actions it was about have moved on, and
 * what a carried-out proposal changed may be on show too (which version of a
 * document is published).
 */
export function refreshAfterDecision(courseId: string) {
  refresh(`${courseId}:action:`)
  refresh(`${courseId}:document:`)
  refresh(`${courseId}:versions:`)
  refresh(`${courseId}:conversation:`)
  refresh(`${courseId}:messages:`)
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
    /** Every version of a document, with which is published: for those who read drafts. */
    versions(courseId: string, documentId: string | null | undefined) {
      if (!documentId || !may('document_read_draft')) return null
      return {
        key: `${courseId}:versions:${documentId}`,
        load: () =>
          read('document.versions', { course_id: courseId, document_id: documentId }).then((o) => o.versions ?? []),
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
    /**
     * The built-in presets and the course's department's own (anyone signed
     * in may read them), once the course, and so its department, is known.
     */
    presets(courseId: string): Spec<Preset[]> | null {
      const c = course.course
      if (!c || c.id !== courseId) return null
      const dept = c.dept_id ?? undefined
      return {
        key: `presets:${dept ?? ''}`,
        load: () => read('preset.list', { dept_id: dept }).then((o) => o.presets ?? []),
      }
    },
    /**
     * A conversation, as its participants and the staff who decide actions for
     * its opener may read it (conversation.get borrows document_read; Core
     * says no to anyone else, and the id is shown instead).
     */
    conversation(courseId: string, id: string | null | undefined) {
      if (!id || !may('document_read')) return null
      return {
        key: `${courseId}:conversation:${id}`,
        load: () => read('conversation.get', { course_id: courseId, conversation_id: id }),
      }
    },
    /** A conversation's newest messages (a page of them, oldest first), on the same terms. */
    messages(courseId: string, id: string | null | undefined) {
      if (!id || !may('document_read')) return null
      return {
        key: `${courseId}:messages:${id}`,
        load: () =>
          read('conversation.messages', { course_id: courseId, conversation_id: id, limit: 100 }).then(
            (o) => o.messages ?? [],
          ),
      }
    },
    actor(id: string | null | undefined) {
      if (!id || !session.isAdmin) return null
      return { key: `actor:${id}`, load: () => read('actor.get', { actor_id: id }) }
    },
  }
}
