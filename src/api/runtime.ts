// The AIShie Agent Runtime's API: what this front end calls to host a
// person's agents on the school's runtime (M2).
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
// signed in here goes (forgetAssertion, from the session store).
//
// Whether the runtime is there at all is asked, not built in: the image is
// the same for every server. GET /info answering 200 with its shape means
// it is; anything else (404, a gateway's 502, the app's own index.html from
// a proxy that does not route the path) means it is not, and the hosting
// UI stays hidden. It is asked once per page load (runtimeStatus, and
// useRuntime over it).
//
// Errors are the app's ApiError. The runtime answers them in Core's
// envelope, {"error": {"code", "message", "details"}}.
//
// The route and field names the runtime's contract fixes are here, in
// RUNTIME_API_BASE, RUNTIME_ROUTES, infoFrom and the header names, and
// nowhere else in the app.

import { ApiError, newIdempotencyKey, queryString, requestAssertion } from './http'

/** Where the runtime's API is: a path on this origin. */
export const RUNTIME_API_BASE = '/runtime/api/v1'

/**
 * The runtime's routes, under RUNTIME_API_BASE; a {name} is a path parameter
 * (runtimePath fills it in).
 */
export const RUNTIME_ROUTES = {
  /** Public: what the runtime is, and the audience of the assertions it takes. */
  info: '/info',
} as const

/** What the runtime says of itself, publicly (GET /info). */
export interface RuntimeInfo {
  /** The audience Core's assertions for this runtime name, such as https://lms.example.edu/runtime. */
  audience: string
  /** The Core whose assertions it trusts: that Core's PUBLIC_URL. */
  issuer: string
  /** The runtime's version. */
  version: string
}

/** Headers of the contract beyond plain HTTP's. */
const IDEMPOTENCY_KEY = 'Idempotency-Key'
const IDEMPOTENCY_REPLAYED = 'Idempotency-Replayed'

/**
 * How long before it ends an assertion is replaced: 30 seconds, or half its
 * life when it is given less than a minute (one that ends with the session,
 * say).
 */
export const ASSERTION_REFRESH_MS = 30_000

/** The runtime's /info answer, or null when it is not one. */
function infoFrom(b: unknown): RuntimeInfo | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  const { audience, issuer, version } = b as Record<string, unknown>
  if (typeof audience !== 'string' || !audience) return null
  if (typeof issuer !== 'string' || !issuer) return null
  if (typeof version !== 'string') return null
  return { audience, issuer, version }
}

/**
 * A path under RUNTIME_API_BASE, with the route's {name} parameters filled
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
// Keeping secrets out of errors
// ---------------------------------------------------------------------------

/** A JSON Web Token's shape: what Core's assertions are. */
const JWT = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g

/** s, with any assertion in it (the one held, or anything shaped like one) taken out. */
function scrub(s: string): string {
  let out = s.replace(JWT, '[assertion]')
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
    throw new ApiError({ status: 0, code: 'network', message: 'the agent runtime could not be reached' })
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

function retryAfterMs(h: Headers): number {
  const v = Number(h.get('Retry-After'))
  return Number.isFinite(v) && v > 0 ? Math.min(v, 10) * 1000 : 1000
}

/**
 * Sends, and when retry is true sends again what met no answer, a rate
 * limit or a gateway error, up to three times: a read, or a write under its
 * idempotency key, which the runtime answers once however often it is sent.
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
 * The ApiError for an answer that is not a success: the runtime's own code,
 * message and details from Core's envelope, or, for an answer without one
 * (a proxy's), the status alone. A 401 here is the runtime's, not a lapsed
 * session: nobody is told they were signed out.
 */
function runtimeError(raw: RawResponse): ApiError {
  const e = (raw.body as { error?: unknown } | undefined)?.error as
    { code?: unknown; message?: unknown; details?: unknown } | undefined
  const code = typeof e?.code === 'string' && e.code ? e.code : raw.status >= 500 ? 'internal' : 'unknown'
  const message = typeof e?.message === 'string' && e.message ? scrub(e.message) : `HTTP ${raw.status}`
  const details =
    e?.details && typeof e.details === 'object' && !Array.isArray(e.details)
      ? (scrubAll(e.details) as Record<string, unknown>)
      : undefined
  return new ApiError({ status: raw.status, code, message, details })
}

// ---------------------------------------------------------------------------
// Is the runtime there?
// ---------------------------------------------------------------------------

/** What GET /info said: the runtime and what it is, or why there is none to use. */
export type RuntimeStatus = { available: true; info: RuntimeInfo } | { available: false; error: ApiError }

let probe: Promise<RuntimeStatus> | null = null

async function askInfo(): Promise<RuntimeStatus> {
  let raw: RawResponse
  try {
    raw = await send('GET', RUNTIME_API_BASE + RUNTIME_ROUTES.info, { Accept: 'application/json' }, undefined)
  } catch (e) {
    const error = e instanceof ApiError ? e : new ApiError({ status: 0, code: 'network', message: 'no answer' })
    return { available: false, error }
  }
  if (raw.status !== 200) return { available: false, error: runtimeError(raw) }
  const info = infoFrom(raw.body)
  if (info) return { available: true, info }
  return {
    available: false,
    error: new ApiError({
      status: raw.status,
      code: 'invalid_response',
      message: `what answers at ${RUNTIME_API_BASE}${RUNTIME_ROUTES.info} is not the agent runtime`,
    }),
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

/** The runtime's info, or the reason there is no runtime to call. */
async function runtimeInfo(): Promise<RuntimeInfo> {
  const s = await runtimeStatus()
  if (!s.available) throw s.error
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

async function mint(audience: string): Promise<Held> {
  const g = generation
  const a = await requestAssertion(audience)
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
  const { audience } = await runtimeInfo()
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
 * Drops the assertion held for the person signed in here, and any on its
 * way: when they sign out, their session ends, or someone else signs in.
 */
export function forgetAssertion(): void {
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
  /**
   * The call's idempotency key. Every POST carries one, a fresh one when
   * none is given: keep one per intended action (a form's submission) and
   * send it again to retry, and the runtime answers as it did the first
   * time rather than acting twice. Another method sends one only when given.
   */
  idempotencyKey?: string
  /** The version the change is made to (If-Match; see ifMatch). */
  ifMatch?: string | number
  signal?: AbortSignal
}

export interface RuntimeResponse<T> {
  status: number
  /** The body; undefined when there was none (204). */
  data: T
  /** The version of what was answered (its ETag), for a later If-Match. */
  etag: string | null
  /** The runtime answered a POST from an earlier call under the same key. */
  replayed: boolean
}

/**
 * The If-Match value for a version: an ETag as the runtime gave it (quoted,
 * or weak) as it is, a bare version (7, or "7") quoted, as a strong ETag is.
 * Never "*", which would match whatever version there is.
 */
export function ifMatch(version: string | number): string {
  const v = String(version).trim()
  if (/^(W\/)?"[\x21\x23-\x7e]*"$/.test(v)) return v
  if (/^[\x21\x23-\x7e]+$/.test(v) && v !== '*') return `"${v}"`
  throw new Error(`not a version to match: ${JSON.stringify(v)}`)
}

/** The change was refused because what it was made to has changed since it was read (412). */
export function isVersionMismatch(e: unknown): boolean {
  return e instanceof ApiError && e.status === 412
}

/**
 * Calls the runtime as the person signed in here. path is under
 * RUNTIME_API_BASE (runtimePath builds one). Resolves with the answer on a
 * 2xx; rejects with an ApiError otherwise, or when there is no runtime to
 * call, or when Core gives no assertion for it (Core's own error, and a 401
 * from Core is a lapsed session). A read, and a POST under its key, are sent
 * again after a gateway error or a rate limit; any call once more after a
 * 401 from the runtime, with a new assertion.
 */
export async function runtimeRequest<T = unknown>(
  method: RuntimeMethod,
  path: string,
  opts: RuntimeRequestOptions = {},
): Promise<RuntimeResponse<T>> {
  const url = RUNTIME_API_BASE + path + queryString(opts.query ?? {})
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const key = opts.idempotencyKey ?? (method === 'POST' ? newIdempotencyKey() : undefined)
  if (key) headers[IDEMPOTENCY_KEY] = key
  if (opts.ifMatch !== undefined) headers['If-Match'] = ifMatch(opts.ifMatch)
  const retry = method === 'GET' || !!key

  let token = await assertion()
  let raw = await sendWithRetry(retry, method, url, { ...headers, Authorization: `Bearer ${token}` }, body, opts.signal)
  if (raw.status === 401) {
    token = await assertion(token)
    raw = await sendWithRetry(retry, method, url, { ...headers, Authorization: `Bearer ${token}` }, body, opts.signal)
  }
  if (raw.status < 200 || raw.status >= 300) throw runtimeError(raw)
  if (raw.notJson) {
    throw new ApiError({
      status: raw.status,
      code: 'invalid_response',
      message: 'the agent runtime did not answer in JSON',
    })
  }
  return {
    status: raw.status,
    data: raw.body as T,
    etag: raw.headers.get('ETag'),
    replayed: raw.headers.get(IDEMPOTENCY_REPLAYED) === 'true',
  }
}

/** The calls F2 and F3 make, by method. */
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
  /** A change to what was read at version (its ETag, or the version it carries); 412 when it has moved on. */
  patch<T>(
    path: string,
    body: unknown,
    version: string | number,
    opts: Omit<RuntimeRequestOptions, 'body' | 'ifMatch'> = {},
  ): Promise<RuntimeResponse<T>> {
    return runtimeRequest<T>('PATCH', path, { ...opts, body, ifMatch: version })
  },
  put<T>(path: string, body: unknown, opts: Omit<RuntimeRequestOptions, 'body'> = {}): Promise<RuntimeResponse<T>> {
    return runtimeRequest<T>('PUT', path, { ...opts, body })
  },
  delete(path: string, opts: Omit<RuntimeRequestOptions, 'body'> = {}): Promise<void> {
    return runtimeRequest('DELETE', path, opts).then(() => undefined)
  },
}
