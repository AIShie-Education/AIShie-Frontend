import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptInvite,
  acceptsLoginId,
  ApiError,
  authMethods,
  ssoButtons,
  blobUrl,
  isPasswordChangeRequired,
  login,
  onPasswordChangeRequired,
  onUnauthenticated,
  read,
  write,
} from './http'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  credentials?: RequestCredentials
}

let calls: Call[] = []
let responses: Array<() => Response | Promise<Response>> = []

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

beforeEach(() => {
  calls = []
  responses = []
  // The clock moves only when a test moves it: a wait before a call is sent
  // again takes no time, and a busy machine cannot stretch one past a limit.
  vi.useFakeTimers()
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
      credentials: init.credentials,
    })
    const next = responses.shift()
    if (!next) throw new Error('no response queued')
    return next()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('read', () => {
  it('puts path parameters in the path and the rest in the query', async () => {
    responses.push(json(200, { status: 'executed', result: { members: [], next: null } }))
    const out = await read('member.list', { course_id: 'c1', role: 'student', include_removed: true, limit: 50 })
    expect(out).toEqual({ members: [], next: null })
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toBe('/v1/courses/c1/members?role=student&include_removed=true&limit=50')
    expect(calls[0].headers['Idempotency-Key']).toBeUndefined()
  })

  it('leaves out undefined and null arguments', async () => {
    responses.push(json(200, { status: 'executed', result: { assignments: [] } }))
    await read('assignment.list', { course_id: 'c1', after: undefined, limit: undefined })
    expect(calls[0].url).toBe('/v1/courses/c1/assignments')
  })

  it('turns a refusal into an ApiError that knows it is one', async () => {
    responses.push(json(403, { status: 'denied', error: { code: 'forbidden', message: 'not permitted' } }))
    const err = await read('course.get', { course_id: 'c1' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.isForbidden).toBe(true)
    expect(err.recorded).toBe(false)
  })

  it('retries a read that met a gateway error', async () => {
    responses.push(json(502, {}))
    responses.push(json(200, { status: 'executed', result: { id: 'me' } }))
    const p = read('me.get', {})
    await vi.advanceTimersByTimeAsync(499)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toEqual({ id: 'me' })
    expect(calls).toHaveLength(2)
  })
})

describe('a read that waits for news', () => {
  /** A Core that never answers: the fetch ends only when it is aborted, as a browser's does. */
  function silent() {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string> })
      const signal = init.signal
      signals.push(signal!)
      return new Promise((_, reject) => {
        if (!signal) return
        if (signal.aborted) reject(new DOMException('The operation was aborted.', 'AbortError'))
        signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
      })
    })
    return signals
  }
  const args = { course_id: 'k1', conversation_id: 'c1', after_seq: 4, wait_s: 25, seen_state: 'answered' }

  it('is given up after its limit as a network failure, and tried again as one', async () => {
    silent()
    const p = read('conversation.messages', args, { timeoutMs: 40_000 }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(40_000 + 500 + 40_000 + 1000 + 40_000)
    const err = await p
    expect(err).toBeInstanceOf(ApiError)
    expect(err.isNetwork).toBe(true)
    expect(err.message).toBe('no answer in 40 s')
    expect(calls).toHaveLength(3)
    expect(calls[0]!.url).toBe('/v1/courses/k1/conversations/c1/messages?after_seq=4&wait_s=25&seen_state=answered')
  })

  it('is never cut short before its limit, and a read without one never is', async () => {
    const signals = silent()
    void read('conversation.messages', args, { timeoutMs: 40_000 }).catch(() => undefined)
    void read('conversation.messages', { course_id: 'k1', conversation_id: 'c1' }).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(39_999)
    expect(signals[0]!.aborted).toBe(false)
    expect(signals[1]).toBeUndefined()
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(signals[0]!.aborted).toBe(true)
  })

  it('passes on the caller’s abort as it is, and is not tried again', async () => {
    const signals = silent()
    const ctrl = new AbortController()
    const p = read('conversation.messages', args, { signal: ctrl.signal, timeoutMs: 40_000 }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(1000)
    ctrl.abort()
    const err = await p
    expect(err).not.toBeInstanceOf(ApiError)
    expect(err.name).toBe('AbortError')
    expect(signals[0]!.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toHaveLength(1)
  })
})

describe('write', () => {
  it('posts the arguments, less those in the path, with an idempotency key', async () => {
    responses.push(json(200, { status: 'executed', action_id: 'a1', review_state: 'none', result: { ok: true } }))
    const out = await write('member.pause', { course_id: 'c1', member_id: 'm1' }, { idempotencyKey: 'k1' })
    expect(out).toEqual({
      status: 'executed',
      actionId: 'a1',
      reviewState: 'none',
      result: { ok: true },
      replayed: false,
    })
    expect(calls[0].url).toBe('/v1/courses/c1/members/m1/pause')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].headers['Idempotency-Key']).toBe('k1')
    expect(JSON.parse(calls[0].body!)).toEqual({})
  })

  it('treats 202 as a proposal, not as an error and not as done', async () => {
    responses.push(json(202, { status: 'proposed', action_id: 'a2' }))
    const out = await write('grade.submit', { course_id: 'c1', submission_id: 's1', score: '9.5' })
    expect(out.status).toBe('proposed')
    expect(out.actionId).toBe('a2')
    expect(out.result).toBeUndefined()
  })

  it('reports a denial as recorded, with its action', async () => {
    responses.push(
      json(403, { status: 'denied', action_id: 'a3', error: { code: 'forbidden', message: 'not permitted' } }),
    )
    const err = await write('course.archive', { course_id: 'c1' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.recorded).toBe(true)
    expect(err.actionId).toBe('a3')
    expect(err.actionStatus).toBe('denied')
    expect(err.isForbidden).toBe(true)
  })

  it('reports a failure with the domain error and its status', async () => {
    responses.push(
      json(422, {
        status: 'failed',
        action_id: 'a4',
        error: { code: 'failed_precondition', message: 'the course is archived' },
      }),
    )
    const err = await write('course.activate', { course_id: 'c1' }).catch((e) => e)
    expect(err.status).toBe(422)
    expect(err.code).toBe('failed_precondition')
    expect(err.message).toBe('the course is archived')
    expect(err.actionStatus).toBe('failed')
  })

  it('retries a write that never got an answer under the same key', async () => {
    responses.push(() => Promise.reject(new TypeError('Failed to fetch')))
    responses.push(
      json(200, { status: 'executed', action_id: 'a5', result: { ok: true } }, { 'Idempotency-Replayed': 'true' }),
    )
    const p = write('course.activate', { course_id: 'c1' })
    await vi.advanceTimersByTimeAsync(500)
    const out = await p
    expect(calls).toHaveLength(2)
    expect(calls[0].headers['Idempotency-Key']).toBe(calls[1].headers['Idempotency-Key'])
    expect(out.replayed).toBe(true)
  })

  it('waits as long as Retry-After says when rate limited, then retries', async () => {
    responses.push(json(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '1' }))
    responses.push(json(200, { status: 'executed', action_id: 'a6', result: { ok: true } }))
    const p = write('course.activate', { course_id: 'c1' })
    await vi.advanceTimersByTimeAsync(999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    const out = await p
    expect(out.status).toBe('executed')
    expect(calls).toHaveLength(2)
  })

  it('reports an idempotency conflict without claiming it was recorded', async () => {
    responses.push(
      json(409, { error: { code: 'idempotency_conflict', message: 'key reused', details: { action_id: 'a0' } } }),
    )
    const err = await write('course.activate', { course_id: 'c1' }).catch((e) => e)
    expect(err.code).toBe('idempotency_conflict')
    expect(err.recorded).toBe(false)
    expect(err.details).toEqual({ action_id: 'a0' })
  })

  it('refuses to build a path with a missing parameter', async () => {
    await expect(write('member.pause', { course_id: 'c1', member_id: '' })).rejects.toThrow(/member_id is required/)
    expect(calls).toHaveLength(0)
  })
})

describe('acceptInvite', () => {
  const TOKEN = 'aisinv_abcdefghijkl_secret'

  it('posts the token and the password, with the cookie, and gives back who they are', async () => {
    const answer = { actor_id: 'p1', email: 'chan@example.edu', expires_at: '2026-09-26T04:00:00Z' }
    responses.push(json(200, answer))
    const out = await acceptInvite(TOKEN, 'a long enough password')
    expect(out).toEqual(answer)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe('/v1/auth/invite')
    expect(calls[0].credentials).toBe('include')
    expect(calls[0].headers['Idempotency-Key']).toBeUndefined()
    expect(JSON.parse(calls[0].body!)).toEqual({ token: TOKEN, password: 'a long enough password' })
  })

  it('says an invitation that is no good is one, without signing anybody out', async () => {
    const heard: ApiError[] = []
    const stop = onUnauthenticated((e) => heard.push(e))
    responses.push(json(401, { error: { code: 'unauthenticated', message: 'the invitation is not valid' } }))
    const err = await acceptInvite(TOKEN, 'a long enough password').catch((e) => e)
    stop()
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.isUnauthenticated).toBe(true)
    expect(heard).toHaveLength(0)
    expect(calls).toHaveLength(1)
  })

  it("passes on Core's words about a weak password", async () => {
    responses.push(
      json(400, { error: { code: 'invalid_argument', message: 'a password must be 10 to 1024 characters' } }),
    )
    const err = await acceptInvite(TOKEN, 'short').catch((e) => e)
    expect(err.status).toBe(400)
    expect(err.code).toBe('invalid_argument')
    expect(err.message).toBe('a password must be 10 to 1024 characters')
  })

  it('is not retried when rate limited, and says how long to wait', async () => {
    responses.push(json(429, { error: { code: 'rate_limited', message: 'too many calls' } }, { 'Retry-After': '42' }))
    const err = await acceptInvite(TOKEN, 'a long enough password').catch((e) => e)
    expect(calls).toHaveLength(1)
    expect(err.status).toBe(429)
    expect(err.code).toBe('rate_limited')
    expect(err.details).toEqual({ retry_after_seconds: 42 })
  })

  it("keeps Core's own count of seconds to wait", async () => {
    responses.push(
      json(
        429,
        { error: { code: 'rate_limited', message: 'x', details: { retry_after_seconds: 7 } } },
        { 'Retry-After': '9' },
      ),
    )
    const err = await acceptInvite(TOKEN, 'a long enough password').catch((e) => e)
    expect(err.details).toEqual({ retry_after_seconds: 7 })
  })
})

describe('authMethods', () => {
  const START = '/v1/auth/sso/start'
  // What the build says, which only a Core that does not say is taken to mean.
  const built = (enabled: string, label = '') => {
    vi.stubEnv('VITE_SSO_ENABLED', enabled)
    vi.stubEnv('VITE_SSO_LABEL', label)
  }

  it('asks Core, publicly, and takes no single sign-on for none, whatever the build says', async () => {
    built('true', 'Built-in NetID')
    responses.push(json(200, { password: true, sso: null }))
    await expect(authMethods()).resolves.toEqual({ password: true, sso: null })
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toBe('/v1/auth/methods')
    expect(calls[0].credentials).toBe('include')
    expect(calls[0].headers['Idempotency-Key']).toBeUndefined()
  })

  it("takes single sign-on with Core's name for the provider, and where it starts", async () => {
    built('false')
    responses.push(json(200, { password: true, sso: { label: 'PolyU NetID', start: START } }))
    await expect(authMethods()).resolves.toEqual({ password: true, sso: { label: 'PolyU NetID', start: START } })
  })

  it('takes single sign-on with no name as the app’s own words, not the build’s', async () => {
    built('true', 'Built-in NetID')
    responses.push(json(200, { password: true, sso: { label: null, start: START } }))
    await expect(authMethods()).resolves.toEqual({ password: true, sso: { label: null, start: START } })
  })

  it('takes a Core from before the route (404) to mean what the build says', async () => {
    built('true', 'PolyU NetID')
    responses.push(
      json(404, { error: { code: 'not_found', message: 'no such route; GET /v1/tools lists what there is' } }),
    )
    await expect(authMethods()).resolves.toEqual({ password: true, sso: { label: 'PolyU NetID', start: START } })

    built('true')
    responses.push(json(404, {}))
    await expect(authMethods()).resolves.toEqual({ password: true, sso: { label: null, start: START } })

    vi.unstubAllEnvs()
    responses.push(json(404, {}))
    await expect(authMethods()).resolves.toEqual({ password: true, sso: null })
  })

  it('takes no answer to mean what the build says, and does not ask again', async () => {
    built('true', 'PolyU NetID')
    responses.push(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(authMethods()).resolves.toEqual({ password: true, sso: { label: 'PolyU NetID', start: START } })
    expect(calls).toHaveLength(1)

    built('false')
    responses.push(json(503, { error: { code: 'unavailable', message: 'starting' } }))
    await expect(authMethods()).resolves.toEqual({ password: true, sso: null })
    expect(calls).toHaveLength(2)
  })

  it('takes an answer that is not one to mean what the build says', async () => {
    built('true')
    const fallback = { password: true, sso: { label: null, start: START } }
    // The front end's own index.html, from a proxy that does not send /v1 to Core.
    responses.push(() => new Response('<!doctype html><div id="app"></div>', { status: 200 }))
    await expect(authMethods()).resolves.toEqual(fallback)
    for (const body of [
      { sso: null },
      { password: true },
      { password: true, sso: { label: 'X' } },
      { password: true, sso: { label: 7, start: START } },
      { password: true, sso: { label: 'X', start: 'https://elsewhere.example/start' } },
      { password: true, sso: { label: 'X', start: '//elsewhere.example/start' } },
      { password: true, sso: { label: 'X', start: '/v1/auth/sso/start?next=/' } },
    ]) {
      responses.push(json(200, body))
      await expect(authMethods(), JSON.stringify(body)).resolves.toEqual(fallback)
    }
  })
})

describe('authMethods with several identity providers', () => {
  const OPERATOR = { id: 'polyu-adfs', label: 'PolyU NetID', start: '/v1/auth/sso/start/polyu-adfs' }
  const SITE = { id: 'hainanu-cas', label: '海大統一認證', start: '/v1/auth/sso/start/hainanu-cas' }

  it('takes every provider offered, in Core’s order, beside the first as sso', async () => {
    responses.push(
      json(200, { password: true, sso: { label: 'PolyU NetID', start: OPERATOR.start }, sso_providers: [OPERATOR, SITE] }),
    )
    const m = await authMethods()
    expect(m).toEqual({
      password: true,
      sso: { label: 'PolyU NetID', start: OPERATOR.start },
      ssoProviders: [OPERATOR, SITE],
    })
    expect(ssoButtons(m)).toEqual([OPERATOR, SITE])
  })

  it('takes no name as the app’s own words, and leaves out an entry that would send the browser elsewhere', async () => {
    responses.push(
      json(200, {
        password: true,
        sso: { label: null, start: '/v1/auth/sso/start/lib' },
        sso_providers: [
          { id: 'lib', label: null, start: '/v1/auth/sso/start/lib' },
          { id: 'evil', label: 'X', start: 'https://elsewhere.example/start' },
          { id: 'evil2', label: 'X', start: '//elsewhere.example/start' },
          { id: 'q', label: 'X', start: '/v1/auth/sso/start/q?next=/' },
          { label: 'no id', start: '/v1/auth/sso/start/x' },
          { id: 'odd', label: 7, start: '/v1/auth/sso/start/odd' },
          'not one',
        ],
      }),
    )
    const m = await authMethods()
    expect(m.ssoProviders).toEqual([{ id: 'lib', label: null, start: '/v1/auth/sso/start/lib' }])
  })

  it('offers none where Core offers none now', async () => {
    responses.push(json(200, { password: true, sso: null, sso_providers: [] }))
    const m = await authMethods()
    expect(m).toEqual({ password: true, sso: null, ssoProviders: [] })
    expect(ssoButtons(m)).toEqual([])
  })

  it('offers the one sso of a Core from before several providers, as it always did', async () => {
    responses.push(json(200, { password: true, sso: { label: 'PolyU NetID', start: '/v1/auth/sso/start' } }))
    const m = await authMethods()
    expect(m.ssoProviders).toBeUndefined()
    expect(ssoButtons(m)).toEqual([{ label: 'PolyU NetID', start: '/v1/auth/sso/start' }])
    expect(ssoButtons({ sso: null })).toEqual([])
    expect(ssoButtons(null)).toEqual([])
  })
})

describe('blobUrl', () => {
  it('sends a URL for a file on Core’s own disk where the API goes', () => {
    expect(blobUrl('https://core.example.edu/v1/blobs/abc?x=1')).toBe('/v1/blobs/abc?x=1')
  })
  it('leaves an object store’s URL alone', () => {
    expect(blobUrl('https://bucket.s3.example.com/k?sig=1')).toBe('https://bucket.s3.example.com/k?sig=1')
  })
})

describe('signing in with a login ID', () => {
  it('reads what password sign-in takes, and whether a login ID is among it', async () => {
    responses.push(json(200, { password: true, password_accepts: ['login_id', 'email'], sso: null }))
    const m = await authMethods()
    expect(m).toEqual({ password: true, passwordAccepts: ['login_id', 'email'], sso: null })
    expect(acceptsLoginId(m)).toBe(true)
    expect(acceptsLoginId({})).toBe(false)
    expect(acceptsLoginId(null)).toBe(false)
  })

  it('sends the name as login where Core takes a login ID, and as email where it does not', async () => {
    responses.push(json(200, { actor_id: 'a1', expires_at: '2026-10-01T00:00:00Z' }))
    responses.push(json(200, { actor_id: 'a1', expires_at: '2026-10-01T00:00:00Z', password_change_required: true }))
    await login('chan@example.edu', 'pw', { asLogin: false })
    const out = await login('S2023001', 'pw', { asLogin: true })
    expect(JSON.parse(calls[0].body!)).toEqual({ email: 'chan@example.edu', password: 'pw' })
    expect(JSON.parse(calls[1].body!)).toEqual({ login: 'S2023001', password: 'pw' })
    expect(out.password_change_required).toBe(true)
  })

  it('tells whoever listens when Core refuses a call until the caller sets their own password', async () => {
    const heard: string[] = []
    const stop = onPasswordChangeRequired((e) => heard.push(String(e.details?.reason)))
    responses.push(
      json(403, {
        status: 'denied',
        error: { code: 'forbidden', message: 'not permitted', details: { reason: 'password_change_required' } },
      }),
    )
    const err = await read('me.get', {}).catch((e) => e)
    expect(isPasswordChangeRequired(err)).toBe(true)
    expect(heard).toEqual(['password_change_required'])
    // Any other refusal is not that.
    responses.push(
      json(403, { status: 'denied', error: { code: 'forbidden', message: 'not permitted', details: { reason: 'x' } } }),
    )
    const other = await read('me.get', {}).catch((e) => e)
    expect(isPasswordChangeRequired(other)).toBe(false)
    expect(heard).toHaveLength(1)
    stop()
  })
})
