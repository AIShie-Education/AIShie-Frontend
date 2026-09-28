import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The runtime client keeps its answers (the runtime's info, the assertion)
// for the page's life, in the module: each test loads it afresh, with the
// http module it shares ApiError with.
let rt: typeof import('./runtime')
let http: typeof import('./http')

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  credentials?: RequestCredentials
  redirect?: RequestRedirect
}

const INFO = '/runtime/api/v1/info'
const MINT = '/v1/auth/assertion'
const AUDIENCE = 'https://lms.example.edu/runtime'
const INFO_BODY = { audience: AUDIENCE, issuer: 'https://lms.example.edu', version: '0.4.0' }
const T0 = Date.parse('2026-09-28T08:00:00Z')

let calls: Call[] = []
let infoAnswer: () => Response | Promise<Response>
/** Core's answers to requests for an assertion; when none is queued, a new assertion lasting five minutes. */
let mintAnswers: Array<() => Response | Promise<Response>> = []
/** The runtime's answers to everything but /info. */
let runtimeAnswers: Array<() => Response | Promise<Response>> = []
let minted: string[] = []

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
function text(status: number, body: string, contentType = 'text/html') {
  return () => new Response(body, { status, headers: { 'Content-Type': contentType } })
}
function empty(status: number) {
  return () => new Response(null, { status })
}

/** An assertion as Core makes one: a compact JWS, different each time. */
function newAssertion(): string {
  const n = minted.length + 1
  const token = `eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwJHtufSJ9.c2lnbmF0dXJl${n}`
  minted.push(token)
  return token
}
function assertionFor(ms: number, headers: Record<string, string> = {}) {
  return () => json(200, { assertion: newAssertion(), expires_at: new Date(Date.now() + ms).toISOString() }, headers)()
}

/** What a call that must fail rejects with. */
function failure(p: Promise<unknown>): Promise<any> {
  return p.then(
    () => {
      throw new Error('the call succeeded')
    },
    (e) => e,
  )
}

const runtimeCalls = () => calls.filter((c) => c.url.startsWith('/runtime/') && c.url !== INFO)
const mintCalls = () => calls.filter((c) => c.url === MINT)
const infoCalls = () => calls.filter((c) => c.url === INFO)

beforeEach(async () => {
  calls = []
  minted = []
  mintAnswers = []
  runtimeAnswers = []
  infoAnswer = json(200, INFO_BODY)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(T0)
  try {
    sessionStorage.clear()
    localStorage.clear()
  } catch {
    /* no storage */
  }
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: { ...(init.headers as Record<string, string>) },
      body: init.body as string | undefined,
      credentials: init.credentials,
      redirect: init.redirect,
    })
    if (url === INFO) return infoAnswer()
    if (url === MINT) return (mintAnswers.shift() ?? assertionFor(5 * 60_000))()
    const next = runtimeAnswers.shift()
    if (!next) throw new Error(`no answer queued for ${url}`)
    return next()
  })
  vi.resetModules()
  http = await import('./http')
  rt = await import('./runtime')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('runtimeStatus', () => {
  it('finds the runtime when /info answers as it does, asking publicly and once', async () => {
    await expect(rt.runtimeStatus()).resolves.toEqual({ available: true, info: INFO_BODY })
    await expect(rt.runtimeStatus()).resolves.toEqual({ available: true, info: INFO_BODY })
    expect(infoCalls()).toHaveLength(1)
    const c = calls[0]
    expect(c.method).toBe('GET')
    expect(c.credentials).toBe('omit')
    expect(c.redirect).toBe('error')
    expect(c.headers.Authorization).toBeUndefined()
    expect(mintCalls()).toHaveLength(0)
  })

  it('keeps fields it does not know out of the info', async () => {
    infoAnswer = json(200, { ...INFO_BODY, extra: true })
    await expect(rt.runtimeStatus()).resolves.toEqual({ available: true, info: INFO_BODY })
  })

  it.each([
    [
      '404 (a Core, or a server with no route)',
      json(404, { error: { code: 'not_found', message: 'no such route' } }),
      404,
    ],
    ['502 (the stack, before the runtime serves its API)', empty(502), 502],
    ['503', json(503, { error: { code: 'unavailable', message: 'starting' } }), 503],
    [
      'the app itself (a proxy that sends the path to the front end)',
      text(200, '<!doctype html><div id="app"></div>'),
      200,
    ],
    ['500 with a page', text(500, '<h1>oops</h1>'), 500],
  ])('takes %s to mean there is none', async (_, answer, status) => {
    infoAnswer = answer
    const s = await rt.runtimeStatus()
    expect(s.available).toBe(false)
    if (s.available) return
    expect(s.error).toBeInstanceOf(http.ApiError)
    expect(s.error.status).toBe(status)
    expect(infoCalls()).toHaveLength(1)
  })

  it('takes an answer without the shape to mean there is none', async () => {
    for (const body of [
      {},
      [],
      null,
      'runtime',
      { audience: AUDIENCE, issuer: 'https://lms.example.edu' },
      { audience: '', issuer: 'https://lms.example.edu', version: '1' },
      { audience: 7, issuer: 'https://lms.example.edu', version: '1' },
      { audience: AUDIENCE, issuer: null, version: '1' },
      { status: 'executed', result: INFO_BODY },
    ]) {
      infoAnswer = json(200, body)
      const s = await rt.runtimeStatus({ refresh: true })
      expect(s.available, JSON.stringify(body)).toBe(false)
      if (!s.available) expect(s.error.code).toBe('invalid_response')
    }
  })

  it('takes no answer to mean there is none, without retrying', async () => {
    infoAnswer = () => Promise.reject(new TypeError('Failed to fetch'))
    const s = await rt.runtimeStatus()
    expect(s).toMatchObject({ available: false, error: { status: 0, code: 'network' } })
    expect(infoCalls()).toHaveLength(1)
  })

  it('asks again when told to', async () => {
    infoAnswer = empty(502)
    expect((await rt.runtimeStatus()).available).toBe(false)
    infoAnswer = json(200, INFO_BODY)
    expect((await rt.runtimeStatus()).available).toBe(false)
    expect((await rt.runtimeStatus({ refresh: true })).available).toBe(true)
    expect((await rt.runtimeStatus()).available).toBe(true)
    expect(infoCalls()).toHaveLength(2)
  })
})

describe('the assertion', () => {
  it('is asked of Core for the runtime’s audience, with the session, and sent to the runtime as a bearer', async () => {
    runtimeAnswers.push(json(200, { agents: [] }))
    await expect(rt.runtimeApi.get('/agents')).resolves.toEqual({ agents: [] })

    expect(calls.map((c) => c.url)).toEqual([INFO, MINT, '/runtime/api/v1/agents'])
    const mint = mintCalls()[0]
    expect(mint.method).toBe('POST')
    expect(mint.credentials).toBe('include')
    expect(mint.body).toBe(JSON.stringify({ audience: AUDIENCE }))
    expect(mint.headers.Authorization).toBeUndefined()

    const call = runtimeCalls()[0]
    expect(call.headers.Authorization).toBe(`Bearer ${minted[0]}`)
    expect(call.credentials).toBe('omit')
    expect(call.redirect).toBe('error')
  })

  it('is kept for the calls after, and asked for once however many wait for it', async () => {
    for (let i = 0; i < 3; i++) runtimeAnswers.push(json(200, { n: i }))
    await Promise.all([rt.runtimeApi.get('/a'), rt.runtimeApi.get('/b')])
    await rt.runtimeApi.get('/c')
    expect(mintCalls()).toHaveLength(1)
    expect(infoCalls()).toHaveLength(1)
    expect(runtimeCalls().map((c) => c.headers.Authorization)).toEqual(Array(3).fill(`Bearer ${minted[0]}`))
  })

  it('is replaced 30 seconds before it ends, and not before', async () => {
    for (let i = 0; i < 3; i++) runtimeAnswers.push(json(200, {}))
    await rt.runtimeApi.get('/a')
    vi.setSystemTime(T0 + 5 * 60_000 - 31_000)
    await rt.runtimeApi.get('/a')
    expect(mintCalls()).toHaveLength(1)
    vi.setSystemTime(T0 + 5 * 60_000 - 29_000)
    await rt.runtimeApi.get('/a')
    expect(mintCalls()).toHaveLength(2)
    expect(runtimeCalls()[2].headers.Authorization).toBe(`Bearer ${minted[1]}`)
  })

  it('is replaced halfway through a life shorter than a minute', async () => {
    mintAnswers.push(assertionFor(20_000))
    for (let i = 0; i < 3; i++) runtimeAnswers.push(json(200, {}))
    await rt.runtimeApi.get('/a')
    vi.setSystemTime(T0 + 9_000)
    await rt.runtimeApi.get('/a')
    expect(mintCalls()).toHaveLength(1)
    vi.setSystemTime(T0 + 11_000)
    await rt.runtimeApi.get('/a')
    expect(mintCalls()).toHaveLength(2)
  })

  it('ends by Core’s clock, not this browser’s, when Core says what its clock reads', async () => {
    // This browser's clock is ten minutes ahead of Core's.
    const coreNow = new Date(T0 - 10 * 60_000)
    mintAnswers.push(
      json(
        200,
        { assertion: newAssertion(), expires_at: new Date(coreNow.getTime() + 5 * 60_000).toISOString() },
        { Date: coreNow.toUTCString() },
      ),
    )
    runtimeAnswers.push(json(200, {}), json(200, {}))
    await rt.runtimeApi.get('/a')
    vi.setSystemTime(T0 + 4 * 60_000)
    await rt.runtimeApi.get('/a')
    expect(mintCalls()).toHaveLength(1)
  })

  it('is dropped when the person goes, and one on its way is not kept', async () => {
    runtimeAnswers.push(json(200, {}), json(200, {}), json(200, {}))
    await rt.runtimeApi.get('/a')
    rt.forgetAssertion()
    await rt.runtimeApi.get('/a')
    expect(mintCalls()).toHaveLength(2)
    expect(runtimeCalls()[1].headers.Authorization).toBe(`Bearer ${minted[1]}`)

    // Someone signs out while an assertion for them is being made.
    rt.forgetAssertion()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    mintAnswers.push(async () => {
      await gate
      return assertionFor(5 * 60_000)()
    })
    const pending = rt.runtimeApi.get('/a')
    await vi.waitFor(() => expect(mintCalls()).toHaveLength(3))
    rt.forgetAssertion()
    release()
    await pending
    runtimeAnswers.push(json(200, {}))
    await rt.runtimeApi.get('/a')
    expect(mintCalls()).toHaveLength(4)
  })

  it('is not asked for when there is no runtime, and the call says why', async () => {
    infoAnswer = empty(502)
    const err = await failure(rt.runtimeApi.get('/agents'))
    expect(err).toBeInstanceOf(http.ApiError)
    expect(err.status).toBe(502)
    expect(mintCalls()).toHaveLength(0)
    expect(runtimeCalls()).toHaveLength(0)
  })

  it('refused by Core, fails the call with Core’s words and calls no runtime', async () => {
    for (const [status, code, message] of [
      [404, 'not_found', 'this server makes no assertions for a service that hosts agents'],
      [400, 'invalid_argument', 'the audience is not one this server makes assertions for'],
      [403, 'forbidden', 'the account is suspended'],
    ] as const) {
      mintAnswers.push(json(status, { error: { code, message } }))
      const err = await failure(rt.runtimeApi.get('/agents'))
      expect(err).toBeInstanceOf(http.ApiError)
      expect({ status: err.status, code: err.code, message: err.message }).toEqual({ status, code, message })
    }
    expect(runtimeCalls()).toHaveLength(0)
  })

  it('refused by Core for a lapsed session tells the app, as any 401 from Core does', async () => {
    const heard: unknown[] = []
    const stop = http.onUnauthenticated((e) => heard.push(e))
    mintAnswers.push(json(401, { error: { code: 'unauthenticated', message: 'sign in' } }))
    const err = await failure(rt.runtimeApi.get('/agents'))
    stop()
    expect(err.isUnauthenticated).toBe(true)
    expect(heard).toHaveLength(1)
    expect(runtimeCalls()).toHaveLength(0)
  })

  it('that Core answers without one is an error', async () => {
    mintAnswers.push(json(200, { assertion: '', expires_at: 'soon' }))
    const err = await failure(rt.runtimeApi.get('/agents'))
    expect(err.code).toBe('invalid_response')
    expect(runtimeCalls()).toHaveLength(0)
  })
})

describe('a 401 from the runtime', () => {
  it('gets a new assertion and the call again, once', async () => {
    runtimeAnswers.push(json(401, { error: { code: 'unauthenticated', message: 'the assertion has expired' } }))
    runtimeAnswers.push(json(201, { id: 'agt_1' }))
    const out = await rt.runtimeApi.post('/agents', { token: 'ais_x' }, { idempotencyKey: 'k1' })
    expect(out.data).toEqual({ id: 'agt_1' })
    expect(mintCalls()).toHaveLength(2)
    const [first, second] = runtimeCalls()
    expect(first.headers.Authorization).toBe(`Bearer ${minted[0]}`)
    expect(second.headers.Authorization).toBe(`Bearer ${minted[1]}`)
    // The same call: the same key and body.
    expect(second.headers['Idempotency-Key']).toBe('k1')
    expect(second.body).toBe(first.body)
  })

  it('twice is the answer: no third call, no loop', async () => {
    const refused = json(401, { error: { code: 'unauthenticated', message: 'not an assertion this runtime takes' } })
    runtimeAnswers.push(refused, refused, refused, refused)
    const err = await failure(rt.runtimeApi.get('/agents'))
    expect(err).toBeInstanceOf(http.ApiError)
    expect(err.status).toBe(401)
    expect(err.message).toBe('not an assertion this runtime takes')
    expect(runtimeCalls()).toHaveLength(2)
    expect(mintCalls()).toHaveLength(2)
  })

  it('is not taken for a lapsed session: the app is not told to sign anyone out', async () => {
    const heard: unknown[] = []
    const stop = http.onUnauthenticated((e) => heard.push(e))
    runtimeAnswers.push(json(401, { error: { code: 'unauthenticated', message: 'no' } }))
    runtimeAnswers.push(json(401, { error: { code: 'unauthenticated', message: 'no' } }))
    await rt.runtimeApi.get('/agents').catch(() => undefined)
    stop()
    expect(heard).toHaveLength(0)
  })

  it('from calls at once asks Core for one new assertion, not one each', async () => {
    const refused = json(401, { error: { code: 'unauthenticated', message: 'expired' } })
    runtimeAnswers.push(json(200, {}))
    await rt.runtimeApi.get('/warm')
    runtimeAnswers.push(refused, refused, json(200, { n: 1 }), json(200, { n: 2 }))
    await Promise.all([rt.runtimeApi.get('/a'), rt.runtimeApi.get('/b')])
    expect(mintCalls()).toHaveLength(2)
    expect(
      runtimeCalls()
        .slice(3)
        .map((c) => c.headers.Authorization),
    ).toEqual([`Bearer ${minted[1]}`, `Bearer ${minted[1]}`])
  })
})

describe('the assertion stays secret', () => {
  it('is in no error, and nothing is logged', async () => {
    const logged: unknown[][] = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args))
    }
    const errors: unknown[] = []
    const refused = json(401, { error: { code: 'unauthenticated', message: 'no' } })

    // Refused twice.
    runtimeAnswers.push(refused, refused)
    errors.push(await failure(rt.runtimeApi.get('/a')))
    // A runtime that, wrongly, repeats the assertion in its error.
    runtimeAnswers.push(() =>
      json(400, {
        error: {
          code: 'invalid_argument',
          message: `bad credential ${minted[minted.length - 1]}`,
          details: { got: minted[minted.length - 1], nested: [{ header: `Bearer ${minted[0]}` }] },
        },
      })(),
    )
    errors.push(await failure(rt.runtimeApi.get('/b')))
    // No answer, a page, and an answer that is not JSON.
    runtimeAnswers.push(...Array(3).fill(() => Promise.reject(new TypeError('Failed to fetch'))))
    errors.push(await failure(rt.runtimeApi.get('/c')))
    runtimeAnswers.push(text(500, '<h1>error</h1>'))
    errors.push(await failure(rt.runtimeApi.delete('/d')))
    runtimeAnswers.push(text(200, 'not json', 'text/plain'))
    errors.push(await failure(rt.runtimeApi.get('/e')))

    expect(minted.length).toBeGreaterThan(1)
    expect(errors).toHaveLength(5)
    for (const e of errors) {
      expect(e).toBeInstanceOf(http.ApiError)
      const all = [
        String(e),
        (e as Error).message,
        (e as Error).stack,
        JSON.stringify(e),
        JSON.stringify((e as { details?: unknown }).details),
      ].join('\n')
      for (const token of minted) expect(all).not.toContain(token)
      expect(all).not.toContain('eyJ')
    }
    expect((errors[1] as Error).message).toBe('bad credential [assertion]')
    const said = JSON.stringify(logged)
    for (const token of minted) expect(said).not.toContain(token)
  })

  it('is kept in no storage', async () => {
    runtimeAnswers.push(json(200, {}))
    await rt.runtimeApi.get('/a')
    const stored = [sessionStorage, localStorage].flatMap((s) =>
      Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`),
    )
    for (const entry of stored) expect(entry).not.toContain(minted[0])
    expect(document.cookie).not.toContain(minted[0])
  })

  it('goes only to the runtime, and Core’s own credential never does', async () => {
    http.bearer.set('ais_abcdefghijkl_pasted-core-token')
    runtimeAnswers.push(json(200, {}))
    await rt.runtimeApi.get('/a')
    // Core is asked with the pasted token, as every call to Core is …
    expect(mintCalls()[0].headers.Authorization).toBe('Bearer ais_abcdefghijkl_pasted-core-token')
    // … and the runtime sees the assertion alone, with no cookie.
    const call = runtimeCalls()[0]
    expect(call.headers.Authorization).toBe(`Bearer ${minted[0]}`)
    expect(call.credentials).toBe('omit')
    expect(JSON.stringify(calls.filter((c) => c.url.startsWith('/runtime/')))).not.toContain('ais_abcdefghijkl')
  })
})

describe('errors', () => {
  it('are the runtime’s own, from Core’s envelope', async () => {
    runtimeAnswers.push(
      json(409, {
        error: { code: 'conflict', message: 'this agent is already hosted', details: { agent_id: 'agt_1' } },
      }),
    )
    const err = await failure(rt.runtimeApi.post('/agents', {}))
    expect(err).toBeInstanceOf(http.ApiError)
    expect(err.status).toBe(409)
    expect(err.code).toBe('conflict')
    expect(err.message).toBe('this agent is already hosted')
    expect(err.details).toEqual({ agent_id: 'agt_1' })
    expect(err.recorded).toBe(false)
  })

  it.each([
    [404, 'not_found', 'isNotFound'],
    [403, 'forbidden', 'isForbidden'],
  ] as const)('say what a %i is', async (status, code, getter) => {
    runtimeAnswers.push(json(status, { error: { code, message: 'x' } }))
    const err = await failure(rt.runtimeApi.delete('/agents/agt_1'))
    expect(err[getter]).toBe(true)
  })

  it('without an envelope say the status alone', async () => {
    runtimeAnswers.push(text(500, '<h1>Internal Server Error</h1>'))
    const err = await failure(rt.runtimeApi.delete('/a'))
    expect({ status: err.status, code: err.code, message: err.message }).toEqual({
      status: 500,
      code: 'internal',
      message: 'HTTP 500',
    })
    runtimeAnswers.push(empty(418))
    const other = await failure(rt.runtimeApi.delete('/a'))
    expect({ status: other.status, code: other.code, message: other.message }).toEqual({
      status: 418,
      code: 'unknown',
      message: 'HTTP 418',
    })
  })

  it('include a success that is not JSON', async () => {
    runtimeAnswers.push(text(200, '<!doctype html>'))
    const err = await failure(rt.runtimeApi.get('/a'))
    expect(err.code).toBe('invalid_response')
  })

  it('leave out a success with no body, which is none', async () => {
    runtimeAnswers.push(empty(204))
    await expect(rt.runtimeApi.delete('/agents/agt_1')).resolves.toBeUndefined()
  })

  it('say when no answer came, in their own words', async () => {
    runtimeAnswers.push(...Array(3).fill(() => Promise.reject(new TypeError('Failed to fetch'))))
    const err = await failure(rt.runtimeApi.get('/a'))
    expect(err.isNetwork).toBe(true)
    expect(err.message).toBe('the agent runtime could not be reached')
    expect(runtimeCalls()).toHaveLength(3)
  })

  it('from a gateway are retried for a read, and not for a change without a key', async () => {
    runtimeAnswers.push(empty(503), json(200, { ok: true }))
    await expect(rt.runtimeApi.get('/a')).resolves.toEqual({ ok: true })
    expect(runtimeCalls()).toHaveLength(2)

    runtimeAnswers.push(empty(503))
    const err = await failure(rt.runtimeApi.patch('/agents/agt_1', { paused: true }, 3))
    expect(err.status).toBe(503)
    expect(runtimeCalls()).toHaveLength(3)
  })
})

describe('Idempotency-Key', () => {
  it('goes with every POST: the one given, or a fresh one', async () => {
    runtimeAnswers.push(json(200, {}), json(200, {}), json(200, {}))
    await rt.runtimeApi.post('/agents', { a: 1 }, { idempotencyKey: 'connect-1' })
    await rt.runtimeApi.post('/agents/agt_1/pause')
    await rt.runtimeApi.post('/agents/agt_1/pause')
    const [a, b, c] = runtimeCalls()
    expect(a.headers['Idempotency-Key']).toBe('connect-1')
    expect(a.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(a.body!)).toEqual({ a: 1 })
    expect(b.headers['Idempotency-Key']).toMatch(/\S{8,}/)
    expect(c.headers['Idempotency-Key']).not.toBe(b.headers['Idempotency-Key'])
    expect(b.body).toBeUndefined()
  })

  it('does not go with a read', async () => {
    runtimeAnswers.push(json(200, {}))
    await rt.runtimeApi.get('/agents', { query: { limit: 20, after: undefined, state: ['running', 'paused'] } })
    const [call] = runtimeCalls()
    expect(call.headers['Idempotency-Key']).toBeUndefined()
    expect(call.url).toBe('/runtime/api/v1/agents?limit=20&state=running&state=paused')
  })

  it('keeps a POST that met no answer safe to send again, under the same key', async () => {
    runtimeAnswers.push(
      () => Promise.reject(new TypeError('Failed to fetch')),
      json(201, { id: 'agt_1' }, { 'Idempotency-Replayed': 'true' }),
    )
    const out = await rt.runtimeApi.post('/agents', {})
    const [first, second] = runtimeCalls()
    expect(second.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key'])
    expect(out).toMatchObject({ status: 201, data: { id: 'agt_1' }, replayed: true })
  })
})

describe('If-Match and ETag', () => {
  it('gives the version a read was at, and sends it with the change', async () => {
    runtimeAnswers.push(json(200, { id: 'agt_1', version: 3 }, { ETag: '"3"' }))
    const got = await rt.runtimeApi.getVersioned<{ id: string; version: number }>('/agents/agt_1')
    expect(got.etag).toBe('"3"')
    expect(got.data.version).toBe(3)

    runtimeAnswers.push(json(200, { id: 'agt_1', version: 4 }, { ETag: '"4"' }))
    const changed = await rt.runtimeApi.patch('/agents/agt_1', { paused: true }, got.etag!)
    const call = runtimeCalls()[1]
    expect(call.method).toBe('PATCH')
    expect(call.headers['If-Match']).toBe('"3"')
    expect(call.headers['Idempotency-Key']).toBeUndefined()
    expect(changed.etag).toBe('"4"')
  })

  it('takes the version a body carries as well', async () => {
    runtimeAnswers.push(json(200, {}))
    await rt.runtimeApi.patch('/agents/agt_1', {}, 7)
    expect(runtimeCalls()[0].headers['If-Match']).toBe('"7"')
  })

  it('says when the version has moved on', async () => {
    runtimeAnswers.push(json(412, { error: { code: 'failed_precondition', message: 'changed since' } }))
    const err = await failure(rt.runtimeApi.patch('/agents/agt_1', {}, '"3"'))
    expect(rt.isVersionMismatch(err)).toBe(true)
    expect(rt.isVersionMismatch(new http.ApiError({ status: 409, code: 'conflict', message: 'x' }))).toBe(false)
    expect(rt.isVersionMismatch(new Error('x'))).toBe(false)
  })

  it('quotes a bare version, keeps an ETag as it is, and refuses what is neither', () => {
    expect(rt.ifMatch(7)).toBe('"7"')
    expect(rt.ifMatch('7')).toBe('"7"')
    expect(rt.ifMatch('"7"')).toBe('"7"')
    expect(rt.ifMatch('W/"abc"')).toBe('W/"abc"')
    expect(rt.ifMatch(' "7" ')).toBe('"7"')
    for (const bad of ['', '*', 'a b', 'a"b', '"a"b"', 'line\nbreak']) {
      expect(() => rt.ifMatch(bad), JSON.stringify(bad)).toThrow(/not a version/)
    }
  })
})

describe('runtimePath', () => {
  it('fills in a route’s parameters, each one segment', () => {
    expect(rt.runtimePath('/agents/{agent_id}/courses/{course_id}', { agent_id: 'agt_1', course_id: 'a/b?c' })).toBe(
      '/agents/agt_1/courses/a%2Fb%3Fc',
    )
    expect(rt.runtimePath(rt.RUNTIME_ROUTES.info)).toBe('/info')
    expect(() => rt.runtimePath('/agents/{agent_id}', {})).toThrow(/agent_id is required/)
  })
})
