// Who acted, for the events of the action log (action.proposed, approved,
// rejected, cancelled, reviewed, escalated). An event carries no actor:
// Core's event.list gives what happened and to what, never by whom. The
// action an action event is about does say it (action.get: the seat that
// made it, member_id; the one that decided it, decided_by_member_id; the
// one that reviewed it, reviewed_by_member_id), and those who may see these
// events (action_decide, or the proposer, for its own) may read it. So each
// action is read once, a few at a time, and kept for the page's life, as the
// feed's names are (names.ts). An action that cannot be read names nobody.
import { reactive } from 'vue'
import { read } from '@/api/http'

export interface ActionWho {
  /** The seat that made it (proposed it, or did it). */
  by: string | null
  decidedBy: string | null
  reviewedBy: string | null
}

const who = reactive(new Map<string, ActionWho | null>())
const asked = new Set<string>()
/** Read again once, when an event of its decision came after it was read undecided. */
const again = new Set<string>()
const waiting: (() => Promise<void>)[] = []
const AT_ONCE = 4
let running = 0

const key = (courseId: string, actionId: string) => `${courseId}|${actionId}`

function next() {
  while (running < AT_ONCE && waiting.length) {
    const job = waiting.shift()!
    running++
    void job().finally(() => {
      running--
      next()
    })
  }
}

/**
 * Reads who made, decided and reviewed an action, once; actionWho says it
 * once known. `decided`: the event says it was decided or reviewed, so one
 * read before that is read again, once.
 */
export function ensureActionWho(courseId: string, actionId: string | null | undefined, decided = false) {
  if (!actionId) return
  const k = key(courseId, actionId)
  if (asked.has(k)) {
    const w = who.get(k)
    if (!decided || !w || w.decidedBy || w.reviewedBy || again.has(k)) return
    again.add(k)
  }
  asked.add(k)
  waiting.push(async () => {
    try {
      const a = await read('action.get', { course_id: courseId, action_id: actionId })
      who.set(k, {
        by: a.member_id ?? null,
        decidedBy: a.decided_by_member_id ?? null,
        reviewedBy: a.reviewed_by_member_id ?? null,
      })
    } catch {
      who.set(k, null)
    }
  })
  next()
}

/** Who made, decided and reviewed an action, once read; undefined until then, null when it cannot be read. */
export function actionWho(courseId: string, actionId: string | null | undefined): ActionWho | null | undefined {
  return actionId ? who.get(key(courseId, actionId)) : undefined
}

/** For the tests: forgets everything read. */
export function forgetActionWho() {
  who.clear()
  asked.clear()
  again.clear()
  waiting.length = 0
}
