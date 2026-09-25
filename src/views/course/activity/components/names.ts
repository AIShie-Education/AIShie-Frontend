// Names for what events point at. Events carry ids and a few facts, never
// titles, so the course's documents (document.list) and its grading scheme
// (component.tree) are each read once per course — only when an event about
// one of them is on the page — and shared by every event shown. Either read
// covers exactly what the caller may see; a refusal is remembered, and the
// event keeps a generic name.
import { reactive } from 'vue'
import { ApiError, read } from '@/api/http'

const documents = reactive(new Map<string, string>())
const components = reactive(new Map<string, { name: string; root: boolean }>())
const asked = new Map<string, Promise<void>>()

const PAGE = 200
const MAX_PAGES = 10

function once(key: string, load: () => Promise<void>): Promise<void> {
  const had = asked.get(key)
  if (had) return had
  const p = load().catch((e) => {
    // Refused: keep that answer. Anything else may be tried again later.
    if (!(e instanceof ApiError && e.isForbidden)) asked.delete(key)
  })
  asked.set(key, p)
  return p
}

/** The titles of the course's material, instructions and rubrics the caller may read. */
export function ensureDocumentTitles(courseId: string): Promise<void> {
  return once(`documents|${courseId}`, async () => {
    let after: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const out = await read('document.list', { course_id: courseId, include_archived: true, limit: PAGE, after })
      for (const d of out.documents ?? []) documents.set(d.id, d.title)
      if (!out.next) break
      after = out.next
    }
  })
}

export function documentTitle(id: string | null | undefined): string | undefined {
  return id ? documents.get(id) : undefined
}

/** The names of the course's grading components (needs grade_read, as the events about them do). */
export function ensureComponentNames(courseId: string): Promise<void> {
  return once(`components|${courseId}`, async () => {
    const out = await read('component.tree', { course_id: courseId })
    for (const c of out.components ?? []) components.set(c.id, { name: c.name, root: !c.parent_id })
  })
}

export function componentName(id: string | null | undefined): { name: string; root: boolean } | undefined {
  return id ? components.get(id) : undefined
}
