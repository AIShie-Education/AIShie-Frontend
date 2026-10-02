// For the sign-in page's unit tests only (imported by *.spec.ts): Core's sso
// tools behind a stubbed fetch, which sees every request, headers and bodies
// included. The providers are kept as Core keeps them (a version that moves on
// with every change, a hint of the secret and never the secret) and each call
// is answered as the contract has it: the pipeline's envelope, and a refusal's
// reason in error.details.
import { vi } from 'vitest'
import type { SsoProvider, SsoReport } from './ssoAdmin'

export interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}
type Answer = (call: Call, m: RegExpMatchArray) => Response | Promise<Response>

export const REDIRECT_URI = 'https://lms.example.edu/v1/auth/sso/callback'
export const KEY_ID = '8d080a37928f0bb1'
export const ROOT = { actor_id: '01a0f438-29fc-75ee-8a44-5e1244b5bd11', display_name: 'Root' }

export const SSO = {
  list: /^\/v1\/sso\/providers$/,
  one: /^\/v1\/sso\/providers\/([^/]+)$/,
  enabled: /^\/v1\/sso\/providers\/([^/]+)\/enabled$/,
  remove: /^\/v1\/sso\/providers\/([^/]+)\/delete$/,
  test: /^\/v1\/sso\/test$/,
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
let actions = 0
const actionId = () => `01a0f438-7000-7000-8000-${String(++actions).padStart(12, '0')}`
export const executed = (result: unknown) =>
  json(200, { status: 'executed', action_id: actionId(), review_state: 'none', result })
/** A write Core attempted and refused: recorded as failed. */
export function failed(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  return json(status, { status: 'failed', action_id: actionId(), review_state: 'none', error: { code, message, details } })
}
/** A call never attempted: a read's refusal, or bad arguments. */
export const refused = (status: number, code: string, message: string, details: Record<string, unknown> = {}) =>
  json(status, { error: { code, message, details } })
const readOk = (result: unknown) => json(200, { status: 'executed', result })

/** The operator's provider, as sso.list shows it: read-only, always first. */
export function operatorProvider(over: Partial<SsoProvider> = {}): SsoProvider {
  return {
    id: 'school-adfs',
    source: 'operator',
    read_only: true,
    display_name: 'School NetID',
    issuer: 'https://adfs.example.edu/adfs',
    client_id: 'aishie',
    client_secret_hint: '…',
    client_secret_key_id: null,
    scopes: ['openid', 'profile', 'email'],
    subject_claim: 'upn',
    email_claim: null,
    allowed_email_domains: [],
    link_by_email: false,
    enabled: true,
    position: 0,
    status: 'offered',
    linked_accounts: 412,
    version: null,
    created_at: null,
    created_by: null,
    updated_at: null,
    updated_by: null,
    redirect_uri: REDIRECT_URI,
    ...over,
  }
}

/** A provider of the site's. */
export function siteProvider(over: Partial<SsoProvider> = {}): SsoProvider {
  return {
    id: 'university-sso',
    source: 'site',
    read_only: false,
    display_name: '大學統一認證',
    issuer: 'https://sso.example.edu/oidc',
    client_id: 'aishie',
    client_secret_hint: '…k3Qz',
    client_secret_key_id: KEY_ID,
    scopes: ['openid', 'profile', 'email'],
    subject_claim: 'sub',
    email_claim: null,
    allowed_email_domains: [],
    link_by_email: false,
    enabled: true,
    position: 1,
    status: 'offered',
    linked_accounts: 3,
    version: 4,
    created_at: '2026-09-29T08:00:00Z',
    created_by: ROOT,
    updated_at: '2026-09-30T08:00:00Z',
    updated_by: ROOT,
    redirect_uri: REDIRECT_URI,
    ...over,
  }
}

/** What sso.test finds at a good issuer. */
export function goodReport(issuer = 'https://login.example.edu/realms/school'): SsoReport {
  return {
    ok: true,
    issuer,
    discovery_url: `${issuer}/.well-known/openid-configuration`,
    problems: [],
    warnings: [],
    authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
    token_endpoint: `${issuer}/protocol/openid-connect/token`,
    userinfo_endpoint: `${issuer}/protocol/openid-connect/userinfo`,
    end_session_endpoint: null,
    jwks_uri: `${issuer}/protocol/openid-connect/certs`,
    signing_keys: [{ kid: 'k-2026', kty: 'RSA', alg: 'RS256', use: 'sig' }],
    signing_algorithms: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    claims_supported: ['sub', 'email', 'email_verified'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods: ['client_secret_basic'],
    subject_types_supported: ['public'],
    code_challenge_methods: ['S256'],
    requested_scopes_unsupported: [],
    requested_claims_not_advertised: [],
  }
}

const hint = (secret: string) => (secret.length >= 20 ? `…${secret.slice(-4)}` : '…')

/**
 * Core's sso tools, as far as the page uses them. `providers` is what Core
 * keeps; `once` answers the next call to a route otherwise.
 */
export class FakeSsoCore {
  calls: Call[] = []
  providers: SsoProvider[] = []
  canAdd = true
  report: SsoReport = goodReport()
  private overrides: { method: string; re: RegExp; answer: Answer }[] = []

  constructor(providers: SsoProvider[] = [operatorProvider(), siteProvider()]) {
    this.providers = providers.map((p) => ({ ...p }))
  }

  once(method: string, re: RegExp, answer: Answer): this {
    this.overrides.push({ method, re, answer })
    return this
  }

  install(): this {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }))
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        method: init.method ?? 'GET',
        url,
        headers: { ...(init.headers as Record<string, string>) },
        body: init.body as string | undefined,
      }
      this.calls.push(call)
      const path = url.split('?')[0]
      const i = this.overrides.findIndex((o) => o.method === call.method && o.re.test(path))
      if (i >= 0) {
        const [o] = this.overrides.splice(i, 1)
        return o.answer(call, path.match(o.re)!)
      }
      return this.answer(call, path)
    })
    return this
  }

  /** The requests to a path (matched on the part before any query), by method. */
  to(method: string, re: RegExp): Call[] {
    return this.calls.filter((c) => c.method === method && re.test(c.url.split('?')[0]))
  }

  /** The body of the last request to a path. */
  lastBody(method: string, re: RegExp): Record<string, unknown> {
    const c = this.to(method, re).at(-1)
    return c?.body ? JSON.parse(c.body) : {}
  }

  /** Every request, headers and bodies, as one string: to look for a secret in. */
  everything(): string {
    return JSON.stringify(this.calls)
  }

  find(id: string) {
    return this.providers.find((p) => p.id === id)
  }

  private answer(call: Call, path: string): Response {
    const body = call.body ? JSON.parse(call.body) : {}
    let m: RegExpMatchArray | null
    if (call.method === 'GET' && SSO.list.test(path)) {
      return readOk({
        providers: this.providers,
        can_add: this.canAdd,
        cannot_add_reason: this.canAdd ? null : 'secrets_key_missing',
        secrets_key_id: this.canAdd ? KEY_ID : null,
        redirect_uri: REDIRECT_URI,
      })
    }
    if (call.method === 'GET' && SSO.test.test(path)) return readOk(this.report)
    if (call.method === 'GET' && (m = path.match(SSO.one))) {
      const p = this.find(decodeURIComponent(m[1]))
      return p
        ? readOk(p)
        : refused(404, 'not_found', 'there is no identity provider with that id', { reason: 'sso_provider_not_found' })
    }
    if (call.method !== 'POST') throw new Error(`no route for ${call.method} ${call.url}`)
    if (!call.headers['Idempotency-Key']) throw new Error(`${call.url}: a write without an idempotency key`)

    if (SSO.list.test(path)) {
      if (!this.canAdd) return failed(422, 'failed_precondition', 'no secrets key', { reason: 'secrets_key_missing' })
      if (this.find(body.id)) {
        return failed(409, 'conflict', 'a provider with that id is there already', { reason: 'id_taken' })
      }
      const p = siteProvider({
        id: body.id,
        display_name: body.display_name,
        issuer: body.issuer,
        client_id: body.client_id,
        client_secret_hint: hint(body.client_secret),
        scopes: body.scopes ?? ['openid', 'profile', 'email'],
        subject_claim: body.subject_claim ?? 'sub',
        email_claim: body.email_claim ?? null,
        allowed_email_domains: body.allowed_email_domains ?? [],
        link_by_email: !!body.link_by_email,
        enabled: !!body.enabled,
        status: body.enabled ? 'offered' : 'disabled',
        position: body.position ?? Math.max(0, ...this.providers.map((x) => x.position)) + 1,
        linked_accounts: 0,
        version: 1,
      })
      this.providers.push(p)
      return executed(p)
    }
    const at = (re: RegExp) => path.match(re)
    const target = (mm: RegExpMatchArray) => this.find(decodeURIComponent(mm[1]))
    const stale = (p: SsoProvider) =>
      body.version !== undefined && body.version !== null && body.version !== p.version
        ? failed(409, 'conflict', `the provider has changed since you read it (version ${p.version} now)`, {
            reason: 'version_mismatch',
            current_version: p.version,
          })
        : null
    const gone = () =>
      failed(404, 'not_found', 'there is no identity provider with that id', { reason: 'sso_provider_not_found' })
    const operator = () =>
      failed(422, 'failed_precondition', 'set by the operator', { reason: 'set_by_operator' })

    if ((m = at(SSO.enabled))) {
      const p = target(m)
      if (!p) return gone()
      if (p.source === 'operator') return operator()
      const s = stale(p)
      if (s) return s
      if (body.enabled && p.status === 'secret_unavailable') {
        return failed(422, 'failed_precondition', 'its secret does not open', { reason: 'secret_unavailable' })
      }
      if (p.enabled !== body.enabled) {
        p.enabled = body.enabled
        p.status = body.enabled ? 'offered' : 'disabled'
        p.version = (p.version ?? 0) + 1
      }
      return executed(p)
    }
    if ((m = at(SSO.remove))) {
      const p = target(m)
      if (!p) return gone()
      if (p.source === 'operator') return operator()
      const s = stale(p)
      if (s) return s
      if (p.linked_accounts > 0 && !body.force) {
        return failed(409, 'conflict', `${p.linked_accounts} accounts are linked at it`, {
          reason: 'provider_in_use',
          linked_accounts: p.linked_accounts,
        })
      }
      this.providers = this.providers.filter((x) => x !== p)
      return executed({ id: p.id, deleted: true, unlinked_accounts: body.force ? p.linked_accounts : 0 })
    }
    if ((m = at(SSO.one))) {
      const p = target(m)
      if (!p) return gone()
      if (p.source === 'operator') return operator()
      if (body.version === undefined) throw new Error('sso.update without a version')
      const s = stale(p)
      if (s) return s
      const fields = [
        'display_name',
        'issuer',
        'client_id',
        'scopes',
        'subject_claim',
        'email_claim',
        'allowed_email_domains',
        'link_by_email',
        'position',
      ] as const
      for (const f of fields) {
        if (body[f] !== undefined) (p as unknown as Record<string, unknown>)[f] = f === 'email_claim' ? body[f] || null : body[f]
      }
      if (body.client_secret) {
        p.client_secret_hint = hint(body.client_secret)
        p.client_secret_key_id = KEY_ID
        if (p.status === 'secret_unavailable') p.status = p.enabled ? 'offered' : 'disabled'
      }
      p.version = (p.version ?? 0) + 1
      return executed(p)
    }
    throw new Error(`no route for ${call.method} ${call.url}`)
  }
}
