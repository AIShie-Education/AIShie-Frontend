// How many presets of its own each department has, for the Departments list.
//
// preset.list answers the built-ins and one department's own, so each count
// is one call, and each call is one of the caller's in Core's rate limit (a
// burst of 100 an actor, refilled at 10 a second). So they are asked a few at
// a time and at most COUNTED_AT_MOST a visit, as MembersView's DETAIL_BUDGET,
// leaving room for the page the administrator goes to next; and once the page
// is left nothing more is asked, not even a retry waiting out a 429. A
// department beyond the budget, or whose count could not be had, has none
// here, and its link just says "View".
import { onScopeDispose, reactive } from 'vue'
import { read } from '@/api/http'

export const COUNTED_AT_MOST = 60
/** Calls under way at once. */
const AT_ONCE = 4

export function usePresetCounts(budget = COUNTED_AT_MOST) {
  /** Department id → how many presets of its own it has. */
  const counts = reactive(new Map<string, number>())
  /** Queued or asked already: never asked twice, until forget(). */
  const asked = new Set<string>()
  const queue: string[] = []
  let running = 0
  const stop = new AbortController()
  onScopeDispose(() => {
    queue.length = 0
    stop.abort()
  })

  async function worker() {
    running++
    try {
      for (let id = queue.shift(); id && !stop.signal.aborted; id = queue.shift()) {
        try {
          const out = await read('preset.list', { dept_id: id }, { signal: stop.signal })
          counts.set(id, (out.presets ?? []).filter((p) => p.dept_id === id).length)
        } catch {
          /* the link says "View" */
        }
      }
    } finally {
      running--
    }
  }

  /**
   * Counts those of these departments not asked yet, while the budget lasts.
   * Resolves when the calls it started are done.
   */
  async function count(ids: readonly string[]) {
    if (stop.signal.aborted) return
    const fresh = ids.filter((id) => !asked.has(id)).slice(0, Math.max(0, budget - asked.size))
    fresh.forEach((id) => asked.add(id))
    queue.push(...fresh)
    // Workers already under way take from the same queue.
    const more = Math.max(0, Math.min(AT_ONCE - running, queue.length))
    await Promise.all(Array.from({ length: more }, () => worker()))
  }

  /**
   * For an explicit refresh: the next count() asks again, with a new budget.
   * The counts known stay shown until new ones come in.
   */
  function forget() {
    queue.length = 0
    asked.clear()
  }

  return { counts, count, forget }
}
