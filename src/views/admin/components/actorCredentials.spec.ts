import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActorCredential } from './actorCredentials'

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
  const mod = await import('./actorCredentials')
  const err = (status: number, code: string) => new ApiError({ status, code, message: code })
  return { ...mod, err }
}

const AGENT = '01a0d79f-13c6-70da-a7cc-f009b1efe423'
const ROOT = '01a0d79f-0000-70da-a7cc-f009b1efe400'
const NOW = Date.parse('2026-09-25T12:00:00Z')

function cred(over: Partial<ActorCredential> = {}): ActorCredential {
  return { id: 'c1', kind: 'api_token', created_at: '2026-09-01T00:00:00Z', ...over }
}

beforeEach(() => {
  asked = []
  answer = (tool) => Promise.reject(new Error(`no answer for ${tool}`))
})

describe('lacksCredentialList', () => {
  it('takes 405, 404 and method_not_allowed for a Core without the tool, and nothing else', async () => {
    const { lacksCredentialList, err } = await page()
    expect(lacksCredentialList(err(405, 'method_not_allowed'))).toBe(true)
    expect(lacksCredentialList(err(404, 'not_found'))).toBe(true)
    expect(lacksCredentialList(err(404, 'unknown'))).toBe(true)
    expect(lacksCredentialList(err(400, 'method_not_allowed'))).toBe(true)

    expect(lacksCredentialList(err(403, 'forbidden'))).toBe(false)
    expect(lacksCredentialList(err(401, 'unauthenticated'))).toBe(false)
    expect(lacksCredentialList(err(500, 'internal'))).toBe(false)
    expect(lacksCredentialList(err(0, 'network'))).toBe(false)
    expect(lacksCredentialList(new Error('HTTP 404'))).toBe(false)
    expect(lacksCredentialList(undefined)).toBe(false)
  })
})

describe('listActorCredentials', () => {
  it('asks for the actor’s credentials and takes null for none', async () => {
    const { listActorCredentials, credentialListMissing } = await page()
    answer = () => Promise.resolve({ credentials: null })
    await expect(listActorCredentials(AGENT)).resolves.toEqual([])
    expect(asked).toEqual([{ tool: 'actor.list_credentials', args: { actor_id: AGENT } }])
    expect(credentialListMissing.value).toBe(false)

    answer = () => Promise.resolve({ credentials: [cred()] })
    await expect(listActorCredentials(AGENT)).resolves.toEqual([cred()])
  })

  it('notes a Core without the tool, and still throws', async () => {
    const { listActorCredentials, credentialListMissing, err } = await page()
    answer = () => Promise.reject(err(404, 'not_found'))
    await expect(listActorCredentials(AGENT)).rejects.toMatchObject({ status: 404 })
    expect(credentialListMissing.value).toBe(true)
  })

  it('takes a refusal or a failure for what it is, not for a missing tool', async () => {
    const { listActorCredentials, credentialListMissing, err } = await page()
    answer = () => Promise.reject(err(403, 'forbidden'))
    await expect(listActorCredentials(AGENT)).rejects.toMatchObject({ status: 403 })
    answer = () => Promise.reject(err(0, 'network'))
    await expect(listActorCredentials(AGENT)).rejects.toMatchObject({ status: 0 })
    expect(credentialListMissing.value).toBe(false)
  })
})

describe('arrangeCredentials', () => {
  // Newest first, as Core lists them.
  const list = [
    cred({ id: 'session', kind: 'session', label: 'password login', expires_at: '2026-10-01T00:00:00Z' }),
    cred({ id: 'revoked', revoked_at: '2026-09-20T00:00:00Z' }),
    cred({ id: 'expired', expires_at: '2026-09-24T00:00:00Z' }),
    cred({ id: 'new', expires_at: '2026-12-01T00:00:00Z' }),
    cred({ id: 'old' }),
    cred({ id: 'password', kind: 'password' }),
    cred({ id: 'old-session', kind: 'session', expires_at: '2026-09-02T00:00:00Z' }),
  ]
  const ids = (rows: { c: ActorCredential }[]) => rows.map((r) => r.c.id)

  it('puts the live tokens apart from the other ways in, and leaves out the dead', async () => {
    const { arrangeCredentials } = await page()
    const out = arrangeCredentials(list, { showInactive: false, now: NOW })
    expect(ids(out.tokens)).toEqual(['new', 'old'])
    expect(ids(out.others)).toEqual(['session', 'password'])
    expect(out.inactive).toBe(3)
    expect(out.tokens.every((r) => r.state === 'active')).toBe(true)
  })

  it('shows the revoked and expired after the live ones when asked, in Core’s order otherwise', async () => {
    const { arrangeCredentials } = await page()
    const out = arrangeCredentials(list, { showInactive: true, now: NOW })
    expect(ids(out.tokens)).toEqual(['new', 'old', 'revoked', 'expired'])
    expect(out.tokens.map((r) => r.state)).toEqual(['active', 'active', 'revoked', 'expired'])
    expect(ids(out.others)).toEqual(['session', 'password', 'old-session'])
    expect(out.inactive).toBe(3)
  })

  it('judges expiry at the moment given, and takes nothing for an empty list', async () => {
    const { arrangeCredentials } = await page()
    const later = Date.parse('2026-12-02T00:00:00Z')
    expect(ids(arrangeCredentials(list, { showInactive: false, now: later }).tokens)).toEqual(['old'])
    expect(arrangeCredentials(null, { showInactive: true })).toEqual({ tokens: [], others: [], inactive: 0 })
  })
})

describe('tokenIssuer', () => {
  it('tells a token the actor made from one an administrator issued', async () => {
    const { tokenIssuer } = await page()
    expect(tokenIssuer(cred({ issued_by_actor_id: AGENT, issued_by_name: 'grader' }), AGENT)).toEqual({ by: 'self' })
    expect(tokenIssuer(cred({ issued_by_actor_id: AGENT.toUpperCase() }), AGENT)).toEqual({ by: 'self' })
    expect(tokenIssuer(cred({ issued_by_actor_id: ROOT, issued_by_name: 'Root' }), AGENT)).toEqual({
      by: 'other',
      id: ROOT,
      name: 'Root',
    })
    // An issuer whose name cannot be told is still named by id.
    expect(tokenIssuer(cred({ issued_by_actor_id: ROOT, issued_by_name: ' ' }), AGENT)).toEqual({
      by: 'other',
      id: ROOT,
      name: null,
    })
  })

  it('says nothing for an older token or another kind', async () => {
    const { tokenIssuer } = await page()
    expect(tokenIssuer(cred(), AGENT)).toBeNull()
    expect(tokenIssuer(cred({ issued_by_actor_id: null }), AGENT)).toBeNull()
    expect(tokenIssuer(cred({ kind: 'session', issued_by_actor_id: ROOT }), AGENT)).toBeNull()
  })
})

describe('isTemporaryPassword', () => {
  it('is a password someone else set, which its person must replace, and nothing else', async () => {
    const { isTemporaryPassword } = await page()
    expect(isTemporaryPassword({ kind: 'password', must_change: true })).toBe(true)
    expect(isTemporaryPassword({ kind: 'password', must_change: false })).toBe(false)
    expect(isTemporaryPassword({ kind: 'password' })).toBe(false)
    expect(isTemporaryPassword({ kind: 'api_token', must_change: true })).toBe(false)
  })
})
