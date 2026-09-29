// For the hosting components' unit tests only (imported by *.spec.ts): Core
// and the agent runtime behind a stubbed fetch, as the runtime client's own
// tests stub it, so that a test sees every request the page makes, headers
// and bodies included, and can look for a token or a key in each.
//
// No token or key is written in any file: the fakes make them at random as
// a test runs, in the shapes Core and the providers use.
import { vi } from 'vitest'
import type { HostedAgent, OtherToken, OtherTokens, ProviderOffer, SchoolOffer, Seat } from '@/api/runtime-types'
import type { AgentCredential } from '@/api/types'

export const ACTOR = '0192f3c1-7d2e-7c3a-9b1f-2a4c6e8f0a1b'
export const AGENT_ID = 'agt_7d1c3f7e-2b8a-4c55-9d5e-0a3c9b1e2f40'

const B32 = 'abcdefghijklmnopqrstuvwxyz234567'
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function random(alphabet: string, n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** A fresh token in Core's shape, ais_<12>_<43>, with its public prefix. */
export function newToken(): { token: string; prefix: string } {
  const prefix = random(B32, 12)
  return { token: `ais_${prefix}_${random(B64, 43)}`, prefix }
}

/** A fresh provider key, sk-… */
export function newKey(): string {
  return `sk-${random(B64, 40)}`
}

export interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

type Answer = (call: Call, m: RegExpMatchArray) => Response | Promise<Response>

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

/** The runtime's error envelope. */
export function refusal(status: number, code: string, reason: string, details: Record<string, unknown> = {}): Response {
  return json(status, { error: { code, message: `refused: ${reason}`, details: { reason, ...details } } })
}

/** Core's answer to a write that went through. */
export function executed(result: unknown, headers: Record<string, string> = {}): Response {
  return json(200, { status: 'executed', action_id: `act_${random(B32, 8)}`, review_state: 'none', result }, headers)
}

export const INFO = {
  api: 'aishie-runtime',
  api_version: 1,
  version: '0.5.0',
  commit: 'abc1234',
  audience: 'https://lms.example.edu/runtime',
  issuer: 'https://lms.example.edu',
  features: { connect_by_token: true, own_key: true, school_key: false },
}

export function seat(over: Partial<Seat> = {}): Seat {
  return {
    course_id: 'c-1',
    course_code: 'CS101',
    course_title: 'Programming',
    section: 'A',
    seat_status: 'active',
    course_status: 'active',
    kind: 'delegate',
    answers: true,
    answer_level: 'autonomous',
    reads_work: true,
    reads_material: true,
    proposals_waiting: 0,
    seen_at: '2026-09-28T08:00:00Z',
    ...over,
  }
}

export function hostedAgent(over: Partial<HostedAgent> = {}): HostedAgent {
  return {
    id: AGENT_ID,
    version: 3,
    core_actor_id: ACTOR,
    owner_actor_id: '0192f3c1-0000-7c3a-9b1f-2a4c6e8f0a1b',
    display_name: 'Study helper',
    status: 'running',
    problem: null,
    paused: false,
    token: { hint: 'ais_runtimetoken…', prefix: 'runtimetoken' },
    model: {
      own: {
        provider: 'openai',
        adapter: 'openai_chat',
        model: 'gpt-4.1-mini',
        endpoint: null,
        resource: null,
        region: null,
        max_output_tokens: null,
        reasoning_effort: null,
        price_known: true,
      },
      school: null,
    },
    own_key: { hint: 'sk-…3f9a', provider: 'openai' },
    seats: [seat()],
    seats_as_of: '2026-09-28T08:00:00Z',
    proposals_waiting: 0,
    today: { since: '2026-09-28T00:00:00Z', answers: 4, cost_usd: '0.004213' },
    created_at: '2026-09-27T08:00:00Z',
    updated_at: '2026-09-28T08:00:00Z',
    ...over,
  }
}

export const OFFERS: ProviderOffer[] = [
  {
    provider: 'openai',
    label: 'OpenAI',
    adapters: ['openai_chat', 'openai_responses'],
    endpoint: { kind: 'fixed', base_url: 'https://api.openai.com/v1' },
    key_prefix: 'sk-',
    suggested_models: [
      { model: 'gpt-4.1-mini', priced: true },
      { model: 'gpt-5', priced: false },
    ],
  },
  {
    provider: 'azure',
    label: 'Azure OpenAI',
    adapters: ['openai_responses', 'openai_chat'],
    endpoint: { kind: 'azure_resource', pattern: '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$', example: 'my-resource' },
    key_prefix: null,
    suggested_models: [],
  },
  {
    provider: 'bedrock',
    label: 'Amazon Bedrock',
    adapters: ['bedrock_converse'],
    endpoint: { kind: 'bedrock_region', pattern: '^[a-z]{2}(?:-gov)?-[a-z]+-[0-9]{1,2}$', suggested: ['us-east-1', 'eu-west-1'] },
    key_prefix: 'ABSK',
    suggested_models: [],
  },
  {
    provider: 'moonshot',
    label: 'Moonshot (Kimi)',
    adapters: ['openai_chat'],
    endpoint: {
      kind: 'choice',
      choices: [
        { id: 'global', label: 'Global', base_url: 'https://api.moonshot.ai/v1' },
        { id: 'china', label: 'China', base_url: 'https://api.moonshot.cn/v1' },
      ],
    },
    key_prefix: 'sk-',
    suggested_models: [{ model: 'kimi-k2', priced: true }],
  },
  {
    // As the runtime offers it: the global endpoint alone, until the mainland one has passed a live test (§11, 7).
    provider: 'glm',
    label: 'Zhipu GLM',
    adapters: ['openai_chat'],
    endpoint: { kind: 'choice', choices: [{ id: 'global', label: 'Global', base_url: 'https://api.z.ai/api/paas/v4' }] },
    key_prefix: null,
    suggested_models: [],
  },
]

/** The school's plan (D8), as GET /models offers it: labels and models, never a key. */
export const SCHOOL_OFFERS: SchoolOffer[] = [
  { id: 'standard', label: 'School AI (Claude Haiku)', provider: 'anthropic', model: 'claude-haiku-4-5', priced: true },
  { id: 'deepseek', label: 'School AI', provider: 'deepseek', model: 'deepseek-chat', priced: false },
]

/** GET /models' answer with the school's plan offered beside the owner's own key. */
export function modelsWithSchool(): unknown {
  return {
    own_key: { offered: true, providers: OFFERS },
    school_key: { offered: true, offers: SCHOOL_OFFERS, limits: { per_owner_day: 100, per_asker_day: 20 } },
  }
}

/**
 * A hosted agent on the school's plan: the offer, the owner's use of the plan
 * today, and, with fallback, their own model and key behind it.
 */
export function onSchoolPlan(fallback: boolean, over: Partial<HostedAgent> = {}): HostedAgent {
  const base = hostedAgent()
  return hostedAgent({
    model: {
      own: fallback ? base.model.own : null,
      school: {
        offer: 'standard',
        label: 'School AI (Claude Haiku)',
        model: 'claude-haiku-4-5',
        provider: 'anthropic',
        offered: true,
        fallback,
      },
    },
    own_key: fallback ? base.own_key : null,
    today: {
      since: '2026-09-28T00:00:00Z',
      answers: 4,
      cost_usd: '0.000000',
      school: { scope: 'owner', used: 12, limit: 100, used_usd: '0.000000', limit_usd: null, per_asker_limit: 20 },
    },
    ...over,
  })
}

export function credential(over: Partial<AgentCredential> = {}): AgentCredential {
  return {
    id: `cred_${random(B32, 6)}`,
    kind: 'api_token',
    label: 'laptop',
    token_prefix: random(B32, 12),
    created_at: '2026-09-01T00:00:00Z',
    last_used_at: null,
    revoked_at: null,
    expires_at: null,
    ...over,
  }
}

/** One of the agent's other live tokens, as the runtime lists it (other_tokens, A.1). */
export function otherToken(over: Partial<OtherToken> = {}): OtherToken {
  return {
    prefix: random(B32, 12),
    label: 'laptop',
    created_at: '2026-09-01T00:00:00Z',
    last_used_at: null,
    expires_at: null,
    recent: false,
    ...over,
  }
}

/** The runtime's other_tokens for these tokens: in use when one is recent. */
export function otherTokens(tokens: OtherToken[]): OtherTokens {
  return { in_use: tokens.some((x) => x.recent), window_seconds: 900, tokens }
}

/**
 * Core and the runtime behind fetch. Routes are matched newest first; one
 * added with once answers a single request. Unrouted requests fail the test.
 */
export class Servers {
  calls: Call[] = []
  private routes: { method: string; re: RegExp; answer: Answer; once: boolean }[] = []
  /** Tokens Core issued, in order. */
  issued: { token: string; prefix: string; credentialId: string }[] = []
  /** Credentials revoked through Core, by id. */
  revoked: string[] = []

  constructor() {
    this.on('GET', /^\/runtime\/api\/v1\/info$/, () => json(200, INFO))
    this.on('POST', /^\/v1\/auth\/assertion$/, () =>
      json(200, {
        assertion: `eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ4In0.${random(B64, 20)}`,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    )
    this.on('POST', /^\/v1\/me\/agents\/([^/]+)\/tokens$/, () => {
      const t = newToken()
      const credentialId = `cred_${random(B32, 8)}`
      this.issued.push({ ...t, credentialId })
      return executed({ credential_id: credentialId, token: t.token, token_prefix: t.prefix })
    })
    this.on('POST', /^\/v1\/me\/agents\/([^/]+)\/credentials\/([^/]+)\/revoke$/, (_, m) => {
      this.revoked.push(decodeURIComponent(m[2]))
      return executed({ ok: true })
    })
    this.on('GET', /^\/v1\/me\/agents\/([^/]+)\/credentials$/, () => executed({ credentials: [] }))
    this.on('GET', /^\/runtime\/api\/v1\/models$/, () =>
      json(200, { own_key: { offered: true, providers: OFFERS }, school_key: { offered: false, offers: [] } }),
    )
  }

  on(method: string, re: RegExp, answer: Answer): this {
    this.routes.push({ method, re, answer, once: false })
    return this
  }

  once(method: string, re: RegExp, answer: Answer): this {
    this.routes.push({ method, re, answer, once: true })
    return this
  }

  install(): this {
    // jsdom has no matchMedia, which the UI store (for the theme) asks.
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
      for (let i = this.routes.length - 1; i >= 0; i--) {
        const r = this.routes[i]
        if (r.method !== call.method) continue
        const m = path.match(r.re)
        if (!m) continue
        if (r.once) this.routes.splice(i, 1)
        return r.answer(call, m)
      }
      throw new Error(`no route for ${call.method} ${url}`)
    })
    return this
  }

  /** The requests to a path (matched on the part before any query), by method. */
  to(method: string, re: RegExp): Call[] {
    return this.calls.filter((c) => c.method === method && re.test(c.url.split('?')[0]))
  }

  /** Every request, headers and bodies, as one string: to look for a secret in. */
  everything(): string {
    return JSON.stringify(this.calls)
  }
}

export const RUNTIME = {
  agents: /^\/runtime\/api\/v1\/agents$/,
  agent: /^\/runtime\/api\/v1\/agents\/[^/]+$/,
  inspect: /^\/runtime\/api\/v1\/agents\/inspect$/,
  token: /^\/runtime\/api\/v1\/agents\/[^/]+\/token$/,
  pause: /^\/runtime\/api\/v1\/agents\/[^/]+\/pause$/,
  resume: /^\/runtime\/api\/v1\/agents\/[^/]+\/resume$/,
  keyTest: /^\/runtime\/api\/v1\/keys\/test$/,
  models: /^\/runtime\/api\/v1\/models$/,
}

export const CORE = {
  issue: /^\/v1\/me\/agents\/[^/]+\/tokens$/,
  revoke: /^\/v1\/me\/agents\/[^/]+\/credentials\/[^/]+\/revoke$/,
  credentials: /^\/v1\/me\/agents\/[^/]+\/credentials$/,
}
