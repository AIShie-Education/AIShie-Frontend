// What the composer's @ offers: the course's assignments and materials, the
// ones the caller may read (assignment.list, document.list with kind
// material, the same reads as the Assignments and Materials pages), by their
// titles. Picking one writes its title into the message, in quotes, where
// the agent reads it and finds the item by that title with its own tools:
// nothing but words is sent. Read once per course when the @ is first typed,
// and kept for a minute.
import { read } from '@/api/http'

export type MentionKind = 'assignment' | 'material'

export interface Mention {
  kind: MentionKind
  id: string
  title: string
}

/** How long the list read for a course is kept. */
export const MENTIONS_TTL_MS = 60_000
/** At most this many of each are read (Core's largest page). */
const PAGE = 200

const cache = new Map<string, { at: number; items: Promise<Mention[]> }>()

async function readAll(courseId: string): Promise<Mention[]> {
  const [assignments, materials] = await Promise.all([
    read('assignment.list', { course_id: courseId, limit: PAGE })
      .then((o) => o.assignments ?? [])
      .catch(() => []),
    read('document.list', { course_id: courseId, kind: 'material', limit: PAGE })
      .then((o) => o.documents ?? [])
      .catch(() => []),
  ])
  return [
    ...assignments.map((a) => ({ kind: 'assignment' as const, id: a.id, title: a.title })),
    ...materials
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
      .map((d) => ({ kind: 'material' as const, id: d.id, title: d.title })),
  ].filter((m) => m.title.trim())
}

/** The course's assignments, then its materials, as the caller may read them. */
export function courseMentions(courseId: string, now = Date.now()): Promise<Mention[]> {
  const held = cache.get(courseId)
  if (held && now - held.at < MENTIONS_TTL_MS) return held.items
  const items = readAll(courseId)
  cache.set(courseId, { at: now, items })
  return items
}

/** Forgets what was read (tests). */
export function forgetMentions() {
  cache.clear()
}

/**
 * The mentions whose title holds the query (any case, anywhere in it), those
 * that begin with it first, at most limit of them.
 */
export function matchMentions(items: readonly Mention[], query: string, limit = 8): Mention[] {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return items.slice(0, limit)
  const starts: Mention[] = []
  const within: Mention[] = []
  for (const m of items) {
    const title = m.title.toLocaleLowerCase()
    if (title.startsWith(q)) starts.push(m)
    else if (title.includes(q)) within.push(m)
  }
  return [...starts, ...within].slice(0, limit)
}

// --- What is being typed ---------------------------------------------------------

/** The characters that start a command or a mention, as a keyboard or an input method types them. */
const SLASH = /^[/／]/
const AT = /[@＠]/

export type ComposerTrigger = { kind: 'slash'; query: string } | { kind: 'mention'; start: number; query: string }

/**
 * What the text before the caret asks for: a command, while the whole text
 * is a slash and a word (/new); a mention, while an @ at the start or after
 * a space is followed by no space up to the caret (@HW1); or nothing.
 */
export function triggerAt(text: string, caret: number): ComposerTrigger | null {
  const slash = /^[/／]([A-Za-z]*)$/.exec(text)
  if (slash && caret === text.length && SLASH.test(text)) return { kind: 'slash', query: slash[1]!.toLowerCase() }
  const before = text.slice(0, caret)
  for (let i = before.length - 1; i >= 0 && before.length - i <= 41; i--) {
    const c = before[i]!
    if (/\s/.test(c)) return null
    if (AT.test(c)) {
      if (i > 0 && !/\s/.test(before[i - 1]!)) return null
      return { kind: 'mention', start: i, query: before.slice(i + 1) }
    }
  }
  return null
}
