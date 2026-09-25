// What the administration pages share: finding one course by id, a list of
// actors seen recently (Core has no actor directory), and where agents
// connect.
import { onScopeDispose, ref } from 'vue'
import { ApiError, MCP_ENDPOINT, read } from '@/api/http'
import type { Actor, ListItem } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { isUuid } from '@/utils/format'

/** A course as course.list gives it: the same shape as course.get. */
export type CourseRow = ListItem<'course.list', 'courses'>

/** Wide enough for a form, narrow enough for a phone. */
export const DIALOG_WIDTH = 'min(560px, 94vw)'

/** The default identity provider name, as Core records it (OIDC_PROVIDER_NAME). */
export const DEFAULT_SSO_PROVIDER = 'polyu-adfs'

/**
 * The UUID just before id in the order Postgres sorts UUIDs (byte by byte,
 * which is the order of the hex digits as one big number).
 */
export function uuidPredecessor(id: string): string | null {
  const hex = id.trim().replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) return null
  const n = BigInt('0x' + hex)
  if (n === 0n) return null
  const p = (n - 1n).toString(16).padStart(32, '0')
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-${p.slice(12, 16)}-${p.slice(16, 20)}-${p.slice(20)}`
}

/**
 * One course, read as an administrator. course.get needs a seat in the
 * course; course.list does not, and pages in id order after a cursor, so
 * asking for the one course after the id just before this one finds it in a
 * single call.
 */
export async function findCourse(id: string, notFoundMessage: string): Promise<CourseRow> {
  const want = id.trim().toLowerCase()
  const after = isUuid(want) ? uuidPredecessor(want) : null
  if (after) {
    const out = await read('course.list', { after, limit: 1 })
    const c = (out.courses ?? [])[0]
    if (c && c.id.toLowerCase() === want) return c
  }
  throw new ApiError({ status: 404, code: 'not_found', message: notFoundMessage })
}

/** Where an agent's MCP client connects: Core's origin, /mcp. */
export function mcpEndpoint(): string {
  return MCP_ENDPOINT
}

// ---------------------------------------------------------------------------
// Actors seen recently
// ---------------------------------------------------------------------------

export interface RecentActor {
  id: string
  display_name: string
  kind: string
  email?: string | null
  status?: string
  platform_role?: string | null
  /** When this browser last saw them. */
  seen_at: string
  /** Registered from this browser. */
  registered?: boolean
}

/** What actor.register was given, with the id it returned. */
export interface RegisteredActor {
  id: string
  kind: 'human' | 'agent'
  display_name: string
  email: string | null
  platform_role: string | null
}

const MAX_RECENT = 30
const recent = ref<RecentActor[]>([])
let loadedFor: string | null = null

function storageKey(owner: string) {
  return `aishiteru.admin.recentActors.${owner}`
}

function load(owner: string): RecentActor[] {
  try {
    const raw = localStorage.getItem(storageKey(owner))
    if (!raw) return []
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter((x) => x && typeof x.id === 'string' && typeof x.display_name === 'string').slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function save(owner: string, list: RecentActor[]) {
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(list))
  } catch {
    /* no storage: the list lasts as long as the page */
  }
}

/**
 * Actors this administrator registered or looked up, newest first, kept in
 * this browser for them alone. It makes the actor pages usable without a
 * directory, which Core deliberately does not have.
 */
export function useRecentActors() {
  const session = useSessionStore()
  const owner = session.me?.id ?? 'anonymous'
  if (loadedFor !== owner) {
    recent.value = load(owner)
    loadedFor = owner
  }

  function remember(a: Pick<Actor, 'id' | 'display_name' | 'kind'> & Partial<Actor>, opts: { registered?: boolean } = {}) {
    const prev = recent.value.find((x) => x.id === a.id)
    const entry: RecentActor = {
      id: a.id,
      display_name: a.display_name,
      kind: a.kind,
      email: a.email ?? null,
      status: a.status ?? prev?.status,
      platform_role: a.platform_role ?? null,
      seen_at: new Date().toISOString(),
      registered: opts.registered || prev?.registered || undefined,
    }
    recent.value = [entry, ...recent.value.filter((x) => x.id !== a.id)].slice(0, MAX_RECENT)
    save(owner, recent.value)
  }

  function forget(id: string) {
    recent.value = recent.value.filter((x) => x.id !== id)
    save(owner, recent.value)
  }

  function clear() {
    recent.value = []
    save(owner, [])
  }

  return { recent, remember, forget, clear }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Whether the window is at most `px` wide, kept up to date. */
export function useNarrow(px = 640) {
  const narrow = ref(false)
  if (typeof window === 'undefined' || !window.matchMedia) return narrow
  const mq = window.matchMedia(`(max-width: ${px}px)`)
  const update = () => (narrow.value = mq.matches)
  update()
  mq.addEventListener('change', update)
  onScopeDispose(() => mq.removeEventListener('change', update))
  return narrow
}
