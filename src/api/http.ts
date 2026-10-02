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

import { safeFileName } from '../utils/files'
import { RateMeter } from '../utils/transferRate'
import { noteCoreDate } from './clock'
import { TOOL_ROUTES, type ToolMap, type ToolName } from './generated/tools'

export type ActionStatus =
  'executed' | 'proposed' | 'denied' | 'failed' | 'rejected' | 'changes_requested' | 'cancelled' | 'approved'
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

/**
 * Where a tab kept an API token pasted in on the sign-in page, when that page
 * offered one. It no longer does: people sign in with a password, single
 * sign-on or an invitation, and API tokens are for agents, which do not use
 * the browser. Nothing sends what is kept there; a tab still holding one from
 * an earlier version of the page is signed out (see the session store).
 */
const PASTED_TOKEN_KEY = 'aishie.bearer'

/**
 * Forgets an API token an earlier version of the page kept in this tab, and
 * says whether there was one.
 */
export function forgetPastedToken(): boolean {
  try {
    if (sessionStorage.getItem(PASTED_TOKEN_KEY) === null) return false
    sessionStorage.removeItem(PASTED_TOKEN_KEY)
    return true
  } catch {
    // No storage: nothing was kept.
    return false
  }
}

type Listener = (e: ApiError) => void
const unauthenticatedListeners = new Set<Listener>()
const passwordChangeListeners = new Set<Listener>()

/** Called whenever Core says the caller is not signed in (401). */
export function onUnauthenticated(fn: Listener): () => void {
  unauthenticatedListeners.add(fn)
  return () => unauthenticatedListeners.delete(fn)
}

/** The reason Core refuses every call but setting one's own password, from someone whose password another set. */
export const PASSWORD_CHANGE_REQUIRED = 'password_change_required'

/**
 * Called whenever Core refuses a call because the caller must set a
 * password of their own first (403, reason password_change_required):
 * someone else set theirs (member.reset_password), and every other call is
 * refused until they have.
 */
export function onPasswordChangeRequired(fn: Listener): () => void {
  passwordChangeListeners.add(fn)
  return () => passwordChangeListeners.delete(fn)
}

/** Whether Core refused this because the caller must set a password of their own first. */
export function isPasswordChangeRequired(e: unknown): boolean {
  return e instanceof ApiError && e.details?.reason === PASSWORD_CHANGE_REQUIRED
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

interface SendInit {
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /**
   * Given up after this long, as a network failure (and so tried again). No
   * call has a limit but one that waits for news (wait_s), which Core holds
   * open while it waits: given one past the wait, a connection dropped on the
   * way without a word does not hold it for as long as the browser would.
   */
  timeoutMs?: number
}

async function send(method: string, path: string, init: SendInit = {}): Promise<RawResponse> {
  // The browser's session cookie is the caller's only credential here.
  const headers: Record<string, string> = { Accept: 'application/json', ...init.headers }
  let body: BodyInit | undefined
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }
  const limit = timeLimit(init.signal, init.timeoutMs)
  try {
    let res: Response
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body,
        credentials: 'include',
        signal: limit.signal,
      })
    } catch (e) {
      if (limit.expired()) throw timedOut(init.timeoutMs!)
      if ((e as Error)?.name === 'AbortError') throw e
      throw new ApiError({ status: 0, code: 'network', message: (e as Error)?.message || 'network error' })
    }
    // What Core's clock read as it answered, for times on its clock (clock.ts).
    noteCoreDate(res.headers?.get('Date'))
    let parsed: any = null
    let text: string
    try {
      text = await res.text()
    } catch (e) {
      if (limit.expired()) throw timedOut(init.timeoutMs!)
      throw e
    }
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
    }
    return { status: res.status, body: parsed, headers: res.headers }
  } finally {
    limit.done()
  }
}

/**
 * The signal a call is sent with: the caller's, and with ms, one that aborts
 * it after ms as well. expired() says whether that is what aborted it; done()
 * lets go of the timer.
 */
function timeLimit(outer: AbortSignal | undefined, ms: number | undefined) {
  if (!ms) return { signal: outer, expired: () => false, done: () => {} }
  const ctrl = new AbortController()
  let expired = false
  const follow = () => ctrl.abort()
  if (outer?.aborted) ctrl.abort()
  else outer?.addEventListener('abort', follow, { once: true })
  const timer = setTimeout(() => {
    expired = true
    ctrl.abort()
  }, ms)
  return {
    signal: ctrl.signal,
    expired: () => expired,
    done: () => {
      clearTimeout(timer)
      outer?.removeEventListener('abort', follow)
    },
  }
}

/** A call given up after its time limit: a network failure, as one whose connection dropped. */
function timedOut(ms: number): ApiError {
  return new ApiError({ status: 0, code: 'network', message: `no answer in ${Math.round(ms / 1000)} s` })
}

function errorFrom(raw: RawResponse): ApiError {
  const err = outcomeError(raw)
  if (isPasswordChangeRequired(err)) passwordChangeListeners.forEach((fn) => fn(err))
  return err
}

function outcomeError(raw: RawResponse): ApiError {
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
async function sendWithRetry(method: string, path: string, init: SendInit, attempts = 3): Promise<RawResponse> {
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

/** A query string of args, leaving out undefined and null; '' for none. */
export function queryString(args: Record<string, unknown>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)))
    else q.append(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export interface ReadOptions {
  signal?: AbortSignal
  /**
   * For a read that waits for news (wait_s): give it up after this long, as
   * a network failure, which is tried again. Other reads have no limit.
   */
  timeoutMs?: number
}

/** Calls a read tool and returns its result. */
export async function read<N extends ReadTool>(name: N, args: ToolIn<N>, opts: ReadOptions = {}): Promise<ToolOut<N>> {
  const { path, rest } = buildRequest(name, args as unknown as Record<string, unknown>)
  const raw = await sendWithRetry('GET', path + queryString(rest), { signal: opts.signal, timeoutMs: opts.timeoutMs })
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

/**
 * What a sign-in answers. password_change_required: the password signed in
 * with is one someone else set (member.reset_password), and the person must
 * set their own before anything else; every other call is refused until then.
 */
export interface SignedIn {
  actor_id: string
  expires_at: string
  password_change_required?: boolean
}

/**
 * Signs in with a name and a password. A Core that takes a login ID (a
 * student or staff number) as well as an email (authMethods'
 * passwordAccepts) is sent the name as `login`, and tells the two apart by
 * the @ an email has; an older one is sent it as `email`, as it always was.
 */
export async function login(name: string, password: string, opts: { asLogin?: boolean } = {}): Promise<SignedIn> {
  const body = opts.asLogin ? { login: name, password } : { email: name, password }
  const raw = await send('POST', '/v1/auth/login', { body })
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
): Promise<{ actor_id: string; email?: string | null; login_id?: string | null; expires_at: string }> {
  const raw = await send('POST', '/v1/auth/invite', { body: { token, password } })
  if (raw.status !== 200) throw signInError(raw)
  return raw.body
}

// ---------------------------------------------------------------------------
// Joining a course by an invite link (course.join_link_create)
// ---------------------------------------------------------------------------
//
// A join link's token is taken at Core's join endpoints, which are REST only
// and in no catalogue: GET /v1/join/{token} says what the link is to, to
// anyone; POST /v1/join/{token} seats the person signed in, as a student
// (course.join, a tool no adapter offers, recorded like any write); and
// POST /v1/join/{token}/register makes someone with no account, seats them
// and signs this browser in as them, as a sign-in does. A token that finds no
// link is one 404, however it is wrong.

/** Where a join link's token is presented to Core. */
export const JOIN_PATH = '/v1/join/'

/**
 * What anyone who holds a join link may learn of it: the course's code,
 * section and title, whether the link seats anyone now and, when not, why
 * (revoked, expired, used_up, course_archived, creator_lost_authority), when
 * it stops working, and the email domains it is kept to, when it is.
 */
export interface JoinPreview {
  course: { code: string; section: string; title: string }
  joinable: boolean
  reason?: string
  /** Someone with no account may register through it: whenever it seats anyone. */
  registration?: boolean
  allowed_email_domains?: string[] | null
  /** When it stops working, on Core's clock: ten minutes after it was created. */
  expires_at?: string
  /**
   * Whether someone registering through it must give an email (a link kept
   * to email domains asks for one); otherwise a login ID, their student
   * number, will do, with an email or without. Absent from a Core from before
   * login IDs, which always asks for an email.
   */
  email_required?: boolean
}

/**
 * A seat taken through a link: the course and the seat. already_member says
 * the person had a seat there already, which is given back as it is.
 */
export interface Joined {
  course_id: string
  member_id: string
  status?: string
  already_member?: boolean
  join_link_id?: string
}

function joinPath(token: string, sub = ''): string {
  return `${JOIN_PATH}${encodeURIComponent(token)}${sub}`
}

/** What a join link is to. Public. */
export async function joinPreview(token: string): Promise<JoinPreview> {
  const raw = await sendWithRetry('GET', joinPath(token), {})
  if (raw.status !== 200 || !raw.body?.course) throw signInError(raw)
  return raw.body
}

/**
 * Seats the person signed in through a join link, as a student: course.join,
 * under an idempotency key the caller keeps for as long as it retries the
 * same join. Core answers as it answers any write; a refusal names its
 * reason in details.reason.
 */
export async function joinCourse(token: string, idempotencyKey: string): Promise<Joined> {
  const raw = await sendWithRetry('POST', joinPath(token), { body: {}, headers: { 'Idempotency-Key': idempotencyKey } })
  const b = raw.body as Outcome<Joined> | null
  if (raw.status !== 200 || b?.status !== 'executed' || !b.result) throw errorFrom(raw)
  return b.result
}

/**
 * Who registers through a join link: a name, a login ID (their student
 * number) or an email or both, and a password.
 */
export interface JoinRegistration {
  display_name: string
  login_id?: string
  email?: string
  password: string
}

/**
 * Registers someone with no account through a join link, seats them as a
 * student and signs this browser in as them, with the session cookie a
 * sign-in gives: public, as login is, since the link is what lets them in.
 * Core answers 409 (details.reason email_taken, or login_id_taken) for an
 * email or a login ID registered already, whose owner is to sign in; 422
 * when the link seats nobody now or takes no email at that domain, or asks
 * for an email and was given none; 400 for a field outside its rules; and
 * 429, with how long to wait, when this address or this link has registered
 * too often.
 */
export async function joinRegister(
  token: string,
  body: JoinRegistration,
): Promise<{ actor_id: string; expires_at: string; course_id: string; member_id: string; action_id: string }> {
  const raw = await send('POST', joinPath(token, '/register'), { body })
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
 * button shows it (its display name, or Core's OIDC_DISPLAY_NAME), or null
 * for the app's own words; and the path on Core where signing in starts.
 */
export interface SsoMethod {
  label: string | null
  start: string
}

/** One identity provider offered on the sign-in page: its id, and its button's name and start. */
export interface SsoProviderMethod extends SsoMethod {
  id: string
}

/**
 * How one signs in to this Core (GET /v1/auth/methods): with a password
 * (always, so far), and with single sign-on when Core offers an identity
 * provider; sso is null when it offers none.
 */
export interface AuthMethods {
  password: boolean
  /**
   * What password sign-in takes for the account's name, in the order the
   * field's label names them: 'login_id' (a student or staff number) and
   * 'email'. Absent from a Core from before login IDs, which takes an email.
   */
  passwordAccepts?: string[]
  /** The first provider offered (the only one a Core from before several had): what an older page showed. */
  sso: SsoMethod | null
  /**
   * Every provider offered now, in the order of their buttons: the operator's
   * first, then the site's. Absent from a Core from before the site's
   * providers, which offers sso alone.
   */
  ssoProviders?: SsoProviderMethod[]
}

/** A path on Core, with no query: nothing that would send the browser to another site. */
const corePath = /^\/(?![/\\])[^?#]*$/

/** One of sso_providers, or null for an entry that is not one (and is left out). */
function ssoProviderFrom(p: any): SsoProviderMethod | null {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) return null
  if (typeof p.start !== 'string' || !corePath.test(p.start)) return null
  if (p.label !== null && p.label !== undefined && typeof p.label !== 'string') return null
  return { id: p.id, label: p.label || null, start: p.start }
}

function authMethodsFrom(b: any): AuthMethods | null {
  if (!b || typeof b !== 'object' || typeof b.password !== 'boolean' || !('sso' in b)) return null
  const accepts = Array.isArray(b.password_accepts)
    ? b.password_accepts.filter((x: unknown): x is string => typeof x === 'string')
    : null
  const base: Omit<AuthMethods, 'sso'> = accepts
    ? { password: b.password, passwordAccepts: accepts }
    : { password: b.password }
  if (Array.isArray(b.sso_providers)) {
    base.ssoProviders = b.sso_providers.map(ssoProviderFrom).filter((p: SsoProviderMethod | null) => !!p)
  }
  const s = b.sso
  if (s === null) return { ...base, sso: null }
  if (!s || typeof s !== 'object' || typeof s.start !== 'string' || !corePath.test(s.start)) return null
  if (s.label !== null && typeof s.label !== 'string') return null
  return { ...base, sso: { label: s.label || null, start: s.start } }
}

/**
 * The single sign-on buttons to show, in order: one for each provider Core
 * offers, or, from a Core from before several (no sso_providers), the one it
 * offers as sso, as the page always showed it.
 */
export function ssoButtons(m: Pick<AuthMethods, 'sso' | 'ssoProviders'> | null | undefined): SsoMethod[] {
  if (!m) return []
  if (m.ssoProviders) return m.ssoProviders
  return m.sso ? [m.sso] : []
}

/** Whether password sign-in takes a login ID, a student or staff number, as well as an email. */
export function acceptsLoginId(m: Pick<AuthMethods, 'passwordAccepts'> | null | undefined): boolean {
  return !!m?.passwordAccepts?.includes('login_id')
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

// ---------------------------------------------------------------------------
// Assertions, for the agent runtime (runtime.ts)
// ---------------------------------------------------------------------------

/** Where Core makes an assertion of who is signed in, for a service that hosts agents. */
export const ASSERTION_PATH = '/v1/auth/assertion'

/**
 * An assertion Core made of the person signed in here: a bearer credential
 * for one audience, good for a few minutes. expiresAt is when it ends, in
 * milliseconds on this browser's clock.
 */
export interface CoreAssertion {
  assertion: string
  expiresAt: number
}

/**
 * Asks Core for an assertion of who is signed in, for the audience given
 * (the runtime's, as its GET /info names it), with the session cookie, as
 * every call to Core goes. The body is exactly
 * {"audience": …}: Core refuses anything more. Nothing is kept here, and the
 * assertion is in no error: Core's refusals are its own words.
 *
 * Core refuses with 404 when it makes no assertions, 400 for an audience it
 * does not list, 403 for a suspended account or an agent, and 401 when the
 * session is over; that one is a lapsed session like any other, and the
 * listeners hear of it. Asking again is harmless, so a gateway error or a
 * rate limit is retried, once: after Retry-After (at most 10 seconds) for a
 * rate limit, as the runtime's contract says (§3.1).
 *
 * expires_at is on Core's clock. Core's Date header says what that clock
 * read as it answered, so the time is moved onto this browser's clock by the
 * difference, and a browser whose clock runs ahead does not take every
 * assertion for one that has already ended.
 */
export async function requestAssertion(audience: string): Promise<CoreAssertion> {
  const raw = await sendWithRetry('POST', ASSERTION_PATH, { body: { audience } }, 2)
  if (raw.status !== 200) throw errorFrom(raw)
  const b = raw.body
  const expires = typeof b?.expires_at === 'string' ? Date.parse(b.expires_at) : NaN
  if (typeof b?.assertion !== 'string' || !b.assertion || !Number.isFinite(expires)) {
    throw new ApiError({ status: raw.status, code: 'invalid_response', message: 'Core answered without an assertion' })
  }
  const coreNow = Date.parse(raw.headers.get('Date') ?? '')
  const skew = Number.isFinite(coreNow) ? coreNow - Date.now() : 0
  return { assertion: b.assertion, expiresAt: expires - skew }
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

/** What a document's file is for (document.upload_url's kind). */
export type DocumentUploadKind = 'material' | 'instructions' | 'rubric' | 'submission' | 'feedback'
/**
 * What an upload is for: a document's file of one of those kinds, or a file a
 * message of a conversation carries (conversation, conversation.upload_url).
 */
export type UploadKind = DocumentUploadKind | 'conversation'

export interface UploadedFile {
  uploadToken: string
  /**
   * The file's name: for a document's file, the name it was given at
   * document.upload_url, as Core takes it (safeFileName of the file's own),
   * which is what it is to be called where it is attached (files[].filename).
   */
  fileName: string
  contentType: string
  size: number
}

/**
 * Where an upload is: asking Core where to put the file (preparing), sending
 * its bytes (sending), and waiting for the store to say it has them all
 * (finishing).
 */
export type UploadPhase = 'preparing' | 'sending' | 'finishing'

/**
 * How far an upload has come. loaded and total are bytes of the file;
 * bytesPerSecond and secondsLeft are over the last few seconds of this
 * attempt, and null until there is enough to go on. attempt counts from 1.
 */
export interface UploadProgress {
  phase: UploadPhase
  loaded: number
  total: number
  fraction: number
  bytesPerSecond: number | null
  secondsLeft: number | null
  attempt: number
}

/**
 * An upload that failed on the way and is about to be tried again, as
 * `attempt`, after delayMs; or, offline, once the browser is online again.
 */
export interface UploadRetry {
  attempt: number
  delayMs: number
  offline: boolean
  error: ApiError
}

export interface UploadOptions {
  onProgress?: (p: UploadProgress) => void
  onRetry?: (r: UploadRetry) => void
  /** Aborting it cancels the upload: uploadFile rejects with an AbortError (isAbort). */
  signal?: AbortSignal
  /** How many times a failure on the way (the network, a gateway, a stall) is tried again by itself. */
  retries?: number
  /** The largest file Core takes, when known already: a larger one is refused before anything is sent. */
  maxBytes?: number | null
}

/** Times an upload that failed on the way is tried again before it is given up. */
export const UPLOAD_RETRIES = 3
/** An upload that has sent nothing, or heard nothing back, for this long is given up as a network failure. */
export const UPLOAD_STALL_MS = 60_000
/** How long to wait before the first retry; each one after waits twice as long. */
export const UPLOAD_RETRY_MS = 1_000
/** The code of the error a file larger than Core takes is refused with, before or after it is sent. */
export const FILE_TOO_LARGE = 'file_too_large'

/** Whether this is a file refused for its size: details.size and details.max_bytes say by how much. */
export function isFileTooLarge(e: unknown): e is ApiError {
  return e instanceof ApiError && e.code === FILE_TOO_LARGE
}

/** Whether this is a cancelled call or upload, rather than a failure. */
export function isAbort(e: unknown): boolean {
  return (e as Error)?.name === 'AbortError'
}

function abortError(): Error {
  return typeof DOMException === 'function'
    ? new DOMException('The upload was cancelled', 'AbortError')
    : Object.assign(new Error('The upload was cancelled'), { name: 'AbortError' })
}

function tooLarge(size: number, max: number | null): ApiError {
  return new ApiError({
    status: 413,
    code: FILE_TOO_LARGE,
    message: max ? `the file is ${size} bytes; the limit is ${max}` : `the file is ${size} bytes, more than is taken`,
    details: max ? { size, max_bytes: max } : { size },
  })
}

/** Worth trying again: nothing arrived, or a gateway, the server or a rate limit stood in the way. */
function retryableUpload(e: unknown): e is ApiError {
  if (!(e instanceof ApiError) || e.code === FILE_TOO_LARGE) return false
  return e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500
}

/**
 * Where to upload a file, as Core hands it out: document.upload_url for a
 * document's file, whose answer says how many files a version holds and how
 * much they come to together, and conversation.upload_url for a message's,
 * whose answer says how many files a message carries and how much a
 * conversation holds.
 */
type UploadTarget = Omit<ToolOut<'document.upload_url'>, 'max_files' | 'max_version_bytes'> &
  Partial<Pick<ToolOut<'document.upload_url'>, 'max_files' | 'max_version_bytes'>> &
  Partial<Pick<ToolOut<'conversation.upload_url'>, 'max_conversation_bytes'>>

function askUploadUrl(
  courseId: string,
  kind: UploadKind,
  contentType: string,
  signal?: AbortSignal,
  filename?: string,
): Promise<UploadTarget> {
  if (kind === 'conversation')
    return read('conversation.upload_url', { course_id: courseId, content_type: contentType }, { signal })
  return read(
    'document.upload_url',
    { course_id: courseId, kind, content_type: contentType, ...(filename ? { filename } : {}) },
    { signal },
  )
}

/**
 * What Core takes, as its upload URLs say: the largest file (max_bytes); for
 * a document's files how many one version holds (max_files) and how much
 * they come to together (max_version_bytes); and for a conversation's files
 * how many one message carries (max_files) and how much one conversation
 * holds (max_conversation_bytes). Null where Core did not say.
 */
export interface UploadLimits {
  maxBytes: number | null
  maxFiles: number | null
  maxConversationBytes: number | null
  /** A document's: the most one version's files come to, all together. */
  maxVersionBytes?: number | null
}

// What Core takes, by course and kind, from every upload URL it has handed
// out: the same for a whole installation as a rule.
const limits = new Map<string, UploadLimits>()
const limitsAsked = new Map<string, Promise<UploadLimits | null>>()
const limitKey = (courseId: string, kind: UploadKind) => `${courseId}\u0000${kind}`
const positive = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? n : null)

function learnLimits(courseId: string, kind: UploadKind, t: UploadTarget): UploadLimits {
  const l: UploadLimits = {
    maxBytes: positive(t.max_bytes),
    maxFiles: positive(t.max_files),
    maxConversationBytes: positive(t.max_conversation_bytes),
    maxVersionBytes: positive(t.max_version_bytes),
  }
  if (l.maxBytes || l.maxFiles || l.maxConversationBytes || l.maxVersionBytes) limits.set(limitKey(courseId, kind), l)
  return l
}

/** What Core took the last time it was asked here, or null. */
export function knownUploadLimits(courseId: string, kind: UploadKind): UploadLimits | null {
  return limits.get(limitKey(courseId, kind)) ?? null
}

/** The largest file Core took the last time it was asked here, or null. */
export function knownUploadLimit(courseId: string, kind: UploadKind): number | null {
  return knownUploadLimits(courseId, kind)?.maxBytes ?? null
}

/**
 * What Core takes for this course and kind, so that a file too large, or one
 * too many, is refused before it is sent: known from an upload URL handed out
 * before, or asked for once (document.upload_url or conversation.upload_url,
 * reads that record nothing). Null when it cannot be learnt; the upload
 * itself says so then.
 */
export function uploadLimits(courseId: string, kind: UploadKind): Promise<UploadLimits | null> {
  const key = limitKey(courseId, kind)
  const known = limits.get(key)
  if (known !== undefined) return Promise.resolve(known)
  let asked = limitsAsked.get(key)
  if (!asked) {
    asked = askUploadUrl(courseId, kind, 'application/octet-stream')
      .then((t) => learnLimits(courseId, kind, t))
      .catch(() => null)
      .finally(() => limitsAsked.delete(key))
    limitsAsked.set(key, asked)
  }
  return asked
}

/** The largest file Core takes for this course and kind (uploadLimits), or null when it cannot be learnt. */
export function uploadLimit(courseId: string, kind: UploadKind): Promise<number | null> {
  return uploadLimits(courseId, kind).then((l) => l?.maxBytes ?? null)
}

/** Forgets the limits learnt, for tests. */
export function forgetUploadLimits(): void {
  limits.clear()
  limitsAsked.clear()
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      done()
      reject(abortError())
    }
    const timer = setTimeout(() => {
      done()
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Until the browser says it is online again, or `ms` at most, since it is not always right. */
function waitOnline(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const done = () => {
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      signal?.removeEventListener('abort', onAbort)
    }
    const onOnline = () => {
      done()
      resolve()
    }
    const onAbort = () => {
      done()
      reject(abortError())
    }
    const timer = setTimeout(onOnline, ms)
    window.addEventListener('online', onOnline)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * PUTs the file to where Core said, reporting the bytes sent (and, with
 * `all`, that every byte has gone and the answer is awaited). It is given up
 * as a network failure when nothing has moved for stallMs.
 */
function putFile(
  target: { upload_url: string; headers?: Record<string, string | undefined> },
  file: File,
  contentType: string,
  opts: {
    signal?: AbortSignal
    stallMs: number
    maxBytes: number | null
    onSent: (loaded: number, all: boolean) => void
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError())
    const xhr = new XMLHttpRequest()
    let stall: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(stall)
      opts.signal?.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () =>
      settle(() => {
        xhr.abort()
        reject(abortError())
      })
    const arm = () => {
      clearTimeout(stall)
      stall = setTimeout(
        () =>
          settle(() => {
            xhr.abort()
            const s = Math.round(opts.stallMs / 1000)
            reject(new ApiError({ status: 0, code: 'network', message: `upload stalled: nothing moved for ${s} s` }))
          }),
        opts.stallMs,
      )
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    xhr.open('PUT', blobUrl(target.upload_url))
    const headers = target.headers ?? {}
    for (const [k, v] of Object.entries(headers)) if (v !== undefined) xhr.setRequestHeader(k, v)
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      xhr.setRequestHeader('Content-Type', contentType)
    }
    xhr.upload.onprogress = (ev) => {
      arm()
      opts.onSent(Math.min(ev.loaded, file.size), false)
    }
    xhr.upload.onload = () => {
      arm()
      opts.onSent(file.size, true)
    }
    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve()
        if (xhr.status === 413) return reject(tooLarge(file.size, opts.maxBytes))
        let code = 'upload_failed'
        let msg = `upload failed: HTTP ${xhr.status}`
        try {
          const err = JSON.parse(xhr.responseText)?.error
          if (typeof err?.message === 'string') msg = err.message
          if (typeof err?.code === 'string') code = err.code
        } catch {
          /* not JSON: an object store's own error page */
        }
        reject(new ApiError({ status: xhr.status, code, message: msg }))
      })
    xhr.onerror = () =>
      settle(() => reject(new ApiError({ status: 0, code: 'network', message: 'upload failed: network error' })))
    xhr.ontimeout = xhr.onerror
    arm()
    xhr.send(file)
  })
}

/**
 * The bytes a short-lived download URL Core handed out serves (such as
 * conversation.attachment's download_url), as a Blob: for showing an image in
 * the page as an object URL, which the page's policy for images (img-src
 * 'self' data: blob:) allows where an object store's origin is not. It is
 * fetched as it is, with no Authorization header and no cookie (the URL is
 * the credential), Core's own store through this origin (blobUrl); an object
 * store needs a CORS rule for GET from the app's origin, as downloads of
 * documents do.
 */
export async function fetchBlob(url: string, opts: { signal?: AbortSignal } = {}): Promise<Blob> {
  let res: Response
  try {
    res = await fetch(blobUrl(url), { signal: opts.signal, credentials: 'omit', cache: 'no-store' })
  } catch (e) {
    if (opts.signal?.aborted || isAbort(e)) throw abortError()
    throw new ApiError({ status: 0, code: 'network', message: 'download failed: network error' })
  }
  if (!res.ok) {
    throw new ApiError({ status: res.status, code: 'download_failed', message: `download failed: HTTP ${res.status}` })
  }
  return res.blob()
}

/**
 * Uploads a file for attaching, and returns the upload token that
 * document.create and document.add_version (files, with the file's name) or
 * grade.submit (feedback_files) take, or, for kind conversation, the
 * attachments of conversation.open, .ask or .answer. A document's file is
 * named at its upload URL (document.upload_url's filename: safeFileName of
 * its own name), and that name comes back as fileName. Every upload in the app goes this way; components call it
 * through an upload queue (useUploadQueue): FileDropZone's, or the chat
 * composer's (components/chat/attachments.ts).
 *
 * It asks Core for a short-lived URL (document.upload_url, or
 * conversation.upload_url for a conversation's file) and PUTs the bytes
 * there, reporting progress, speed and the time left (onProgress). A file
 * larger than Core takes is refused before anything is sent where the limit
 * is known (maxBytes, or an earlier upload URL's max_bytes), and before the
 * PUT otherwise, with an error isFileTooLarge says is one. A failure on the
 * way (no answer, a gateway, the server, a rate limit, a transfer that
 * stalls) is tried again, `retries` times, after one second, then two, then
 * four, or once the browser is back online, each time at a fresh URL, since
 * Core's own store takes a URL's file once. Aborting `signal` cancels it.
 *
 * What comes back, and what the caller hands it, stays the same should Core
 * one day hand out a URL for each part of a large file, or one of an object
 * store's that takes it straight: that is decided here, from what the upload
 * URL's read answers.
 */
export async function uploadFile(
  courseId: string,
  kind: UploadKind,
  file: File,
  opts: UploadOptions = {},
): Promise<UploadedFile> {
  const contentType = file.type || 'application/octet-stream'
  // A document's file is named when its URL is asked for, as Core takes a
  // name; a message's is named where it is attached.
  const filename = kind === 'conversation' ? undefined : safeFileName(file.name)
  const retries = opts.retries ?? UPLOAD_RETRIES
  const { signal } = opts
  const known = opts.maxBytes ?? knownUploadLimit(courseId, kind)
  if (known && file.size > known) throw tooLarge(file.size, known)
  const meter = new RateMeter()
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw abortError()
    meter.reset()
    const report = (phase: UploadPhase, loaded: number) => {
      if (!opts.onProgress) return
      if (phase === 'sending') meter.add(Date.now(), loaded)
      const sending = phase === 'sending'
      opts.onProgress({
        phase,
        loaded,
        total: file.size,
        fraction: file.size ? loaded / file.size : phase === 'finishing' ? 1 : 0,
        bytesPerSecond: sending ? meter.rate() : null,
        secondsLeft: sending ? meter.secondsLeft(file.size) : null,
        attempt,
      })
    }
    try {
      report('preparing', 0)
      const target = await askUploadUrl(courseId, kind, contentType, signal, filename)
      learnLimits(courseId, kind, target)
      if (target.max_bytes && file.size > target.max_bytes) throw tooLarge(file.size, target.max_bytes)
      report('sending', 0)
      await putFile(target, file, contentType, {
        signal,
        stallMs: UPLOAD_STALL_MS,
        maxBytes: target.max_bytes || null,
        onSent: (loaded, all) => report(all ? 'finishing' : 'sending', loaded),
      })
      report('finishing', file.size)
      return { uploadToken: target.upload_token, fileName: filename ?? file.name, contentType, size: file.size }
    } catch (e) {
      if (signal?.aborted || isAbort(e)) throw abortError()
      if (!retryableUpload(e) || attempt > retries) throw e
      const offline = isOffline()
      const delayMs = UPLOAD_RETRY_MS * 2 ** (attempt - 1)
      opts.onRetry?.({ attempt: attempt + 1, delayMs, offline, error: e })
      if (offline) await waitOnline(30_000, signal)
      else await wait(delayMs, signal)
    }
  }
}
