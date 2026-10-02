// Who acted, for an event of the feed. An event names no actor of its own,
// but nearly every one names the action it was done under (action_id: Core
// files every event an action emits under it, and an approved proposal's
// under the proposal), and the action says who made it (member_id) and who
// decided it (decided_by_member_id) or reviewed it (reviewed_by_member_id).
// The action log's own events (action.proposed, approved, …) are about an
// action, their subject. So for each event, the action that says who acted
// is read once, a few at a time, and kept for the page's life, as the feed's
// names are (names.ts).
//
// What may be read of it depends on the seat (WhoReach). A seat that decides
// actions (action_decide) reads any (action.get). Any other reads its own
// actions, in the list of them (action.list_mine), and, where it owns an
// agent seated here, that agent's (action.get, which Core lets an agent's
// owner read whatever they hold); it is never asked of an action that is
// neither, as far as the event tells: only of one about the caller's own
// work, which is where an agent of theirs acts. Of anyone else's action, such
// a seat learns nothing: it names nobody.
import { reactive } from 'vue'
import { read } from '@/api/http'
import type { CourseEvent } from '@/api/types'

export interface ActionWho {
  /** The seat that made it (proposed it, or did it). */
  by: string | null
  decidedBy: string | null
  reviewedBy: string | null
  /** Known to be the caller's own agent, by the name it has (agent.list), where the member list cannot say. */
  byAgent?: { name: string | null }
}

/** One part of the line that says who acted: a seat, and the words for what it did (activity.who.*). */
export interface WhoPart {
  id: string
  key: string
  /** The caller's own agent, by name, where the member list cannot say (ActionWho.byAgent). */
  agent?: { name: string | null }
}

/** What the caller may read of who acted (see the top). */
export interface WhoReach {
  /** Holds action_decide: reads any action. */
  decides: boolean
  /** The caller's own seat, whose actions it reads in its own list. */
  me: string | null
  /** Owns an agent seated here (the course store's ownsAgentHere). */
  ownsAgent: boolean
}

/** A seat that reads nothing of who acted. */
export const NO_REACH: WhoReach = { decides: false, me: null, ownsAgent: false }

/** What the action log's events say of who acted: the verb for its maker, and for whoever decided or reviewed it. */
const LOG: Record<
  string,
  { by: 'proposed' | 'did'; then?: 'approved' | 'rejected' | 'changesRequested' | 'reviewed' | 'escalated' }
> = {
  'action.proposed': { by: 'proposed' },
  'action.approved': { by: 'proposed', then: 'approved' },
  'action.rejected': { by: 'proposed', then: 'rejected' },
  'action.changes_requested': { by: 'proposed', then: 'changesRequested' },
  'action.cancelled': { by: 'proposed' },
  'action.reviewed': { by: 'did', then: 'reviewed' },
  'action.escalated': { by: 'did', then: 'escalated' },
}

/** A chat's messages, left out of the caller's own actions: the feed's chat events are not looked up in them. */
const CHAT = ['conversation.ask', 'conversation.answer']
const PAGE = 200

/**
 * The action that says who acted in an event: the one an event of the action
 * log is about, or the one any other event was done under. `decided`: the
 * event says it was decided or reviewed, so a read from before that is read
 * again. Null for a seat that reads nothing of it, and for an event of no
 * action.
 */
export function whoActionOf(e: CourseEvent, reach: WhoReach): { id: string; decided: boolean } | null {
  if (!reach.decides && !reach.me) return null
  const log = LOG[e.type]
  if (log) return e.subject_id ? { id: e.subject_id, decided: !!log.then } : null
  if (e.type.startsWith('action.')) return null
  return e.action_id ? { id: e.action_id, decided: false } : null
}

const who = reactive(new Map<string, ActionWho | null>())
const asked = new Set<string>()
/** Read again once, when an event of its decision came after it was read undecided. */
const again = new Set<string>()
/** Not the caller's own, and not asked of as their agent's: asked again once they are known to own one. */
const notMine = new Set<string>()
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

interface Row {
  member_id?: string | null
  decided_by_member_id?: string | null
  reviewed_by_member_id?: string | null
}
const whoOf = (a: Row): ActionWho => ({
  by: a.member_id ?? null,
  decidedBy: a.decided_by_member_id ?? null,
  reviewedBy: a.reviewed_by_member_id ?? null,
})

/**
 * The caller's own actions in a course (action.list_mine), by id, read from
 * where the last read ended, or from the start again (`full`) for what was
 * decided since. Calls made while one read is under way are answered by one
 * more read after it.
 */
interface Mine {
  rows: Map<string, ActionWho>
  last?: string
  wanted: number
  pulled: number
  full: boolean
  running: Promise<void> | null
}
const mines = new Map<string, Mine>()

async function pull(courseId: string, m: Mine, full: boolean) {
  let after = full ? undefined : m.last
  for (;;) {
    const out = await read('action.list_mine', { course_id: courseId, exclude_types: CHAT, limit: PAGE, after })
    const rows = out.actions ?? []
    for (const a of rows) m.rows.set(a.id, whoOf(a))
    if (rows.length && (!m.last || rows[rows.length - 1]!.id > m.last)) m.last = rows[rows.length - 1]!.id
    if (!out.next) return
    after = out.next
  }
}

function syncMine(courseId: string, full: boolean): Promise<void> {
  let m = mines.get(courseId)
  if (!m) mines.set(courseId, (m = { rows: new Map(), wanted: 0, pulled: 0, full: false, running: null }))
  const mine = m
  mine.wanted++
  if (full) mine.full = true
  mine.running ??= (async () => {
    try {
      while (mine.pulled < mine.wanted) {
        const upTo = mine.wanted
        const f = mine.full
        mine.full = false
        try {
          await pull(courseId, mine, f)
        } catch {
          // What could not be read names nobody.
        }
        mine.pulled = upTo
      }
    } finally {
      mine.running = null
    }
  })()
  return mine.running
}

/** The caller's own agents' names, by actor (agent.list), read once. */
let agents: Promise<Map<string, string>> | null = null
function agentNames(): Promise<Map<string, string>> {
  agents ??= read('agent.list', {})
    .then((o) => new Map((o.agents ?? []).map((a) => [a.actor_id, a.display_name])))
    .catch(() => new Map())
  return agents
}

/**
 * Reads who made, decided and reviewed an action, once, where the caller
 * may (WhoReach); actionWho says it once known. `decided`: the event says it
 * was decided or reviewed, so one read before that is read again, once.
 * `asOwner`: a seat that does not decide may ask it as its agent's.
 */
export function ensureActionWho(
  courseId: string,
  actionId: string | null | undefined,
  reach: WhoReach,
  decided = false,
  asOwner = false,
) {
  if (!actionId || (!reach.decides && !reach.me)) return
  const k = key(courseId, actionId)
  let full = false
  if (asked.has(k)) {
    const w = who.get(k)
    if (w === undefined) return
    if (w === null && asOwner && notMine.delete(k)) {
      // Not the caller's own: now asked of as their agent's.
    } else {
      if (!decided || !w || w.decidedBy || w.reviewedBy || again.has(k)) return
      again.add(k)
      full = true
    }
  }
  asked.add(k)
  waiting.push(async () => {
    if (!reach.decides) {
      await syncMine(courseId, full)
      const row = mines.get(courseId)?.rows.get(actionId)
      if (row) return void who.set(k, row)
      if (!asOwner) {
        notMine.add(k)
        return void who.set(k, null)
      }
    }
    try {
      const a = await read('action.get', { course_id: courseId, action_id: actionId })
      // Read as an agent's owner, it is that agent's.
      who.set(
        k,
        reach.decides ? whoOf(a) : { ...whoOf(a), byAgent: { name: (await agentNames()).get(a.actor_id) ?? null } },
      )
    } catch {
      who.set(k, null)
    }
  })
  next()
}

/** Reads, once, who acted in an event, where the caller may know it (WhoReach). */
export function ensureEventWho(courseId: string, e: CourseEvent, reach: WhoReach) {
  const a = whoActionOf(e, reach)
  if (!a) return
  // An agent of the caller's acts on the caller's own work.
  const asOwner = !reach.decides && reach.ownsAgent && !!reach.me && e.student_member_id === reach.me
  ensureActionWho(courseId, a.id, reach, a.decided, asOwner)
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
export function eventWho(courseId: string, e: CourseEvent, reach: WhoReach): WhoPart[] {
  const a = whoActionOf(e, reach)
  const w = a ? actionWho(courseId, a.id) : undefined
  if (!a || !w) return []
  const out: WhoPart[] = []
  const by = (key: string): WhoPart => ({ id: w.by!, key, ...(w.byAgent ? { agent: w.byAgent } : {}) })
  const log = LOG[e.type]
  if (log) {
    if (w.by) out.push(by(`activity.who.${log.by}`))
    const then = log.then === 'reviewed' || log.then === 'escalated' ? w.reviewedBy : w.decidedBy
    if (log.then && then) out.push({ id: then, key: `activity.who.${log.then}` })
    return out
  }
  if (!w.by) return out
  if (w.decidedBy && w.decidedBy !== w.by) {
    out.push(by('activity.who.proposed'))
    out.push({ id: w.decidedBy, key: 'activity.who.approved' })
  } else out.push(by('activity.who.did'))
  return out
}

/**
 * The seat that made the action an event was done under (or is about), once
 * read, and whether it is known to be the caller's own agent.
 */
export function eventActor(
  courseId: string,
  e: CourseEvent,
  reach: WhoReach,
): { id: string | null; agent: boolean } | null | undefined {
  const a = whoActionOf(e, reach)
  const w = a ? actionWho(courseId, a.id) : undefined
  return w ? { id: w.by, agent: !!w.byAgent } : w
}

/** For the tests: forgets everything read. */
export function forgetActionWho() {
  who.clear()
  asked.clear()
  again.clear()
  notMine.clear()
  mines.clear()
  agents = null
  waiting.length = 0
}
