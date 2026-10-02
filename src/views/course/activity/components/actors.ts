// Who acted, for an event of the feed. An event names no actor of its own,
// but nearly every one names the action it was done under (action_id: Core
// files every event an action emits under it, and an approved proposal's
// under the proposal), and the action says who made it (action.get:
// member_id) and who decided it (decided_by_member_id) or reviewed it
// (reviewed_by_member_id). The action log's own events (action.proposed,
// approved, …) are about an action, their subject. So for each event, the
// action that says who acted is read once, a few at a time, and kept for the
// page's life, as the feed's names are (names.ts). Only a seat that decides
// actions (action_decide) may read an action that is not its own, so only
// such a seat asks (whoActionOf's `decides`); an action that cannot be read
// names nobody.
import { reactive } from 'vue'
import { read } from '@/api/http'
import type { CourseEvent } from '@/api/types'

export interface ActionWho {
  /** The seat that made it (proposed it, or did it). */
  by: string | null
  decidedBy: string | null
  reviewedBy: string | null
}

/** One part of the line that says who acted: a seat, and the words for what it did (activity.who.*). */
export interface WhoPart {
  id: string
  key: string
}

/** What the action log's events say of who acted: the verb for its maker, and for whoever decided or reviewed it. */
const LOG: Record<string, { by: 'proposed' | 'did'; then?: 'approved' | 'rejected' | 'reviewed' | 'escalated' }> = {
  'action.proposed': { by: 'proposed' },
  'action.approved': { by: 'proposed', then: 'approved' },
  'action.rejected': { by: 'proposed', then: 'rejected' },
  'action.cancelled': { by: 'proposed' },
  'action.reviewed': { by: 'did', then: 'reviewed' },
  'action.escalated': { by: 'did', then: 'escalated' },
}

/**
 * The action that says who acted in an event, where the caller may read it:
 * the one an event of the action log is about, or the one any other event
 * was done under. `decided`: the event says it was decided or reviewed, so
 * a read from before that is read again. Null for a seat that does not
 * decide actions (Core refuses it the read), and for an event of no action.
 */
export function whoActionOf(e: CourseEvent, decides: boolean): { id: string; decided: boolean } | null {
  if (!decides) return null
  const log = LOG[e.type]
  if (log) return e.subject_id ? { id: e.subject_id, decided: !!log.then } : null
  if (e.type.startsWith('action.')) return null
  return e.action_id ? { id: e.action_id, decided: false } : null
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

/** Reads, once, who acted in an event, where the caller may know it (whoActionOf). */
export function ensureEventWho(courseId: string, e: CourseEvent, decides: boolean) {
  const a = whoActionOf(e, decides)
  if (a) ensureActionWho(courseId, a.id, a.decided)
}

/** Who made, decided and reviewed an action, once read; undefined until then, null when it cannot be read. */
export function actionWho(courseId: string, actionId: string | null | undefined): ActionWho | null | undefined {
  return actionId ? who.get(key(courseId, actionId)) : undefined
}

/**
 * Who acted in an event, as the parts of its line, once read: for the
 * action log's events, who proposed or did the action, then who decided or
 * reviewed it; for any other, who did it, or who proposed it and who
 * approved it when it was approved. Empty while unknown.
 */
export function eventWho(courseId: string, e: CourseEvent, decides: boolean): WhoPart[] {
  const a = whoActionOf(e, decides)
  const w = a ? actionWho(courseId, a.id) : undefined
  if (!a || !w) return []
  const out: WhoPart[] = []
  const log = LOG[e.type]
  if (log) {
    if (w.by) out.push({ id: w.by, key: `activity.who.${log.by}` })
    const then = log.then === 'reviewed' || log.then === 'escalated' ? w.reviewedBy : w.decidedBy
    if (log.then && then) out.push({ id: then, key: `activity.who.${log.then}` })
    return out
  }
  if (!w.by) return out
  if (w.decidedBy && w.decidedBy !== w.by) {
    out.push({ id: w.by, key: 'activity.who.proposed' })
    out.push({ id: w.decidedBy, key: 'activity.who.approved' })
  } else out.push({ id: w.by, key: 'activity.who.did' })
  return out
}

/** The seat that made the action an event was done under (or is about), once read. */
export function eventActor(courseId: string, e: CourseEvent, decides: boolean): string | null | undefined {
  const a = whoActionOf(e, decides)
  return a ? actionWho(courseId, a.id)?.by : undefined
}

/** For the tests: forgets everything read. */
export function forgetActionWho() {
  who.clear()
  asked.clear()
  again.clear()
  waiting.length = 0
}
