import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActorRow } from './adminShared'

// What Core answers each actor.list with, and what was asked.
let answer: (args: Record<string, unknown>) => Promise<unknown>
let asked: Record<string, unknown>[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      if (tool !== 'actor.list') return Promise.reject(new Error(`no answer for ${tool}`))
      asked.push(args)
      return answer(args)
    }),
  }
})

const { ApiError } = await import('@/api/http')
const { findSameName, sameText, SAME_NAME_PAGE, SAME_NAME_PAGES } = await import('./sameName')

let serial = 0
function actor(display_name: string, over: Partial<ActorRow> = {}): ActorRow {
  const n = (++serial).toString(16).padStart(12, '0')
  return {
    id: `01a0d79f-13c6-70da-a7cc-${n}`,
    kind: 'human',
    display_name,
    email: `someone${serial}@example.edu`,
    status: 'active',
    created_at: '2026-09-01T00:00:00Z',
    has_password: true,
    has_sso: false,
    email_verified: true,
    login_id_verified: true,
    ...over,
  }
}
/** A full page of those whose email holds "ed" (…@example.edu), none named Ed. */
const fullPage = () => Array.from({ length: SAME_NAME_PAGE }, (_, i) => actor(`Student ${i}`))
/** Pages in order, each with the cursor to the next but the last. */
function pages(...list: ActorRow[][]) {
  answer = async (args) => {
    const i = args.after ? Number(String(args.after).slice(1)) : 0
    const actors = list[i] ?? []
    return { actors, next: i + 1 < list.length ? `p${i + 1}` : undefined }
  }
}

beforeEach(() => {
  asked = []
  answer = () => Promise.reject(new Error('no answer'))
})

describe('sameText', () => {
  it('compares whole names, whatever the case and the spaces around them', () => {
    expect(sameText(' claude ', 'Claude')).toBe(true)
    expect(sameText('Claude-grader-1', 'Claude')).toBe(false)
  })
})

describe('findSameName', () => {
  it('reads on past a page of other matches to the one of that name', async () => {
    const ed = actor('Ed', { email: 'ed@example.com' })
    pages(fullPage(), [actor('Edith'), ed, actor('Claude', { kind: 'agent', email: null })])
    const found: ActorRow[][] = []
    const out = await findSameName('ed', { found: (a) => found.push(a) })
    expect(asked).toEqual([
      { search: 'ed', limit: SAME_NAME_PAGE, after: undefined },
      { search: 'ed', limit: SAME_NAME_PAGE, after: 'p1' },
    ])
    expect(out).toEqual({ actors: [ed], checked: SAME_NAME_PAGE + 3, complete: true })
    // The warning can show as soon as the page with them comes in.
    expect(found).toEqual([[ed]])
  })

  it('finds a plain "Claude" behind many whose names only contain it', async () => {
    const graders = Array.from({ length: SAME_NAME_PAGE }, (_, i) =>
      actor(`Claude-grader-${i}`, { kind: 'agent', email: null }),
    )
    const claude = actor('Claude', { kind: 'agent', email: null })
    const other = actor('claude', { kind: 'agent', email: null })
    pages(graders, [claude, other])
    const out = await findSameName('Claude')
    expect(out?.actors).toEqual([claude, other])
    expect(out?.complete).toBe(true)
  })

  it('stops after five pages and says the check was not complete', async () => {
    const early = actor('Ed')
    pages([early, ...fullPage().slice(1)], fullPage(), fullPage(), fullPage(), fullPage(), [actor('Ed')])
    const out = await findSameName('Ed')
    expect(asked).toHaveLength(SAME_NAME_PAGES)
    expect(out).toEqual({ actors: [early], checked: SAME_NAME_PAGES * SAME_NAME_PAGE, complete: false })
  })

  it('drops the answer and asks no more once the name has been typed over', async () => {
    let typedOn = false
    const ed = actor('Ed')
    answer = async (args) => {
      if (!args.after) {
        typedOn = true // typed on while the first page was on its way
        return { actors: fullPage(), next: 'p1' }
      }
      return { actors: [ed] }
    }
    const found = vi.fn()
    const out = await findSameName('Ed', { stale: () => typedOn, found })
    expect(out).toBeNull()
    expect(asked).toHaveLength(1)
    expect(found).not.toHaveBeenCalled()
  })

  it('drops a stale answer between pages too, keeping none of it', async () => {
    let typedOn = false
    const ed = actor('Ed')
    answer = async (args) => {
      if (!args.after) return { actors: [ed, ...fullPage().slice(1)], next: 'p1' }
      typedOn = true
      return { actors: [actor('Ed')], next: 'p2' }
    }
    const found = vi.fn()
    const out = await findSameName('Ed', { stale: () => typedOn, found })
    expect(out).toBeNull()
    expect(asked).toHaveLength(2)
    // Only the first page, heard while it was still the name typed.
    expect(found.mock.calls).toEqual([[[ed]]])
  })

  it('throws when the first page fails, and keeps what was found when a later one does', async () => {
    answer = () => Promise.reject(new ApiError({ status: 405, code: 'method_not_allowed', message: 'no' }))
    await expect(findSameName('Ed')).rejects.toBeInstanceOf(ApiError)

    const ed = actor('Ed')
    answer = async (args) => {
      if (!args.after) return { actors: [ed, ...fullPage().slice(1)], next: 'p1' }
      throw new ApiError({ status: 429, code: 'rate_limited', message: 'too many calls' })
    }
    expect(await findSameName('Ed')).toEqual({ actors: [ed], checked: SAME_NAME_PAGE, complete: false })
  })
})
