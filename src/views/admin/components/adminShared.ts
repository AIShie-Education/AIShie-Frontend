// What the administration pages share: finding one course by id, reading an
// id from the address in Core's form, and a list of actors seen recently
// (Core has no actor directory).
import { computed, ref, watch, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, read } from '@/api/http'
import type { Actor, ListItem } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { isUuid } from '@/utils/format'

/** A course as course.list gives it: the same shape as course.get. */
export type CourseRow = ListItem<'course.list', 'courses'>

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

/**
 * The id in route param `param`, the way Core writes ids (lower case), for
 * asking Core and comparing with what it returns. An id pasted in capitals
 * names the same thing, so the address is corrected in place.
 */
export function useCanonicalId(raw: () => string, param: string): ComputedRef<string> {
  const route = useRoute()
  const router = useRouter()
  const id = computed(() => raw().trim().toLowerCase())
  watch(
    raw,
    (v) => {
      if (!isUuid(v) || v === id.value || !route.name) return
      void router.replace({ name: route.name, params: { ...route.params, [param]: id.value }, query: route.query, hash: route.hash })
    },
    { immediate: true },
  )
  return id
}

// ---------------------------------------------------------------------------
// Actors seen recently
// ---------------------------------------------------------------------------

/**
 * An actor as the list keeps them: enough to find them again. Their email,
 * standing and platform role are left out on purpose: the list stays in this
 * browser after signing out, and the actor's own page reads those fresh.
 */
export interface RecentActor {
  id: string
  display_name: string
  kind: string
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

function isEntry(x: unknown): x is RecentActor {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return typeof e.id === 'string' && typeof e.display_name === 'string' && typeof e.kind === 'string' && typeof e.seen_at === 'string'
}

/** Only what RecentActor names, whatever else x carries. */
function minimal(x: RecentActor): RecentActor {
  return { id: x.id, display_name: x.display_name, kind: x.kind, seen_at: x.seen_at, registered: x.registered === true || undefined }
}

function load(owner: string): RecentActor[] {
  try {
    const raw = localStorage.getItem(storageKey(owner))
    if (!raw) return []
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const list = v.filter(isEntry).slice(0, MAX_RECENT).map(minimal)
    // A list kept before emails and roles were left out is rewritten without them.
    const clean = JSON.stringify(list)
    if (clean !== raw) localStorage.setItem(storageKey(owner), clean)
    return list
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

  function remember(a: Pick<Actor, 'id' | 'display_name' | 'kind'>, opts: { registered?: boolean } = {}) {
    const prev = recent.value.find((x) => x.id === a.id)
    const entry = minimal({
      id: a.id,
      display_name: a.display_name,
      kind: a.kind,
      seen_at: new Date().toISOString(),
      registered: opts.registered || prev?.registered,
    })
    recent.value = [entry, ...recent.value.filter((x) => x.id !== a.id)].slice(0, MAX_RECENT)
    save(owner, recent.value)
  }

  function forget(id: string) {
    recent.value = recent.value.filter((x) => x.id !== id)
    save(owner, recent.value)
  }

  function clear() {
    recent.value = []
    try {
      localStorage.removeItem(storageKey(owner))
    } catch {
      /* no storage: nothing was kept */
    }
  }

  return { recent, remember, forget, clear }
}
