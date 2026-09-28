import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/api/types'

// What Core answers each read with, and what was asked.
let answer: (tool: string, args: Record<string, unknown>) => Promise<unknown>
let asked: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      asked.push({ tool, args })
      return answer(tool, args)
    }),
  }
})

// What this Core has is kept for the page's life: each test is a new page.
async function page() {
  vi.resetModules()
  const { ApiError } = await import('@/api/http')
  const mod = await import('./actorSearch')
  const refuse = (status: number, code: string) => Promise.reject(new ApiError({ status, code, message: code }))
  return { ...mod, ApiError, refuse }
}

const ID = '01a0d79f-13c6-70da-a7cc-f009b1efe423'

function actor(over: Partial<Actor> = {}): Actor {
  return {
    id: ID,
    kind: 'human',
    display_name: 'Chan Tai Man',
    email: 'chan@example.edu',
    status: 'active',
    created_at: '2026-09-01T00:00:00Z',
    has_password: true,
    has_sso: false,
    email_verified: true,
    ...over,
  }
}

beforeEach(() => {
  asked = []
  answer = (tool) => Promise.reject(new Error(`no answer for ${tool}`))
})

describe('lacksActorList', () => {
  it('takes 405, 404 and method_not_allowed for a Core without the tool, and nothing else', async () => {
    const { lacksActorList, ApiError } = await page()
    const err = (status: number, code: string) => new ApiError({ status, code, message: code })
    // An older Core: GET /v1/actors is a method its route does not take.
    expect(lacksActorList(err(405, 'method_not_allowed'))).toBe(true)
    // Something in front of Core that knows no such route.
    expect(lacksActorList(err(404, 'unknown'))).toBe(true)
    expect(lacksActorList(err(404, 'not_found'))).toBe(true)
    expect(lacksActorList(err(400, 'method_not_allowed'))).toBe(true)

    expect(lacksActorList(err(403, 'forbidden'))).toBe(false)
    expect(lacksActorList(err(401, 'unauthenticated'))).toBe(false)
    expect(lacksActorList(err(500, 'internal'))).toBe(false)
    expect(lacksActorList(err(0, 'network'))).toBe(false)
    expect(lacksActorList(new Error('HTTP 405'))).toBe(false)
    expect(lacksActorList(null)).toBe(false)
  })
})

describe('listActors', () => {
  it('notes that the Core has the directory when it answers', async () => {
    const { listActors, hasActorList } = await page()
    answer = () => Promise.resolve({ actors: [actor()] })
    expect(hasActorList.value).toBeNull()
    await expect(listActors({ search: 'chan' })).resolves.toEqual({ actors: [actor()] })
    expect(hasActorList.value).toBe(true)
    expect(asked).toEqual([{ tool: 'actor.list', args: { search: 'chan' } }])
  })

  it('notes that it has none on a 405, and still throws', async () => {
    const { listActors, hasActorList, refuse } = await page()
    answer = () => refuse(405, 'method_not_allowed')
    await expect(listActors({})).rejects.toMatchObject({ status: 405 })
    expect(hasActorList.value).toBe(false)
  })

  it('learns nothing about the Core from a refusal or a failure', async () => {
    const { listActors, hasActorList, refuse } = await page()
    answer = () => refuse(403, 'forbidden')
    await expect(listActors({})).rejects.toMatchObject({ status: 403 })
    expect(hasActorList.value).toBeNull()
    answer = () => refuse(0, 'network')
    await expect(listActors({})).rejects.toMatchObject({ status: 0 })
    expect(hasActorList.value).toBeNull()
  })
})

describe('probeActorList', () => {
  it('asks for one row, once for the page, however many forms ask at the same time', async () => {
    const { probeActorList, hasActorList } = await page()
    answer = () => Promise.resolve({ actors: [actor()] })
    await Promise.all([probeActorList(), probeActorList()])
    expect(asked).toEqual([{ tool: 'actor.list', args: { limit: 1 } }])
    expect(hasActorList.value).toBe(true)
    await probeActorList()
    expect(asked).toHaveLength(1)
  })

  it('does not ask again once a Core has said it has no directory', async () => {
    const { probeActorList, hasActorList, refuse } = await page()
    answer = () => refuse(405, 'method_not_allowed')
    await expect(probeActorList()).resolves.toBeUndefined()
    expect(hasActorList.value).toBe(false)
    await probeActorList()
    expect(asked).toHaveLength(1)
  })

  it('asks again after a failure that said nothing about the tool', async () => {
    const { probeActorList, hasActorList, refuse } = await page()
    answer = () => refuse(0, 'network')
    await probeActorList()
    expect(hasActorList.value).toBeNull()
    answer = () => Promise.resolve({ actors: [] })
    await probeActorList()
    expect(asked).toHaveLength(2)
    expect(hasActorList.value).toBe(true)
  })
})

describe('activeFirst', () => {
  it('puts the suspended after the active, and keeps Core’s order otherwise', async () => {
    const { activeFirst } = await page()
    const a = actor({ id: 'a', status: 'suspended' })
    const b = actor({ id: 'b' })
    const c = actor({ id: 'c', kind: 'agent' })
    const d = actor({ id: 'd', status: 'suspended' })
    expect(activeFirst([a, b, c, d]).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(activeFirst(null)).toEqual([])
  })
})

describe('useActorSearch', () => {
  it('finds people and agents by a piece of their name or email, the suspended last', async () => {
    const { useActorSearch } = await page()
    const suspended = actor({ id: 'x', display_name: 'Chan Siu Ming', status: 'suspended' })
    const agent = actor({ id: 'y', kind: 'agent', display_name: 'chan-grader', email: null })
    answer = () => Promise.resolve({ actors: [suspended, agent] })
    const s = useActorSearch(10)
    await s.search('  chan ')
    expect(asked).toEqual([{ tool: 'actor.list', args: { search: 'chan', limit: 10 } }])
    expect(s.options.value.map((a) => a.id)).toEqual(['y', 'x'])
    expect(s.error.value).toBeNull()
    expect(s.searching.value).toBe(false)
  })

  it('shows the start of the directory for no text, the first time the list opens', async () => {
    const { useActorSearch } = await page()
    answer = () => Promise.resolve({ actors: [actor()] })
    const s = useActorSearch()
    s.onVisible(true)
    await vi.waitFor(() => expect(s.options.value).toHaveLength(1))
    expect(asked).toEqual([{ tool: 'actor.list', args: { search: undefined, limit: 20 } }])
    s.onVisible(true)
    s.onVisible(false)
    expect(asked).toHaveLength(1)
  })

  it('finds the one actor whose whole ID is pasted, and nobody for an ID no one has', async () => {
    const { useActorSearch, refuse } = await page()
    answer = (tool) => (tool === 'actor.get' ? Promise.resolve(actor()) : Promise.reject(new Error(tool)))
    const s = useActorSearch()
    await s.search(ID.toUpperCase())
    expect(asked).toEqual([{ tool: 'actor.get', args: { actor_id: ID } }])
    expect(s.options.value).toEqual([actor()])

    answer = () => refuse(404, 'not_found')
    await s.search(ID)
    expect(s.options.value).toEqual([])
    expect(s.error.value).toBeNull()
  })

  it('on a Core without the directory, says so once and not as a failure, and still takes an ID', async () => {
    const { useActorSearch, hasActorList, refuse } = await page()
    answer = (tool) => (tool === 'actor.get' ? Promise.resolve(actor()) : refuse(405, 'method_not_allowed'))
    const s = useActorSearch()
    await s.search('chan')
    expect(s.options.value).toEqual([])
    expect(s.error.value).toBeNull()
    expect(hasActorList.value).toBe(false)

    // Known now: text is not sent again, for this form or another one.
    await s.search('tai')
    await useActorSearch().search('')
    expect(asked.filter((a) => a.tool === 'actor.list')).toHaveLength(1)

    await s.search(ID)
    expect(s.options.value).toEqual([actor()])
  })

  it('waits for a probe under way, and on a Core without the directory asks nothing more', async () => {
    const { useActorSearch, probeActorList, hasActorList, ApiError } = await page()
    let reply!: () => void
    answer = (tool) =>
      tool === 'actor.get'
        ? Promise.resolve(actor())
        : new Promise((_resolve, reject) => {
            reply = () => reject(new ApiError({ status: 405, code: 'method_not_allowed', message: 'GET' }))
          })
    const probed = probeActorList()
    const s = useActorSearch()
    // The list opens, and text is typed, before the Core has said.
    s.onVisible(true)
    const typed = s.search('sam')
    // A whole ID needs no directory, and does not wait for it.
    const pasted = useActorSearch()
    await pasted.search(ID)
    expect(pasted.options.value).toEqual([actor()])
    expect(s.searching.value).toBe(true)

    reply()
    await Promise.all([probed, typed])
    expect(hasActorList.value).toBe(false)
    expect(s.options.value).toEqual([])
    expect(s.error.value).toBeNull()
    expect(s.searching.value).toBe(false)
    expect(asked).toEqual([
      { tool: 'actor.list', args: { limit: 1 } },
      { tool: 'actor.get', args: { actor_id: ID } },
    ])
  })

  it('waits for a probe under way, and then sends only the latest text', async () => {
    const { useActorSearch, probeActorList, hasActorList } = await page()
    let reply!: () => void
    answer = (_tool, args) =>
      args.limit === 1
        ? new Promise((resolve) => (reply = () => resolve({ actors: [] })))
        : Promise.resolve({ actors: [actor()] })
    const probed = probeActorList()
    const s = useActorSearch()
    s.onVisible(true)
    const typed = s.search('chan')

    reply()
    await Promise.all([probed, typed])
    expect(hasActorList.value).toBe(true)
    expect(s.options.value).toEqual([actor()])
    expect(asked).toEqual([
      { tool: 'actor.list', args: { limit: 1 } },
      { tool: 'actor.list', args: { search: 'chan', limit: 20 } },
    ])
  })

  it('says why any other failure found nobody', async () => {
    const { useActorSearch, hasActorList, refuse } = await page()
    answer = () => refuse(403, 'forbidden')
    const s = useActorSearch()
    await s.search('chan')
    expect(s.options.value).toEqual([])
    expect(s.error.value).toContain('forbidden')
    expect(hasActorList.value).toBeNull()
  })

  it('shows only the answer to the latest search', async () => {
    const { useActorSearch } = await page()
    const slow = actor({ id: 'slow', display_name: 'Chan' })
    const fast = actor({ id: 'fast', display_name: 'Chan Tai Man' })
    let release!: () => void
    answer = (_tool, args) =>
      args.search === 'chan'
        ? new Promise((resolve) => (release = () => resolve({ actors: [slow] })))
        : Promise.resolve({ actors: [fast] })
    const s = useActorSearch()
    const first = s.search('chan')
    await s.search('chan tai')
    release()
    await first
    expect(s.options.value.map((a) => a.id)).toEqual(['fast'])
    expect(s.searching.value).toBe(false)
  })
})
