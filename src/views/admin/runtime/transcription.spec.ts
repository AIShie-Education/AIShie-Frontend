import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetRuntimeAssertion, isRuntimeError } from '@/api/runtime'
import type { TranscriptionSettings } from '@/api/runtime-types'
import {
  ADMIN,
  Servers,
  adminState,
  executed,
  json,
  refusal,
  serviceCredential,
  transcriptionSettings,
  withAdmin,
  type AdminState,
} from './adminFakes'
import {
  formProblems,
  handOverServiceCredential,
  patchFrom,
  prefixOfHint,
  withdrawServiceCredential,
  type TranscriptionForm,
} from './transcription'

let s: Servers
let state: AdminState
const logged: unknown[][] = []

beforeEach(() => {
  forgetRuntimeAssertion()
  state = adminState()
  s = withAdmin(new Servers(), state).install()
  logged.length = 0
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const live = () => state.service.credentials.filter((x) => x.live).map((x) => x.id)
const issued = () => s.to('POST', ADMIN.serviceCredentials).map((c) => JSON.parse(c.body!))
const puts = () => s.to('PUT', ADMIN.credential)
/** Every request made but the runtime's own PUT, and everything logged: where a token must not be. */
const elsewhere = () =>
  JSON.stringify([s.calls.filter((c) => !(c.method === 'PUT' && ADMIN.credential.test(c.url))), logged])

/** A credential the runtime does not hold, live in Core. */
const other = (id: string) => serviceCredential({ id, token_prefix: `other${id.padEnd(7, '0')}`.slice(0, 12) })

describe('handOverServiceCredential', () => {
  it('issues one without replace, hands it to the runtime once, and revokes the others then', async () => {
    state.service.credentials.push(other('cred-old'))
    const confirmReplaceAll = vi.fn()
    const out = await handOverServiceCredential({ label: 'runtime lms.example.edu', confirmReplaceAll })
    expect(confirmReplaceAll).not.toHaveBeenCalled()
    expect(issued()).toEqual([{ label: 'runtime lms.example.edu' }])
    const [token] = state.service.issued
    expect(token).toMatch(/^aissvc_/)
    expect(state.service.received).toEqual([token])
    expect(JSON.parse(puts()[0].body!)).toEqual({ token, credential_id: out!.credentialId })
    // Only the runtime's is left.
    expect(live()).toEqual([out!.credentialId])
    expect(out).toMatchObject({ revoked: 2, unrevoked: 0 })
    expect(out!.settings.credential).toMatchObject({ status: 'ok', credential_id: out!.credentialId })
    // The token went to the runtime and nowhere else, and nothing logged it.
    expect(elsewhere()).not.toContain(token)
    expect(elsewhere()).not.toContain(token.slice(-43))
  })

  it('revokes the new one when the runtime refuses it, and keeps the others', async () => {
    s.on('PUT', ADMIN.credential, (c) => {
      state.service.received.push(JSON.parse(c.body!).token)
      return refusal(422, 'failed_precondition', 'credential_rejected', { status: 401 })
    })
    const e = await handOverServiceCredential({ confirmReplaceAll: vi.fn() }).catch((x) => x)
    expect(isRuntimeError(e) && e.reason).toBe('credential_rejected')
    // The one issued is revoked; the one the runtime held is untouched.
    expect(live()).toEqual(['cred-held'])
    expect(state.service.credentials).toHaveLength(2)
    const token = state.service.issued[0]
    const all = [String(e), e.message, e.stack, JSON.stringify(e), elsewhere()].join('\n')
    expect(all).not.toContain(token)
  })

  it('revokes the new one when the runtime cannot reach Core to try it', async () => {
    s.on('PUT', ADMIN.credential, () => refusal(503, 'unavailable', 'core_unavailable'))
    const e = await handOverServiceCredential({ confirmReplaceAll: vi.fn() }).catch((x) => x)
    expect(isRuntimeError(e) && e.reason).toBe('core_unavailable')
    expect(live()).toEqual(['cred-held'])
  })

  it('with five live, asks first, and replaces them all in the issue', async () => {
    state.service.credentials.push(other('c2'), other('c3'), other('c4'), other('c5'))
    const confirmReplaceAll = vi.fn(async () => true)
    const out = await handOverServiceCredential({ confirmReplaceAll })
    expect(confirmReplaceAll).toHaveBeenCalledWith(5)
    expect(issued()[0]).toMatchObject({ replace: true })
    expect(live()).toEqual([out!.credentialId])
    expect(out).toMatchObject({ revoked: 5, unrevoked: 0 })
    // Core revoked them in the issue: none is revoked again.
    expect(s.to('POST', ADMIN.serviceRevoke)).toHaveLength(0)
  })

  it('with five live, issues nothing when not told to replace them', async () => {
    state.service.credentials.push(other('c2'), other('c3'), other('c4'), other('c5'))
    const out = await handOverServiceCredential({ confirmReplaceAll: async () => false })
    expect(out).toBeNull()
    expect(issued()).toEqual([])
    expect(live()).toHaveLength(5)
  })

  it('asks the runtime after no answer, and keeps the one it has after all', async () => {
    s.on('PUT', ADMIN.credential, (c) => {
      const b = JSON.parse(c.body!)
      state.service.received.push(b.token)
      state.settings.transcription = transcriptionSettings({
        credential: { ...state.settings.transcription!.credential, credential_id: b.credential_id },
      })
      return json(502, { error: 'bad gateway' })
    })
    const out = await handOverServiceCredential({ confirmReplaceAll: vi.fn() })
    expect(out!.settings.credential.credential_id).toBe(out!.credentialId)
    expect(live()).toEqual([out!.credentialId])
  })

  it('asks the runtime after no answer, and revokes the new one when it does not have it', async () => {
    s.on('PUT', ADMIN.credential, () => json(502, { error: 'bad gateway' }))
    const e = await handOverServiceCredential({ confirmReplaceAll: vi.fn() }).catch((x) => x)
    expect(e.status).toBe(502)
    expect(live()).toEqual(['cred-held'])
  })

  it('issues one more when Core answers the issue as a replay, without the token, and revokes the replayed one', async () => {
    state.service.credentials.push(serviceCredential({ id: 'cred-replayed', token_prefix: 'replayed0000' }))
    s.once('POST', ADMIN.serviceCredentials, () =>
      executed({ service_actor_id: 'svc-actor', credential_id: 'cred-replayed', token_prefix: 'replayed0000' }),
    )
    const out = await handOverServiceCredential({ confirmReplaceAll: vi.fn() })
    expect(s.to('POST', ADMIN.serviceCredentials)).toHaveLength(2)
    expect(state.service.received).toEqual(state.service.issued)
    expect(live()).toEqual([out!.credentialId])
  })

  it('issues nothing where the runtime cannot be called', async () => {
    s.on('POST', /^\/v1\/auth\/assertion$/, () => json(403, { error: { code: 'forbidden', message: 'not for you' } }))
    const e = await handOverServiceCredential({ confirmReplaceAll: vi.fn() }).catch((x) => x)
    expect(isRuntimeError(e) && e.reason).toBe('account_refused')
    expect(issued()).toEqual([])
  })
})

describe('withdrawServiceCredential', () => {
  it('takes it from the runtime, then revokes it in Core by its id', async () => {
    const out = await withdrawServiceCredential(state.settings.transcription!.credential)
    expect(s.to('DELETE', ADMIN.credential)).toHaveLength(1)
    expect(out.coreRevoked).toBe(true)
    expect(live()).toEqual([])
    expect(out.settings.credential.status).toBe('none')
  })

  it('finds it in Core by its prefix when the runtime was not given its id', async () => {
    const held = { ...state.settings.transcription!.credential, credential_id: null }
    const out = await withdrawServiceCredential(held)
    expect(out.coreRevoked).toBe(true)
    expect(live()).toEqual([])
  })

  it('says when Core has no live one of it', async () => {
    state.service.credentials = []
    const held = { ...state.settings.transcription!.credential, credential_id: null }
    expect((await withdrawServiceCredential(held)).coreRevoked).toBeNull()
  })
})

describe('the settings’ form', () => {
  const settings: TranscriptionSettings = transcriptionSettings()
  const form = (over: Partial<TranscriptionForm> = {}): TranscriptionForm => ({
    offer: 'fast',
    maxPages: 300,
    perDayPages: null,
    concurrency: 2,
    ...over,
  })

  it('sends only what changed, and null for no daily limit', () => {
    expect(patchFrom(settings, form())).toEqual({})
    expect(patchFrom(settings, form({ offer: null, perDayPages: 2000 }))).toEqual({ offer: null, per_day_pages: 2000 })
    expect(patchFrom({ ...settings, per_day_pages: 500 }, form())).toEqual({ per_day_pages: null })
  })

  it('takes whole numbers within the contract’s bounds', () => {
    expect(formProblems(form())).toEqual({})
    expect(formProblems(form({ maxPages: 0, perDayPages: 1.5, concurrency: 9 }))).toEqual({
      maxPages: 'runtimeAdmin.transcription.invalid.maxPages',
      perDayPages: 'runtimeAdmin.transcription.invalid.perDayPages',
      concurrency: 'runtimeAdmin.transcription.invalid.concurrency',
    })
    expect(formProblems(form({ maxPages: null }))).toHaveProperty('maxPages')
  })

  it('reads the prefix of the hint the runtime shows', () => {
    expect(prefixOfHint('aissvc_ab12cd34ef56…')).toBe('ab12cd34ef56')
    expect(prefixOfHint(null)).toBe('')
  })
})
