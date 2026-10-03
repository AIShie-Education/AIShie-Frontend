// OpenRouter's upstream routing on an offer of the school's plan: its
// provider object (order, only, ignore, fallbacks, data policy, ZDR and the
// rest), which the runtime sends with every call made on the offer, and the
// upstream providers OpenRouter lists for the offer's model
// (runtimeAdmin.openRouterEndpoints). For display and for the form: the
// runtime validates and decides, by the same rules.
//
// The page holds the routing as a form (RoutingForm), and sends it in its
// canonical form (canonicalRouting, routingFromForm): the members set, in
// OpenRouter's order, a percentile's {p50} alone as the bare number, a
// highest price as a decimal string. The runtime stores, answers and sends
// the same object, so that the preview is what OpenRouter is sent, byte for
// byte.
//
// What the table works out (candidates, routingWarnings, highestPrices) is
// from OpenRouter's public lists: which upstream providers the routing
// leaves to answer, and whether they call tools. Nothing is worked out for
// data_collection: OpenRouter's lists do not say who keeps data, and the page
// says nothing it cannot know.
import type {
  OpenRouterEndpoint,
  OpenRouterEndpoints,
  OpenRouterQuantization,
  OpenRouterRouting,
  OpenRouterSortBy,
  Percentiles,
  USD,
} from '@/api/runtime-types'
import { OPENROUTER_QUANTIZATIONS, OPENROUTER_SORTS } from '@/api/runtime-types'

/** The provider whose offers take upstream routing. */
export const OPENROUTER = 'openrouter'

/** An upstream provider's slug, as OpenRouter's tags are: groq, deepinfra/turbo, google-vertex/global/flex. */
export const SLUG_SHAPE = /^[a-z0-9][a-z0-9-]{0,63}(?:\/[a-z0-9][a-z0-9._-]{0,63}){0,3}$/
export const SLUG_MAX = 128
/** A model's ID as the endpoint list takes it: author/slug, a variant (:nitro) allowed. */
export const MODEL_ID = /^[^/\s]+\/[^/\s]+$/
export const THROUGHPUT_MAX = 100_000
export const LATENCY_MAX = 600
export const PRICE_MAX = 1_000_000
/** The runtime's own bound on an answer's length, where an offer sets none. */
export const DEFAULT_MAX_OUTPUT = 4000
/** How long typing the model waits before its upstream providers are asked for. */
export const ENDPOINTS_DEBOUNCE_MS = 600

export const PERCENTILES = ['p50', 'p75', 'p90', 'p99'] as const
export type Percentile = (typeof PERCENTILES)[number]
export const PRICE_KEYS = ['prompt', 'completion', 'request', 'image'] as const
export type PriceKey = (typeof PRICE_KEYS)[number]
export const LISTS = ['order', 'only', 'ignore'] as const

/** Which upstream providers may answer: all but those turned off (ignore), or only those turned on (only). */
export type RoutingMode = 'all' | 'only'

/** The routing as the offer's dialog holds it. */
export interface RoutingForm {
  mode: RoutingMode
  /** Tried first, in this order. */
  order: string[]
  only: string[]
  ignore: string[]
  /** null: not set (OpenRouter's default). */
  allowFallbacks: boolean | null
  requireParameters: boolean | null
  dataCollection: 'allow' | 'deny' | null
  zdr: boolean | null
  /** Not offered by the page: kept as read. */
  enforceDistillableText: boolean | null
  quantizations: OpenRouterQuantization[]
  /** '' for OpenRouter's own balance of price and uptime. */
  sortBy: OpenRouterSortBy | ''
  /** Not offered by the page: kept as read, while sortBy is set. */
  sortPartition: 'model' | 'none' | null
  throughput: Record<Percentile, number | null>
  latency: Record<Percentile, number | null>
  /** Dollars as typed; '' for none. */
  maxPrice: Record<PriceKey, string>
  /** Slugs added by hand: rows of their own until the routing names them. */
  added: string[]
}

const noPercentiles = (): Record<Percentile, number | null> => ({ p50: null, p75: null, p90: null, p99: null })

export function emptyRoutingForm(): RoutingForm {
  return {
    mode: 'all',
    order: [],
    only: [],
    ignore: [],
    allowFallbacks: null,
    requireParameters: null,
    dataCollection: null,
    zdr: null,
    enforceDistillableText: null,
    quantizations: [],
    sortBy: '',
    sortPartition: null,
    throughput: noPercentiles(),
    latency: noPercentiles(),
    maxPrice: { prompt: '', completion: '', request: '', image: '' },
    added: [],
  }
}

/**
 * A new offer's routing: fallbacks allowed (said, so that the preview
 * records it), only upstream providers that take every setting of a call
 * (agents call tools), and none that keeps the school's prompts.
 */
export const NEW_OFFER_ROUTING: Readonly<OpenRouterRouting> = Object.freeze({
  allow_fallbacks: true,
  require_parameters: true,
  data_collection: 'deny',
})

// --- The canonical object ---------------------------------------------------------------

/**
 * A decimal of dollars in its shortest form, as the runtime writes
 * max_price: no exponent, no leading zeros, no trailing fractional zeros
 * ("01.50" → "1.5", "2.000000" → "2", 0 → "0"); null for what is not one.
 */
export function canonicalDecimal(v: unknown): string | null {
  let s: string
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null
    s = String(v)
  } else if (typeof v === 'string') s = v.trim()
  else return null
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) return null
  const whole = m[1].replace(/^0+(?=\d)/, '')
  const fraction = (m[2] ?? '').replace(/0+$/, '')
  return fraction ? [whole, fraction].join('.') : whole
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A threshold in its canonical form: {p50} alone as the number, else the percentiles set in order; undefined for none. */
function canonicalThreshold(v: unknown): number | Percentiles | undefined {
  if (isNumber(v)) return v
  if (!v || typeof v !== 'object') return undefined
  const src = v as Record<string, unknown>
  const out: Percentiles = {}
  for (const p of PERCENTILES) if (isNumber(src[p])) out[p] = src[p] as number
  const keys = Object.keys(out)
  if (!keys.length) return undefined
  if (keys.length === 1 && keys[0] === 'p50') return out.p50
  return out
}

const stringList = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.length ? v.filter((x): x is string => typeof x === 'string') : undefined

/**
 * The routing as the runtime stores, answers and sends it: the members set,
 * in OpenRouter's order, booleans as given (false too), lists in their
 * order, sort {by} alone as the string, a threshold's {p50} alone as the
 * number, max_price's members as decimal strings; null when nothing is set.
 */
export function canonicalRouting(r: OpenRouterRouting | null | undefined): OpenRouterRouting | null {
  if (!r || typeof r !== 'object') return null
  const out: OpenRouterRouting = {}
  const order = stringList(r.order)
  if (order?.length) out.order = order
  if (typeof r.allow_fallbacks === 'boolean') out.allow_fallbacks = r.allow_fallbacks
  if (typeof r.require_parameters === 'boolean') out.require_parameters = r.require_parameters
  if (r.data_collection === 'allow' || r.data_collection === 'deny') out.data_collection = r.data_collection
  if (typeof r.zdr === 'boolean') out.zdr = r.zdr
  if (typeof r.enforce_distillable_text === 'boolean') out.enforce_distillable_text = r.enforce_distillable_text
  const only = stringList(r.only)
  if (only?.length) out.only = only
  const ignore = stringList(r.ignore)
  if (ignore?.length) out.ignore = ignore
  const q = stringList(r.quantizations)
  if (q?.length) out.quantizations = q as OpenRouterQuantization[]
  const sort = r.sort as unknown
  if (typeof sort === 'string' && sort) out.sort = sort as OpenRouterSortBy
  else if (sort && typeof sort === 'object') {
    const { by, partition } = sort as { by?: unknown; partition?: unknown }
    if (typeof by === 'string' && by) {
      out.sort =
        partition === 'model' || partition === 'none'
          ? { by: by as OpenRouterSortBy, partition }
          : (by as OpenRouterSortBy)
    }
  }
  const throughput = canonicalThreshold(r.preferred_min_throughput)
  if (throughput !== undefined) out.preferred_min_throughput = throughput
  const latency = canonicalThreshold(r.preferred_max_latency)
  if (latency !== undefined) out.preferred_max_latency = latency
  if (r.max_price && typeof r.max_price === 'object') {
    const price: NonNullable<OpenRouterRouting['max_price']> = {}
    for (const k of PRICE_KEYS) {
      const v = r.max_price[k]
      if (v === undefined || v === null || v === '') continue
      price[k] = canonicalDecimal(v) ?? String(v).trim()
    }
    if (Object.keys(price).length) out.max_price = price
  }
  return Object.keys(out).length ? out : null
}

/** Whether two routings are the same once canonical (none is none). */
export function sameRouting(a: OpenRouterRouting | null | undefined, b: OpenRouterRouting | null | undefined): boolean {
  return JSON.stringify(canonicalRouting(a)) === JSON.stringify(canonicalRouting(b))
}

/** The routing as the form holds it; one with only set opens with only those turned on, its ignore kept beside them. */
export function formFromRouting(r: OpenRouterRouting | null | undefined): RoutingForm {
  const c = canonicalRouting(r)
  const f = emptyRoutingForm()
  if (!c) return f
  f.order = [...(c.order ?? [])]
  f.only = [...(c.only ?? [])]
  f.ignore = [...(c.ignore ?? [])]
  f.mode = f.only.length ? 'only' : 'all'
  f.allowFallbacks = c.allow_fallbacks ?? null
  f.requireParameters = c.require_parameters ?? null
  f.dataCollection = c.data_collection ?? null
  f.zdr = c.zdr ?? null
  f.enforceDistillableText = c.enforce_distillable_text ?? null
  f.quantizations = [...(c.quantizations ?? [])]
  if (typeof c.sort === 'string') f.sortBy = c.sort
  else if (c.sort) {
    f.sortBy = c.sort.by
    f.sortPartition = c.sort.partition
  }
  const percentiles = (v: number | Percentiles | undefined): Record<Percentile, number | null> => {
    const out = noPercentiles()
    if (typeof v === 'number') out.p50 = v
    else if (v) for (const p of PERCENTILES) out[p] = v[p] ?? null
    return out
  }
  f.throughput = percentiles(c.preferred_min_throughput)
  f.latency = percentiles(c.preferred_max_latency)
  for (const k of PRICE_KEYS) {
    const v = c.max_price?.[k]
    f.maxPrice[k] = v === undefined ? '' : String(v)
  }
  return f
}

/** The routing a form sends, canonical; null for none. */
export function routingFromForm(f: RoutingForm): OpenRouterRouting | null {
  const r: OpenRouterRouting = {}
  if (f.order.length) r.order = [...f.order]
  if (f.allowFallbacks !== null) r.allow_fallbacks = f.allowFallbacks
  if (f.requireParameters !== null) r.require_parameters = f.requireParameters
  if (f.dataCollection) r.data_collection = f.dataCollection
  if (f.zdr !== null) r.zdr = f.zdr
  if (f.enforceDistillableText !== null) r.enforce_distillable_text = f.enforceDistillableText
  if (f.only.length) r.only = [...f.only]
  if (f.ignore.length) r.ignore = [...f.ignore]
  if (f.quantizations.length) r.quantizations = [...f.quantizations]
  if (f.sortBy) r.sort = f.sortPartition ? { by: f.sortBy, partition: f.sortPartition } : f.sortBy
  const threshold = (v: Record<Percentile, number | null>): Percentiles => {
    const out: Percentiles = {}
    for (const p of PERCENTILES) if (v[p] !== null && v[p] !== undefined) out[p] = v[p] as number
    return out
  }
  r.preferred_min_throughput = threshold(f.throughput)
  r.preferred_max_latency = threshold(f.latency)
  const price: NonNullable<OpenRouterRouting['max_price']> = {}
  for (const k of PRICE_KEYS) if (f.maxPrice[k].trim()) price[k] = f.maxPrice[k].trim()
  r.max_price = price
  return canonicalRouting(r)
}

// --- Slugs ----------------------------------------------------------------------------------

/**
 * Whether an entry of order, only or ignore covers a slug: the same slug, or
 * a provider's base slug (no "/") before one of its endpoints'
 * (google-vertex covers google-vertex/us-east5), as OpenRouter has it.
 */
export function covers(entry: string, slug: string): boolean {
  return slug === entry || (!entry.includes('/') && slug.startsWith(`${entry}/`))
}

/** What is wrong with a slug typed to add, as a message key, or null: its shape, or a row that has it already. */
export function slugProblem(slug: string, taken: readonly string[]): string | null {
  const s = slug.trim()
  if (!s || s.length > SLUG_MAX || !SLUG_SHAPE.test(s)) return 'runtimeAdmin.openrouter.invalid.slug'
  if (taken.includes(s)) return 'runtimeAdmin.openrouter.invalid.slugTwice'
  return null
}

// --- What is wrong ------------------------------------------------------------------------------

/**
 * Where a problem with the routing is said: 'section' (above the section),
 * 'table' (the upstream providers' line: order, only and ignore), a member's
 * control by its name (sort, quantizations, data_collection, …), a
 * percentile's or a highest price's own input ('preferred_max_latency/p90',
 * 'max_price/prompt') or its row ('preferred_max_latency', 'max_price').
 */
export type RoutingErrorKey = string

/** What is wrong with a highest price typed, as a message key, or null: as a price is, and at most 1,000,000. */
export function maxPriceProblem(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  return /^[0-9]{1,7}(\.[0-9]{1,6})?$/.test(s) && Number(s) <= PRICE_MAX
    ? null
    : 'runtimeAdmin.openrouter.invalid.price'
}

function thresholdProblem(v: number | null, max: number): boolean {
  return v !== null && !(Number.isFinite(v) && v > 0 && v <= max)
}

/**
 * What is wrong with the routing as the form holds it, by where it is said
 * (RoutingErrorKey), as message keys; empty when nothing is. Slugs and
 * repeats are checked in each list (a slug added by hand was checked as it
 * was added), and only those turned on must be some, where only those may
 * answer: none would send no only at all, which is every upstream provider.
 */
export function routingProblems(f: RoutingForm): Record<RoutingErrorKey, string> {
  const out: Record<RoutingErrorKey, string> = {}
  for (const list of LISTS) {
    const seen = new Set<string>()
    for (const slug of f[list]) {
      if (slug.length > SLUG_MAX || !SLUG_SHAPE.test(slug)) out.table ??= 'runtimeAdmin.openrouter.invalid.slug'
      else if (seen.has(slug)) out.table ??= 'runtimeAdmin.openrouter.invalid.slugTwice'
      seen.add(slug)
    }
  }
  if (f.mode === 'only' && !f.only.length) out.table ??= 'runtimeAdmin.openrouter.invalid.onlyNone'
  for (const p of PERCENTILES) {
    if (thresholdProblem(f.throughput[p], THROUGHPUT_MAX))
      out[`preferred_min_throughput/${p}`] = 'runtimeAdmin.openrouter.invalid.throughput'
    if (thresholdProblem(f.latency[p], LATENCY_MAX))
      out[`preferred_max_latency/${p}`] = 'runtimeAdmin.openrouter.invalid.latency'
  }
  for (const k of PRICE_KEYS) {
    const problem = maxPriceProblem(f.maxPrice[k])
    if (problem) out[`max_price/${k}`] = problem
  }
  return out
}

/**
 * Where a refusal of the routing (details.field, a JSON Pointer under
 * /openrouter) is said in the section, and the slug an index of order, only
 * or ignore names; null for a pointer that is not the routing's.
 */
export function routingErrorAt(
  pointer: unknown,
  f: RoutingForm,
): { key: RoutingErrorKey; member: string; slug: string | null } | null {
  if (typeof pointer !== 'string') return null
  if (pointer === '/openrouter') return { key: 'section', member: '', slug: null }
  if (!pointer.startsWith('/openrouter/')) return null
  const [member = '', sub] = pointer.slice('/openrouter/'.length).split('/')
  if ((LISTS as readonly string[]).includes(member)) {
    const i = sub !== undefined && /^\d+$/.test(sub) ? Number(sub) : -1
    return { key: 'table', member, slug: f[member as (typeof LISTS)[number]][i] ?? null }
  }
  if (member === 'preferred_min_throughput' || member === 'preferred_max_latency' || member === 'max_price') {
    const known = member === 'max_price' ? (PRICE_KEYS as readonly string[]) : (PERCENTILES as readonly string[])
    return { key: sub && known.includes(sub) ? `${member}/${sub}` : member, member, slug: null }
  }
  const controls = ['allow_fallbacks', 'require_parameters', 'data_collection', 'zdr', 'quantizations', 'sort']
  return controls.includes(member) ? { key: member, member, slug: null } : { key: 'section', member, slug: null }
}

// --- The table: which upstream providers may answer -----------------------------------------------

/** Why an upstream provider turned on is still left out: the control that leaves it out. */
export type Exclusion = 'quantizations' | 'zdr' | 'maxPrice' | 'maxOutput'

export interface Candidate {
  endpoint: OpenRouterEndpoint
  /** Turned on (§4.4): not skipped, and among only where only those may answer. */
  used: boolean
  /** Used, and no limit leaves it out. */
  allowed: boolean
  excludedBy: Exclusion[]
}

/** Whether the routing turns an upstream provider's slug on, in the form's mode. */
export function isUsed(f: RoutingForm, slug: string): boolean {
  if (f.ignore.some((e) => covers(e, slug))) return false
  return f.mode === 'all' || f.only.some((e) => covers(e, slug))
}

const above = (price: USD | null, limit: string): boolean => {
  if (price === null || !limit.trim()) return false
  const p = Number(price)
  const l = Number(limit)
  return Number.isFinite(p) && Number.isFinite(l) && p > l
}

/** The limits that leave out an endpoint: a precision not chosen, not ZDR, dearer than accepted, or answers too short. */
export function exclusionsOf(e: OpenRouterEndpoint, f: RoutingForm, maxOutputTokens: number | null): Exclusion[] {
  const out: Exclusion[] = []
  if (f.quantizations.length && !(f.quantizations as string[]).includes(e.quantization)) out.push('quantizations')
  if (f.zdr === true && e.zdr === false) out.push('zdr')
  const m = f.maxPrice
  if (
    above(e.usd_per_mtok.input, m.prompt) ||
    above(e.usd_per_mtok.output, m.completion) ||
    above(e.usd_per_request, m.request) ||
    above(e.usd_per_image, m.image)
  )
    out.push('maxPrice')
  const bound = maxOutputTokens ?? DEFAULT_MAX_OUTPUT
  if (e.max_output_tokens !== null && e.max_output_tokens < bound) out.push('maxOutput')
  return out
}

/**
 * Each upstream provider OpenRouter lists for the model, in its order, with
 * whether the routing turns it on, and whether it may answer: turned on, of
 * a precision chosen, ZDR where ZDR is asked (not known counts as may), no
 * dearer than accepted, and giving at least the offer's output bound (the
 * runtime's 4000 where it sets none), since OpenRouter routes only to an
 * upstream provider that can give the length asked.
 */
export function candidates(
  endpoints: readonly OpenRouterEndpoint[],
  routing: RoutingForm,
  maxOutputTokens: number | null,
): Candidate[] {
  return endpoints.map((endpoint) => {
    const used = isUsed(routing, endpoint.slug)
    const excludedBy = used ? exclusionsOf(endpoint, routing, maxOutputTokens) : []
    return { endpoint, used, allowed: used && !excludedBy.length, excludedBy }
  })
}

/** What the table warns of. */
export interface RoutingWarnings {
  /** The list is read, and no upstream provider may answer: every call would fail. */
  none: boolean
  /** Some may, and none of them calls tools. */
  noTools: boolean
  /** The names of those tried first, or turned on alone, that call no tools (empty while noTools says more). */
  someNoTools: string[]
}

export function routingWarnings(
  endpoints: readonly OpenRouterEndpoint[],
  routing: RoutingForm,
  maxOutputTokens: number | null,
): RoutingWarnings {
  const all = candidates(endpoints, routing, maxOutputTokens)
  const allowed = all.filter((c) => c.allowed)
  const none = endpoints.length > 0 && !allowed.length
  const noTools = allowed.length > 0 && allowed.every((c) => !c.endpoint.tools)
  const names: string[] = []
  if (!noTools) {
    for (const c of all) {
      const first = routing.order.some((o) => covers(o, c.endpoint.slug))
      const chosen = routing.mode === 'only' && c.allowed
      if ((first || chosen) && c.used && !c.endpoint.tools && !names.includes(c.endpoint.provider_name))
        names.push(c.endpoint.provider_name)
    }
  }
  return { none, noTools, someNoTools: names }
}

/** The highest listed prices (before any discount) among the upstream providers that may answer, or null for none. */
export interface HighestPrices {
  input: USD | null
  output: USD | null
  cache_read: USD | null
}

export function highestPrices(all: readonly Candidate[]): HighestPrices | null {
  const allowed = all.filter((c) => c.allowed)
  if (!allowed.length) return null
  const max = (pick: (e: OpenRouterEndpoint) => USD | null): USD | null => {
    let best: USD | null = null
    for (const c of allowed) {
      const v = pick(c.endpoint)
      if (v !== null && Number.isFinite(Number(v)) && (best === null || Number(v) > Number(best))) best = v
    }
    return best
  }
  return {
    input: max((e) => e.usd_per_mtok.input),
    output: max((e) => e.usd_per_mtok.output),
    cache_read: max((e) => e.usd_per_mtok.cache_read),
  }
}

/** Whether the price table counts less for input or output than an upstream provider that may answer charges. */
export function tableBelow(price: OpenRouterEndpoints['price'], highest: HighestPrices | null): boolean {
  if (!price || !highest) return false
  const below = (table: USD, top: USD | null) => top !== null && Number(table) < Number(top)
  return below(price.usd_per_mtok.input, highest.input) || below(price.usd_per_mtok.output, highest.output)
}

// --- The table: rows, and what turning them on and off does --------------------------------------------

export interface RoutingRow {
  slug: string
  /** As OpenRouter lists it; null for a slug the routing names, or added by hand, that it does not. */
  endpoint: OpenRouterEndpoint | null
  candidate: Candidate | null
  /** Turned on. */
  used: boolean
  /** The base slug whose switch turns this row on or off, shown in place of its own. */
  coveredBy: string | null
  /** Its place among those tried first, from 1; 0 when it is not. */
  position: number
}

/**
 * The table's rows: the upstream providers OpenRouter lists, in its order;
 * then the slugs the routing names that it does not list, and those added by
 * hand, each once.
 */
export function routingRows(
  endpoints: readonly OpenRouterEndpoint[] | null,
  f: RoutingForm,
  maxOutputTokens: number | null,
): RoutingRow[] {
  const listed = endpoints ?? []
  const all = candidates(listed, f, maxOutputTokens)
  const slugs = new Set(listed.map((e) => e.slug))
  const extra: string[] = []
  for (const s of [...f.order, ...f.only, ...f.ignore, ...f.added]) {
    if (!slugs.has(s)) {
      slugs.add(s)
      extra.push(s)
    }
  }
  const list = f.mode === 'only' ? f.only : f.ignore
  const row = (slug: string, candidate: Candidate | null): RoutingRow => ({
    slug,
    endpoint: candidate?.endpoint ?? null,
    candidate,
    used: isUsed(f, slug),
    coveredBy: list.includes(slug) ? null : (list.find((e) => e !== slug && covers(e, slug)) ?? null),
    position: f.order.indexOf(slug) + 1,
  })
  return [...all.map((c) => row(c.endpoint.slug, c)), ...extra.map((s) => row(s, null))]
}

/** Clears sort as the first upstream provider is put first: OpenRouter does not sort while order is set. */
function clearSortForOrder(f: RoutingForm) {
  if (!f.order.length) {
    f.sortBy = ''
    f.sortPartition = null
  }
}

/**
 * Turns a row on or off. With all but those turned off, off adds its slug to
 * ignore and takes it out of order (and what it covers); on takes it out of
 * ignore. With only those turned on, on adds it to only (and takes out of
 * ignore what would skip it); off takes it out of only, and out of order
 * whatever only no longer covers.
 */
export function setUsed(f: RoutingForm, slug: string, on: boolean) {
  if (f.mode === 'all') {
    if (on) f.ignore = f.ignore.filter((e) => e !== slug)
    else {
      if (!f.ignore.includes(slug)) f.ignore = [...f.ignore, slug]
      f.order = f.order.filter((o) => !covers(slug, o))
    }
    return
  }
  if (on) {
    if (!f.only.includes(slug)) f.only = [...f.only, slug]
    f.ignore = f.ignore.filter((e) => !covers(e, slug))
  } else {
    f.only = f.only.filter((e) => e !== slug)
    f.order = f.order.filter((o) => f.only.some((e) => covers(e, o)))
  }
}

/**
 * Chooses which upstream providers may answer. The other mode's list is
 * cleared; only those turned on start with none on, and so with none tried
 * first.
 */
export function setMode(f: RoutingForm, mode: RoutingMode) {
  if (f.mode === mode) return
  f.mode = mode
  if (mode === 'only') {
    f.ignore = []
    f.only = []
    f.order = []
  } else f.only = []
}

/** Tries an upstream provider first, after those already: sort is cleared as the first is. */
export function tryFirst(f: RoutingForm, slug: string) {
  if (f.order.includes(slug)) return
  clearSortForOrder(f)
  f.order = [...f.order, slug]
}

/** Moves an upstream provider tried first one place earlier (-1) or later (+1). */
export function moveInOrder(f: RoutingForm, slug: string, by: -1 | 1) {
  const i = f.order.indexOf(slug)
  const j = i + by
  if (i < 0 || j < 0 || j >= f.order.length) return
  const next = [...f.order]
  ;[next[i], next[j]] = [next[j], next[i]]
  f.order = next
}

export function unorder(f: RoutingForm, slug: string) {
  f.order = f.order.filter((o) => o !== slug)
}

/** Takes a slug out of those skipped beside only those turned on (alsoSkipped). */
export function unskip(f: RoutingForm, slug: string) {
  f.ignore = f.ignore.filter((e) => e !== slug)
}

/** Sorts by one of OpenRouter's orders ('' for its own balance); a partition read is kept while one is chosen. */
export function setSort(f: RoutingForm, by: OpenRouterSortBy | '') {
  f.sortBy = (OPENROUTER_SORTS as readonly string[]).includes(by) ? by : ''
  if (!f.sortBy) f.sortPartition = null
}

/** The precisions offered, in the page's order. */
export const QUANTIZATION_OPTIONS: readonly OpenRouterQuantization[] = OPENROUTER_QUANTIZATIONS
