import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// What the runtime says is kept for the page's life, in the modules: each
// test loads them afresh, as a new page would.
let useRuntime: typeof import('./useRuntime').useRuntime
let ApiError: typeof import('@/api/http').ApiError

const INFO_BODY = {
  api: 'aishie-runtime',
  api_version: 1,
  version: '0.4.0',
  commit: 'e6df9b4',
  audience: 'https://lms.example.edu/runtime',
  issuer: 'https://lms.example.edu',
  features: { connect_by_token: true, own_key: true, school_key: false, transcription: false },
}
let answers: Array<() => Response | Promise<Response>> = []
let asked = 0

beforeEach(async () => {
  answers = []
  asked = 0
  vi.stubGlobal('fetch', async (url: string) => {
    expect(url).toBe('/runtime/api/v1/info')
    asked++
    const next = answers.shift()
    if (!next) throw new Error('no answer queued')
    return next()
  })
  vi.resetModules()
  ;({ useRuntime } = await import('./useRuntime'))
  ;({ ApiError } = await import('@/api/http'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ok = () =>
  new Response(JSON.stringify(INFO_BODY), { status: 200, headers: { 'Content-Type': 'application/json' } })
const badGateway = () => new Response(null, { status: 502 })
const page = () =>
  new Response('<!doctype html><div id="app"></div>', { status: 200, headers: { 'Content-Type': 'text/html' } })

describe('useRuntime', () => {
  it('offers hosting once the runtime has answered, asking once for the whole page', async () => {
    answers.push(ok)
    const a = useRuntime()
    const b = useRuntime()
    expect(a.checked.value).toBe(false)
    expect(a.available.value).toBe(false)
    await vi.waitFor(() => expect(a.checked.value).toBe(true))
    expect(a.available.value).toBe(true)
    expect(a.info.value).toEqual(INFO_BODY)
    expect(a.error.value).toBeNull()
    expect(b.available.value).toBe(true)
    useRuntime()
    expect(asked).toBe(1)
  })

  it.each([
    [
      'a 404',
      () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'no such route' } }), { status: 404 }),
    ],
    ['a 502', badGateway],
    ['a page', page],
  ])('hides hosting after %s, and says why', async (_, answer) => {
    answers.push(answer)
    const r = useRuntime()
    await vi.waitFor(() => expect(r.checked.value).toBe(true))
    expect(r.available.value).toBe(false)
    expect(r.info.value).toBeNull()
    expect(r.error.value).toBeInstanceOf(ApiError)
  })

  it('asks again when refreshed, and takes the newer answer', async () => {
    answers.push(badGateway, ok)
    const r = useRuntime()
    await vi.waitFor(() => expect(r.checked.value).toBe(true))
    expect(r.available.value).toBe(false)
    await expect(r.refresh()).resolves.toBe(true)
    expect(r.available.value).toBe(true)
    expect(r.error.value).toBeNull()
    expect(asked).toBe(2)
  })

  it('hides hosting once Core turns out to make no assertions for the runtime', async () => {
    answers.push(ok)
    const r = useRuntime()
    await vi.waitFor(() => expect(r.available.value).toBe(true))
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === '/v1/auth/assertion')
        return new Response(JSON.stringify({ error: { code: 'not_found', message: 'none' } }), { status: 404 })
      throw new Error(`unexpected ${url}`)
    })
    const { runtime } = await import('@/api/runtime')
    await expect(runtime.list()).rejects.toMatchObject({ reason: 'runtime_absent' })
    expect(r.available.value).toBe(false)
    expect(r.checked.value).toBe(true)
    expect(useRuntime().available.value).toBe(false)
  })

  it('lets a later question’s answer stand over an earlier one that comes after it', async () => {
    let release!: (r: Response) => void
    answers.push(() => new Promise<Response>((r) => (release = r)), ok)
    const r = useRuntime()
    const fresh = r.refresh()
    await expect(fresh).resolves.toBe(true)
    release(badGateway())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(r.available.value).toBe(true)
  })
})
