// The AIshie Agent Runtime's API: what this front end calls to host a
// person's agents on the school's runtime (M2). The contract is
// m2.api.spec.md; its objects are in runtime-types.ts.
//
// The runtime is on this origin, under /runtime/api/v1. The proxy in front
// sends that path to it and strips the Cookie header on the way, so Core's
// session never reaches it; this client sends no cookies there either, and
// follows no redirect with its credential. The runtime takes a bearer
// assertion instead: a short-lived credential Core makes for whoever is
// signed in (requestAssertion in http.ts), for the audience the runtime
// names in its public GET /info.
//
// The assertion is kept in this module's memory and nowhere else: not in
// storage, not in a log, not in an error. It is replaced shortly before it
// ends, and once more when the runtime answers 401, after which the call is
// sent once again; a second 401 is the answer. It is dropped when the person
// signed in here goes (forgetRuntimeAssertion, from the session store).
//
// Whether the runtime is there at all is asked, not built in: the image is
// the same for every server. GET /info answering 200, in JSON, as
// {"api": "aishie-runtime", "api_version": 1, "audience": …} means it is;
// anything else (404, a gateway's 502, the app's own index.html from a proxy
// that does not route the path) means it is not, and the hosting UI stays
// hidden. It is asked once per page load (runtimeStatus, and useRuntime over
// it). Core refusing to make assertions for the runtime's audience (404, or
// 400 for an audience it does not list) hides it too.
//
// Errors are RuntimeError, an ApiError with the runtime's details.reason,
// from Core's envelope, which the runtime answers in. The runtime reads no
// Idempotency-Key: each of its writes is safe to send again by a natural key
// (the same token, the same value), or never sent again (PATCH, key tests),
// as the contract's §5.14 says; this client retries accordingly.
//
// The runtime's administrators have routes of their own (runtimeAdmin, at
// the end): OCR, the school's plan's offers, quotas and use, and pricing.
//
// The route and field names the contract fixes are here and in
// runtime-types.ts, and nowhere else in the app.

import { ApiError, queryString, requestAssertion } from './http'
import type {
  AgentBudgets,
  AgentBudgetsPut,
  AgentPatch,
  ClientErrorReason,
  ConnectAnswer,
  CostQuery,
  CostReport,
  DeleteAnswer,
  HostedAgent,
  InspectAnswer,
  KeyTestAnswer,
  KeyTestRequest,
  ModelsAnswer,
  OfferCreate,
  OfferDeleted,
  OfferPatch,
  PlanOffer,
  PriceCreate,
  PricePatch,
  PriceRow,
  PriceTable,
  QuotasPut,
  ReplaceTokenAnswer,
  ReplaceTokenRequest,
  RuntimeFeatures,
  RuntimeInfo,
  RuntimeMe,
  RuntimeSettings,
  RuntimeSettingsPatch,
  SchoolPlan,
  SchoolPlanUsage,
  TenantList,
  TenantPut,
  TenantQuota,
  TokenRequest,
} from './runtime-types'

export type { RuntimeInfo } from './runtime-types'

/** Where the runtime's API is: a path on this origin. */
export const RUNTIME_BASE = '/runtime/api/v1'

/**
 * The runtime's routes, under RUNTIME_BASE; a {name} is a path parameter
 * (runtimePath fills it in).
 */
export const RUNTIME_ROUTES = {
  /** Public: what the runtime is, and the audience of the assertions it takes. */
  info: '/info',
  me: '/me',
  models: '/models',
  keyTest: '/keys/test',
  inspect: '/agents/inspect',
  agents: '/agents',
  agent: '/agents/{id}',
  agentToken: '/agents/{id}/token',
  agentPause: '/agents/{id}/pause',
  agentResume: '/agents/{id}/resume',
  // The runtime's administrators' (runtimeAdmin below).
  adminSettings: '/admin/settings',
  schoolPlan: '/admin/school-plan',
  planOffers: '/admin/school-plan/offers',
  planOffer: '/admin/school-plan/offers/{id}',
  planQuotas: '/admin/school-plan/quotas',
  planUsage: '/admin/school-plan/usage',
  prices: '/admin/prices',
  price: '/admin/prices/{id}',
  tenants: '/admin/tenants',
  tenant: '/admin/tenants/{tenant_id}',
  agentBudgets: '/admin/agent-budgets',
  costs: '/admin/costs',
} as const

/** Headers of the contract beyond plain HTTP's. */
const IDEMPOTENCY_REPLAYED = 'Idempotency-Replayed'

/**
 * How long before it ends an assertion is replaced: 30 seconds, or half its
 * life when it is given less than a minute (one that ends with the session,
 * say).
 */
export const ASSERTION_REFRESH_MS = 30_000

/** Whether a response's Content-Type says JSON. */
function isJsonType(h: Headers): boolean {
  const ct = (h.get('Content-Type') ?? '').toLowerCase()
  return /^application\/([a-z0-9.+-]*\+)?json\s*(;|$)/.test(ct)
}

/** A feature flag as the runtime sent it (a boolean, true or false), or the v1 default when it sent none. */
function flag(v: unknown, v1: boolean): boolean {
  return typeof v === 'boolean' ? v : v1
}

/** The runtime's /info answer, or null when it is not one (§3.1.1). */
function infoFrom(b: unknown): RuntimeInfo | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  const o = b as Record<string, unknown>
  if (o.api !== 'aishie-runtime' || o.api_version !== 1) return null
  if (typeof o.audience !== 'string' || !o.audience) return null
  const f = (o.features && typeof o.features === 'object' ? o.features : {}) as Record<string, unknown>
  const features: RuntimeFeatures = {
    connect_by_token: flag(f.connect_by_token, true),
    own_key: flag(f.own_key, true),
    school_key: flag(f.school_key, false),
  }
  return {
    api: 'aishie-runtime',
    api_version: 1,
    version: typeof o.version === 'string' ? o.version : '',
    commit: typeof o.commit === 'string' ? o.commit : '',
    audience: o.audience,
    issuer: typeof o.issuer === 'string' ? o.issuer : '',
    features,
  }
}

/**
 * A path under RUNTIME_BASE, with the route's {name} parameters filled
 * in, each encoded as one path segment.
 */
export function runtimePath(route: string, params: Record<string, string | number> = {}): string {
  return route.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const v = params[key]
    if (v === undefined || v === null || v === '') throw new Error(`${route}: ${key} is required`)
    return encodeURIComponent(String(v))
  })
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * An error from the runtime, or about reaching it: an ApiError whose reason
 * is the runtime's details.reason (the closed list of the contract's §2.3),
 * or one of this client's own (ClientErrorReason) for what the runtime did
 * not word. The pages choose their words by reason.
 */
export class RuntimeError extends ApiError {
  readonly reason: string

  constructor(opts: {
    status: number
    code: string
    message: string
    reason: string
    details?: Record<string, unknown>
  }) {
    super(opts)
    this.name = 'RuntimeError'
    this.reason = opts.reason
  }
}

export function isRuntimeError(e: unknown): e is RuntimeError {
  return e instanceof RuntimeError
}

function clientError(reason: ClientErrorReason, status: number, message: string, code = reason): RuntimeError {
  return new RuntimeError({ status, code, message, reason })
}

// ---------------------------------------------------------------------------
// Keeping secrets out of errors
// ---------------------------------------------------------------------------

/** A JSON Web Token's shape: what Core's assertions are. */
const JWT = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g
/** An agent token's shape, secret part and all: never shown, even should an answer repeat one. */
const AGENT_TOKEN = /\bais(?:inv)?_[a-z2-7]{12}_[A-Za-z0-9_-]+/g

/** s, with any assertion or agent token in it (the one held, or anything shaped like one) taken out. */
function scrub(s: string): string {
  let out = s.replace(JWT, '[assertion]').replace(AGENT_TOKEN, '[token]')
  if (held && out.includes(held.token)) out = out.split(held.token).join('[assertion]')
  return out
}

/** v, with every string in it scrubbed. */
function scrubAll(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return scrub(v)
  if (!v || typeof v !== 'object' || depth > 8) return v
  if (Array.isArray(v)) return v.map((x) => scrubAll(x, depth + 1))
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubAll(x, depth + 1)]))
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface RawResponse {
  status: number
  /** The body, parsed, when it was JSON. */
  body: unknown
  /** Whether there was a body that was not JSON (a page, from a proxy). */
  notJson: boolean
  headers: Headers
}

/**
 * One request to the runtime. No cookie goes (credentials: 'omit'), and a
 * redirect is an error rather than followed, so that the bearer goes to the
 * runtime's path and nowhere else. A failure to connect says so in words of
 * its own, never the browser's.
 */
async function send(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
  signal?: AbortSignal,
): Promise<RawResponse> {
  let res: Response
  let text: string
  try {
    res = await fetch(url, { method, headers, body, credentials: 'omit', redirect: 'error', signal })
    text = await res.text()
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw clientError('network', 0, 'the agent runtime could not be reached')
  }
  let parsed: unknown = undefined
  let notJson = false
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      notJson = true
    }
  }
  return { status: res.status, body: parsed, notJson, headers: res.headers }
}

/** Seconds to wait from a Retry-After header, or null. */
function retryAfterSeconds(h: Headers): number | null {
  const v = Number(h.get('Retry-After'))
  return Number.isFinite(v) && v > 0 ? v : null
}

function retryAfterMs(h: Headers): number {
  const v = retryAfterSeconds(h)
  return v !== null ? Math.min(v, 10) * 1000 : 1000
}

/**
 * Sends, and when retry is true sends again what met no answer, a rate
 * limit or a gateway error, up to three times: a read, or a write the
 * runtime answers once however often it is sent (§5.14).
 */
async function sendWithRetry(retry: boolean, ...args: Parameters<typeof send>): Promise<RawResponse> {
  const attempts = retry ? 3 : 1
  let last: RawResponse | ApiError | undefined
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await send(...args)
      if (raw.status === 429 || raw.status === 502 || raw.status === 503 || raw.status === 504) {
        last = raw
        if (i < attempts - 1) await sleep(raw.status === 429 ? retryAfterMs(raw.headers) : 500 * 2 ** i)
        continue
      }
      return raw
    } catch (e) {
      if (!(e instanceof ApiError) || !e.isNetwork) throw e
      last = e
      if (i < attempts - 1) await sleep(500 * 2 ** i)
    }
  }
  if (last instanceof ApiError) throw last
  return last as RawResponse
}

/**
 * The RuntimeError for an answer that is not a success: the runtime's own
 * code, message, reason and details from Core's envelope, or, for an answer
 * without one (a proxy's), the status alone. A 401 here is the runtime's,
 * not a lapsed session: nobody is told they were signed out.
 */
function runtimeError(raw: RawResponse): RuntimeError {
  const e = (raw.body as { error?: unknown } | undefined)?.error as
    { code?: unknown; message?: unknown; details?: unknown } | undefined
  const enveloped = !!e && typeof e === 'object'
  const code = typeof e?.code === 'string' && e.code ? e.code : raw.status >= 500 ? 'internal' : 'unknown'
  const message = typeof e?.message === 'string' && e.message ? scrub(e.message) : `HTTP ${raw.status}`
  let details =
    e?.details && typeof e.details === 'object' && !Array.isArray(e.details)
      ? (scrubAll(e.details) as Record<string, unknown>)
      : undefined
  const wait = retryAfterSeconds(raw.headers)
  if (raw.status === 429 && wait !== null && details?.retry_after_seconds === undefined) {
    details = { ...details, retry_after_seconds: wait }
  }
  let reason = typeof details?.reason === 'string' && details.reason ? details.reason : ''
  if (!reason) {
    if (!enveloped && raw.status >= 500) reason = 'runtime_unavailable'
    else if (raw.status === 429) reason = 'rate_limited'
    else reason = code
  }
  return new RuntimeError({ status: raw.status, code, message, details, reason })
}

// ---------------------------------------------------------------------------
// Is the runtime there?
// ---------------------------------------------------------------------------

/** What GET /info said: the runtime and what it is, or why there is none to use. */
export type RuntimeStatus = { available: true; info: RuntimeInfo } | { available: false; error: ApiError }

let probe: Promise<RuntimeStatus> | null = null
const statusListeners = new Set<(s: RuntimeStatus) => void>()

async function askInfo(): Promise<RuntimeStatus> {
  let raw: RawResponse
  try {
    raw = await send('GET', RUNTIME_BASE + RUNTIME_ROUTES.info, { Accept: 'application/json' }, undefined)
  } catch (e) {
    const error = e instanceof ApiError ? e : clientError('network', 0, 'no answer')
    return { available: false, error }
  }
  if (raw.status !== 200) return { available: false, error: runtimeError(raw) }
  const info = isJsonType(raw.headers) ? infoFrom(raw.body) : null
  if (info) return { available: true, info }
  return {
    available: false,
    error: clientError(
      'invalid_response',
      raw.status,
      `what answers at ${RUNTIME_BASE}${RUNTIME_ROUTES.info} is not the agent runtime`,
    ),
  }
}

/**
 * Whether the runtime's API is there, and what it says of itself. It is
 * asked once per page load, publicly (no credential goes), and never
 * rejects; refresh asks again.
 */
export function runtimeStatus(opts: { refresh?: boolean } = {}): Promise<RuntimeStatus> {
  if (!probe || opts.refresh) probe = askInfo()
  return probe
}

/** The runtime's info, or null when there is none to use: hide hosting. Memoized per page load. */
export async function runtimeInfo(): Promise<RuntimeInfo | null> {
  const s = await runtimeStatus()
  return s.available ? s.info : null
}

/** Hears when the runtime is found to be absent after all (Core makes no assertions for it). */
export function onRuntimeStatus(fn: (s: RuntimeStatus) => void): () => void {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

/** Takes the runtime to be absent for the rest of the page's life, and says so. */
function markAbsent(error: ApiError) {
  const s: RuntimeStatus = { available: false, error }
  probe = Promise.resolve(s)
  statusListeners.forEach((fn) => fn(s))
}

/** The runtime's info, or the reason there is no runtime to call. */
async function requireInfo(): Promise<RuntimeInfo> {
  const s = await runtimeStatus()
  if (!s.available) throw clientError('runtime_absent', s.error.status, s.error.message)
  return s.info
}

// ---------------------------------------------------------------------------
// The assertion
// ---------------------------------------------------------------------------

interface Held {
  token: string
  audience: string
  /** When to ask for the next one, on this browser's clock. */
  refreshAt: number
}

let held: Held | null = null
let minting: Promise<Held> | null = null
/** Moved on when the person goes: an assertion asked for before then is not kept. */
let generation = 0

/**
 * Core's refusal to make an assertion, as the contract's §3.1.6 has it: a
 * 401 is a lapsed session (http.ts has told the app already) and stays
 * Core's error; 403 is an account Core will not vouch for here (suspended,
 * or not a person); 404 or 400 means there is no runtime to use after all,
 * and hosting is hidden.
 */
function mintRefusal(e: unknown, audience: string): unknown {
  if (!(e instanceof ApiError) || e instanceof RuntimeError) return e
  if (e.status === 403)
    return new RuntimeError({ status: 403, code: e.code, message: e.message, reason: 'account_refused' })
  if (e.status === 404 || e.status === 400) {
    // A deploy mismatch (the runtime's audience is not in Core's list) is worth a line for whoever looks.
    if (e.status === 400)
      console.warn(`Core makes no assertions for the agent runtime's audience ${audience}; hosting is hidden.`)
    const absent = new RuntimeError({ status: e.status, code: e.code, message: e.message, reason: 'runtime_absent' })
    markAbsent(absent)
    return absent
  }
  return e
}

async function mint(audience: string): Promise<Held> {
  const g = generation
  let a: Awaited<ReturnType<typeof requestAssertion>>
  try {
    a = await requestAssertion(audience)
  } catch (e) {
    throw mintRefusal(e, audience)
  }
  const now = Date.now()
  const life = Math.max(0, a.expiresAt - now)
  const next: Held = {
    token: a.assertion,
    audience,
    refreshAt: now + Math.max(life / 2, life - ASSERTION_REFRESH_MS),
  }
  if (g === generation) held = next
  return next
}

/**
 * The assertion to send: the one held, while it is fresh, for this
 * runtime's audience, and not the one the runtime has just refused (stale);
 * otherwise a new one from Core, one request however many calls wait for it.
 */
async function assertion(stale?: string): Promise<string> {
  const { audience } = await requireInfo()
  const h = held
  if (h && h.audience === audience && h.token !== stale && Date.now() < h.refreshAt) return h.token
  if (!minting) {
    const p = mint(audience).finally(() => {
      if (minting === p) minting = null
    })
    minting = p
  }
  return (await minting).token
}

/**
 * Makes sure an assertion is at hand, fresh or held, without calling the
 * runtime: for a flow that must not begin (issue a token, say) when the
 * runtime cannot be called. Rejects as a call would.
 */
export async function ensureRuntimeAssertion(): Promise<void> {
  await assertion()
}

/**
 * Drops the assertion held for the person signed in here, and any on its
 * way: when they sign out, their session ends, or someone else signs in.
 */
export function forgetRuntimeAssertion(): void {
  held = null
  minting = null
  generation++
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export type RuntimeMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RuntimeRequestOptions {
  /** Query parameters; undefined and null are left out. */
  query?: Record<string, unknown>
  /** The JSON body. */
  body?: unknown
  /** The version the change is made to (If-Match; see ifMatch). */
  ifMatch?: string | number
  /**
   * Send it again after no answer, a rate limit or a gateway error. A GET is
   * retried unless this is false; any other method only when it is true, for
   * a write the runtime answers once however often it is sent (§5.14).
   */
  retry?: boolean
  signal?: AbortSignal
}

export interface RuntimeResponse<T> {
  status: number
  /** The body; undefined when there was none (204). */
  data: T
  /** The version of what was answered (its ETag), for a later If-Match. */
  etag: string | null
  /** The runtime answered as it did to the same request before (Idempotency-Replayed). */
  replayed: boolean
}

/**
 * The If-Match value for a version: the runtime's strong ETag, "<version>",
 * from the version (7, or "7") or the ETag as the runtime gave it. Never "*",
 * which would match whatever version there is, and never a weak tag, which
 * the runtime refuses.
 */
export function ifMatch(version: string | number): string {
  const v = String(version).trim()
  if (/^"[0-9]+"$/.test(v)) return v
  if (/^[0-9]+$/.test(v)) return `"${v}"`
  throw new Error(`not a version to match: ${JSON.stringify(v)}`)
}

/** The change was refused because what it was made to has changed since it was read (412). */
export function isVersionMismatch(e: unknown): boolean {
  return e instanceof ApiError && e.status === 412
}

/**
 * Calls the runtime as the person signed in here. path is under
 * RUNTIME_BASE (runtimePath builds one). Resolves with the answer on a 2xx;
 * rejects with a RuntimeError otherwise, or when there is no runtime to
 * call, or when Core gives no assertion for it (a 401 from Core is a lapsed
 * session, and stays Core's error). Retried as opts.retry says; any call
 * once more after a 401 from the runtime, with a new assertion.
 */
export async function runtimeRequest<T = unknown>(
  method: RuntimeMethod,
  path: string,
  opts: RuntimeRequestOptions = {},
): Promise<RuntimeResponse<T>> {
  const url = RUNTIME_BASE + path + queryString(opts.query ?? {})
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  if (opts.ifMatch !== undefined) headers['If-Match'] = ifMatch(opts.ifMatch)
  const retry = opts.retry ?? method === 'GET'

  let token = await assertion()
  let raw = await sendWithRetry(retry, method, url, { ...headers, Authorization: `Bearer ${token}` }, body, opts.signal)
  if (raw.status === 401) {
    token = await assertion(token)
    raw = await sendWithRetry(retry, method, url, { ...headers, Authorization: `Bearer ${token}` }, body, opts.signal)
  }
  if (raw.status < 200 || raw.status >= 300) throw runtimeError(raw)
  if (raw.notJson) throw clientError('invalid_response', raw.status, 'the agent runtime did not answer in JSON')
  return {
    status: raw.status,
    data: raw.body as T,
    etag: raw.headers.get('ETag'),
    replayed: raw.headers.get(IDEMPOTENCY_REPLAYED) === 'true',
  }
}

/** Calls by method, for a route this module does not name in `runtime` below. */
export const runtimeApi = {
  get<T>(path: string, opts: Omit<RuntimeRequestOptions, 'body'> = {}): Promise<T> {
    return runtimeRequest<T>('GET', path, opts).then((r) => r.data)
  },
  /** A read with its version (ETag), for a PATCH to name. */
  getVersioned<T>(path: string, opts: Omit<RuntimeRequestOptions, 'body'> = {}): Promise<RuntimeResponse<T>> {
    return runtimeRequest<T>('GET', path, opts)
  },
  post<T>(path: string, body?: unknown, opts: Omit<RuntimeRequestOptions, 'body'> = {}): Promise<RuntimeResponse<T>> {
    return runtimeRequest<T>('POST', path, { ...opts, body })
  },
  /** A change to what was read at version (its ETag, or the version it carries); 412 when it has moved on. Never retried. */
  patch<T>(
    path: string,
    body: unknown,
    version: string | number,
    opts: Omit<RuntimeRequestOptions, 'body' | 'ifMatch' | 'retry'> = {},
  ): Promise<RuntimeResponse<T>> {
    return runtimeRequest<T>('PATCH', path, { ...opts, body, ifMatch: version, retry: false })
  },
  put<T>(path: string, body: unknown, opts: Omit<RuntimeRequestOptions, 'body'> = {}): Promise<RuntimeResponse<T>> {
    return runtimeRequest<T>('PUT', path, { ...opts, body })
  },
  delete<T>(path: string, opts: Omit<RuntimeRequestOptions, 'body'> = {}): Promise<RuntimeResponse<T>> {
    return runtimeRequest<T>('DELETE', path, opts)
  },
}

const agentPath = (route: string, id: string) => runtimePath(route, { id })

/**
 * The contract's calls (§9.1), each resolving { data, etag, status,
 * replayed }. Retried as §5.14 says: reads, inspect, connect, a token
 * replacement, pause, resume and delete, which the runtime answers once
 * however often they are sent; never a PATCH (If-Match makes it safe to
 * repeat by hand) or a key test (it spends a token of the owner's).
 *
 * Only PATCH names a version (If-Match), as it must. Pause, resume and
 * delete are sent without one, as §9.1 has them, and so is a token
 * replacement unless its caller names one: the runtime then settles a race
 * with another write itself. Any write to a hosted agent may still answer
 * 412 version_mismatch (DELETE after three races with new tokens, A.3.3;
 * PUT /token likewise): the pages read the agent again and say it changed
 * meanwhile (isVersionMismatch).
 */
export const runtime = {
  me: () => runtimeRequest<RuntimeMe>('GET', RUNTIME_ROUTES.me),
  models: () => runtimeRequest<ModelsAnswer>('GET', RUNTIME_ROUTES.models),
  /** Tries an own key with one token; never stored, never retried. */
  testKey: (req: KeyTestRequest) =>
    runtimeRequest<KeyTestAnswer>('POST', RUNTIME_ROUTES.keyTest, { body: req, retry: false }),
  /** What a token is, before connecting it. */
  inspect: (req: TokenRequest) =>
    runtimeRequest<InspectAnswer>('POST', RUNTIME_ROUTES.inspect, { body: req, retry: true }),
  /**
   * Connects an agent by its token: 201, or 200 replayed for the same token;
   * the agent, with its other live tokens in Core beside it (other_tokens).
   */
  connect: (req: TokenRequest) =>
    runtimeRequest<ConnectAnswer>('POST', RUNTIME_ROUTES.agents, { body: req, retry: true }),
  list: () => runtimeRequest<{ agents: HostedAgent[] }>('GET', RUNTIME_ROUTES.agents),
  get: (id: string) => runtimeRequest<HostedAgent>('GET', agentPath(RUNTIME_ROUTES.agent, id)),
  /** Model and own key, at the version read (If-Match); 412 when it has moved on. Never retried. */
  update: (id: string, version: string | number, patch: AgentPatch) =>
    runtimeRequest<HostedAgent>('PATCH', agentPath(RUNTIME_ROUTES.agent, id), {
      body: patch,
      ifMatch: version,
      retry: false,
    }),
  /**
   * Gives the runtime a new token for the agent, the token alone (the agent
   * is the one hosted: no core_actor_id); it revokes the one it had. Sent
   * again by itself only without a version: with one (If-Match), a request
   * that went through but met no answer would be answered 412 the second
   * time, as a write since the version named.
   */
  replaceToken: (id: string, token: string, version?: string | number) => {
    const body: ReplaceTokenRequest = { token }
    return runtimeRequest<ReplaceTokenAnswer>('PUT', agentPath(RUNTIME_ROUTES.agentToken, id), {
      body,
      ifMatch: version,
      retry: version === undefined,
    })
  },
  /** Stops the agent on the runtime; it stays active in Core (this is not Core's Suspend). */
  pause: (id: string) => runtimeRequest<HostedAgent>('POST', agentPath(RUNTIME_ROUTES.agentPause, id), { retry: true }),
  resume: (id: string) =>
    runtimeRequest<HostedAgent>('POST', agentPath(RUNTIME_ROUTES.agentResume, id), { retry: true }),
  /**
   * Deletes the hosting, and by default revokes the agent's token in Core
   * (D7). No If-Match: the runtime deletes the row holding whichever token
   * it revoked, reading it again when a new one was put in meanwhile.
   */
  remove: (id: string, revokeToken = true) =>
    runtimeRequest<DeleteAnswer>('DELETE', agentPath(RUNTIME_ROUTES.agent, id), {
      query: { revoke_token: revokeToken ? 'true' : 'false' },
      retry: true,
    }),
}

const offerPath = (id: string) => runtimePath(RUNTIME_ROUTES.planOffer, { id })
const pricePath = (id: string) => runtimePath(RUNTIME_ROUTES.price, { id })
const tenantPath = (id: string) => runtimePath(RUNTIME_ROUTES.tenant, { tenant_id: id })

/**
 * The runtime's administrators' calls: OCR (admin/settings), the school's
 * plan (admin/school-plan: its offers, its quotas, today's use), and the
 * money (the price table, tenants' quotas, hosted agents' budgets, and what
 * things cost). Anyone else is refused 403 not_admin; a runtime from before
 * a route answers 404.
 *
 * Retried as the runtime answers them: reads, and the PUTs and DELETEs of
 * quotas and budgets, which come to the same however often they are sent.
 * Never a PATCH, nor an offer or a price made or deleted: making an offer
 * tries its key with the provider, rate limited, and one sent again after a
 * lost answer would be refused as taken (409) or gone (404). A change to an
 * offer or a price names the version it was read at (If-Match), and so may
 * a deletion; either may answer 412 when it has moved on
 * (isVersionMismatch).
 */
export const runtimeAdmin = {
  settings: () => runtimeRequest<RuntimeSettings>('GET', RUNTIME_ROUTES.adminSettings),
  updateSettings: (patch: RuntimeSettingsPatch) =>
    runtimeRequest<RuntimeSettings>('PATCH', RUNTIME_ROUTES.adminSettings, { body: patch, retry: false }),
  plan: () => runtimeRequest<SchoolPlan>('GET', RUNTIME_ROUTES.schoolPlan),
  offer: (id: string) => runtimeRequest<PlanOffer>('GET', offerPath(id)),
  /** 201 with the offer; its key tried first unless skip_key_test. The key is in the body alone. */
  createOffer: (offer: OfferCreate) =>
    runtimeRequest<PlanOffer>('POST', RUNTIME_ROUTES.planOffers, { body: offer, retry: false }),
  updateOffer: (id: string, version: string | number, patch: OfferPatch) =>
    runtimeRequest<PlanOffer>('PATCH', offerPath(id), { body: patch, ifMatch: version, retry: false }),
  deleteOffer: (id: string, version?: string | number) =>
    runtimeRequest<OfferDeleted>('DELETE', offerPath(id), { ifMatch: version ?? undefined, retry: false }),
  setQuotas: (quotas: QuotasPut) =>
    runtimeRequest<SchoolPlan>('PUT', RUNTIME_ROUTES.planQuotas, { body: quotas, retry: true }),
  /** runtime.yaml's quotas again. */
  resetQuotas: () => runtimeRequest<SchoolPlan>('DELETE', RUNTIME_ROUTES.planQuotas, { retry: true }),
  usage: () => runtimeRequest<SchoolPlanUsage>('GET', RUNTIME_ROUTES.planUsage),
  prices: () => runtimeRequest<PriceTable>('GET', RUNTIME_ROUTES.prices),
  price: (id: string) => runtimeRequest<PriceRow>('GET', pricePath(id)),
  createPrice: (row: PriceCreate) =>
    runtimeRequest<PriceRow>('POST', RUNTIME_ROUTES.prices, { body: row, retry: false }),
  updatePrice: (id: string, version: string | number, patch: PricePatch) =>
    runtimeRequest<PriceRow>('PATCH', pricePath(id), { body: patch, ifMatch: version, retry: false }),
  /** The table as it is after. */
  deletePrice: (id: string, version?: string | number) =>
    runtimeRequest<PriceTable>('DELETE', pricePath(id), { ifMatch: version ?? undefined, retry: false }),
  tenants: (page: { after?: string; limit?: number } = {}) =>
    runtimeRequest<TenantList>('GET', RUNTIME_ROUTES.tenants, { query: page }),
  tenant: (id: string) => runtimeRequest<TenantQuota>('GET', tenantPath(id)),
  setTenant: (id: string, quota: TenantPut) =>
    runtimeRequest<TenantQuota>('PUT', tenantPath(id), { body: quota, retry: true }),
  /** runtime.yaml's quota again, or none. */
  resetTenant: (id: string) => runtimeRequest<TenantQuota>('DELETE', tenantPath(id), { retry: true }),
  agentBudgets: () => runtimeRequest<AgentBudgets>('GET', RUNTIME_ROUTES.agentBudgets),
  setAgentBudgets: (budgets: AgentBudgetsPut) =>
    runtimeRequest<AgentBudgets>('PUT', RUNTIME_ROUTES.agentBudgets, { body: budgets, retry: true }),
  resetAgentBudgets: () => runtimeRequest<AgentBudgets>('DELETE', RUNTIME_ROUTES.agentBudgets, { retry: true }),
  costs: (query: CostQuery = {}) => runtimeRequest<CostReport>('GET', RUNTIME_ROUTES.costs, { query: { ...query } }),
}
