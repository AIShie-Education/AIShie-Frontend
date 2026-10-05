// Names for what the course's feed says about groups (activity's EventItem):
// its events carry ids, never names, so the course's group sets, archived
// ones too, are read once (group_set.list) when an event about one is on
// the page, and shared by every event shown. The read shows exactly what
// the caller may see: a student is named every set and group, as the
// Groups tab names them, and the members of their own group alone. A
// refusal is remembered, and the event keeps a generic name.
import { reactive } from 'vue'
import { ApiError, read } from '@/api/http'

const sets = reactive(new Map<string, string>())
const groups = reactive(new Map<string, { name: string; setId: string }>())
const asked = new Map<string, Promise<void>>()

/** Reads the course's sets and groups, once. */
export function ensureGroupNames(courseId: string): Promise<void> {
  const had = asked.get(courseId)
  if (had) return had
  const p = read('group_set.list', { course_id: courseId, include_archived: true })
    .then((out) => {
      for (const s of out.sets ?? []) {
        sets.set(s.id, s.name)
        for (const g of s.groups ?? []) groups.set(g.id, { name: g.name, setId: s.id })
      }
    })
    .catch((e) => {
      // Refused: keep that answer. Anything else may be tried again later.
      if (!(e instanceof ApiError && e.isForbidden)) asked.delete(courseId)
    })
  asked.set(courseId, p)
  return p
}

/** Forgets what was read, after the sets or their groups changed (a rename, a split). */
export function forgetGroupNames(courseId: string) {
  asked.delete(courseId)
}

export function groupSetName(id: string | null | undefined): string | undefined {
  return id ? sets.get(id) : undefined
}

export function groupName(id: string | null | undefined): { name: string; set?: string } | undefined {
  const g = id ? groups.get(id) : undefined
  return g ? { name: g.name, set: sets.get(g.setId) } : undefined
}
