// Names for what the course's feed and its actions say about groups
// (activity's EventItem, GroupProposal, ActionTarget, FieldsView): events and
// actions carry ids, never names, so the course's group sets, archived ones
// too, are read (group_set.list) when something about one is on the page, and
// shared by everything shown. The read shows exactly what the caller may see:
// a student is named every set and group, as the Groups tab names them, and
// the members of their own group alone.
//
// What was read goes stale as sets and groups are made and renamed, here or
// by someone else, while the page stays open. So the names are read again:
// - when an id is asked about that the last read did not know, unless a read
//   begun since it was first asked about did not find it either (it is not
//   the caller's to see, and asking again would find nothing more);
// - when the last read is older than MAX_AGE, the next time names are asked for;
// - after the caller's own change to the course's groups (forgetGroupNames),
//   which the group pages and a decision carried out call.
// A refusal is remembered (until forgotten), and the thing keeps a generic name.
import { reactive } from 'vue'
import { ApiError, read } from '@/api/http'

/** How long a read of the names serves before it is read again, the next time they are asked for. */
export const MAX_AGE_MS = 2 * 60_000

const sets = reactive(new Map<string, string>())
const groups = reactive(new Map<string, { name: string; setId: string }>())

interface Held {
  promise: Promise<void>
  /** When the read began. */
  began: number
  /** When it ended, once it has. */
  ended: number | null
  refused: boolean
  /** Ids asked about that a read begun after they were asked about did not find. */
  missed: Set<string>
  /** Ids asked about while this read was on its way: the next read is the one to settle them. */
  waiting: Map<string, number>
}
const held = new Map<string, Held>()

const known = (id: string) => sets.has(id) || groups.has(id)

function load(courseId: string, before: Held | undefined): Promise<void> {
  const h: Held = {
    promise: Promise.resolve(),
    began: Date.now(),
    ended: null,
    refused: false,
    missed: new Set(before?.missed ?? []),
    waiting: new Map(),
  }
  // Ids first asked about before this read began, and still not known after it, are not the caller's to see.
  const settle = new Map(before?.waiting ?? [])
  h.promise = read('group_set.list', { course_id: courseId, include_archived: true })
    .then((out) => {
      for (const s of out.sets ?? []) {
        sets.set(s.id, s.name)
        for (const g of s.groups ?? []) groups.set(g.id, { name: g.name, setId: s.id })
      }
      for (const [id, at] of settle) if (at <= h.began && !known(id)) h.missed.add(id)
    })
    .catch((e) => {
      // Refused: keep that answer. Anything else may be tried again later.
      if (e instanceof ApiError && e.isForbidden) h.refused = true
      else if (held.get(courseId) === h) held.delete(courseId)
    })
    .finally(() => {
      h.ended = Date.now()
    })
  held.set(courseId, h)
  return h.promise
}

/**
 * Reads the course's sets and groups where what is held may not name the
 * ids given (or is old), and waits for any read on its way.
 */
export function ensureGroupNames(courseId: string, ids: readonly (string | null | undefined)[] = []): Promise<void> {
  const h = held.get(courseId)
  if (!h) return load(courseId, undefined)
  if (h.refused) return h.promise
  const unknown = ids.filter((id): id is string => !!id && !known(id) && !h.missed.has(id))
  if (h.ended === null) {
    // On its way: whatever it does not find of these, the next read settles.
    const now = Date.now()
    for (const id of unknown) if (!h.waiting.has(id)) h.waiting.set(id, now)
    return unknown.length ? h.promise.then(() => ensureGroupNames(courseId, ids)) : h.promise
  }
  const stale = Date.now() - h.ended > MAX_AGE_MS
  if (!unknown.length && !stale) return h.promise
  // Asked about now, before the read below begins: what it does not find is not to be found.
  const now = Date.now()
  for (const id of unknown) h.waiting.set(id, Math.min(h.waiting.get(id) ?? now, now))
  return load(courseId, h)
}

/** Forgets what was read, after the sets or their groups changed (made, renamed, a split): the next ask reads them again. */
export function forgetGroupNames(courseId: string | null | undefined) {
  if (courseId) held.delete(courseId)
}

export function groupSetName(id: string | null | undefined): string | undefined {
  return id ? sets.get(id) : undefined
}

export function groupName(id: string | null | undefined): { name: string; set?: string; setId: string } | undefined {
  const g = id ? groups.get(id) : undefined
  return g ? { name: g.name, set: sets.get(g.setId), setId: g.setId } : undefined
}
