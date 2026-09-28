// The one road every call from this front end takes to Core.
//
// Core has one tool layer: every REST route is a tool, and the browser calls
// the same tools an agent calls over MCP. A read answers
// {"status": "executed", "result": ...}. A write answers with the pipeline's
// Outcome: what became of the call (executed, proposed, denied, failed), the
// action it was recorded as, and its result or its error. A call that was
// never attempted (bad input, not signed in, rate limited, no such route)
// answers {"error": {...}} and records nothing.
//
// Writes carry an Idempotency-Key. Sending the same key with the same body
// again is safe — Core replays the first answer — so a write that failed on
// the way (network, 5xx, 429) is retried here with the key it was first sent
// with, and can never act twice.

import { TOOL_ROUTES, type ToolMap, type ToolName } from './generated/tools'

export type ActionStatus = 'executed' | 'proposed' | 'denied' | 'failed' | 'rejected' | 'cancelled' | 'approved'
export type ReviewState = 'none' | 'pending' | 'reviewed' | 'escalated'

export interface ApiErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface Outcome<T = unknown> {
  status: ActionStatus
  action_id?: string
  review_state?: ReviewState
  result?: T
  error?: ApiErrorBody
  replayed?: boolean
}

/**
 * What a write that went through comes back as. `executed` has its result;
 * `proposed` is not an error — the call now waits for a person to approve it,
 * and `action_id` is the proposal to watch.
 */
export type WriteOutcome<T> =
  | { status: 'executed'; actionId: string; reviewState: ReviewState; result: T; replayed: boolean }
  | { status: 'proposed'; actionId: string; reviewState: ReviewState; result?: undefined; replayed: boolean }

/**
 * Anything that did not go through. `recorded` says whether Core wrote an
 * action row for it (a denial or a failure is recorded; a malformed call, a
 * 401 or a 429 is not), and `actionId` names that row.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>
  readonly actionId?: string
  readonly actionStatus?: ActionStatus

  constructor(opts: {
    status: number
    code: string
    message: string
    details?: Record<string, unknown>
    actionId?: string
    actionStatus?: ActionStatus
  }) {
    super(opts.message)
    this.name = 'ApiError'
    this.status = opts.status
    this.code = opts.code
    this.details = opts.details
    this.actionId = opts.actionId
    this.actionStatus = opts.actionStatus
  }

  get recorded(): boolean {
    return !!this.actionId
  }
  get isUnauthenticated(): boolean {
    return this.status === 401 || this.code === 'unauthenticated'
  }
  /** Denied by authorization, or forbidden by a rule: the caller may not. */
  get isForbidden(): boolean {
    return this.status === 403 || this.code === 'forbidden' || this.actionStatus === 'denied'
  }
  get isNotFound(): boolean {
    return this.status === 404 || this.code === 'not_found'
  }
  get isNetwork(): boolean {
    return this.status === 0
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

// ---------------------------------------------------------------------------
// Configuration and credentials
// ---------------------------------------------------------------------------

/** Where Core is. Empty means this origin (and, in development, the proxy). */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** This page's origin, or '' where there is no page (unit tests without a DOM). */
function pageOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : ''
}

/**
 * The origin API calls go to: API_BASE's, resolved against this page (so a
 * path prefix such as '/core' is this origin), or this page's own.
 */
function apiOrigin(): string {
  if (!API_BASE || typeof window === 'undefined') return pageOrigin()
  try {
    return new URL(API_BASE, window.location.href).origin
  } catch {
    return pageOrigin()
  }
}

/**
 * Core's own public origin (its PUBLIC_URL), for telling people where an
 * agent connects over MCP. In development this is the proxied Core, not the
 * dev server, which does not forward /mcp.
 */
export const CORE_ORIGIN: string = (import.meta.env.VITE_CORE_PUBLIC_URL ?? '').replace(/\/+$/, '') || apiOrigin()

/** Where an agent's MCP client connects (streamable HTTP, bearer token). */
export const MCP_ENDPOINT = `${CORE_ORIGIN}/mcp`

const TOKEN_KEY = 'aishiteru.bearer'

/**
 * A browser normally signs in with a session cookie it cannot read. A bearer
 * token (an API token pasted in, for looking at the system as an agent sees
 * it) is kept for this tab only.
 */
export const bearer = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string | null) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token)
      else sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable: the token lives only as long as nothing asks for it */
    }
  },
}

type Listener = (e: ApiError) => void
const unauthenticatedListeners = new Set<Listener>()

/** Called whenever Core says the caller is not signed in (401). */
export function onUnauthenticated(fn: Listener): () => void {
  unauthenticatedListeners.add(fn)
  return () => unauthenticatedListeners.delete(fn)
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'k-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface RawResponse {
  status: number
  body: any
  headers: Headers
}

async function send(
  method: string,
  path: string,
  init: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<RawResponse> {
  const headers: Record<string, string> = { Accept: 'application/json', ...init.headers }
  const token = bearer.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: init.signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ApiError({ status: 0, code: 'network', message: (e as Error)?.message || 'network error' })
  }
  let parsed: any = null
  const text = await res.text()
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }
  return { status: res.status, body: parsed, headers: res.headers }
}

function errorFrom(raw: RawResponse): ApiError {
  const b = raw.body ?? {}
  // A recorded outcome (denied, failed, rejected, cancelled) …
  if (b && typeof b.status === 'string' && b.action_id) {
    const err: ApiErrorBody = b.error ?? {
      code: b.status === 'denied' ? 'forbidden' : b.status,
      message: b.status === 'denied' ? 'not permitted' : `the action was ${b.status}`,
    }
    return new ApiError({
      status: raw.status,
      code: err.code,
      message: err.message,
      details: err.details,
      actionId: b.action_id,
      actionStatus: b.status,
    })
  }
  // … or a call that was never attempted.
  const e: ApiErrorBody | undefined = b.error
  const err = new ApiError({
    status: raw.status,
    code: e?.code ?? (raw.status >= 500 ? 'internal' : 'unknown'),
    message: e?.message ?? `HTTP ${raw.status}`,
    details: e?.details,
  })
  if (err.isUnauthenticated) unauthenticatedListeners.forEach((fn) => fn(err))
  return err
}

function retryAfterMs(h: Headers): number {
  const v = Number(h.get('Retry-After'))
  return Number.isFinite(v) && v > 0 ? Math.min(v, 10) * 1000 : 1000
}

/** Retries what can safely be retried: a read always, a write under its own key. */
async function sendWithRetry(
  method: string,
  path: string,
  init: Parameters<typeof send>[2],
  attempts = 3,
): Promise<RawResponse> {
  let last: RawResponse | ApiError | undefined
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await send(method, path, init)
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

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type ToolIn<N extends ToolName> = ToolMap[N]['in']
export type ToolOut<N extends ToolName> = ToolMap[N]['out']
export type ReadTool = { [N in ToolName]: ToolMap[N]['kind'] extends 'read' ? N : never }[ToolName]
export type WriteTool = { [N in ToolName]: ToolMap[N]['kind'] extends 'write' ? N : never }[ToolName]

/** Arguments for a tool, without the idempotency key: this client adds it. */
export type Args<N extends ToolName> = ToolIn<N>

function buildRequest(name: ToolName, args: Record<string, unknown>) {
  const route = TOOL_ROUTES[name]
  const rest: Record<string, unknown> = { ...args }
  const path = route.path.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const v = rest[key]
    if (v === undefined || v === null || v === '') throw new Error(`${name}: ${key} is required`)
    delete rest[key]
    return encodeURIComponent(String(v))
  })
  return { route, path, rest }
}

function queryString(args: Record<string, unknown>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)))
    else q.append(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Calls a read tool and returns its result. */
export async function read<N extends ReadTool>(
  name: N,
  args: ToolIn<N>,
  opts: { signal?: AbortSignal } = {},
): Promise<ToolOut<N>> {
  const { path, rest } = buildRequest(name, args as unknown as Record<string, unknown>)
  const raw = await sendWithRetry('GET', path + queryString(rest), { signal: opts.signal })
  if (raw.status !== 200 || !raw.body || raw.body.status !== 'executed') throw errorFrom(raw)
  return raw.body.result as ToolOut<N>
}

export interface WriteOptions {
  /**
   * The call's idempotency key. Keep one per intended action (per form
   * submission, say) and send it again to retry: Core replays rather than
   * acting twice. Omitted, a fresh key is made for this call.
   */
  idempotencyKey?: string
  signal?: AbortSignal
}

/**
 * Calls a write tool. Resolves when the call was executed or became a
 * proposal; rejects with an ApiError when it was denied, failed, or never
 * attempted.
 */
export async function write<N extends WriteTool>(
  name: N,
  args: ToolIn<N>,
  opts: WriteOptions = {},
): Promise<WriteOutcome<ToolOut<N>>> {
  const { path, rest } = buildRequest(name, args as unknown as Record<string, unknown>)
  const key = opts.idempotencyKey ?? newIdempotencyKey()
  const raw = await sendWithRetry('POST', path, {
    body: rest,
    headers: { 'Idempotency-Key': key },
    signal: opts.signal,
  })
  const b = raw.body as Outcome<ToolOut<N>> | null
  const replayed = raw.headers.get('Idempotency-Replayed') === 'true' || !!b?.replayed
  if (b && b.action_id && (b.status === 'executed' || b.status === 'proposed')) {
    if (b.status === 'executed') {
      return {
        status: 'executed',
        actionId: b.action_id,
        reviewState: b.review_state ?? 'none',
        result: b.result as ToolOut<N>,
        replayed,
      }
    }
    return { status: 'proposed', actionId: b.action_id, reviewState: b.review_state ?? 'none', replayed }
  }
  throw errorFrom(raw)
}

// ---------------------------------------------------------------------------
// Sign-in (not tools: there is no actor yet to call one as)
// ---------------------------------------------------------------------------

/**
 * A sign-in that did not go through. A 401 here is not a lapsed session:
 * nobody should be told they were signed out, so the listeners are not
 * called. A 429 says how long to wait in details.retry_after_seconds.
 */
function signInError(raw: RawResponse): ApiError {
  const b = raw.body?.error
  let details: Record<string, unknown> | undefined = b?.details
  const wait = Number(raw.headers.get('Retry-After'))
  if (raw.status === 429 && details?.retry_after_seconds === undefined && Number.isFinite(wait) && wait > 0) {
    details = { ...details, retry_after_seconds: wait }
  }
  return new ApiError({
    status: raw.status,
    code: b?.code ?? (raw.status === 429 ? 'rate_limited' : 'unknown'),
    message: b?.message ?? `HTTP ${raw.status}`,
    details,
  })
}

export async function login(email: string, password: string): Promise<{ actor_id: string; expires_at: string }> {
  const raw = await send('POST', '/v1/auth/login', { body: { email, password } })
  if (raw.status !== 200) throw signInError(raw)
  return raw.body
}

/**
 * Takes up an invitation (actor.invite): sets the invited person's password
 * and signs this browser in as them, with the session cookie a sign-in
 * gives. Public, like login: the invitation is what vouches for them. Core
 * answers 401 for an invitation that is no good (unknown, used, replaced,
 * withdrawn, expired, or for someone suspended since), 400 for a weak
 * password (the invitation still works), and 429 when this address has tried
 * too often.
 */
export async function acceptInvite(
  token: string,
  password: string,
): Promise<{ actor_id: string; email: string; expires_at: string }> {
  const raw = await send('POST', '/v1/auth/invite', { body: { token, password } })
  if (raw.status !== 200) throw signInError(raw)
  return raw.body
}

export async function logout(): Promise<void> {
  const raw = await send('POST', '/v1/auth/logout')
  if (raw.status !== 204 && raw.status !== 401) throw errorFrom(raw)
}

/** Where single sign-on starts on Core, when Core does not say. */
export const SSO_START_PATH = '/v1/auth/sso/start'

/**
 * Where a browser goes to sign in through the identity provider. returnTo is a path on this front end (with its
 * base path). Core sends the browser there from its own callback, and takes a
 * bare path to be a path on Core's origin; so when Core is elsewhere the path
 * is made absolute, on this page's origin, which Core accepts when it is one
 * of its TRUSTED_ORIGINS. start is the path on Core that begins it, as
 * authMethods gives it.
 */
export function ssoStartUrl(returnTo: string, start: string = SSO_START_PATH): string {
  let to = returnTo
  const page = pageOrigin()
  if (page && apiOrigin() !== page && to.startsWith('/') && !to.startsWith('//')) to = page + to
  return `${API_BASE}${start}?return_to=${encodeURIComponent(to)}`
}

/**
 * Single sign-on as Core offers it: the name of the identity provider as the
 * button shows it (Core's OIDC_DISPLAY_NAME), or null for the app's own
 * words; and the path on Core where signing in starts.
 */
export interface SsoMethod {
  label: string | null
  start: string
}

/**
 * How one signs in to this Core (GET /v1/auth/methods): with a password
 * (always, so far), and with single sign-on when Core has an identity
 * provider (its OIDC_ISSUER); sso is null when it has none.
 */
export interface AuthMethods {
  password: boolean
  sso: SsoMethod | null
}

/** A path on Core, with no query: nothing that would send the browser to another site. */
const corePath = /^\/(?![/\\])[^?#]*$/

function authMethodsFrom(b: any): AuthMethods | null {
  if (!b || typeof b !== 'object' || typeof b.password !== 'boolean' || !('sso' in b)) return null
  const s = b.sso
  if (s === null) return { password: b.password, sso: null }
  if (!s || typeof s !== 'object' || typeof s.start !== 'string' || !corePath.test(s.start)) return null
  if (s.label !== null && typeof s.label !== 'string') return null
  return { password: b.password, sso: { label: s.label || null, start: s.start } }
}

/**
 * Asks Core how one signs in: public, like login, and asked before anyone
 * is. A Core from before the route answers 404; that, no answer, or an answer
 * that is not this (a page, from a proxy that sends /v1 elsewhere) is taken
 * as the build's own settings, VITE_SSO_ENABLED and VITE_SSO_LABEL, so that
 * an older Core offers what it did before. It is asked once and never
 * rejects: a sign-in page shows no error for it.
 */
export async function authMethods(): Promise<AuthMethods> {
  try {
    const raw = await send('GET', '/v1/auth/methods')
    const methods = raw.status === 200 ? authMethodsFrom(raw.body) : null
    if (methods) return methods
  } catch {
    /* no answer: the build's settings, below */
  }
  const env = import.meta.env
  return {
    password: true,
    sso: env.VITE_SSO_ENABLED === 'true' ? { label: env.VITE_SSO_LABEL || null, start: SSO_START_PATH } : null,
  }
}

export async function health(): Promise<{
  status: string
  version: string
  commit: string
  schema_version: number
  schema_latest: number
}> {
  const raw = await send('GET', '/healthz')
  return raw.body
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * A URL Core handed out for a file. When Core keeps files on its own disk the
 * URL is under its PUBLIC_URL at /v1/blobs/…; it is sent where the API calls
 * go, so that the development proxy (and a same-origin deployment) carries it.
 * An object store's URL is left as it is.
 */
export function blobUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href)
    if (u.pathname.startsWith('/v1/blobs/')) return API_BASE + u.pathname + u.search
    return u.toString()
  } catch {
    return url
  }
}

export type UploadKind = 'material' | 'instructions' | 'rubric' | 'submission' | 'feedback'

export interface UploadedFile {
  uploadToken: string
  fileName: string
  contentType: string
  size: number
}

/**
 * Uploads a file for attaching: asks Core for a short-lived URL, PUTs the
 * bytes there, and returns the upload token that document.create,
 * document.add_version or grade.submit (feedback_files) takes.
 */
export async function uploadFile(
  courseId: string,
  kind: UploadKind,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadedFile> {
  const contentType = file.type || 'application/octet-stream'
  const target = await read('document.upload_url', { course_id: courseId, kind, content_type: contentType })
  if (target.max_bytes && file.size > target.max_bytes) {
    throw new ApiError({
      status: 400,
      code: 'invalid_argument',
      message: `file is larger than ${target.max_bytes} bytes`,
      details: { max_bytes: target.max_bytes },
    })
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', blobUrl(target.upload_url))
    for (const [k, v] of Object.entries(target.headers ?? {})) if (v !== undefined) xhr.setRequestHeader(k, v)
    if (!Object.keys(target.headers ?? {}).some((h) => h.toLowerCase() === 'content-type')) {
      xhr.setRequestHeader('Content-Type', contentType)
    }
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let msg = `upload failed: HTTP ${xhr.status}`
      try {
        msg = JSON.parse(xhr.responseText)?.error?.message ?? msg
      } catch {
        /* not JSON: an object store's own error page */
      }
      reject(new ApiError({ status: xhr.status, code: 'upload_failed', message: msg }))
    }
    xhr.onerror = () => reject(new ApiError({ status: 0, code: 'network', message: 'upload failed: network error' }))
    xhr.send(file)
  })
  onProgress?.(1)
  return { uploadToken: target.upload_token, fileName: file.name, contentType, size: file.size }
}
