import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import type { Actor } from '@/api/types'

// Every read goes through this, answered per test.
let answer: (tool: string, args: Record<string, unknown>) => Promise<unknown>
const calls: Array<{ tool: string; args: Record<string, unknown> }> = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args })
      return answer(tool, args)
    }),
  }
})

// The module keeps what it learnt about Core for the page's life: each test
// starts from a fresh page.
async function fresh() {
  vi.resetModules()
  return import('./useActorList')
}

function actor(id: string, kind: string, status = 'active'): Actor {
  return { id, kind, status, display_name: id, created_at: '2026-09-01T00:00:00Z' }
}

// What Core de4f548, which has no actor.list, answers GET /v1/actors with.
const methodNotAllowed = () =>
  new ApiError({
    status: 405,
    code: 'method_not_allowed',
    message: 'GET is not something /v1/actors takes; it takes POST',
  })

beforeEach(() => {
  calls.length = 0
  answer = () => Promise.reject(new Error('no answer'))
})

describe('lacksActorList', () => {
  it('knows an older Core by its 405, or a 404 from something in front of it', async () => {
    const { lacksActorList } = await fresh()
    expect(lacksActorList(methodNotAllowed())).toBe(true)
    expect(lacksActorList(new ApiError({ status: 404, code: 'not_found', message: 'no such route' }))).toBe(true)
    expect(lacksActorList(new ApiError({ status: 400, code: 'method_not_allowed', message: 'm' }))).toBe(true)
  })
  it('takes no other failure for a missing tool', async () => {
    const { lacksActorList } = await fresh()
    expect(lacksActorList(new ApiError({ status: 403, code: 'forbidden', message: 'platform_role_required' }))).toBe(
      false,
    )
    expect(lacksActorList(new ApiError({ status: 400, code: 'invalid_argument', message: 'kind must be…' }))).toBe(
      false,
    )
    expect(lacksActorList(new ApiError({ status: 0, code: 'network', message: 'offline' }))).toBe(false)
    expect(lacksActorList(new ApiError({ status: 500, code: 'internal', message: 'boom' }))).toBe(false)
    expect(lacksActorList(new Error('405'))).toBe(false)
    expect(lacksActorList(null)).toBe(false)
  })
})

describe('forSeating', () => {
  it('offers people and agents, never the system actor, the active first in Core’s order', async () => {
    const { forSeating } = await fresh()
    const list = [
      actor('root', 'human'),
      actor('system', 'system'),
      actor('huang', 'human', 'suspended'),
      actor('grader', 'agent'),
      actor('old-bot', 'agent', 'suspended'),
      actor('yuki', 'human'),
    ]
    expect(forSeating(list).map((a) => a.id)).toEqual(['root', 'grader', 'yuki', 'huang', 'old-bot'])
  })
  it('takes Core’s null for an empty list', async () => {
    const { forSeating } = await fresh()
    expect(forSeating(null)).toEqual([])
    expect(forSeating(undefined)).toEqual([])
  })
})

describe('whether this Core has actor.list', () => {
  it('is unknown until a call says, and a 405 says no', async () => {
    const { listActors, useActorList } = await fresh()
    const { available } = useActorList()
    expect(available.value).toBeNull()
    answer = () => Promise.reject(methodNotAllowed())
    await expect(listActors({ q: 'yuki' })).rejects.toBeInstanceOf(ApiError)
    expect(available.value).toBe(false)
  })

  it('is yes once a list comes back', async () => {
    const { listActors, useActorList } = await fresh()
    answer = () => Promise.resolve({ actors: [actor('root', 'human')] })
    await listActors({ limit: 1 })
    expect(useActorList().available.value).toBe(true)
  })

  it('is left unknown by a failure that says nothing about the tool', async () => {
    const { listActors, useActorList } = await fresh()
    answer = () => Promise.reject(new ApiError({ status: 0, code: 'network', message: 'offline' }))
    await expect(listActors({})).rejects.toBeInstanceOf(ApiError)
    expect(useActorList().available.value).toBeNull()
  })

  it('is probed with one row, once, however many ask at the same time', async () => {
    const { useActorList } = await fresh()
    answer = () => Promise.resolve({ actors: [] })
    const a = useActorList()
    const b = useActorList()
    await Promise.all([a.probe(), b.probe()])
    await a.probe()
    expect(calls).toEqual([{ tool: 'actor.list', args: { limit: 1 } }])
    expect(a.available.value).toBe(true)
  })

  it('probes again after a probe that learnt nothing', async () => {
    const { useActorList } = await fresh()
    answer = () => Promise.reject(new ApiError({ status: 503, code: 'internal', message: 'down' }))
    const d = useActorList()
    await d.probe()
    expect(d.available.value).toBeNull()
    answer = () => Promise.reject(methodNotAllowed())
    await d.probe()
    expect(d.available.value).toBe(false)
    expect(calls).toHaveLength(2)
  })
})
