// The people-and-agents directory's search and filters: read from the
// address, which keeps them, and turned into what actor.list is asked.
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { ToolIn } from '@/api/http'
import type { Actor } from '@/api/types'
import { isUuid } from '@/utils/format'

export const ACTOR_KINDS = ['human', 'agent', 'system'] as const
export const ACTOR_STATUSES = ['active', 'suspended'] as const
/** A platform role to filter by: `none` is those who hold neither. */
export const PLATFORM_ROLE_FILTERS = ['root', 'admin', 'none'] as const

/** The longest search Core takes: the longest an email address can be. */
export const MAX_SEARCH = 254

export interface DirectoryFilters {
  /** The search box: part of a name or an email address, or an actor id. */
  q: string
  /** One kind, or '' for people and agents: the system actor only when asked for. */
  kind: (typeof ACTOR_KINDS)[number] | ''
  status: (typeof ACTOR_STATUSES)[number] | ''
  role: (typeof PLATFORM_ROLE_FILTERS)[number] | ''
}

function first(v: LocationQuery[string] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : ''
}

function oneOf<T extends string>(v: string, allowed: readonly T[]): T | '' {
  return (allowed as readonly string[]).includes(v) ? (v as T) : ''
}

/**
 * The filters an address asks for. A value Core would refuse (an unknown
 * kind, a search longer than it takes) is dropped or cut, so that an edited
 * or old link still opens the directory.
 */
export function filtersFromQuery(query: LocationQuery): DirectoryFilters {
  return {
    q: [...first(query.q)].slice(0, MAX_SEARCH).join(''),
    kind: oneOf(first(query.kind), ACTOR_KINDS),
    status: oneOf(first(query.status), ACTOR_STATUSES),
    role: oneOf(first(query.role), PLATFORM_ROLE_FILTERS),
  }
}

/** The address's query for these filters: only what is set. */
export function queryFromFilters(f: DirectoryFilters): LocationQueryRaw {
  return {
    q: f.q.trim() || undefined,
    kind: f.kind || undefined,
    status: f.status || undefined,
    role: f.role || undefined,
  }
}

/**
 * The actor id in the search box, if that is what it holds: actor.list
 * matches names and addresses only, so an id pasted from elsewhere is
 * looked up as it is (actor.get), whatever the filters.
 */
export function searchedId(f: DirectoryFilters): string | null {
  const q = f.q.trim()
  return isUuid(q) ? q.toLowerCase() : null
}

/** What actor.list is asked for one page of the directory. */
export function listArgs(f: DirectoryFilters, after: string | undefined, limit: number): ToolIn<'actor.list'> {
  return {
    q: f.q.trim() || undefined,
    kind: f.kind || undefined,
    status: f.status || undefined,
    platform_role: f.role || undefined,
    after,
    limit,
  }
}

/** Whether the directory leaves this actor out for its kind: the system actor, unless asked for. */
export function hiddenByKind(a: Pick<Actor, 'kind'>, f: DirectoryFilters): boolean {
  return f.kind ? a.kind !== f.kind : a.kind === 'system'
}

/**
 * Whether these filters take in an actor Core did not list here, someone
 * just registered, as actor.list would: q is part of the name or the email
 * address in any case, and `none` is no platform role.
 */
export function matches(a: Actor, f: DirectoryFilters): boolean {
  if (hiddenByKind(a, f)) return false
  if (f.status && a.status !== f.status) return false
  if (f.role && (a.platform_role ?? 'none') !== f.role) return false
  const q = f.q.trim().toLowerCase()
  return !q || a.display_name.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q)
}
