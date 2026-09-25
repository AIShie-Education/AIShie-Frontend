import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, blobUrl, read, write } from './http'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

let calls: Call[] = []
let responses: Array<() => Response | Promise<Response>> = []

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

beforeEach(() => {
  calls = []
  responses = []
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
    })
    const next = responses.shift()
    if (!next) throw new Error('no response queued')
    return next()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
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
    const out = await read('me.get', {})
    expect(out).toEqual({ id: 'me' })
    expect(calls).toHaveLength(2)
  })
})

describe('write', () => {
  it('posts the arguments, less those in the path, with an idempotency key', async () => {
    responses.push(json(200, { status: 'executed', action_id: 'a1', review_state: 'none', result: { ok: true } }))
    const out = await write('member.pause', { course_id: 'c1', member_id: 'm1' }, { idempotencyKey: 'k1' })
    expect(out).toEqual({ status: 'executed', actionId: 'a1', reviewState: 'none', result: { ok: true }, replayed: false })
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
    responses.push(json(403, { status: 'denied', action_id: 'a3', error: { code: 'forbidden', message: 'not permitted' } }))
    const err = await write('course.archive', { course_id: 'c1' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.recorded).toBe(true)
    expect(err.actionId).toBe('a3')
    expect(err.actionStatus).toBe('denied')
    expect(err.isForbidden).toBe(true)
  })

  it('reports a failure with the domain error and its status', async () => {
    responses.push(
      json(422, { status: 'failed', action_id: 'a4', error: { code: 'failed_precondition', message: 'the course is archived' } }),
    )
    const err = await write('course.activate', { course_id: 'c1' }).catch((e) => e)
    expect(err.status).toBe(422)
    expect(err.code).toBe('failed_precondition')
    expect(err.message).toBe('the course is archived')
    expect(err.actionStatus).toBe('failed')
  })

  it('retries a write that never got an answer under the same key', async () => {
    responses.push(() => Promise.reject(new TypeError('Failed to fetch')))
    responses.push(json(200, { status: 'executed', action_id: 'a5', result: { ok: true } }, { 'Idempotency-Replayed': 'true' }))
    const out = await write('course.activate', { course_id: 'c1' })
    expect(calls).toHaveLength(2)
    expect(calls[0].headers['Idempotency-Key']).toBe(calls[1].headers['Idempotency-Key'])
    expect(out.replayed).toBe(true)
  })

  it('waits as long as Retry-After says when rate limited, then retries', async () => {
    responses.push(json(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '1' }))
    responses.push(json(200, { status: 'executed', action_id: 'a6', result: { ok: true } }))
    const p = write('course.activate', { course_id: 'c1' })
    await vi.advanceTimersByTimeAsync(1100)
    const out = await p
    expect(out.status).toBe('executed')
    expect(calls).toHaveLength(2)
  })

  it('reports an idempotency conflict without claiming it was recorded', async () => {
    responses.push(json(409, { error: { code: 'idempotency_conflict', message: 'key reused', details: { action_id: 'a0' } } }))
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

describe('blobUrl', () => {
  it('sends a URL for a file on Core’s own disk where the API goes', () => {
    expect(blobUrl('https://core.example.edu/v1/blobs/abc?x=1')).toBe('/v1/blobs/abc?x=1')
  })
  it('leaves an object store’s URL alone', () => {
    expect(blobUrl('https://bucket.s3.example.com/k?sig=1')).toBe('https://bucket.s3.example.com/k?sig=1')
  })
})
